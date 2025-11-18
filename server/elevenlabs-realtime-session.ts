import WebSocket from "ws";
import { storage } from "./storage";
import { streamSpeech } from "./elevenlabs-client";
import { transcribeAudio } from "./openai-client";
import OpenAI from "openai";
import alawmulaw from "alawmulaw";
import wavefile from "wavefile";
import ffmpeg from "fluent-ffmpeg";
import { Readable } from "stream";

const { WaveFile } = wavefile;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ElevenLabsSessionConfig {
  callId: string;
  agentId?: string;
  twilioWebSocket: WebSocket;
}

interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class ElevenLabsRealtimeSession {
  private callId: string;
  private agentId?: string;
  private twilioWs: WebSocket;
  private streamSid: string | null = null;
  private conversationHistory: ConversationMessage[] = [];
  private audioBuffer: Buffer[] = [];
  private isProcessing: boolean = false;
  private silenceTimeout: NodeJS.Timeout | null = null;
  private agentVoice: string = "EXAVITQu4vr4xnSDxMaL"; // Sarah voice ID
  private agentPrompt: string = "";
  private SILENCE_THRESHOLD_MS = 800; // 800ms silence triggers processing

  constructor(config: ElevenLabsSessionConfig) {
    this.callId = config.callId;
    this.agentId = config.agentId;
    this.twilioWs = config.twilioWebSocket;
  }

  async start() {
    console.log(`[ElevenLabs Session ${this.callId}] Starting ElevenLabs-powered session`);

    // Get agent configuration
    const agent = this.agentId 
      ? await storage.getAgent(this.agentId)
      : await storage.getActiveAgent();

    if (!agent) {
      throw new Error("No active agent found");
    }

    // Check if agent is configured for ElevenLabs
    if (agent.voiceProvider !== "elevenlabs") {
      console.warn(`[Session ${this.callId}] Agent is not configured for ElevenLabs, voice provider: ${agent.voiceProvider}`);
    }

    this.agentVoice = agent.voice || "EXAVITQu4vr4xnSDxMaL";
    this.agentPrompt = agent.prompt || "You are a helpful AI assistant.";

    // Initialize conversation with system prompt
    this.conversationHistory.push({
      role: "system",
      content: this.agentPrompt,
    });

    console.log(`[ElevenLabs Session ${this.callId}] Configured with voice: ${this.agentVoice}`);
    console.log(`[ElevenLabs Session ${this.callId}] Waiting for Twilio stream to be ready before sending greeting...`);
    
    // Don't send greeting yet - wait for streamSid to be set via handleTwilioMessage
  }

  private async sendGreeting() {
    const greeting = "Hello! How can I help you today?";
    this.conversationHistory.push({
      role: "assistant",
      content: greeting,
    });
    
    await this.synthesizeAndSendAudio(greeting);
  }

  async handleTwilioMessage(message: any) {
    switch (message.event) {
      case "start":
        this.streamSid = message.start.streamSid;
        console.log(`[ElevenLabs Session ${this.callId}] Twilio stream started, streamSid: ${this.streamSid}`);
        
        // Now that stream is ready, send the initial greeting
        console.log(`[ElevenLabs Session ${this.callId}] Stream ready, sending greeting now...`);
        await this.sendGreeting();
        break;

      case "media":
        // Buffer incoming audio (μ-law format from Twilio)
        const audioPayload = message.media.payload;
        const ulawBuffer = Buffer.from(audioPayload, "base64");
        this.audioBuffer.push(ulawBuffer);

        // Log every 50 chunks to reduce noise
        if (this.audioBuffer.length % 50 === 0) {
          console.log(`[ElevenLabs Session ${this.callId}] 🎤 Buffering audio... ${this.audioBuffer.length} chunks (${(this.audioBuffer.length * 160 / 8000).toFixed(1)}s)`);
        }

        // Reset silence detection timer
        if (this.silenceTimeout) {
          clearTimeout(this.silenceTimeout);
        }

        // Set new silence detection timer
        this.silenceTimeout = setTimeout(() => {
          console.log(`[ElevenLabs Session ${this.callId}] 🔇 Silence detected after ${this.audioBuffer.length} chunks, processing speech...`);
          this.processSpeech();
        }, this.SILENCE_THRESHOLD_MS);
        break;

      case "stop":
        console.log(`[ElevenLabs Session ${this.callId}] Twilio stream stopped`);
        // Process any remaining audio before cleanup
        if (this.audioBuffer.length > 0) {
          console.log(`[ElevenLabs Session ${this.callId}] Processing remaining ${this.audioBuffer.length} chunks before closing...`);
          await this.processSpeech();
        }
        this.cleanup();
        break;
    }
  }

  private async processSpeech() {
    if (this.isProcessing || this.audioBuffer.length === 0) {
      return;
    }

    this.isProcessing = true;
    const audioData = Buffer.concat(this.audioBuffer);
    this.audioBuffer = [];

    try {
      console.log(`[ElevenLabs Session ${this.callId}] Processing ${audioData.length} bytes of audio`);

      // Step 1: Transcribe audio using Whisper
      const transcript = await this.transcribeAudio(audioData);
      
      if (!transcript || transcript.trim().length === 0) {
        console.log(`[ElevenLabs Session ${this.callId}] No speech detected`);
        this.isProcessing = false;
        return;
      }

      console.log(`[ElevenLabs Session ${this.callId}] User: ${transcript}`);
      
      // Add to conversation history
      this.conversationHistory.push({
        role: "user",
        content: transcript,
      });

      // Save transcript to database
      await storage.createTranscript({
        callId: this.callId,
        speaker: "user",
        text: transcript,
      });

      // Step 2: Generate AI response using GPT-4
      const aiResponse = await this.generateResponse();
      
      console.log(`[ElevenLabs Session ${this.callId}] Assistant: ${aiResponse}`);

      // Add to conversation history
      this.conversationHistory.push({
        role: "assistant",
        content: aiResponse,
      });

      // Save AI response transcript
      await storage.createTranscript({
        callId: this.callId,
        speaker: "assistant",
        text: aiResponse,
      });

      // Step 3: Synthesize and send audio
      await this.synthesizeAndSendAudio(aiResponse);

    } catch (error) {
      console.error(`[ElevenLabs Session ${this.callId}] Error processing speech:`, error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      // Convert μ-law audio to WAV for Whisper
      // Twilio sends 8kHz μ-law, we need to convert it
      const wavBuffer = this.convertULawToWav(audioBuffer);
      
      // Transcribe using OpenAI Whisper
      const result = await transcribeAudio(wavBuffer, "audio/wav");
      return result.text;
    } catch (error) {
      console.error(`[ElevenLabs Session ${this.callId}] Transcription error:`, error);
      return "";
    }
  }

  private convertULawToWav(ulawBuffer: Buffer): Buffer {
    // Decode μ-law to PCM16
    const ulawArray = new Uint8Array(ulawBuffer);
    const pcm16Samples = alawmulaw.mulaw.decode(ulawArray);
    
    // Create WAV file from PCM16 samples
    const wav = new WaveFile();
    wav.fromScratch(1, 8000, '16', pcm16Samples);
    
    return Buffer.from(wav.toBuffer());
  }

  private async generateResponse(): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: this.conversationHistory as any,
        temperature: 0.8,
        max_tokens: 150,
      });

      return response.choices[0]?.message?.content || "I'm sorry, I didn't catch that.";
    } catch (error) {
      console.error(`[ElevenLabs Session ${this.callId}] GPT-4 error:`, error);
      return "I'm sorry, I'm having trouble processing that right now.";
    }
  }

  private async synthesizeAndSendAudio(text: string) {
    try {
      console.log(`[ElevenLabs Session ${this.callId}] Generating speech for: "${text.substring(0, 50)}..."`);

      let chunkCount = 0;
      // Stream audio from ElevenLabs
      for await (const audioChunk of streamSpeech(text, this.agentVoice, "eleven_turbo_v2_5")) {
        chunkCount++;
        console.log(`[ElevenLabs Session ${this.callId}] Received MP3 chunk ${chunkCount}, size: ${audioChunk.length} bytes`);
        
        // Convert MP3 to μ-law
        console.log(`[ElevenLabs Session ${this.callId}] Converting MP3 to μ-law...`);
        const ulawChunk = await this.convertMp3ToULaw(audioChunk);
        console.log(`[ElevenLabs Session ${this.callId}] Converted to μ-law, size: ${ulawChunk.length} bytes`);
        
        // Send to Twilio
        this.sendAudioToTwilio(ulawChunk);
        console.log(`[ElevenLabs Session ${this.callId}] Sent chunk ${chunkCount} to Twilio`);
      }

      console.log(`[ElevenLabs Session ${this.callId}] Audio complete - sent ${chunkCount} chunks to Twilio`);
    } catch (error) {
      console.error(`[ElevenLabs Session ${this.callId}] TTS error:`, error);
    }
  }

  private async convertMp3ToULaw(mp3Buffer: Buffer): Promise<Buffer> {
    console.log(`[ElevenLabs Session ${this.callId}] Starting MP3 to μ-law conversion, input size: ${mp3Buffer.length} bytes`);
    
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const inputStream = Readable.from(mp3Buffer);
      
      const command = ffmpeg(inputStream)
        .inputFormat('mp3')
        .audioCodec('pcm_s16le') // Convert to PCM16 first
        .audioChannels(1) // Mono
        .audioFrequency(8000) // 8kHz for Twilio
        .format('s16le') // Raw PCM16
        .on('start', (commandLine: string) => {
          console.log(`[ElevenLabs Session ${this.callId}] FFmpeg started: ${commandLine}`);
        })
        .on('error', (err: Error) => {
          console.error(`[ElevenLabs Session ${this.callId}] FFmpeg error - audio conversion failed:`, err);
          // Return silence instead of invalid MP3 data
          // Generate 100ms of silence in μ-law format (8kHz = 800 samples)
          const silenceSamples = 800;
          const silenceBuffer = Buffer.alloc(silenceSamples, 0xFF); // μ-law silence is 0xFF
          resolve(silenceBuffer);
        })
        .on('end', () => {
          try {
            console.log(`[ElevenLabs Session ${this.callId}] FFmpeg conversion complete, PCM chunks: ${chunks.length}, total bytes: ${chunks.reduce((sum, c) => sum + c.length, 0)}`);
            const pcmBuffer = Buffer.concat(chunks);
            // Convert PCM16 to μ-law
            const pcm16Array = new Int16Array(
              pcmBuffer.buffer, 
              pcmBuffer.byteOffset, 
              pcmBuffer.length / 2
            );
            console.log(`[ElevenLabs Session ${this.callId}] Converting PCM16 to μ-law, samples: ${pcm16Array.length}`);
            const ulawArray = alawmulaw.mulaw.encode(pcm16Array);
            console.log(`[ElevenLabs Session ${this.callId}] μ-law encoding complete, output size: ${ulawArray.length} bytes`);
            resolve(Buffer.from(ulawArray));
          } catch (error) {
            console.error(`[ElevenLabs Session ${this.callId}] μ-law encoding error - returning silence:`, error);
            // Return silence instead of invalid data
            const silenceSamples = 800;
            const silenceBuffer = Buffer.alloc(silenceSamples, 0xFF);
            resolve(silenceBuffer);
          }
        });
      
      // Pipe to collect data chunks
      const outputStream = command.pipe();
      outputStream.on('data', (chunk: Buffer) => {
        console.log(`[ElevenLabs Session ${this.callId}] FFmpeg output chunk received: ${chunk.length} bytes`);
        chunks.push(chunk);
      });
    });
  }

  private sendAudioToTwilio(audioBuffer: Buffer) {
    if (!this.streamSid || this.twilioWs.readyState !== WebSocket.OPEN) {
      console.warn(`[ElevenLabs Session ${this.callId}] Cannot send audio - streamSid: ${this.streamSid}, WebSocket ready: ${this.twilioWs.readyState === WebSocket.OPEN}`);
      return;
    }

    const audioPayload = audioBuffer.toString("base64");
    
    const mediaMessage = {
      event: "media",
      streamSid: this.streamSid,
      media: {
        payload: audioPayload,
      },
    };

    this.twilioWs.send(JSON.stringify(mediaMessage));
    console.log(`[ElevenLabs Session ${this.callId}] ✅ Successfully sent ${audioBuffer.length} bytes to Twilio`);
  }

  private cleanup() {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
    }
    
    console.log(`[ElevenLabs Session ${this.callId}] Session cleaned up`);
  }
}

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

// Prioritize real OPENAI_API_KEY over dummy AI_INTEGRATIONS key
const realOpenAIKey = process.env.OPENAI_API_KEY;
const integrationOpenAIKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

let openaiApiKey: string | undefined;
if (realOpenAIKey && !realOpenAIKey.includes('_DUMMY_')) {
  openaiApiKey = realOpenAIKey;
} else if (integrationOpenAIKey && !integrationOpenAIKey.includes('_DUMMY_')) {
  openaiApiKey = integrationOpenAIKey;
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
  baseURL: realOpenAIKey && !realOpenAIKey.includes('_DUMMY_') ? undefined : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
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
  
  // Voice Activity Detection (VAD) settings
  private SILENCE_THRESHOLD_MS = 800; // 800ms of silence to trigger processing (was 1500ms)
  private VAD_ENERGY_THRESHOLD = 50; // RMS energy threshold for voice detection
  private INTERRUPT_ENERGY_THRESHOLD = 80; // Higher threshold for interruption detection
  private isSpeaking = false;
  private lastSpeechTime = Date.now();
  private shouldInterrupt = false; // Flag to interrupt AI speech

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
        
        // Voice Activity Detection: Calculate audio energy
        const energy = this.calculateAudioEnergy(ulawBuffer);
        const now = Date.now();
        
        // INTERRUPTION DETECTION: Check if user is trying to interrupt while AI is speaking
        if (this.isProcessing && energy > this.INTERRUPT_ENERGY_THRESHOLD) {
          if (!this.shouldInterrupt) {
            this.shouldInterrupt = true;
            console.log(`[ElevenLabs Session ${this.callId}] 🛑 USER INTERRUPTION DETECTED! (energy: ${energy.toFixed(1)}) - Stopping AI...`);
            // Clear Twilio audio buffer to stop AI speech immediately
            this.clearTwilioAudioBuffer();
          }
          // Don't buffer audio while AI is being interrupted - prevents echo
          return;
        }
        
        // If AI is speaking but no strong interruption, discard audio (prevents echo)
        if (this.isProcessing) {
          return;
        }

        // Normal speech processing - buffer the audio
        this.audioBuffer.push(ulawBuffer);
        
        if (energy > this.VAD_ENERGY_THRESHOLD) {
          // Speech detected
          if (!this.isSpeaking) {
            this.isSpeaking = true;
            console.log(`[ElevenLabs Session ${this.callId}] 🗣️ User speech started (energy: ${energy.toFixed(1)})`);
          }
          this.lastSpeechTime = now;
          
          // Reset silence timer
          if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = null;
          }
        } else {
          // Low energy - potential silence
          if (this.isSpeaking && !this.silenceTimeout) {
            // User was speaking, now potentially silent - start silence timer
            this.silenceTimeout = setTimeout(() => {
              const silenceDuration = Date.now() - this.lastSpeechTime;
              console.log(`[ElevenLabs Session ${this.callId}] 🔇 Silence detected after ${silenceDuration}ms, processing speech...`);
              this.isSpeaking = false;
              this.processSpeech();
            }, this.SILENCE_THRESHOLD_MS);
          }
        }

        // Log every 100 chunks to reduce noise
        if (this.audioBuffer.length % 100 === 0) {
          console.log(`[ElevenLabs Session ${this.callId}] 🎤 Buffering... ${this.audioBuffer.length} chunks (${(this.audioBuffer.length * 160 / 8000).toFixed(1)}s) | Energy: ${energy.toFixed(1)} | User speaking: ${this.isSpeaking}`);
        }
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
      
      // Extract and update customer metadata
      await this.extractAndUpdateCustomerMetadata(transcript);

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
      this.shouldInterrupt = false; // Reset interrupt flag
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

  private async extractAndUpdateCustomerMetadata(transcript: string) {
    try {
      const call = await storage.getCall(this.callId);
      if (!call) return;
      
      const currentMetadata = (call.metadata || {}) as any;
      let updated = false;
      
      // Extract email pattern (common email formats)
      const emailMatch = transcript.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
      if (emailMatch && !currentMetadata.customerEmail) {
        currentMetadata.customerEmail = emailMatch[0].toLowerCase();
        updated = true;
        console.log(`[ElevenLabs Session ${this.callId}] Extracted email: ${currentMetadata.customerEmail}`);
      }
      
      // Extract name patterns (common German and English name introductions)
      const namePatterns = [
        /(?:mein name ist|ich heiße|ich bin|my name is|i am|i'm)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)?)/i,
        /(?:hier spricht|this is)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)?)/i,
      ];
      
      for (const pattern of namePatterns) {
        const nameMatch = transcript.match(pattern);
        if (nameMatch && nameMatch[1] && !currentMetadata.customerName) {
          currentMetadata.customerName = nameMatch[1].trim();
          updated = true;
          console.log(`[ElevenLabs Session ${this.callId}] Extracted name: ${currentMetadata.customerName}`);
          break;
        }
      }
      
      // Extract company patterns
      const companyPatterns = [
        /(?:von der firma|von|from company|from|at|bei)\s+([A-ZÄÖÜ][A-Za-zäöüß]+(?:\s+[A-ZÄÖÜ]?[A-Za-zäöüß]+)*(?:\s+(?:GmbH|AG|KG|UG|Inc|LLC|Ltd|Corporation|Corp))?)/i,
        /(?:arbeite bei|work at|work for|employed at)\s+([A-ZÄÖÜ][A-Za-zäöüß]+(?:\s+[A-ZÄÖÜ]?[A-Za-zäöüß]+)*)/i,
      ];
      
      for (const pattern of companyPatterns) {
        const companyMatch = transcript.match(pattern);
        if (companyMatch && companyMatch[1] && !currentMetadata.customerCompany) {
          currentMetadata.customerCompany = companyMatch[1].trim();
          updated = true;
          console.log(`[ElevenLabs Session ${this.callId}] Extracted company: ${currentMetadata.customerCompany}`);
          break;
        }
      }
      
      // Update call metadata if new information was extracted
      if (updated) {
        await storage.updateCall(this.callId, {
          metadata: currentMetadata
        });
        console.log(`[ElevenLabs Session ${this.callId}] Updated call metadata with customer information`);
        
        // Try to schedule appointment if we have enough data
        await this.tryScheduleAppointment();
      }
    } catch (error) {
      console.error(`[ElevenLabs Session ${this.callId}] Error extracting customer metadata:`, error);
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
        model: "gpt-4o-mini", // Using cheaper model to reduce costs (30x cheaper than GPT-4o)
        messages: this.conversationHistory as any,
        temperature: 0.7, // Slightly lower temperature for more consistent responses
        max_tokens: 150,
      });

      return response.choices[0]?.message?.content || "I'm sorry, I didn't catch that.";
    } catch (error) {
      console.error(`[ElevenLabs Session ${this.callId}] GPT-4o-mini error:`, error);
      return "I'm sorry, I'm having trouble processing that right now.";
    }
  }

  private async synthesizeAndSendAudio(text: string) {
    try {
      console.log(`[ElevenLabs Session ${this.callId}] Generating speech for: "${text.substring(0, 50)}..."`);
      
      // Reset interrupt flag before starting
      this.shouldInterrupt = false;

      let chunkCount = 0;
      // Stream audio from ElevenLabs
      for await (const audioChunk of streamSpeech(text, this.agentVoice, "eleven_turbo_v2_5")) {
        // Check if user interrupted - stop sending audio immediately
        if (this.shouldInterrupt) {
          console.log(`[ElevenLabs Session ${this.callId}] ⚠️ Interruption detected - stopping audio stream at chunk ${chunkCount}`);
          break; // Stop streaming audio
        }
        
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

      if (this.shouldInterrupt) {
        console.log(`[ElevenLabs Session ${this.callId}] Audio interrupted by user after ${chunkCount} chunks`);
      } else {
        console.log(`[ElevenLabs Session ${this.callId}] Audio complete - sent ${chunkCount} chunks to Twilio`);
      }
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

  /**
   * Calculate audio energy (RMS) from μ-law encoded buffer
   * Returns RMS energy value (higher = louder)
   */
  private calculateAudioEnergy(ulawBuffer: Buffer): number {
    // Decode μ-law to PCM16
    const pcmBuffer = alawmulaw.mulaw.decode(ulawBuffer);
    const pcmSamples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);

    // Calculate RMS (Root Mean Square) energy
    let sumSquares = 0;
    for (let i = 0; i < pcmSamples.length; i++) {
      sumSquares += pcmSamples[i] * pcmSamples[i];
    }
    const rms = Math.sqrt(sumSquares / pcmSamples.length);
    
    return rms;
  }

  private clearTwilioAudioBuffer() {
    if (!this.streamSid || this.twilioWs.readyState !== WebSocket.OPEN) {
      return;
    }

    // Send Twilio "clear" command to immediately stop all queued audio
    const clearMessage = {
      event: "clear",
      streamSid: this.streamSid,
    };
    
    this.twilioWs.send(JSON.stringify(clearMessage));
    console.log(`[ElevenLabs Session ${this.callId}] 🧹 Cleared Twilio audio buffer`);
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
  }

  // Automatically schedule appointment when sufficient data is collected
  private async tryScheduleAppointment() {
    try {
      // Check if we have collected enough customer data
      const call = await storage.getCall(this.callId);
      if (!call) return;
      
      const metadata = (call.metadata || {}) as any;
      const customerName = metadata.customerName;
      const customerEmail = metadata.customerEmail;
      const customerPhone = metadata.customerPhone || call.phoneNumber;
      const company = metadata.customerCompany;
      
      // Only proceed if we have at least name and email
      if (!customerName || !customerEmail) {
        return; // Not enough data yet
      }
      
      // Check if we already scheduled an appointment for this call
      if (metadata.appointmentScheduled) {
        return; // Already scheduled
      }
      
      // Get the agent for this call
      if (!this.agentId) {
        return; // No agent associated
      }
      
      const agent = await storage.getAgent(this.agentId);
      if (!agent) {
        return;
      }
      
      // Check if agent is the SOVOICE system agent
      if (agent.id === "sovoice-system-agent") {
        console.log(`[ElevenLabs Session ${this.callId}] Attempting to schedule appointment for ${customerName} (${customerEmail})`);
        
        try {
          // Default appointment time: tomorrow at 12:00
          const startTime = new Date();
          startTime.setDate(startTime.getDate() + 1);
          startTime.setHours(12, 0, 0, 0);
          
          // 30 minute appointment
          const endTime = new Date(startTime);
          endTime.setMinutes(endTime.getMinutes() + 30);
          
          // Check availability
          const isAvailable = await storage.checkAvailability(startTime, endTime);
          
          if (!isAvailable) {
            // Try to find next available slot (try next 5 business days)
            let foundSlot = false;
            for (let i = 1; i <= 5; i++) {
              startTime.setDate(startTime.getDate() + 1);
              // Skip weekends
              if (startTime.getDay() === 0) startTime.setDate(startTime.getDate() + 1);
              if (startTime.getDay() === 6) startTime.setDate(startTime.getDate() + 2);
              
              endTime.setTime(startTime.getTime());
              endTime.setMinutes(endTime.getMinutes() + 30);
              
              const available = await storage.checkAvailability(startTime, endTime);
              if (available) {
                foundSlot = true;
                break;
              }
            }
            
            if (!foundSlot) {
              console.log(`[ElevenLabs Session ${this.callId}] No available slots found in the next 5 days`);
              return;
            }
          }
          
          // Create appointment in our internal system
          const appointment = await storage.createAppointment({
            title: `Beratungsgespräch mit ${customerName}`,
            description: `Automatisch erstellt während Telefonat\nAnruf-ID: ${this.callId}`,
            customerName,
            customerEmail,
            customerPhone,
            customerCompany: company || undefined,
            callId: this.callId,
            agentId: this.agentId,
            startTime,
            endTime,
            status: "scheduled",
            type: "consultation",
            location: "Telefon",
            notes: company ? `Firma: ${company}` : undefined,
            reminder: 1,
            metadata: {
              createdByCall: true,
              phoneNumber: call.phoneNumber,
            }
          });
          
          console.log(`[ElevenLabs Session ${this.callId}] Appointment created successfully:`, appointment.id);
          
          // Send confirmation email
          try {
            const { MicrosoftAuthService } = await import("./services/microsoft-auth.js");
            const msAuthService = new MicrosoftAuthService();
            const isConfigured = await msAuthService.isConfigured();
            
            if (isConfigured) {
              const appointmentTime = startTime.toLocaleString('de-DE', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Europe/Berlin'
              });
              
              await msAuthService.sendEmail({
                to: customerEmail,
                subject: `Terminbestätigung - ${appointmentTime}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Terminbestätigung</h2>
                    
                    <p>Sehr geehrte/r ${customerName},</p>
                    
                    <p>Ihr Termin wurde erfolgreich bestätigt.</p>
                    
                    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
                      <h3 style="color: #333; margin-top: 0;">Termindetails:</h3>
                      <p><strong>Datum & Zeit:</strong> ${appointmentTime}</p>
                      <p><strong>Art:</strong> Beratungsgespräch</p>
                      <p><strong>Medium:</strong> Telefon</p>
                      ${customerPhone ? `<p><strong>Ihre Telefonnummer:</strong> ${customerPhone}</p>` : ''}
                      ${company ? `<p><strong>Firma:</strong> ${company}</p>` : ''}
                    </div>
                    
                    <p>Wir werden Sie zur vereinbarten Zeit unter der angegebenen Telefonnummer kontaktieren.</p>
                    
                    <p>Bei Fragen oder zur Terminänderung können Sie uns jederzeit kontaktieren.</p>
                    
                    <p>Mit freundlichen Grüßen<br>
                    Ihr SoVoice AI Team</p>
                  </div>
                `,
                text: `Terminbestätigung\n\nSehr geehrte/r ${customerName},\n\nIhr Termin wurde erfolgreich bestätigt.\n\nTermin: ${appointmentTime}\nArt: Beratungsgespräch\nMedium: Telefon\n${customerPhone ? `Ihre Telefonnummer: ${customerPhone}\n` : ''}${company ? `Firma: ${company}\n` : ''}\n\nWir werden Sie zur vereinbarten Zeit kontaktieren.\n\nMit freundlichen Grüßen\nIhr SoVoice AI Team`
              });
              
              console.log(`[ElevenLabs Session ${this.callId}] Confirmation email sent to ${customerEmail}`);
              
              // Update appointment metadata
              await storage.updateAppointment(appointment.id, {
                metadata: {
                  ...appointment.metadata,
                  emailSent: true
                }
              });
            }
          } catch (emailError) {
            console.error(`[ElevenLabs Session ${this.callId}] Failed to send confirmation email:`, emailError);
            // Don't fail the whole process if email fails
          }
          
          // Mark appointment as scheduled in call metadata
          await storage.updateCall(this.callId, {
            metadata: {
              ...metadata,
              appointmentScheduled: true,
              appointmentId: appointment.id,
              appointmentTime: startTime.toISOString(),
            },
          });
          
        } catch (error) {
          console.error(`[ElevenLabs Session ${this.callId}] Error creating appointment:`, error);
          // Don't expose technical errors to customer
        }
      }
    } catch (error) {
      console.error(`[ElevenLabs Session ${this.callId}] Error in tryScheduleAppointment:`, error);
    }
  }

  private cleanup() {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
    }
    
    console.log(`[ElevenLabs Session ${this.callId}] Session cleaned up`);
  }
}

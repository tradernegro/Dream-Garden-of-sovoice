import WebSocket from "ws";
import { storage } from "./storage";

export interface RealtimeSessionConfig {
  callId: string;
  agentId?: string;
  twilioWebSocket: WebSocket;
}

export class OpenAIRealtimeSession {
  private openaiWs: WebSocket | null = null;
  private callId: string;
  private agentId?: string;
  private twilioWs: WebSocket;
  private streamSid: string | null = null;
  private conversationTranscript: Array<{ speaker: string; text: string; timestamp: Date }> = [];
  private currentResponseId: string | null = null;
  private isAssistantSpeaking: boolean = false;
  private isCancelling: boolean = false;

  constructor(config: RealtimeSessionConfig) {
    this.callId = config.callId;
    this.agentId = config.agentId;
    this.twilioWs = config.twilioWebSocket;
  }

  async start() {
    // Prioritize real OPENAI_API_KEY over dummy AI_INTEGRATIONS key
    const realKey = process.env.OPENAI_API_KEY;
    const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    
    let apiKeyToUse: string | undefined;
    
    // Check if real key exists and is not dummy
    if (realKey && !realKey.includes('_DUMMY_')) {
      apiKeyToUse = realKey;
      console.log(`[Session ${this.callId}] Using real OPENAI_API_KEY`);
    } 
    // Otherwise check integration key
    else if (integrationKey && !integrationKey.includes('_DUMMY_')) {
      apiKeyToUse = integrationKey;
      console.log(`[Session ${this.callId}] Using AI_INTEGRATIONS_OPENAI_API_KEY`);
    }
    
    if (!apiKeyToUse) {
      throw new Error("OpenAI API key not configured or using dummy key");
    }

    // Get agent configuration
    const agent = this.agentId 
      ? await storage.getAgent(this.agentId)
      : await storage.getActiveAgent();

    if (!agent) {
      throw new Error("No active agent found");
    }

    // Connect to OpenAI Realtime API
    const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
    this.openaiWs = new WebSocket(url, {
      headers: {
        "Authorization": `Bearer ${apiKeyToUse}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    this.openaiWs.on("open", () => {
      console.log(`[Session ${this.callId}] Connected to OpenAI Realtime API`);
      
      // Configure session with agent settings
      this.sendToOpenAI({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: agent.prompt,
          voice: agent.voice || "alloy",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          input_audio_transcription: {
            model: "whisper-1"
          },
          temperature: agent.temperature ? agent.temperature / 10 : 0.8,
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500
          }
        }
      });
      
      // Trigger initial audio greeting after session is configured  
      setTimeout(() => {
        console.log(`[Session ${this.callId}] Triggering initial audio greeting`);
        
        // Simply request a response without creating a message first
        // This should trigger the AI to generate both text and audio
        this.sendToOpenAI({
          type: "response.create",
          response: {
            modalities: ["text", "audio"]
          }
        });
        
        console.log(`[Session ${this.callId}] Initial greeting request sent`);
      }, 500); // Small delay to ensure session is fully ready
    });

    this.openaiWs.on("message", (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString());
        this.handleOpenAIEvent(event);
      } catch (error) {
        console.error(`[Session ${this.callId}] Error parsing OpenAI message:`, error);
      }
    });

    this.openaiWs.on("error", (error) => {
      console.error(`[Session ${this.callId}] OpenAI WebSocket error:`, error);
    });

    this.openaiWs.on("close", () => {
      console.log(`[Session ${this.callId}] OpenAI connection closed`);
      this.cleanup();
    });
  }

  handleTwilioMessage(message: any) {
    switch (message.event) {
      case "start":
        this.streamSid = message.start.streamSid;
        console.log(`[Session ${this.callId}] Twilio stream started, streamSid: ${this.streamSid}`);
        break;

      case "media":
        if (!this.openaiWs || this.openaiWs.readyState !== WebSocket.OPEN) {
          return;
        }

        // Forward audio from Twilio to OpenAI
        // Twilio sends μ-law (G.711) audio at 8kHz, base64 encoded
        // OpenAI expects PCM16 at 24kHz, base64 encoded
        // For MVP, we'll send the μ-law audio directly to OpenAI
        // OpenAI's Realtime API can handle μ-law input
        this.sendToOpenAI({
          type: "input_audio_buffer.append",
          audio: message.media.payload
        });
        break;

      case "stop":
        console.log(`[Session ${this.callId}] Twilio stream stopped`);
        this.cleanup();
        break;
    }
  }

  private handleOpenAIEvent(event: any) {
    switch (event.type) {
      case "session.created":
      case "session.updated":
        console.log(`[Session ${this.callId}] ${event.type}`);
        break;

      case "input_audio_buffer.speech_started":
        console.log(`[Session ${this.callId}] 🎤 User started speaking - interrupting assistant`);
        
        // ALWAYS clear Twilio buffer first for instant audio cutoff
        if (this.streamSid) {
          console.log(`[Session ${this.callId}] 🧹 Clearing Twilio audio buffer IMMEDIATELY`);
          this.sendToTwilio({
            event: "clear",
            streamSid: this.streamSid
          });
        }
        
        // If assistant is currently speaking, interrupt it (but only if not already cancelling)
        if (this.isAssistantSpeaking && this.currentResponseId && !this.isCancelling) {
          console.log(`[Session ${this.callId}] 🛑 Canceling assistant response ${this.currentResponseId}`);
          
          // Mark as cancelling to prevent duplicate cancel requests
          this.isCancelling = true;
          
          // Cancel the ongoing response with response_id
          this.sendToOpenAI({
            type: "response.cancel",
            response_id: this.currentResponseId
          });
          
          // State will be reset in response.cancelled event handler
        } else if (this.isCancelling) {
          console.log(`[Session ${this.callId}] ⏭️ Ignoring duplicate speech_started (cancel already in progress)`);
        }
        break;

      case "input_audio_buffer.speech_stopped":
        console.log(`[Session ${this.callId}] User stopped speaking - committing buffer and creating response`);
        // Explicitly commit the buffer and create a response with audio
        this.sendToOpenAI({
          type: "input_audio_buffer.commit"
        });
        // Force audio response generation - must include text with audio!
        this.sendToOpenAI({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
            instructions: "Respond naturally to what the user just said."
          }
        });
        break;

      case "input_audio_buffer.committed":
        console.log(`[Session ${this.callId}] Audio buffer committed`);
        // Buffer is automatically committed by server VAD
        // This triggers response generation automatically
        break;

      case "conversation.item.created":
        console.log(`[Session ${this.callId}] Conversation item created:`, event.item?.type);
        break;

      case "response.created":
        console.log(`[Session ${this.callId}] Response created:`, event.response?.id);
        this.currentResponseId = event.response?.id || null;
        this.isAssistantSpeaking = true;
        break;

      case "response.audio.delta":
        // Send audio back to Twilio
        console.log(`[Session ${this.callId}] 🔊 Received audio delta, length:`, event.delta?.length || 0);
        if (event.delta && this.streamSid) {
          console.log(`[Session ${this.callId}] 📤 Sending audio to Twilio, streamSid: ${this.streamSid}`);
          this.sendToTwilio({
            event: "media",
            streamSid: this.streamSid,
            media: {
              payload: event.delta
            }
          });
        } else {
          console.log(`[Session ${this.callId}] ❌ Cannot send audio - delta: ${!!event.delta}, streamSid: ${this.streamSid}`);
        }
        break;

      case "response.audio_transcript.delta":
        // Accumulate assistant transcript
        if (event.delta) {
          const lastItem = this.conversationTranscript[this.conversationTranscript.length - 1];
          if (lastItem && lastItem.speaker === "assistant") {
            lastItem.text += event.delta;
          } else {
            this.conversationTranscript.push({
              speaker: "assistant",
              text: event.delta,
              timestamp: new Date()
            });
          }
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        // User speech transcribed
        if (event.transcript) {
          this.conversationTranscript.push({
            speaker: "user",
            text: event.transcript,
            timestamp: new Date()
          });
          
          // Persist transcript in real-time
          storage.createTranscript({
            callId: this.callId,
            speaker: "user",
            text: event.transcript,
            timestamp: new Date()
          });
        }
        break;

      case "response.audio_transcript.done":
        console.log(`[Session ${this.callId}] Audio transcript completed:`, event.transcript);
        break;

      case "response.done":
        console.log(`[Session ${this.callId}] Response completed`);
        this.isAssistantSpeaking = false;
        this.currentResponseId = null;
        this.isCancelling = false; // Reset cancel flag
        
        // Assistant finished responding
        const lastItem = this.conversationTranscript[this.conversationTranscript.length - 1];
        if (lastItem && lastItem.speaker === "assistant" && lastItem.text) {
          // Persist assistant transcript
          storage.createTranscript({
            callId: this.callId,
            speaker: "assistant",
            text: lastItem.text,
            timestamp: lastItem.timestamp
          });
        }
        break;
      
      case "response.cancelled":
        console.log(`[Session ${this.callId}] ⚠️ Response cancelled (user interrupted)`);
        this.isAssistantSpeaking = false;
        this.currentResponseId = null;
        this.isCancelling = false; // Reset cancel flag to allow new interruptions
        break;

      case "error":
        console.error(`[Session ${this.callId}] OpenAI error:`, event.error);
        break;

      default:
        // Log unhandled events for debugging
        if (event.type && !event.type.includes('.delta')) {
          console.log(`[Session ${this.callId}] Unhandled event: ${event.type}`);
        }
        break;
    }
  }

  private sendToOpenAI(message: any) {
    if (this.openaiWs && this.openaiWs.readyState === WebSocket.OPEN) {
      this.openaiWs.send(JSON.stringify(message));
    }
  }

  private sendToTwilio(message: any) {
    if (this.twilioWs && this.twilioWs.readyState === WebSocket.OPEN) {
      this.twilioWs.send(JSON.stringify(message));
    }
  }

  async cleanup() {
    console.log(`[Session ${this.callId}] Cleaning up session`);
    
    // Save final transcript
    const fullTranscript = this.conversationTranscript
      .map(t => `${t.speaker}: ${t.text}`)
      .join('\n');
    
    if (fullTranscript) {
      await storage.updateCall(this.callId, {
        transcript: fullTranscript
      });
    }

    // Close connections
    if (this.openaiWs) {
      this.openaiWs.close();
      this.openaiWs = null;
    }
  }
}

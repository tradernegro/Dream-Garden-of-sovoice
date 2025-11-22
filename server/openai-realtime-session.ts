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
  private agent: any = null; // Store agent configuration for use in greeting

  constructor(config: RealtimeSessionConfig) {
    this.callId = config.callId;
    this.agentId = config.agentId;
    this.twilioWs = config.twilioWebSocket;
  }

  async start() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Get agent configuration
    const agent = this.agentId 
      ? await storage.getAgent(this.agentId)
      : await storage.getActiveAgent();

    if (!agent) {
      throw new Error("No active agent found");
    }

    // Store agent configuration for use in greeting
    this.agent = agent;

    // Connect to OpenAI Realtime API
    const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
    this.openaiWs = new WebSocket(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
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
        
        // Send initial greeting when stream is ready
        // Agent speaks first on all calls (inbound and outbound)
        this.sendInitialGreeting().catch((error) => {
          console.error(`[Session ${this.callId}] Failed to send initial greeting:`, error);
        });
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
        // Explicitly commit the buffer and create a response
        this.sendToOpenAI({
          type: "input_audio_buffer.commit"
        });
        this.sendToOpenAI({
          type: "response.create"
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

  private async sendInitialGreeting() {
    console.log(`[Session ${this.callId}] 🎯 Preparing to send initial greeting - agent speaks first`);
    
    // Wait for OpenAI WebSocket to be ready
    await this.waitForOpenAIReady();
    
    // Use the proper German greeting from the agent's configuration
    const greetingText = this.agent?.language === "de" 
      ? "Guten Tag, mein Name ist Nora von SOVOICE, die persönliche KI-Assistentin von Geschäftsführer Florian Sopa. Sie können ganz normal mit mir sprechen, wie mit einem echten Menschen. Ich verstehe Dialoge, und Sie können mich jederzeit während des Gesprächs unterbrechen – ich höre sofort auf zu sprechen."
      : "Hello! How can I help you today?"; // Fallback for non-German agents
    
    // Create a conversation item with the greeting
    const greetingCreated = this.sendToOpenAI({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "assistant",
        content: [{
          type: "text",
          text: greetingText
        }]
      }
    }, true);
    
    if (!greetingCreated) {
      console.error(`[Session ${this.callId}] ❌ Failed to create greeting item`);
      return;
    }
    
    // Generate the audio response for the greeting with the agent's voice configuration
    setTimeout(() => {
      const responseCreated = this.sendToOpenAI({
        type: "response.create",
        response: {
          modalities: ["text", "audio"],
          voice: this.agent?.voice || "alloy", // Use the agent's configured voice
          instructions: this.agent?.language === "de" 
            ? "Sprich die Begrüßung in einem freundlichen, einladenden Ton auf Deutsch"
            : "Say the greeting in a friendly, welcoming tone"
        }
      }, true);
      
      if (responseCreated) {
        console.log(`[Session ${this.callId}] ✅ Greeting audio response initiated with voice: ${this.agent?.voice || "alloy"}`);
      } else {
        console.error(`[Session ${this.callId}] ❌ Failed to initiate greeting audio`);
      }
    }, 100); // Small delay to ensure the item is created first
  }

  private async waitForOpenAIReady(maxRetries = 10, retryDelay = 100): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      if (this.openaiWs && this.openaiWs.readyState === WebSocket.OPEN) {
        console.log(`[Session ${this.callId}] ✅ OpenAI WebSocket ready after ${i} retries`);
        return;
      }
      
      if (i === 0) {
        const stateNames: { [key: number]: string } = {
          0: 'CONNECTING',
          1: 'OPEN',
          2: 'CLOSING',
          3: 'CLOSED'
        };
        const state = this.openaiWs ? this.openaiWs.readyState : -1;
        console.log(`[Session ${this.callId}] ⏳ Waiting for OpenAI WebSocket... (state: ${stateNames[state] || state})`);
      }
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    
    console.error(`[Session ${this.callId}] ❌ OpenAI WebSocket not ready after ${maxRetries} retries`);
  }

  private sendToOpenAI(message: any, isGreeting = false): boolean {
    if (!this.openaiWs) {
      console.error(`[Session ${this.callId}] Cannot send to OpenAI - WebSocket not initialized`);
      return false;
    }
    
    if (this.openaiWs.readyState !== WebSocket.OPEN) {
      const stateNames: { [key: number]: string } = {
        0: 'CONNECTING',
        1: 'OPEN',
        2: 'CLOSING',
        3: 'CLOSED'
      };
      console.error(`[Session ${this.callId}] Cannot send to OpenAI - WebSocket state is ${stateNames[this.openaiWs.readyState] || this.openaiWs.readyState}${isGreeting ? ' (greeting)' : ''}`);
      return false;
    }
    
    try {
      this.openaiWs.send(JSON.stringify(message));
      if (isGreeting) {
        console.log(`[Session ${this.callId}] 📤 Sent greeting message to OpenAI: ${message.type}`);
      }
      return true;
    } catch (error) {
      console.error(`[Session ${this.callId}] Error sending to OpenAI:`, error);
      return false;
    }
  }

  private sendToTwilio(message: any): boolean {
    if (!this.twilioWs) {
      console.error(`[Session ${this.callId}] Cannot send to Twilio - WebSocket not initialized`);
      return false;
    }
    
    if (this.twilioWs.readyState !== WebSocket.OPEN) {
      const stateNames: { [key: number]: string } = {
        0: 'CONNECTING',
        1: 'OPEN',
        2: 'CLOSING',
        3: 'CLOSED'
      };
      console.error(`[Session ${this.callId}] Cannot send to Twilio - WebSocket state is ${stateNames[this.twilioWs.readyState] || this.twilioWs.readyState}, streamSid: ${this.streamSid}`);
      return false;
    }
    
    try {
      this.twilioWs.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`[Session ${this.callId}] Error sending to Twilio:`, error);
      return false;
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

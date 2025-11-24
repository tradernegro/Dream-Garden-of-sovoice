import WebSocket from "ws";
import { storage } from "./storage";
import { AppointmentScheduler } from "./services/appointment-scheduler";

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
        
        // Request a response with explicit instructions for the greeting
        // This ensures the AI knows what to say initially
        this.sendToOpenAI({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
            instructions: "Greet the caller professionally. Introduce yourself as the SOVOICE Assistant and ask how you can help them today. Be friendly and welcoming."
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
        
        // Only clear Twilio buffer if assistant is speaking (to stop assistant audio)
        // Do NOT clear if user is just starting to speak (would delete their audio)
        if (this.streamSid && this.isAssistantSpeaking) {
          console.log(`[Session ${this.callId}] 🧹 Clearing Twilio audio buffer to stop assistant`);
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
          
          // Extract and update customer metadata
          this.extractAndUpdateCustomerMetadata(event.transcript);
        }
        break;

      case "response.audio_transcript.done":
        console.log(`[Session ${this.callId}] Audio transcript completed:`, event.transcript);
        // Also extract metadata from assistant's transcript (in case it mentions user data)
        if (event.transcript) {
          this.extractAndUpdateCustomerMetadata(event.transcript);
        }
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
        console.log(`[Session ${this.callId}] Extracted email: ${currentMetadata.customerEmail}`);
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
          console.log(`[Session ${this.callId}] Extracted name: ${currentMetadata.customerName}`);
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
          console.log(`[Session ${this.callId}] Extracted company: ${currentMetadata.customerCompany}`);
          break;
        }
      }
      
      // Update call metadata if new information was extracted
      if (updated) {
        await storage.updateCall(this.callId, {
          metadata: currentMetadata
        });
        console.log(`[Session ${this.callId}] Updated call metadata with customer information`);
        
        // Try to schedule appointment if we have enough data
        await this.tryScheduleAppointment();
      }
    } catch (error) {
      console.error(`[Session ${this.callId}] Error extracting customer metadata:`, error);
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

  // Automatically schedule appointment when sufficient data is collected
  private async tryScheduleAppointment() {
    try {
      // Check if we have collected enough customer data
      const call = await storage.getCall(this.callId);
      if (!call) return;
      
      const metadata = (call.metadata || {}) as any;
      const customerName = metadata.customerName;
      const customerEmail = metadata.customerEmail;
      const customerPhone = metadata.customerPhone;
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
        console.log(`[Session ${this.callId}] Attempting to schedule Calendly appointment for ${customerName} (${customerEmail})`);
        
        // Create appointment scheduler
        const appointmentScheduler = new AppointmentScheduler();
        
        // Build additional notes from collected data
        const additionalNotes = [
          company ? `Firma: ${company}` : null,
          customerPhone ? `Telefon: ${customerPhone}` : null,
          `Anruf-ID: ${this.callId}`,
          `Automatisch erstellt während Telefonat`,
        ].filter(Boolean).join('\n');
        
        try {
          // Try to schedule appointment
          const result = await appointmentScheduler.scheduleAppointment({
            agent,
            customerEmail,
            customerName,
            customerPhone,
            additionalNotes,
            preferredTime: undefined, // Use default (tomorrow 10 AM)
          });
          
          if (result.success) {
            console.log(`[Session ${this.callId}] Appointment scheduled successfully:`, result);
            
            // Mark appointment as scheduled in metadata
            await storage.updateCall(this.callId, {
              metadata: {
                ...metadata,
                appointmentScheduled: true,
                appointmentDetails: result,
              },
            });
            
            // Note: We can't send system messages directly to affect the conversation
            // The assistant will continue with its normal flow
          } else {
            console.log(`[Session ${this.callId}] Could not schedule appointment:`, result.message);
          }
        } catch (error) {
          console.error(`[Session ${this.callId}] Error scheduling appointment:`, error);
          // Don't expose technical errors to customer
        }
      }
    } catch (error) {
      console.error(`[Session ${this.callId}] Error in tryScheduleAppointment:`, error);
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

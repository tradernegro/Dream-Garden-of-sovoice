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
        console.log(`[Session ${this.callId}] Attempting to schedule appointment for ${customerName} (${customerEmail})`);
        
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
              console.log(`[Session ${this.callId}] No available slots found in the next 5 days`);
              return;
            }
          }
          
          // Create appointment in our internal system
          const appointment = await storage.createAppointment({
            title: `Termin – ${customerName}`,
            description: `Automatisch erstellt während Telefonat\nAnruf-ID: ${this.callId}\nGrund des Anrufs: Beratungsgespräch\n${company ? `Firma: ${company}` : ''}`,
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
          
          console.log(`[Session ${this.callId}] Appointment created successfully:`, appointment.id);
          
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
                to: [customerEmail],
                subject: `Terminbestätigung - ${appointmentTime}`,
                body: `
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
                isHtml: true
              });
              
              console.log(`[Session ${this.callId}] Confirmation email sent to ${customerEmail}`);
              
              // Update appointment metadata
              await storage.updateAppointment(appointment.id, {
                metadata: {
                  ...appointment.metadata,
                  emailSent: true
                }
              });
            }
          } catch (emailError) {
            console.error(`[Session ${this.callId}] Failed to send confirmation email:`, emailError);
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
          console.error(`[Session ${this.callId}] Error creating appointment:`, error);
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

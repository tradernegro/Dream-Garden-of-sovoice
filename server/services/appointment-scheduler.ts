import { fetchCalendlyEventTypes } from "../calendly-client.js";
// import { MicrosoftAuthService } from "./microsoft-auth.js"; // Temporarily disabled - being replaced
import { storage } from "../storage.js";
import type { Agent } from "@shared/schema";

export class AppointmentScheduler {
  // private msAuthService: MicrosoftAuthService; // Temporarily disabled

  constructor() {
    // this.msAuthService = new MicrosoftAuthService(); // Temporarily disabled
  }

  /**
   * Schedule a Calendly appointment for a customer via an agent
   */
  async scheduleAppointment({
    agent,
    customerEmail,
    customerName,
    customerPhone,
    preferredTime,
    additionalNotes,
  }: {
    agent: Agent;
    customerEmail: string;
    customerName: string;
    customerPhone?: string;
    preferredTime?: string;
    additionalNotes?: string;
  }) {
    try {
      // Check if agent has Calendly enabled
      if (agent.calendlyEnabled !== 1 || !agent.calendlyEventType) {
        throw new Error("Calendly is not configured for this agent");
      }

      // Check if Calendly is authenticated
      const { getValidAccessToken } = await import("../calendly-client.js");
      const accessToken = await getValidAccessToken();
      
      if (!accessToken) {
        throw new Error("Calendly authentication expired or missing. Please reconnect Calendly in settings.");
      }

      // Get the event type details
      const eventTypes = await fetchCalendlyEventTypes({ count: 100 });
      const agentEventType = agent.calendlyEventType; // We already checked it's not null above
      
      // Normalize the search string for flexible matching
      const normalizedSearch = agentEventType.toLowerCase()
        .replace(/\s+/g, '') // Remove spaces
        .replace(/minute(s)?/g, 'min') // Normalize "minute" to "min"
        .replace(/hour(s)?/g, 'hr'); // Normalize "hour" to "hr"
      
      // Try to match by URI, ID, or name with flexible matching
      const eventType = eventTypes.find((et: any) => {
        // Direct matches
        if (et.uri === agentEventType || et.id === agentEventType) {
          return true;
        }
        
        // Flexible name matching
        const normalizedName = et.name.toLowerCase()
          .replace(/\s+/g, '')
          .replace(/minute(s)?/g, 'min')
          .replace(/hour(s)?/g, 'hr');
        
        // Check if normalized strings match or contain each other
        return normalizedName === normalizedSearch || 
               normalizedName.includes(normalizedSearch) ||
               normalizedSearch.includes(normalizedName);
      });
      
      // If still not found, try to find the first available event type as fallback
      const fallbackEventType = !eventType && eventTypes.length > 0 ? eventTypes[0] : eventType;
      
      if (!fallbackEventType) {
        console.error(`[AppointmentScheduler] Could not find event type matching: ${agent.calendlyEventType}`);
        console.error(`[AppointmentScheduler] Available event types:`, eventTypes.map((et: any) => ({ id: et.id, name: et.name, uri: et.uri })));
        throw new Error("No Calendly event types available. Please configure at least one event type in Calendly.");
      }
      
      const eventTypeToUse = eventType || fallbackEventType;
      if (!eventType && fallbackEventType) {
        console.log(`[AppointmentScheduler] Using fallback event type: ${fallbackEventType.name}`);
      }

      // Try to book appointment directly via API (requires paid plan)
      const appointmentResult = await this.createEventInvitee({
        eventTypeUri: eventTypeToUse.uri,
        customerEmail,
        customerName,
        customerPhone,
        preferredTime,
        additionalNotes,
        accessToken,
      });

      if (appointmentResult.success) {
        // Appointment was booked directly
        console.log(`[AppointmentScheduler] Appointment booked directly for ${customerEmail}`);
        
        // Send confirmation email
        await this.sendAppointmentEmail({
          customerEmail,
          customerName,
          agentName: agent.name,
          schedulingUrl: appointmentResult.rescheduleUrl || "",
          preferredTime: appointmentResult.scheduledTime,
          additionalNotes,
          isConfirmed: true,
        });

        return {
          success: true,
          schedulingUrl: appointmentResult.rescheduleUrl,
          eventUri: appointmentResult.eventUri,
          message: `Appointment confirmed for ${customerEmail} at ${appointmentResult.scheduledTime}`,
        };
      } else {
        // Fallback: Generate a pre-filled scheduling link (for free plans)
        console.log(`[AppointmentScheduler] Direct booking failed, falling back to scheduling link`);
        
        const schedulingUrl = eventTypeToUse.scheduling_url;
        const inviteeData = {
          email: customerEmail,
          name: customerName,
          phone: customerPhone,
          questions_and_answers: additionalNotes ? [{
            question: "Additional Notes",
            answer: additionalNotes
          }] : [],
          text_reminder_number: customerPhone,
        };

        const preFilledUrl = this.buildPrefilledSchedulingUrl(schedulingUrl, inviteeData);

        // Send invitation email with scheduling link
        await this.sendAppointmentEmail({
          customerEmail,
          customerName,
          agentName: agent.name,
          schedulingUrl: preFilledUrl,
          preferredTime,
          additionalNotes,
          isConfirmed: false,
        });

        return {
          success: true,
          schedulingUrl: preFilledUrl,
          message: `Appointment scheduling link sent to ${customerEmail}`,
        };
      }
    } catch (error: any) {
      console.error("[AppointmentScheduler] Error scheduling appointment:", error);
      
      // Provide clearer error messages
      if (error.message?.includes("authentication")) {
        throw new Error("Calendly authentication failed. Please reconnect Calendly in settings.");
      } else if (error.message?.includes("event type")) {
        throw new Error("Selected Calendly event type is no longer available. Please update agent settings.");
      } else {
        throw error;
      }
    }
  }

  /**
   * Create event invitee via Calendly API (requires paid plan)
   */
  private async createEventInvitee({
    eventTypeUri,
    customerEmail,
    customerName,
    customerPhone,
    preferredTime,
    additionalNotes,
    accessToken,
  }: {
    eventTypeUri: string;
    customerEmail: string;
    customerName: string;
    customerPhone?: string;
    preferredTime?: string;
    additionalNotes?: string;
    accessToken: string;
  }): Promise<{
    success: boolean;
    eventUri?: string;
    rescheduleUrl?: string;
    scheduledTime?: string;
    error?: string;
  }> {
    try {
      // Parse preferred time or use current time + 1 day as default
      let startTime: Date;
      if (preferredTime) {
        // Try to parse the preferred time
        const parsedTime = new Date(preferredTime);
        if (!isNaN(parsedTime.getTime())) {
          startTime = parsedTime;
        } else {
          // If parsing fails, try to interpret it as a relative time
          console.log(`[AppointmentScheduler] Could not parse preferred time: ${preferredTime}`);
          // Default to tomorrow at 10 AM
          startTime = new Date();
          startTime.setDate(startTime.getDate() + 1);
          startTime.setHours(10, 0, 0, 0);
        }
      } else {
        // Default to tomorrow at 10 AM
        startTime = new Date();
        startTime.setDate(startTime.getDate() + 1);
        startTime.setHours(10, 0, 0, 0);
      }

      // Prepare the request body
      const requestBody = {
        event_type: eventTypeUri,
        start_time: startTime.toISOString(),
        invitee: {
          name: customerName,
          email: customerEmail,
          timezone: "America/New_York", // Default timezone, could be made configurable
          ...(customerPhone && { text_reminder_number: customerPhone }),
        },
        ...(additionalNotes && {
          questions_and_answers: [{
            question: "Additional Notes",
            answer: additionalNotes,
            position: 0,
          }],
        }),
      };

      // Call Calendly API to create the invitee
      const response = await fetch("https://api.calendly.com/invitees", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        const resource = data.resource;
        
        return {
          success: true,
          eventUri: resource.event,
          rescheduleUrl: resource.reschedule_url,
          scheduledTime: startTime.toISOString(),
        };
      } else if (response.status === 403) {
        // Paid plan required
        console.log("[AppointmentScheduler] Calendly API returned 403 - paid plan required");
        return {
          success: false,
          error: "Paid plan required",
        };
      } else {
        const errorText = await response.text();
        console.error(`[AppointmentScheduler] Calendly API error: ${errorText}`);
        return {
          success: false,
          error: errorText,
        };
      }
    } catch (error) {
      console.error("[AppointmentScheduler] Error creating event invitee:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Build a pre-filled Calendly scheduling URL
   */
  private buildPrefilledSchedulingUrl(baseUrl: string, inviteeData: any): string {
    const params = new URLSearchParams();
    
    if (inviteeData.email) {
      params.append("email", inviteeData.email);
    }
    if (inviteeData.name) {
      params.append("name", inviteeData.name);
    }
    if (inviteeData.phone) {
      params.append("phone_number", inviteeData.phone);
    }
    if (inviteeData.questions_and_answers && inviteeData.questions_and_answers.length > 0) {
      params.append("a1", inviteeData.questions_and_answers[0].answer);
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Send appointment confirmation email
   */
  private async sendAppointmentEmail({
    customerEmail,
    customerName,
    agentName,
    schedulingUrl,
    preferredTime,
    additionalNotes,
    isConfirmed = false,
  }: {
    customerEmail: string;
    customerName: string;
    agentName: string;
    schedulingUrl: string;
    preferredTime?: string;
    additionalNotes?: string;
    isConfirmed?: boolean;
  }) {
    try {
      // Microsoft OAuth temporarily disabled - email notification skipped
      console.log("Microsoft OAuth temporarily disabled, skipping email notification");
      return;

      let emailBody: string;
      let subject: string;

      if (isConfirmed) {
        // Appointment is confirmed
        const formattedTime = preferredTime ? new Date(preferredTime).toLocaleString() : "To be determined";
        
        subject = "Appointment Confirmed - SoVoice AI";
        emailBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Appointment Confirmed!</h2>
            
            <p>Dear ${customerName},</p>
            
            <p>Your appointment has been successfully scheduled with our AI assistant ${agentName}.</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Appointment Details:</h3>
              <p><strong>Date & Time:</strong> ${formattedTime}</p>
              ${additionalNotes ? `<p><strong>Notes:</strong> ${additionalNotes}</p>` : ''}
            </div>
            
            <p>You will receive a calendar invitation with meeting details shortly.</p>
            
            <p>Need to make changes? You can reschedule or cancel using this link:</p>
            <p style="word-break: break-all; color: #0066cc;">${schedulingUrl}</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              SoVoice AI Team<br>
              info@sovoice.ai
            </p>
          </div>
        `;
      } else {
        // Appointment needs to be scheduled
        subject = "Schedule Your Appointment - SoVoice AI";
        emailBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Appointment Scheduling Request</h2>
            
            <p>Dear ${customerName},</p>
            
            <p>Thank you for speaking with our AI assistant ${agentName}. Based on your conversation, we've prepared a scheduling link for you to book your appointment.</p>
            
            ${preferredTime ? `<p><strong>Your preferred time:</strong> ${preferredTime}</p>` : ''}
            ${additionalNotes ? `<p><strong>Additional notes:</strong> ${additionalNotes}</p>` : ''}
            
            <div style="margin: 30px 0;">
              <a href="${schedulingUrl}" style="background-color: #FF6F3C; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Schedule Your Appointment
              </a>
            </div>
            
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #0066cc;">${schedulingUrl}</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              SoVoice AI Team<br>
              info@sovoice.ai
            </p>
          </div>
        `;
      }

      await this.msAuthService.sendEmail({
        to: [customerEmail],
        subject,
        body: emailBody,
        isHtml: true,
      });

      console.log(`Appointment email sent to ${customerEmail} (${isConfirmed ? 'confirmed' : 'scheduling link'})`);
    } catch (error) {
      console.error("Error sending appointment email:", error);
      // Don't throw error here, appointment link was still generated
    }
  }

  /**
   * Handle Calendly webhook when appointment is scheduled
   */
  async handleAppointmentScheduled(eventData: any) {
    try {
      const { invitee, event } = eventData.payload;
      
      // Send confirmation email when appointment is actually booked
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Appointment Confirmed!</h2>
          
          <p>Dear ${invitee.name},</p>
          
          <p>Your appointment has been successfully scheduled.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Appointment Details:</h3>
            <p><strong>Date & Time:</strong> ${new Date(event.start_time).toLocaleString()}</p>
            <p><strong>Duration:</strong> ${event.duration} minutes</p>
            <p><strong>Location:</strong> ${event.location?.type || 'To be determined'}</p>
            ${event.location?.join_url ? `<p><strong>Meeting Link:</strong> <a href="${event.location.join_url}">${event.location.join_url}</a></p>` : ''}
          </div>
          
          <p>We look forward to speaking with you!</p>
          
          <p>If you need to reschedule or cancel, please use the link in your Calendly confirmation email.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          
          <p style="color: #666; font-size: 14px;">
            Best regards,<br>
            SoVoice AI Team<br>
            info@sovoice.ai
          </p>
        </div>
      `;

      // Check if Microsoft auth is configured before sending
      const isConfigured = await this.msAuthService.isConfigured();
      if (isConfigured) {
        await this.msAuthService.sendEmail({
          to: [invitee.email],
          subject: "Appointment Confirmed - SoVoice AI",
          body: emailBody,
          isHtml: true,
        });
        
        console.log(`Confirmation email sent to ${invitee.email} for scheduled appointment`);
      }
    } catch (error) {
      console.error("Error handling appointment scheduled webhook:", error);
    }
  }

  /**
   * Handle Calendly webhook when appointment is cancelled
   */
  async handleAppointmentCancelled(eventData: any) {
    try {
      const { invitee, event } = eventData.payload;
      
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Appointment Cancelled</h2>
          
          <p>Dear ${invitee.name},</p>
          
          <p>Your appointment scheduled for ${new Date(event.start_time).toLocaleString()} has been cancelled.</p>
          
          <p>If you would like to reschedule, please contact us or speak with our AI assistant.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          
          <p style="color: #666; font-size: 14px;">
            Best regards,<br>
            SoVoice AI Team<br>
            info@sovoice.ai
          </p>
        </div>
      `;

      // Check if Microsoft auth is configured before sending
      const isConfigured = await this.msAuthService.isConfigured();
      if (isConfigured) {
        await this.msAuthService.sendEmail({
          to: [invitee.email],
          subject: "Appointment Cancelled - SoVoice AI",
          body: emailBody,
          isHtml: true,
        });
        
        console.log(`Cancellation email sent to ${invitee.email}`);
      }
    } catch (error) {
      console.error("Error handling appointment cancelled webhook:", error);
    }
  }
}
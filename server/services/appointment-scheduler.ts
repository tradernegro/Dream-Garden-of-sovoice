import { fetchCalendlyEventTypes } from "../calendly-client.js";
import { MicrosoftAuthService } from "./microsoft-auth.js";
import { storage } from "../storage.js";
import type { Agent } from "@shared/schema";

export class AppointmentScheduler {
  private msAuthService: MicrosoftAuthService;

  constructor() {
    this.msAuthService = new MicrosoftAuthService();
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

      // Get the event type details to construct the scheduling link
      const eventTypes = await fetchCalendlyEventTypes({ count: 100 });
      const eventType = eventTypes.find((et: any) => et.uri === agent.calendlyEventType);
      
      if (!eventType) {
        throw new Error("Calendly event type not found");
      }

      // Extract the scheduling link from the event type
      const schedulingUrl = eventType.scheduling_url;

      // Create invitee data for the appointment
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

      // Since Calendly API doesn't support direct appointment creation,
      // we'll generate a scheduling link with pre-filled data
      const preFilledUrl = this.buildPrefilledSchedulingUrl(schedulingUrl, inviteeData);

      // Send confirmation email with the scheduling link
      await this.sendAppointmentEmail({
        customerEmail,
        customerName,
        agentName: agent.name,
        schedulingUrl: preFilledUrl,
        preferredTime,
        additionalNotes,
      });

      return {
        success: true,
        schedulingUrl: preFilledUrl,
        message: `Appointment scheduling link sent to ${customerEmail}`,
      };
    } catch (error) {
      console.error("Error scheduling appointment:", error);
      throw error;
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
  }: {
    customerEmail: string;
    customerName: string;
    agentName: string;
    schedulingUrl: string;
    preferredTime?: string;
    additionalNotes?: string;
  }) {
    try {
      // Check if Microsoft auth is configured
      const isConfigured = await this.msAuthService.isConfigured();
      if (!isConfigured) {
        console.log("Microsoft email not configured, skipping email notification");
        return;
      }

      const emailBody = `
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

      await this.msAuthService.sendEmail({
        to: [customerEmail],
        subject: "Schedule Your Appointment - SoVoice AI",
        body: emailBody,
        isHtml: true,
      });

      console.log(`Appointment email sent to ${customerEmail}`);
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
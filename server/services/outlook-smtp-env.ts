import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

class OutlookSMTPService {
  private transporter: Transporter | null = null;
  private isConfigured: boolean = false;
  private email: string | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const email = process.env.OUTLOOK_EMAIL;
    const appPassword = process.env.OUTLOOK_APP_PASSWORD;
    
    if (!email || !appPassword) {
      console.log("Outlook SMTP: Environment variables not configured");
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: "smtp-mail.outlook.com",
        port: 587,
        secure: false, // Use STARTTLS
        auth: {
          user: email,
          pass: appPassword,
        },
        tls: {
          ciphers: "SSLv3",
        },
      });

      this.email = email;
      this.isConfigured = true;
      console.log("Outlook SMTP: Configured successfully");
    } catch (error) {
      console.error("Outlook SMTP: Configuration failed:", error);
    }
  }

  getStatus() {
    return {
      configured: this.isConfigured,
      connected: this.isConfigured,
      email: this.email,
    };
  }

  async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }): Promise<boolean> {
    if (!this.transporter || !this.isConfigured || !this.email) {
      console.log("Outlook SMTP: Not configured, skipping email");
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: options.from || `"SoVoice AI" <${this.email}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      console.log("Outlook SMTP: Email sent successfully:", info.messageId);
      return true;
    } catch (error) {
      console.error("Outlook SMTP: Failed to send email:", error);
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error("Outlook SMTP: Connection test failed:", error);
      return false;
    }
  }
}

// Export singleton instance
export const outlookSMTP = new OutlookSMTPService();
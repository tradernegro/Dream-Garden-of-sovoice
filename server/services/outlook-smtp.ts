import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { storage } from "../storage.js";

interface OutlookCredentials {
  email: string;
  appPassword: string;
}

class OutlookSMTPService {
  private transporter: Transporter | null = null;
  private credentials: OutlookCredentials | null = null;

  constructor() {
    // Load credentials on startup
    this.loadCredentials();
  }

  private async loadCredentials() {
    try {
      // Get stored credentials from settings
      const emailSetting = await storage.getSetting("outlook_email");
      const passwordSetting = await storage.getSetting("outlook_app_password");
      
      if (emailSetting && passwordSetting) {
        this.credentials = {
          email: emailSetting.value,
          appPassword: passwordSetting.value,
        };
        this.initializeTransporter();
      }
    } catch (error) {
      console.log("No Outlook credentials found");
    }
  }

  private initializeTransporter() {
    if (!this.credentials) return;

    this.transporter = nodemailer.createTransport({
      host: "smtp-mail.outlook.com",
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: this.credentials.email,
        pass: this.credentials.appPassword,
      },
      tls: {
        ciphers: "SSLv3",
      },
    });
  }

  async saveCredentials(email: string, appPassword: string): Promise<boolean> {
    try {
      // Test the credentials first
      const testTransporter = nodemailer.createTransport({
        host: "smtp-mail.outlook.com",
        port: 587,
        secure: false,
        auth: {
          user: email,
          pass: appPassword,
        },
        tls: {
          ciphers: "SSLv3",
        },
      });

      // Verify connection
      await testTransporter.verify();

      // Save to database if valid
      await storage.setSetting("outlook_email", email);
      await storage.setSetting("outlook_app_password", appPassword);

      // Update local state
      this.credentials = { email, appPassword };
      this.transporter = testTransporter;

      return true;
    } catch (error) {
      console.error("Failed to save Outlook credentials:", error);
      return false;
    }
  }

  async removeCredentials() {
    try {
      await storage.deleteSetting("outlook_email");
      await storage.deleteSetting("outlook_app_password");
      this.credentials = null;
      this.transporter = null;
    } catch (error) {
      console.error("Failed to remove credentials:", error);
    }
  }

  getStatus() {
    return {
      connected: !!this.credentials,
      email: this.credentials?.email || null,
    };
  }

  async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }): Promise<boolean> {
    if (!this.transporter || !this.credentials) {
      console.log("Outlook SMTP not configured");
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: options.from || `"SoVoice AI" <${this.credentials.email}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      console.log("Email sent:", info.messageId);
      return true;
    } catch (error) {
      console.error("Failed to send email:", error);
      return false;
    }
  }
}

// Export singleton instance
export const outlookSMTP = new OutlookSMTPService();
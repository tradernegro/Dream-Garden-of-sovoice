import nodemailer, { Transporter } from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
  requireTLS?: boolean;
}

interface EmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig | null = null;
  private lastError: string | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Check for email configuration
    const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';
    
    switch (emailProvider.toLowerCase()) {
      case 'godaddy':
        this.initializeGoDaddy();
        break;
      case 'sendgrid':
        this.initializeSendGrid();
        break;
      case 'smtp':
      default:
        this.initializeGenericSMTP();
        break;
    }

    if (this.config) {
      this.createTransporter();
    }
  }

  private initializeGoDaddy() {
    const email = process.env.EMAIL_ADDRESS || process.env.GODADDY_EMAIL;
    const password = process.env.EMAIL_PASSWORD || process.env.GODADDY_PASSWORD;

    if (!email || !password) {
      console.log('GoDaddy email not configured. Missing EMAIL_ADDRESS/GODADDY_EMAIL or EMAIL_PASSWORD/GODADDY_PASSWORD');
      return;
    }

    // GoDaddy SMTP settings
    // For Europe: smtpout.europe.secureserver.net
    // For Asia: smtpout.asia.secureserver.net  
    // For US: smtpout.secureserver.net
    const region = process.env.GODADDY_REGION || 'us';
    let host = 'smtpout.secureserver.net';
    
    if (region === 'europe') {
      host = 'smtpout.europe.secureserver.net';
    } else if (region === 'asia') {
      host = 'smtpout.asia.secureserver.net';
    }

    this.config = {
      host: host,
      port: 465, // GoDaddy uses port 465 for SSL
      secure: true, // true for port 465
      auth: {
        user: email,
        pass: password
      },
      from: email
    };

    console.log(`Email service configured for GoDaddy (${host})`);
  }

  private initializeSendGrid() {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.EMAIL_ADDRESS || process.env.SENDGRID_FROM_EMAIL || 'info@sovoice.ai';

    if (!apiKey) {
      console.log('SendGrid not configured. Missing SENDGRID_API_KEY');
      return;
    }

    // SendGrid SMTP settings
    this.config = {
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: apiKey
      },
      from: fromEmail
    };

    console.log('Email service configured for SendGrid');
  }

  private initializeGenericSMTP() {
    const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
    const port = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587');
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER || process.env.EMAIL_ADDRESS || process.env.EMAIL_USER;
    const pass = process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD;
    const from = process.env.EMAIL_FROM || process.env.EMAIL_ADDRESS || 'info@sovoice.ai';

    if (!host || !user || !pass) {
      console.log('SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD');
      return;
    }

    this.config = {
      host,
      port,
      secure,
      auth: {
        user,
        pass
      },
      from,
      requireTLS: port === 587
    };

    console.log(`Email service configured for generic SMTP (${host}:${port})`);
  }

  private createTransporter() {
    if (!this.config) return;

    try {
      const transportConfig: any = {
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.auth,
      };

      // Add TLS options for port 587
      if (this.config.requireTLS || this.config.port === 587) {
        transportConfig.requireTLS = true;
        transportConfig.tls = {
          rejectUnauthorized: false, // Allow self-signed certificates
          ciphers: 'SSLv3'
        };
      }

      this.transporter = nodemailer.createTransport(transportConfig);
      console.log('Email transporter created successfully');
    } catch (error) {
      console.error('Failed to create email transporter:', error);
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  public isConfigured(): boolean {
    return this.transporter !== null && this.config !== null;
  }

  public getStatus() {
    return {
      configured: this.isConfigured(),
      provider: process.env.EMAIL_PROVIDER || 'not configured',
      from: this.config?.from || null,
      lastError: this.lastError
    };
  }

  public async sendEmail(options: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string;
  }): Promise<EmailResult> {
    if (!this.transporter || !this.config) {
      return {
        success: false,
        error: 'Email service not configured. Please set up email credentials.'
      };
    }

    try {
      const mailOptions: SendMailOptions = {
        from: this.config.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || (options.html ? this.htmlToText(options.html) : ''),
        replyTo: options.replyTo || this.config.from
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      
      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      console.error('Failed to send email:', error);
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email'
      };
    }
  }

  public async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('Email server connection verified');
      return true;
    } catch (error) {
      console.error('Email server connection failed:', error);
      this.lastError = error instanceof Error ? error.message : 'Connection failed';
      return false;
    }
  }

  private htmlToText(html: string): string {
    // Simple HTML to text conversion
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }
}

// Export singleton instance
export const emailService = new EmailService();
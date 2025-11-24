import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db';
import { settings } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Google Calendar scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

export class GoogleCalendarService {
  private static instance: GoogleCalendarService;
  private oauth2Client: OAuth2Client | null = null;
  
  private constructor() {}
  
  static getInstance(): GoogleCalendarService {
    if (!GoogleCalendarService.instance) {
      GoogleCalendarService.instance = new GoogleCalendarService();
    }
    return GoogleCalendarService.instance;
  }

  /**
   * Initialize OAuth2 client with credentials
   */
  async initializeOAuth(): Promise<OAuth2Client> {
    // Get credentials from environment variables
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }

    // Determine redirect URL based on environment
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : 'http://localhost:5000';
    
    const redirectUrl = `${baseUrl}/api/google/callback`;

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUrl
    );

    // Try to load saved tokens from database
    await this.loadSavedTokens();

    return this.oauth2Client;
  }

  /**
   * Generate auth URL for OAuth consent
   */
  generateAuthUrl(): string {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent' // Force consent to get refresh token
    });
  }

  /**
   * Handle OAuth callback and save tokens
   */
  async handleOAuthCallback(code: string): Promise<void> {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    // Save tokens to database
    await this.saveTokens(tokens);
  }

  /**
   * Save OAuth tokens to database
   */
  private async saveTokens(tokens: any): Promise<void> {
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      scope: tokens.scope
    };

    // Save as JSON in settings
    await db.insert(settings)
      .values({
        key: 'google_calendar_tokens',
        value: tokenData as any
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: tokenData as any }
      });

    console.log('[Google Calendar] Tokens saved successfully');
  }

  /**
   * Load saved tokens from database
   */
  private async loadSavedTokens(): Promise<boolean> {
    try {
      const result = await db.select()
        .from(settings)
        .where(eq(settings.key, 'google_calendar_tokens'));

      if (result.length > 0 && result[0].value) {
        const tokens = result[0].value as any;
        if (this.oauth2Client) {
          this.oauth2Client.setCredentials(tokens);
          console.log('[Google Calendar] Tokens loaded from database');
          return true;
        }
      }
    } catch (error) {
      console.error('[Google Calendar] Error loading tokens:', error);
    }
    return false;
  }

  /**
   * Check if Google Calendar is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      if (!this.oauth2Client) {
        await this.initializeOAuth();
      }

      // Check if we have valid credentials
      const credentials = this.oauth2Client?.credentials;
      if (!credentials || !credentials.access_token) {
        return false;
      }

      // Try to list calendars to verify connection
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client! });
      await calendar.calendarList.list({ maxResults: 1 });
      
      return true;
    } catch (error) {
      console.error('[Google Calendar] Connection check failed:', error);
      return false;
    }
  }

  /**
   * Disconnect Google Calendar
   */
  async disconnect(): Promise<void> {
    // Revoke tokens if connected
    if (this.oauth2Client?.credentials?.access_token) {
      try {
        await this.oauth2Client.revokeCredentials();
      } catch (error) {
        console.error('[Google Calendar] Error revoking credentials:', error);
      }
    }

    // Clear saved tokens from database
    await db.delete(settings)
      .where(eq(settings.key, 'google_calendar_tokens'));

    // Clear OAuth client
    this.oauth2Client = null;
    
    console.log('[Google Calendar] Disconnected successfully');
  }

  /**
   * Create an event in Google Calendar
   */
  async createEvent(appointmentData: {
    title: string;
    customerName: string;
    customerEmail?: string;
    startTime: Date;
    endTime: Date;
    description?: string;
    location?: string;
  }): Promise<string | null> {
    try {
      if (!this.oauth2Client) {
        await this.initializeOAuth();
      }

      // Check if connected
      const isConnected = await this.isConnected();
      if (!isConnected) {
        console.log('[Google Calendar] Not connected, skipping event creation');
        return null;
      }

      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client! });

      // Create event object
      const event: calendar_v3.Schema$Event = {
        summary: appointmentData.title,
        description: appointmentData.description || `Termin mit ${appointmentData.customerName}`,
        start: {
          dateTime: appointmentData.startTime.toISOString(),
          timeZone: 'Europe/Berlin'
        },
        end: {
          dateTime: appointmentData.endTime.toISOString(),
          timeZone: 'Europe/Berlin'
        },
        location: appointmentData.location,
        attendees: appointmentData.customerEmail ? [
          { email: appointmentData.customerEmail }
        ] : undefined,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 60 },
            { method: 'popup', minutes: 15 }
          ]
        }
      };

      // Create event in Google Calendar
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
        sendNotifications: true
      });

      console.log('[Google Calendar] Event created:', response.data.id);
      return response.data.id || null;
    } catch (error) {
      console.error('[Google Calendar] Error creating event:', error);
      return null;
    }
  }

  /**
   * Update an event in Google Calendar
   */
  async updateEvent(eventId: string, appointmentData: {
    title: string;
    customerName: string;
    customerEmail?: string;
    startTime: Date;
    endTime: Date;
    description?: string;
    location?: string;
  }): Promise<boolean> {
    try {
      if (!this.oauth2Client) {
        await this.initializeOAuth();
      }

      // Check if connected
      const isConnected = await this.isConnected();
      if (!isConnected) {
        console.log('[Google Calendar] Not connected, skipping event update');
        return false;
      }

      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client! });

      // Update event object
      const event: calendar_v3.Schema$Event = {
        summary: appointmentData.title,
        description: appointmentData.description || `Termin mit ${appointmentData.customerName}`,
        start: {
          dateTime: appointmentData.startTime.toISOString(),
          timeZone: 'Europe/Berlin'
        },
        end: {
          dateTime: appointmentData.endTime.toISOString(),
          timeZone: 'Europe/Berlin'
        },
        location: appointmentData.location,
        attendees: appointmentData.customerEmail ? [
          { email: appointmentData.customerEmail }
        ] : undefined
      };

      // Update event in Google Calendar
      await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: event,
        sendNotifications: true
      });

      console.log('[Google Calendar] Event updated:', eventId);
      return true;
    } catch (error) {
      console.error('[Google Calendar] Error updating event:', error);
      return false;
    }
  }

  /**
   * Delete an event from Google Calendar
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      if (!this.oauth2Client) {
        await this.initializeOAuth();
      }

      // Check if connected
      const isConnected = await this.isConnected();
      if (!isConnected) {
        console.log('[Google Calendar] Not connected, skipping event deletion');
        return false;
      }

      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client! });

      // Delete event from Google Calendar
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
        sendNotifications: true
      });

      console.log('[Google Calendar] Event deleted:', eventId);
      return true;
    } catch (error) {
      console.error('[Google Calendar] Error deleting event:', error);
      return false;
    }
  }

  /**
   * List upcoming events from Google Calendar
   */
  async listUpcomingEvents(maxResults: number = 10): Promise<calendar_v3.Schema$Event[]> {
    try {
      if (!this.oauth2Client) {
        await this.initializeOAuth();
      }

      // Check if connected
      const isConnected = await this.isConnected();
      if (!isConnected) {
        console.log('[Google Calendar] Not connected, cannot list events');
        return [];
      }

      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client! });

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      });

      return response.data.items || [];
    } catch (error) {
      console.error('[Google Calendar] Error listing events:', error);
      return [];
    }
  }
}

// Export singleton instance
export const googleCalendarService = GoogleCalendarService.getInstance();
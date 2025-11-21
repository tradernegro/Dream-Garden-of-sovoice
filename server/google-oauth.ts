import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { db } from './db';
import { projects } from '@shared/schema';
import { eq } from 'drizzle-orm';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify'
];

// Create OAuth2 client
export function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/google/callback';

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

// Generate OAuth URL for authorization
export function generateAuthUrl(projectId: string) {
  const oauth2Client = createOAuth2Client();
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Gets refresh token
    scope: SCOPES,
    prompt: 'consent', // Forces consent to get refresh token
    state: projectId // Pass project ID in state parameter
  });

  return authUrl;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = createOAuth2Client();
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    throw new Error('Failed to exchange authorization code');
  }
}

// Get OAuth client for a project
export async function getOAuth2ClientForProject(projectId: string): Promise<OAuth2Client | null> {
  try {
    // Fetch project with OAuth tokens
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project || !project.googleOAuthTokens) {
      return null;
    }

    const tokens = project.googleOAuthTokens as any;
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);

    // Check if token needs refresh
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        
        // Update stored tokens
        await db
          .update(projects)
          .set({ 
            googleOAuthTokens: credentials,
            updatedAt: new Date()
          })
          .where(eq(projects.id, projectId));
      } catch (error) {
        console.error('Error refreshing token:', error);
        return null;
      }
    }

    return oauth2Client;
  } catch (error) {
    console.error('Error getting OAuth client for project:', error);
    return null;
  }
}

// Google Calendar Service
export class GoogleCalendarService {
  private calendar: any;

  constructor(auth: OAuth2Client) {
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  // List calendar events
  async listEvents(timeMin?: Date, timeMax?: Date, maxResults: number = 10) {
    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin?.toISOString() || new Date().toISOString(),
        timeMax: timeMax?.toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      });
      
      return response.data.items || [];
    } catch (error) {
      console.error('Error listing calendar events:', error);
      throw new Error('Failed to list calendar events');
    }
  }

  // Create a calendar event
  async createEvent(event: {
    summary: string;
    description?: string;
    start: Date;
    end: Date;
    attendees?: string[];
    location?: string;
  }) {
    try {
      const eventData = {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: {
          dateTime: event.start.toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: event.end.toISOString(),
          timeZone: 'UTC'
        },
        attendees: event.attendees?.map(email => ({ email }))
      };

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventData
      });

      return response.data;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw new Error('Failed to create calendar event');
    }
  }

  // Update a calendar event
  async updateEvent(eventId: string, updates: any) {
    try {
      const response = await this.calendar.events.patch({
        calendarId: 'primary',
        eventId,
        requestBody: updates
      });

      return response.data;
    } catch (error) {
      console.error('Error updating calendar event:', error);
      throw new Error('Failed to update calendar event');
    }
  }

  // Delete a calendar event
  async deleteEvent(eventId: string) {
    try {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId
      });

      return { success: true };
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      throw new Error('Failed to delete calendar event');
    }
  }
}

// Gmail Service
export class GmailService {
  private gmail: any;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  // List emails
  async listMessages(query: string = '', maxResults: number = 10) {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults
      });

      return response.data.messages || [];
    } catch (error) {
      console.error('Error listing messages:', error);
      throw new Error('Failed to list messages');
    }
  }

  // Get email details
  async getMessage(messageId: string) {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      return response.data;
    } catch (error) {
      console.error('Error getting message:', error);
      throw new Error('Failed to get message');
    }
  }

  // Send email
  async sendEmail(to: string, subject: string, body: string, cc?: string, bcc?: string) {
    try {
      const message = [
        `To: ${to}`,
        cc ? `Cc: ${cc}` : '',
        bcc ? `Bcc: ${bcc}` : '',
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${subject}`,
        '',
        body
      ].filter(Boolean).join('\n');

      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }

  // Mark as read/unread
  async modifyMessage(messageId: string, addLabels: string[] = [], removeLabels: string[] = []) {
    try {
      const response = await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: addLabels,
          removeLabelIds: removeLabels
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error modifying message:', error);
      throw new Error('Failed to modify message');
    }
  }

  // Get user profile
  async getProfile() {
    try {
      const response = await this.gmail.users.getProfile({
        userId: 'me'
      });

      return response.data;
    } catch (error) {
      console.error('Error getting profile:', error);
      throw new Error('Failed to get Gmail profile');
    }
  }
}
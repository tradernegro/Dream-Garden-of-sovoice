/**
 * Simplified Microsoft OAuth Service for Outlook Email Integration
 * Uses OAuth 2.0 with PKCE for secure authentication
 */

import { randomBytes, createHash } from "crypto";

// OAuth configuration
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || "common";

// OAuth endpoints
const OAUTH_BASE = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}`;
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Required scopes for email sending
const SCOPES = [
  "User.Read",
  "Mail.Send",
  "Mail.ReadWrite",
  "offline_access", // For refresh tokens
].join(" ");

// In-memory storage for OAuth state and tokens (in production, use database)
const oauthStates = new Map<string, { codeVerifier: string; timestamp: number }>();
const userTokens = new Map<string, { accessToken: string; refreshToken: string; expiresAt: number }>();

// Clean up expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.timestamp > 10 * 60 * 1000) { // 10 minutes expiry
      oauthStates.delete(state);
    }
  }
}, 5 * 60 * 1000);

export class MicrosoftOAuthService {
  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET);
  }

  /**
   * Generate OAuth URL with PKCE
   */
  async getAuthorizationUrl(redirectUri: string): Promise<{ url: string; state: string }> {
    if (!this.isConfigured()) {
      throw new Error("Microsoft OAuth not configured. Please set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.");
    }

    // Generate state for CSRF protection
    const state = randomBytes(32).toString("base64url");
    
    // Generate PKCE code verifier and challenge
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    // Store state and verifier
    oauthStates.set(state, {
      codeVerifier,
      timestamp: Date.now(),
    });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID!,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account", // Always show account selection
    });

    return {
      url: `${OAUTH_BASE}/oauth2/v2.0/authorize?${params}`,
      state,
    };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<{ email: string; success: boolean }> {
    // Validate state
    const stateData = oauthStates.get(state);
    if (!stateData) {
      throw new Error("Invalid or expired state parameter");
    }

    // Remove state to prevent replay
    oauthStates.delete(state);

    // Exchange code for tokens
    const tokenResponse = await fetch(`${OAUTH_BASE}/oauth2/v2.0/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID!,
        client_secret: MICROSOFT_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: stateData.codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("Token exchange failed:", error);
      throw new Error("Failed to exchange code for tokens");
    }

    const tokens = await tokenResponse.json();

    // Get user profile to retrieve email
    const profileResponse = await fetch(`${GRAPH_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new Error("Failed to retrieve user profile");
    }

    const profile = await profileResponse.json();
    const email = profile.mail || profile.userPrincipalName;

    // Store tokens (in production, encrypt and store in database)
    userTokens.set(email, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    return {
      email,
      success: true,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(email: string): Promise<boolean> {
    const tokenData = userTokens.get(email);
    if (!tokenData || !tokenData.refreshToken) {
      return false;
    }

    const response = await fetch(`${OAUTH_BASE}/oauth2/v2.0/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID!,
        client_secret: MICROSOFT_CLIENT_SECRET!,
        refresh_token: tokenData.refreshToken,
        grant_type: "refresh_token",
        scope: SCOPES,
      }),
    });

    if (!response.ok) {
      console.error("Token refresh failed");
      return false;
    }

    const tokens = await response.json();
    
    // Update stored tokens
    userTokens.set(email, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || tokenData.refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    return true;
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getAccessToken(email: string): Promise<string | null> {
    const tokenData = userTokens.get(email);
    if (!tokenData) {
      return null;
    }

    // Check if token is expired or about to expire (5 minutes buffer)
    if (tokenData.expiresAt < Date.now() + 5 * 60 * 1000) {
      const refreshed = await this.refreshAccessToken(email);
      if (!refreshed) {
        return null;
      }
      return userTokens.get(email)?.accessToken || null;
    }

    return tokenData.accessToken;
  }

  /**
   * Send email using Microsoft Graph API
   */
  async sendEmail({
    from,
    to,
    subject,
    html,
    text,
  }: {
    from: string;
    to: string;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(from);
      if (!accessToken) {
        console.error("No valid access token for", from);
        return false;
      }

      const message = {
        message: {
          subject,
          body: {
            contentType: html ? "HTML" : "Text",
            content: html || text || "",
          },
          toRecipients: [
            {
              emailAddress: {
                address: to,
              },
            },
          ],
        },
        saveToSentItems: true,
      };

      const response = await fetch(`${GRAPH_BASE}/me/sendMail`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Failed to send email:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error sending email:", error);
      return false;
    }
  }

  /**
   * Check if a user is connected
   */
  isUserConnected(email: string): boolean {
    return userTokens.has(email);
  }

  /**
   * Disconnect a user (logout)
   */
  disconnectUser(email: string): void {
    userTokens.delete(email);
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    connected: boolean;
    email: string | null;
    configured: boolean;
  } {
    const configured = this.isConfigured();
    
    // For now, return the first connected user (in production, track per session)
    const connectedEmails = Array.from(userTokens.keys());
    const email = connectedEmails[0] || null;
    
    return {
      connected: connectedEmails.length > 0,
      email,
      configured,
    };
  }
}

// Export singleton instance
export const microsoftOAuth = new MicrosoftOAuthService();
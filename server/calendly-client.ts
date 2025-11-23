import { db } from "./db";
import { eq } from "drizzle-orm";
import { settings } from "@shared/schema";

// Calendly API configuration
const CALENDLY_API_BASE = "https://api.calendly.com";
const CALENDLY_AUTH_BASE = "https://auth.calendly.com";
const CLIENT_ID = process.env.CALENDLY_CLIENT_ID || "";
const CLIENT_SECRET = process.env.CALENDLY_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.CALENDLY_REDIRECT_URI || "";

interface CalendlyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  organization: string;
  owner: string;
}

// Storage keys for Calendly credentials
const CALENDLY_TOKENS_KEY = "calendly_tokens";
const CALENDLY_USER_KEY = "calendly_user";

// Get stored Calendly tokens
async function getStoredTokens(): Promise<CalendlyTokens | null> {
  try {
    const result = await db.select()
      .from(settings)
      .where(eq(settings.key, CALENDLY_TOKENS_KEY));
    
    if (result.length > 0) {
      return result[0].value as CalendlyTokens;
    }
    return null;
  } catch (error) {
    console.error("[Calendly] Error fetching stored tokens:", error);
    return null;
  }
}

// Store Calendly tokens
async function storeTokens(tokens: CalendlyTokens): Promise<void> {
  try {
    await db.insert(settings)
      .values({
        key: CALENDLY_TOKENS_KEY,
        value: tokens as any
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: tokens as any }
      });
  } catch (error) {
    console.error("[Calendly] Error storing tokens:", error);
    throw error;
  }
}

// Store Calendly user info
async function storeUserInfo(userInfo: any): Promise<void> {
  try {
    await db.insert(settings)
      .values({
        key: CALENDLY_USER_KEY,
        value: userInfo
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: userInfo }
      });
  } catch (error) {
    console.error("[Calendly] Error storing user info:", error);
    throw error;
  }
}

// Clear Calendly credentials
export async function clearCalendlyCredentials(): Promise<void> {
  try {
    await db.delete(settings)
      .where(eq(settings.key, CALENDLY_TOKENS_KEY));
    await db.delete(settings)
      .where(eq(settings.key, CALENDLY_USER_KEY));
  } catch (error) {
    console.error("[Calendly] Error clearing credentials:", error);
    throw error;
  }
}

// Generate OAuth authorization URL with CSRF protection
export function generateCalendlyAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    state: state, // CSRF protection
  });
  
  return `${CALENDLY_AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<CalendlyTokens> {
  try {
    const response = await fetch(`${CALENDLY_AUTH_BASE}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri, // Use the dynamic redirect URI
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Calendly] Token exchange failed:", error);
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const data = await response.json();
    
    // Calculate expiration time (usually 2 hours from now)
    const tokens: CalendlyTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      scope: data.scope,
      organization: data.organization,
      owner: data.owner,
    };

    // Store tokens
    await storeTokens(tokens);
    
    // Fetch and store user info
    await fetchAndStoreUserInfo(tokens.access_token);
    
    return tokens;
  } catch (error) {
    console.error("[Calendly] Error exchanging code for tokens:", error);
    throw error;
  }
}

// Refresh access token
async function refreshAccessToken(refreshToken: string): Promise<CalendlyTokens> {
  try {
    const response = await fetch(`${CALENDLY_AUTH_BASE}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Calendly] Token refresh failed:", error);
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const data = await response.json();
    
    const tokens: CalendlyTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      scope: data.scope,
      organization: data.organization,
      owner: data.owner,
    };

    // Store new tokens
    await storeTokens(tokens);
    
    return tokens;
  } catch (error) {
    console.error("[Calendly] Error refreshing token:", error);
    throw error;
  }
}

// Get valid access token (refresh if needed)
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  
  if (!tokens) {
    return null;
  }

  // Check if token is expired
  if (Date.now() >= tokens.expires_at) {
    try {
      const newTokens = await refreshAccessToken(tokens.refresh_token);
      return newTokens.access_token;
    } catch (error) {
      console.error("[Calendly] Failed to refresh token:", error);
      return null;
    }
  }

  return tokens.access_token;
}

// Fetch and store user info
async function fetchAndStoreUserInfo(accessToken: string): Promise<void> {
  try {
    const response = await fetch(`${CALENDLY_API_BASE}/users/me`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("[Calendly] Failed to fetch user info:", response.status);
      return;
    }

    const data = await response.json();
    await storeUserInfo(data.resource);
  } catch (error) {
    console.error("[Calendly] Error fetching user info:", error);
  }
}

// Get Calendly connection status
export async function getCalendlyStatus() {
  try {
    const tokens = await getStoredTokens();
    const userResult = await db.select()
      .from(settings)
      .where(eq(settings.key, CALENDLY_USER_KEY));
    
    const user = userResult.length > 0 ? userResult[0].value : null;
    
    return {
      connected: !!tokens,
      userEmail: user ? (user as any).email : null,
      userName: user ? (user as any).name : null,
    };
  } catch (error) {
    console.error("[Calendly] Error getting status:", error);
    return {
      connected: false,
      userEmail: null,
      userName: null,
    };
  }
}

// Fetch scheduled events
export async function fetchCalendlyEvents(options: {
  count?: number;
  page_token?: string;
  status?: string;
  sort?: string;
  min_start_time?: string;
  max_start_time?: string;
} = {}) {
  const accessToken = await getValidAccessToken();
  
  if (!accessToken) {
    throw new Error("Not authenticated with Calendly");
  }

  const tokens = await getStoredTokens();
  if (!tokens?.owner) {
    throw new Error("Calendly user information not available");
  }

  const params = new URLSearchParams({
    user: tokens.owner,
    count: (options.count || 20).toString(),
    ...(options.page_token && { page_token: options.page_token }),
    ...(options.status && { status: options.status }),
    ...(options.sort && { sort: options.sort }),
    ...(options.min_start_time && { min_start_time: options.min_start_time }),
    ...(options.max_start_time && { max_start_time: options.max_start_time }),
  });

  try {
    const response = await fetch(`${CALENDLY_API_BASE}/scheduled_events?${params.toString()}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Calendly] Failed to fetch events:", error);
      throw new Error(`Failed to fetch events: ${error}`);
    }

    const data = await response.json();
    return data.collection || [];
  } catch (error) {
    console.error("[Calendly] Error fetching events:", error);
    throw error;
  }
}

// Fetch event types
export async function fetchCalendlyEventTypes(options: {
  active?: boolean;
  count?: number;
  page_token?: string;
  sort?: string;
} = {}) {
  const accessToken = await getValidAccessToken();
  
  if (!accessToken) {
    throw new Error("Not authenticated with Calendly");
  }

  const tokens = await getStoredTokens();
  if (!tokens?.owner) {
    throw new Error("Calendly user information not available");
  }

  const params = new URLSearchParams({
    user: tokens.owner,
    count: (options.count || 20).toString(),
    ...(options.active !== undefined && { active: options.active.toString() }),
    ...(options.page_token && { page_token: options.page_token }),
    ...(options.sort && { sort: options.sort }),
  });

  try {
    const response = await fetch(`${CALENDLY_API_BASE}/event_types?${params.toString()}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Calendly] Failed to fetch event types:", error);
      throw new Error(`Failed to fetch event types: ${error}`);
    }

    const data = await response.json();
    
    // Process event types to extract useful information
    return (data.collection || []).map((eventType: any) => ({
      id: eventType.uri.split('/').pop(),
      uri: eventType.uri, // Full URI for reference
      name: eventType.name,
      description: eventType.description_plain,
      duration_minutes: eventType.duration,
      scheduling_url: eventType.scheduling_url,
      active: eventType.active,
      color: eventType.color,
    }));
  } catch (error) {
    console.error("[Calendly] Error fetching event types:", error);
    throw error;
  }
}

// Cancel a scheduled event
export async function cancelCalendlyEvent(eventId: string, reason?: string) {
  const accessToken = await getValidAccessToken();
  
  if (!accessToken) {
    throw new Error("Not authenticated with Calendly");
  }

  try {
    const response = await fetch(`${CALENDLY_API_BASE}/scheduled_events/${eventId}/cancellation`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: reason || "Cancelled via SOVOICE platform",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Calendly] Failed to cancel event:", error);
      throw new Error(`Failed to cancel event: ${error}`);
    }

    return { success: true };
  } catch (error) {
    console.error("[Calendly] Error cancelling event:", error);
    throw error;
  }
}
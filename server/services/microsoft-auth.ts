import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import type { Email } from "@shared/schema";

// Microsoft Graph API configuration
const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID || "",
    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || "common"}`,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
  },
};

// Scopes required for email access
const SCOPES = [
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/User.Read",
  "offline_access", // For refresh token to persist session
];

// Scopes for application permissions (client credentials flow)
const APP_SCOPES = [
  "https://graph.microsoft.com/.default", // Uses all consented application permissions
];

export class MicrosoftAuthService {
  private msalClient: ConfidentialClientApplication;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private refreshToken: string | null = null;
  private targetMailbox: string | null = null;
  private authType: "delegated" | "application" | null = null;
  private userEmail: string | null = null;
  private accountInfo: any = null;

  constructor() {
    this.msalClient = new ConfidentialClientApplication(msalConfig);
    // Load cached token from storage will be done on demand
  }

  // Load token from storage
  async loadFromStorage(): Promise<void> {
    try {
      const { storage } = await import("../storage");
      const tokenData = await storage.getSetting("microsoft_token_data");
      if (tokenData && tokenData.value) {
        // Handle both JSON string and object formats
        let data: any;
        if (typeof tokenData.value === 'string') {
          try {
            data = JSON.parse(tokenData.value);
          } catch (e) {
            // If it's not valid JSON, treat it as the data directly
            data = tokenData.value;
          }
        } else {
          // Value is already an object
          data = tokenData.value;
        }
        
        this.accessToken = data.accessToken;
        this.tokenExpiry = data.tokenExpiry ? new Date(data.tokenExpiry) : null;
        this.authType = data.authType;
        this.userEmail = data.userEmail;
        this.targetMailbox = data.targetMailbox;
        this.refreshToken = data.refreshToken;
        this.accountInfo = data.accountInfo;
      }
    } catch (error) {
      console.error("Failed to load token from storage:", error);
    }
  }

  // Save token to storage
  async saveToStorage(): Promise<void> {
    try {
      const { storage } = await import("../storage");
      const tokenData = {
        accessToken: this.accessToken,
        tokenExpiry: this.tokenExpiry?.toISOString(),
        authType: this.authType,
        userEmail: this.userEmail,
        targetMailbox: this.targetMailbox,
        refreshToken: this.refreshToken,
        accountInfo: this.accountInfo
      };
      await storage.setSetting("microsoft_token_data", JSON.stringify(tokenData));
    } catch (error) {
      console.error("Failed to save token to storage:", error);
    }
  }

  // Generate authorization URL for user consent
  async getAuthorizationUrl(redirectUri: string): Promise<string> {
    const authCodeUrlParameters = {
      scopes: SCOPES,
      redirectUri,
      responseMode: "query" as const,
    };

    try {
      const response = await this.msalClient.getAuthCodeUrl(authCodeUrlParameters);
      return response;
    } catch (error) {
      console.error("Error generating auth URL:", error);
      throw new Error("Failed to generate authorization URL");
    }
  }

  // Generate authorization URL with admin consent for permanent access
  async getAuthorizationUrlWithAdminConsent(redirectUri: string): Promise<string> {
    const authCodeUrlParameters = {
      scopes: SCOPES,
      redirectUri,
      responseMode: "query" as const,
      prompt: "consent", // Force consent prompt
      extraQueryParameters: {
        prompt: "admin_consent", // Request admin consent
        access_type: "offline", // Request refresh token
      }
    };

    try {
      const response = await this.msalClient.getAuthCodeUrl(authCodeUrlParameters);
      return response;
    } catch (error) {
      console.error("Error generating auth URL with admin consent:", error);
      throw new Error("Failed to generate authorization URL with admin consent");
    }
  }

  // Check if Microsoft Auth is configured
  async isConfigured(): Promise<boolean> {
    try {
      // Check if we have a token in storage
      if (!this.accessToken) {
        await this.loadFromStorage();
      }
      
      // Check if we have valid authentication
      if (this.accessToken) {
        // Verify token is not expired
        if (this.tokenExpiry && this.tokenExpiry < new Date()) {
          // Try to refresh the token
          try {
            await this.getAccessToken();
            return true;
          } catch {
            return false;
          }
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Error checking Microsoft Auth configuration:", error);
      return false;
    }
  }

  // Exchange authorization code for access token
  async acquireTokenByCode(code: string, redirectUri: string): Promise<{ accessToken: string; userEmail: string }> {
    const tokenRequest = {
      code,
      scopes: SCOPES,
      redirectUri,
    };

    try {
      const response = await this.msalClient.acquireTokenByCode(tokenRequest);
      if (response && response.accessToken) {
        this.accessToken = response.accessToken;
        this.tokenExpiry = response.expiresOn || null;
        // Store refresh token and account info for future use
        this.refreshToken = (response as any).refreshToken || null;
        this.accountInfo = response.account;
        this.authType = "delegated";
        
        // Extract user email from the token response
        this.userEmail = response.account?.username || response.account?.name || null;
        this.targetMailbox = null; // Clear targetMailbox for delegated auth
        
        // Save token to persistent storage
        await this.saveToStorage();
        
        return {
          accessToken: response.accessToken,
          userEmail: this.userEmail || ""
        };
      }
      throw new Error("No access token received");
    } catch (error) {
      console.error("Error acquiring token:", error);
      throw new Error("Failed to acquire access token");
    }
  }

  // Set manual access token
  setManualAccessToken(token: string, userEmail: string): void {
    this.accessToken = token;
    // Set token expiry to 1 hour from now (typical for Microsoft tokens)
    this.tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
  }

  // Acquire token using client credentials (application permissions)
  async acquireTokenByClientCredentials(targetMailbox: string = "info@sovoice.ai"): Promise<string> {
    const tokenRequest = {
      scopes: APP_SCOPES,
      skipCache: true, // Always get a fresh token
    };

    try {
      const response = await this.msalClient.acquireTokenByClientCredential(tokenRequest);
      if (response && response.accessToken) {
        this.accessToken = response.accessToken;
        this.tokenExpiry = response.expiresOn || null;
        // Store the target mailbox for use in API calls
        this.targetMailbox = targetMailbox;
        this.authType = "application";
        this.userEmail = null;
        
        // Save token to persistent storage
        await this.saveToStorage();
        
        return response.accessToken;
      }
      throw new Error("No access token received");
    } catch (error) {
      console.error("Error acquiring app token:", error);
      throw new Error("Failed to acquire application access token");
    }
  }

  // Get current auth info
  getAuthInfo(): { authType: string | null; email: string | null; hasToken: boolean } {
    return {
      authType: this.authType,
      email: this.authType === "delegated" ? this.userEmail : this.targetMailbox,
      hasToken: !!this.accessToken && (!this.tokenExpiry || this.tokenExpiry > new Date())
    };
  }

  // Get or refresh access token
  async getAccessToken(): Promise<string> {
    // First, try to load from storage if we don't have a token in memory
    if (!this.accessToken) {
      await this.loadFromStorage();
    }
    
    // Check if token exists and is still valid
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    // If token is expired, try different refresh strategies based on auth type
    if (this.authType === "application") {
      // For application auth, re-acquire using client credentials
      try {
        console.log("Token expired, refreshing using client credentials...");
        const token = await this.acquireTokenByClientCredentials(this.targetMailbox || "info@sovoice.ai");
        return token;
      } catch (error) {
        console.error("Failed to refresh token using client credentials:", error);
      }
    } else if (this.authType === "delegated") {
      // For delegated auth, try silent refresh using cached account
      try {
        if (this.accountInfo) {
          const silentRequest = {
            scopes: SCOPES,
            account: this.accountInfo,
            forceRefresh: true,
          };

          const response = await this.msalClient.acquireTokenSilent(silentRequest);
          if (response && response.accessToken) {
            this.accessToken = response.accessToken;
            this.tokenExpiry = response.expiresOn || null;
            this.refreshToken = (response as any).refreshToken || this.refreshToken;
            
            // Save refreshed token to storage
            await this.saveToStorage();
            
            return response.accessToken;
          }
        }
      } catch (error) {
        console.error("Failed to refresh delegated token silently:", error);
      }
    }
    
    // If all refresh attempts fail, try application auth as fallback
    if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID) {
      try {
        console.log("Attempting application auth as fallback...");
        const token = await this.acquireTokenByClientCredentials("info@sovoice.ai");
        return token;
      } catch (error) {
        console.error("Failed application auth fallback:", error);
      }
    }

    throw new Error("No valid access token available. User needs to re-authenticate.");
  }

  // Create Microsoft Graph client
  async getGraphClient(): Promise<Client> {
    const accessToken = await this.getAccessToken();
    
    const client = Client.init({
      authProvider: (callback) => {
        callback(null, accessToken);
      },
    });

    return client;
  }

  // Fetch emails from Outlook
  async fetchEmails(folder: string = "inbox", limit: number = 50): Promise<any[]> {
    try {
      const client = await this.getGraphClient();
      
      // Use /me for delegated permissions (OAuth login)
      // Use /users/{mailbox} for application permissions (app auth)
      const basePath = this.authType === "delegated" ? "/me" : `/users/${this.targetMailbox || "info@sovoice.ai"}`;
      let endpoint = `${basePath}/mailFolders`;
      
      // Map folder names to Graph API endpoints
      switch (folder.toLowerCase()) {
        case "inbox":
          endpoint = `${basePath}/mailFolders/inbox/messages`;
          break;
        case "sent":
          endpoint = `${basePath}/mailFolders/sentitems/messages`;
          break;
        case "drafts":
          endpoint = `${basePath}/mailFolders/drafts/messages`;
          break;
        case "junk":
        case "spam":
          endpoint = `${basePath}/mailFolders/junkemail/messages`;
          break;
        case "archive":
          endpoint = `${basePath}/mailFolders/archive/messages`;
          break;
        case "trash":
          endpoint = `${basePath}/mailFolders/deleteditems/messages`;
          break;
        case "important":
          // Important/flagged emails
          endpoint = `${basePath}/messages?$filter=flag/flagStatus eq 'flagged'`;
          break;
        case "all":
        default:
          endpoint = `${basePath}/messages`;
      }

      const response = await client
        .api(endpoint)
        .top(limit)
        .select("id,subject,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,sentDateTime,receivedDateTime,hasAttachments,isRead,flag")
        .orderby("receivedDateTime desc")
        .get();

      return response.value || [];
    } catch (error) {
      console.error("Error fetching emails:", error);
      throw new Error("Failed to fetch emails from Outlook");
    }
  }

  // Send email via Outlook
  async sendEmail(emailData: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    isHtml?: boolean;
  }): Promise<any> {
    try {
      const client = await this.getGraphClient();

      const message = {
        message: {
          subject: emailData.subject,
          body: {
            contentType: emailData.isHtml ? "HTML" : "Text",
            content: emailData.body,
          },
          toRecipients: emailData.to.map(email => ({
            emailAddress: { address: email },
          })),
          ccRecipients: emailData.cc ? emailData.cc.map(email => ({
            emailAddress: { address: email },
          })) : [],
          bccRecipients: emailData.bcc ? emailData.bcc.map(email => ({
            emailAddress: { address: email },
          })) : [],
        },
        saveToSentItems: true,
      };

      const response = await client
        .api("/me/sendMail")
        .post(message);

      return response;
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error("Failed to send email via Outlook");
    }
  }

  // Mark email as read
  async markAsRead(messageId: string): Promise<void> {
    try {
      const client = await this.getGraphClient();
      
      await client
        .api(`/me/messages/${messageId}`)
        .patch({
          isRead: true,
        });
    } catch (error) {
      console.error("Error marking email as read:", error);
      throw new Error("Failed to mark email as read");
    }
  }

  // Delete email
  async deleteEmail(messageId: string): Promise<void> {
    try {
      const client = await this.getGraphClient();
      
      await client
        .api(`/me/messages/${messageId}`)
        .delete();
    } catch (error) {
      console.error("Error deleting email:", error);
      throw new Error("Failed to delete email");
    }
  }

  // Move email to folder
  async moveToFolder(messageId: string, folderName: string): Promise<void> {
    try {
      const client = await this.getGraphClient();
      
      // Get folder ID
      let folderId = "";
      switch (folderName.toLowerCase()) {
        case "inbox":
          folderId = "inbox";
          break;
        case "archive":
          folderId = "archive";
          break;
        case "trash":
          folderId = "deleteditems";
          break;
        default:
          // Get custom folder ID
          const folders = await client
            .api("/me/mailFolders")
            .filter(`displayName eq '${folderName}'`)
            .get();
          
          if (folders.value && folders.value.length > 0) {
            folderId = folders.value[0].id;
          } else {
            throw new Error(`Folder ${folderName} not found`);
          }
      }

      await client
        .api(`/me/messages/${messageId}/move`)
        .post({
          destinationId: folderId,
        });
    } catch (error) {
      console.error("Error moving email:", error);
      throw new Error("Failed to move email");
    }
  }

  // Toggle flag/star
  async toggleFlag(messageId: string, isFlagged: boolean): Promise<void> {
    try {
      const client = await this.getGraphClient();
      
      await client
        .api(`/me/messages/${messageId}`)
        .patch({
          flag: {
            flagStatus: isFlagged ? "flagged" : "notFlagged",
          },
        });
    } catch (error) {
      console.error("Error toggling flag:", error);
      throw new Error("Failed to toggle email flag");
    }
  }

  // Get user profile
  async getUserProfile(): Promise<any> {
    try {
      const client = await this.getGraphClient();
      
      const user = await client
        .api("/me")
        .select("displayName,mail,userPrincipalName")
        .get();

      return user;
    } catch (error) {
      console.error("Error fetching user profile:", error);
      throw new Error("Failed to fetch user profile");
    }
  }

  // Convert Graph API email to our Email format
  convertToEmail(graphEmail: any): Partial<Email> {
    return {
      subject: graphEmail.subject || "(No Subject)",
      from: graphEmail.from?.emailAddress?.address || "unknown",
      to: graphEmail.toRecipients?.map((r: any) => r.emailAddress?.address) || [],
      cc: graphEmail.ccRecipients?.map((r: any) => r.emailAddress?.address) || [],
      bcc: graphEmail.bccRecipients?.map((r: any) => r.emailAddress?.address) || [],
      body: graphEmail.bodyPreview || "",
      bodyHtml: graphEmail.body?.contentType === "HTML" ? graphEmail.body.content : undefined,
      isRead: graphEmail.isRead ? 1 : 0,
      isStarred: graphEmail.flag?.flagStatus === "flagged" ? 1 : 0,
      receivedAt: graphEmail.receivedDateTime ? new Date(graphEmail.receivedDateTime) : undefined,
      sentAt: graphEmail.sentDateTime ? new Date(graphEmail.sentDateTime) : undefined,
      metadata: {
        outlookId: graphEmail.id,
        outlookConversationId: graphEmail.conversationId,
        outlookWebLink: graphEmail.webLink,
      },
      attachments: graphEmail.hasAttachments ? [] : [], // Attachments would need separate API call
      status: "received",
      folder: "inbox",
    };
  }

  // Verify delegated permissions (user authentication)
  async verifyDelegatedPermissions(): Promise<{
    success: boolean;
    scopeChecks: {
      read: boolean;
      readWrite: boolean;
    };
    error?: string;
    details?: any;
  }> {
    try {
      if (!this.accessToken) {
        return {
          success: false,
          scopeChecks: { read: false, readWrite: false },
          error: "No access token available. User authentication required."
        };
      }

      const client = await this.getGraphClient();
      const scopeChecks = { read: false, readWrite: false };
      const details: any = {};

      // Test Mail.Read permission
      try {
        const readTest = await client
          .api("/me/messages")
          .top(1)
          .select("id,subject")
          .get();
        
        scopeChecks.read = true;
        details.readTest = { success: true, messageCount: readTest.value?.length || 0 };
      } catch (readError: any) {
        details.readTest = { 
          success: false, 
          error: readError.message,
          code: readError.code 
        };
      }

      // Test Mail.ReadWrite permission
      try {
        // Create a test draft
        const draftMessage = {
          subject: "[Permission Test] Azure App Verification",
          body: {
            contentType: "Text",
            content: "This is a test message to verify Mail.ReadWrite permissions. This draft will be deleted immediately."
          },
          toRecipients: []
        };

        const draft = await client
          .api("/me/messages")
          .post(draftMessage);

        // Delete the draft immediately
        if (draft && draft.id) {
          await client
            .api(`/me/messages/${draft.id}`)
            .delete();
          
          scopeChecks.readWrite = true;
          details.readWriteTest = { success: true, method: "draft_create_delete" };
        }
      } catch (writeError: any) {
        // Fallback: Try to update isRead flag on an existing message
        try {
          const messages = await client
            .api("/me/messages")
            .top(1)
            .select("id,isRead")
            .get();
          
          if (messages.value && messages.value.length > 0) {
            const messageId = messages.value[0].id;
            const currentReadStatus = messages.value[0].isRead;
            
            await client
              .api(`/me/messages/${messageId}`)
              .patch({ isRead: !currentReadStatus });
            
            // Restore original status
            await client
              .api(`/me/messages/${messageId}`)
              .patch({ isRead: currentReadStatus });
            
            scopeChecks.readWrite = true;
            details.readWriteTest = { success: true, method: "update_read_status" };
          }
        } catch (fallbackError: any) {
          details.readWriteTest = { 
            success: false, 
            error: fallbackError.message,
            code: fallbackError.code 
          };
        }
      }

      return {
        success: scopeChecks.read && scopeChecks.readWrite,
        scopeChecks,
        details
      };
    } catch (error: any) {
      return {
        success: false,
        scopeChecks: { read: false, readWrite: false },
        error: error.message || "Verification failed"
      };
    }
  }

  // Verify application permissions (client credentials)
  async verifyApplicationPermissions(targetMailbox: string = "info@sovoice.ai"): Promise<{
    success: boolean;
    scopeChecks: {
      read: boolean;
      readWrite: boolean;
    };
    error?: string;
    details?: any;
  }> {
    try {
      // Get a fresh token using client credentials
      await this.acquireTokenByClientCredentials(targetMailbox);
      
      const client = await this.getGraphClient();
      const scopeChecks = { read: false, readWrite: false };
      const details: any = { targetMailbox };

      // Test Mail.Read permission
      try {
        const readTest = await client
          .api(`/users/${targetMailbox}/messages`)
          .top(1)
          .select("id,subject")
          .get();
        
        scopeChecks.read = true;
        details.readTest = { success: true, messageCount: readTest.value?.length || 0 };
      } catch (readError: any) {
        if (readError.code === "ResourceNotFound") {
          details.readTest = { 
            success: false, 
            error: `Mailbox '${targetMailbox}' not found or not accessible`,
            code: readError.code 
          };
        } else if (readError.code === "Authorization_RequestDenied") {
          details.readTest = { 
            success: false, 
            error: "Mail.Read permission not granted or admin consent missing",
            code: readError.code 
          };
        } else {
          details.readTest = { 
            success: false, 
            error: readError.message,
            code: readError.code 
          };
        }
      }

      // Test Mail.ReadWrite permission
      try {
        // Create a test message in drafts
        const draftMessage = {
          subject: "[App Permission Test] Azure Verification",
          body: {
            contentType: "Text",
            content: "This is an automated test message to verify Mail.ReadWrite application permissions."
          },
          toRecipients: []
        };

        const draft = await client
          .api(`/users/${targetMailbox}/messages`)
          .post(draftMessage);

        // Delete the draft immediately
        if (draft && draft.id) {
          await client
            .api(`/users/${targetMailbox}/messages/${draft.id}`)
            .delete();
          
          scopeChecks.readWrite = true;
          details.readWriteTest = { success: true, method: "draft_create_delete" };
        }
      } catch (writeError: any) {
        if (writeError.code === "Authorization_RequestDenied") {
          details.readWriteTest = { 
            success: false, 
            error: "Mail.ReadWrite permission not granted or admin consent missing",
            code: writeError.code 
          };
        } else {
          // Fallback: Try to update isRead flag
          try {
            const messages = await client
              .api(`/users/${targetMailbox}/messages`)
              .top(1)
              .select("id,isRead")
              .get();
            
            if (messages.value && messages.value.length > 0) {
              const messageId = messages.value[0].id;
              const currentReadStatus = messages.value[0].isRead;
              
              await client
                .api(`/users/${targetMailbox}/messages/${messageId}`)
                .patch({ isRead: !currentReadStatus });
              
              // Restore original status
              await client
                .api(`/users/${targetMailbox}/messages/${messageId}`)
                .patch({ isRead: currentReadStatus });
              
              scopeChecks.readWrite = true;
              details.readWriteTest = { success: true, method: "update_read_status" };
            }
          } catch (fallbackError: any) {
            details.readWriteTest = { 
              success: false, 
              error: fallbackError.message || writeError.message,
              code: fallbackError.code || writeError.code 
            };
          }
        }
      }

      return {
        success: scopeChecks.read && scopeChecks.readWrite,
        scopeChecks,
        details
      };
    } catch (error: any) {
      return {
        success: false,
        scopeChecks: { read: false, readWrite: false },
        error: error.message || "Application verification failed"
      };
    }
  }
}

// Export singleton instance
export const microsoftAuth = new MicrosoftAuthService();
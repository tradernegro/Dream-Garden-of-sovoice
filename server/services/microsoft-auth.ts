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
];

export class MicrosoftAuthService {
  private msalClient: ConfidentialClientApplication;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor() {
    this.msalClient = new ConfidentialClientApplication(msalConfig);
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

  // Exchange authorization code for access token
  async acquireTokenByCode(code: string, redirectUri: string): Promise<string> {
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
        return response.accessToken;
      }
      throw new Error("No access token received");
    } catch (error) {
      console.error("Error acquiring token:", error);
      throw new Error("Failed to acquire access token");
    }
  }

  // Get or refresh access token
  async getAccessToken(): Promise<string> {
    // Check if token exists and is still valid
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    // Try to get token from refresh token (if available)
    try {
      const silentRequest = {
        scopes: SCOPES,
        account: await this.msalClient.getTokenCache().getAllAccounts().then(accounts => accounts[0]),
      };

      if (silentRequest.account) {
        const response = await this.msalClient.acquireTokenSilent(silentRequest);
        if (response && response.accessToken) {
          this.accessToken = response.accessToken;
          this.tokenExpiry = response.expiresOn || null;
          return response.accessToken;
        }
      }
    } catch (error) {
      console.error("Failed to refresh token silently:", error);
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
      
      let endpoint = "/me/mailFolders";
      
      // Map folder names to Graph API endpoints
      switch (folder.toLowerCase()) {
        case "inbox":
          endpoint = "/me/mailFolders/inbox/messages";
          break;
        case "sent":
          endpoint = "/me/mailFolders/sentitems/messages";
          break;
        case "drafts":
          endpoint = "/me/mailFolders/drafts/messages";
          break;
        case "archive":
          endpoint = "/me/mailFolders/archive/messages";
          break;
        case "trash":
          endpoint = "/me/mailFolders/deleteditems/messages";
          break;
        default:
          endpoint = "/me/messages";
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
}

// Export singleton instance
export const microsoftAuth = new MicrosoftAuthService();
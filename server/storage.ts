import { 
  type Call, type InsertCall,
  type Agent, type InsertAgent,
  type Setting, type InsertSetting,
  type User, type InsertUser,
  type Transcript, type InsertTranscript,
  type ChatMessage, type InsertChatMessage,
  type ChatSession, type InsertChatSession,
  type ApiKey, type InsertApiKey
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods (legacy)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Call methods
  getCalls(limit?: number): Promise<Call[]>;
  getCall(id: string): Promise<Call | undefined>;
  getCallByTwilioSid(twilioSid: string): Promise<Call | undefined>;
  createCall(call: InsertCall): Promise<Call>;
  updateCall(id: string, call: Partial<InsertCall>): Promise<Call | undefined>;
  deleteCall(id: string): Promise<boolean>;
  
  // Agent methods
  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  getActiveAgent(): Promise<Agent | undefined>;
  getSystemAgent(name: string): Promise<Agent | undefined>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgent(id: string, agent: Partial<InsertAgent>): Promise<Agent | undefined>;
  deleteAgent(id: string): Promise<boolean>;
  
  // Transcript methods
  getTranscripts(callId: string): Promise<Transcript[]>;
  createTranscript(transcript: InsertTranscript): Promise<Transcript>;
  
  // Settings methods
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: any): Promise<Setting>;
  
  // Chat session methods
  getChatSessions(limit?: number): Promise<ChatSession[]>;
  getChatSession(id: string): Promise<ChatSession | undefined>;
  createChatSession(session: InsertChatSession): Promise<ChatSession>;
  updateChatSession(id: string, session: Partial<InsertChatSession>): Promise<ChatSession | undefined>;
  deleteChatSession(id: string): Promise<boolean>;
  
  // Chat message methods
  getChatMessages(sessionId?: string, limit?: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  deleteChatMessages(sessionId: string): Promise<boolean>;
  
  // API Key methods
  getApiKeys(): Promise<ApiKey[]>;
  getApiKey(id: string): Promise<ApiKey | undefined>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  deleteApiKey(id: string): Promise<boolean>;
  updateApiKeyLastUsed(id: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private calls: Map<string, Call>;
  private agents: Map<string, Agent>;
  private settings: Map<string, Setting>;
  private transcripts: Map<string, Transcript>;
  private chatSessions: Map<string, ChatSession>;
  private chatMessages: Map<string, ChatMessage>;
  private apiKeys: Map<string, ApiKey>;

  constructor() {
    this.users = new Map();
    this.calls = new Map();
    this.agents = new Map();
    this.settings = new Map();
    this.transcripts = new Map();
    this.chatSessions = new Map();
    this.chatMessages = new Map();
    this.apiKeys = new Map();
    
    // Default agent will be added if no system agent is loaded
    // (see loadSystemAgentsFromDatabase in index.ts)
  }

  // Method to load an agent into memory (used by initialization)
  async loadAgentIntoMemory(agent: Agent): Promise<void> {
    this.agents.set(agent.id, agent);
    console.log(`[MemStorage] Loaded ${agent.name} into memory`);
  }

  // Create default fallback agent if no system agents exist
  async ensureDefaultAgent(): Promise<void> {
    if (this.agents.size > 0) return;

    const defaultAgentId = randomUUID();
    this.agents.set(defaultAgentId, {
      id: defaultAgentId,
      name: "Customer Support Agent",
      description: "Friendly AI assistant for customer support",
      prompt: "You are a helpful customer support assistant. Be friendly, professional, and assist customers with their inquiries.",
      voiceProvider: "openai",
      voice: "alloy",
      temperature: 10,
      isActive: 1,
      isSystem: 0,
      language: "en",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("[MemStorage] Created default fallback agent");
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Call methods
  async getCalls(limit?: number): Promise<Call[]> {
    const allCalls = Array.from(this.calls.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return limit ? allCalls.slice(0, limit) : allCalls;
  }

  async getCall(id: string): Promise<Call | undefined> {
    return this.calls.get(id);
  }

  async createCall(insertCall: InsertCall): Promise<Call> {
    const id = randomUUID();
    const call: Call = {
      phoneNumber: insertCall.phoneNumber,
      direction: insertCall.direction,
      status: insertCall.status,
      duration: insertCall.duration ?? null,
      recording: insertCall.recording ?? null,
      transcript: insertCall.transcript ?? null,
      agentId: insertCall.agentId ?? null,
      tags: insertCall.tags ?? null,
      metadata: insertCall.metadata ?? null,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.calls.set(id, call);
    return call;
  }

  async updateCall(id: string, updateData: Partial<InsertCall>): Promise<Call | undefined> {
    const call = this.calls.get(id);
    if (!call) return undefined;

    const updatedCall: Call = {
      ...call,
      ...updateData,
      updatedAt: new Date(),
    };
    this.calls.set(id, updatedCall);
    return updatedCall;
  }

  async deleteCall(id: string): Promise<boolean> {
    return this.calls.delete(id);
  }

  async getCallByTwilioSid(twilioSid: string): Promise<Call | undefined> {
    return Array.from(this.calls.values()).find(
      (call) => call.metadata && (call.metadata as any).twilioSid === twilioSid
    );
  }

  // Agent methods
  async getAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    return this.agents.get(id);
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    const id = randomUUID();
    const agent: Agent = {
      name: insertAgent.name,
      description: insertAgent.description ?? null,
      prompt: insertAgent.prompt,
      voiceProvider: insertAgent.voiceProvider ?? "openai",
      voice: insertAgent.voice ?? "alloy",
      temperature: insertAgent.temperature ?? null,
      isActive: insertAgent.isActive ?? 1,
      isSystem: 0, // Regular agents are never system agents (only set via DB initialization)
      language: insertAgent.language ?? null,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.agents.set(id, agent);
    return agent;
  }

  async updateAgent(id: string, updateData: Partial<InsertAgent>): Promise<Agent | undefined> {
    const agent = this.agents.get(id);
    if (!agent) return undefined;

    const updatedAgent: Agent = {
      ...agent,
      ...updateData,
      updatedAt: new Date(),
    };
    this.agents.set(id, updatedAgent);
    return updatedAgent;
  }

  async deleteAgent(id: string): Promise<boolean> {
    // Protect system agents from deletion (defense in depth)
    const agent = this.agents.get(id);
    if (agent?.isSystem === 1) {
      throw new Error("System agents cannot be deleted");
    }
    return this.agents.delete(id);
  }

  async getActiveAgent(): Promise<Agent | undefined> {
    return Array.from(this.agents.values()).find(
      (agent) => agent.isActive === 1
    );
  }

  async getSystemAgent(name: string): Promise<Agent | undefined> {
    return Array.from(this.agents.values()).find(
      (agent) => agent.isSystem === 1 && agent.name === name
    );
  }

  // Transcript methods
  async getTranscripts(callId: string): Promise<Transcript[]> {
    return Array.from(this.transcripts.values())
      .filter((t) => t.callId === callId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async createTranscript(insertTranscript: InsertTranscript): Promise<Transcript> {
    const id = randomUUID();
    const transcript: Transcript = {
      callId: insertTranscript.callId,
      speaker: insertTranscript.speaker,
      text: insertTranscript.text,
      timestamp: insertTranscript.timestamp || new Date(),
      id,
      createdAt: new Date(),
    };
    this.transcripts.set(id, transcript);
    return transcript;
  }

  // Settings methods
  async getSetting(key: string): Promise<Setting | undefined> {
    return this.settings.get(key);
  }

  async setSetting(key: string, value: any): Promise<Setting> {
    const existing = this.settings.get(key);
    const setting: Setting = {
      id: existing?.id || randomUUID(),
      key,
      value,
      updatedAt: new Date(),
    };
    this.settings.set(key, setting);
    return setting;
  }

  // Chat session methods
  async getChatSessions(limit?: number): Promise<ChatSession[]> {
    let sessions = Array.from(this.chatSessions.values());
    
    // Sort by most recent first
    sessions = sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    
    // Apply limit if provided
    if (limit) {
      sessions = sessions.slice(0, limit);
    }
    
    return sessions;
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    return this.chatSessions.get(id);
  }

  async createChatSession(insertSession: InsertChatSession): Promise<ChatSession> {
    const id = randomUUID();
    const session: ChatSession = {
      id,
      title: insertSession.title ?? "New Chat",
      agentId: insertSession.agentId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.chatSessions.set(id, session);
    return session;
  }

  async updateChatSession(id: string, updateData: Partial<InsertChatSession>): Promise<ChatSession | undefined> {
    const existing = this.chatSessions.get(id);
    if (!existing) return undefined;
    
    const updated: ChatSession = {
      ...existing,
      ...updateData,
      updatedAt: new Date(),
    };
    this.chatSessions.set(id, updated);
    return updated;
  }

  async deleteChatSession(id: string): Promise<boolean> {
    const existed = this.chatSessions.has(id);
    if (existed) {
      this.chatSessions.delete(id);
      // Also delete associated messages
      await this.deleteChatMessages(id);
    }
    return existed;
  }

  // Chat message methods
  async getChatMessages(sessionId?: string, limit?: number): Promise<ChatMessage[]> {
    let messages = Array.from(this.chatMessages.values());
    
    // Filter by session if provided
    if (sessionId) {
      messages = messages.filter((m) => m.sessionId === sessionId);
    }
    
    // Sort by creation time (oldest first for chat history)
    messages = messages.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    // Apply limit if provided
    if (limit) {
      messages = messages.slice(-limit); // Get last N messages
    }
    
    return messages;
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = randomUUID();
    const message: ChatMessage = {
      id,
      sessionId: insertMessage.sessionId ?? null,
      role: insertMessage.role,
      content: insertMessage.content,
      metadata: insertMessage.metadata ?? null,
      createdAt: new Date(),
    };
    this.chatMessages.set(id, message);
    return message;
  }

  async deleteChatMessages(sessionId: string): Promise<boolean> {
    const messagesToDelete = Array.from(this.chatMessages.values())
      .filter((m) => m.sessionId === sessionId);
    
    messagesToDelete.forEach((m) => this.chatMessages.delete(m.id));
    return messagesToDelete.length > 0;
  }

  // API Key methods
  async getApiKeys(): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    return this.apiKeys.get(id);
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    return Array.from(this.apiKeys.values()).find(
      (key) => key.keyHash === keyHash
    );
  }

  async createApiKey(insertApiKey: InsertApiKey): Promise<ApiKey> {
    const id = randomUUID();
    const apiKey: ApiKey = {
      id,
      name: insertApiKey.name,
      keyHash: insertApiKey.keyHash,
      keyPrefix: insertApiKey.keyPrefix,
      lastUsedAt: null,
      expiresAt: insertApiKey.expiresAt ?? null,
      createdAt: new Date(),
    };
    this.apiKeys.set(id, apiKey);
    return apiKey;
  }

  async deleteApiKey(id: string): Promise<boolean> {
    return this.apiKeys.delete(id);
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    const apiKey = this.apiKeys.get(id);
    if (apiKey) {
      apiKey.lastUsedAt = new Date();
      this.apiKeys.set(id, apiKey);
    }
  }
}

export const storage = new MemStorage();

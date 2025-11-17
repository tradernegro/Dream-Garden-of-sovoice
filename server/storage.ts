import { 
  type Call, type InsertCall,
  type Agent, type InsertAgent,
  type Setting, type InsertSetting,
  type User, type InsertUser 
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
  createCall(call: InsertCall): Promise<Call>;
  updateCall(id: string, call: Partial<InsertCall>): Promise<Call | undefined>;
  deleteCall(id: string): Promise<boolean>;
  
  // Agent methods
  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgent(id: string, agent: Partial<InsertAgent>): Promise<Agent | undefined>;
  deleteAgent(id: string): Promise<boolean>;
  
  // Settings methods
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: any): Promise<Setting>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private calls: Map<string, Call>;
  private agents: Map<string, Agent>;
  private settings: Map<string, Setting>;

  constructor() {
    this.users = new Map();
    this.calls = new Map();
    this.agents = new Map();
    this.settings = new Map();
    
    // Create a default agent
    const defaultAgentId = randomUUID();
    this.agents.set(defaultAgentId, {
      id: defaultAgentId,
      name: "Customer Support Agent",
      description: "Friendly AI assistant for customer support",
      prompt: "You are a helpful customer support assistant. Be friendly, professional, and assist customers with their inquiries.",
      voice: "alloy",
      temperature: 10,
      isActive: 1,
      language: "en",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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
      voice: insertAgent.voice ?? "alloy",
      temperature: insertAgent.temperature ?? null,
      isActive: insertAgent.isActive ?? 1,
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
    return this.agents.delete(id);
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
}

export const storage = new MemStorage();

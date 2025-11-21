import { db } from './db';
import { eq, desc, and, or, sql as sqlQuery } from 'drizzle-orm';
import { 
  type Call, type InsertCall,
  type Agent, type InsertAgent, 
  type Setting, type InsertSetting,
  type User, type InsertUser,
  type Transcript, type InsertTranscript,
  type ChatMessage, type InsertChatMessage,
  type ChatSession, type InsertChatSession,
  type ApiKey, type InsertApiKey,
  type Project, type InsertProject,
  type ProjectPipeline, type InsertProjectPipeline,
  type ProjectWorkflow, type InsertProjectWorkflow,
  type ProjectAgent, type InsertProjectAgent,
  type ProjectApiKey, type InsertProjectApiKey,
  calls,
  agents,
  settings,
  users,
  transcripts,
  chatSessions,
  chatMessages,
  apiKeys,
  projects,
  projectPipelines,
  projectWorkflows,
  projectAgents,
  projectApiKeys
} from "@shared/schema";

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
  
  // Project methods
  getProjects(limit?: number): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  
  // Project Pipeline methods
  getProjectPipelines(projectId: string): Promise<ProjectPipeline[]>;
  createProjectPipeline(pipeline: InsertProjectPipeline): Promise<ProjectPipeline>;
  updateProjectPipeline(id: string, pipeline: Partial<InsertProjectPipeline>): Promise<ProjectPipeline | undefined>;
  deleteProjectPipeline(id: string): Promise<boolean>;
  
  // Project Workflow methods
  getProjectWorkflows(projectId: string): Promise<ProjectWorkflow[]>;
  createProjectWorkflow(workflow: InsertProjectWorkflow): Promise<ProjectWorkflow>;
  updateProjectWorkflow(id: string, workflow: Partial<InsertProjectWorkflow>): Promise<ProjectWorkflow | undefined>;
  deleteProjectWorkflow(id: string): Promise<boolean>;
  
  // Project Agent methods
  getProjectAgents(projectId: string): Promise<ProjectAgent[]>;
  addAgentToProject(projectAgent: InsertProjectAgent): Promise<ProjectAgent>;
  removeAgentFromProject(projectId: string, agentId: string): Promise<boolean>;
  
  // Project API Key methods
  getProjectApiKeys(projectId: string): Promise<ProjectApiKey[]>;
  addApiKeyToProject(projectApiKey: InsertProjectApiKey): Promise<ProjectApiKey>;
  removeApiKeyFromProject(projectId: string, apiKeyId: string): Promise<boolean>;
}

export class DbStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting user:', error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting user by username:', error);
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const result = await db.insert(users).values(insertUser).returning();
      console.log('[DbStorage] Created user:', result[0].username);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error creating user:', error);
      throw error;
    }
  }

  // Call methods
  async getCalls(limit?: number): Promise<Call[]> {
    try {
      let query = db.select().from(calls).orderBy(desc(calls.createdAt));
      if (limit) {
        query = query.limit(limit) as any;
      }
      const result = await query;
      return result;
    } catch (error) {
      console.error('[DbStorage] Error getting calls:', error);
      return [];
    }
  }

  async getCall(id: string): Promise<Call | undefined> {
    try {
      const result = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting call:', error);
      return undefined;
    }
  }

  async getCallByTwilioSid(twilioSid: string): Promise<Call | undefined> {
    try {
      const result = await db.select().from(calls)
        .where(sqlQuery`${calls.metadata}->>'twilioSid' = ${twilioSid}`)
        .limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting call by Twilio SID:', error);
      return undefined;
    }
  }

  async createCall(insertCall: InsertCall): Promise<Call> {
    try {
      const result = await db.insert(calls).values(insertCall).returning();
      console.log('[DbStorage] Created call:', result[0].id);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error creating call:', error);
      throw error;
    }
  }

  async updateCall(id: string, updateData: Partial<InsertCall>): Promise<Call | undefined> {
    try {
      const result = await db.update(calls)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(calls.id, id))
        .returning();
      
      if (result.length > 0) {
        console.log('[DbStorage] Updated call:', id);
      }
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error updating call:', error);
      return undefined;
    }
  }

  async deleteCall(id: string): Promise<boolean> {
    try {
      const result = await db.delete(calls).where(eq(calls.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error('[DbStorage] Error deleting call:', error);
      return false;
    }
  }

  // Agent methods
  async getAgents(): Promise<Agent[]> {
    try {
      const result = await db.select().from(agents).orderBy(desc(agents.createdAt));
      return result;
    } catch (error) {
      console.error('[DbStorage] Error getting agents:', error);
      return [];
    }
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    try {
      const result = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting agent:', error);
      return undefined;
    }
  }

  async getActiveAgent(): Promise<Agent | undefined> {
    try {
      const result = await db.select().from(agents)
        .where(eq(agents.isActive, 1))
        .orderBy(desc(agents.createdAt))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting active agent:', error);
      return undefined;
    }
  }

  async getSystemAgent(name: string): Promise<Agent | undefined> {
    try {
      const result = await db.select().from(agents)
        .where(and(
          eq(agents.isSystem, 1),
          eq(agents.name, name)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting system agent:', error);
      return undefined;
    }
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    try {
      const result = await db.insert(agents).values(insertAgent).returning();
      console.log('[DbStorage] Created agent:', result[0].name);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error creating agent:', error);
      throw error;
    }
  }

  async updateAgent(id: string, updateData: Partial<InsertAgent>): Promise<Agent | undefined> {
    try {
      const result = await db.update(agents)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(agents.id, id))
        .returning();
      
      if (result.length > 0) {
        console.log('[DbStorage] Updated agent:', id);
      }
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error updating agent:', error);
      return undefined;
    }
  }

  async deleteAgent(id: string): Promise<boolean> {
    try {
      // Check if system agent
      const agent = await this.getAgent(id);
      if (agent?.isSystem) {
        console.warn('[DbStorage] Cannot delete system agent:', id);
        return false;
      }

      const result = await db.delete(agents).where(eq(agents.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error('[DbStorage] Error deleting agent:', error);
      return false;
    }
  }

  // Transcript methods
  async getTranscripts(callId: string): Promise<Transcript[]> {
    try {
      const result = await db.select().from(transcripts)
        .where(eq(transcripts.callId, callId))
        .orderBy(transcripts.timestamp);
      return result;
    } catch (error) {
      console.error('[DbStorage] Error getting transcripts:', error);
      return [];
    }
  }

  async createTranscript(insertTranscript: InsertTranscript): Promise<Transcript> {
    try {
      const result = await db.insert(transcripts).values(insertTranscript).returning();
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error creating transcript:', error);
      throw error;
    }
  }

  // Settings methods
  async getSetting(key: string): Promise<Setting | undefined> {
    try {
      const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting setting:', error);
      return undefined;
    }
  }

  async setSetting(key: string, value: any): Promise<Setting> {
    try {
      // Try to update existing setting first
      const existing = await this.getSetting(key);
      
      if (existing) {
        const result = await db.update(settings)
          .set({
            value: value,
            updatedAt: new Date()
          })
          .where(eq(settings.key, key))
          .returning();
        return result[0];
      } else {
        // Insert new setting
        const result = await db.insert(settings)
          .values({
            key: key,
            value: value
          })
          .returning();
        console.log('[DbStorage] Created setting:', key);
        return result[0];
      }
    } catch (error) {
      console.error('[DbStorage] Error setting value:', error);
      throw error;
    }
  }

  // Chat session methods
  async getChatSessions(limit?: number): Promise<ChatSession[]> {
    try {
      let query = db.select().from(chatSessions).orderBy(desc(chatSessions.updatedAt));
      if (limit) {
        query = query.limit(limit) as any;
      }
      const result = await query;
      return result;
    } catch (error) {
      console.error('[DbStorage] Error getting chat sessions:', error);
      return [];
    }
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    try {
      const result = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting chat session:', error);
      return undefined;
    }
  }

  async createChatSession(insertSession: InsertChatSession): Promise<ChatSession> {
    try {
      const result = await db.insert(chatSessions).values(insertSession).returning();
      console.log('[DbStorage] Created chat session:', result[0].id);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error creating chat session:', error);
      throw error;
    }
  }

  async updateChatSession(id: string, updateData: Partial<InsertChatSession>): Promise<ChatSession | undefined> {
    try {
      const result = await db.update(chatSessions)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(chatSessions.id, id))
        .returning();
      
      if (result.length > 0) {
        console.log('[DbStorage] Updated chat session:', id);
      }
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error updating chat session:', error);
      return undefined;
    }
  }

  async deleteChatSession(id: string): Promise<boolean> {
    try {
      const result = await db.delete(chatSessions).where(eq(chatSessions.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error('[DbStorage] Error deleting chat session:', error);
      return false;
    }
  }

  // Chat message methods
  async getChatMessages(sessionId?: string, limit?: number): Promise<ChatMessage[]> {
    try {
      let query = db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt));
      
      if (sessionId) {
        query = query.where(eq(chatMessages.sessionId, sessionId)) as any;
      }
      
      if (limit) {
        query = query.limit(limit) as any;
      }
      
      const result = await query;
      return result;
    } catch (error) {
      console.error('[DbStorage] Error getting chat messages:', error);
      return [];
    }
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    try {
      const result = await db.insert(chatMessages).values(insertMessage).returning();
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error creating chat message:', error);
      throw error;
    }
  }

  async deleteChatMessages(sessionId: string): Promise<boolean> {
    try {
      const result = await db.delete(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('[DbStorage] Error deleting chat messages:', error);
      return false;
    }
  }

  // API Key methods
  async getApiKeys(): Promise<ApiKey[]> {
    try {
      const result = await db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
      return result;
    } catch (error) {
      console.error('[DbStorage] Error getting API keys:', error);
      return [];
    }
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    try {
      const result = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting API key:', error);
      return undefined;
    }
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    try {
      const result = await db.select().from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting API key by hash:', error);
      return undefined;
    }
  }

  async createApiKey(insertApiKey: InsertApiKey): Promise<ApiKey> {
    try {
      const result = await db.insert(apiKeys).values(insertApiKey).returning();
      console.log('[DbStorage] Created API key:', result[0].name);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error creating API key:', error);
      throw error;
    }
  }

  async deleteApiKey(id: string): Promise<boolean> {
    try {
      const result = await db.delete(apiKeys).where(eq(apiKeys.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error('[DbStorage] Error deleting API key:', error);
      return false;
    }
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    try {
      await db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, id));
    } catch (error) {
      console.error('[DbStorage] Error updating API key last used:', error);
    }
  }

  // Project methods
  async getProjects(limit?: number): Promise<Project[]> {
    try {
      let query = db.select().from(projects).orderBy(desc(projects.createdAt));
      if (limit) {
        query = query.limit(limit) as any;
      }
      const result = await query;
      return result;
    } catch (error) {
      console.error('[DbStorage] Error getting projects:', error);
      return [];
    }
  }

  async getProject(id: string): Promise<Project | undefined> {
    try {
      const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error getting project:', error);
      return undefined;
    }
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    try {
      const result = await db.insert(projects).values(insertProject).returning();
      console.log('[DbStorage] Created project:', result[0].name);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error creating project:', error);
      throw error;
    }
  }

  async updateProject(id: string, updateData: Partial<InsertProject>): Promise<Project | undefined> {
    try {
      const result = await db.update(projects)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(projects.id, id))
        .returning();
      
      if (result.length > 0) {
        console.log('[DbStorage] Updated project:', id);
      }
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error updating project:', error);
      return undefined;
    }
  }

  async deleteProject(id: string): Promise<boolean> {
    try {
      // Cascade deletes are handled by database foreign key constraints
      const result = await db.delete(projects).where(eq(projects.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error('[DbStorage] Error deleting project:', error);
      return false;
    }
  }

  // Project Pipeline methods
  async getProjectPipelines(projectId: string): Promise<ProjectPipeline[]> {
    try {
      const result = await db.select().from(projectPipelines)
        .where(eq(projectPipelines.projectId, projectId))
        .orderBy(projectPipelines.order);
      return result;
    } catch (error) {
      console.error('[DbStorage] Error getting project pipelines:', error);
      return [];
    }
  }

  async createProjectPipeline(insertPipeline: InsertProjectPipeline): Promise<ProjectPipeline> {
    try {
      const result = await db.insert(projectPipelines).values(insertPipeline).returning();
      console.log('[DbStorage] Created project pipeline:', result[0].name);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error creating project pipeline:', error);
      throw error;
    }
  }

  async updateProjectPipeline(id: string, updateData: Partial<InsertProjectPipeline>): Promise<ProjectPipeline | undefined> {
    try {
      const result = await db.update(projectPipelines)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(projectPipelines.id, id))
        .returning();
      
      if (result.length > 0) {
        console.log('[DbStorage] Updated project pipeline:', id);
      }
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error updating project pipeline:', error);
      return undefined;
    }
  }

  async deleteProjectPipeline(id: string): Promise<boolean> {
    try {
      const result = await db.delete(projectPipelines).where(eq(projectPipelines.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error('[DbStorage] Error deleting project pipeline:', error);
      return false;
    }
  }

  // Project Workflow methods
  async getProjectWorkflows(projectId: string): Promise<ProjectWorkflow[]> {
    try {
      const result = await db.select().from(projectWorkflows)
        .where(eq(projectWorkflows.projectId, projectId))
        .orderBy(desc(projectWorkflows.createdAt));
      return result;
    } catch (error) {
      console.error('[DbStorage] Error getting project workflows:', error);
      return [];
    }
  }

  async createProjectWorkflow(insertWorkflow: InsertProjectWorkflow): Promise<ProjectWorkflow> {
    try {
      const result = await db.insert(projectWorkflows).values(insertWorkflow).returning();
      console.log('[DbStorage] Created project workflow:', result[0].name);
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error creating project workflow:', error);
      throw error;
    }
  }

  async updateProjectWorkflow(id: string, updateData: Partial<InsertProjectWorkflow>): Promise<ProjectWorkflow | undefined> {
    try {
      const result = await db.update(projectWorkflows)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(projectWorkflows.id, id))
        .returning();
      
      if (result.length > 0) {
        console.log('[DbStorage] Updated project workflow:', id);
      }
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error updating project workflow:', error);
      return undefined;
    }
  }

  async deleteProjectWorkflow(id: string): Promise<boolean> {
    try {
      const result = await db.delete(projectWorkflows).where(eq(projectWorkflows.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error('[DbStorage] Error deleting project workflow:', error);
      return false;
    }
  }

  // Project Agent methods
  async getProjectAgents(projectId: string): Promise<ProjectAgent[]> {
    try {
      const result = await db.select().from(projectAgents)
        .where(eq(projectAgents.projectId, projectId))
        .orderBy(desc(projectAgents.priority));
      return result;
    } catch (error) {
      console.error('[DbStorage] Error getting project agents:', error);
      return [];
    }
  }

  async addAgentToProject(insertProjectAgent: InsertProjectAgent): Promise<ProjectAgent> {
    try {
      const result = await db.insert(projectAgents).values(insertProjectAgent).returning();
      console.log('[DbStorage] Added agent to project');
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error adding agent to project:', error);
      throw error;
    }
  }

  async removeAgentFromProject(projectId: string, agentId: string): Promise<boolean> {
    try {
      const result = await db.delete(projectAgents)
        .where(and(
          eq(projectAgents.projectId, projectId),
          eq(projectAgents.agentId, agentId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('[DbStorage] Error removing agent from project:', error);
      return false;
    }
  }

  // Project API Key methods
  async getProjectApiKeys(projectId: string): Promise<ProjectApiKey[]> {
    try {
      const result = await db.select().from(projectApiKeys)
        .where(eq(projectApiKeys.projectId, projectId))
        .orderBy(desc(projectApiKeys.createdAt));
      return result;
    } catch (error) {
      console.error('[DbStorage] Error getting project API keys:', error);
      return [];
    }
  }

  async addApiKeyToProject(insertProjectApiKey: InsertProjectApiKey): Promise<ProjectApiKey> {
    try {
      const result = await db.insert(projectApiKeys).values(insertProjectApiKey).returning();
      console.log('[DbStorage] Added API key to project');
      return result[0];
    } catch (error) {
      console.error('[DbStorage] Error adding API key to project:', error);
      throw error;
    }
  }

  async removeApiKeyFromProject(projectId: string, apiKeyId: string): Promise<boolean> {
    try {
      const result = await db.delete(projectApiKeys)
        .where(and(
          eq(projectApiKeys.projectId, projectId),
          eq(projectApiKeys.apiKeyId, apiKeyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('[DbStorage] Error removing API key from project:', error);
      return false;
    }
  }
}

// Export a single instance of DbStorage for database persistence
export const storage = new DbStorage();
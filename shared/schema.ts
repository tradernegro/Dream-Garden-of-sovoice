import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Call statuses
export const callStatuses = ["queued", "in-progress", "completed", "failed", "no-answer"] as const;
export type CallStatus = typeof callStatuses[number];

// Call table
export const calls = pgTable("calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull(),
  direction: text("direction").notNull(), // "inbound" or "outbound"
  status: text("status").notNull(), // "queued", "in-progress", "completed", "failed", "no-answer"
  duration: integer("duration"), // in seconds
  recording: text("recording"), // URL or path to recording
  transcript: text("transcript"),
  agentId: varchar("agent_id").references(() => agents.id),
  tags: text("tags").array(), // ["lead", "complaint", "follow-up", etc.]
  metadata: jsonb("metadata"), // Additional call data
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCallSchema = createInsertSchema(calls).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Schema for updating calls - protects immutable fields
export const updateCallSchema = insertCallSchema.partial().omit({
  phoneNumber: true, // Phone number should not change after creation
  direction: true,    // Direction should not change after creation
});

export type InsertCall = z.infer<typeof insertCallSchema>;
export type UpdateCall = z.infer<typeof updateCallSchema>;
export type Call = typeof calls.$inferSelect;

// Agent configuration table
export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  prompt: text("prompt").notNull(), // System prompt for the AI
  voiceProvider: text("voice_provider").notNull().default("openai"), // "openai" or "elevenlabs"
  voice: text("voice").notNull().default("alloy"), // OpenAI voice name (alloy, echo, etc.) OR ElevenLabs voice ID
  temperature: integer("temperature").default(1), // 0-2, scaled by 10 (so 10 = 1.0)
  isActive: integer("is_active").notNull().default(1), // 1 = active, 0 = inactive (boolean)
  isSystem: integer("is_system").notNull().default(0), // 1 = system agent (cannot be deleted), 0 = regular agent
  language: text("language").default("en"), // Language code
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  isSystem: true, // Only server can set system agents, not clients
  createdAt: true,
  updatedAt: true,
});

// Schema for updating agents - all fields optional
export const updateAgentSchema = insertAgentSchema.partial();

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type UpdateAgent = z.infer<typeof updateAgentSchema>;
export type Agent = typeof agents.$inferSelect;

// Phone Numbers table (for Twilio phone number management)
export const phoneNumbers = pgTable("phone_numbers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull().unique(),
  friendlyName: text("friendly_name"),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }),
  capabilities: jsonb("capabilities").$type<{
    voice: boolean;
    sms: boolean;
    mms: boolean;
    fax: boolean;
  }>().default({ voice: true, sms: false, mms: false, fax: false }),
  status: text("status").notNull().default("active"), // active, inactive, suspended
  monthlyFee: decimal("monthly_fee", { precision: 10, scale: 2 }).default("0.00"),
  currency: text("currency").default("USD"),
  region: text("region"),
  countryCode: text("country_code"),
  voiceUrl: text("voice_url"),
  smsUrl: text("sms_url"),
  lastUsed: timestamp("last_used"),
  totalCalls: integer("total_calls").default(0),
  totalMinutes: integer("total_minutes").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPhoneNumberSchema = createInsertSchema(phoneNumbers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPhoneNumber = z.infer<typeof insertPhoneNumberSchema>;
export type PhoneNumber = typeof phoneNumbers.$inferSelect;

// Settings table (for global app settings)
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// Transcripts table (for storing conversation turns)
export const transcripts = pgTable("transcripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callId: varchar("call_id").notNull().references(() => calls.id, { onDelete: "cascade" }),
  speaker: text("speaker").notNull(), // "user" or "assistant"
  text: text("text").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTranscriptSchema = createInsertSchema(transcripts).omit({
  id: true,
  createdAt: true,
});

export type InsertTranscript = z.infer<typeof insertTranscriptSchema>;
export type Transcript = typeof transcripts.$inferSelect;

// Legacy user table (keeping for compatibility)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Chat sessions table for organizing conversations
export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull().default("New Chat"),
  agentId: varchar("agent_id").references(() => agents.id), // Optional: linked agent if created from chat
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateChatSessionSchema = insertChatSessionSchema.partial();

export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type UpdateChatSession = z.infer<typeof updateChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;

// Chat messages table for AI chat conversations
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => chatSessions.id, { onDelete: "cascade" }), // Link to session
  role: text("role").notNull(), // "user" or "assistant"
  content: text("content").notNull(),
  metadata: jsonb("metadata"), // Additional data (model, tokens, etc.)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// API Keys table for external integrations
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // User-friendly name like "Production API", "Development Key"
  keyHash: text("key_hash").notNull(), // SHA-256 hash of the actual key
  keyPrefix: text("key_prefix").notNull(), // First 8 chars for display (e.g., "sk_live_")
  lastUsedAt: timestamp("last_used_at"), // Track usage
  expiresAt: timestamp("expires_at"), // Optional expiration
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

// Projects - represents a customer with their complete setup
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  industry: text("industry"), // Industry or sector
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  status: text("status").notNull().default("active"), // active, paused, archived
  metadata: jsonb("metadata"), // Additional project data
  googleCalendarId: text("google_calendar_id"), // Google Calendar integration
  googleCalendarSettings: jsonb("google_calendar_settings"), // Calendar sync settings
  googleOAuthTokens: jsonb("google_oauth_tokens"), // Encrypted OAuth2 tokens (access, refresh)
  googleOAuthEmail: text("google_oauth_email"), // Email of connected Google account
  googleOAuthConnectedAt: timestamp("google_oauth_connected_at"), // When Google was connected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// Project Pipelines - sales/process stages for each project
export const projectPipelines = pgTable("project_pipelines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"), // Pipeline description
  order: integer("order").notNull(), // Display order
  color: text("color"), // UI color for the stage
  automations: jsonb("automations"), // Actions to trigger on stage entry
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectPipelineSchema = createInsertSchema(projectPipelines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectPipeline = z.infer<typeof insertProjectPipelineSchema>;
export type ProjectPipeline = typeof projectPipelines.$inferSelect;

// Project Workflows - automation sequences for each project
export const projectWorkflows = pgTable("project_workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"), // Workflow description
  type: text("type").notNull(), // call_handling, calendar_integration, data_sync, automation
  configuration: jsonb("configuration"), // Workflow configuration
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectWorkflowSchema = createInsertSchema(projectWorkflows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectWorkflow = z.infer<typeof insertProjectWorkflowSchema>;
export type ProjectWorkflow = typeof projectWorkflows.$inferSelect;

// Project Agents - many-to-many relationship between projects and agents
export const projectAgents = pgTable("project_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  role: text("role"), // primary, fallback, specialist
  priority: integer("priority").default(0), // Higher priority agents get calls first
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectAgentSchema = createInsertSchema(projectAgents).omit({
  id: true,
  createdAt: true,
});

export type InsertProjectAgent = z.infer<typeof insertProjectAgentSchema>;
export type ProjectAgent = typeof projectAgents.$inferSelect;

// Project API Keys - API keys specific to projects
export const projectApiKeys = pgTable("project_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  apiKeyId: varchar("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  permissions: jsonb("permissions"), // Specific permissions for this key in this project
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectApiKeySchema = createInsertSchema(projectApiKeys).omit({
  id: true,
  createdAt: true,
});

export type InsertProjectApiKey = z.infer<typeof insertProjectApiKeySchema>;
export type ProjectApiKey = typeof projectApiKeys.$inferSelect;

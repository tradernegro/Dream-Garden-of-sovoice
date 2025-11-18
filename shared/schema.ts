import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
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
  voice: text("voice").notNull().default("alloy"), // OpenAI Realtime voice: alloy, echo, shimmer, fable, onyx, nova (legacy), ash, ballad, coral, sage, verse, cedar, marin (new)
  temperature: integer("temperature").default(1), // 0-2, scaled by 10 (so 10 = 1.0)
  isActive: integer("is_active").notNull().default(1), // 1 = active, 0 = inactive (boolean)
  language: text("language").default("en"), // Language code
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Schema for updating agents - all fields optional
export const updateAgentSchema = insertAgentSchema.partial();

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type UpdateAgent = z.infer<typeof updateAgentSchema>;
export type Agent = typeof agents.$inferSelect;

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

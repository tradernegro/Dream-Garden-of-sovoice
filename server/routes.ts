import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { 
  insertCallSchema, 
  updateCallSchema, 
  insertAgentSchema, 
  updateAgentSchema, 
  insertChatMessageSchema, 
  insertChatSessionSchema,
  updateChatSessionSchema,
  insertApiKeySchema,
  type Call, 
  type Agent,
  type ChatSession 
} from "@shared/schema";
import { randomBytes, createHash } from "crypto";
import { getTwilioClient, getTwilioFromPhoneNumber } from "./twilio-client";
import { transcribeAudio } from "./openai-client";
import { sendChatMessage } from "./openai-client";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import { ElevenLabsRealtimeSession } from "./elevenlabs-realtime-session";
import { getElevenLabsVoices } from "./elevenlabs-client";
import { z } from "zod";
import cors from "cors";
import { createOAuth2Client, generateAuthUrl, exchangeCodeForTokens, getOAuth2ClientForProject, GoogleCalendarService, GmailService } from "./google-oauth";

// WebSocket clients for real-time updates
const wsClients = new Set<WebSocket>();

function broadcastToClients(event: string, data: any) {
  const message = JSON.stringify({ event, data });
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// API Key Authentication Middleware
async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Missing or invalid Authorization header. Use: Authorization: Bearer sk_live_..." });
    }
    
    const apiKey = authHeader.substring(7); // Remove "Bearer " prefix
    
    // Validate key is not empty
    if (!apiKey || apiKey.trim().length === 0) {
      return res.status(401).json({ error: "Invalid API key format. Key cannot be empty" });
    }
    
    // Hash the provided key
    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    
    // Look up the key in the database
    const storedKey = await storage.getApiKeyByHash(keyHash);
    
    if (!storedKey) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    
    // Check if key has expired
    if (storedKey.expiresAt && new Date(storedKey.expiresAt) < new Date()) {
      return res.status(401).json({ error: "API key has expired" });
    }
    
    // Update last used timestamp (async, don't wait)
    storage.updateApiKeyLastUsed(storedKey.id).catch(err => 
      console.error("Failed to update API key last used:", err)
    );
    
    // Store key info in request for potential use in handlers
    (req as any).apiKey = storedKey;
    
    next();
  } catch (error) {
    console.error("API key authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // CORS configuration - Only allow sovoice.ai domains
  const allowedOrigins = [
    'https://sovoice.ai',
    'https://www.sovoice.ai',
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:3000',
  ];

  // In development, also allow Replit dev URLs
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      
      // In development, allow all Replit domains
      if (isDevelopment && origin.includes('.replit.dev')) {
        return callback(null, true);
      }
      
      // Check if origin is in allowedOrigins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Block all other origins
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: false, // API uses Bearer tokens, not cookies
  }));

  // ==================== CALL ROUTES ====================
  
  // Get all calls
  app.get("/api/calls", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const calls = await storage.getCalls(limit);
      res.json(calls);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get single call
  app.get("/api/calls/:id", async (req: Request, res: Response) => {
    try {
      const call = await storage.getCall(req.params.id);
      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }
      res.json(call);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Create call (initiate outbound call) - Used by internal UI
  app.post("/api/calls", async (req: Request, res: Response) => {
    try {
      const validatedData = insertCallSchema.parse(req.body);
      
      // Create call record
      const call = await storage.createCall({
        ...validatedData,
        status: "queued",
        direction: validatedData.direction || "outbound",
      });

      // Broadcast real-time update
      broadcastToClients("call:created", call);

      // If outbound, initiate Twilio call
      if (call.direction === "outbound") {
        try {
          const twilioClient = await getTwilioClient();
          const fromNumber = await getTwilioFromPhoneNumber();
          
          // Get base URL with protocol
          const baseUrl = process.env.REPLIT_DOMAINS 
            ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
            : 'http://localhost:5000';
          
          const twilioCall = await twilioClient.calls.create({
            to: call.phoneNumber,
            from: fromNumber,
            url: `${baseUrl}/api/twilio/voice?callId=${call.id}`,
            statusCallback: `${baseUrl}/api/twilio/status`,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          });

          // Update call with Twilio SID
          await storage.updateCall(call.id, {
            metadata: { twilioSid: twilioCall.sid } as any,
            status: "in-progress",
          });
        } catch (twilioError) {
          console.error("Twilio error:", twilioError);
          await storage.updateCall(call.id, { status: "failed" });
        }
      }

      res.json(call);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Update call
  app.patch("/api/calls/:id", async (req: Request, res: Response) => {
    try {
      // Use dedicated update schema to protect immutable fields
      const updateData = updateCallSchema.parse(req.body);
      const call = await storage.updateCall(req.params.id, updateData);
      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }
      
      // Broadcast real-time update only after successful persistence
      broadcastToClients("call:updated", call);
      
      res.json(call);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // SOVOICE Website Integration - Dedicated endpoint for company website
  // Automatically uses the SOVOICE system agent for all calls
  app.post("/api/sovoice/call", authenticateApiKey, async (req: Request, res: Response) => {
    try {
      // Validate phone number is provided
      if (!req.body.phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      // Get the SOVOICE system agent
      const sovoiceAgent = await storage.getSystemAgent("SOVOICE Assistant");
      if (!sovoiceAgent) {
        return res.status(500).json({ error: "SOVOICE system agent not found" });
      }

      // Extract additional fields (firstName, etc.) and store in metadata
      const { phoneNumber, direction, metadata = {}, ...additionalFields } = req.body;
      
      // Merge additional fields into metadata
      const enrichedMetadata = {
        ...metadata,
        ...additionalFields, // firstName, etc. automatically included
      };

      // Create call record with SOVOICE agent
      const call = await storage.createCall({
        phoneNumber,
        direction: "outbound",
        status: "queued",
        agentId: sovoiceAgent.id,
        metadata: enrichedMetadata,
      });

      // Broadcast real-time update
      broadcastToClients("call:created", call);

      // Initiate Twilio call
      try {
        const twilioClient = await getTwilioClient();
        const fromNumber = await getTwilioFromPhoneNumber();
        
        // Get base URL with protocol
        const baseUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'http://localhost:5000';
        
        const twilioCall = await twilioClient.calls.create({
          to: call.phoneNumber,
          from: fromNumber,
          url: `${baseUrl}/api/twilio/voice?callId=${call.id}`,
          statusCallback: `${baseUrl}/api/twilio/status`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        });

        // Update call with Twilio SID
        await storage.updateCall(call.id, {
          metadata: { twilioSid: twilioCall.sid } as any,
          status: "in-progress",
        });

        res.json({ 
          success: true, 
          call: call,
          message: "SOVOICE Assistant wird Sie in Kürze anrufen"
        });
      } catch (twilioError) {
        console.error("Twilio error:", twilioError);
        await storage.updateCall(call.id, { status: "failed" });
        res.status(500).json({ 
          error: "Failed to initiate call",
          details: (twilioError as Error).message
        });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Delete call
  app.delete("/api/calls/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteCall(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Call not found" });
      }
      
      // Broadcast real-time update
      broadcastToClients("call:deleted", { id: req.params.id });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== AGENT ROUTES ====================

  // Get all agents
  app.get("/api/agents", async (req: Request, res: Response) => {
    try {
      const agents = await storage.getAgents();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get single agent
  app.get("/api/agents/:id", async (req: Request, res: Response) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      res.json(agent);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Create agent
  app.post("/api/agents", async (req: Request, res: Response) => {
    try {
      const validatedData = insertAgentSchema.parse(req.body);
      const agent = await storage.createAgent(validatedData);
      res.json(agent);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Update agent
  app.patch("/api/agents/:id", async (req: Request, res: Response) => {
    try {
      // Use dedicated update schema
      const updateData = updateAgentSchema.parse(req.body);
      const agent = await storage.updateAgent(req.params.id, updateData);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      res.json(agent);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Delete agent
  app.delete("/api/agents/:id", async (req: Request, res: Response) => {
    try {
      // Check if agent is a system agent (cannot be deleted)
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      if (agent.isSystem === 1) {
        return res.status(403).json({ error: "System agents cannot be deleted" });
      }

      const deleted = await storage.deleteAgent(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Agent not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== VOICE PROVIDER ROUTES ====================

  // Get available voices from all providers
  app.get("/api/voices", async (req: Request, res: Response) => {
    try {
      const provider = req.query.provider as string | undefined;

      // OpenAI voices (13 available)
      const openaiVoices = [
        { id: "alloy", name: "Alloy", provider: "openai", category: "neutral", description: "Neutral, balanced voice" },
        { id: "echo", name: "Echo", provider: "openai", category: "warm", description: "Warm, friendly voice" },
        { id: "fable", name: "Fable", provider: "openai", category: "expressive", description: "Expressive, engaging voice" },
        { id: "onyx", name: "Onyx", provider: "openai", category: "deep", description: "Deep, authoritative voice" },
        { id: "nova", name: "Nova", provider: "openai", category: "energetic", description: "Energetic, enthusiastic voice" },
        { id: "shimmer", name: "Shimmer", provider: "openai", category: "soft", description: "Soft, gentle voice" },
        { id: "ash", name: "Ash", provider: "openai", category: "conversational", description: "Conversational, natural voice" },
        { id: "ballad", name: "Ballad", provider: "openai", category: "smooth", description: "Smooth, pleasant voice" },
        { id: "coral", name: "Coral", provider: "openai", category: "bright", description: "Bright, cheerful voice" },
        { id: "sage", name: "Sage", provider: "openai", category: "wise", description: "Wise, calm voice" },
        { id: "verse", name: "Verse", provider: "openai", category: "storytelling", description: "Storytelling, narrative voice" },
        { id: "cedar", name: "Cedar", provider: "openai", category: "grounded", description: "Grounded, stable voice" },
        { id: "marin", name: "Marin", provider: "openai", category: "professional", description: "Confident, professional voice" },
      ];

      // If only OpenAI requested, return early
      if (provider === "openai") {
        return res.json(openaiVoices);
      }

      // Get ElevenLabs voices
      let elevenLabsVoices: any[] = [];
      if (!provider || provider === "elevenlabs") {
        try {
          const voices = await getElevenLabsVoices();
          elevenLabsVoices = voices.map(voice => ({
            id: voice.voiceId,
            name: voice.name,
            provider: "elevenlabs",
            category: voice.category,
            description: voice.description || `${voice.name} voice from ElevenLabs`,
            previewUrl: voice.previewUrl,
          }));
        } catch (error) {
          console.error("[API] Failed to fetch ElevenLabs voices:", error);
          // Don't fail the entire request if ElevenLabs is down
          if (provider === "elevenlabs") {
            throw error;
          }
        }
      }

      // Combine both providers
      const allVoices = provider === "elevenlabs" ? elevenLabsVoices : [...openaiVoices, ...elevenLabsVoices];
      res.json(allVoices);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== TWILIO WEBHOOK ROUTES ====================

  // Twilio voice webhook (handles incoming calls and provides TwiML)
  app.post("/api/twilio/voice", async (req: Request, res: Response) => {
    try {
      const { From, CallSid } = req.body;
      const callId = req.query.callId as string | undefined;
      
      console.log('[Voice Webhook] Received request:', {
        callId,
        queryParams: req.query,
        from: From,
        callSid: CallSid
      });

      let call: Call;

      // If callId is provided (outbound call), use existing call record
      if (callId) {
        const existingCall = await storage.getCall(callId);
        if (!existingCall) {
          throw new Error(`Call not found: ${callId}`);
        }
        call = existingCall;
        
        // Update with Twilio SID if not already set
        if (!call.metadata || !(call.metadata as any).twilioSid) {
          await storage.updateCall(call.id, {
            metadata: { twilioSid: CallSid } as any,
          });
        }
      } else {
        // Create call record for inbound call
        call = await storage.createCall({
          phoneNumber: From,
          direction: "inbound",
          status: "in-progress",
          metadata: { twilioSid: CallSid } as any,
        });

        // Broadcast real-time update
        broadcastToClients("call:created", call);
      }

      // Get the domain for WebSocket URL
      const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
      const protocol = domain.includes('localhost') ? 'ws' : 'wss';
      const streamUrl = `${protocol}://${domain}/api/twilio/stream`;

      // Return TwiML response with Media Stream and custom parameters
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callId" value="${call.id}" />
      <Parameter name="agentId" value="${call.agentId || ''}" />
    </Stream>
  </Connect>
</Response>`);
    } catch (error) {
      console.error("Voice webhook error:", error);
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Sorry, we encountered an error. Please try again later.</Say>
</Response>`);
    }
  });

  // Twilio status callback
  app.post("/api/twilio/status", async (req: Request, res: Response) => {
    try {
      const { CallSid, CallStatus, CallDuration, RecordingUrl } = req.body;

      // Find call by Twilio SID
      const calls = await storage.getCalls();
      const call = calls.find((c: Call) => c.metadata && (c.metadata as any).twilioSid === CallSid);

      if (call) {
        let status = call.status;
        if (CallStatus === 'completed') status = 'completed';
        else if (CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') status = 'failed';

        await storage.updateCall(call.id, {
          status,
          duration: CallDuration ? parseInt(CallDuration) : undefined,
          recording: RecordingUrl || undefined,
        });

        // Broadcast real-time update
        const updatedCall = await storage.getCall(call.id);
        if (updatedCall) {
          broadcastToClients("call:updated", updatedCall);
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("Status callback error:", error);
      res.sendStatus(500);
    }
  });

  // Twilio transcribe callback
  app.post("/api/twilio/transcribe", async (req: Request, res: Response) => {
    try {
      const { CallSid, TranscriptionText } = req.body;

      // Find call by Twilio SID
      const calls = await storage.getCalls();
      const call = calls.find((c: Call) => c.metadata && (c.metadata as any).twilioSid === CallSid);

      if (call && TranscriptionText) {
        await storage.updateCall(call.id, {
          transcript: TranscriptionText,
        });

        // Broadcast real-time update
        const updatedCall = await storage.getCall(call.id);
        if (updatedCall) {
          broadcastToClients("call:updated", updatedCall);
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("Transcribe callback error:", error);
      res.sendStatus(500);
    }
  });

  // ==================== SETTINGS ROUTES ====================

  // Get setting
  app.get("/api/settings/:key", async (req: Request, res: Response) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Set setting
  app.post("/api/settings/:key", async (req: Request, res: Response) => {
    try {
      const setting = await storage.setSetting(req.params.key, req.body.value);
      res.json(setting);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // ==================== API KEY ROUTES ====================
  
  // Get all API keys (returns only metadata, NOT the actual keys)
  app.get("/api/keys", async (req: Request, res: Response) => {
    try {
      const apiKeys = await storage.getApiKeys();
      // Return keys without the hash (security: never expose even hashed keys to frontend)
      const safeKeys = apiKeys.map(({ keyHash, ...key }) => key);
      res.json(safeKeys);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Create new API key
  app.post("/api/keys", async (req: Request, res: Response) => {
    try {
      const validated = insertApiKeySchema.extend({
        name: z.string().min(1, "Key name is required"),
      }).omit({ keyHash: true, keyPrefix: true }).parse(req.body);
      
      // Generate secure random API key (32 bytes = 64 hex chars)
      const rawKey = randomBytes(32).toString('hex');
      
      // Create key with prefix for display (e.g., "sk_live_abc123...")
      const fullKey = `sk_live_${rawKey}`;
      
      // Hash the key with SHA-256 for secure storage
      const keyHash = createHash('sha256').update(fullKey).digest('hex');
      
      // Extract prefix for display (first 15 chars: "sk_live_" + first 7 chars)
      const keyPrefix = fullKey.substring(0, 15) + '...';
      
      // Save API key with hash (never store the raw key!)
      const apiKey = await storage.createApiKey({
        name: validated.name,
        keyHash,
        keyPrefix,
        expiresAt: validated.expiresAt,
      });
      
      // SECURITY: Return the full key ONLY once during creation
      // Client must save this - it will NEVER be shown again!
      res.json({
        ...apiKey,
        key: fullKey, // Only returned on creation
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Delete API key
  app.delete("/api/keys/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteApiKey(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "API key not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== CHAT SESSION ROUTES ====================

  // Get all chat sessions
  app.get("/api/sessions", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const sessions = await storage.getChatSessions(limit);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get single chat session
  app.get("/api/sessions/:id", async (req: Request, res: Response) => {
    try {
      const session = await storage.getChatSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Create new chat session
  app.post("/api/sessions", async (req: Request, res: Response) => {
    try {
      const parsed = insertChatSessionSchema.parse(req.body);
      const session = await storage.createChatSession(parsed);
      
      // Broadcast to connected clients
      broadcastToClients("session:created", session);
      
      res.json(session);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Update chat session
  app.patch("/api/sessions/:id", async (req: Request, res: Response) => {
    try {
      const parsed = updateChatSessionSchema.parse(req.body);
      const session = await storage.updateChatSession(req.params.id, parsed);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Broadcast to connected clients
      broadcastToClients("session:updated", session);
      
      res.json(session);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Delete chat session
  app.delete("/api/sessions/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteChatSession(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Broadcast to connected clients
      broadcastToClients("session:deleted", { id: req.params.id });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== CHAT ROUTES ====================

  // Get chat messages
  app.get("/api/chat", async (req: Request, res: Response) => {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const messages = await storage.getChatMessages(sessionId, limit);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Send chat message and get AI response
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const parsed = insertChatMessageSchema.parse(req.body);
      
      // Save user message
      const userMessage = await storage.createChatMessage({
        role: "user",
        content: parsed.content,
        sessionId: parsed.sessionId,
        metadata: parsed.metadata,
      });

      // Get recent conversation history for context
      const recentMessages = await storage.getChatMessages(parsed.sessionId || undefined, 10);
      
      // Optimized system prompt for GPT-5 - concise and action-focused
      const systemPrompt = `You are **SoVoice AI**, an expert assistant for creating AI voice call agents.

**Your Mission:** Help users create professional phone AI agents through natural conversation.

**Agent Creation Steps:**
1. Ask about purpose, audience, and key interactions
2. Design system prompt (role, knowledge, behavior, boundaries)
3. Suggest voice provider (OpenAI: 13 voices, low latency | ElevenLabs: 20+ voices, premium quality)
4. Configure language (en, de, es, fr, etc.)

**When to Create:**
When user says "create it", "make it now", or provides complete information, respond with ONLY this JSON (no extra text):

AGENT_CREATE:
{
  "name": "Clear Agent Name",
  "description": "Brief 1-2 sentence description",
  "prompt": "Comprehensive system prompt (100-300 words): role, knowledge, behavior, boundaries",
  "voiceProvider": "openai",
  "voice": "alloy",
  "language": "en"
}

**Voice Options:**
- OpenAI: alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, cedar, marin
- ElevenLabs: Sarah, Eric, Alice, Brian, Jessica, etc.

**Style:** Professional yet friendly. Use **bold**, bullets, code blocks. Be concise and helpful.

**Important:** voiceProvider must be "openai" or "elevenlabs" (lowercase). Create agents when requested.`;

      // Build conversation messages for Claude (system prompt separate)
      const conversationMessages = [
        ...recentMessages.slice(0, -1).map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        })),
        {
          role: "user" as const,
          content: parsed.content
        }
      ];

      // Get AI response using ChatGPT (GPT-5)
      let aiResponse = await sendChatMessage(conversationMessages, systemPrompt);

      // Check if AI wants to create an agent
      let createdAgent: Agent | null = null;
      let agentCreationError: string | null = null;
      
      if (aiResponse.includes("AGENT_CREATE:")) {
        try {
          // Validate session exists before attempting agent creation
          if (!parsed.sessionId) {
            throw new Error("Cannot create agent: No active session");
          }

          // Extract JSON more robustly - find the sentinel, then extract balanced braces
          const sentinelIndex = aiResponse.indexOf("AGENT_CREATE:");
          if (sentinelIndex === -1) throw new Error("AGENT_CREATE marker not found");
          
          const jsonStart = aiResponse.indexOf("{", sentinelIndex);
          if (jsonStart === -1) throw new Error("No JSON object found after AGENT_CREATE");
          
          // Extract balanced JSON (handle nested braces)
          let braceCount = 0;
          let jsonEnd = jsonStart;
          for (let i = jsonStart; i < aiResponse.length; i++) {
            if (aiResponse[i] === "{") braceCount++;
            if (aiResponse[i] === "}") {
              braceCount--;
              if (braceCount === 0) {
                jsonEnd = i + 1;
                break;
              }
            }
          }
          
          const jsonStr = aiResponse.substring(jsonStart, jsonEnd);
          const rawConfig = JSON.parse(jsonStr);
          
          // Validate agent config - extend insertAgentSchema with strict validation
          const agentConfigSchema = insertAgentSchema.extend({
            voiceProvider: z.enum(["openai", "elevenlabs"]).optional().default("openai"),
            voice: z.string().optional().default("alloy"),
          });
          
          // Build config - only include fields that are present, let schema apply defaults
          const configToValidate: Record<string, any> = {
            name: rawConfig.name,
            prompt: rawConfig.prompt,
          };
          
          // Only add optional fields if provided by user
          if (rawConfig.description !== undefined) configToValidate.description = rawConfig.description;
          if (rawConfig.voiceProvider !== undefined) configToValidate.voiceProvider = rawConfig.voiceProvider;
          if (rawConfig.voice !== undefined) configToValidate.voice = rawConfig.voice;
          if (rawConfig.language !== undefined) configToValidate.language = rawConfig.language;
          if (rawConfig.temperature !== undefined) configToValidate.temperature = Number(rawConfig.temperature);
          // isActive is always set to active for new agents
          configToValidate.isActive = 1;
          
          const validatedConfig = agentConfigSchema.parse(configToValidate);
            
          // Create the agent
          createdAgent = await storage.createAgent(validatedConfig);

          // Link agent to session
          await storage.updateChatSession(parsed.sessionId, {
            agentId: createdAgent.id,
          });

          // Broadcast agent creation
          broadcastToClients("agent:created", createdAgent);

          // Replace the AGENT_CREATE block with a friendly message
          const beforeCreate = aiResponse.substring(0, sentinelIndex);
          aiResponse = beforeCreate.trim() + 
            `\n\n✅ **Agent Created Successfully!**\n\nI've created your agent "${createdAgent.name}"! You can now use this agent for phone calls. The agent is configured and ready to go.\n\nWould you like to test it with a call or make any adjustments?`;
          
        } catch (error) {
          agentCreationError = (error as Error).message;
          console.error("Failed to create agent:", error);
          
          // Inform user of failure - replace only the AGENT_CREATE block, preserve context
          const sentinelIdx = aiResponse.indexOf("AGENT_CREATE:");
          const beforeCreate = sentinelIdx >= 0 ? aiResponse.substring(0, sentinelIdx) : aiResponse;
          aiResponse = beforeCreate.trim() + 
            `\n\n❌ **Agent Creation Failed**\n\nI encountered an error while trying to create the agent: ${agentCreationError}\n\nLet's try again. Can you provide the agent details once more?`;
        }
      }

      // Save AI response
      const assistantMessage = await storage.createChatMessage({
        role: "assistant",
        content: aiResponse,
        sessionId: parsed.sessionId,
        metadata: { 
          model: "gpt-5",
          agentCreated: createdAgent ? createdAgent.id : undefined
        },
      });

      // Return both messages and created agent if any
      res.json({
        userMessage,
        assistantMessage,
        agentCreated: createdAgent
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Delete chat history for a session
  app.delete("/api/chat/:sessionId", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteChatMessages(req.params.sessionId);
      if (!deleted) {
        return res.status(404).json({ error: "No messages found for this session" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== PROJECT API ENDPOINTS ====================
  
  app.get("/api/projects", async (req: Request, res: Response) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      console.error("Failed to get projects:", error);
      res.status(500).json({ error: "Failed to get projects" });
    }
  });

  app.get("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Failed to get project:", error);
      res.status(500).json({ error: "Failed to get project" });
    }
  });

  app.post("/api/projects", async (req: Request, res: Response) => {
    try {
      const project = await storage.createProject(req.body);
      res.json(project);
    } catch (error) {
      console.error("Failed to create project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Failed to update project:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteProject(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Google OAuth endpoints for Projects
  app.get("/api/projects/:projectId/google/auth", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const authUrl = generateAuthUrl(projectId);
      res.json({ authUrl });
    } catch (error) {
      console.error("Failed to generate Google auth URL:", error);
      res.status(500).json({ error: "Failed to generate authorization URL" });
    }
  });

  // Google OAuth callback
  app.get("/api/google/callback", async (req: Request, res: Response) => {
    try {
      const { code, state: projectId } = req.query;

      if (!code || !projectId) {
        return res.status(400).json({ error: "Missing code or project ID" });
      }

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code as string);

      // Get user email from Gmail profile
      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials(tokens);
      const gmailService = new GmailService(oauth2Client);
      const profile = await gmailService.getProfile();

      // Update project with OAuth tokens
      await storage.updateProject(projectId as string, {
        googleOAuthTokens: tokens,
        googleOAuthEmail: profile.emailAddress,
        googleOAuthConnectedAt: new Date()
      });

      // Redirect to project settings page with success
      res.redirect(`/projects/${projectId}?google_connected=true`);
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.redirect(`/projects?google_error=true`);
    }
  });

  // Disconnect Google account from project
  app.delete("/api/projects/:projectId/google/disconnect", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      
      await storage.updateProject(projectId, {
        googleOAuthTokens: null,
        googleOAuthEmail: null,
        googleOAuthConnectedAt: null
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to disconnect Google account:", error);
      res.status(500).json({ error: "Failed to disconnect Google account" });
    }
  });

  // Google Calendar API endpoints
  app.get("/api/projects/:projectId/calendar/events", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const oauth2Client = await getOAuth2ClientForProject(projectId);
      
      if (!oauth2Client) {
        return res.status(401).json({ error: "Google account not connected" });
      }

      const calendarService = new GoogleCalendarService(oauth2Client);
      const events = await calendarService.listEvents();
      res.json(events);
    } catch (error) {
      console.error("Failed to list calendar events:", error);
      res.status(500).json({ error: "Failed to list calendar events" });
    }
  });

  app.post("/api/projects/:projectId/calendar/events", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const oauth2Client = await getOAuth2ClientForProject(projectId);
      
      if (!oauth2Client) {
        return res.status(401).json({ error: "Google account not connected" });
      }

      const calendarService = new GoogleCalendarService(oauth2Client);
      const event = await calendarService.createEvent(req.body);
      res.json(event);
    } catch (error) {
      console.error("Failed to create calendar event:", error);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  });

  // Gmail API endpoints  
  app.get("/api/projects/:projectId/gmail/messages", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { q = '' } = req.query;
      const oauth2Client = await getOAuth2ClientForProject(projectId);
      
      if (!oauth2Client) {
        return res.status(401).json({ error: "Google account not connected" });
      }

      const gmailService = new GmailService(oauth2Client);
      const messages = await gmailService.listMessages(q as string);
      res.json(messages);
    } catch (error) {
      console.error("Failed to list Gmail messages:", error);
      res.status(500).json({ error: "Failed to list messages" });
    }
  });

  app.post("/api/projects/:projectId/gmail/send", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { to, subject, body, cc, bcc } = req.body;
      const oauth2Client = await getOAuth2ClientForProject(projectId);
      
      if (!oauth2Client) {
        return res.status(401).json({ error: "Google account not connected" });
      }

      const gmailService = new GmailService(oauth2Client);
      const result = await gmailService.sendEmail(to, subject, body, cc, bcc);
      res.json(result);
    } catch (error) {
      console.error("Failed to send email:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Project Pipeline endpoints
  app.get("/api/projects/:projectId/pipelines", async (req: Request, res: Response) => {
    try {
      const pipelines = await storage.getProjectPipelines(req.params.projectId);
      res.json(pipelines);
    } catch (error) {
      console.error("Failed to get pipelines:", error);
      res.status(500).json({ error: "Failed to get pipelines" });
    }
  });

  app.post("/api/projects/:projectId/pipelines", async (req: Request, res: Response) => {
    try {
      const pipeline = await storage.createProjectPipeline({
        ...req.body,
        projectId: req.params.projectId
      });
      res.json(pipeline);
    } catch (error) {
      console.error("Failed to create pipeline:", error);
      res.status(500).json({ error: "Failed to create pipeline" });
    }
  });

  // Project Workflow endpoints
  app.get("/api/projects/:projectId/workflows", async (req: Request, res: Response) => {
    try {
      const workflows = await storage.getProjectWorkflows(req.params.projectId);
      res.json(workflows);
    } catch (error) {
      console.error("Failed to get workflows:", error);
      res.status(500).json({ error: "Failed to get workflows" });
    }
  });

  app.post("/api/projects/:projectId/workflows", async (req: Request, res: Response) => {
    try {
      const workflow = await storage.createProjectWorkflow({
        ...req.body,
        projectId: req.params.projectId
      });
      res.json(workflow);
    } catch (error) {
      console.error("Failed to create workflow:", error);
      res.status(500).json({ error: "Failed to create workflow" });
    }
  });

  // Project Agent assignment endpoints
  app.get("/api/projects/:projectId/agents", async (req: Request, res: Response) => {
    try {
      const projectAgents = await storage.getProjectAgents(req.params.projectId);
      res.json(projectAgents);
    } catch (error) {
      console.error("Failed to get project agents:", error);
      res.status(500).json({ error: "Failed to get project agents" });
    }
  });

  app.post("/api/projects/:projectId/agents", async (req: Request, res: Response) => {
    try {
      const projectAgent = await storage.addAgentToProject({
        ...req.body,
        projectId: req.params.projectId
      });
      res.json(projectAgent);
    } catch (error) {
      console.error("Failed to add agent to project:", error);
      res.status(500).json({ error: "Failed to add agent to project" });
    }
  });

  app.delete("/api/projects/:projectId/agents/:agentId", async (req: Request, res: Response) => {
    try {
      const removed = await storage.removeAgentFromProject(req.params.projectId, req.params.agentId);
      if (!removed) {
        return res.status(404).json({ error: "Agent not found in project" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to remove agent from project:", error);
      res.status(500).json({ error: "Failed to remove agent from project" });
    }
  });

  // ==================== WEBSOCKET SETUP ====================

  const httpServer = createServer(app);
  
  // WebSocket server for client real-time updates
  const wss = new WebSocketServer({ noServer: true });
  
  // WebSocket server for Twilio Media Streams
  const twilioWss = new WebSocketServer({ noServer: true });
  
  // Track active call sessions
  const activeSessions = new Map<string, OpenAIRealtimeSession | ElevenLabsRealtimeSession>();

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const pathname = url.pathname;
    
    if (pathname === '/ws') {
      // Handle client WebSocket connections
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/api/twilio/stream') {
      // Handle Twilio Media Stream connections
      twilioWss.handleUpgrade(request, socket, head, (ws) => {
        twilioWss.emit('connection', ws, request, url);
      });
    }
    // Let other upgrade requests (like Vite HMR) pass through
  });

  // Client WebSocket handler
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    wsClients.add(ws);

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      wsClients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      wsClients.delete(ws);
    });

    ws.send(JSON.stringify({ event: 'connected', data: { message: 'Connected to SoVoice AI' } }));
  });

  // Twilio Media Stream WebSocket handler
  twilioWss.on('connection', async (ws: WebSocket, request: any, url: URL) => {
    console.log(`[Twilio Stream] WebSocket connection established`);

    let callId: string | null = null;
    let session: OpenAIRealtimeSession | ElevenLabsRealtimeSession | null = null;

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle the "start" event which contains customParameters
        if (message.event === 'start') {
          const customParameters = message.start?.customParameters;
          callId = customParameters?.callId;
          
          if (!callId) {
            console.error('[Twilio Stream] No callId in customParameters');
            ws.close();
            return;
          }

          console.log(`[Twilio Stream] Session started for call ${callId}`);

          // Get call and agent to determine voice provider
          const call = await storage.getCall(callId);
          if (!call) {
            console.error(`[Twilio Stream] Call not found: ${callId}`);
            ws.close();
            return;
          }

          const agent = call.agentId 
            ? await storage.getAgent(call.agentId)
            : await storage.getActiveAgent();

          if (!agent) {
            console.error(`[Twilio Stream] No agent found for call ${callId}`);
            ws.close();
            return;
          }

          // Create appropriate realtime session based on voice provider
          const voiceProvider = agent.voiceProvider || "openai";
          console.log(`[Twilio Stream] Using voice provider: ${voiceProvider} for call ${callId}`);

          if (voiceProvider === "elevenlabs") {
            // Create ElevenLabs session (Whisper + GPT-4 + ElevenLabs TTS)
            session = new ElevenLabsRealtimeSession({
              callId,
              agentId: agent.id,
              twilioWebSocket: ws
            });
          } else {
            // Create OpenAI Realtime session (default)
            session = new OpenAIRealtimeSession({
              callId,
              agentId: agent.id,
              twilioWebSocket: ws
            });
          }

          await session.start();
          activeSessions.set(callId, session);
          
          // Also forward the start message to set streamSid
          session.handleTwilioMessage(message);
        } else if (session) {
          // Forward other messages to the session
          session.handleTwilioMessage(message);
        }
      } catch (error) {
        console.error(`[Twilio Stream] Error handling message:`, error);
      }
    });

    ws.on('close', () => {
      if (callId) {
        console.log(`[Twilio Stream] Connection closed for call ${callId}`);
        if (session) {
          session.cleanup();
          activeSessions.delete(callId);
        }
        
        // Update call status
        storage.updateCall(callId, { status: 'completed' }).then((call) => {
          if (call) {
            broadcastToClients('call:updated', call);
          }
        });
      }
    });

    ws.on('error', (error) => {
      console.error(`[Twilio Stream] WebSocket error:`, error);
      if (callId && session) {
        session.cleanup();
        activeSessions.delete(callId);
      }
    });
  });

  return httpServer;
}

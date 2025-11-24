import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { 
  insertCallSchema, 
  updateCallSchema, 
  insertAgentSchema, 
  updateAgentSchema, 
  insertChatMessageSchema, 
  insertChatSessionSchema,
  updateChatSessionSchema,
  insertApiKeySchema,
  insertPhoneNumberSchema,
  emails,
  type Call, 
  type Agent,
  type ChatSession,
  type PhoneNumber,
  type Appointment 
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
import { initializeSystemAgents } from "./init-system-agents";

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

  // ==================== SYSTEM INITIALIZATION ROUTE ====================
  
  // Manual system initialization endpoint (for production)
  app.post("/api/init-system", async (req: Request, res: Response) => {
    try {
      // Allow manual initialization of system agents
      await initializeSystemAgents();
      console.log("[API] System agents initialized via API");
      res.json({ success: true, message: "System agents initialized successfully" });
    } catch (error) {
      console.error("[API] System initialization error:", error);
      res.status(500).json({ success: false, error: "Failed to initialize system agents" });
    }
  });

  // ==================== DASHBOARD ROUTES ====================
  
  // Get dashboard metrics
  app.get("/api/dashboard/metrics", async (req: Request, res: Response) => {
    try {
      const { timeRange = "7d" } = req.query;
      
      // Get all calls
      const calls = await storage.getCalls();
      const agents = await storage.getAgents();
      const projects = await storage.getProjects();
      
      // Filter calls by time range
      const now = new Date();
      const filterDate = new Date();
      
      switch(timeRange) {
        case "24h":
          filterDate.setHours(filterDate.getHours() - 24);
          break;
        case "7d":
          filterDate.setDate(filterDate.getDate() - 7);
          break;
        case "30d":
          filterDate.setDate(filterDate.getDate() - 30);
          break;
        case "90d":
          filterDate.setDate(filterDate.getDate() - 90);
          break;
      }
      
      const filteredCalls = calls.filter(call => 
        new Date(call.createdAt) >= filterDate
      );
      
      // Calculate metrics
      const todayCalls = calls.filter(call => {
        const callDate = new Date(call.createdAt);
        const today = new Date();
        return callDate.toDateString() === today.toDateString();
      });
      
      const metrics = {
        totalCalls: filteredCalls.length,
        todayCalls: todayCalls.length,
        activeCalls: filteredCalls.filter(c => c.status === "in-progress").length,
        completedCalls: filteredCalls.filter(c => c.status === "completed").length,
        failedCalls: filteredCalls.filter(c => c.status === "failed").length,
        successRate: filteredCalls.length > 0 
          ? Math.round((filteredCalls.filter(c => c.status === "completed").length / filteredCalls.length) * 100) 
          : 0,
        avgDuration: filteredCalls.length > 0
          ? Math.round(filteredCalls.reduce((acc, c) => acc + (c.duration || 0), 0) / filteredCalls.length)
          : 0,
        
        // Call volume by day
        callVolumeByDay: (() => {
          const days = [];
          for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dayStart = new Date(date.setHours(0, 0, 0, 0));
            const dayEnd = new Date(date.setHours(23, 59, 59, 999));
            
            const dayCalls = filteredCalls.filter(call => {
              const callDate = new Date(call.createdAt);
              return callDate >= dayStart && callDate <= dayEnd;
            });
            
            days.push({
              date: dayStart.toLocaleDateString('en', { weekday: 'short' }),
              inbound: dayCalls.filter(c => c.direction === "inbound").length,
              outbound: dayCalls.filter(c => c.direction === "outbound").length,
            });
          }
          return days;
        })(),
        
        // Hourly distribution
        hourlyDistribution: (() => {
          const hours = Array.from({ length: 24 }, (_, i) => ({
            hour: `${i}:00`,
            calls: 0
          }));
          
          filteredCalls.forEach(call => {
            const hour = new Date(call.createdAt).getHours();
            hours[hour].calls++;
          });
          
          return hours;
        })(),
        
        // Status distribution
        statusDistribution: [
          { name: "Completed", value: filteredCalls.filter(c => c.status === "completed").length, color: "#10b981" },
          { name: "Failed", value: filteredCalls.filter(c => c.status === "failed").length, color: "#ef4444" },
          { name: "No Answer", value: filteredCalls.filter(c => c.status === "no-answer").length, color: "#f59e0b" },
          { name: "Busy", value: filteredCalls.filter(c => c.status === "busy").length, color: "#6b7280" },
        ],
        
        // Agent performance
        agentPerformance: agents.map(agent => {
          const agentCalls = filteredCalls.filter(c => c.agentId === agent.id);
          return {
            id: agent.id,
            name: agent.name,
            calls: agentCalls.length,
            successRate: agentCalls.length > 0 
              ? Math.round((agentCalls.filter(c => c.status === "completed").length / agentCalls.length) * 100)
              : 0,
          };
        }).sort((a, b) => b.calls - a.calls).slice(0, 5),
        
        // Recent calls
        recentCalls: calls.slice(0, 10).map(call => ({
          id: call.id,
          phoneNumber: call.phoneNumber,
          direction: call.direction,
          status: call.status,
          createdAt: call.createdAt,
        })),
        
        // System health
        systemHealth: {
          twilio: { status: "connected", message: "Active" },
          openai: { status: "connected", message: "Active" },
          googleCalendar: projects.some(p => p.googleAccountId) 
            ? { status: "connected", message: "Connected" }
            : { status: "not_connected", message: "Not Connected" },
          gmail: projects.some(p => p.googleAccountId) 
            ? { status: "connected", message: "Connected" }
            : { status: "not_connected", message: "Not Connected" },
        },
      };
      
      res.json(metrics);
    } catch (error) {
      console.error("Dashboard metrics error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

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

  // Initiate outbound call
  app.post("/api/calls/outbound", async (req: Request, res: Response) => {
    try {
      const { phoneNumber, agentId } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      // Validate phone number format
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phoneNumber.replace(/[\s()-]/g, ''))) {
        return res.status(400).json({ 
          error: "Ungültige Telefonnummer. Bitte verwenden Sie ein gültiges Format wie +491234567890" 
        });
      }

      // Create call record
      const call = await storage.createCall({
        phoneNumber,
        direction: "outbound",
        status: "queued",
        agentId: agentId || null,
      });

      // Initiate Twilio call
      try {
        const twilioClient = await getTwilioClient();
        const fromNumber = await getTwilioFromPhoneNumber();
        
        console.log(`[Twilio] Initiating call from ${fromNumber} to ${phoneNumber}`);
        
        // Use REPLIT_DEV_DOMAIN which is always available in Replit
        const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
        const baseUrl = domain ? `https://${domain}` : 'http://localhost:5000';
        
        console.log(`[Twilio] Using webhook base URL: ${baseUrl}`);
        const voiceWebhookUrl = `${baseUrl}/api/twilio/voice?callId=${call.id}`;
        console.log(`[Twilio] Voice webhook URL: ${voiceWebhookUrl}`);
        
        const twilioCall = await twilioClient.calls.create({
          to: phoneNumber,
          from: fromNumber,
          url: voiceWebhookUrl,
          statusCallback: `${baseUrl}/api/twilio/status`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          record: true, // Enable recording
          recordingStatusCallback: `${baseUrl}/api/twilio/recording-status`,
        });

        console.log(`[Twilio] Call initiated successfully with SID: ${twilioCall.sid}`);

        // Update call with Twilio SID
        const updatedCall = await storage.updateCall(call.id, {
          metadata: { twilioSid: twilioCall.sid } as any,
          status: "in-progress",
        });

        // Broadcast real-time update
        broadcastToClients("call:created", updatedCall);
        
        res.json(updatedCall);
      } catch (twilioError: any) {
        console.error("[Twilio] Error details:", {
          code: twilioError.code,
          message: twilioError.message,
          moreInfo: twilioError.moreInfo
        });
        
        await storage.updateCall(call.id, { status: "failed" });
        
        // Provide user-friendly error messages
        let errorMessage = "Anruf konnte nicht gestartet werden";
        if (twilioError.code === 21216) {
          errorMessage = "Diese Nummer kann nicht angerufen werden. Bitte überprüfen Sie die Nummer oder Ihre Twilio-Berechtigungen.";
        } else if (twilioError.code === 21201) {
          errorMessage = "Ungültige Telefonnummer. Bitte verwenden Sie das Format +491234567890";
        }
        
        res.status(500).json({ error: errorMessage });
      }
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // End active call
  app.post("/api/calls/:id/end", async (req: Request, res: Response) => {
    try {
      const callId = req.params.id;
      const call = await storage.getCall(callId);
      
      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }

      // Get Twilio SID from metadata
      const twilioSid = (call.metadata as any)?.twilioSid;
      
      if (twilioSid) {
        try {
          const twilioClient = await getTwilioClient();
          
          // End the Twilio call
          await twilioClient.calls(twilioSid).update({ status: 'completed' });
        } catch (twilioError) {
          console.error("Error ending Twilio call:", twilioError);
        }
      }

      // Update call status
      const updatedCall = await storage.updateCall(callId, {
        status: "completed",
      });

      // Broadcast real-time update
      broadcastToClients("call:ended", updatedCall);
      
      res.json(updatedCall);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Transfer call
  app.post("/api/calls/:id/transfer", async (req: Request, res: Response) => {
    try {
      const callId = req.params.id;
      const { transferTo, transferType = "blind" } = req.body;
      
      if (!transferTo) {
        return res.status(400).json({ error: "Transfer destination is required" });
      }

      const call = await storage.getCall(callId);
      
      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }

      const twilioSid = (call.metadata as any)?.twilioSid;
      
      if (!twilioSid) {
        return res.status(400).json({ error: "No active Twilio call found" });
      }

      try {
        const twilioClient = await getTwilioClient();
        const fromNumber = await getTwilioFromPhoneNumber();
        
        const baseUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'http://localhost:5000';

        if (transferType === "blind") {
          // Blind transfer - immediately redirect the call
          await twilioClient.calls(twilioSid).update({
            url: `${baseUrl}/api/twilio/transfer?to=${encodeURIComponent(transferTo)}`,
            method: 'POST'
          });
        } else {
          // Attended transfer - create conference and add parties
          // This is more complex and requires conference management
          // For now, we'll implement blind transfer
          await twilioClient.calls(twilioSid).update({
            url: `${baseUrl}/api/twilio/transfer?to=${encodeURIComponent(transferTo)}`,
            method: 'POST'
          });
        }

        // Update call metadata
        const updatedCall = await storage.updateCall(callId, {
          metadata: { 
            ...(call.metadata as any),
            transferredTo: transferTo,
            transferType,
            transferredAt: new Date().toISOString()
          } as any,
        });

        // Broadcast real-time update
        broadcastToClients("call:transferred", updatedCall);
        
        res.json({ success: true, transferredTo: transferTo });
      } catch (twilioError) {
        console.error("Error transferring call:", twilioError);
        res.status(500).json({ error: "Failed to transfer call" });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Schedule a call
  app.post("/api/calls/schedule", async (req: Request, res: Response) => {
    try {
      const { phoneNumber, scheduledFor, note, agentId } = req.body;
      
      if (!phoneNumber || !scheduledFor) {
        return res.status(400).json({ error: "Phone number and scheduled time are required" });
      }

      // Create a scheduled call record
      const call = await storage.createCall({
        phoneNumber,
        direction: "outbound",
        status: "scheduled",
        agentId: agentId || null,
        metadata: {
          scheduledFor,
          note: note || "",
          createdBy: "user", // You might want to get this from session
        } as any,
      });

      // In a real implementation, you would:
      // 1. Create a scheduled job/cron to initiate the call at the scheduled time
      // 2. Send reminder notifications
      // 3. Handle timezone conversions
      
      // For now, we'll just return the scheduled call
      broadcastToClients("call:scheduled", call);
      
      res.json(call);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Handle call transfer TwiML
  app.post("/api/twilio/transfer", async (req: Request, res: Response) => {
    try {
      const { to } = req.query;
      
      if (!to) {
        res.type('text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Unable to transfer call. No destination provided.</Say>
  <Hangup/>
</Response>`);
        return;
      }

      // Return TwiML to transfer the call
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Transferring your call. Please hold.</Say>
  <Dial>${to}</Dial>
</Response>`);
    } catch (error) {
      console.error("Transfer TwiML error:", error);
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Sorry, we could not transfer your call. Please try again later.</Say>
  <Hangup/>
</Response>`);
    }
  });

  // Handle recording status callback
  app.post("/api/twilio/recording-status", async (req: Request, res: Response) => {
    try {
      const { CallSid, RecordingUrl, RecordingSid, RecordingStatus } = req.body;
      
      console.log('[Recording Status]', {
        callSid: CallSid,
        recordingSid: RecordingSid,
        status: RecordingStatus,
        url: RecordingUrl
      });

      if (RecordingStatus === 'completed' && RecordingUrl) {
        // Find call by Twilio SID
        const calls = await storage.getCalls();
        const call = calls.find(c => (c.metadata as any)?.twilioSid === CallSid);
        
        if (call) {
          // Update call with recording URL
          await storage.updateCall(call.id, {
            recording: RecordingUrl,
            metadata: {
              ...(call.metadata as any),
              recordingSid: RecordingSid,
              recordingUrl: RecordingUrl
            } as any
          });

          // Broadcast update
          broadcastToClients("call:recording-ready", {
            callId: call.id,
            recordingUrl: RecordingUrl
          });
        }
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error("Recording status callback error:", error);
      res.status(500).send('Error');
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

  // Update agent status (for call center agent availability)
  app.patch("/api/agents/:id/status", async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const validStatuses = ['available', 'busy', 'on-call', 'break', 'offline'];
      
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        });
      }

      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      // Update agent metadata with status
      const updatedAgent = await storage.updateAgent(req.params.id, {
        metadata: {
          ...(agent.metadata as any),
          status,
          statusUpdatedAt: new Date().toISOString()
        } as any
      });

      // Broadcast status update
      broadcastToClients("agent:status-updated", {
        agentId: req.params.id,
        status,
        timestamp: new Date().toISOString()
      });

      res.json(updatedAgent);
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

  // ==================== APPOINTMENT ROUTES ====================

  // Get appointments
  app.get("/api/appointments", async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, customerEmail } = req.query;
      
      if (customerEmail) {
        const appointments = await storage.getAppointmentsByCustomer(customerEmail as string);
        return res.json(appointments);
      }
      
      let appointments: Appointment[];
      if (startDate && endDate) {
        appointments = await storage.getAppointments(
          new Date(startDate as string),
          new Date(endDate as string)
        );
      } else {
        appointments = await storage.getAppointments();
      }
      
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get single appointment
  app.get("/api/appointments/:id", async (req: Request, res: Response) => {
    try {
      const appointment = await storage.getAppointment(req.params.id);
      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get appointments for a specific date
  app.get("/api/appointments/date/:date", async (req: Request, res: Response) => {
    try {
      const date = new Date(req.params.date);
      const appointments = await storage.getAppointmentsByDate(date);
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Check availability for a time slot
  app.post("/api/appointments/check-availability", async (req: Request, res: Response) => {
    try {
      const { startTime, endTime, excludeId } = req.body;
      
      if (!startTime || !endTime) {
        return res.status(400).json({ error: "Start time and end time are required" });
      }
      
      const available = await storage.checkAvailability(
        new Date(startTime),
        new Date(endTime),
        excludeId
      );
      
      res.json({ available });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Create appointment
  app.post("/api/appointments", async (req: Request, res: Response) => {
    try {
      const { startTime, endTime, customerName, customerEmail, ...rest } = req.body;
      
      if (!startTime || !endTime || !customerName || !customerEmail) {
        return res.status(400).json({ 
          error: "Start time, end time, customer name and email are required" 
        });
      }
      
      // Check availability first
      const available = await storage.checkAvailability(
        new Date(startTime),
        new Date(endTime)
      );
      
      if (!available) {
        return res.status(409).json({ 
          error: "Time slot is not available" 
        });
      }
      
      const appointment = await storage.createAppointment({
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        customerName,
        customerEmail,
        title: rest.title || `Meeting with ${customerName}`,
        status: "scheduled",
        ...rest
      });
      
      // Broadcast real-time update
      broadcastToClients("appointment:created", appointment);
      
      // Try to send email confirmation
      try {
        const msAuthService = new MicrosoftAuthService();
        const isConfigured = await msAuthService.isConfigured();
        
        if (isConfigured) {
          const appointmentTime = new Date(appointment.startTime).toLocaleString('de-DE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Berlin'
          });
          
          await msAuthService.sendEmail({
            to: appointment.customerEmail,
            subject: `Terminbestätigung - ${appointmentTime}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Terminbestätigung</h2>
                
                <p>Sehr geehrte/r ${appointment.customerName},</p>
                
                <p>Ihr Termin wurde erfolgreich bestätigt.</p>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
                  <h3 style="color: #333; margin-top: 0;">Termindetails:</h3>
                  <p><strong>Datum & Zeit:</strong> ${appointmentTime}</p>
                  ${appointment.location ? `<p><strong>Ort/Medium:</strong> ${appointment.location}</p>` : ''}
                  ${appointment.description ? `<p><strong>Beschreibung:</strong> ${appointment.description}</p>` : ''}
                </div>
                
                <p>Bei Fragen oder zur Terminänderung können Sie uns jederzeit kontaktieren.</p>
                
                <p>Mit freundlichen Grüßen<br>
                Ihr SoVoice AI Team</p>
              </div>
            `,
            text: `Terminbestätigung\n\nSehr geehrte/r ${appointment.customerName},\n\nIhr Termin wurde erfolgreich bestätigt.\n\nTermin: ${appointmentTime}\n${appointment.location ? `Ort/Medium: ${appointment.location}\n` : ''}${appointment.description ? `Beschreibung: ${appointment.description}\n` : ''}\n\nMit freundlichen Grüßen\nIhr SoVoice AI Team`
          });
          
          // Update appointment metadata to indicate email was sent
          await storage.updateAppointment(appointment.id, {
            metadata: {
              ...appointment.metadata,
              emailSent: true
            }
          });
        }
      } catch (emailError) {
        console.error("[Appointment] Failed to send confirmation email:", emailError);
        // Don't fail the appointment creation if email fails
      }
      
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Update appointment
  app.patch("/api/appointments/:id", async (req: Request, res: Response) => {
    try {
      const { startTime, endTime, ...updateData } = req.body;
      
      // If updating time, check availability
      if (startTime && endTime) {
        const available = await storage.checkAvailability(
          new Date(startTime),
          new Date(endTime),
          req.params.id
        );
        
        if (!available) {
          return res.status(409).json({ 
            error: "New time slot is not available" 
          });
        }
        
        updateData.startTime = new Date(startTime);
        updateData.endTime = new Date(endTime);
      }
      
      const appointment = await storage.updateAppointment(req.params.id, updateData);
      
      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      
      // Broadcast real-time update
      broadcastToClients("appointment:updated", appointment);
      
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Delete appointment
  app.delete("/api/appointments/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteAppointment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      
      // Broadcast real-time update
      broadcastToClients("appointment:deleted", { id: req.params.id });
      
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

  // ==================== CALENDLY INTEGRATION ROUTES ====================
  
  // Get Calendly connection status
  app.get("/api/calendly/status", async (req: Request, res: Response) => {
    try {
      const { getCalendlyStatus } = await import("./calendly-client");
      const status = await getCalendlyStatus();
      res.json(status);
    } catch (error) {
      console.error("[Calendly] Status error:", error);
      res.status(500).json({ error: "Failed to get Calendly status" });
    }
  });

  // Start Calendly OAuth flow
  app.post("/api/calendly/connect", async (req: Request, res: Response) => {
    try {
      const { generateCalendlyAuthUrl } = await import("./calendly-client");
      const { randomBytes } = await import("crypto");
      
      // Get base URL for redirect
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000';
      
      // Generate redirect URI
      const redirectUri = `${baseUrl}/api/calendly/callback`;
      
      // Generate state parameter for CSRF protection
      const state = randomBytes(32).toString('hex');
      
      // Store state in settings for validation (expires in 10 minutes)
      await storage.setSetting(`calendly_oauth_state_${state}`, {
        state,
        redirectUri,
        expiresAt: Date.now() + (10 * 60 * 1000),
      });
      
      const authUrl = generateCalendlyAuthUrl(state, redirectUri);
      res.json({ authUrl });
    } catch (error) {
      console.error("[Calendly] Connect error:", error);
      res.status(500).json({ error: "Failed to generate auth URL" });
    }
  });

  // Handle OAuth callback
  app.get("/api/calendly/callback", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;
      
      if (!code) {
        return res.status(400).send("Authorization code missing");
      }
      
      if (!state) {
        return res.status(400).send("State parameter missing - CSRF protection failed");
      }
      
      // Validate state parameter
      const storedStateData = await storage.getSetting(`calendly_oauth_state_${state}`);
      
      if (!storedStateData) {
        return res.status(400).send("Invalid state parameter - CSRF protection failed");
      }
      
      const stateValue = storedStateData.value as any;
      
      // Check if state has expired
      if (Date.now() > stateValue.expiresAt) {
        await storage.deleteSetting(`calendly_oauth_state_${state}`);
        return res.status(400).send("OAuth state expired - please try again");
      }
      
      // Extract redirect URI before cleanup
      const redirectUri = stateValue.redirectUri;
      
      // Clean up used state
      await storage.deleteSetting(`calendly_oauth_state_${state}`);
      
      const { exchangeCodeForTokens } = await import("./calendly-client");
      await exchangeCodeForTokens(code as string, redirectUri);
      
      // Redirect to calendar page with success message
      res.redirect("/calendar?connected=true");
    } catch (error) {
      console.error("[Calendly] Callback error:", error);
      res.redirect("/calendar?error=connection_failed");
    }
  });

  // Disconnect from Calendly
  app.post("/api/calendly/disconnect", async (req: Request, res: Response) => {
    try {
      const { clearCalendlyCredentials } = await import("./calendly-client");
      await clearCalendlyCredentials();
      res.json({ success: true });
    } catch (error) {
      console.error("[Calendly] Disconnect error:", error);
      res.status(500).json({ error: "Failed to disconnect from Calendly" });
    }
  });

  // Manual token configuration for Calendly
  app.post("/api/calendly/manual-token", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }
      
      // Test the token by fetching user info
      const userResponse = await fetch("https://api.calendly.com/users/me", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      
      if (!userResponse.ok) {
        return res.status(401).json({ error: "Invalid token" });
      }
      
      const userData = await userResponse.json();
      const userInfo = userData.resource;
      
      // Store the token and user info
      await storage.setSetting("calendly_tokens", {
        access_token: token,
        refresh_token: null, // Manual tokens don't have refresh tokens
        expires_at: Date.now() + (365 * 24 * 60 * 60 * 1000), // Set far future expiry
        scope: "manual",
        organization: userInfo.organization || null,
        owner: userInfo.uri || null,
        manual: true // Mark as manual token
      });
      
      await storage.setSetting("calendly_user", {
        uri: userInfo.uri,
        name: userInfo.name,
        email: userInfo.email,
        scheduling_url: userInfo.scheduling_url,
        timezone: userInfo.timezone,
        avatar_url: userInfo.avatar_url,
        organization: userInfo.organization
      });
      
      res.json({ 
        success: true,
        user: {
          name: userInfo.name,
          email: userInfo.email
        }
      });
    } catch (error) {
      console.error("[Calendly] Manual token error:", error);
      res.status(500).json({ error: "Failed to configure manual token" });
    }
  });

  // Calendly webhook endpoint
  app.post("/api/calendly/webhook", async (req: Request, res: Response) => {
    try {
      const { createHmac } = await import("crypto");
      
      // Get the webhook signing key from environment
      const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
      if (!signingKey) {
        console.error("[Calendly Webhook] No signing key configured");
        return res.status(500).json({ error: "Webhook not configured" });
      }

      // Get the signature from headers
      const signature = req.headers['calendly-webhook-signature'] as string;
      if (!signature) {
        console.error("[Calendly Webhook] No signature in headers");
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Parse the signature header
      const signatureParts = signature.split(',').reduce((acc, part) => {
        const [key, value] = part.split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

      const timestamp = signatureParts['t'];
      const providedSignature = signatureParts['v1'];

      if (!timestamp || !providedSignature) {
        console.error("[Calendly Webhook] Invalid signature format");
        return res.status(401).json({ error: "Invalid signature" });
      }

      // Verify timestamp to prevent replay attacks (5 minute tolerance)
      const currentTime = Math.floor(Date.now() / 1000);
      const signatureTime = parseInt(timestamp);
      if (Math.abs(currentTime - signatureTime) > 300) {
        console.error("[Calendly Webhook] Timestamp out of range");
        return res.status(401).json({ error: "Request timestamp too old" });
      }

      // Compute expected signature
      const payload = timestamp + '.' + JSON.stringify(req.body);
      const expectedSignature = createHmac('sha256', signingKey)
        .update(payload)
        .digest('hex');

      // Verify signature
      if (expectedSignature !== providedSignature) {
        console.error("[Calendly Webhook] Signature verification failed");
        return res.status(401).json({ error: "Invalid signature" });
      }

      // Process webhook event
      const event = req.body;
      console.log("[Calendly Webhook] Received event:", event.event);

      // Handle different event types
      switch (event.event) {
        case 'invitee.created':
          console.log("[Calendly Webhook] New meeting scheduled:", event.payload);
          // Store or update meeting information
          await storage.setSetting(`calendly_event_${event.payload.event}`, {
            type: 'scheduled',
            payload: event.payload,
            receivedAt: new Date().toISOString()
          });
          
          // Send confirmation email
          try {
            const { AppointmentScheduler } = await import("./services/appointment-scheduler");
            const scheduler = new AppointmentScheduler();
            await scheduler.handleAppointmentScheduled(event);
          } catch (emailError) {
            console.error("[Calendly Webhook] Failed to send confirmation email:", emailError);
          }
          
          broadcast({ 
            type: 'calendly_event',
            data: {
              type: 'scheduled',
              event: event.payload
            }
          });
          break;

        case 'invitee.canceled':
          console.log("[Calendly Webhook] Meeting cancelled:", event.payload);
          await storage.setSetting(`calendly_event_${event.payload.event}`, {
            type: 'cancelled',
            payload: event.payload,
            receivedAt: new Date().toISOString()
          });
          
          // Send cancellation email
          try {
            const { AppointmentScheduler } = await import("./services/appointment-scheduler");
            const scheduler = new AppointmentScheduler();
            await scheduler.handleAppointmentCancelled(event);
          } catch (emailError) {
            console.error("[Calendly Webhook] Failed to send cancellation email:", emailError);
          }
          
          broadcast({ 
            type: 'calendly_event',
            data: {
              type: 'cancelled',
              event: event.payload
            }
          });
          break;

        case 'invitee_no_show.created':
          console.log("[Calendly Webhook] No-show:", event.payload);
          await storage.setSetting(`calendly_event_${event.payload.event}`, {
            type: 'no_show',
            payload: event.payload,
            receivedAt: new Date().toISOString()
          });
          broadcast({ 
            type: 'calendly_event',
            data: {
              type: 'no_show',
              event: event.payload
            }
          });
          break;

        default:
          console.log("[Calendly Webhook] Unhandled event type:", event.event);
      }

      // Respond with 200 OK
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("[Calendly Webhook] Processing error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Get scheduled events
  app.get("/api/calendly/events", async (req: Request, res: Response) => {
    try {
      const { fetchCalendlyEvents } = await import("./calendly-client");
      
      const options: any = {};
      if (req.query.count) options.count = parseInt(req.query.count as string);
      if (req.query.status) options.status = req.query.status as string;
      if (req.query.min_start_time) options.min_start_time = req.query.min_start_time as string;
      if (req.query.max_start_time) options.max_start_time = req.query.max_start_time as string;
      
      const events = await fetchCalendlyEvents(options);
      
      // Process events to simplify structure
      const processedEvents = events.map((event: any) => ({
        id: event.uri.split('/').pop(),
        name: event.name,
        start_time: event.start_time,
        end_time: event.end_time,
        event_type: event.event_type,
        location: event.location,
        invitees: event.invitees_counter?.total > 0 ? 
          event.invitees?.map((inv: any) => ({
            email: inv.email,
            name: inv.name,
            status: inv.status,
          })) : [],
        status: event.status,
        meeting_notes: event.meeting_notes_plain,
        uri: event.uri,
      }));
      
      res.json(processedEvents);
    } catch (error) {
      console.error("[Calendly] Events error:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // Get event types
  app.get("/api/calendly/event-types", async (req: Request, res: Response) => {
    try {
      const { fetchCalendlyEventTypes } = await import("./calendly-client");
      
      const options: any = {};
      if (req.query.active !== undefined) options.active = req.query.active === 'true';
      if (req.query.count) options.count = parseInt(req.query.count as string);
      
      const eventTypes = await fetchCalendlyEventTypes(options);
      res.json(eventTypes);
    } catch (error) {
      console.error("[Calendly] Event types error:", error);
      res.status(500).json({ error: "Failed to fetch event types" });
    }
  });

  // Cancel an event
  app.post("/api/calendly/events/:id/cancel", async (req: Request, res: Response) => {
    try {
      const { cancelCalendlyEvent } = await import("./calendly-client");
      const { reason } = req.body;
      
      const result = await cancelCalendlyEvent(req.params.id, reason);
      res.json(result);
    } catch (error) {
      console.error("[Calendly] Cancel event error:", error);
      res.status(500).json({ error: "Failed to cancel event" });
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

  // ==================== TWILIO CONFIGURATION API ENDPOINTS ====================
  
  // Get Twilio configuration status (without exposing actual values)
  app.get("/api/twilio/config", async (_: Request, res: Response) => {
    try {
      const hasAccountSid = !!process.env.TWILIO_ACCOUNT_SID;
      const hasAuthToken = !!process.env.TWILIO_AUTH_TOKEN;
      const phoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
      
      // Get webhook URLs
      const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
      const baseUrl = domain ? `https://${domain}` : '';
      
      res.json({
        configured: hasAccountSid && hasAuthToken && !!phoneNumber,
        hasAccountSid,
        hasAuthToken,
        phoneNumber: phoneNumber ? phoneNumber.replace(/(\d{3})\d+(\d{4})/, '$1****$2') : '', // Mask middle digits
        fullPhoneNumber: phoneNumber, // Send full number for UI display
        webhookUrls: {
          voice: `${baseUrl}/api/twilio/voice`,
          status: `${baseUrl}/api/twilio/status`,
          stream: `wss://${domain}/api/twilio/stream`
        }
      });
    } catch (error) {
      console.error("Failed to get Twilio config:", error);
      res.status(500).json({ error: "Failed to get Twilio configuration" });
    }
  });
  
  // Update Twilio configuration and setup webhooks
  app.post("/api/twilio/config", async (req: Request, res: Response) => {
    try {
      const { accountSid, authToken, phoneNumber } = req.body;
      
      if (!accountSid || !authToken || !phoneNumber) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Validate credentials by attempting to connect
      const twilio = require('twilio');
      const testClient = twilio(accountSid, authToken);
      
      try {
        // Test the credentials by fetching account info
        await testClient.api.accounts(accountSid).fetch();
      } catch (error) {
        console.error("Invalid Twilio credentials:", error);
        return res.status(400).json({ error: "Invalid Twilio credentials. Please check your Account SID and Auth Token." });
      }
      
      // Get the domain for webhook URLs
      const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
      if (!domain) {
        return res.status(500).json({ error: "Could not determine application domain" });
      }
      
      const baseUrl = `https://${domain}`;
      const voiceUrl = `${baseUrl}/api/twilio/voice`;
      const statusUrl = `${baseUrl}/api/twilio/status`;
      
      // Configure webhooks for the phone number
      try {
        const phoneNumbers = await testClient.incomingPhoneNumbers.list({
          phoneNumber: phoneNumber
        });
        
        if (phoneNumbers.length === 0) {
          return res.status(400).json({ error: `Phone number ${phoneNumber} not found in your Twilio account` });
        }
        
        const phoneResource = phoneNumbers[0];
        
        // Update the phone number configuration
        await testClient.incomingPhoneNumbers(phoneResource.sid).update({
          voiceUrl: voiceUrl,
          voiceMethod: 'POST',
          statusCallback: statusUrl,
          statusCallbackMethod: 'POST',
          voiceFallbackUrl: voiceUrl,
          voiceFallbackMethod: 'POST'
        });
        
        // Update environment variables using Node.js process.env
        // Note: In production, these should be stored securely
        process.env.TWILIO_ACCOUNT_SID = accountSid;
        process.env.TWILIO_AUTH_TOKEN = authToken;
        process.env.TWILIO_PHONE_NUMBER = phoneNumber;
        
        // Add or update the phone number in our database
        const existingNumbers = await storage.getPhoneNumbers();
        const existingNumber = existingNumbers.find(n => n.phoneNumber === phoneNumber);
        
        if (!existingNumber) {
          await storage.createPhoneNumber({
            phoneNumber: phoneNumber,
            friendlyName: phoneResource.friendlyName || 'Twilio Main Line',
            status: 'active',
            monthlyFee: '1.00',
            voiceEnabled: phoneResource.capabilities?.voice || true,
            smsEnabled: phoneResource.capabilities?.sms || false,
            mmsEnabled: phoneResource.capabilities?.mms || false,
            faxEnabled: phoneResource.capabilities?.fax || false,
            metadata: {
              twilioSid: phoneResource.sid,
              country: phoneResource.country,
              city: phoneResource.locality,
              state: phoneResource.region
            }
          });
          
          // Broadcast the new phone number
          const newNumber = await storage.getPhoneNumbers();
          broadcastToClients("phoneNumber:created", newNumber[newNumber.length - 1]);
        }
        
        res.json({
          success: true,
          message: "Twilio configuration updated and webhooks configured successfully",
          webhookUrls: {
            voice: voiceUrl,
            status: statusUrl
          },
          phoneNumber: phoneNumber
        });
      } catch (error) {
        console.error("Failed to configure webhooks:", error);
        return res.status(500).json({ error: "Failed to configure Twilio webhooks. Please check your phone number." });
      }
    } catch (error) {
      console.error("Failed to update Twilio config:", error);
      res.status(500).json({ error: "Failed to update Twilio configuration" });
    }
  });

  // ==================== PHONE NUMBER API ENDPOINTS ====================
  
  // Get all phone numbers
  app.get("/api/phone-numbers", async (req: Request, res: Response) => {
    try {
      const phoneNumbers = await storage.getPhoneNumbers();
      res.json(phoneNumbers);
    } catch (error) {
      console.error("Failed to get phone numbers:", error);
      res.status(500).json({ error: "Failed to get phone numbers" });
    }
  });

  // Get specific phone number by ID
  app.get("/api/phone-numbers/:id", async (req: Request, res: Response) => {
    try {
      const phoneNumber = await storage.getPhoneNumber(req.params.id);
      if (!phoneNumber) {
        return res.status(404).json({ error: "Phone number not found" });
      }
      res.json(phoneNumber);
    } catch (error) {
      console.error("Failed to get phone number:", error);
      res.status(500).json({ error: "Failed to get phone number" });
    }
  });

  // Get phone numbers by project
  app.get("/api/projects/:projectId/phone-numbers", async (req: Request, res: Response) => {
    try {
      const phoneNumbers = await storage.getPhoneNumbersByProject(req.params.projectId);
      res.json(phoneNumbers);
    } catch (error) {
      console.error("Failed to get project phone numbers:", error);
      res.status(500).json({ error: "Failed to get project phone numbers" });
    }
  });

  // Create new phone number
  app.post("/api/phone-numbers", async (req: Request, res: Response) => {
    try {
      // Validate request body
      const parsed = insertPhoneNumberSchema.parse(req.body);
      const phoneNumber = await storage.createPhoneNumber(parsed);
      
      // Broadcast to connected clients
      broadcastToClients("phoneNumber:created", phoneNumber);
      
      res.json(phoneNumber);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Failed to create phone number:", error);
      res.status(500).json({ error: "Failed to create phone number" });
    }
  });

  // Update phone number
  app.patch("/api/phone-numbers/:id", async (req: Request, res: Response) => {
    try {
      // Validate request body (partial update)
      const parsed = insertPhoneNumberSchema.partial().parse(req.body);
      const phoneNumber = await storage.updatePhoneNumber(req.params.id, parsed);
      
      if (!phoneNumber) {
        return res.status(404).json({ error: "Phone number not found" });
      }
      
      // Broadcast to connected clients
      broadcastToClients("phoneNumber:updated", phoneNumber);
      
      res.json(phoneNumber);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Failed to update phone number:", error);
      res.status(500).json({ error: "Failed to update phone number" });
    }
  });

  // Delete phone number
  app.delete("/api/phone-numbers/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deletePhoneNumber(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Phone number not found" });
      }
      
      // Broadcast to connected clients
      broadcastToClients("phoneNumber:deleted", { id: req.params.id });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete phone number:", error);
      res.status(500).json({ error: "Failed to delete phone number" });
    }
  });

  // ==================== APPOINTMENT SCHEDULING ENDPOINTS ====================
  
  // Schedule appointment via agent
  app.post("/api/agents/:agentId/schedule-appointment", async (req: Request, res: Response) => {
    try {
      const agentId = req.params.agentId;
      const agent = await storage.getAgent(agentId);
      
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      
      const { AppointmentScheduler } = await import("./services/appointment-scheduler");
      const scheduler = new AppointmentScheduler();
      
      const result = await scheduler.scheduleAppointment({
        agent,
        customerEmail: req.body.customerEmail,
        customerName: req.body.customerName,
        customerPhone: req.body.customerPhone,
        preferredTime: req.body.preferredTime,
        additionalNotes: req.body.additionalNotes,
      });
      
      res.json(result);
    } catch (error) {
      console.error("Failed to schedule appointment:", error);
      res.status(500).json({ error: error.message || "Failed to schedule appointment" });
    }
  });

  // ==================== MICROSOFT OAUTH ENDPOINTS ====================
  
  // Get Microsoft auth URL
  app.get("/api/microsoft/auth-url", async (req: Request, res: Response) => {
    try {
      const { microsoftAuth } = await import("./services/microsoft-auth");
      const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const redirectUri = `${protocol}://${domain}/api/microsoft/callback`;
      
      // Always use admin consent for permanent access
      const authUrl = await microsoftAuth.getAuthorizationUrlWithAdminConsent(redirectUri);
      res.json({ authUrl });
    } catch (error) {
      console.error("Failed to get auth URL:", error);
      res.status(500).json({ error: "Failed to generate authorization URL" });
    }
  });
  
  // Microsoft OAuth callback
  app.get("/api/microsoft/callback", async (req: Request, res: Response) => {
    try {
      const { code } = req.query;
      if (!code || typeof code !== 'string') {
        return res.status(400).send("Authorization code missing");
      }
      
      const { microsoftAuth } = await import("./services/microsoft-auth");
      const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const redirectUri = `${protocol}://${domain}/api/microsoft/callback`;
      
      // Get token and user email
      const tokenResult = await microsoftAuth.acquireTokenByCode(code, redirectUri);
      
      // Store the connection status
      await storage.setSetting("microsoft_connected", true);
      await storage.setSetting("microsoft_token_acquired", new Date().toISOString());
      await storage.setSetting("microsoft_auth_type", "delegated");
      
      // Get user profile for additional details
      try {
        const profile = await microsoftAuth.getUserProfile();
        const userEmail = profile.mail || profile.userPrincipalName || tokenResult.userEmail;
        await storage.setSetting("microsoft_email", userEmail);
        
        // Automatically sync emails after successful login
        console.log("Auto-syncing emails for user:", userEmail);
        const outlookEmails = await microsoftAuth.fetchEmails("inbox", 50);
        
        let syncedCount = 0;
        for (const outlookEmail of outlookEmails) {
          const emailData = microsoftAuth.convertToEmail(outlookEmail);
          
          // Check if email already exists
          const existing = await db.select().from(emails)
            .where(eq(emails.messageId, outlookEmail.id))
            .limit(1);
          
          if (existing.length === 0) {
            await storage.createEmail({
              ...emailData,
              messageId: outlookEmail.id,
            } as any);
            syncedCount++;
          }
        }
        
        console.log(`Auto-sync completed: ${syncedCount} new emails imported`);
      } catch (syncError) {
        console.error("Auto-sync failed:", syncError);
        // Don't fail the whole OAuth process if sync fails
      }
      
      // Close the popup window and send success message to parent
      res.send(`
        <html>
          <head>
            <style>
              body { font-family: system-ui; text-align: center; padding: 50px; }
              h2 { color: #10b981; }
              .error h2 { color: #ef4444; }
            </style>
          </head>
          <body>
            <h2>✅ Outlook erfolgreich verbunden!</h2>
            <p>Sie können dieses Fenster nun schließen.</p>
            <p style="color: #666; margin-top: 20px;">Das Fenster schließt sich automatisch...</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'outlook-connected', success: true }, '*');
                setTimeout(() => window.close(), 2000);
              } else {
                setTimeout(() => {
                  window.location.href = '/settings?outlook=connected';
                }, 2000);
              }
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.send(`
        <html>
          <head>
            <style>
              body { font-family: system-ui; text-align: center; padding: 50px; }
              h2 { color: #ef4444; }
            </style>
          </head>
          <body class="error">
            <h2>❌ Fehler bei der Outlook-Verbindung</h2>
            <p>${error.message || 'Ein unbekannter Fehler ist aufgetreten.'}</p>
            <p style="color: #666; margin-top: 20px;">Bitte versuchen Sie es erneut.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'outlook-connected', success: false, error: '${error.message || "Verbindung fehlgeschlagen"}' }, '*');
                setTimeout(() => window.close(), 3000);
              } else {
                setTimeout(() => {
                  window.location.href = '/settings?outlook=error';
                }, 3000);
              }
            </script>
          </body>
        </html>
      `);
    }
  });
  
  // Get Microsoft connection status
  app.get("/api/microsoft/status", async (req: Request, res: Response) => {
    try {
      const connected = await storage.getSetting("microsoft_connected");
      const email = await storage.getSetting("microsoft_email");
      const tokenAcquired = await storage.getSetting("microsoft_token_acquired");
      
      res.json({
        connected: connected?.value === true,
        email: email?.value || null,
        tokenAcquired: tokenAcquired?.value || null
      });
    } catch (error) {
      console.error("Failed to get Microsoft status:", error);
      res.status(500).json({ error: "Failed to get connection status" });
    }
  });

  // Manual token configuration
  app.post("/api/microsoft/manual-token", async (req: Request, res: Response) => {
    try {
      const { accessToken, userEmail } = req.body;
      
      if (!accessToken || !userEmail) {
        return res.status(400).json({ error: "Access token and email are required" });
      }
      
      const { microsoftAuth } = await import("./services/microsoft-auth");
      
      // Set the manual access token
      microsoftAuth.setManualAccessToken(accessToken, userEmail);
      
      // Store the connection status
      await storage.setSetting("microsoft_connected", true);
      await storage.setSetting("microsoft_token_acquired", new Date().toISOString());
      await storage.setSetting("microsoft_email", userEmail);
      
      res.json({ 
        success: true,
        message: "Access token configured successfully"
      });
    } catch (error) {
      console.error("Failed to set manual token:", error);
      res.status(500).json({ error: "Failed to configure access token" });
    }
  });

  // Use client credentials for application access
  app.post("/api/microsoft/app-auth", async (req: Request, res: Response) => {
    try {
      const { targetMailbox = "info@sovoice.ai" } = req.body;
      
      const { microsoftAuth } = await import("./services/microsoft-auth");
      
      // Use client credentials to get app-level access
      await microsoftAuth.acquireTokenByClientCredentials(targetMailbox);
      
      // Store the connection status
      await storage.setSetting("microsoft_connected", true);
      await storage.setSetting("microsoft_token_acquired", new Date().toISOString());
      await storage.setSetting("microsoft_email", targetMailbox);
      await storage.setSetting("microsoft_auth_type", "application");
      
      res.json({ 
        success: true,
        message: "Application authentication successful",
        mailbox: targetMailbox
      });
    } catch (error) {
      console.error("Failed to authenticate with client credentials:", error);
      res.status(500).json({ 
        error: "Failed to authenticate. Please ensure your Azure App has the correct application permissions (Mail.Read, Mail.ReadWrite) with admin consent." 
      });
    }
  });

  // Verify Microsoft Graph permissions
  app.get("/api/microsoft/verify", async (req: Request, res: Response) => {
    try {
      const { microsoftAuth } = await import("./services/microsoft-auth");
      const { targetMailbox = "info@sovoice.ai" } = req.query;
      
      let delegatedResult = null;
      let applicationResult = null;
      
      // Check if we have environment variables configured
      const hasCredentials = !!(
        process.env.MICROSOFT_CLIENT_ID &&
        process.env.MICROSOFT_CLIENT_SECRET &&
        process.env.MICROSOFT_TENANT_ID
      );

      if (!hasCredentials) {
        return res.status(400).json({
          success: false,
          error: "Microsoft Azure credentials not configured",
          message: "Please configure MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_TENANT_ID"
        });
      }

      // Try to verify delegated permissions if we have a token
      const authType = await storage.getSetting("microsoft_auth_type");
      const isConnected = await storage.getSetting("microsoft_connected");
      
      if (isConnected) {
        try {
          if (authType === "application") {
            // For app auth, we already have the mailbox set
            applicationResult = await microsoftAuth.verifyApplicationPermissions(targetMailbox as string);
          } else {
            // For delegated auth
            delegatedResult = await microsoftAuth.verifyDelegatedPermissions();
          }
        } catch (error) {
          console.error("Verification error:", error);
        }
      }

      // If not connected or delegated verification failed, try application permissions
      if (!delegatedResult || !delegatedResult.success) {
        try {
          applicationResult = await microsoftAuth.verifyApplicationPermissions(targetMailbox as string);
        } catch (error) {
          console.error("Application verification error:", error);
        }
      }

      // Store verification results
      const verificationResults = {
        timestamp: new Date().toISOString(),
        delegated: delegatedResult,
        application: applicationResult,
        recommendations: [] as string[],
        hasCredentials,
        overall: {
          success: false,
          authType: null as string | null,
          mailRead: false,
          mailReadWrite: false,
        }
      };

      // Determine overall status
      if (delegatedResult?.success) {
        verificationResults.overall.success = true;
        verificationResults.overall.authType = "delegated";
        verificationResults.overall.mailRead = delegatedResult.scopeChecks.read;
        verificationResults.overall.mailReadWrite = delegatedResult.scopeChecks.readWrite;
      } else if (applicationResult?.success) {
        verificationResults.overall.success = true;
        verificationResults.overall.authType = "application";
        verificationResults.overall.mailRead = applicationResult.scopeChecks.read;
        verificationResults.overall.mailReadWrite = applicationResult.scopeChecks.readWrite;
      }

      // Add recommendations based on results
      if (!verificationResults.overall.success) {
        verificationResults.recommendations.push(
          "Ensure your Azure App has Mail.Read and Mail.ReadWrite permissions configured",
          "Grant admin consent for all requested permissions in Azure Portal",
          "Verify the target mailbox exists and is accessible"
        );
      }

      if (!verificationResults.overall.mailRead) {
        verificationResults.recommendations.push(
          "Mail.Read permission is missing or not consented"
        );
      }

      if (!verificationResults.overall.mailReadWrite) {
        verificationResults.recommendations.push(
          "Mail.ReadWrite permission is missing or not consented"
        );
      }

      // Store last verification timestamp
      await storage.setSetting("microsoft_last_verification", new Date().toISOString());
      await storage.setSetting("microsoft_verification_result", JSON.stringify(verificationResults));

      res.json(verificationResults);
    } catch (error) {
      console.error("Verification endpoint error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to verify permissions",
        message: (error as Error).message
      });
    }
  });
  
  // Sync emails from Outlook
  app.post("/api/microsoft/sync", async (req: Request, res: Response) => {
    try {
      const { microsoftAuth } = await import("./services/microsoft-auth");
      const { folder = "inbox", limit = 50 } = req.body;
      
      // Fetch emails from Outlook
      const outlookEmails = await microsoftAuth.fetchEmails(folder, limit);
      
      // Convert and store in our database
      let syncedCount = 0;
      for (const outlookEmail of outlookEmails) {
        const emailData = microsoftAuth.convertToEmail(outlookEmail);
        
        // Check if email already exists
        const existing = await db.select().from(emails)
          .where(eq(emails.messageId, outlookEmail.id))
          .limit(1);
        
        if (existing.length === 0) {
          await storage.createEmail({
            ...emailData,
            messageId: outlookEmail.id,
          } as any);
          syncedCount++;
        }
      }
      
      res.json({ 
        success: true, 
        syncedCount,
        totalFetched: outlookEmails.length 
      });
    } catch (error) {
      console.error("Failed to sync emails:", error);
      res.status(500).json({ error: "Failed to sync emails from Outlook" });
    }
  });
  
  // Send email via Outlook
  app.post("/api/microsoft/send", async (req: Request, res: Response) => {
    try {
      const { microsoftAuth } = await import("./services/microsoft-auth");
      const { to, cc, bcc, subject, body, isHtml } = req.body;
      
      await microsoftAuth.sendEmail({
        to,
        cc,
        bcc,
        subject,
        body,
        isHtml
      });
      
      // Also save to our database
      await storage.createEmail({
        to,
        cc: cc || [],
        bcc: bcc || [],
        subject,
        body,
        bodyHtml: isHtml ? body : undefined,
        from: "info@sovoice.ai",
        status: "sent",
        folder: "sent",
        sentAt: new Date()
      } as any);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to send email via Outlook:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });
  
  // ==================== EMAIL API ENDPOINTS ====================
  
  // Get emails
  app.get("/api/emails", async (req: Request, res: Response) => {
    try {
      const folder = req.query.folder as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const emails = await storage.getEmails(folder, limit);
      res.json(emails);
    } catch (error) {
      console.error("Failed to get emails:", error);
      res.status(500).json({ error: "Failed to get emails" });
    }
  });

  // Get specific email
  app.get("/api/emails/:id", async (req: Request, res: Response) => {
    try {
      const email = await storage.getEmail(req.params.id);
      if (!email) {
        return res.status(404).json({ error: "Email not found" });
      }
      res.json(email);
    } catch (error) {
      console.error("Failed to get email:", error);
      res.status(500).json({ error: "Failed to get email" });
    }
  });

  // Get emails by thread
  app.get("/api/threads/:threadId/emails", async (req: Request, res: Response) => {
    try {
      const emails = await storage.getEmailsByThread(req.params.threadId);
      res.json(emails);
    } catch (error) {
      console.error("Failed to get thread emails:", error);
      res.status(500).json({ error: "Failed to get thread emails" });
    }
  });

  // Create/send email
  app.post("/api/emails", async (req: Request, res: Response) => {
    try {
      const emailData = {
        ...req.body,
        from: req.body.from || "info@sovoice.ai",
        sentAt: req.body.status === "sent" ? new Date() : undefined
      };
      
      const email = await storage.createEmail(emailData);
      
      // Broadcast to connected clients
      broadcastToClients("email:created", email);
      
      res.json(email);
    } catch (error) {
      console.error("Failed to create email:", error);
      res.status(500).json({ error: "Failed to create email" });
    }
  });

  // Update email
  app.patch("/api/emails/:id", async (req: Request, res: Response) => {
    try {
      const email = await storage.updateEmail(req.params.id, req.body);
      if (!email) {
        return res.status(404).json({ error: "Email not found" });
      }
      
      // Broadcast to connected clients
      broadcastToClients("email:updated", email);
      
      res.json(email);
    } catch (error) {
      console.error("Failed to update email:", error);
      res.status(500).json({ error: "Failed to update email" });
    }
  });

  // Delete email
  app.delete("/api/emails/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteEmail(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Email not found" });
      }
      
      // Broadcast to connected clients
      broadcastToClients("email:deleted", { id: req.params.id });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete email:", error);
      res.status(500).json({ error: "Failed to delete email" });
    }
  });

  // Mark email as read
  app.post("/api/emails/:id/read", async (req: Request, res: Response) => {
    try {
      const email = await storage.markEmailAsRead(req.params.id);
      if (!email) {
        return res.status(404).json({ error: "Email not found" });
      }
      
      // Broadcast to connected clients
      broadcastToClients("email:read", { id: req.params.id });
      
      res.json(email);
    } catch (error) {
      console.error("Failed to mark email as read:", error);
      res.status(500).json({ error: "Failed to mark email as read" });
    }
  });

  // Toggle email star
  app.post("/api/emails/:id/star", async (req: Request, res: Response) => {
    try {
      const email = await storage.toggleEmailStar(req.params.id);
      if (!email) {
        return res.status(404).json({ error: "Email not found" });
      }
      
      // Broadcast to connected clients
      broadcastToClients("email:starred", email);
      
      res.json(email);
    } catch (error) {
      console.error("Failed to toggle email star:", error);
      res.status(500).json({ error: "Failed to toggle email star" });
    }
  });

  // Move email to folder
  app.post("/api/emails/:id/move", async (req: Request, res: Response) => {
    try {
      const { folder } = req.body;
      if (!folder) {
        return res.status(400).json({ error: "Folder is required" });
      }
      
      const email = await storage.moveEmailToFolder(req.params.id, folder);
      if (!email) {
        return res.status(404).json({ error: "Email not found" });
      }
      
      // Broadcast to connected clients
      broadcastToClients("email:moved", { id: req.params.id, folder });
      
      res.json(email);
    } catch (error) {
      console.error("Failed to move email:", error);
      res.status(500).json({ error: "Failed to move email" });
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

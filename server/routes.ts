import type { Express, Request, Response } from "express";
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
  type Call, 
  type Agent,
  type ChatSession 
} from "@shared/schema";
import { getTwilioClient, getTwilioFromPhoneNumber } from "./twilio-client";
import { transcribeAudio } from "./openai-client";
import { sendChatMessage } from "./claude-client";
import { OpenAIRealtimeSession } from "./openai-realtime-session";
import { ElevenLabsRealtimeSession } from "./elevenlabs-realtime-session";
import { getElevenLabsVoices } from "./elevenlabs-client";
import { z } from "zod";

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

export async function registerRoutes(app: Express): Promise<Server> {
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

  // Create call (initiate outbound call)
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
      
      // Enhanced system prompt for Claude Sonnet 4 with professional agent creation capabilities
      const systemPrompt = `You are **SoVoice AI**, an expert conversational assistant specializing in creating and managing AI-powered voice call agents. You combine deep technical knowledge with an intuitive, user-friendly approach to help users build sophisticated phone AI systems.

<core_mission>
Guide users through the complete lifecycle of AI voice agent creation—from ideation to deployment—with clarity, expertise, and conversational warmth. Your goal is to help users create agents that deliver exceptional phone experiences.
</core_mission>

<your_capabilities>
**Agent Creation & Configuration:**
- Design and configure AI voice agents for phone calls (customer service, sales, support, etc.)
- Craft effective system prompts that define agent behavior, knowledge, and personality
- Select optimal voice providers and voices based on use case requirements
- Configure multilingual agents (English, German, Spanish, French, and more)

**Voice Technology Expertise:**
- **OpenAI Realtime API** - 13 voices, ultra-low latency, real-time conversation flow, native interruption handling
- **ElevenLabs TTS** - 20+ premium voices, exceptional naturalness and expressiveness, ideal for high-quality experiences

**Best Practices Guidance:**
- System prompt engineering for natural, context-aware conversations
- Voice selection matching agent personality and use case
- Multilingual strategy and localization considerations
- Performance optimization and user experience design
</your_capabilities>

<agent_creation_workflow>
**Step 1: Understand the Use Case**
Ask about the agent's primary purpose. Examples:
- "What will this agent help users with?" (e.g., customer support, appointment scheduling, sales inquiries)
- "Who is the target audience?" (e.g., customers, patients, clients)
- Understand business context to tailor recommendations

**Step 2: Define Agent Behavior**
Collaboratively design the agent's personality and capabilities:
- **Tone & Personality:** Professional? Friendly? Empathetic? Authoritative?
- **Knowledge Domain:** What should the agent know? (products, services, FAQs)
- **Conversation Flow:** How should it handle greetings, questions, objections, escalations?
- **Boundaries:** What topics should it avoid or escalate to humans?

**Best Practice:** Create detailed, structured system prompts. Example template:
\\\`\\\`\\\`
Role: [What the agent is]
Knowledge: [What it knows about]
Behavior: [How it should act and respond]
Constraints: [What it should not do]
\\\`\\\`\\\`

**Step 3: Choose Voice Provider**
Present options based on requirements:

🚀 **OpenAI Realtime API** (Recommended for most use cases)
- **Pros:** Ultra-low latency, real-time conversation flow, native interruption handling, 13 diverse voices
- **Best for:** Interactive conversations, customer support, real-time assistance
- **Voices:** alloy (neutral), echo (warm), onyx (authoritative), nova (energetic), marin (professional), and 8 more

🎙️ **ElevenLabs TTS** (Premium Quality)
- **Pros:** Exceptional naturalness, 20+ premium voices, highly expressive, diverse accents
- **Best for:** Brand experiences, storytelling, premium customer service, specific voice requirements
- **Voices:** Sarah (confident), Eric (smooth), Alice (British), Brian (comforting), and many more

**Step 4: Select the Perfect Voice**
Match voice characteristics to agent personality and use case:

**OpenAI Voices (13 options):**
- **alloy** - Neutral, balanced, universal appeal
- **echo** - Warm, friendly, approachable
- **fable** - Expressive, engaging, storytelling
- **onyx** - Deep, authoritative, trustworthy
- **nova** - Energetic, enthusiastic, youthful
- **shimmer** - Soft, gentle, calming
- **ash** - Conversational, natural, relatable
- **ballad** - Smooth, pleasant, professional
- **coral** - Bright, cheerful, optimistic
- **sage** - Wise, calm, reassuring
- **verse** - Narrative, storytelling, engaging
- **cedar** - Grounded, stable, reliable
- **marin** - Confident, professional, clear

**ElevenLabs Voices (20+ premium options):**
- **Sarah** - Young adult, confident and warm (great for customer service)
- **Eric** - Smooth tenor, perfect for professional use
- **Alice** - Clear and engaging, British accent (brand sophistication)
- **Brian** - Resonant and comforting (healthcare, support)
- **Jessica** - Playful American female (casual, friendly)
- **Plus many more** - Diverse accents, ages, and personalities

**Voice Selection Tips:**
- Customer service → Warm, friendly voices (echo, Sarah, Jessica)
- Technical support → Clear, professional voices (marin, Alice, Eric)
- Sales → Confident, engaging voices (nova, coral, Eric)
- Healthcare → Calm, reassuring voices (sage, Brian, shimmer)

**Step 5: Language & Localization**
- Default: English (en)
- Supported: German (de), Spanish (es), French (fr), and many more
- Tip: Match language to target audience for best experience
</agent_creation_workflow>

<when_to_create_agent>
**Create immediately when you have:**
1. **Minimum Viable Configuration:**
   - Agent name
   - Basic purpose/use case
   - Voice provider preference
   - Voice selection

2. **Explicit User Request:**
   - "Create it now"
   - "Make the agent"
   - "Go ahead and create it"
   - "I'm ready to create the agent"

**Smart Defaults (use when information is missing):**
- **Voice Provider:** openai (most versatile)
- **Voice (OpenAI):** alloy (neutral, universal)
- **Voice (ElevenLabs):** Sarah (professional, warm)
- **Language:** en (English)
- **System Prompt:** Generate professional prompt based on stated purpose

**Philosophy:** Don't over-ask. When users express readiness to create, trust their decision and proceed with intelligent defaults. You can always iterate and refine later.
</when_to_create_agent>

<agent_creation_format>
When creating an agent, respond in this EXACT format:

AGENT_CREATE:
{
  "name": "Agent Name (clear, descriptive)",
  "description": "Brief, compelling description of what this agent does (1-2 sentences)",
  "prompt": "Detailed, well-structured system prompt with role, knowledge, behavior, and constraints",
  "voiceProvider": "openai|elevenlabs",
  "voice": "voice_id (alloy, echo, Sarah, Eric, etc.)",
  "language": "en|de|es|fr|etc"
}

**Critical Requirements:**
- voiceProvider MUST be exactly "openai" OR "elevenlabs" (lowercase)
- voice for OpenAI MUST be one of: alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, cedar, marin
- voice for ElevenLabs MUST be a valid voice name (case-sensitive): Sarah, Eric, Alice, Brian, Jessica, etc.
- prompt should be comprehensive (100-300 words), covering role, knowledge, behavior, and boundaries
- language should be ISO 639-1 code (en, de, es, fr, etc.)

**Example System Prompt Structure:**
\\\`\\\`\\\`
You are [role/identity]. Your primary responsibility is to [main purpose].

Knowledge & Expertise:
- [Key knowledge area 1]
- [Key knowledge area 2]
- [Key knowledge area 3]

Behavior & Communication Style:
- Be [personality traits: professional, friendly, empathetic, etc.]
- Use [tone: conversational, formal, warm, etc.]
- Always [key behavior 1]
- Never [key behavior 2]

Conversation Guidelines:
- Start with [greeting approach]
- When asked about [topic], [specific guidance]
- If uncertain, [escalation or clarification strategy]

Boundaries:
- Do not [restriction 1]
- Escalate to human if [escalation trigger]
- Stay within [scope limitation]
\\\`\\\`\\\`
</agent_creation_format>

<interaction_style>
**Communication Principles:**
- **Conversational but Professional:** Be warm and approachable while maintaining expertise
- **Progressive Disclosure:** Gather information naturally through dialogue—don't overwhelm with questions
- **Clear Explanations:** Use simple language for technical concepts; provide context when needed
- **Structured Thinking:** Break down complex decisions into clear, digestible steps
- **Proactive Guidance:** Offer recommendations based on best practices and use case analysis
- **Responsive:** Match user's communication style (brief vs. detailed, technical vs. layman)

**Language Support:**
- Automatically adapt to user's language (English, German, etc.)
- Provide bilingual guidance when discussing multilingual agents
- Use clear, simple language—avoid unnecessary jargon

**Markdown Formatting:**
- Use **bold** for emphasis on key terms
- Use bullet points for lists and options
- Use code blocks (triple backticks) for system prompts and technical examples
- Use headers (##, ###) to structure longer responses
- Use blockquotes (>) for important notes or tips

**Examples:**
> **Tip:** For customer service agents, I recommend OpenAI's "echo" voice—it's warm and friendly, perfect for building rapport with callers.

Example System Prompt:
You are a professional customer service agent for Acme Corp...
</interaction_style>

<quality_standards>
**Every Agent You Create Should:**
1. Have a clear, well-defined purpose and scope
2. Include a comprehensive, structured system prompt (100-300 words)
3. Use voice selection that matches personality and use case
4. Be production-ready with appropriate behavioral boundaries
5. Reflect best practices in conversational AI design

**Red Flags to Avoid:**
- Vague system prompts ("Be helpful")
- Mismatched voice-personality combinations
- Unclear conversation boundaries
- Missing escalation strategies
- Overly complex or unrealistic capabilities
</quality_standards>

Remember: Your goal is to empower users to create exceptional AI voice agents. Combine your technical expertise with conversational warmth to deliver a world-class experience.`;

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

      // Get AI response using Claude Sonnet 4
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
          model: "claude-sonnet-4-20250514",
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

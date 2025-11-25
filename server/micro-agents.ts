/**
 * Micro-Agent Architecture - Like NLPearl's PearlVibe
 * 
 * Multiple specialized agents running in parallel for speed:
 * - Intent Analyzer
 * - Slot Filler
 * - Context Interpreter
 * - Response Generator
 * - Emotion Handler
 */

import OpenAI from "openai";

interface AgentResult {
  agentName: string;
  result: any;
  confidenceScore: number;
  processingTimeMs: number;
}

interface IntentResult {
  intent: string;
  confidence: number;
  entities: Record<string, string>;
  suggestedAction?: string;
}

interface SlotResult {
  slots: Record<string, string | null>;
  missingSlots: string[];
  completeness: number;
}

interface EmotionResult {
  emotion: string;
  sentiment: "positive" | "neutral" | "negative";
  intensity: number;
  suggestedTone: string;
}

interface ContextResult {
  conversationPhase: "greeting" | "information" | "booking" | "closing";
  topicHistory: string[];
  customerNeeds: string[];
  urgency: "low" | "medium" | "high";
}

class MicroAgentOrchestrator {
  private openai: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  /**
   * Run all micro-agents in parallel on user input
   * Returns combined insights for faster response generation
   */
  async analyzeInput(
    userInput: string,
    conversationHistory: Array<{ role: string; content: string }>,
    agentContext: { name: string; industry: string; services: string[] }
  ): Promise<{
    intent: IntentResult;
    slots: SlotResult;
    emotion: EmotionResult;
    context: ContextResult;
    totalTimeMs: number;
  }> {
    const startTime = Date.now();

    // Run all agents in parallel
    const [intentResult, slotResult, emotionResult, contextResult] = await Promise.all([
      this.runIntentAgent(userInput, agentContext),
      this.runSlotFillerAgent(userInput, conversationHistory),
      this.runEmotionAgent(userInput),
      this.runContextAgent(userInput, conversationHistory)
    ]);

    const totalTimeMs = Date.now() - startTime;
    console.log(`[Micro-Agents] Analysis complete in ${totalTimeMs}ms`);

    return {
      intent: intentResult,
      slots: slotResult,
      emotion: emotionResult,
      context: contextResult,
      totalTimeMs
    };
  }

  /**
   * Intent Analyzer - Determines what the user wants
   */
  private async runIntentAgent(
    userInput: string,
    agentContext: { name: string; industry: string; services: string[] }
  ): Promise<IntentResult> {
    const startTime = Date.now();

    // Fast local intent detection first
    const localIntent = this.detectIntentLocally(userInput);
    if (localIntent.confidence > 0.9) {
      return {
        ...localIntent,
        processingTimeMs: Date.now() - startTime
      } as IntentResult;
    }

    // Fall back to LLM for complex intents
    if (!this.openai) {
      return localIntent;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an intent classifier for ${agentContext.name} (${agentContext.industry}).
Available services: ${agentContext.services.join(", ")}
Classify the user's intent into one of: book_appointment, get_info, ask_price, get_hours, get_location, complaint, greeting, goodbye, other
Also extract any entities (name, email, phone, date, time, service).
Respond in JSON: {"intent": "...", "confidence": 0.0-1.0, "entities": {...}, "suggestedAction": "..."}`
          },
          { role: "user", content: userInput }
        ],
        temperature: 0.1,
        max_tokens: 150
      });

      const content = response.choices[0]?.message?.content || "";
      const parsed = JSON.parse(content);
      return {
        intent: parsed.intent || "other",
        confidence: parsed.confidence || 0.5,
        entities: parsed.entities || {},
        suggestedAction: parsed.suggestedAction
      };
    } catch (error) {
      console.error("[Intent Agent] Error:", error);
      return localIntent;
    }
  }

  /**
   * Fast local intent detection without API call
   */
  private detectIntentLocally(input: string): IntentResult {
    const lower = input.toLowerCase();
    
    // Greeting patterns
    if (/^(hallo|guten tag|hi|hey|moin|servus|grüß)/i.test(lower)) {
      return { intent: "greeting", confidence: 0.95, entities: {} };
    }
    
    // Goodbye patterns
    if (/(tschüss|auf wiedersehen|bye|ciao|bis dann|schönen tag)/i.test(lower)) {
      return { intent: "goodbye", confidence: 0.95, entities: {} };
    }
    
    // Appointment patterns
    if (/(termin|buchen|vereinbaren|wann.*frei|freie.*zeit)/i.test(lower)) {
      return { intent: "book_appointment", confidence: 0.9, entities: {} };
    }
    
    // Price patterns
    if (/(preis|kosten|was kostet|wie teuer|preise)/i.test(lower)) {
      return { intent: "ask_price", confidence: 0.9, entities: {} };
    }
    
    // Hours patterns
    if (/(öffnungszeit|geöffnet|wann.*auf|wann.*offen)/i.test(lower)) {
      return { intent: "get_hours", confidence: 0.9, entities: {} };
    }
    
    // Location patterns
    if (/(adresse|wo.*finde|standort|anfahrt|wie komme)/i.test(lower)) {
      return { intent: "get_location", confidence: 0.9, entities: {} };
    }

    // Extract entities
    const entities: Record<string, string> = {};
    
    // Email extraction
    const emailMatch = lower.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) entities.email = emailMatch[0];
    
    // Phone extraction
    const phoneMatch = lower.match(/[\d\s\-+]{10,}/);
    if (phoneMatch) entities.phone = phoneMatch[0].trim();
    
    // Time extraction
    const timeMatch = lower.match(/(\d{1,2})[:\.]?(\d{2})?\s*(uhr)?/);
    if (timeMatch) entities.time = timeMatch[0];

    return { intent: "other", confidence: 0.3, entities };
  }

  /**
   * Slot Filler - Extracts and tracks required information
   */
  private async runSlotFillerAgent(
    userInput: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<SlotResult> {
    // Define required slots for appointment booking
    const requiredSlots = ["name", "email", "preferred_time"];
    const slots: Record<string, string | null> = {
      name: null,
      email: null,
      phone: null,
      preferred_time: null,
      preferred_date: null,
      service: null
    };

    // Extract from current input
    const lower = userInput.toLowerCase();
    
    // Name extraction
    const namePatterns = [
      /(?:ich heiße|mein name ist|ich bin)\s+([A-ZÄÖÜa-zäöüß]+(?:\s+[A-ZÄÖÜa-zäöüß]+)?)/i,
      /(?:name[:\s]+)([A-ZÄÖÜa-zäöüß]+(?:\s+[A-ZÄÖÜa-zäöüß]+)?)/i
    ];
    for (const pattern of namePatterns) {
      const match = userInput.match(pattern);
      if (match) {
        slots.name = match[1].trim();
        break;
      }
    }

    // Email extraction
    const emailMatch = lower.match(/[\w.-]+\s*(?:at|@|\bat\b)\s*[\w.-]+\s*(?:punkt|\.|\bdot\b)\s*\w+/i);
    if (emailMatch) {
      let email = emailMatch[0]
        .replace(/\s*at\s*/gi, "@")
        .replace(/\s*punkt\s*/gi, ".")
        .replace(/\s*dot\s*/gi, ".")
        .replace(/\s+/g, "");
      slots.email = email;
    } else {
      const simpleEmailMatch = lower.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (simpleEmailMatch) slots.email = simpleEmailMatch[0];
    }

    // Phone extraction
    const phoneMatch = lower.match(/(?:telefon|nummer|handy)?[:\s]*(\+?\d[\d\s\-]{8,})/i);
    if (phoneMatch) slots.phone = phoneMatch[1].replace(/\s/g, "");

    // Time extraction
    const timePatterns = [
      /(?:um|gegen)\s*(\d{1,2})[:\.]?(\d{2})?\s*(uhr)?/i,
      /(\d{1,2})[:\.](\d{2})\s*(uhr)?/i
    ];
    for (const pattern of timePatterns) {
      const match = lower.match(pattern);
      if (match) {
        const hour = match[1];
        const minute = match[2] || "00";
        slots.preferred_time = `${hour}:${minute}`;
        break;
      }
    }

    // Date extraction
    const datePatterns = [
      { pattern: /morgen/i, offset: 1 },
      { pattern: /übermorgen/i, offset: 2 },
      { pattern: /heute/i, offset: 0 },
      { pattern: /nächste woche/i, offset: 7 }
    ];
    for (const { pattern, offset } of datePatterns) {
      if (pattern.test(lower)) {
        const date = new Date();
        date.setDate(date.getDate() + offset);
        slots.preferred_date = date.toISOString().split("T")[0];
        break;
      }
    }

    // Check conversation history for previously mentioned slots
    for (const msg of conversationHistory) {
      if (msg.role === "user") {
        // Re-run extraction on history if current slots are missing
        // This is simplified - production would be more sophisticated
      }
    }

    // Calculate completeness
    const missingSlots = requiredSlots.filter(s => !slots[s]);
    const completeness = (requiredSlots.length - missingSlots.length) / requiredSlots.length;

    return { slots, missingSlots, completeness };
  }

  /**
   * Emotion Handler - Detects customer emotion for appropriate response tone
   */
  private async runEmotionAgent(userInput: string): Promise<EmotionResult> {
    const lower = userInput.toLowerCase();
    
    // Positive indicators
    const positivePatterns = [
      /danke|toll|super|wunderbar|perfekt|freut mich|großartig|ausgezeichnet/i
    ];
    
    // Negative indicators
    const negativePatterns = [
      /ärgerlich|frustriert|enttäuscht|unzufrieden|schlecht|problem|beschwerde/i
    ];
    
    // Urgency indicators
    const urgentPatterns = [
      /dringend|sofort|schnell|eilig|notfall|heute noch/i
    ];

    let emotion = "neutral";
    let sentiment: "positive" | "neutral" | "negative" = "neutral";
    let intensity = 0.5;
    let suggestedTone = "freundlich und professionell";

    for (const pattern of positivePatterns) {
      if (pattern.test(lower)) {
        emotion = "zufrieden";
        sentiment = "positive";
        intensity = 0.7;
        suggestedTone = "warm und enthusiastisch";
        break;
      }
    }

    for (const pattern of negativePatterns) {
      if (pattern.test(lower)) {
        emotion = "unzufrieden";
        sentiment = "negative";
        intensity = 0.8;
        suggestedTone = "verständnisvoll und lösungsorientiert";
        break;
      }
    }

    for (const pattern of urgentPatterns) {
      if (pattern.test(lower)) {
        emotion = "gestresst";
        intensity = 0.9;
        suggestedTone = "schnell und effizient, aber ruhig";
        break;
      }
    }

    return { emotion, sentiment, intensity, suggestedTone };
  }

  /**
   * Context Interpreter - Understands conversation phase and needs
   */
  private async runContextAgent(
    userInput: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<ContextResult> {
    const messageCount = conversationHistory.length;
    const lower = userInput.toLowerCase();
    
    // Determine conversation phase
    let conversationPhase: "greeting" | "information" | "booking" | "closing" = "information";
    
    if (messageCount <= 2) {
      conversationPhase = "greeting";
    } else if (/(tschüss|auf wiedersehen|danke.*anruf|bye)/i.test(lower)) {
      conversationPhase = "closing";
    } else if (/(termin|buchen|name ist|email|telefon)/i.test(lower)) {
      conversationPhase = "booking";
    }

    // Extract topics from history
    const topicHistory: string[] = [];
    const customerNeeds: string[] = [];
    
    for (const msg of conversationHistory) {
      if (msg.role === "user") {
        if (/termin/i.test(msg.content)) topicHistory.push("appointment");
        if (/preis/i.test(msg.content)) topicHistory.push("pricing");
        if (/info/i.test(msg.content)) topicHistory.push("information");
      }
    }

    // Determine urgency
    let urgency: "low" | "medium" | "high" = "medium";
    if (/(dringend|sofort|heute)/i.test(lower)) {
      urgency = "high";
    } else if (/(irgendwann|keine eile|egal wann)/i.test(lower)) {
      urgency = "low";
    }

    return {
      conversationPhase,
      topicHistory: [...new Set(topicHistory)],
      customerNeeds,
      urgency
    };
  }

  /**
   * Generate optimized response based on all agent insights
   */
  async generateOptimizedResponse(
    analysis: {
      intent: IntentResult;
      slots: SlotResult;
      emotion: EmotionResult;
      context: ContextResult;
    },
    agentPrompt: string
  ): Promise<string> {
    // Build context-aware system prompt
    const contextPrompt = `
Aktuelle Analyse:
- Intent: ${analysis.intent.intent} (${Math.round(analysis.intent.confidence * 100)}% sicher)
- Gesprächsphase: ${analysis.context.conversationPhase}
- Kundenemotionen: ${analysis.emotion.emotion} (${analysis.emotion.sentiment})
- Empfohlener Ton: ${analysis.emotion.suggestedTone}
- Dringlichkeit: ${analysis.context.urgency}
- Slot-Vollständigkeit: ${Math.round(analysis.slots.completeness * 100)}%
- Fehlende Informationen: ${analysis.slots.missingSlots.join(", ") || "keine"}

Antworte kurz (2-3 Sätze), im empfohlenen Ton.
${analysis.slots.missingSlots.length > 0 ? `Frage nach: ${analysis.slots.missingSlots[0]}` : ""}
`;

    return contextPrompt;
  }
}

// Singleton instance
export const microAgents = new MicroAgentOrchestrator();

// Convenience function
export async function analyzeUserInput(
  userInput: string,
  conversationHistory: Array<{ role: string; content: string }>,
  agentContext: { name: string; industry: string; services: string[] }
) {
  return microAgents.analyzeInput(userInput, conversationHistory, agentContext);
}

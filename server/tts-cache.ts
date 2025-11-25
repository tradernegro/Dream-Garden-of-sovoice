/**
 * TTS Cache System - Pre-generates and caches common phrases for 0ms latency
 * Inspired by NLPearl's caching strategy
 */

import OpenAI from "openai";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

interface CachedPhrase {
  text: string;
  audioBase64: string;
  voice: string;
  provider: "openai" | "elevenlabs";
  generatedAt: Date;
  durationMs: number;
}

interface CacheStats {
  totalPhrases: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  lastUpdated: Date;
}

class TTSCache {
  private cache: Map<string, CachedPhrase> = new Map();
  private stats: CacheStats = {
    totalPhrases: 0,
    cacheHits: 0,
    cacheMisses: 0,
    hitRate: 0,
    lastUpdated: new Date()
  };

  private openai: OpenAI | null = null;
  private elevenlabs: ElevenLabsClient | null = null;

  // Common phrases that should be pre-cached (German)
  private readonly COMMON_PHRASES_DE = [
    // Greetings
    "Einen wunderschönen guten Tag!",
    "Guten Tag und herzlich willkommen!",
    "Willkommen, wie kann ich Ihnen helfen?",
    "Hallo, schön dass Sie anrufen!",
    
    // Waiting phrases (CRITICAL - these need 0ms latency)
    "Einen Moment bitte.",
    "Einen kleinen Moment.",
    "Ich schaue kurz nach.",
    "Ich prüfe das für Sie.",
    "Lassen Sie mich kurz nachschauen.",
    "Ich überprüfe das schnell.",
    "Geben Sie mir einen Augenblick.",
    
    // Confirmations
    "Ja, das ist richtig.",
    "Genau, das stimmt.",
    "Richtig.",
    "Verstanden.",
    "Alles klar.",
    "Perfekt.",
    "Wunderbar.",
    "Sehr gut.",
    "In Ordnung.",
    
    // Clarifications
    "Könnten Sie das bitte wiederholen?",
    "Ich habe Sie nicht ganz verstanden.",
    "Wie war Ihr Name nochmal?",
    "Können Sie das buchstabieren?",
    
    // Appointment related
    "Ich schaue in den Kalender.",
    "Ich prüfe die verfügbaren Termine.",
    "Ein Termin wurde eingetragen.",
    "Ihr Termin ist bestätigt.",
    "Sie erhalten eine Bestätigung per E-Mail.",
    
    // Transitions
    "Sehr gerne.",
    "Natürlich.",
    "Selbstverständlich.",
    "Kein Problem.",
    "Das mache ich gerne für Sie.",
    
    // Farewells
    "Vielen Dank für Ihren Anruf!",
    "Auf Wiederhören!",
    "Ich wünsche Ihnen einen schönen Tag!",
    "Bis zum nächsten Mal!",
    "Alles Gute!",
    
    // Error handling
    "Entschuldigung, das habe ich nicht verstanden.",
    "Könnten Sie das bitte nochmal sagen?",
    "Es tut mir leid, ich konnte Sie nicht hören.",
    
    // Politeness
    "Bitte.",
    "Gerne.",
    "Danke.",
    "Vielen Dank."
  ];

  // English phrases
  private readonly COMMON_PHRASES_EN = [
    "One moment please.",
    "Let me check that for you.",
    "I understand.",
    "Thank you for calling.",
    "How can I help you today?",
    "Perfect.",
    "Absolutely.",
    "Of course.",
    "Have a great day!",
    "Goodbye!"
  ];

  constructor() {
    this.initializeClients();
  }

  private initializeClients() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.ELEVENLABS_API_KEY) {
      this.elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
    }
  }

  private getCacheKey(text: string, voice: string, provider: string): string {
    return `${provider}:${voice}:${text.toLowerCase().trim()}`;
  }

  /**
   * Get cached audio for a phrase - returns immediately if cached
   */
  async getAudio(text: string, voice: string, provider: "openai" | "elevenlabs"): Promise<string | null> {
    const key = this.getCacheKey(text, voice, provider);
    const cached = this.cache.get(key);

    if (cached) {
      this.stats.cacheHits++;
      this.updateHitRate();
      console.log(`[TTS-Cache] HIT: "${text.substring(0, 30)}..." (${voice})`);
      return cached.audioBase64;
    }

    this.stats.cacheMisses++;
    this.updateHitRate();
    console.log(`[TTS-Cache] MISS: "${text.substring(0, 30)}..." (${voice})`);
    return null;
  }

  /**
   * Check if a phrase is cached
   */
  isCached(text: string, voice: string, provider: "openai" | "elevenlabs"): boolean {
    const key = this.getCacheKey(text, voice, provider);
    return this.cache.has(key);
  }

  /**
   * Pre-warm cache with common phrases for a specific voice
   */
  async warmCache(voice: string, provider: "openai" | "elevenlabs", language: "de" | "en" = "de"): Promise<number> {
    const phrases = language === "de" ? this.COMMON_PHRASES_DE : this.COMMON_PHRASES_EN;
    let cached = 0;

    console.log(`[TTS-Cache] Warming cache for voice "${voice}" (${provider}) - ${phrases.length} phrases...`);

    for (const phrase of phrases) {
      try {
        const key = this.getCacheKey(phrase, voice, provider);
        
        // Skip if already cached
        if (this.cache.has(key)) {
          cached++;
          continue;
        }

        const startTime = Date.now();
        let audioBase64: string | null = null;

        if (provider === "openai" && this.openai) {
          audioBase64 = await this.generateOpenAIAudio(phrase, voice);
        } else if (provider === "elevenlabs" && this.elevenlabs) {
          audioBase64 = await this.generateElevenLabsAudio(phrase, voice);
        }

        if (audioBase64) {
          const durationMs = Date.now() - startTime;
          this.cache.set(key, {
            text: phrase,
            audioBase64,
            voice,
            provider,
            generatedAt: new Date(),
            durationMs
          });
          cached++;
          this.stats.totalPhrases = this.cache.size;
          console.log(`[TTS-Cache] Cached: "${phrase.substring(0, 25)}..." (${durationMs}ms)`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`[TTS-Cache] Failed to cache phrase: "${phrase}"`, error);
      }
    }

    this.stats.lastUpdated = new Date();
    console.log(`[TTS-Cache] Warming complete: ${cached}/${phrases.length} phrases cached for ${voice}`);
    return cached;
  }

  private async generateOpenAIAudio(text: string, voice: string): Promise<string | null> {
    if (!this.openai) return null;

    try {
      const response = await this.openai.audio.speech.create({
        model: "tts-1",
        voice: voice as any,
        input: text,
        response_format: "mp3"
      });

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return base64;
    } catch (error) {
      console.error("[TTS-Cache] OpenAI TTS error:", error);
      return null;
    }
  }

  private async generateElevenLabsAudio(text: string, voiceId: string): Promise<string | null> {
    if (!this.elevenlabs) return null;

    try {
      const audioStream = await this.elevenlabs.textToSpeech.convert(voiceId, {
        text,
        modelId: "eleven_turbo_v2_5",
        outputFormat: "mp3_44100_128"
      });

      const chunks: Buffer[] = [];
      const reader = (audioStream as any).getReader ? (audioStream as any).getReader() : null;
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(Buffer.from(value));
        }
      } else {
        for await (const chunk of audioStream as any) {
          chunks.push(Buffer.from(chunk));
        }
      }
      
      const audioBuffer = Buffer.concat(chunks);
      return audioBuffer.toString("base64");
    } catch (error) {
      console.error("[TTS-Cache] ElevenLabs TTS error:", error);
      return null;
    }
  }

  /**
   * Add a custom phrase to the cache
   */
  async addPhrase(text: string, voice: string, provider: "openai" | "elevenlabs"): Promise<boolean> {
    const key = this.getCacheKey(text, voice, provider);
    
    if (this.cache.has(key)) {
      return true; // Already cached
    }

    const startTime = Date.now();
    let audioBase64: string | null = null;

    if (provider === "openai" && this.openai) {
      audioBase64 = await this.generateOpenAIAudio(text, voice);
    } else if (provider === "elevenlabs" && this.elevenlabs) {
      audioBase64 = await this.generateElevenLabsAudio(text, voice);
    }

    if (audioBase64) {
      this.cache.set(key, {
        text,
        audioBase64,
        voice,
        provider,
        generatedAt: new Date(),
        durationMs: Date.now() - startTime
      });
      this.stats.totalPhrases = this.cache.size;
      return true;
    }

    return false;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
    this.stats.totalPhrases = 0;
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
    this.stats.hitRate = 0;
  }

  private updateHitRate(): void {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    this.stats.hitRate = total > 0 ? (this.stats.cacheHits / total) * 100 : 0;
  }

  /**
   * Get all cached phrases for a voice
   */
  getCachedPhrases(voice: string, provider: "openai" | "elevenlabs"): string[] {
    const phrases: string[] = [];
    const prefix = `${provider}:${voice}:`;
    
    this.cache.forEach((value, key) => {
      if (key.startsWith(prefix)) {
        phrases.push(value.text);
      }
    });
    
    return phrases;
  }
}

// Singleton instance
export const ttsCache = new TTSCache();

// Helper function to check and return cached audio or null
export async function getCachedTTS(
  text: string, 
  voice: string, 
  provider: "openai" | "elevenlabs"
): Promise<string | null> {
  return ttsCache.getAudio(text, voice, provider);
}

// Helper to warm cache for an agent's voice
export async function warmCacheForAgent(
  voice: string, 
  provider: "openai" | "elevenlabs",
  language: "de" | "en" = "de"
): Promise<number> {
  return ttsCache.warmCache(voice, provider, language);
}

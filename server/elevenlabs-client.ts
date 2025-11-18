import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

if (!process.env.ELEVENLABS_API_KEY) {
  throw new Error("ELEVENLABS_API_KEY environment variable is required");
}

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string;
  description?: string;
  labels?: Record<string, string>;
  previewUrl?: string;
}

/**
 * Get all available ElevenLabs voices
 */
export async function getElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
  try {
    const response = await client.voices.getAll();
    return response.voices.map(voice => ({
      voiceId: voice.voiceId,
      name: voice.name || "Unknown Voice",
      category: voice.category || "generated",
      description: voice.description,
      labels: voice.labels,
      previewUrl: voice.previewUrl,
    }));
  } catch (error) {
    console.error("[ElevenLabs] Failed to fetch voices:", error);
    throw new Error(`Failed to fetch ElevenLabs voices: ${(error as Error).message}`);
  }
}

/**
 * Generate speech audio from text using ElevenLabs
 * @param text - Text to convert to speech
 * @param voiceId - ElevenLabs voice ID
 * @param modelId - Model to use (default: eleven_turbo_v2_5 for low latency)
 * @returns Audio buffer in MP3 format
 */
export async function generateSpeech(
  text: string,
  voiceId: string,
  modelId: string = "eleven_turbo_v2_5"
): Promise<Buffer> {
  try {
    const audioStream = await client.textToSpeech.convert(voiceId, {
      text,
      modelId: modelId,
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.75,
      },
    });

    // Convert ReadableStream to buffer
    const chunks: Uint8Array[] = [];
    const reader = audioStream.getReader();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    
    return Buffer.concat(chunks);
  } catch (error) {
    console.error("[ElevenLabs] Speech generation failed:", error);
    throw new Error(`Failed to generate speech: ${(error as Error).message}`);
  }
}

/**
 * Stream speech audio from text (for real-time applications)
 * @param text - Text to convert to speech
 * @param voiceId - ElevenLabs voice ID  
 * @param modelId - Model to use (default: eleven_turbo_v2_5)
 * @returns Async iterable of audio chunks
 */
export async function* streamSpeech(
  text: string,
  voiceId: string,
  modelId: string = "eleven_turbo_v2_5"
): AsyncIterable<Buffer> {
  try {
    const audioStream = await client.textToSpeech.convert(voiceId, {
      text,
      modelId: modelId,
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.75,
      },
    });

    const reader = audioStream.getReader();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield Buffer.from(value);
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    console.error("[ElevenLabs] Speech streaming failed:", error);
    throw new Error(`Failed to stream speech: ${(error as Error).message}`);
  }
}

export { client as elevenLabsClient };

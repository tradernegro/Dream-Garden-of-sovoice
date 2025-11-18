// OpenAI integration using the blueprint
import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
// This is using OpenAI's API, which points to OpenAI's API servers and requires your own API key.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function sendChatMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt?: string
): Promise<string> {
  try {
    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      ...messages.map(msg => ({ role: msg.role, content: msg.content }))
    ];

    console.log("[OpenAI] Sending chat completion request with", chatMessages.length, "messages");

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: chatMessages,
      max_completion_tokens: 2000,
    });

    const content = response.choices[0].message.content;
    console.log("[OpenAI] Response received, content length:", content?.length || 0);
    
    if (!content || content.trim().length === 0) {
      console.warn("[OpenAI] Empty response from GPT-5, using fallback");
      return "I apologize, but I received an empty response. Could you please rephrase your question?";
    }

    return content;
  } catch (error) {
    console.error("[OpenAI] Chat completion error:", error);
    throw new Error("Failed to get AI response: " + (error as Error).message);
  }
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string = "audio/mpeg"): Promise<{ text: string }> {
  try {
    const file = new File([audioBuffer], "audio.mp3", { type: mimeType });
    
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
    });

    return {
      text: transcription.text,
    };
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("Failed to transcribe audio: " + (error as Error).message);
  }
}

export async function analyzeSentiment(text: string): Promise<{
  rating: number,
  confidence: number
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content:
            "You are a sentiment analysis expert. Analyze the sentiment of the text and provide a rating from 1 to 5 stars and a confidence score between 0 and 1. Respond with JSON in this format: { 'rating': number, 'confidence': number }",
        },
        {
          role: "user",
          content: text,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      rating: Math.max(1, Math.min(5, Math.round(result.rating))),
      confidence: Math.max(0, Math.min(1, result.confidence)),
    };
  } catch (error) {
    console.error("Sentiment analysis error:", error);
    throw new Error("Failed to analyze sentiment: " + (error as Error).message);
  }
}

export { openai };

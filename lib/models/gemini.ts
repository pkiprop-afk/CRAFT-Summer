import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireApiKey } from "@/lib/env";
import { GOOGLE_MODEL_ID } from "@/lib/models/registry";
import type { ModelCallResult } from "@/lib/models/types";

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    client = new GoogleGenerativeAI(requireApiKey("google"));
  }
  return client;
}

/**
 * Google exposes no temperature control we set and no effort parameter, so
 * nothing decoding-related is sent. Runs record temperature: null.
 */
export async function callGemini(prompt: string): Promise<ModelCallResult> {
  const model = getClient().getGenerativeModel({ model: GOOGLE_MODEL_ID });
  const result = await model.generateContent(prompt);
  const finishReason = result.response.candidates?.[0]?.finishReason ?? null;

  return {
    text: result.response.text(),
    stop_reason: finishReason,
    truncated: finishReason === "MAX_TOKENS",
    // Google does not report a reasoning-token figure.
    reasoning_tokens: null,
  };
}

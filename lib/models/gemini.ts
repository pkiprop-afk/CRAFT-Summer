import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireApiKey } from "@/lib/env";
import { GOOGLE_MODEL_ID } from "@/lib/models/registry";

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    client = new GoogleGenerativeAI(requireApiKey("google"));
  }
  return client;
}

export async function callGemini(prompt: string): Promise<string> {
  const model = getClient().getGenerativeModel({ model: GOOGLE_MODEL_ID });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireApiKey } from "@/lib/env";

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    client = new GoogleGenerativeAI(requireApiKey("google"));
  }
  return client;
}

export async function callGemini(prompt: string): Promise<string> {
  const model = getClient().getGenerativeModel({ model: "gemini-1.5-pro" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

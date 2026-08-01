import { GoogleGenerativeAI } from "@google/generative-ai";

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    client = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "");
  }
  return client;
}

export async function callGemini(prompt: string): Promise<string> {
  const model = getClient().getGenerativeModel({ model: "gemini-1.5-pro" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

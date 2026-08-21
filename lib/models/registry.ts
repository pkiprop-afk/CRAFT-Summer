// Which vendor family each selectable model belongs to. Used both for API-key
// preflight and (in the run-integrity guards) to keep an evaluator from
// scoring output produced by a model of its own family.
export type ModelFamily = "anthropic" | "openai" | "google";

export const MODEL_FAMILY: Record<string, ModelFamily> = {
  "claude-3-5-sonnet": "anthropic",
  "gpt-4o": "openai",
  "gemini-1.5-pro": "google",
};

export function familyOf(model: string): ModelFamily | null {
  return MODEL_FAMILY[model] ?? null;
}

export const FAMILY_LABEL: Record<ModelFamily, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
};

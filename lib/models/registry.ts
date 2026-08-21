// Which vendor family each selectable model belongs to. Used for API-key
// preflight, availability checking, and the judge-family collision block.
export type ModelFamily = "anthropic" | "openai" | "google";

/**
 * The settled model set.
 *
 * Pinning note: dated snapshot IDs exist only on OpenAI. Anthropic exposes no
 * dated ID for the 5-series and Google exposes none at all for generative
 * models, so two of three are necessarily bare IDs. Because a bare ID can be
 * repointed by the provider mid-study, provenance is captured instead:
 * `created_at` is recorded per model in data/model_manifests/ and stamped onto
 * every result, and `npm run check-models` fails if it moves.
 */
export const TEST_MODELS = ["claude-sonnet-5", "gpt-5.5-2026-04-23"] as const;
export type TestModelId = (typeof TEST_MODELS)[number];

/** Every model that may act as a judge. */
export const EVALUATOR_MODELS = [
  "gemini-2.5-pro",
  "claude-sonnet-5",
  "gpt-5.5-2026-04-23",
] as const;
export type EvaluatorModelId = (typeof EVALUATOR_MODELS)[number];

export const MODEL_FAMILY: Record<string, ModelFamily> = {
  "claude-sonnet-5": "anthropic",
  "gpt-5.5-2026-04-23": "openai",
  "gemini-2.5-pro": "google",
};

export const MODEL_LABEL: Record<string, string> = {
  "claude-sonnet-5": "Claude Sonnet 5",
  "gpt-5.5-2026-04-23": "GPT-5.5 (2026-04-23)",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
};

/** Concrete IDs the provider wrappers send. Imported, never re-typed as literals. */
export const ANTHROPIC_MODEL_ID: TestModelId = "claude-sonnet-5";
export const OPENAI_MODEL_ID: TestModelId = "gpt-5.5-2026-04-23";
export const GOOGLE_MODEL_ID: EvaluatorModelId = "gemini-2.5-pro";

export function familyOf(model: string): ModelFamily | null {
  return MODEL_FAMILY[model] ?? null;
}

export const FAMILY_LABEL: Record<ModelFamily, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
};

/**
 * Judge rotation. The primary judge is always cross-family to both test models;
 * the secondary is the other test model's vendor, which is still cross-family to
 * the output it scores.
 */
export interface JudgeAssignment {
  primary: EvaluatorModelId;
  secondary: EvaluatorModelId;
}

export const JUDGE_ROTATION: Record<TestModelId, JudgeAssignment> = {
  "claude-sonnet-5": { primary: "gemini-2.5-pro", secondary: "gpt-5.5-2026-04-23" },
  "gpt-5.5-2026-04-23": { primary: "gemini-2.5-pro", secondary: "claude-sonnet-5" },
};

/**
 * A judge may never share a vendor family with the model that produced the
 * output it is scoring. Self-family scoring is a validity threat, not a
 * preference — callers must hard-reject, not warn.
 */
export function isFamilyCollision(producingModel: string, judgeModel: string): boolean {
  const producing = familyOf(producingModel);
  const judge = familyOf(judgeModel);
  // Unknown model on either side is treated as a collision: fail closed.
  if (!producing || !judge) return true;
  return producing === judge;
}

export function judgesFor(testModel: TestModelId): JudgeAssignment {
  return JUDGE_ROTATION[testModel];
}

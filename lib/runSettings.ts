/**
 * 5a — Pair settings binding.
 *
 * The two conditions of a pair must be generated under identical decoding
 * settings, or any score difference is confounded by sampling rather than
 * attributable to the prompt.
 *
 * G4 — the hash records WHICH fields it covered, not just a digest.
 *
 * The two test models expose different controls: Claude takes no temperature
 * and an unset `effort`; GPT is temperature-pinned and takes `reasoning_effort`.
 * A bare digest over different field sets would look comparable while meaning
 * different things. The field list is therefore stored alongside the hash AND
 * folded into the hashed payload, so two different field sets can never collide
 * on the same digest even when their shared values are equal.
 *
 * Pair binding remains within-model (task + model + run_type), so this changes
 * interpretability, not matching.
 */
export interface RunSettings {
  /** null where the provider does not accept the parameter. */
  temperature: number | null;
  max_tokens: number;
  system_prompt: string;
  /** Anthropic-style effort. Present (possibly null) only for Anthropic. */
  effort?: string | null;
  /** OpenAI-style reasoning effort. Present only for OpenAI. */
  reasoning_effort?: string | null;
}

const BASE_FIELDS = ["temperature", "max_tokens", "system_prompt"] as const;

/** The ordered field set this settings object is hashed over. */
export function runSettingsFields(settings: RunSettings): string[] {
  const fields: string[] = [...BASE_FIELDS];
  if (settings.effort !== undefined) fields.push("effort");
  if (settings.reasoning_effort !== undefined) fields.push("reasoning_effort");
  return fields;
}

export function runSettingsPayload(settings: RunSettings): string {
  const fields = runSettingsFields(settings);
  // The field list is part of the payload: different field sets cannot produce
  // the same digest.
  return JSON.stringify([
    ["__fields", fields],
    ...fields.map((f) => [f, (settings as unknown as Record<string, unknown>)[f] ?? null]),
  ]);
}

export interface RunSettingsHash {
  hash: string;
  fields: string[];
}

export async function computeRunSettingsHash(
  settings: RunSettings
): Promise<RunSettingsHash> {
  const bytes = new TextEncoder().encode(runSettingsPayload(settings));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { hash: `rs2-${hex.slice(0, 16)}`, fields: runSettingsFields(settings) };
}

export interface SettingsMismatch {
  field: string;
  earlier_value: string;
  attempted_value: string;
}

/** Names every differing field, so the error says what to change. */
export function diffRunSettings(
  earlier: RunSettings,
  attempted: RunSettings
): SettingsMismatch[] {
  const fields = Array.from(
    new Set([...runSettingsFields(earlier), ...runSettingsFields(attempted)])
  );
  const mismatches: SettingsMismatch[] = [];
  for (const field of fields) {
    const a = String((earlier as unknown as Record<string, unknown>)[field] ?? null);
    const b = String((attempted as unknown as Record<string, unknown>)[field] ?? null);
    if (a !== b) {
      mismatches.push({ field, earlier_value: a, attempted_value: b });
    }
  }
  return mismatches;
}

/**
 * 5c — Raised from 2000. CRAFT prompts request structured multi-section output
 * and run materially longer than baseline; at 2000 a CRAFT response could hit
 * the ceiling while its baseline counterpart did not, losing completeness
 * points for a reason unrelated to the prompt condition.
 */
export const DEFAULT_MAX_TOKENS = 4000;

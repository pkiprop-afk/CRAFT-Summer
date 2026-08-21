import { ANTHROPIC_MODEL_ID, OPENAI_MODEL_ID } from "@/lib/models/registry";

/**
 * G2/G3 — Decoding parameters, recorded explicitly per model.
 *
 * Neither test model accepts the originally-specified temperature 0.2:
 *
 *   claude-sonnet-5      "`temperature` is deprecated for this model."
 *                        The parameter is not supported at all. It is omitted
 *                        from the request entirely and recorded as null.
 *
 *   gpt-5.5-2026-04-23   "does not support 0.2 with this model. Only the
 *                        default (1) value is supported."
 *                        The parameter is accepted but pinned by the API, so
 *                        nothing is sent and 1.0 is recorded as what the
 *                        provider used.
 *
 * 0.2 is never sent to either model.
 *
 * Effort controls differ by vendor and are not commensurable — Anthropic's
 * `effort` is left unset (provider default), OpenAI's `reasoning_effort` is
 * pinned to "low" on every call, test model and judge alike.
 */

export const OPENAI_REASONING_EFFORT = "low";

/** The temperature the OpenAI API pins this model to. Recorded, never sent. */
export const OPENAI_PINNED_TEMPERATURE = 1.0;

export interface DecodingParams {
  /** null when the provider does not accept the parameter. */
  temperature: number | null;
  /** Anthropic-style effort. null = unset, provider default. */
  effort?: string | null;
  /** OpenAI-style reasoning effort. */
  reasoning_effort?: string | null;
}

export function decodingParamsFor(model: string): DecodingParams {
  if (model === ANTHROPIC_MODEL_ID) {
    return { temperature: null, effort: null };
  }
  if (model === OPENAI_MODEL_ID) {
    return {
      temperature: OPENAI_PINNED_TEMPERATURE,
      reasoning_effort: OPENAI_REASONING_EFFORT,
    };
  }
  // Google: no temperature control is sent and no effort control exists.
  return { temperature: null };
}

/**
 * 5c — Every provider call reports why generation stopped.
 *
 * CRAFT prompts request structured multi-section output and run longer than
 * baseline, so a token-limit cutoff would cost completeness points for a reason
 * unrelated to the prompt condition. Truncation must be recorded per run and
 * surfaced, not inferred later from output length.
 */
export interface ModelCallResult {
  text: string;
  /** Raw provider value, kept verbatim for auditing. */
  stop_reason: string | null;
  truncated: boolean;
}

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
  /**
   * G5 — reasoning tokens consumed, where the provider reports them (OpenAI).
   * null when the provider exposes no such figure. This is the only behavioural
   * signal of effort level, since neither provider echoes the effort parameter
   * back in the response.
   */
  reasoning_tokens: number | null;
  /**
   * Concatenated thinking-block text, present ONLY when the caller explicitly
   * requested capture (post-run T034-class remedy diagnostics). Never persisted
   * to study records; absent on every ordinary call.
   */
  thinking?: string;
}

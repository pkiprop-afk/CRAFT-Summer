/**
 * Record identifiers.
 *
 * The blinding token is NOT generated here — it is allocated server-side by
 * lib/blinding.ts. The previous generateOutputId() embedded task, condition,
 * model and timestamp in plaintext, so the "anonymized" ID de-anonymized the
 * run to anyone who read it. It has been removed rather than fixed, so no call
 * site can reintroduce it.
 */
export function generateResultId(): string {
  return `RES-${crypto.randomUUID()}`;
}

export function generateEvaluationId(): string {
  return `EVAL-${crypto.randomUUID()}`;
}

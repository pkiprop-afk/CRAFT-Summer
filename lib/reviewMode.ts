/**
 * REVIEW_MODE — read-only archive mode.
 *
 * Set REVIEW_MODE=true to serve the completed study as a browsable archive:
 * every stored result renders from data/*.json, and nothing that generates,
 * evaluates, or writes can be reached. It exists so the study can be read
 * without API keys and without any risk of overwriting the recorded run.
 *
 * The flag is read from the server environment only. Client components receive
 * it through <ReviewModeProvider> in app/layout.tsx rather than a NEXT_PUBLIC_
 * mirror, so there is exactly one variable to set and it is never inlined into
 * the browser bundle at build time.
 */

/** The dates the recorded study was executed — shown in the review banner. */
export const STUDY_WINDOW = {
  /** Generation and evaluation both ran inside a single ~18-hour window. */
  label: "22 August 2026",
  detail: "02:04–20:18 UTC, 22 August 2026",
} as const;

export function isReviewMode(): boolean {
  return (process.env.REVIEW_MODE ?? "").trim().toLowerCase() === "true";
}

/**
 * Guard for any route handler that generates, evaluates, or writes. Returns a
 * 403 Response when review mode is on, or null when the handler should proceed.
 *
 * Call it as the first statement of the handler — before parsing the body, so a
 * blocked request can never reach a provider call or a disk write.
 */
export function reviewModeBlock(): Response | null {
  if (!isReviewMode()) return null;
  return Response.json(
    {
      error:
        "REVIEW_MODE is on: this deployment is a read-only archive of a completed study. " +
        "Generation, evaluation, and any write to data/ are disabled.",
      review_mode: true,
    },
    { status: 403 }
  );
}

import { NextResponse } from "next/server";
import { computeEvalAttemptStats, getEvalAttempts } from "@/lib/evalTelemetry";

/**
 * M1/M2 — evaluation attempt counters, computed over ALL attempts.
 *
 * The batch driver reads its stop conditions from here rather than from saved
 * evaluations or from page text: failures never become saved evaluations, and a
 * DOM scrape can miss an error exactly when the job list is longest.
 */
export async function GET() {
  const attempts = await getEvalAttempts();
  const stats = computeEvalAttemptStats(attempts);
  return NextResponse.json({
    ...stats,
    // Enough to identify a systematic failure without dumping every record.
    recentFailures: attempts
      .filter((a) => a.outcome !== "succeeded_first_try" && a.outcome !== "succeeded_after_retry")
      .slice(-10)
      .map((a) => ({
        recorded_at: a.recorded_at,
        evaluator_model: a.evaluator_model,
        is_primary: a.is_primary,
        outcome: a.outcome,
        retry_count: a.retry_count,
        http_status: a.http_status,
        message: a.message,
      })),
  });
}

import { NextResponse } from "next/server";
import { computeEvalAttemptStats, getEvalAttempts } from "@/lib/evalTelemetry";

/**
 * M1/M2 — evaluation attempt counters, computed over ALL attempts.
 *
 * The batch driver reads its stop conditions from here rather than from saved
 * evaluations or from page text: failures never become saved evaluations, and a
 * DOM scrape can miss an error exactly when the job list is longest.
 */
export async function GET(request: Request) {
  const all = await getEvalAttempts();

  /**
   * `?since=<ISO>` scopes the counters to one run.
   *
   * The store is cumulative and deliberately survives a halt, so a resumed run
   * would otherwise inherit the previous run's failures and could trip its own
   * stop conditions before dispatching anything — which is exactly what
   * happened once a fixed parser made an earlier `unparseable` record obsolete.
   * A run must be judged on its own attempts.
   */
  const since = new URL(request.url).searchParams.get("since");
  const sinceMs = since ? Date.parse(since) : NaN;
  const attempts = Number.isFinite(sinceMs)
    ? all.filter((a) => Date.parse(a.recorded_at) >= sinceMs)
    : all;

  const stats = computeEvalAttemptStats(attempts);
  return NextResponse.json({
    ...stats,
    scopedSince: Number.isFinite(sinceMs) ? since : null,
    totalAllTime: all.length,
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

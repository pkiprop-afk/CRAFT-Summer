import fs from "node:fs/promises";
import path from "node:path";

/**
 * M1 — API-level instrumentation of evaluation attempts.
 *
 * One record per /api/evaluate request, written at every terminal path,
 * INCLUDING the ones that never produce an EvaluationRecord.
 *
 * Why this exists: the previous retry metric was computed over saved
 * evaluations. An evaluation that exhausts its retries is never saved, so it
 * left the denominator along with the numerator — the measure understated
 * degradation, and understated it worse the worse things got. A rate that
 * improves as failures mount is not a safety metric.
 *
 * This is instrumentation, not study data. It is cleared alongside the run
 * stores so rates are never computed across two different runs.
 */

const ATTEMPTS_PATH = path.join(process.cwd(), "data", "eval_attempts.json");

export type EvalAttemptOutcome =
  /** Parsed scores on the first provider call. */
  | "succeeded_first_try"
  /** Parsed scores, but only after one or more retries. */
  | "succeeded_after_retry"
  /**
   * Valid scores, but the judge omitted the Justification line. Counted as a
   * SUCCESS — the measurement is intact — but tracked separately so the
   * omission rate is visible rather than silently absorbed.
   */
  | "parsed_without_justification"
  /** Retry budget exhausted; no scores. */
  | "exhausted"
  /** Provider answered, but the reply did not match the rubric format. */
  | "unparseable"
  /** Failed on something retrying cannot fix (credit, auth, bad request). */
  | "failed_non_retryable"
  /**
   * The judge stopped at its token limit before emitting usable text.
   *
   * Its own outcome because it is a DEFECT in our configuration, not provider
   * flakiness: deterministic for a given prompt and budget, and correlated with
   * task difficulty, so it filters data rather than merely losing it. It must
   * never again be counted as a generic empty response.
   */
  | "judge_truncated";

export interface EvalAttemptRecord {
  recorded_at: string;
  evaluator_model: string;
  is_primary: boolean | null;
  anonymized_output_id: string;
  outcome: EvalAttemptOutcome;
  /** Retries consumed within this attempt (0 = clean first call). */
  retry_count: number;
  http_status: number | null;
  message: string | null;
}

async function readAll(): Promise<EvalAttemptRecord[]> {
  try {
    return JSON.parse(await fs.readFile(ATTEMPTS_PATH, "utf-8")) as EvalAttemptRecord[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
}

/**
 * Serializes appends. The batch runner issues concurrent evaluations, and
 * read-modify-write on a JSON file would otherwise drop records — which on a
 * failure-counting metric would silently bias it toward looking healthy.
 */
let appendChain: Promise<unknown> = Promise.resolve();

export async function recordEvalAttempt(record: EvalAttemptRecord): Promise<void> {
  const run = appendChain.then(async () => {
    const all = await readAll();
    all.push(record);
    await fs.mkdir(path.dirname(ATTEMPTS_PATH), { recursive: true });
    await fs.writeFile(ATTEMPTS_PATH, JSON.stringify(all, null, 2) + "\n", "utf-8");
  });
  appendChain = run.catch(() => undefined);
  return run;
}

export async function getEvalAttempts(): Promise<EvalAttemptRecord[]> {
  return readAll();
}

export interface EvalAttemptStats {
  /** Every attempt, whatever its outcome. The denominator for both rates. */
  total: number;
  succeededFirstTry: number;
  succeededAfterRetry: number;
  parsedWithoutJustification: number;
  exhausted: number;
  unparseable: number;
  failedNonRetryable: number;
  judgeTruncated: number;
  succeeded: number;
  failed: number;
  /** Attempts that consumed at least one retry, over ALL attempts. */
  retried: number;
  retryRate: number | null;
  failureRate: number | null;
  /** Same two rates restricted to the primary judge, which carries every score. */
  primaryTotal: number;
  primaryRetried: number;
  primaryFailed: number;
  /**
   * Per-judge reliability. Reportable in its own right: the retry rate of the
   * primary judge is a property of the instrument every score passed through,
   * and belongs in the methods section rather than in an ops log.
   */
  byJudge: JudgeReliability[];
}

export interface JudgeReliability {
  evaluator_model: string;
  /** A judge is primary for some producing models and secondary for others. */
  role: "primary" | "secondary" | "mixed";
  attempts: number;
  retried: number;
  retryRate: number | null;
  failed: number;
  failureRate: number | null;
}

export function computeJudgeReliability(attempts: EvalAttemptRecord[]): JudgeReliability[] {
  const models = [...new Set(attempts.map((a) => a.evaluator_model))].sort();
  return models.map((model) => {
    const rows = attempts.filter((a) => a.evaluator_model === model);
    const asPrimary = rows.filter((r) => r.is_primary === true).length;
    const retried = rows.filter((r) => r.retry_count > 0).length;
    const failed = rows.filter((r) => FAILURE_OUTCOMES.has(r.outcome)).length;
    return {
      evaluator_model: model,
      role: asPrimary === rows.length ? "primary" : asPrimary === 0 ? "secondary" : "mixed",
      attempts: rows.length,
      retried,
      retryRate: rows.length === 0 ? null : retried / rows.length,
      failed,
      failureRate: rows.length === 0 ? null : failed / rows.length,
    };
  });
}

/**
 * Outcomes that produced NO usable score. A missing justification is
 * deliberately not among them — the scores survived.
 */
const FAILURE_OUTCOMES = new Set<EvalAttemptOutcome>([
  "exhausted",
  "unparseable",
  "failed_non_retryable",
  "judge_truncated",
]);

export function computeEvalAttemptStats(attempts: EvalAttemptRecord[]): EvalAttemptStats {
  const n = (p: (a: EvalAttemptRecord) => boolean) => attempts.filter(p).length;

  const total = attempts.length;
  const exhausted = n((a) => a.outcome === "exhausted");
  const unparseable = n((a) => a.outcome === "unparseable");
  const failedNonRetryable = n((a) => a.outcome === "failed_non_retryable");
  const judgeTruncated = n((a) => a.outcome === "judge_truncated");
  const failed = exhausted + unparseable + failedNonRetryable + judgeTruncated;
  // Counted from retry_count, not from the outcome label, so an attempt that
  // retried and then failed to parse is still counted as a retry.
  const retried = n((a) => a.retry_count > 0);
  const primary = attempts.filter((a) => a.is_primary === true);

  return {
    total,
    succeededFirstTry: n((a) => a.outcome === "succeeded_first_try"),
    succeededAfterRetry: n((a) => a.outcome === "succeeded_after_retry"),
    parsedWithoutJustification: n((a) => a.outcome === "parsed_without_justification"),
    exhausted,
    unparseable,
    failedNonRetryable,
    judgeTruncated,
    succeeded: total - failed,
    failed,
    retried,
    retryRate: total === 0 ? null : retried / total,
    failureRate: total === 0 ? null : failed / total,
    primaryTotal: primary.length,
    primaryRetried: primary.filter((a) => a.retry_count > 0).length,
    primaryFailed: primary.filter((a) => FAILURE_OUTCOMES.has(a.outcome)).length,
    byJudge: computeJudgeReliability(attempts),
  };
}

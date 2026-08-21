import type { EvaluationRecord, ResultRecord } from "@/types";

/**
 * Joins runs to their evaluations.
 *
 * Under the judge rotation every run is scored twice (primary + secondary), so
 * a run's score is not a single number. Aggregates use the MEAN across the
 * judges that scored it, which weights both judges equally.
 *
 * A run scored by fewer than two judges is INCOMPLETE and is excluded from
 * analysis by default: including a singly-judged run would mix a one-judge
 * estimate with two-judge estimates.
 */
export const REQUIRED_JUDGES_PER_RESULT = 2;

export interface ScoredResult {
  result: ResultRecord;
  evaluations: EvaluationRecord[];
  isComplete: boolean;
  /** Mean across judges; null when nothing has scored this run. */
  meanTotal: number | null;
  meanConstraint: number | null;
  meanLogical: number | null;
  meanCompleteness: number | null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function joinResults(
  results: ResultRecord[],
  evaluations: EvaluationRecord[]
): ScoredResult[] {
  const byResult = new Map<string, EvaluationRecord[]>();
  for (const e of evaluations) {
    const list = byResult.get(e.result_id) ?? [];
    list.push(e);
    byResult.set(e.result_id, list);
  }

  return results.map((result) => {
    const evals = byResult.get(result.result_id) ?? [];
    return {
      result,
      evaluations: evals,
      isComplete: evals.length >= REQUIRED_JUDGES_PER_RESULT,
      meanTotal: mean(evals.map((e) => e.total_score_0_10)),
      meanConstraint: mean(evals.map((e) => e.constraint_adherence_score_0_4)),
      meanLogical: mean(evals.map((e) => e.logical_accuracy_score_0_4)),
      meanCompleteness: mean(evals.map((e) => e.completeness_score_0_2)),
    };
  });
}

/** Disagreement between judges on the total score — a judge-reliability signal. */
export function judgeSpread(scored: ScoredResult): number | null {
  const totals = scored.evaluations.map((e) => e.total_score_0_10);
  if (totals.length < 2) return null;
  return Math.max(...totals) - Math.min(...totals);
}

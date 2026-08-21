import type { EvaluationRecord, ResultRecord } from "@/types";

/**
 * Joins runs to their evaluations.
 *
 * SCORING RULE: default aggregates use the PRIMARY judge only, never an average
 * of the two.
 *
 * Averaging would destroy the reliability estimate the second judge exists to
 * produce — and because the secondary judge rotates by producing model (GPT
 * judges Claude, Claude judges GPT), averaging would bake a different judge
 * identity into the Claude and GPT distributions, so the two model columns
 * would no longer be measured on the same instrument.
 *
 * The secondary judge is used only for inter-rater agreement (see lib/irr.ts).
 *
 * A run scored by fewer than two judges is INCOMPLETE and is excluded from
 * analysis by default.
 */
export const REQUIRED_JUDGES_PER_RESULT = 2;

export interface ScoredResult {
  result: ResultRecord;
  evaluations: EvaluationRecord[];
  primary: EvaluationRecord | null;
  secondary: EvaluationRecord | null;
  isComplete: boolean;
  /** Primary-judge scores. These are the study's scores. */
  primaryTotal: number | null;
  primaryConstraint: number | null;
  primaryLogical: number | null;
  primaryCompleteness: number | null;
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
    const primary = evals.find((e) => e.is_primary) ?? null;
    const secondary = evals.find((e) => !e.is_primary) ?? null;

    return {
      result,
      evaluations: evals,
      primary,
      secondary,
      // Complete requires both roles present, not merely two records — two
      // primaries would be a rotation bug, not a scored cell.
      isComplete: primary !== null && secondary !== null,
      primaryTotal: primary?.total_score_0_10 ?? null,
      primaryConstraint: primary?.constraint_adherence_score_0_4 ?? null,
      primaryLogical: primary?.logical_accuracy_score_0_4 ?? null,
      primaryCompleteness: primary?.completeness_score_0_2 ?? null,
    };
  });
}

/** Absolute primary/secondary disagreement on the total score. */
export function judgeSpread(scored: ScoredResult): number | null {
  if (!scored.primary || !scored.secondary) return null;
  return Math.abs(scored.primary.total_score_0_10 - scored.secondary.total_score_0_10);
}

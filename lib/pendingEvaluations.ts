// Relative + extension: the "@/" alias resolves under Next but not under plain
// Node, and this module is loaded by scripts/evaluatePending.ts. Type-only
// imports are erased so they may keep the alias; value imports may not.
import { judgesFor, isFamilyCollision, type EvaluatorModelId } from "./models/registry.ts";
import type { EvaluationRecord, ResultRecord } from "@/types";

/**
 * Recovery path for cells whose GENERATION succeeded but whose judging did not.
 *
 * A stranded cell is expensive and unrecoverable by re-running: the main study
 * is n=1, so /api/run refuses to regenerate it. The output already exists on
 * disk; only the missing judge needs to run.
 *
 * This module decides WHICH judges are missing. It never decides how to score
 * and never produces output — the caller drives the same /api/evaluate route the
 * batch runner uses, so blinding, the family block, retry policy and telemetry
 * are shared. This is a recovery path, not a second pipeline.
 */

export interface PendingJudge {
  result_id: string;
  anonymized_output_id: string;
  task_id: string;
  /**
   * Reported so a pending list is unambiguous: one task has two results per
   * model, and without the condition two distinct cells print identically.
   */
  prompt_condition: string;
  /** The producing model — determines the rotation. Never sent to a judge. */
  model_name: string;
  evaluator: EvaluatorModelId;
  is_primary: boolean;
}

export class RotationIntegrityError extends Error {}

/**
 * Judges that are missing for each result, according to the SAME rotation the
 * batch runner uses.
 *
 * Guarantees, all asserted by tests:
 *   - never proposes a judge that already evaluated that result
 *   - never proposes a second primary
 *   - never proposes a judge sharing the producing model's vendor family
 */
export function findPendingEvaluations(
  results: ResultRecord[],
  evaluations: EvaluationRecord[]
): PendingJudge[] {
  const byResult = new Map<string, EvaluationRecord[]>();
  for (const e of evaluations) {
    byResult.set(e.result_id, [...(byResult.get(e.result_id) ?? []), e]);
  }

  const pending: PendingJudge[] = [];

  for (const r of results) {
    const existing = byResult.get(r.result_id) ?? [];
    const rotation = judgesFor(r.model_name as Parameters<typeof judgesFor>[0]);
    if (!rotation) continue; // unknown producing model — not ours to repair

    const alreadyJudged = new Set(existing.map((e) => e.evaluator_model));
    const hasPrimary = existing.some((e) => e.is_primary);
    const hasSecondary = existing.some((e) => !e.is_primary);

    const candidates: Array<{ evaluator: EvaluatorModelId; is_primary: boolean }> = [
      { evaluator: rotation.primary, is_primary: true },
      { evaluator: rotation.secondary, is_primary: false },
    ];

    for (const c of candidates) {
      // Already scored by this judge — a second record would double-count it.
      if (alreadyJudged.has(c.evaluator)) continue;
      // Exactly one primary and one secondary per result.
      if (c.is_primary && hasPrimary) continue;
      if (!c.is_primary && hasSecondary) continue;
      // Belt and braces: the rotation should never yield this, and if it ever
      // did, filling it in silently would be a validity failure, not a repair.
      if (isFamilyCollision(r.model_name, c.evaluator)) {
        throw new RotationIntegrityError(
          `Refusing to schedule ${c.evaluator} for ${r.result_id}: it shares a vendor ` +
            `family with the producing model ${r.model_name}.`
        );
      }
      pending.push({
        result_id: r.result_id,
        anonymized_output_id: r.anonymized_output_id,
        task_id: r.task_id,
        prompt_condition: r.prompt_condition,
        model_name: r.model_name,
        evaluator: c.evaluator,
        is_primary: c.is_primary,
      });
    }
  }

  return pending;
}

/** Results still short of two judges after a pass. */
export function stillIncomplete(
  results: ResultRecord[],
  evaluations: EvaluationRecord[]
): ResultRecord[] {
  const counts = new Map<string, { primary: number; secondary: number }>();
  for (const e of evaluations) {
    const c = counts.get(e.result_id) ?? { primary: 0, secondary: 0 };
    if (e.is_primary) c.primary++;
    else c.secondary++;
    counts.set(e.result_id, c);
  }
  return results.filter((r) => {
    const c = counts.get(r.result_id);
    return !c || c.primary !== 1 || c.secondary !== 1;
  });
}

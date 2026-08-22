import type { PromptCondition, ResultRecord, RunType } from "@/types";

/**
 * run_number sequencing.
 *
 * The scope of a sequence is one CELL of the design: task x model x condition x
 * run_type. The model is load-bearing — T001/baseline under Claude and
 * T001/baseline under GPT are two different cells, each an n=1 series of its
 * own, and both are run 1.
 *
 * Omitting the model made the two share a counter, so whichever ran second was
 * recorded as run_number 2 and failed the n=1 parity check. That was latent
 * while batches ran one model at a time (it would have surfaced on the second
 * batch); interleaving the models surfaced it on the first.
 *
 * Extracted from the page components so the keying is testable on its own —
 * the bug was invisible precisely because it lived inline in a component.
 */
export interface RunNumberScope {
  task_id: string;
  model_name: string;
  prompt_condition: PromptCondition;
  run_type: RunType;
}

export function runNumberKey(scope: RunNumberScope): string {
  return [scope.task_id, scope.model_name, scope.prompt_condition, scope.run_type].join("::");
}

/** Highest run_number already recorded per cell, so a batch resumes correctly. */
export function seedRunNumberCounts(existing: ResultRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of existing) {
    const key = runNumberKey(r);
    counts.set(key, Math.max(counts.get(key) ?? 0, r.run_number));
  }
  return counts;
}

/**
 * Claims the next run_number for a cell and records the claim.
 *
 * Mutates `counts` so concurrent jobs in the same batch cannot claim the same
 * number — the claim must happen at dispatch, not at save.
 */
export function claimRunNumber(counts: Map<string, number>, scope: RunNumberScope): number {
  const key = runNumberKey(scope);
  const next = (counts.get(key) ?? 0) + 1;
  counts.set(key, next);
  return next;
}

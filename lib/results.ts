import type { PromptCondition } from "@/types";
import type { ScoredResult } from "@/lib/resultsJoin";

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function byCondition(scored: ScoredResult[], condition: PromptCondition) {
  return scored.filter((s) => s.result.prompt_condition === condition);
}

export interface TaskRunGroup {
  baseline: ScoredResult[];
  craft: ScoredResult[];
}

// Groups every run by task_id and condition without collapsing repeat runs —
// a task can have run_number 1..n per condition. Callers decide how to
// reduce each array (e.g. per-task mean for a scatter point).
export function pairByTask(scored: ScoredResult[]): Map<string, TaskRunGroup> {
  const map = new Map<string, TaskRunGroup>();
  for (const s of scored) {
    const entry = map.get(s.result.task_id) ?? { baseline: [], craft: [] };
    entry[s.result.prompt_condition].push(s);
    map.set(s.result.task_id, entry);
  }
  return map;
}

export interface ConditionStats {
  mean: number;
  stddev: number;
  nTasks: number;
}

// Computes a per-task mean first, then averages those per-task means across
// tasks, so a task with more repeat runs doesn't outweigh one with fewer.
// stddev is the run-to-run spread within each task, itself averaged across
// tasks the same way — this is the output-consistency metric.
export function conditionStats(
  scored: ScoredResult[],
  condition: PromptCondition,
  scoreOf: (s: ScoredResult) => number | null
): ConditionStats {
  const byTask = new Map<string, number[]>();
  for (const s of scored) {
    if (s.result.prompt_condition !== condition) continue;
    const value = scoreOf(s);
    if (value === null) continue;
    const scores = byTask.get(s.result.task_id) ?? [];
    scores.push(value);
    byTask.set(s.result.task_id, scores);
  }

  const taskMeans: number[] = [];
  const taskStddevs: number[] = [];
  for (const scores of byTask.values()) {
    taskMeans.push(mean(scores));
    taskStddevs.push(stddev(scores));
  }

  return {
    mean: round(mean(taskMeans)),
    stddev: round(mean(taskStddevs)),
    nTasks: byTask.size,
  };
}

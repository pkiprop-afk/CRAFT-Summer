import type { ResultRecord } from "@/types";

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function byCondition(results: ResultRecord[], condition: "baseline" | "craft") {
  return results.filter((r) => r.prompt_condition === condition);
}

export function pairByTask(results: ResultRecord[]): Map<string, { baseline?: ResultRecord; craft?: ResultRecord }> {
  const map = new Map<string, { baseline?: ResultRecord; craft?: ResultRecord }>();
  for (const r of results) {
    const entry = map.get(r.task_id) ?? {};
    entry[r.prompt_condition] = r;
    map.set(r.task_id, entry);
  }
  return map;
}

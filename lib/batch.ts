import type { PromptCondition, TaskRecord } from "@/types";

export type ConditionScope = PromptCondition | "both";

export type BatchJobStatus = "pending" | "running" | "evaluating" | "done" | "failed";

export interface BatchJob {
  task_id: string;
  domain: TaskRecord["domain"];
  task_description: string;
  condition: PromptCondition;
  status: BatchJobStatus;
  error?: string;
  total_score?: number;
}

export function isTaskReadyForScope(task: TaskRecord, scope: ConditionScope): boolean {
  if (scope === "baseline") return Boolean(task.baseline_prompt);
  if (scope === "craft") return Boolean(task.craft_prompt);
  return Boolean(task.baseline_prompt) && Boolean(task.craft_prompt);
}

export function buildBatchJobs(
  tasks: TaskRecord[],
  selectedIds: Set<string>,
  scope: ConditionScope
): BatchJob[] {
  const conditions: PromptCondition[] = scope === "both" ? ["baseline", "craft"] : [scope];
  const jobs: BatchJob[] = [];

  for (const task of tasks) {
    if (!selectedIds.has(task.task_id)) continue;
    for (const condition of conditions) {
      jobs.push({
        task_id: task.task_id,
        domain: task.domain,
        task_description: task.task_description,
        condition,
        status: "pending",
      });
    }
  }

  return jobs;
}

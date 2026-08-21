import type { Domain, ResultRecord, TaskRecord } from "@/types";
import { isResultStale } from "@/lib/invalidation";

export interface TaskProgressRow {
  task_id: string;
  domain: Domain;
  task_description: string;
  taskDefined: boolean;
  baselinePromptAuthored: boolean;
  craftPromptAuthored: boolean;
  baselineRunComplete: boolean;
  craftRunComplete: boolean;
  /** Runs recorded against an older version of this task's content. */
  staleRuns: number;
}

export function computeTaskProgress(
  tasks: TaskRecord[],
  results: ResultRecord[]
): TaskProgressRow[] {
  return tasks.map((task) => {
    const taskResults = results.filter((r) => r.task_id === task.task_id);
    return {
      task_id: task.task_id,
      domain: task.domain,
      task_description: task.task_description,
      taskDefined: Boolean(
        task.task_description && task.expected_constraints.length > 0 && task.rubric_notes
      ),
      baselinePromptAuthored: Boolean(task.baseline_prompt),
      craftPromptAuthored: Boolean(task.craft_prompt),
      baselineRunComplete: taskResults.some((r) => r.prompt_condition === "baseline"),
      craftRunComplete: taskResults.some((r) => r.prompt_condition === "craft"),
      staleRuns: taskResults.filter((r) => isResultStale(r, task)).length,
    };
  });
}

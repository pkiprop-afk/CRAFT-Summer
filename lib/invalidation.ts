import type { ResultRecord, TaskRecord } from "@/types";
import { changedVersionedFields, versionedFieldsEqual } from "@/lib/taskVersion";

export interface InvalidationEntry {
  task_id: string;
  /** How many already-recorded runs this change would invalidate. */
  affectedRuns: number;
  reason: "content_changed" | "task_deleted";
  changedFields: string[];
}

export interface InvalidationReport {
  entries: InvalidationEntry[];
  totalAffectedRuns: number;
  tasksAffected: number;
}

function countRuns(results: ResultRecord[], taskId: string): number {
  return results.filter((r) => r.task_id === taskId).length;
}

/**
 * 4e — What a pending import would invalidate.
 *
 * The destructive banner keys on deletion, which misses the more dangerous
 * case: a stale file that REVERTS in-app edits. Those tasks show up only as
 * "modified" with destroyed: 0, so the run invalidation has to be surfaced
 * separately and explicitly.
 */
export function computeImportInvalidation(
  existing: TaskRecord[],
  incoming: TaskRecord[],
  destroyedIds: string[],
  results: ResultRecord[]
): InvalidationReport {
  if (results.length === 0) {
    return { entries: [], totalAffectedRuns: 0, tasksAffected: 0 };
  }

  const existingById = new Map(existing.map((t) => [t.task_id, t]));
  const entries: InvalidationEntry[] = [];

  for (const task of incoming) {
    const prior = existingById.get(task.task_id);
    if (!prior) continue; // brand new task cannot have runs
    if (versionedFieldsEqual(prior, task)) continue;

    const affectedRuns = countRuns(results, task.task_id);
    if (affectedRuns === 0) continue;

    entries.push({
      task_id: task.task_id,
      affectedRuns,
      reason: "content_changed",
      changedFields: changedVersionedFields(prior, task),
    });
  }

  for (const taskId of destroyedIds) {
    const affectedRuns = countRuns(results, taskId);
    if (affectedRuns === 0) continue;
    entries.push({
      task_id: taskId,
      affectedRuns,
      reason: "task_deleted",
      changedFields: [],
    });
  }

  return {
    entries,
    totalAffectedRuns: entries.reduce((sum, e) => sum + e.affectedRuns, 0),
    tasksAffected: entries.length,
  };
}

/** A result is stale when the task's content has moved on since the run. */
export function isResultStale(result: ResultRecord, task: TaskRecord | undefined): boolean {
  if (!task) return true; // task no longer exists — orphaned run
  return result.task_version !== task.task_version;
}

export function countStaleResults(results: ResultRecord[], tasks: TaskRecord[]): number {
  const byId = new Map(tasks.map((t) => [t.task_id, t]));
  return results.filter((r) => isResultStale(r, byId.get(r.task_id))).length;
}

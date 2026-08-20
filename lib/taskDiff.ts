import type { TaskRecord } from "@/types";

export type ImportMode = "replace" | "merge";

export const IMPORT_MODES: ImportMode[] = ["merge", "replace"];

export function parseImportMode(raw: string | null): ImportMode {
  // Merge is the default: the app is the working registry after the initial
  // load, so a stray import must never silently destroy in-app edits.
  return raw === "replace" ? "replace" : "merge";
}

// Every stored field is compared. craft_prompt is included even though it is
// derived, because a change to it is a real change to what would be sent to a
// model — it just always co-occurs with a craft_* component change.
const DIFF_FIELDS: (keyof TaskRecord)[] = [
  "task_id",
  "domain",
  "source_or_origin",
  "task_title",
  "task_description",
  "task_input",
  "baseline_prompt",
  "craft_context",
  "craft_role",
  "craft_actions",
  "craft_format",
  "craft_tone",
  "craft_prompt",
  "expected_constraints",
  "rubric_notes",
  "difficulty_level",
  "requires_external_knowledge",
];

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export interface ModifiedTask {
  task_id: string;
  changes: FieldChange[];
}

export interface TaskDiff {
  mode: ImportMode;
  added: string[];
  modified: ModifiedTask[];
  unchanged: string[];
  /** Present only for replace mode: tasks in the store but absent from the file. */
  destroyed: string[];
  addedCount: number;
  modifiedCount: number;
  unchangedCount: number;
  destroyedCount: number;
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "boolean") return String(value);
  return String(value ?? "");
}

function changesBetween(before: TaskRecord, after: TaskRecord): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of DIFF_FIELDS) {
    const b = displayValue(before[field]);
    const a = displayValue(after[field]);
    if (b !== a) changes.push({ field, before: b, after: a });
  }
  return changes;
}

export interface DiffOutcome {
  diff: TaskDiff;
  /** The exact task list that would be written if this import is confirmed. */
  resultingTasks: TaskRecord[];
}

export function computeTaskDiff(
  existing: TaskRecord[],
  incoming: TaskRecord[],
  mode: ImportMode
): DiffOutcome {
  const existingById = new Map(existing.map((t) => [t.task_id, t]));
  const incomingById = new Map(incoming.map((t) => [t.task_id, t]));

  const added: string[] = [];
  const modified: ModifiedTask[] = [];
  const unchanged: string[] = [];

  for (const task of incoming) {
    const prior = existingById.get(task.task_id);
    if (!prior) {
      added.push(task.task_id);
      continue;
    }
    const changes = changesBetween(prior, task);
    if (changes.length === 0) unchanged.push(task.task_id);
    else modified.push({ task_id: task.task_id, changes });
  }

  // Only replace drops anything. Merge leaves absent tasks untouched.
  const destroyed =
    mode === "replace"
      ? existing.filter((t) => !incomingById.has(t.task_id)).map((t) => t.task_id)
      : [];

  let resultingTasks: TaskRecord[];
  if (mode === "replace") {
    resultingTasks = incoming;
  } else {
    // Preserve existing order, apply upserts in place, append genuinely new
    // tasks in file order.
    resultingTasks = existing.map((t) => incomingById.get(t.task_id) ?? t);
    for (const task of incoming) {
      if (!existingById.has(task.task_id)) resultingTasks.push(task);
    }
  }

  return {
    diff: {
      mode,
      added,
      modified,
      unchanged,
      destroyed,
      addedCount: added.length,
      modifiedCount: modified.length,
      unchangedCount: unchanged.length,
      destroyedCount: destroyed.length,
    },
    resultingTasks,
  };
}

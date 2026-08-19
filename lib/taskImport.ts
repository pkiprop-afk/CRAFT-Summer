import { assembleCraftPrompt } from "@/lib/craft";
import type { Domain, TaskRecord } from "@/types";

const VALID_DOMAINS: Domain[] = [
  "coding",
  "data_analysis",
  "finance",
  "policy",
  "education",
  "communication",
];

// task_input is deliberately excluded — some tasks (e.g. "draft an email")
// have no input artifact, only a description. craft_prompt is deliberately
// excluded too: it is never read from the source file, only derived from
// the five components below, so an import can never desync it from them.
const REQUIRED_STRING_FIELDS = [
  "task_id",
  "source_or_origin",
  "task_title",
  "task_description",
  "baseline_prompt",
  "craft_context",
  "craft_role",
  "craft_actions",
  "craft_format",
  "craft_tone",
  "rubric_notes",
  "difficulty_level",
] as const;

export type TaskImportRow = Record<string, string>;

export interface TaskImportError {
  row: number;
  task_id: string;
  reasons: string[];
}

export interface TaskImportResult {
  tasks: TaskRecord[];
  errors: TaskImportError[];
  importedCount: number;
  rejectedCount: number;
  totalRows: number;
}

function parseConstraints(raw: string | undefined): string[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String).filter((s) => s.trim().length > 0);
  } catch {
    // fall through to pipe-delimited parsing
  }
  return trimmed
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBoolean(raw: string | undefined): boolean | null {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return null;
}

export function validateTaskRows(rows: TaskImportRow[]): TaskImportResult {
  const tasks: TaskRecord[] = [];
  const errors: TaskImportError[] = [];
  const seenIds = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const reasons: string[] = [];
    const taskId = (row.task_id ?? "").trim();

    for (const field of REQUIRED_STRING_FIELDS) {
      if (!(row[field] ?? "").trim()) reasons.push(`missing ${field}`);
    }

    const domain = (row.domain ?? "").trim() as Domain;
    if (!domain) {
      reasons.push("missing domain");
    } else if (!VALID_DOMAINS.includes(domain)) {
      reasons.push(`invalid domain "${domain}" (expected one of ${VALID_DOMAINS.join(", ")})`);
    }

    const constraints = parseConstraints(row.expected_constraints);
    if (constraints.length === 0) reasons.push("missing expected_constraints");

    const requiresExternalKnowledge = parseBoolean(row.requires_external_knowledge);
    if (requiresExternalKnowledge === null) {
      reasons.push("requires_external_knowledge must be true/false (or yes/no, 1/0)");
    }

    if (taskId && seenIds.has(taskId)) {
      reasons.push("duplicate task_id (already used earlier in this file)");
    }

    if (reasons.length > 0) {
      errors.push({ row: rowNumber, task_id: taskId || `(row ${rowNumber})`, reasons });
      return;
    }

    seenIds.add(taskId);

    const craftComponents = {
      craft_context: row.craft_context.trim(),
      craft_role: row.craft_role.trim(),
      craft_actions: row.craft_actions.trim(),
      craft_format: row.craft_format.trim(),
      craft_tone: row.craft_tone.trim(),
    };

    tasks.push({
      task_id: taskId,
      domain,
      source_or_origin: row.source_or_origin.trim(),
      task_title: row.task_title.trim(),
      task_description: row.task_description.trim(),
      task_input: (row.task_input ?? "").trim(),
      baseline_prompt: row.baseline_prompt.trim(),
      ...craftComponents,
      craft_prompt: assembleCraftPrompt(craftComponents),
      expected_constraints: constraints,
      rubric_notes: row.rubric_notes.trim(),
      difficulty_level: row.difficulty_level.trim(),
      requires_external_knowledge: requiresExternalKnowledge as boolean,
    });
  });

  return {
    tasks,
    errors,
    importedCount: tasks.length,
    rejectedCount: errors.length,
    totalRows: rows.length,
  };
}

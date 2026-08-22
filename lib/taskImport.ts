// Relative + extension: the "@/" alias resolves under Next but not under plain
// Node, and this module is loaded by Node-run tests. Type-only imports are
// erased so they may keep the alias; value imports may not.
import { assembleCraftPrompt } from "./craft.ts";
import type { Domain, TaskRecord } from "@/types";

const VALID_DOMAINS: Domain[] = [
  "coding",
  "data_analysis",
  "finance",
  "policy",
  "education",
  "communication",
];

// Long-form labels used in the source workbook, mapped to enum values. Keys are
// compared after normalization (lowercase, whitespace-collapsed).
const DOMAIN_LABEL_MAP: Record<string, Domain> = {
  "coding and debugging": "coding",
  "data analysis": "data_analysis",
  "finance and business": "finance",
  "policy and ethics": "policy",
  "education and instructional design": "education",
  "professional communication": "communication",
};

// task_input is deliberately excluded — some tasks have no input artifact.
// craft_prompt is deliberately excluded: it is never read from the source file,
// only derived from the five components, so an import cannot desync it.
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

export const TASK_FIELD_NAMES = [
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
  "expected_constraints",
  "rubric_notes",
  "difficulty_level",
  "requires_external_knowledge",
] as const;

export type TaskImportRow = Record<string, string>;

/**
 * Header normalization: lowercase, trim, collapse internal whitespace runs to a
 * single underscore, then collapse repeated underscores.
 *   "Task_id"                     -> task_id
 *   "rubric notes"                -> rubric_notes
 *   "Requires_external knowledge" -> requires_external_knowledge
 */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

export interface HeaderNormalization {
  original: string;
  normalized: string;
}

export function normalizeRowKeys(rows: TaskImportRow[]): {
  rows: TaskImportRow[];
  normalizations: HeaderNormalization[];
} {
  const normalizations: HeaderNormalization[] = [];
  const seen = new Set<string>();

  const normalized = rows.map((row) => {
    const next: TaskImportRow = {};
    for (const [rawKey, value] of Object.entries(row)) {
      const key = normalizeHeader(rawKey);
      if (!key) continue; // blank trailing columns
      if (key !== rawKey && !seen.has(rawKey)) {
        seen.add(rawKey);
        normalizations.push({ original: rawKey, normalized: key });
      }
      next[key] = value;
    }
    return next;
  });

  return { rows: normalized, normalizations };
}

export type ConstraintSplitMethod = "json" | "pipe" | "numbered" | "unsplit";

export interface ConstraintSplit {
  values: string[];
  method: ConstraintSplitMethod;
  /**
   * For the numbered method: the digit of each "(n)" marker the split keyed on,
   * in order of appearance. Lets the validator detect a parenthesized digit
   * that is NOT a constraint marker — e.g. a constraint quoting `is_locked(5)`
   * splits at that literal, silently importing 6 constraints where 5 were
   * authored. The digits of true markers run exactly 1..count; any duplicate,
   * gap, or out-of-order digit betrays a stray.
   */
  markerDigits?: number[];
}

/**
 * The rubric scores constraint adherence 0-4 against a five-constraint task
 * definition. A task that silently imports with 4 or 6 constraints is scored
 * on a different denominator from every other task — structurally invisible
 * once inside the registry, so it must be stopped at the boundary.
 */
export const REQUIRED_CONSTRAINT_COUNT = 5;

/**
 * Positions (1-based) at which the numbered split keyed on a digit that cannot
 * be a true marker. Markers must run exactly (1), (2), ... in order; the first
 * deviation and everything after it is suspect.
 */
export function strayMarkerPositions(markerDigits: number[]): number[] {
  const stray: number[] = [];
  for (let i = 0; i < markerDigits.length; i++) {
    if (markerDigits[i] !== i + 1 - stray.length) stray.push(i + 1);
  }
  return stray;
}

function sliceByMarkers(text: string, markers: RegExpMatchArray[]): string[] {
  const parts: string[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = (markers[i].index ?? 0) + markers[i][0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index ?? text.length : text.length;
    parts.push(text.slice(start, end));
  }
  return parts;
}

/**
 * Splits the constraints cell, in priority order:
 *   1. JSON array
 *   2. pipe-delimited
 *   3. "(n)" / "n." / "n)" numbered prose
 *   4. otherwise a single-element array, reported as "unsplit" so the row can
 *      be flagged for manual verification rather than accepted silently.
 */
export function splitConstraints(raw: string | undefined): ConstraintSplit {
  const text = (raw ?? "").trim();
  if (!text) return { values: [], method: "unsplit" };

  try {
    const parsed = JSON.parse(text);
    // An array is authoritative even when empty — falling through would turn
    // "[]" into a single constraint containing the literal text "[]".
    if (Array.isArray(parsed)) {
      return {
        values: parsed.map(String).map((s) => s.trim()).filter(Boolean),
        method: "json",
      };
    }
  } catch {
    // not JSON — continue
  }

  if (text.includes("|")) {
    const values = text.split("|").map((s) => s.trim()).filter(Boolean);
    if (values.length > 1) return { values, method: "pipe" };
  }

  // "(1) …" — at least two markers, so a lone "(1)" is not treated as a list.
  const paren = [...text.matchAll(/\(\s*\d+\s*\)\s*/g)];
  if (paren.length >= 2) {
    const values = sliceByMarkers(text, paren).map((s) => s.trim()).filter(Boolean);
    if (values.length > 1) return { values, method: "numbered" };
  }

  // "1. …" or "1) …" at start of line.
  const lineNumbered = [...text.matchAll(/(?:^|\n)\s*\d+[.)]\s+/g)];
  if (lineNumbered.length >= 2) {
    const values = sliceByMarkers(text, lineNumbered).map((s) => s.trim()).filter(Boolean);
    if (values.length > 1) return { values, method: "numbered" };
  }

  return { values: [text], method: "unsplit" };
}

export function parseBooleanCell(raw: string | undefined): boolean | null {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return null;
}

export interface TaskImportError {
  row: number;
  task_id: string;
  reasons: string[];
}

export interface DomainMapping {
  row: number;
  task_id: string;
  original: string;
  mapped: Domain;
}

export interface ConstraintReport {
  row: number;
  task_id: string;
  count: number;
  method: ConstraintSplitMethod;
  flagged: boolean;
}

export interface TaskImportResult {
  tasks: TaskRecord[];
  errors: TaskImportError[];
  importedCount: number;
  rejectedCount: number;
  totalRows: number;
  headerNormalizations: HeaderNormalization[];
  domainMappings: DomainMapping[];
  domainMappedCount: number;
  constraintReports: ConstraintReport[];
  constraintFlaggedCount: number;
  ignoredCraftPromptRows: string[];
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

/**
 * Validates a single task object (e.g. a PUT payload from the editor) through
 * exactly the same rules as the importer, by shaping it into an import row.
 * Guarantees the editor and the import path can never diverge, and that
 * craft_prompt is re-derived server-side rather than trusted from the client.
 */
export function validateSingleTask(input: unknown): {
  task: TaskRecord | null;
  errors: string[];
} {
  if (!input || typeof input !== "object") {
    return { task: null, errors: ["payload must be a task object"] };
  }
  const source = input as Record<string, unknown>;

  const row: TaskImportRow = {};
  for (const field of TASK_FIELD_NAMES) row[field] = asText(source[field]);

  const result = validateTaskRows([row]);
  if (result.tasks.length === 1) return { task: result.tasks[0], errors: [] };
  return { task: null, errors: result.errors[0]?.reasons ?? ["task failed validation"] };
}

/**
 * `rows` may arrive with raw spreadsheet headers; keys are normalized here.
 * Reported row numbers are spreadsheet rows (header is row 1), so they can be
 * looked up directly in Excel.
 */
export function validateTaskRows(rawRows: TaskImportRow[]): TaskImportResult {
  const { rows, normalizations } = normalizeRowKeys(rawRows);

  const tasks: TaskRecord[] = [];
  const errors: TaskImportError[] = [];
  const domainMappings: DomainMapping[] = [];
  const constraintReports: ConstraintReport[] = [];
  const ignoredCraftPromptRows: string[] = [];
  const seenIds = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for 0-based index, +1 for the header row
    const reasons: string[] = [];
    const taskId = (row.task_id ?? "").trim();

    for (const field of REQUIRED_STRING_FIELDS) {
      if (!(row[field] ?? "").trim()) reasons.push(`missing ${field}`);
    }

    // Domain: accept enum values directly, or map a known long label.
    const rawDomain = (row.domain ?? "").trim();
    let domain: Domain | null = null;
    if (!rawDomain) {
      reasons.push("missing domain");
    } else if (VALID_DOMAINS.includes(rawDomain as Domain)) {
      domain = rawDomain as Domain;
    } else {
      const key = rawDomain.toLowerCase().replace(/\s+/g, " ");
      const mapped = DOMAIN_LABEL_MAP[key];
      if (mapped) {
        domain = mapped;
        domainMappings.push({ row: rowNumber, task_id: taskId, original: rawDomain, mapped });
      } else {
        reasons.push(
          `invalid domain ${JSON.stringify(rawDomain)} (expected an enum value ` +
            `[${VALID_DOMAINS.join(", ")}] or a recognized long label)`
        );
      }
    }

    const split = splitConstraints(row.expected_constraints);
    if (split.values.length === 0) {
      reasons.push("missing expected_constraints");
    } else {
      constraintReports.push({
        row: rowNumber,
        task_id: taskId,
        count: split.values.length,
        method: split.method,
        flagged: split.method === "unsplit",
      });
    }

    const requiresExternalKnowledge = parseBooleanCell(row.requires_external_knowledge);
    if (requiresExternalKnowledge === null) {
      reasons.push(
        "requires_external_knowledge must be true/false (also accepts yes/no, y/n, 1/0)"
      );
    }

    if (taskId && seenIds.has(taskId)) {
      reasons.push("duplicate task_id (already used earlier in this file)");
    }

    // craft_prompt is derived, never imported. Note it if the file carried one.
    if ((row.craft_prompt ?? "").trim()) ignoredCraftPromptRows.push(taskId || `row ${rowNumber}`);

    if (reasons.length > 0 || !domain) {
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
      expected_constraints: split.values,
      rubric_notes: row.rubric_notes.trim(),
      // Descriptive only; trimmed because the source sheet has trailing spaces.
      // Never used to gate or filter run logic.
      difficulty_level: row.difficulty_level.trim(),
      requires_external_knowledge: requiresExternalKnowledge as boolean,
      // Placeholder — the data layer stamps the real hash on write and
      // recomputes it on read, so this value is never persisted.
      task_version: "",
    });
  });

  return {
    tasks,
    errors,
    importedCount: tasks.length,
    rejectedCount: errors.length,
    totalRows: rows.length,
    headerNormalizations: normalizations,
    domainMappings,
    domainMappedCount: domainMappings.length,
    constraintReports,
    constraintFlaggedCount: constraintReports.filter((c) => c.flagged).length,
    ignoredCraftPromptRows,
  };
}

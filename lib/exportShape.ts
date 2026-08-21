import type { EvaluationRecord, ResultRecord } from "@/types";

/**
 * Export column order.
 *
 * These arrays are the contract with the external Results workbook: the sheet
 * headers must match them exactly, in order. Both exports are flat, one row per
 * record, so they paste directly into a sheet.
 */

export const RESULTS_COLUMNS = [
  "result_id",
  "task_id",
  "task_version",
  "model_name",
  "model_provenance_fingerprint",
  "prompt_condition",
  "run_number",
  "run_type",
  "decoding_params",
  "max_tokens",
  "system_prompt",
  "run_settings_hash",
  "run_settings_fields",
  "run_date",
  "raw_model_output",
  "anonymized_output_id",
  "truncated",
  "reasoning_tokens",
  "retry_count",
  "retry_log",
  "notes",
] as const;

export const EVALUATIONS_COLUMNS = [
  "evaluation_id",
  "result_id",
  "evaluator_model",
  "evaluator_provenance_fingerprint",
  "is_primary",
  "evaluated_at",
  "constraint_adherence_score_0_4",
  "logical_accuracy_score_0_4",
  "completeness_score_0_2",
  "total_score_0_10",
  "retry_count",
  "retry_log",
  "evaluator_justification",
] as const;

/**
 * `shape=sheet` drops result_id from the results export so columns align with a
 * sheet that uses task_id as its leading column. Note that evaluations join on
 * result_id, so the sheet shape breaks that join — use the full shape when the
 * two sheets need to be related.
 */
export const RESULTS_COLUMNS_SHEET = RESULTS_COLUMNS.filter(
  (c) => c !== "result_id"
) as unknown as readonly string[];

export function projectRow<T extends object>(row: T, columns: readonly string[]): string[] {
  return columns.map((col) => {
    const value = (row as Record<string, unknown>)[col];
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return JSON.stringify(value);
    return String(value);
  });
}

export function projectResults(
  results: ResultRecord[],
  columns: readonly string[]
): string[][] {
  return results.map((r) => projectRow(r, columns));
}

export function projectEvaluations(evaluations: EvaluationRecord[]): string[][] {
  return evaluations.map((e) => projectRow(e, EVALUATIONS_COLUMNS));
}

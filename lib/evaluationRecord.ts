// Relative + extension: loaded by the Node-run evaluate-pending script as well
// as by Next pages; the "@/" alias resolves only under Next for value imports.
import { generateEvaluationId } from "./anonymize.ts";
import type { EvaluationRecord } from "@/types";

/**
 * G2 — the ONE constructor for EvaluationRecord, shared by inline (batch
 * runner) and deferred (evaluate-pending) judging.
 *
 * Deferred evaluation must be indistinguishable from inline: both paths call
 * the same /api/evaluate route (same blinding guard, same evaluator prompt,
 * same family rotation, same retry policy, same telemetry), and both persist
 * through the same /api/evaluations route (same referential-integrity and
 * one-judge-once rules). This module closes the last gap — record assembly.
 * Before it, the two paths built records in two files that agreed only by
 * inspection; a field added to one and not the other would have made deferred
 * records silently distinguishable from inline ones.
 */

/** The subset of the /api/evaluate response a record is built from. */
export interface EvaluateApiResponse {
  constraint_adherence: number;
  logical_accuracy: number;
  completeness: number;
  total: number;
  justification: string;
  evaluator_provenance_fingerprint: string;
  evaluator_retry_count?: number;
  evaluator_retry_log?: EvaluationRecord["retry_log"];
}

export function buildEvaluationRecord(params: {
  result_id: string;
  evaluator_model: string;
  is_primary: boolean;
  response: EvaluateApiResponse;
  /** Injectable for tests; defaults to now. */
  evaluated_at?: string;
}): EvaluationRecord {
  const { result_id, evaluator_model, is_primary, response } = params;
  return {
    evaluation_id: generateEvaluationId(),
    result_id,
    evaluator_model,
    evaluator_provenance_fingerprint: response.evaluator_provenance_fingerprint,
    is_primary,
    evaluated_at: params.evaluated_at ?? new Date().toISOString(),
    constraint_adherence_score_0_4: response.constraint_adherence,
    logical_accuracy_score_0_4: response.logical_accuracy,
    completeness_score_0_2: response.completeness,
    total_score_0_10: response.total,
    retry_count: response.evaluator_retry_count ?? 0,
    retry_log: response.evaluator_retry_log ?? [],
    evaluator_justification: response.justification,
  };
}

import type { DecodingParams } from "@/lib/decoding";

export type Domain =
  | "coding"
  | "data_analysis"
  | "finance"
  | "policy"
  | "education"
  | "communication";

export interface TaskRecord {
  task_id: string;
  domain: Domain;
  source_or_origin: string;
  task_title: string;
  task_description: string;
  task_input: string;
  baseline_prompt: string;
  craft_context: string;
  craft_role: string;
  craft_actions: string;
  craft_format: string;
  craft_tone: string;
  craft_prompt: string;
  expected_constraints: string[];
  rubric_notes: string;
  difficulty_level: string;
  requires_external_knowledge: boolean;
  /**
   * Content hash over the scoring-relevant fields only — see lib/taskVersion.ts
   * for the exact scope. Always recomputed on read and stamped on write, so the
   * stored value is a cache that cannot drift from the content.
   */
  task_version: string;
}

export type PromptCondition = "baseline" | "craft";

/**
 * Distinguishes the main paired benchmark runs from repeat runs drawn against
 * the stability subset, so consistency analysis can be separated from the
 * primary comparison.
 */
export type RunType = "main" | "stability";

/**
 * One record per run. Scores live in EvaluationRecord — a run is scored by two
 * judges, so evaluation cannot be a column on the run itself.
 */
export interface ResultRecord {
  // Collision-safe primary key, deliberately separate from
  // anonymized_output_id, which is a blinding token and not an identifier.
  result_id: string;
  task_id: string;
  /**
   * The task's content hash at the moment this run executed. A result whose
   * task_version no longer matches the task's current version was produced
   * against different content and is not comparable.
   */
  task_version: string;
  model_name: string;
  /**
   * The provider's provenance for model_name at run time (created_at, or
   * version+description where the provider exposes no timestamp). Two of three
   * model IDs are bare and can be repointed, so this is the only evidence the
   * model did not move under the study.
   */
  model_provenance_fingerprint: string;
  prompt_condition: PromptCondition;
  run_number: number;
  run_type: RunType;
  /**
   * What the provider actually used. null where the provider does not accept
   * the parameter (Claude), 1.0 where the API pins it (GPT). 0.2 is never sent
   * to either model — see lib/decoding.ts.
   */
  temperature: number | null;
  /**
   * G3 — the full decoding regime, stated explicitly per vendor because the
   * controls are not commensurable:
   *   Claude → { temperature: null, effort: null }
   *   GPT    → { temperature: 1.0, reasoning_effort: "low" }
   */
  decoding_params: DecodingParams;
  max_tokens: number;
  system_prompt: string;
  /**
   * Hash binding both conditions of a pair to identical settings. The run API
   * rejects a counterpart run whose settings differ.
   */
  run_settings_hash: string;
  /**
   * G4 — which fields the hash covered. The two models expose different
   * controls, so a bare digest over different field sets would look comparable
   * while meaning different things.
   */
  run_settings_fields: string[];
  run_date: string;
  raw_model_output: string;
  anonymized_output_id: string;
  /**
   * True when the provider stopped generation at the token limit. A truncated
   * CRAFT response loses completeness points for a reason unrelated to the
   * prompt condition.
   */
  truncated: boolean;
  /**
   * G5 — reasoning tokens the provider reported (OpenAI only; null elsewhere).
   * The only behavioural signal of effort, since no provider echoes the effort
   * parameter back in its response.
   */
  reasoning_tokens: number | null;
  notes: string;
}

/** One record per run x judge. Two per result under the rotation. */
export interface EvaluationRecord {
  evaluation_id: string;
  /** FK to ResultRecord.result_id. */
  result_id: string;
  evaluator_model: string;
  evaluator_provenance_fingerprint: string;
  is_primary: boolean;
  evaluated_at: string;
  constraint_adherence_score_0_4: number;
  logical_accuracy_score_0_4: number;
  completeness_score_0_2: number;
  total_score_0_10: number;
  evaluator_justification: string;
}

export const DOMAIN_LABELS: Record<Domain, string> = {
  coding: "Coding",
  data_analysis: "Data Analysis",
  finance: "Finance",
  policy: "Policy",
  education: "Education",
  communication: "Communication",
};

export const DOMAIN_ACCENT_VAR: Record<Domain, string> = {
  coding: "var(--color-navy-900)",
  data_analysis: "var(--color-navy-700)",
  finance: "var(--color-craft-a)",
  policy: "var(--color-craft-f)",
  education: "var(--color-craft-t)",
  communication: "var(--color-craft-r)",
};

// Resolved hex equivalents of DOMAIN_ACCENT_VAR, for contexts (e.g. SVG chart
// fills) where a live CSS custom property is not reliably resolved.
export const DOMAIN_ACCENT_HEX: Record<Domain, string> = {
  coding: "#1E3A5F",
  data_analysis: "#2563A8",
  finance: "#059669",
  policy: "#7C3AED",
  education: "#B45309",
  communication: "#2563A8",
};

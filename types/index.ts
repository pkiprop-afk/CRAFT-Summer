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
}

export type PromptCondition = "baseline" | "craft";

export interface ResultRecord {
  // Non-canonical: a collision-safe primary key, kept deliberately separate
  // from anonymized_output_id (which is a blinding token, not an identifier,
  // and is timestamp-based so it is not collision-safe under concurrent runs).
  result_id: string;
  task_id: string;
  model_name: string;
  prompt_condition: PromptCondition;
  run_number: number;
  temperature: number;
  run_date: string;
  raw_model_output: string;
  anonymized_output_id: string;
  constraint_adherence_score_0_4: number;
  logical_accuracy_score_0_4: number;
  completeness_score_0_2: number;
  total_score_0_10: number;
  evaluator_model: string;
  evaluator_justification: string;
  notes: string;
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

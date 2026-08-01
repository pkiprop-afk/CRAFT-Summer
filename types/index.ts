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
  source: string;
  task_description: string;
  task_input: string;
  expected_constraints: string[];
  rubric_notes: string;
  baseline_prompt: string;
  craft_prompt: string;
}

export type PromptCondition = "baseline" | "craft";

export interface ResultRecord {
  result_id: string;
  task_id: string;
  test_model: string;
  prompt_condition: PromptCondition;
  anonymized_output_id: string;
  raw_output: string;
  constraint_adherence: number;
  logical_accuracy: number;
  completeness: number;
  total_score: number;
  justification: string;
  evaluator_model: string;
  temperature: number;
  run_timestamp: string;
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

export function buildEvaluatorPrompt(params: {
  task_description: string;
  expected_constraints: string[];
  rubric_notes: string;
  model_response: string;
}): string {
  const { task_description, expected_constraints, rubric_notes, model_response } = params;
  const constraintsText = expected_constraints.map((c) => `- ${c}`).join("\n");

  return `You are evaluating an AI response for a benchmark task. Score the response using the rubric
provided. Do not reward verbosity by itself. Do not infer missing work that is not present in
the response. Provide three numeric sub-scores and a brief justification.

Task: ${task_description}
Expected constraints: ${constraintsText}
Task-specific rubric notes: ${rubric_notes}
Model response: ${model_response}

Return the result in EXACTLY this format and nothing else:
Constraint adherence: X/4
Logical accuracy: X/4
Completeness: X/2
Total: X/10
Justification: one concise paragraph.`;
}

export interface ParsedEvaluation {
  constraint_adherence: number;
  logical_accuracy: number;
  completeness: number;
  total: number;
  justification: string;
}

export function parseEvaluatorResponse(text: string): ParsedEvaluation | null {
  const constraintMatch = text.match(/Constraint adherence:\s*(\d+(?:\.\d+)?)\s*\/\s*4/i);
  const logicalMatch = text.match(/Logical accuracy:\s*(\d+(?:\.\d+)?)\s*\/\s*4/i);
  const completenessMatch = text.match(/Completeness:\s*(\d+(?:\.\d+)?)\s*\/\s*2/i);
  const totalMatch = text.match(/Total:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  const justificationMatch = text.match(/Justification:\s*([\s\S]*)/i);

  if (!constraintMatch || !logicalMatch || !completenessMatch || !totalMatch || !justificationMatch) {
    return null;
  }

  return {
    constraint_adherence: Number(constraintMatch[1]),
    logical_accuracy: Number(logicalMatch[1]),
    completeness: Number(completenessMatch[1]),
    total: Number(totalMatch[1]),
    justification: justificationMatch[1].trim(),
  };
}

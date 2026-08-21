import { NextResponse } from "next/server";
import { appendEvaluation, getEvaluations, getResults } from "@/lib/db";
import type { EvaluationRecord } from "@/types";

export async function GET() {
  return NextResponse.json(await getEvaluations());
}

export async function POST(request: Request) {
  const evaluation: EvaluationRecord = await request.json();

  // Referential integrity: an evaluation without its run is unanalysable.
  const results = await getResults();
  if (!results.some((r) => r.result_id === evaluation.result_id)) {
    return NextResponse.json(
      { error: `No result found with result_id ${evaluation.result_id}.` },
      { status: 409 }
    );
  }

  // One judge may score a given run once. A second record from the same judge
  // would double-count that judge in any aggregate.
  const existing = await getEvaluations();
  const duplicate = existing.find(
    (e) =>
      e.result_id === evaluation.result_id &&
      e.evaluator_model === evaluation.evaluator_model
  );
  if (duplicate) {
    return NextResponse.json(
      {
        error:
          `${evaluation.evaluator_model} has already scored result ` +
          `${evaluation.result_id} (evaluation_id ${duplicate.evaluation_id}).`,
      },
      { status: 409 }
    );
  }

  await appendEvaluation(evaluation);
  return NextResponse.json(evaluation, { status: 201 });
}

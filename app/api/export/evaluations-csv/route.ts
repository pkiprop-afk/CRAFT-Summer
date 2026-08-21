import { getEvaluations } from "@/lib/db";
import { EVALUATIONS_COLUMNS, projectEvaluations } from "@/lib/exportShape";

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET() {
  const evaluations = await getEvaluations();
  const lines = [EVALUATIONS_COLUMNS.map(escapeCell).join(",")];
  for (const row of projectEvaluations(evaluations)) {
    lines.push(row.map(escapeCell).join(","));
  }

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="evaluations.csv"',
    },
  });
}

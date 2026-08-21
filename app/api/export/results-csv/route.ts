import { getResults } from "@/lib/db";
import {
  RESULTS_COLUMNS,
  RESULTS_COLUMNS_SHEET,
  projectResults,
} from "@/lib/exportShape";

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsvRows(header: readonly string[], rows: string[][]): string {
  const lines = [header.map(escapeCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCell).join(","));
  return lines.join("\n") + "\n";
}

export async function GET(request: Request) {
  const shape = new URL(request.url).searchParams.get("shape");
  const columns = shape === "sheet" ? RESULTS_COLUMNS_SHEET : RESULTS_COLUMNS;

  const results = await getResults();
  // 7b — always emit the header row, even with no data, so the sheet headers
  // can be built before any run exists.
  const csv = toCsvRows(columns, projectResults(results, columns));

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="results${shape === "sheet" ? "-sheet" : ""}.csv"`,
    },
  });
}

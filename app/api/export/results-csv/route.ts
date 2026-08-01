import { getResults } from "@/lib/db";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const results = await getResults();
  const csv = toCsv(results);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="results.csv"',
    },
  });
}

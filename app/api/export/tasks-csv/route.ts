import { getTasks } from "@/lib/db";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const tasks = await getTasks();
  const csv = toCsv(tasks);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="tasks.csv"',
    },
  });
}

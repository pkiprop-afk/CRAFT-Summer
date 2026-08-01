import { getTasks } from "@/lib/db";

export async function GET() {
  const tasks = await getTasks();
  const jsonl = tasks.map((task) => JSON.stringify(task)).join("\n") + "\n";

  return new Response(jsonl, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": 'attachment; filename="tasks.jsonl"',
    },
  });
}

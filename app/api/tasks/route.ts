import { NextResponse } from "next/server";
import { getTasks, saveTasks } from "@/lib/db";
import type { TaskRecord } from "@/types";

export async function GET() {
  const tasks = await getTasks();
  return NextResponse.json(tasks);
}

// Used by the Task Library import button (Section 5.2): upserts an array of
// task records into tasks.json, keyed by task_id.
export async function POST(request: Request) {
  const body = await request.json();
  const incoming: TaskRecord[] = Array.isArray(body) ? body : [body];

  const tasks = await getTasks();
  for (const incomingTask of incoming) {
    const index = tasks.findIndex((t) => t.task_id === incomingTask.task_id);
    if (index === -1) {
      tasks.push(incomingTask);
    } else {
      tasks[index] = incomingTask;
    }
  }
  await saveTasks(tasks);
  return NextResponse.json(tasks);
}

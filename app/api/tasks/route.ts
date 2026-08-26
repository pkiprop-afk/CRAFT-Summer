import { NextResponse } from "next/server";
import { reviewModeBlock } from "@/lib/reviewMode";
import { getTasks, saveTasks } from "@/lib/db";
import type { TaskRecord } from "@/types";

export async function GET() {
  const tasks = await getTasks();
  return NextResponse.json(tasks);
}

// Used by the Task Library import button (Section 5.2): upserts an array of
// task records into tasks.json, keyed by task_id.
export async function POST(request: Request) {
  // REVIEW_MODE: refuse before the body is read, so a blocked request can
  // never reach a provider call or a write to data/.
  const blocked = reviewModeBlock();
  if (blocked) return blocked;

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

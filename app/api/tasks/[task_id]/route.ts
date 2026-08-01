import { NextResponse } from "next/server";
import { updateTask } from "@/lib/db";
import type { TaskRecord } from "@/types";

export async function PUT(request: Request, { params }: { params: Promise<{ task_id: string }> }) {
  const { task_id } = await params;
  const task: TaskRecord = await request.json();

  if (task.task_id !== task_id) {
    return NextResponse.json({ error: "task_id mismatch" }, { status: 400 });
  }

  const updated = await updateTask(task_id, task);
  if (!updated) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

import { NextResponse } from "next/server";
import { getTask, updateTask } from "@/lib/db";
import { validateSingleTask } from "@/lib/taskImport";

interface RouteContext {
  params: Promise<{ task_id: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { task_id } = await params;
  const task = await getTask(task_id);
  if (!task) {
    return NextResponse.json({ error: `Task ${task_id} not found.` }, { status: 404 });
  }
  return NextResponse.json(task);
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { task_id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const existing = await getTask(task_id);
  if (!existing) {
    return NextResponse.json({ error: `Task ${task_id} not found.` }, { status: 404 });
  }

  // task_id is immutable once created — renaming would orphan every recorded
  // result that references it.
  const incomingId = (body as Record<string, unknown>)?.task_id;
  if (typeof incomingId === "string" && incomingId !== task_id) {
    return NextResponse.json(
      {
        error:
          `task_id is immutable: cannot change ${task_id} to ${incomingId}. ` +
          `Recorded results reference the task by id.`,
      },
      { status: 409 }
    );
  }

  // Same validation the importer uses; craft_prompt is re-derived server-side.
  const { task, errors } = validateSingleTask({ ...(body as object), task_id });
  if (!task) {
    return NextResponse.json(
      { error: "Task failed validation — no changes were saved.", errors },
      { status: 422 }
    );
  }

  const saved = await updateTask(task_id, task);
  if (!saved) {
    return NextResponse.json({ error: `Task ${task_id} could not be saved.` }, { status: 500 });
  }

  return NextResponse.json(saved);
}

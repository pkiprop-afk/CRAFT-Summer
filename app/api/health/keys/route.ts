import { NextResponse } from "next/server";
import { allKeyStatuses } from "@/lib/env";

// Never returns key values — only whether each one is present, so the runner
// pages can block a run before any model call is attempted.
export async function GET() {
  const statuses = allKeyStatuses();
  return NextResponse.json({
    statuses,
    missing: statuses.filter((s) => !s.configured).map((s) => s.envVar),
  });
}

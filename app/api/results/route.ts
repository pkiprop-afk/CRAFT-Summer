import { NextResponse } from "next/server";
import { reviewModeBlock } from "@/lib/reviewMode";
import { appendResult, getResults } from "@/lib/db";
import type { ResultRecord } from "@/types";

export async function GET() {
  const results = await getResults();
  return NextResponse.json(results);
}

export async function POST(request: Request) {
  // REVIEW_MODE: refuse before the body is read, so a blocked request can
  // never reach a provider call or a write to data/.
  const blocked = reviewModeBlock();
  if (blocked) return blocked;

  const result: ResultRecord = await request.json();
  await appendResult(result);
  return NextResponse.json(result, { status: 201 });
}

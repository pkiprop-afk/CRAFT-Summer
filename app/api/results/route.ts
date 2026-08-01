import { NextResponse } from "next/server";
import { appendResult, getResults } from "@/lib/db";
import type { ResultRecord } from "@/types";

export async function GET() {
  const results = await getResults();
  return NextResponse.json(results);
}

export async function POST(request: Request) {
  const result: ResultRecord = await request.json();
  await appendResult(result);
  return NextResponse.json(result, { status: 201 });
}

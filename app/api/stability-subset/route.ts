import { NextResponse } from "next/server";
import { loadStabilitySubset, MissingStabilitySubsetError } from "@/lib/stabilitySubset";

/**
 * Read-only. The subset is frozen: there is deliberately no POST/PUT/DELETE
 * here, so the list cannot be edited from the UI.
 */
export async function GET() {
  try {
    return NextResponse.json(await loadStabilitySubset());
  } catch (err) {
    if (err instanceof MissingStabilitySubsetError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}

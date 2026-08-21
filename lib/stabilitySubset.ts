import { promises as fs } from "fs";
import path from "path";

/**
 * The stability subset is FROZEN.
 *
 * data/stability_subset.json is produced once by `npm run select-stability-subset`
 * (seeded stratified draw, mulberry32, seed 20260820) and is thereafter read-only:
 * nothing in the app writes it, and there is no endpoint that mutates it. Editing
 * the membership after runs exist would silently change which tasks the
 * within-cell variance estimate is based on.
 *
 * A stability run against an off-list task_id is rejected at the API layer.
 */

const SUBSET_PATH = path.join(process.cwd(), "data", "stability_subset.json");

export interface StabilitySubset {
  task_ids: string[];
  seed: number;
  prng_algorithm: string;
  quotas: Record<string, number>;
  domain_draw_order: string[];
  selection_date_derived_from_seed: string;
  note: string;
}

export class MissingStabilitySubsetError extends Error {
  constructor() {
    super(
      "data/stability_subset.json not found. Run `npm run select-stability-subset` " +
        "before any stability run."
    );
    this.name = "MissingStabilitySubsetError";
  }
}

let cached: StabilitySubset | null = null;

export async function loadStabilitySubset(): Promise<StabilitySubset> {
  if (cached) return cached;
  let raw: string;
  try {
    raw = await fs.readFile(SUBSET_PATH, "utf-8");
  } catch {
    throw new MissingStabilitySubsetError();
  }
  cached = JSON.parse(raw) as StabilitySubset;
  return cached;
}

export async function isInStabilitySubset(taskId: string): Promise<boolean> {
  const subset = await loadStabilitySubset();
  return subset.task_ids.includes(taskId);
}

/** Repeat runs per cell for the stability design. */
export const STABILITY_RUNS_PER_CELL = 3;

/** Test seam. */
export function resetStabilitySubsetCache(): void {
  cached = null;
}

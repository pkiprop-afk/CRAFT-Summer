import { promises as fs } from "fs";
import path from "path";
import type { PromptCondition } from "@/types";

/**
 * ============================================================================
 * RESTRICTED MODULE — DO NOT IMPORT FROM ANY EVALUATOR CODE PATH
 * ============================================================================
 *
 * This module holds the mapping from an opaque blinding token to the facts
 * blinding exists to hide: which model produced an output, and under which
 * prompt condition.
 *
 * Permitted importers:
 *   - the runner (allocates a token when a run completes)
 *   - lib/blindingGuard.ts (checks judge/producer family collision)
 *
 * Forbidden importers — anything that builds or sends a judge payload:
 *   - lib/evaluator.ts
 *   - lib/models/claude.ts, lib/models/openai.ts, lib/models/gemini.ts
 *
 * tests/blinding.test.ts enforces this statically. If you need producer facts
 * inside an evaluator path, you almost certainly have a leak.
 *
 * The token itself is opaque and sequential (OUT-0001, OUT-0002, …). It encodes
 * nothing: the previous scheme embedded task, condition, model and timestamp
 * in plaintext, so the "anonymized" ID de-anonymized the run to anyone who read
 * it.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const BLINDING_MAP_PATH = path.join(DATA_DIR, "blinding_map.json");

export interface BlindingEntry {
  token: string;
  task_id: string;
  model_name: string;
  prompt_condition: PromptCondition;
  allocated_at: string;
}

type BlindingMap = Record<string, BlindingEntry>;

async function readMap(): Promise<BlindingMap> {
  try {
    return JSON.parse(await fs.readFile(BLINDING_MAP_PATH, "utf-8")) as BlindingMap;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeMap(map: BlindingMap): Promise<void> {
  await fs.mkdir(path.dirname(BLINDING_MAP_PATH), { recursive: true });
  await fs.writeFile(BLINDING_MAP_PATH, JSON.stringify(map, null, 2) + "\n", "utf-8");
}

/**
 * Serializes allocation. The batch runner issues concurrent requests, and
 * read-modify-write on a JSON file would otherwise hand the same sequence
 * number to two runs.
 */
let allocationChain: Promise<unknown> = Promise.resolve();

function formatToken(sequence: number): string {
  return `OUT-${String(sequence).padStart(4, "0")}`;
}

export async function allocateBlindingToken(params: {
  task_id: string;
  model_name: string;
  prompt_condition: PromptCondition;
}): Promise<string> {
  const run = allocationChain.then(async () => {
    const map = await readMap();
    const token = formatToken(Object.keys(map).length + 1);
    map[token] = {
      token,
      task_id: params.task_id,
      model_name: params.model_name,
      prompt_condition: params.prompt_condition,
      allocated_at: new Date().toISOString(),
    };
    await writeMap(map);
    return token;
  });

  // Keep the chain alive even if one allocation throws.
  allocationChain = run.catch(() => undefined);
  return run;
}

/** Reverse lookup. Server-side only — never include the result in a judge payload. */
export async function lookupBlindingEntry(token: string): Promise<BlindingEntry | null> {
  const map = await readMap();
  return map[token] ?? null;
}

export async function getBlindingMapSize(): Promise<number> {
  return Object.keys(await readMap()).length;
}

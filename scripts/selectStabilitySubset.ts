/**
 * Stability subset — seeded stratified random draw.
 *
 * Selects 10 of the 50 registry tasks for repeat-run stability measurement.
 * The draw is fully deterministic: the same registry and the same seed always
 * produce the same 10 task_ids, so the selection is reproducible by a third
 * party and cannot be quietly re-rolled.
 *
 * Determinism guarantees:
 *   - Task pools are sorted ascending by task_id before drawing, so the order
 *     of rows in tasks.json cannot affect the outcome.
 *   - Domains are drawn in a fixed order from a single shared PRNG stream.
 *   - The PRNG (mulberry32) is implemented here rather than imported, so no
 *     dependency upgrade can silently change the algorithm.
 *   - selection_date is derived from the seed, not from the clock, so re-running
 *     produces a byte-identical file.
 *
 * Run: npm run select-stability-subset
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const SEED = 20260820;
const PRNG_ALGORITHM = "mulberry32";

// Weighted toward open-ended domains, where within-cell variance across repeat
// runs is expected to be highest. Drawn in this exact order.
const QUOTAS: Array<[string, number]> = [
  ["communication", 3],
  ["data_analysis", 2],
  ["policy", 2],
  ["coding", 1],
  ["finance", 1],
  ["education", 1],
];

const NOTE =
  "Quotas are weighted toward open-ended domains (communication, data_analysis, policy) " +
  "where within-cell variance across repeat runs is expected to be highest. " +
  "Constrained domains (coding, finance, education) contribute one task each.";

interface TaskRow {
  task_id: string;
  domain: string;
  task_title: string;
  difficulty_level: string;
}

/**
 * mulberry32 — a small, fully specified 32-bit PRNG. Checked in deliberately:
 * the exact bit operations are part of the reproducibility guarantee.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws `count` items without replacement from `pool` (pool is not mutated). */
function drawWithoutReplacement<T>(pool: T[], count: number, rand: () => number): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  for (let i = 0; i < count; i++) {
    if (remaining.length === 0) break;
    const index = Math.floor(rand() * remaining.length);
    picked.push(remaining.splice(index, 1)[0]);
  }
  return picked;
}

function main(): void {
  const repoRoot = process.cwd();
  const tasksPath = path.join(repoRoot, "data", "tasks.json");
  const outputPath = path.join(repoRoot, "data", "stability_subset.json");

  const tasks: TaskRow[] = JSON.parse(readFileSync(tasksPath, "utf-8"));

  // Group by domain, each pool sorted ascending by task_id for determinism.
  const byDomain = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const pool = byDomain.get(task.domain) ?? [];
    pool.push(task);
    byDomain.set(task.domain, pool);
  }
  for (const pool of byDomain.values()) {
    pool.sort((a, b) => a.task_id.localeCompare(b.task_id));
  }

  const rand = mulberry32(SEED);
  const selected: TaskRow[] = [];
  const shortfalls: string[] = [];

  for (const [domain, quota] of QUOTAS) {
    const pool = byDomain.get(domain) ?? [];
    if (pool.length < quota) {
      shortfalls.push(`${domain}: need ${quota}, registry has ${pool.length}`);
    }
    selected.push(...drawWithoutReplacement(pool, quota, rand));
  }

  if (shortfalls.length > 0) {
    console.error("ABORT — registry cannot satisfy the quotas:");
    for (const s of shortfalls) console.error(`  ${s}`);
    process.exit(1);
  }

  // Derived from the seed (which encodes the selection date) so the artifact is
  // byte-identical across runs.
  const selectionDate = `${String(SEED).slice(0, 4)}-${String(SEED).slice(4, 6)}-${String(SEED).slice(6, 8)}`;

  const subset = {
    task_ids: selected.map((t) => t.task_id),
    seed: SEED,
    prng_algorithm: PRNG_ALGORITHM,
    quotas: Object.fromEntries(QUOTAS),
    domain_draw_order: QUOTAS.map(([d]) => d),
    selection_date: selectionDate,
    note: NOTE,
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(subset, null, 2) + "\n", "utf-8");

  // ---- Review output -------------------------------------------------------
  console.log("STABILITY SUBSET — seeded stratified draw");
  console.log(`seed: ${SEED}   prng: ${PRNG_ALGORITHM}   selection_date: ${selectionDate}`);
  console.log(`registry: ${tasks.length} tasks   selected: ${selected.length}\n`);

  console.log("task_id  domain           difficulty  title");
  console.log("-------  ---------------  ----------  " + "-".repeat(44));
  for (const t of selected) {
    console.log(
      `${t.task_id.padEnd(7)}  ${t.domain.padEnd(15)}  ${t.difficulty_level.padEnd(10)}  ${t.task_title}`
    );
  }

  const difficulty = new Map<string, number>();
  for (const t of selected) {
    difficulty.set(t.difficulty_level, (difficulty.get(t.difficulty_level) ?? 0) + 1);
  }
  console.log("\ndifficulty distribution:");
  for (const [level, count] of [...difficulty.entries()].sort()) {
    console.log(`  ${level.padEnd(10)} ${count}`);
  }

  const perDomain = new Map<string, number>();
  for (const t of selected) perDomain.set(t.domain, (perDomain.get(t.domain) ?? 0) + 1);
  console.log("\nper-domain (must match quotas):");
  for (const [domain, quota] of QUOTAS) {
    const got = perDomain.get(domain) ?? 0;
    console.log(`  ${domain.padEnd(15)} ${got}/${quota} ${got === quota ? "ok" : "MISMATCH"}`);
  }

  // Degeneracy check — reported, never auto-corrected. Re-rolling the seed to
  // obtain a nicer-looking mix would invalidate the randomization.
  const hardCount = difficulty.get("Hard") ?? 0;
  const mediumCount = difficulty.get("Medium") ?? 0;
  const degenerate = hardCount === 0 || mediumCount === selected.length;

  console.log("");
  if (degenerate) {
    console.log("DEGENERATE DIFFICULTY MIX — REVIEW REQUIRED");
    if (hardCount === 0) console.log("  zero Hard tasks in the draw");
    if (mediumCount === selected.length) console.log("  all ten tasks are Medium");
    console.log("  Not re-drawing and not adjusting the seed. Awaiting a decision.");
  } else {
    console.log(`difficulty mix OK (Hard: ${hardCount}, not all-Medium)`);
  }

  console.log(`\nwritten: ${path.relative(repoRoot, outputPath)}`);
  console.log("Deterministic — re-running reproduces this file byte-for-byte.");
}

main();

import { promises as fs } from "fs";
import path from "path";
import type { EvaluationRecord, ResultRecord, TaskRecord } from "@/types";
import { stampTaskVersions } from "@/lib/taskVersion";

const DATA_DIR = path.join(process.cwd(), "data");
const TASKS_PATH = path.join(DATA_DIR, "tasks.json");
const RESULTS_PATH = path.join(DATA_DIR, "results.json");
const EVALUATIONS_PATH = path.join(DATA_DIR, "evaluations.json");
const REGISTRY_META_PATH = path.join(DATA_DIR, "registry_meta.json");

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Tasks are always returned with a freshly computed task_version, so a stored
 * hash can never drift from the content it describes (e.g. if tasks.json is
 * hand-edited). The persisted value is only a cache.
 */
export async function getTasks(): Promise<TaskRecord[]> {
  const tasks = await readJson<TaskRecord[]>(TASKS_PATH, []);
  return stampTaskVersions(tasks);
}

export async function saveTasks(tasks: TaskRecord[]): Promise<void> {
  await writeJson(TASKS_PATH, await stampTaskVersions(tasks));
}

export async function getTask(taskId: string): Promise<TaskRecord | null> {
  const tasks = await getTasks();
  return tasks.find((t) => t.task_id === taskId) ?? null;
}

export async function updateTask(
  taskId: string,
  updated: TaskRecord
): Promise<TaskRecord | null> {
  const tasks = await getTasks();
  const index = tasks.findIndex((t) => t.task_id === taskId);
  if (index === -1) return null;
  tasks[index] = updated;
  await saveTasks(tasks);
  // Re-read so the caller receives the stamped record rather than the input.
  return getTask(taskId);
}

export async function getResults(): Promise<ResultRecord[]> {
  return readJson<ResultRecord[]>(RESULTS_PATH, []);
}

export async function appendResult(result: ResultRecord): Promise<void> {
  const results = await getResults();
  results.push(result);
  await writeJson(RESULTS_PATH, results);
}

/**
 * Evaluations live in their own store keyed by result_id: a run is scored by
 * two judges under the rotation, so scores cannot be columns on the run.
 */
export async function getEvaluations(): Promise<EvaluationRecord[]> {
  return readJson<EvaluationRecord[]>(EVALUATIONS_PATH, []);
}

export async function appendEvaluation(evaluation: EvaluationRecord): Promise<void> {
  const evaluations = await getEvaluations();
  evaluations.push(evaluation);
  await writeJson(EVALUATIONS_PATH, evaluations);
}

export async function getEvaluationsForResult(resultId: string): Promise<EvaluationRecord[]> {
  return (await getEvaluations()).filter((e) => e.result_id === resultId);
}

/**
 * 4f — Registry provenance. Tracks when the registry was last loaded from a
 * workbook so a later import can warn if the uploaded file predates it (i.e.
 * is a stale copy that would silently revert in-app edits).
 */
export interface RegistryMeta {
  lastImportedAt: string | null;
  lastImportedFile: string | null;
  /** Client-reported mtime of the file that was imported. */
  lastImportedFileModifiedAt: string | null;
}

const EMPTY_META: RegistryMeta = {
  lastImportedAt: null,
  lastImportedFile: null,
  lastImportedFileModifiedAt: null,
};

export async function getRegistryMeta(): Promise<RegistryMeta> {
  return readJson<RegistryMeta>(REGISTRY_META_PATH, EMPTY_META);
}

export async function setRegistryMeta(meta: RegistryMeta): Promise<void> {
  await writeJson(REGISTRY_META_PATH, meta);
}

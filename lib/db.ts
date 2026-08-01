import { promises as fs } from "fs";
import path from "path";
import type { ResultRecord, TaskRecord } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
const TASKS_PATH = path.join(DATA_DIR, "tasks.json");
const RESULTS_PATH = path.join(DATA_DIR, "results.json");

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

export async function getTasks(): Promise<TaskRecord[]> {
  return readJson<TaskRecord[]>(TASKS_PATH, []);
}

export async function saveTasks(tasks: TaskRecord[]): Promise<void> {
  await writeJson(TASKS_PATH, tasks);
}

export async function getTask(taskId: string): Promise<TaskRecord | null> {
  const tasks = await getTasks();
  return tasks.find((t) => t.task_id === taskId) ?? null;
}

export async function updateTask(taskId: string, updated: TaskRecord): Promise<TaskRecord | null> {
  const tasks = await getTasks();
  const index = tasks.findIndex((t) => t.task_id === taskId);
  if (index === -1) return null;
  tasks[index] = updated;
  await saveTasks(tasks);
  return updated;
}

export async function getResults(): Promise<ResultRecord[]> {
  return readJson<ResultRecord[]>(RESULTS_PATH, []);
}

export async function appendResult(result: ResultRecord): Promise<void> {
  const results = await getResults();
  results.push(result);
  await writeJson(RESULTS_PATH, results);
}

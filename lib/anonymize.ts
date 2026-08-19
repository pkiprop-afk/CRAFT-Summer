import type { PromptCondition } from "@/types";

export function generateOutputId(
  taskId: string,
  condition: PromptCondition,
  model: string,
  timestamp: number = Date.now()
): string {
  return `OUT-${taskId}-${condition}-${model}-${timestamp}`;
}

export function generateResultId(): string {
  return `RES-${crypto.randomUUID()}`;
}

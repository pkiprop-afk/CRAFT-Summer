/**
 * I1 — Stimulus composition.
 *
 * task_input is the STIMULUS, not part of either condition. It is appended
 * byte-identically to the baseline prompt and to the assembled CRAFT prompt:
 * same position (suffix), same delimiters, same spacing. Any condition-specific
 * framing of the input would confound the comparison — the only thing allowed
 * to differ between conditions is the prompt body itself.
 *
 * Format: prompt body, two newlines, then a fenced block containing the input
 * verbatim.
 *
 *     <prompt body>
 *
 *     ```
 *     <task_input verbatim>
 *     ```
 *
 * An empty task_input emits no block at all — never an empty fence.
 */

const FENCE = "```";

/** The suffix block alone, so tests can assert byte-identity across conditions. */
export function taskInputBlock(taskInput: string): string {
  if (!taskInput.trim()) return "";
  return `\n\n${FENCE}\n${taskInput}\n${FENCE}`;
}

export function composePrompt(promptBody: string, taskInput: string): string {
  return `${promptBody}${taskInputBlock(taskInput)}`;
}

/**
 * The exact text sent to the model for a given task and condition. Used by the
 * run API and by the UI preview, so what is previewed is what is sent.
 */
export function composedPromptFor(
  task: { baseline_prompt: string; craft_prompt: string; task_input: string },
  condition: "baseline" | "craft"
): string {
  const body = condition === "baseline" ? task.baseline_prompt : task.craft_prompt;
  return composePrompt(body, task.task_input);
}

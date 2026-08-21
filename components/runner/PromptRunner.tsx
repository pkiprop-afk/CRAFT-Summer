import { Play } from "lucide-react";
import { CRAFTMeter } from "@/components/craft/CRAFTMeter";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  DOMAIN_LABELS,
  type PromptCondition,
  type TaskRecord,
} from "@/types";

import { MODEL_LABEL, TEST_MODELS, type TestModelId } from "@/lib/models/registry";
import { decodingParamsFor } from "@/lib/decoding";

export type TestModel = TestModelId;

interface PromptRunnerProps {
  tasks: TaskRecord[];
  selectedTaskId: string;
  onSelectTask: (taskId: string) => void;
  condition: PromptCondition;
  onSelectCondition: (condition: PromptCondition) => void;
  selectedTask: TaskRecord | undefined;
  selectedPromptText: string;
  testModel: TestModel;
  onSelectTestModel: (model: TestModel) => void;
  maxTokens: number;
  onMaxTokensChange: (value: number) => void;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  onRun: () => void;
  running: boolean;
  keyBlocked: boolean;
}

export function PromptRunner({
  tasks,
  selectedTaskId,
  onSelectTask,
  condition,
  onSelectCondition,
  selectedTask,
  selectedPromptText,
  testModel,
  onSelectTestModel,
  maxTokens,
  onMaxTokensChange,
  systemPrompt,
  onSystemPromptChange,
  onRun,
  running,
  keyBlocked,
}: PromptRunnerProps) {
  const grouped = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    (acc[task.domain] ??= []).push(task);
    return acc;
  }, {});

  const missingPrompts: string[] = [];
  if (selectedTask) {
    if (!selectedTask.baseline_prompt) missingPrompts.push("Baseline");
    if (!selectedTask.craft_prompt) missingPrompts.push("CRAFT");
  }
  const blockedByBalance = missingPrompts.length > 0;

  return (
    <div className="space-y-8">
      {/* Step 1 */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-heading">
          Step 1 — Select Task and Condition
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select value={selectedTaskId} onChange={(e) => onSelectTask(e.target.value)}>
            <option value="">Select a task…</option>
            {Object.entries(grouped).map(([domain, domainTasks]) => (
              <optgroup key={domain} label={DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS]}>
                {domainTasks.map((task) => (
                  <option key={task.task_id} value={task.task_id}>
                    {task.task_id} — {task.task_description.slice(0, 60)}
                    {task.task_description.length > 60 ? "…" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-text-body">
              <input
                type="radio"
                checked={condition === "baseline"}
                onChange={() => onSelectCondition("baseline")}
              />
              Baseline
            </label>
            <label className="flex items-center gap-2 text-sm text-text-body">
              <input
                type="radio"
                checked={condition === "craft"}
                onChange={() => onSelectCondition("craft")}
              />
              CRAFT
            </label>
          </div>
        </div>

        {selectedTask && (
          <>
            <div>
              <h3 className="text-sm font-semibold text-text-heading mb-2">
                CRAFT Completeness Meter
              </h3>
              <CRAFTMeter craftPromptText={selectedTask.craft_prompt} />
            </div>

            {selectedPromptText ? (
              <pre className="rounded-lg bg-white border border-cream-border px-4 py-3 text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                {selectedPromptText}
              </pre>
            ) : (
              <p className="rounded-md bg-warning/10 border border-warning/30 px-3 py-2 text-sm text-warning">
                This prompt has not been authored yet. Return to Task Library to write it first.
              </p>
            )}

            {blockedByBalance && (
              <p className="rounded-md bg-error/10 border border-error/30 px-3 py-2 text-sm text-error">
                Run blocked: this task is missing its {missingPrompts.join(" and ")} prompt
                {missingPrompts.length > 1 ? "s" : ""}. Both baseline and CRAFT prompts must be
                authored before either condition can be run, to keep the paired comparison
                balanced. Return to Task Library to write the missing prompt
                {missingPrompts.length > 1 ? "s" : ""}.
              </p>
            )}
          </>
        )}
      </section>

      {/* Step 2 */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-heading">
          Step 2 — Select Test Model and Run Settings
        </h2>
        <div className="flex items-center gap-4">
          {TEST_MODELS.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm text-text-body">
              <input
                type="radio"
                checked={testModel === id}
                onChange={() => onSelectTestModel(id)}
              />
              {MODEL_LABEL[id]}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* G2/G3 — decoding is fixed by the provider, not chosen here. */}
          <div>
            <label className="block text-sm font-medium text-text-heading mb-1">
              Decoding <span className="font-normal text-text-muted">(fixed by provider)</span>
            </label>
            <div className="rounded-lg border border-cream-border bg-cream-card px-3 py-2 text-sm font-mono text-text-body">
              {JSON.stringify(decodingParamsFor(testModel))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-heading mb-1">
              Max Tokens
            </label>
            <input
              type="number"
              min={1}
              value={maxTokens}
              onChange={(e) => onMaxTokensChange(Number(e.target.value))}
              className="w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-heading mb-1">
            System Prompt
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => onSystemPromptChange(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
          />
          <p className="mt-1 text-xs text-text-muted">
            Keep neutral — do not advantage either prompt condition.
          </p>
        </div>

        {keyBlocked && (
          <p className="rounded-md bg-error/10 border border-error/30 px-3 py-2 text-sm text-error">
            Run blocked: the API key for the selected test model is not configured. See the missing
            key notice at the top of this page.
          </p>
        )}

        <Button
          onClick={onRun}
          disabled={running || !selectedPromptText || blockedByBalance || keyBlocked}
        >
          <Play size={16} />
          {running ? "Running…" : "Run Prompt"}
        </Button>
      </section>
    </div>
  );
}

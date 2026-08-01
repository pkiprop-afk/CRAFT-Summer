import { Play } from "lucide-react";
import { CRAFTMeter } from "@/components/craft/CRAFTMeter";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  DOMAIN_LABELS,
  type PromptCondition,
  type TaskRecord,
} from "@/types";

export type TestModel = "claude-3-5-sonnet" | "gpt-4o";

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
  temperature: number;
  onTemperatureChange: (value: number) => void;
  maxTokens: number;
  onMaxTokensChange: (value: number) => void;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  onRun: () => void;
  running: boolean;
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
  temperature,
  onTemperatureChange,
  maxTokens,
  onMaxTokensChange,
  systemPrompt,
  onSystemPromptChange,
  onRun,
  running,
}: PromptRunnerProps) {
  const grouped = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    (acc[task.domain] ??= []).push(task);
    return acc;
  }, {});

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
          </>
        )}
      </section>

      {/* Step 2 */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-heading">
          Step 2 — Select Test Model and Run Settings
        </h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-text-body">
            <input
              type="radio"
              checked={testModel === "claude-3-5-sonnet"}
              onChange={() => onSelectTestModel("claude-3-5-sonnet")}
            />
            Claude 3.5 Sonnet
          </label>
          <label className="flex items-center gap-2 text-sm text-text-body">
            <input
              type="radio"
              checked={testModel === "gpt-4o"}
              onChange={() => onSelectTestModel("gpt-4o")}
            />
            GPT-4o
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-heading mb-1">
              Temperature
            </label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => onTemperatureChange(Number(e.target.value))}
              className="w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
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

        <Button onClick={onRun} disabled={running || !selectedPromptText}>
          <Play size={16} />
          {running ? "Running…" : "Run Prompt"}
        </Button>
      </section>
    </div>
  );
}

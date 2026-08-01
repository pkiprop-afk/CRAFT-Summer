import { Plus, Trash2 } from "lucide-react";
import { DOMAIN_LABELS, type TaskRecord } from "@/types";

interface TaskFormProps {
  task: TaskRecord;
  onChange: (task: TaskRecord) => void;
}

function DeferredCallout() {
  return (
    <p className="rounded-md bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-warning">
      Prompt authoring is deferred until all task fields are complete.
    </p>
  );
}

export function TaskForm({ task, onChange }: TaskFormProps) {
  function set<K extends keyof TaskRecord>(key: K, value: TaskRecord[K]) {
    onChange({ ...task, [key]: value });
  }

  function setConstraint(index: number, value: string) {
    const next = [...task.expected_constraints];
    next[index] = value;
    set("expected_constraints", next);
  }

  function removeConstraint(index: number) {
    set(
      "expected_constraints",
      task.expected_constraints.filter((_, i) => i !== index)
    );
  }

  function addConstraint() {
    set("expected_constraints", [...task.expected_constraints, ""]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-heading mb-2">Task Metadata</h2>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-text-muted">task_id</dt>
            <dd className="font-mono text-text-heading">{task.task_id}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">domain</dt>
            <dd className="text-text-heading">{DOMAIN_LABELS[task.domain]}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">source</dt>
            <dd className="text-text-heading">{task.source}</dd>
          </div>
        </dl>
      </div>

      <div>
        <label className="block text-sm font-semibold text-text-heading mb-1">
          Task Description
        </label>
        <textarea
          value={task.task_description}
          onChange={(e) => set("task_description", e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-text-heading mb-1">
          Task Input (code, data, or scenario)
        </label>
        <textarea
          value={task.task_input}
          onChange={(e) => set("task_input", e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-navy-500"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-text-heading mb-1">
          Expected Constraints
        </label>
        <ol className="space-y-2">
          {task.expected_constraints.map((constraint, index) => (
            <li key={index} className="flex items-center gap-2">
              <span className="text-xs text-text-muted w-4 shrink-0">{index + 1}.</span>
              <input
                value={constraint}
                onChange={(e) => setConstraint(index, e.target.value)}
                className="flex-1 rounded-lg border border-cream-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
              <button
                onClick={() => removeConstraint(index)}
                className="text-text-muted hover:text-error"
                aria-label="Remove constraint"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ol>
        <button
          onClick={addConstraint}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:text-navy-900"
        >
          <Plus size={14} /> Add constraint
        </button>
      </div>

      <div>
        <label className="block text-sm font-semibold text-text-heading mb-1">
          Rubric Notes
        </label>
        <textarea
          value={task.rubric_notes}
          onChange={(e) => set("rubric_notes", e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-text-heading mb-1">
          Baseline Prompt
        </label>
        {!task.baseline_prompt && <DeferredCallout />}
        <textarea
          value={task.baseline_prompt}
          onChange={(e) => set("baseline_prompt", e.target.value)}
          rows={5}
          className="mt-2 w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-navy-500"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-text-heading mb-1">
          CRAFT Prompt
        </label>
        {!task.craft_prompt && <DeferredCallout />}
        <textarea
          value={task.craft_prompt}
          onChange={(e) => set("craft_prompt", e.target.value)}
          rows={8}
          className="mt-2 w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-navy-500"
        />
      </div>
    </div>
  );
}

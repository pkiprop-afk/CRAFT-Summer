import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";
import { assembleCraftPrompt } from "@/lib/craft";
import { DOMAIN_LABELS, type TaskRecord } from "@/types";

const CRAFT_COMPONENT_FIELDS = [
  ["craft_context", "Context"],
  ["craft_role", "Role"],
  ["craft_actions", "Actions"],
  ["craft_format", "Format"],
  ["craft_tone", "Tone"],
] as const;

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

  function setCraftComponent(key: (typeof CRAFT_COMPONENT_FIELDS)[number][0], value: string) {
    const next = { ...task, [key]: value };
    onChange({ ...next, craft_prompt: assembleCraftPrompt(next) });
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

  function moveConstraint(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= task.expected_constraints.length) return;
    const next = [...task.expected_constraints];
    [next[index], next[target]] = [next[target], next[index]];
    set("expected_constraints", next);
  }

  // Always derived from the live component values, so the preview cannot drift
  // from what would actually be sent to a model.
  const derivedCraftPrompt = assembleCraftPrompt(task);
  const blankConstraints = task.expected_constraints.filter((c) => !c.trim()).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-heading mb-2">Task Metadata</h2>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="flex items-center gap-1 text-xs text-text-muted">
              <Lock size={11} /> task_id (immutable)
            </dt>
            <dd className="font-mono text-text-heading">{task.task_id}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">domain</dt>
            <dd className="text-text-heading">{DOMAIN_LABELS[task.domain]}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">source_or_origin</dt>
            <dd className="text-text-heading">{task.source_or_origin}</dd>
          </div>
        </dl>
      </div>

      <div>
        <label className="block text-sm font-semibold text-text-heading mb-1">
          Task Title
        </label>
        <input
          value={task.task_title}
          onChange={(e) => set("task_title", e.target.value)}
          className="w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
        />
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
        <div className="flex items-baseline justify-between mb-1">
          <label className="block text-sm font-semibold text-text-heading">
            Expected Constraints
          </label>
          <span className="text-xs text-text-muted">
            {task.expected_constraints.length} item
            {task.expected_constraints.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mb-2 text-xs text-text-muted">
          Stored as a list — one constraint per row. Numbering is positional; do not type
          &quot;(1)&quot; markers.
        </p>
        <ol className="space-y-2">
          {task.expected_constraints.map((constraint, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="mt-2 text-xs text-text-muted w-4 shrink-0">{index + 1}.</span>
              <textarea
                value={constraint}
                onChange={(e) => setConstraint(index, e.target.value)}
                rows={2}
                placeholder="Describe one constraint…"
                className={`flex-1 rounded-lg border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 ${
                  constraint.trim() ? "border-cream-border" : "border-warning/50"
                }`}
              />
              <div className="flex flex-col gap-0.5 pt-1">
                <button
                  type="button"
                  onClick={() => moveConstraint(index, -1)}
                  disabled={index === 0}
                  className="text-text-muted hover:text-navy-900 disabled:opacity-30"
                  aria-label="Move constraint up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveConstraint(index, 1)}
                  disabled={index === task.expected_constraints.length - 1}
                  className="text-text-muted hover:text-navy-900 disabled:opacity-30"
                  aria-label="Move constraint down"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => removeConstraint(index)}
                  className="text-text-muted hover:text-error"
                  aria-label="Remove constraint"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ol>
        {task.expected_constraints.length === 0 && (
          <p className="rounded-md bg-error/10 border border-error/30 px-3 py-2 text-xs text-error">
            At least one constraint is required — this task will fail validation on save.
          </p>
        )}
        {blankConstraints > 0 && (
          <p className="mt-2 text-xs text-warning">
            {blankConstraints} blank constraint{blankConstraints === 1 ? "" : "s"} will be dropped
            on save.
          </p>
        )}
        <button
          type="button"
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

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-heading">CRAFT Components</h2>
        {CRAFT_COMPONENT_FIELDS.map(([key, label]) => (
          <div key={key}>
            <label className="block text-sm font-semibold text-text-heading mb-1">{label}</label>
            <textarea
              value={task[key]}
              onChange={(e) => setCraftComponent(key, e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
          </div>
        ))}
      </div>

      <div>
        <label className="flex items-center gap-1.5 text-sm font-semibold text-text-heading mb-1">
          <Lock size={13} className="text-text-muted" />
          CRAFT Prompt
          <span className="font-normal text-text-muted">
            (derived from the five components above — not editable)
          </span>
        </label>
        {!derivedCraftPrompt.trim() && <DeferredCallout />}
        <textarea
          value={derivedCraftPrompt}
          readOnly
          tabIndex={-1}
          aria-readonly="true"
          rows={8}
          className="mt-2 w-full rounded-lg border border-cream-border bg-cream-card px-3 py-2 text-sm font-mono text-text-muted cursor-not-allowed focus:outline-none"
        />
        <p className="mt-1 text-xs text-text-muted">
          Live preview — updates as you edit the components. Re-derived server-side on save, so
          this is exactly what a model would receive.
        </p>
      </div>
    </div>
  );
}

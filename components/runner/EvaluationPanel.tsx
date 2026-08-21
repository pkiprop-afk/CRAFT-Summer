import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { ParsedEvaluation } from "@/lib/evaluator";

export type EvaluatorChoice = "gemini-1.5-pro" | "claude-3-5-sonnet" | "skip";

interface EvaluationPanelProps {
  anonymizedOutputId: string;
  evaluatorChoice: EvaluatorChoice;
  onEvaluatorChoiceChange: (choice: EvaluatorChoice) => void;
  onEvaluate: () => void;
  evaluating: boolean;
  evaluation: ParsedEvaluation | null;
  evaluationError: string | null;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  saveError: string | null;
  canSave: boolean;
}

function scoreColor(value: number, max: number): string {
  const ratio = value / max;
  if (ratio >= 0.8) return "var(--color-score-high)";
  if (ratio >= 0.5) return "var(--color-score-mid)";
  return "var(--color-score-low)";
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const color = scoreColor(value, max);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-text-heading">{label}</span>
        <span className="font-mono text-text-muted">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-cream-border overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${(value / max) * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function EvaluationPanel({
  anonymizedOutputId,
  evaluatorChoice,
  onEvaluatorChoiceChange,
  onEvaluate,
  evaluating,
  evaluation,
  evaluationError,
  onSave,
  saving,
  saved,
  saveError,
  canSave,
}: EvaluationPanelProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-text-heading">Send to Evaluator</h2>

      <span className="inline-block rounded-full bg-navy-100 text-navy-900 font-mono text-xs px-3 py-1">
        {anonymizedOutputId}
      </span>

      <div>
        <label className="block text-sm font-medium text-text-heading mb-1">
          Evaluator Model
        </label>
        <Select
          value={evaluatorChoice}
          onChange={(e) => onEvaluatorChoiceChange(e.target.value as EvaluatorChoice)}
        >
          <option value="gemini-1.5-pro">Gemini 1.5 Pro (recommended)</option>
          <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
          <option value="skip">Do not evaluate (save output only)</option>
        </Select>
        <p className="mt-1 text-xs text-text-muted">
          Gemini is the recommended evaluator. If Claude is your test model for this output,
          using Claude as evaluator introduces family bias — prefer Gemini.
        </p>
      </div>

      {evaluatorChoice !== "skip" && (
        <Button onClick={onEvaluate} disabled={evaluating}>
          {evaluating ? "Evaluating…" : "Evaluate Output"}
        </Button>
      )}

      {evaluationError && <p className="text-sm text-error">{evaluationError}</p>}

      {evaluation && (
        <div className="space-y-3 rounded-lg bg-cream-card border border-cream-border p-4">
          <ScoreBar label="Constraint Adherence" value={evaluation.constraint_adherence} max={4} />
          <ScoreBar label="Logical Accuracy" value={evaluation.logical_accuracy} max={4} />
          <ScoreBar label="Completeness" value={evaluation.completeness} max={2} />
          <div className="flex items-center justify-between pt-1 border-t border-cream-border">
            <span className="text-sm font-semibold text-text-heading">Total</span>
            <span className="font-mono text-sm font-semibold text-text-heading">
              {evaluation.total}/10
            </span>
          </div>
          <p className="text-xs text-text-muted">{evaluation.justification}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={onSave} disabled={!canSave || saving}>
          {saving ? "Saving…" : "Save Result"}
        </Button>
        {saved && <span className="text-sm text-success">Saved</span>}
        {saveError && <span className="text-sm text-error">{saveError}</span>}
      </div>
    </section>
  );
}

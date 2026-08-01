import Link from "next/link";
import { DOMAIN_ACCENT_VAR, DOMAIN_LABELS, type TaskRecord } from "@/types";

interface TaskCardProps {
  task: TaskRecord;
  hasResults: boolean;
  hasScores: boolean;
}

function StatusDot({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-text-muted">
      <span
        className={`inline-block w-2 h-2 rounded-full ${on ? "bg-success" : "bg-cream-border"}`}
      />
      {label}
    </div>
  );
}

export function TaskCard({ task, hasResults, hasScores }: TaskCardProps) {
  const hasPrompts = Boolean(task.baseline_prompt && task.craft_prompt);
  const accent = DOMAIN_ACCENT_VAR[task.domain];

  return (
    <Link
      href={`/tasks/${task.task_id}`}
      className="block rounded-lg bg-white border border-cream-border p-5 hover:shadow-sm transition-shadow"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs bg-navy-100 text-navy-900 rounded-full px-2.5 py-1">
          {task.task_id}
        </span>
        <span
          className="text-xs font-medium rounded-full px-2.5 py-1 text-white"
          style={{ backgroundColor: accent }}
        >
          {DOMAIN_LABELS[task.domain]}
        </span>
      </div>
      <p className="text-sm text-text-body line-clamp-2 mb-4">{task.task_description}</p>
      <div className="flex items-center gap-4">
        <StatusDot label="Prompts" on={hasPrompts} />
        <StatusDot label="Run" on={hasResults} />
        <StatusDot label="Scored" on={hasScores} />
      </div>
    </Link>
  );
}

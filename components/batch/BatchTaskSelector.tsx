"use client";

import { useMemo, useState } from "react";
import { isTaskReadyForScope, type ConditionScope } from "@/lib/batch";
import { DOMAIN_LABELS, type Domain, type TaskRecord } from "@/types";

interface BatchTaskSelectorProps {
  tasks: TaskRecord[];
  conditionScope: ConditionScope;
  selectedIds: Set<string>;
  onToggle: (taskId: string) => void;
  onSelectAllReady: () => void;
  onClearSelection: () => void;
}

const DOMAIN_TABS: Array<{ label: string; value: Domain | "all" }> = [
  { label: "All", value: "all" },
  { label: "Coding", value: "coding" },
  { label: "Data Analysis", value: "data_analysis" },
  { label: "Finance", value: "finance" },
  { label: "Policy", value: "policy" },
  { label: "Education", value: "education" },
  { label: "Communication", value: "communication" },
];

export function BatchTaskSelector({
  tasks,
  conditionScope,
  selectedIds,
  onToggle,
  onSelectAllReady,
  onClearSelection,
}: BatchTaskSelectorProps) {
  const [activeDomain, setActiveDomain] = useState<Domain | "all">("all");

  const filteredTasks = useMemo(
    () => tasks.filter((t) => activeDomain === "all" || t.domain === activeDomain),
    [tasks, activeDomain]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {DOMAIN_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveDomain(tab.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeDomain === tab.value
                  ? "bg-navy-900 text-cream"
                  : "bg-cream-card text-text-body hover:bg-navy-100"
              }`}
            >
              {tab.value === "all" ? "All" : DOMAIN_LABELS[tab.value]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button onClick={onSelectAllReady} className="text-navy-700 hover:text-navy-900 font-medium">
            Select all run-ready
          </button>
          <button onClick={onClearSelection} className="text-text-muted hover:text-text-body font-medium">
            Clear selection
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-cream-border divide-y divide-cream-border max-h-96 overflow-y-auto">
        {filteredTasks.map((task) => {
          const ready = isTaskReadyForScope(task, conditionScope);
          const checked = selectedIds.has(task.task_id);
          return (
            <label
              key={task.task_id}
              className={`flex items-start gap-3 px-3 py-2.5 ${
                ready ? "cursor-pointer hover:bg-navy-100/50" : "opacity-50 cursor-not-allowed"
              }`}
              title={ready ? undefined : "Missing a required prompt for the selected condition"}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                disabled={!ready}
                onChange={() => onToggle(task.task_id)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-navy-100 text-navy-900 rounded-full px-2 py-0.5">
                    {task.task_id}
                  </span>
                  <span className="text-xs text-text-muted">{DOMAIN_LABELS[task.domain]}</span>
                  {!ready && (
                    <span className="text-xs text-warning">missing prompt for this condition</span>
                  )}
                </div>
                <p className="text-sm text-text-body line-clamp-1">{task.task_description}</p>
              </div>
            </label>
          );
        })}
        {filteredTasks.length === 0 && (
          <p className="px-3 py-4 text-sm text-text-muted">No tasks in this domain.</p>
        )}
      </div>
    </div>
  );
}

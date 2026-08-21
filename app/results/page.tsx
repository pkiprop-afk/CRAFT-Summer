"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { OverviewChart } from "@/components/results/OverviewChart";
import { ScatterPlot, type ScatterDatum } from "@/components/results/ScatterPlot";
import { DomainChart, type GroupedBarDatum } from "@/components/results/DomainChart";
import { conditionStats, mean, pairByTask, round } from "@/lib/results";
import { isResultStale } from "@/lib/invalidation";
import { DOMAIN_LABELS, type Domain, type ResultRecord, type TaskRecord } from "@/types";

const TABS = ["Overview", "By Model", "By Domain", "By Submetric"];

export default function ResultsPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [allResults, setAllResults] = useState<ResultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(TABS[0]);
  // Stale runs are excluded from every aggregate by default — mixing them with
  // current runs compares outputs produced against different task content.
  const [excludeStale, setExcludeStale] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()) as Promise<TaskRecord[]>,
      fetch("/api/results").then((r) => r.json()) as Promise<ResultRecord[]>,
    ])
      .then(([taskData, resultData]) => {
        setTasks(taskData);
        setAllResults(resultData);
      })
      .catch(() => setLoadError("Failed to load results. Try refreshing the page."))
      .finally(() => setLoading(false));
  }, []);

  const taskDomainById = useMemo(() => {
    const map = new Map<string, Domain>();
    for (const t of tasks) map.set(t.task_id, t.domain);
    return map;
  }, [tasks]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.task_id, t])), [tasks]);

  const staleResults = useMemo(
    () => allResults.filter((r) => isResultStale(r, taskById.get(r.task_id))),
    [allResults, taskById]
  );

  const results = useMemo(
    () =>
      excludeStale
        ? allResults.filter((r) => !isResultStale(r, taskById.get(r.task_id)))
        : allResults,
    [allResults, taskById, excludeStale]
  );

  // Per-task mean first, then averaged across tasks — a task with more
  // repeat runs must not outweigh one with fewer. stddev is the run-to-run
  // spread within each task, itself averaged the same way (consistency).
  const baselineStats = useMemo(
    () => conditionStats(results, "baseline", (r) => r.total_score_0_10),
    [results]
  );
  const craftStats = useMemo(
    () => conditionStats(results, "craft", (r) => r.total_score_0_10),
    [results]
  );
  const meanBaseline = baselineStats.mean;
  const meanCraft = craftStats.mean;
  const delta = round(meanCraft - meanBaseline);

  const scatterData: ScatterDatum[] = useMemo(() => {
    const pairs = pairByTask(results);
    const data: ScatterDatum[] = [];
    for (const [taskId, group] of pairs) {
      if (group.baseline.length > 0 && group.craft.length > 0) {
        const domain = taskDomainById.get(taskId);
        if (!domain) continue;
        data.push({
          task_id: taskId,
          domain,
          baseline: round(mean(group.baseline.map((r) => r.total_score_0_10))),
          craft: round(mean(group.craft.map((r) => r.total_score_0_10))),
        });
      }
    }
    return data;
  }, [results, taskDomainById]);

  const modelRows = useMemo(() => {
    const models = Array.from(new Set(results.map((r) => r.model_name)));
    return models.map((model) => {
      const modelResults = results.filter((r) => r.model_name === model);
      return {
        model,
        baseline: conditionStats(modelResults, "baseline", (r) => r.total_score_0_10),
        craft: conditionStats(modelResults, "craft", (r) => r.total_score_0_10),
      };
    });
  }, [results]);

  const modelChartData: GroupedBarDatum[] = modelRows.map((row) => ({
    category: row.model,
    baseline: row.baseline.mean,
    craft: row.craft.mean,
  }));

  const domainRows = useMemo(() => {
    const domains = Array.from(new Set(tasks.map((t) => t.domain)));
    return domains.map((domain) => {
      const taskIds = new Set(tasks.filter((t) => t.domain === domain).map((t) => t.task_id));
      const domainResults = results.filter((r) => taskIds.has(r.task_id));
      const baseline = conditionStats(domainResults, "baseline", (r) => r.total_score_0_10);
      const craft = conditionStats(domainResults, "craft", (r) => r.total_score_0_10);
      return {
        domain,
        nTasks: taskIds.size,
        baseline,
        craft,
        delta: round(craft.mean - baseline.mean),
      };
    });
  }, [tasks, results]);

  const domainChartData: GroupedBarDatum[] = domainRows.map((row) => ({
    category: DOMAIN_LABELS[row.domain],
    baseline: row.baseline.mean,
    craft: row.craft.mean,
  }));

  const submetrics = [
    {
      label: "Constraint Adherence",
      max: 4,
      key: "constraint_adherence_score_0_4" as const,
    },
    {
      label: "Logical Accuracy",
      max: 4,
      key: "logical_accuracy_score_0_4" as const,
    },
    {
      label: "Completeness",
      max: 2,
      key: "completeness_score_0_2" as const,
    },
  ];

  if (loading) {
    return <p className="text-sm text-text-muted">Loading results…</p>;
  }

  if (loadError) {
    return <p className="text-sm text-error">{loadError}</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold text-text-heading">Results</h1>

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {staleResults.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm font-semibold text-warning">
            {staleResults.length} stale run{staleResults.length === 1 ? "" : "s"} detected
          </p>
          <p className="mt-1 text-xs text-warning/90">
            These were recorded against an earlier version of their task&apos;s content and are
            not comparable with current runs.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-warning">
            <input
              type="checkbox"
              checked={excludeStale}
              onChange={(e) => setExcludeStale(e.target.checked)}
            />
            Exclude stale runs from all figures below (recommended)
          </label>
          <ul className="mt-2 font-mono text-xs text-warning/90 max-h-32 overflow-y-auto">
            {staleResults.map((r) => (
              <li key={r.result_id}>
                {r.task_id} · {r.prompt_condition} · run {r.run_number} ·{" "}
                {taskById.has(r.task_id) ? "content changed" : "task no longer exists"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {results.length === 0 ? (
        <p className="text-sm text-text-muted">
          No results yet. Run and evaluate prompts from the Prompt Runner to populate this
          dashboard.
        </p>
      ) : (
        <>
          {activeTab === "Overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card accentColor="var(--color-cream-border)">
                  <p className="text-xs text-text-muted mb-1">Mean Baseline Score</p>
                  <p className="text-2xl font-display font-bold text-text-heading">
                    {meanBaseline}/10
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    SD {baselineStats.stddev} (run-to-run, n={baselineStats.nTasks} tasks)
                  </p>
                </Card>
                <Card accentColor="var(--color-navy-700)">
                  <p className="text-xs text-text-muted mb-1">Mean CRAFT Score</p>
                  <p className="text-2xl font-display font-bold text-text-heading">
                    {meanCraft}/10{" "}
                    <span className={delta >= 0 ? "text-success text-base" : "text-error text-base"}>
                      ({delta >= 0 ? "+" : ""}
                      {delta})
                    </span>
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    SD {craftStats.stddev} (run-to-run, n={craftStats.nTasks} tasks)
                  </p>
                </Card>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-text-heading mb-2">
                  Mean Score by Condition
                </h2>
                <OverviewChart meanBaseline={meanBaseline} meanCraft={meanCraft} />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-text-heading mb-2">
                  Baseline vs. CRAFT, per Task
                </h2>
                <ScatterPlot data={scatterData} />
              </div>
            </div>
          )}

          {activeTab === "By Model" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-text-heading mb-2">
                  Mean Score by Test Model
                </h2>
                <DomainChart data={modelChartData} />
              </div>
              <div className="overflow-x-auto rounded-lg border border-cream-border">
                <table className="w-full text-sm">
                  <thead className="bg-cream-card text-text-muted">
                    <tr>
                      <th className="text-left px-3 py-2">Model</th>
                      <th className="text-left px-3 py-2">Mean Baseline</th>
                      <th className="text-left px-3 py-2">SD Baseline</th>
                      <th className="text-left px-3 py-2">Mean CRAFT</th>
                      <th className="text-left px-3 py-2">SD CRAFT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelRows.map((row) => (
                      <tr key={row.model} className="border-t border-cream-border font-mono">
                        <td className="px-3 py-2 font-sans">{row.model}</td>
                        <td className="px-3 py-2">{row.baseline.mean}</td>
                        <td className="px-3 py-2">{row.baseline.stddev}</td>
                        <td className="px-3 py-2">{row.craft.mean}</td>
                        <td className="px-3 py-2">{row.craft.stddev}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "By Domain" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-text-heading mb-2">
                  Mean Score by Domain
                </h2>
                <DomainChart data={domainChartData} />
              </div>
              <div className="overflow-x-auto rounded-lg border border-cream-border">
                <table className="w-full text-sm">
                  <thead className="bg-cream-card text-text-muted">
                    <tr>
                      <th className="text-left px-3 py-2">Domain</th>
                      <th className="text-left px-3 py-2">n Tasks</th>
                      <th className="text-left px-3 py-2">Mean Baseline</th>
                      <th className="text-left px-3 py-2">SD Baseline</th>
                      <th className="text-left px-3 py-2">Mean CRAFT</th>
                      <th className="text-left px-3 py-2">SD CRAFT</th>
                      <th className="text-left px-3 py-2">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainRows.map((row) => (
                      <tr key={row.domain} className="border-t border-cream-border font-mono">
                        <td className="px-3 py-2 font-sans">{DOMAIN_LABELS[row.domain]}</td>
                        <td className="px-3 py-2">{row.nTasks}</td>
                        <td className="px-3 py-2">{row.baseline.mean}</td>
                        <td className="px-3 py-2">{row.baseline.stddev}</td>
                        <td className="px-3 py-2">{row.craft.mean}</td>
                        <td className="px-3 py-2">{row.craft.stddev}</td>
                        <td className="px-3 py-2">
                          {row.delta >= 0 ? "+" : ""}
                          {row.delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "By Submetric" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {submetrics.map((sub) => {
                const baseline = conditionStats(results, "baseline", (r) => r[sub.key]);
                const craft = conditionStats(results, "craft", (r) => r[sub.key]);
                return (
                  <div key={sub.key}>
                    <h2 className="text-sm font-semibold text-text-heading mb-2">
                      {sub.label} (0–{sub.max})
                    </h2>
                    <DomainChart
                      maxValue={sub.max}
                      height={220}
                      data={[
                        {
                          category: "Mean",
                          baseline: baseline.mean,
                          craft: craft.mean,
                        },
                      ]}
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      SD — Baseline {baseline.stddev} · CRAFT {craft.stddev}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

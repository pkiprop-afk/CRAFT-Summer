"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { OverviewChart } from "@/components/results/OverviewChart";
import { ScatterPlot, type ScatterDatum } from "@/components/results/ScatterPlot";
import { DomainChart, type GroupedBarDatum } from "@/components/results/DomainChart";
import { byCondition, mean, pairByTask, round } from "@/lib/results";
import { DOMAIN_LABELS, type Domain, type ResultRecord, type TaskRecord } from "@/types";

const TABS = ["Overview", "By Model", "By Domain", "By Submetric"];

export default function ResultsPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(TABS[0]);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()) as Promise<TaskRecord[]>,
      fetch("/api/results").then((r) => r.json()) as Promise<ResultRecord[]>,
    ])
      .then(([taskData, resultData]) => {
        setTasks(taskData);
        setResults(resultData);
      })
      .finally(() => setLoading(false));
  }, []);

  const taskDomainById = useMemo(() => {
    const map = new Map<string, Domain>();
    for (const t of tasks) map.set(t.task_id, t.domain);
    return map;
  }, [tasks]);

  const baselineResults = useMemo(() => byCondition(results, "baseline"), [results]);
  const craftResults = useMemo(() => byCondition(results, "craft"), [results]);

  const meanBaseline = round(mean(baselineResults.map((r) => r.total_score)));
  const meanCraft = round(mean(craftResults.map((r) => r.total_score)));
  const delta = round(meanCraft - meanBaseline);

  const scatterData: ScatterDatum[] = useMemo(() => {
    const pairs = pairByTask(results);
    const data: ScatterDatum[] = [];
    for (const [taskId, pair] of pairs) {
      if (pair.baseline && pair.craft) {
        const domain = taskDomainById.get(taskId);
        if (!domain) continue;
        data.push({
          task_id: taskId,
          domain,
          baseline: pair.baseline.total_score,
          craft: pair.craft.total_score,
        });
      }
    }
    return data;
  }, [results, taskDomainById]);

  const modelChartData: GroupedBarDatum[] = useMemo(() => {
    const models = Array.from(new Set(results.map((r) => r.test_model)));
    return models.map((model) => ({
      category: model,
      baseline: round(mean(baselineResults.filter((r) => r.test_model === model).map((r) => r.total_score))),
      craft: round(mean(craftResults.filter((r) => r.test_model === model).map((r) => r.total_score))),
    }));
  }, [results, baselineResults, craftResults]);

  const domainRows = useMemo(() => {
    const domains = Array.from(new Set(tasks.map((t) => t.domain)));
    return domains.map((domain) => {
      const taskIds = new Set(tasks.filter((t) => t.domain === domain).map((t) => t.task_id));
      const domainBaseline = baselineResults.filter((r) => taskIds.has(r.task_id));
      const domainCraft = craftResults.filter((r) => taskIds.has(r.task_id));
      const meanB = round(mean(domainBaseline.map((r) => r.total_score)));
      const meanC = round(mean(domainCraft.map((r) => r.total_score)));
      return {
        domain,
        nTasks: taskIds.size,
        meanBaseline: meanB,
        meanCraft: meanC,
        delta: round(meanC - meanB),
      };
    });
  }, [tasks, baselineResults, craftResults]);

  const domainChartData: GroupedBarDatum[] = domainRows.map((row) => ({
    category: DOMAIN_LABELS[row.domain],
    baseline: row.meanBaseline,
    craft: row.meanCraft,
  }));

  const submetrics = [
    {
      label: "Constraint Adherence",
      max: 4,
      key: "constraint_adherence" as const,
    },
    {
      label: "Logical Accuracy",
      max: 4,
      key: "logical_accuracy" as const,
    },
    {
      label: "Completeness",
      max: 2,
      key: "completeness" as const,
    },
  ];

  if (loading) {
    return <p className="text-sm text-text-muted">Loading results…</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold text-text-heading">Results</h1>

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

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
            <div>
              <h2 className="text-sm font-semibold text-text-heading mb-2">
                Mean Score by Test Model
              </h2>
              <DomainChart data={modelChartData} />
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
                      <th className="text-left px-3 py-2">Mean CRAFT</th>
                      <th className="text-left px-3 py-2">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainRows.map((row) => (
                      <tr key={row.domain} className="border-t border-cream-border font-mono">
                        <td className="px-3 py-2 font-sans">{DOMAIN_LABELS[row.domain]}</td>
                        <td className="px-3 py-2">{row.nTasks}</td>
                        <td className="px-3 py-2">{row.meanBaseline}</td>
                        <td className="px-3 py-2">{row.meanCraft}</td>
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
              {submetrics.map((sub) => (
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
                        baseline: round(mean(baselineResults.map((r) => r[sub.key]))),
                        craft: round(mean(craftResults.map((r) => r[sub.key]))),
                      },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

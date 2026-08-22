"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { OverviewChart } from "@/components/results/OverviewChart";
import { ScatterPlot, type ScatterDatum } from "@/components/results/ScatterPlot";
import { DomainChart, type GroupedBarDatum } from "@/components/results/DomainChart";
import { pairedStats, pairedUnits, round, type PairedUnit } from "@/lib/results";
import { joinResults, type ScoredResult } from "@/lib/resultsJoin";
import { isResultStale } from "@/lib/invalidation";
import { computeIrr } from "@/lib/irr";
import {
  DOMAIN_LABELS,
  type Domain,
  type EvaluationRecord,
  type ResultRecord,
  type TaskRecord,
} from "@/types";

const TABS = ["Overview", "By Model", "By Domain", "By Submetric", "Judge Agreement"];

/**
 * PRIMARY JUDGE ONLY. Never an average of the two — see lib/resultsJoin.ts.
 */
const totalOf = (s: ScoredResult) => s.primaryTotal;

export default function ResultsPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [rawResults, setRawResults] = useState<ResultRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(TABS[0]);
  // Stale runs are excluded from every aggregate by default — mixing them with
  // current runs compares outputs produced against different task content.
  const [excludeStale, setExcludeStale] = useState(true);
  // A run scored by fewer than two judges is excluded by default: mixing a
  // one-judge estimate with two-judge estimates is not like-for-like.
  const [excludeIncomplete, setExcludeIncomplete] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()) as Promise<TaskRecord[]>,
      fetch("/api/results").then((r) => r.json()) as Promise<ResultRecord[]>,
      fetch("/api/evaluations").then((r) => r.json()) as Promise<EvaluationRecord[]>,
    ])
      .then(([taskData, resultData, evalData]) => {
        setTasks(taskData);
        setRawResults(resultData);
        setEvaluations(evalData);
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

  const allScored = useMemo(
    () => joinResults(rawResults, evaluations),
    [rawResults, evaluations]
  );

  const staleResults = useMemo(
    () => allScored.filter((s) => isResultStale(s.result, taskById.get(s.result.task_id))),
    [allScored, taskById]
  );

  const incompleteResults = useMemo(
    () => allScored.filter((s) => !s.isComplete),
    [allScored]
  );

  const truncatedResults = useMemo(
    () => allScored.filter((s) => s.result.truncated),
    [allScored]
  );

  const results = useMemo(
    () =>
      allScored.filter((s) => {
        if (excludeStale && isResultStale(s.result, taskById.get(s.result.task_id))) return false;
        if (excludeIncomplete && !s.isComplete) return false;
        return s.primaryTotal !== null;
      }),
    [allScored, taskById, excludeStale, excludeIncomplete]
  );

  // R1 — every aggregate below is PAIRED: the unit is one task x model cell,
  // and a cell counts only when BOTH conditions have a usable score. A task
  // with a complete baseline and a missing craft contributes to neither mean.
  // There is a single n per aggregate by construction.
  const units: PairedUnit[] = useMemo(() => pairedUnits(results, totalOf), [results]);
  const overview = useMemo(() => pairedStats(units), [units]);

  // One point per paired cell — a point is a genuine within-cell comparison,
  // never a pool of the two models' runs.
  const scatterData: ScatterDatum[] = useMemo(() => {
    const data: ScatterDatum[] = [];
    for (const u of units) {
      const domain = taskDomainById.get(u.task_id);
      if (!domain) continue;
      data.push({
        task_id: u.task_id,
        domain,
        baseline: round(u.baseline),
        craft: round(u.craft),
      });
    }
    return data;
  }, [units, taskDomainById]);

  const modelRows = useMemo(() => {
    const models = Array.from(new Set(units.map((u) => u.model_name)));
    return models.map((model) => ({
      model,
      stats: pairedStats(units.filter((u) => u.model_name === model)),
    }));
  }, [units]);

  const modelChartData: GroupedBarDatum[] = modelRows.map((row) => ({
    category: row.model,
    baseline: row.stats.meanBaseline,
    craft: row.stats.meanCraft,
  }));

  const domainRows = useMemo(() => {
    const domains = Array.from(new Set(tasks.map((t) => t.domain)));
    return domains.map((domain) => {
      const taskIds = new Set(tasks.filter((t) => t.domain === domain).map((t) => t.task_id));
      return {
        domain,
        stats: pairedStats(units.filter((u) => taskIds.has(u.task_id))),
      };
    });
  }, [tasks, units]);

  const domainChartData: GroupedBarDatum[] = domainRows.map((row) => ({
    category: DOMAIN_LABELS[row.domain],
    baseline: row.stats.meanBaseline,
    craft: row.stats.meanCraft,
  }));

  // R4 — the truncation banner reports the direction of the ACTUAL cases, not
  // a generic assumption about which condition runs longer.
  const truncationByCondition = useMemo(() => {
    const baseline = truncatedResults.filter(
      (s) => s.result.prompt_condition === "baseline"
    ).length;
    const craft = truncatedResults.length - baseline;
    return { baseline, craft };
  }, [truncatedResults]);

  // IRR is computed over complete runs regardless of the exclude toggles —
  // it is a property of the judges, not of the analysis sample.
  const irr = useMemo(
    () =>
      computeIrr(
        allScored.filter(
          (s) => !excludeStale || !isResultStale(s.result, taskById.get(s.result.task_id))
        )
      ),
    [allScored, excludeStale, taskById]
  );

  // Submetrics use the primary judge, like every other aggregate.
  const submetrics = [
    {
      label: "Constraint Adherence",
      max: 4,
      key: "constraint",
      accessor: (s: ScoredResult) => s.primaryConstraint,
    },
    {
      label: "Logical Accuracy",
      max: 4,
      key: "logical",
      accessor: (s: ScoredResult) => s.primaryLogical,
    },
    {
      label: "Completeness",
      max: 2,
      key: "completeness",
      accessor: (s: ScoredResult) => s.primaryCompleteness,
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

      {truncatedResults.length > 0 && (
        <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3">
          <p className="text-sm font-semibold text-error">
            {truncatedResults.length} truncated run
            {truncatedResults.length === 1 ? "" : "s"} — output hit the token limit
          </p>
          <p className="mt-1 text-xs text-error/90">
            A truncated response loses completeness points for a reason unrelated to the prompt
            condition.{" "}
            {/* R4 — direction from the actual cases, not an assumption. */}
            {truncationByCondition.craft === 0
              ? `All ${truncationByCondition.baseline} truncation${
                  truncationByCondition.baseline === 1 ? " is" : "s are"
                } in the BASELINE condition, so the truncation in this data cuts against
                baseline, not CRAFT.`
              : truncationByCondition.baseline === 0
                ? `All ${truncationByCondition.craft} truncation${
                    truncationByCondition.craft === 1 ? " is" : "s are"
                  } in the CRAFT condition, so the truncation in this data cuts against CRAFT.`
                : `${truncationByCondition.baseline} baseline vs ${truncationByCondition.craft} CRAFT
                  — the bias direction is mixed; judge per-pair.`}{" "}
            Re-run these with a higher max_tokens.
          </p>
          <ul className="mt-2 font-mono text-xs text-error/90 max-h-32 overflow-y-auto">
            {truncatedResults.map((s) => (
              <li key={s.result.result_id}>
                {s.result.task_id} · {s.result.prompt_condition} · run {s.result.run_number} ·{" "}
                {s.result.model_name} · max_tokens {s.result.max_tokens}
              </li>
            ))}
          </ul>
        </div>
      )}

      {incompleteResults.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm font-semibold text-warning">
            {incompleteResults.length} incomplete run
            {incompleteResults.length === 1 ? "" : "s"} — scored by fewer than two judges
          </p>
          <p className="mt-1 text-xs text-warning/90">
            Every run must be scored by both the primary and secondary judge. A singly-judged run
            is an incomplete cell, not a low score.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-warning">
            <input
              type="checkbox"
              checked={excludeIncomplete}
              onChange={(e) => setExcludeIncomplete(e.target.checked)}
            />
            Exclude incomplete runs from all figures below (recommended)
          </label>
          <ul className="mt-2 font-mono text-xs text-warning/90 max-h-32 overflow-y-auto">
            {/* R3 — the model is part of the cell identity. Without it, the same
                task+condition under the two models rendered as identical rows and
                read as duplicates. */}
            {incompleteResults.map((s) => (
              <li key={s.result.result_id}>
                {s.result.task_id} · {s.result.model_name} · {s.result.prompt_condition} · run{" "}
                {s.result.run_number} · {s.evaluations.length}/2 judges
              </li>
            ))}
          </ul>
        </div>
      )}

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
            {staleResults.map((s) => (
              <li key={s.result.result_id}>
                {s.result.task_id} · {s.result.model_name} · {s.result.prompt_condition} · run{" "}
                {s.result.run_number} ·{" "}
                {taskById.has(s.result.task_id) ? "content changed" : "task no longer exists"}
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
              {/* R1 — one n for the whole comparison. Both means cover exactly
                  these pairs; per-condition counts cannot differ by construction. */}
              <p className="text-sm text-text-muted">
                n = {overview.nPairs} paired cells (task × model, both conditions complete).
                Every figure below is computed over these pairs only.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card accentColor="var(--color-cream-border)">
                  <p className="text-xs text-text-muted mb-1">Mean Baseline Score</p>
                  <p className="text-2xl font-display font-bold text-text-heading">
                    {overview.meanBaseline}/10
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    SD {overview.sdAcrossBaseline} (across paired cells — run-to-run variance
                    exists only in the stability subset)
                  </p>
                </Card>
                <Card accentColor="var(--color-navy-700)">
                  <p className="text-xs text-text-muted mb-1">Mean CRAFT Score</p>
                  <p className="text-2xl font-display font-bold text-text-heading">
                    {overview.meanCraft}/10{" "}
                    <span
                      className={
                        overview.delta >= 0 ? "text-success text-base" : "text-error text-base"
                      }
                    >
                      ({overview.delta >= 0 ? "+" : ""}
                      {overview.delta})
                    </span>
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    SD {overview.sdAcrossCraft} (across paired cells) · paired delta SD{" "}
                    {overview.sdDelta}
                  </p>
                </Card>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-text-heading mb-2">
                  Mean Score by Condition
                </h2>
                <OverviewChart
                  meanBaseline={overview.meanBaseline}
                  meanCraft={overview.meanCraft}
                />
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
                      <th className="text-left px-3 py-2">n paired tasks</th>
                      <th className="text-left px-3 py-2">Mean Baseline</th>
                      <th className="text-left px-3 py-2">SD Baseline (across tasks)</th>
                      <th className="text-left px-3 py-2">Mean CRAFT</th>
                      <th className="text-left px-3 py-2">SD CRAFT (across tasks)</th>
                      <th className="text-left px-3 py-2">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelRows.map((row) => (
                      <tr key={row.model} className="border-t border-cream-border font-mono">
                        <td className="px-3 py-2 font-sans">{row.model}</td>
                        <td className="px-3 py-2">{row.stats.nPairs}</td>
                        <td className="px-3 py-2">{row.stats.meanBaseline}</td>
                        <td className="px-3 py-2">{row.stats.sdAcrossBaseline}</td>
                        <td className="px-3 py-2">{row.stats.meanCraft}</td>
                        <td className="px-3 py-2">{row.stats.sdAcrossCraft}</td>
                        <td className="px-3 py-2">
                          {row.stats.delta >= 0 ? "+" : ""}
                          {row.stats.delta}
                        </td>
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
                      <th className="text-left px-3 py-2">n paired cells</th>
                      <th className="text-left px-3 py-2">Mean Baseline</th>
                      <th className="text-left px-3 py-2">SD Baseline (across cells)</th>
                      <th className="text-left px-3 py-2">Mean CRAFT</th>
                      <th className="text-left px-3 py-2">SD CRAFT (across cells)</th>
                      <th className="text-left px-3 py-2">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainRows.map((row) => (
                      <tr key={row.domain} className="border-t border-cream-border font-mono">
                        <td className="px-3 py-2 font-sans">{DOMAIN_LABELS[row.domain]}</td>
                        <td className="px-3 py-2">{row.stats.nPairs}</td>
                        <td className="px-3 py-2">{row.stats.meanBaseline}</td>
                        <td className="px-3 py-2">{row.stats.sdAcrossBaseline}</td>
                        <td className="px-3 py-2">{row.stats.meanCraft}</td>
                        <td className="px-3 py-2">{row.stats.sdAcrossCraft}</td>
                        <td className="px-3 py-2">
                          {row.stats.delta >= 0 ? "+" : ""}
                          {row.stats.delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "Judge Agreement" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-text-heading mb-1">
                  Inter-rater reliability
                </h2>
                <p className="text-xs text-text-muted">
                  Computed over {irr.n} complete run{irr.n === 1 ? "" : "s"} (one primary, one
                  secondary). Study scores use the primary judge only; the secondary exists to
                  quantify how much a score depends on who is judging.
                </p>
              </div>

              {irr.n === 0 ? (
                <p className="text-sm text-text-muted">
                  No completely-judged runs yet — agreement cannot be computed.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card accentColor="var(--color-navy-700)">
                      <p className="text-xs text-text-muted mb-1">ICC(3,1) — total score</p>
                      <p className="text-2xl font-display font-bold text-text-heading">
                        {irr.icc31 === null ? "n/a" : irr.icc31}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">{irr.iccNote}</p>
                    </Card>
                    <Card accentColor="var(--color-cream-border)">
                      <p className="text-xs text-text-muted mb-1">
                        Disagreements &gt; {irr.disagreementThreshold} points
                      </p>
                      <p className="text-2xl font-display font-bold text-text-heading">
                        {irr.largeDisagreements.length}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        of {irr.n} complete runs
                      </p>
                    </Card>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-cream-border">
                    <table className="w-full text-sm">
                      <thead className="bg-cream-card text-text-muted">
                        <tr>
                          <th className="text-left px-3 py-2">Metric</th>
                          <th className="text-left px-3 py-2">Max</th>
                          <th className="text-left px-3 py-2">n</th>
                          <th className="text-left px-3 py-2">% exact agreement</th>
                          <th className="text-left px-3 py-2">Mean abs. difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {irr.metrics.map((m) => (
                          <tr key={m.metric} className="border-t border-cream-border font-mono">
                            <td className="px-3 py-2">{m.metric}</td>
                            <td className="px-3 py-2">{m.max}</td>
                            <td className="px-3 py-2">{m.n}</td>
                            <td className="px-3 py-2">{m.percentExactAgreement}%</td>
                            <td className="px-3 py-2">{m.meanAbsoluteDifference}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-text-heading mb-2">
                      Runs where judges differ by more than {irr.disagreementThreshold} points
                    </h3>
                    {irr.largeDisagreements.length === 0 ? (
                      <p className="text-sm text-text-muted">None.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-cream-border">
                        <table className="w-full text-xs">
                          <thead className="bg-cream-card text-text-muted">
                            <tr>
                              <th className="text-left px-3 py-2">Task</th>
                              <th className="text-left px-3 py-2">Model</th>
                              <th className="text-left px-3 py-2">Condition</th>
                              <th className="text-left px-3 py-2">Run type</th>
                              <th className="text-left px-3 py-2">Primary</th>
                              <th className="text-left px-3 py-2">Secondary</th>
                              <th className="text-left px-3 py-2">Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {irr.largeDisagreements.map((d) => (
                              <tr
                                key={d.result_id}
                                className="border-t border-cream-border font-mono"
                              >
                                <td className="px-3 py-2">{d.task_id}</td>
                                <td className="px-3 py-2">{d.model_name}</td>
                                <td className="px-3 py-2">{d.prompt_condition}</td>
                                <td className="px-3 py-2">{d.run_type}</td>
                                <td className="px-3 py-2">
                                  {d.primary_total}/10 <span className="text-text-muted">({d.primary_model})</span>
                                </td>
                                <td className="px-3 py-2">
                                  {d.secondary_total}/10{" "}
                                  <span className="text-text-muted">({d.secondary_model})</span>
                                </td>
                                <td className="px-3 py-2 font-semibold text-error">
                                  {d.difference}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "By Submetric" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {submetrics.map((sub) => {
                const stats = pairedStats(pairedUnits(results, sub.accessor));
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
                          baseline: stats.meanBaseline,
                          craft: stats.meanCraft,
                        },
                      ]}
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      n = {stats.nPairs} pairs · SD across cells — Baseline{" "}
                      {stats.sdAcrossBaseline} · CRAFT {stats.sdAcrossCraft}
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

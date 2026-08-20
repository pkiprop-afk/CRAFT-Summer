import { Card } from "@/components/ui/Card";
import { CRAFTExplainer } from "@/components/craft/CRAFTExplainer";
import { getTasks } from "@/lib/db";
import { DOMAIN_LABELS } from "@/types";

const RUBRIC_ROWS = [
  {
    label: "Constraint Adherence",
    points: 4,
    description: "Did the response follow the explicit constraints of the task?",
  },
  {
    label: "Logical Accuracy",
    points: 4,
    description: "Is the reasoning or factual content of the response correct?",
  },
  {
    label: "Completeness",
    points: 2,
    description: "Does the response address every required element of the task?",
  },
];

const STUDY_DESIGN = [
  {
    title: "Design",
    body: "Within-task paired comparison — same task, two prompt conditions",
  },
  {
    title: "Hypothesis",
    body: "CRAFT prompts produce higher Task Adherence & Accuracy scores",
  },
  {
    title: "Test Models",
    body: "Claude 3.5 Sonnet, GPT-4o (the models being prompted)",
  },
  {
    title: "Evaluation",
    body: "Blind scoring by LLM judge using a fixed three-metric rubric",
  },
];

// Read at request time so the headline stats always reflect the current
// registry rather than a figure baked in at authoring time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const tasks = await getTasks();
  const taskCount = tasks.length;
  const domainCount = Object.keys(DOMAIN_LABELS).length;

  return (
    <div className="space-y-16 pb-12">
      {/* Hero */}
      <section className="space-y-5">
        <h1 className="text-4xl font-display font-bold text-text-heading">
          Assessing the CRAFT Framework
        </h1>
        <p className="text-lg text-text-muted max-w-2xl">
          A structured prompt engineering benchmark study — Peter Kiprop, advised by Prof. Vlad
          Veksler
        </p>
        <div className="flex gap-3">
          <div className="rounded-lg bg-cream-card border border-cream-border px-4 py-2 text-sm font-medium text-text-heading">
            {taskCount} Benchmark {taskCount === 1 ? "Task" : "Tasks"}
          </div>
          <div className="rounded-lg bg-cream-card border border-cream-border px-4 py-2 text-sm font-medium text-text-heading">
            {domainCount} Domains
          </div>
        </div>
      </section>

      {/* Research Summary */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-2xl font-display font-bold text-text-heading mb-3">
            Research Summary
          </h2>
          <p className="text-base text-text-body">
            This study evaluates whether structured, CRAFT-formatted prompts improve output
            consistency and constraint adherence relative to unstructured prompts of equivalent
            intent. {taskCount} benchmark {taskCount === 1 ? "task" : "tasks"} spanning{" "}
            {domainCount} professional domains are each run under
            two prompt conditions — baseline and CRAFT — against the same test model. Outputs
            are anonymized and scored by an LLM judge against a fixed three-metric rubric,
            enabling a within-task paired comparison of the two conditions.
          </p>
        </div>
        <div className="space-y-3">
          {RUBRIC_ROWS.map((row) => (
            <div
              key={row.label}
              className="flex items-center gap-4 rounded-lg bg-cream-card border border-cream-border px-4 py-3"
            >
              <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-navy-700 text-white text-xs font-semibold w-10 h-10 font-mono">
                {row.points}
              </span>
              <div>
                <p className="text-sm font-semibold text-text-heading">{row.label}</p>
                <p className="text-xs text-text-muted">{row.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CRAFT Framework Explainer */}
      <CRAFTExplainer />

      {/* Study Design at a Glance */}
      <section className="space-y-4">
        <h2 className="text-2xl font-display font-bold text-text-heading">
          Study Design at a Glance
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STUDY_DESIGN.map((item) => (
            <Card key={item.title} accentColor="var(--color-navy-700)">
              <p className="text-sm font-semibold text-text-heading mb-1">{item.title}</p>
              <p className="text-sm text-text-body">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

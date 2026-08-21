# CRAFT Benchmark

A research tool built for a summer academic study comparing **unstructured (baseline)** prompt
outputs against **structured (CRAFT)** prompt outputs across a set of benchmark tasks, evaluated
by an LLM judge on a fixed rubric.

**Researcher:** Peter Kiprop
**Advisor:** Prof. Vlad Veksler

**Research question:** To what extent does the CRAFT framework improve output consistency and
constraint adherence compared to unstructured prompting?

This is a local, single-user research instrument — not a general-purpose prompt engineering
tool. It has no accounts, no external database, and no data sharing beyond the model API calls
it makes on request.

## What it does

- Explains the CRAFT framework (**C**ontext, **R**ole, **A**ctions, **F**ormat, **T**one) and how
  it's applied in this study
- Houses the benchmark task set, organized by domain, with editable prompts and rubrics
- Runs baseline and CRAFT prompts against test models (Claude 3.5 Sonnet, GPT-4o)
- Sends outputs to an LLM evaluator (Gemini 1.5 Pro or Claude 3.5 Sonnet) against a fixed,
  three-metric rubric
- Anonymizes outputs before evaluation — the evaluator never sees which prompt condition or
  model produced a given response
- Displays results (by condition, model, domain, and submetric) and exports the dataset for
  offline analysis

## Tech stack

- **Framework:** Next.js (App Router), TypeScript
- **Styling:** Tailwind CSS + CSS custom properties for the design system (cream/navy palette,
  CRAFT accent colors)
- **Data storage:** flat JSON files under `/data` (`tasks.json`, `results.json`) — no database
- **LLM clients:** `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`
- **Charts:** Recharts
- **Icons:** lucide-react
- **Fonts:** Playfair Display (headings), Inter (UI), JetBrains Mono (code / raw output)

## Getting started

```bash
npm install
```

Create `.env.local` with your API keys (all optional — the app degrades gracefully if a key is
missing, but the corresponding model/evaluator call will fail):

```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

Run the dev server:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Pages

| Route | Purpose |
|---|---|
| `/` | CRAFT framework explainer, research summary, and study design overview |
| `/tasks` | Browse, filter, search, and import benchmark tasks |
| `/tasks/[task_id]` | Edit a task's fields, prompts, and constraints; view its CRAFT Completeness Meter and any existing results |
| `/run` | Three-step flow: select a task/condition, run it against a test model, send the output to an evaluator, and save the result |
| `/results` | Compare baseline vs. CRAFT scores — Overview, By Model, By Domain, and By Submetric tabs |
| `/export` | Download tasks and results as CSV or JSONL |

## The CRAFT Completeness Meter

A five-segment pill (C / R / A / F / T) that lights up each letter in its accent color when the
task's CRAFT prompt contains a labeled marker for that component (`Context:`, `Role:`,
`Actions:`, `Format:`, `Tone:`). It appears on the Task Detail and Prompt Runner pages.

## Evaluation methodology

- The evaluator prompt is fixed (see `lib/evaluator.ts`) and scores three submetrics:
  **Constraint Adherence** (0–4), **Logical Accuracy** (0–4), and **Completeness** (0–2), for a
  total out of 10.
- The evaluator call **never** receives the prompt condition label, the test model name, or the
  anonymized output ID — only the task description, expected constraints, rubric notes, and the
  raw model response. This enforces blinded scoring.
- Every raw output is stored before it's sent for evaluation.
- Evaluations are produced only by an API-backed evaluator. Hand-entered scores are not
  accepted: a human pasting a score knows which condition produced the output, which would
  bypass blinding entirely.

## Data schema

`data/tasks.json` and `data/results.json` are the only persistent state. See `types/index.ts`
for the full `TaskRecord` and `ResultRecord` shapes. Both files start seeded — `tasks.json` with
a few starter tasks spanning coding, communication, and data analysis domains, `results.json`
empty until you run and evaluate prompts.

## Project structure

```
app/            Pages (App Router) and API route handlers
components/     UI building blocks (craft/, tasks/, runner/, results/, nav/, ui/)
lib/            Data access, LLM client wrappers, CSV/evaluator helpers
types/          Shared TypeScript types
data/           tasks.json / results.json (the actual research data)
```

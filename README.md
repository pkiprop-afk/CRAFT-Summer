# CRAFT Benchmark Study

A paired benchmark study testing whether prompts structured with the **CRAFT** framework — Context, Role, Actions, Format, Tone — outperform baseline prompts of equivalent intent.

Fifty tasks across six professional domains were run under both prompt conditions on two frontier models, and every output was scored blind by two LLM judges against a fixed three-metric rubric. This repository holds the benchmark application, the task registry, and the complete run and evaluation record.

**Researcher:** Peter Kiprop · **Advisor:** Prof. Vlad Veksler

---

## Headline result

The effect is **model-specific**, and it is negative where it exists.

| | claude-sonnet-5 | gpt-5.5 |
|---|---|---|
| Pairs | 50 | 50 |
| Baseline mean | 9.28 / 10 | 8.96 / 10 |
| CRAFT mean | 8.74 / 10 | 8.90 / 10 |
| Delta (CRAFT − baseline) | **−0.54** | **−0.06** |
| Wilcoxon *p* | **0.0028** | 0.55 |
| Cohen's *d_z* | **−0.42** | −0.04 |

For **claude-sonnet-5**, CRAFT produced a statistically significant small negative effect. For **gpt-5.5**, the effect is null on every measure. The pooled figure (−0.30, *p* = 0.0225) averages one real effect and one null one, so **per-model figures are the reporting unit** and the pooled column is context only.

All of this sits at a **pronounced ceiling**: the baseline condition already scored 9.12/10 pooled, and 54% of all pairs tied at 10/10. CRAFT had very little headroom to demonstrate an improvement in, which is the single most important qualifier on the result above.

Constraint adherence accounts for 21 of the 25 losses. The interpretation offered in the report is that CRAFT reliably elicits comprehensive, structured output — an advantage when constraints reward coverage, a penalty when they require restraint.

**Scale:** 320 generations · 640 evaluations · 100 paired cells · plus a 40-cell stability subset (10 frozen tasks at n=3).

The full argument, including every deviation from the original proposal and the known limitations, is in **[the study report](#the-paper)**.

---

## Browsing the results

**No API keys are required, and nothing you do can alter the study.** Set `REVIEW_MODE=true` and the app serves the stored run record as a read-only archive: the runners disappear from the navigation, every route that generates or writes returns HTTP 403, and the missing-key warnings are suppressed because no keys are needed to read anything.

### Option A — GitHub Codespaces (nothing to install)

1. Click the green **Code** button at the top of this repository.
2. Choose the **Codespaces** tab → **Create codespace on main**.
3. Wait. It installs dependencies and builds the app once (a few minutes on the default 2-core machine). You do not need to type anything.
4. The app opens by itself in a **Simple Browser** pane. To read it full-width, open the **Ports** panel at the bottom, find port 3000, and click the globe icon to open it in a real browser tab.

The devcontainer sets `REVIEW_MODE=true` for you. Compute comes out of your own GitHub Codespaces allowance, which is generous for reading a study; stop the codespace from the same Codespaces menu when you are done.

### Option B — Clone and run locally

Requires **Node.js ≥ 20.9** and npm. No API keys.

```bash
git clone https://github.com/pkiprop-afk/CRAFT-Summer.git
cd CRAFT-Summer
npm ci
npm run build
REVIEW_MODE=true npm start        # then open http://localhost:3000
```

On Windows PowerShell, set the variable first:

```powershell
$env:REVIEW_MODE = "true"
npm start
```

`REVIEW_MODE` is read per request, not baked in at build time, so it is safe to build once and toggle the flag between runs.

### What you can look at

| Page | What's there |
|---|---|
| **CRAFT Framework** | The framework, the rubric, and the study design at a glance |
| **Task Library** | All 50 tasks — stimulus, expected constraints, and the five authored CRAFT component fields for each |
| **Progress** | Cell-by-cell completion of the design grid |
| **Results** | Overview, By Model, By Domain, By Submetric, and **Judge Agreement** |
| **Paper** | The full study report, in-page and as a PDF download |
| **Export** | CSV and JSONL downloads of the underlying records |

Prompt Runner and Batch Runner are hidden in review mode. They are the only pages that spend money.

---

## The paper

**Results, Methods, and Deviations** — the study report, covering what changed from the original proposal and why, what was retained unchanged, the known limitations, and the full results.

- In the app: the **Paper** entry in the sidebar (`/paper`)
- Direct PDF: [`public/paper/craft-results-methods-deviations.pdf`](public/paper/craft-results-methods-deviations.pdf)

The in-app version is a transcription of that PDF. A short *Transcription notes* block at the foot of the page records any difference between the two, so the rendered page can never diverge from the source document without saying so.

## References

Every source the study draws on — task sourcing, framework literature, evaluation methodology, models, and software — is listed in **[REFERENCES.md](REFERENCES.md)**, and rendered in the app under **References** (`/references`).

`REFERENCES.md` is **generated** from [`lib/references.ts`](lib/references.ts), which is the single source of truth behind the markdown, the `/references` route, and the reference block at the foot of the paper. Edit the module, then run `npm run references`; `npm run references -- --check` fails if the markdown has drifted.

Entries are APA 7. Citations that the source documents left thin are marked *incomplete* rather than repaired, and citations still owed are marked **outstanding** — nothing has been completed from outside the researcher's own documents.

## CSV exports

Available from the **Export** page, or directly from a running instance:

| Export | Route | Contents |
|---|---|---|
| Results CSV | `/api/export/results-csv` | 320 rows × 21 columns |
| Evaluations CSV | `/api/export/evaluations-csv` | 640 rows × 13 columns |
| Tasks CSV | `/api/export/tasks-csv` | 50 rows |
| Tasks JSONL | `/api/export/tasks-jsonl` | 50 records, one per line |

---

## Data schema

The two record types join on **`result_id`**: one row in `results.json` is one generation, and it has exactly two rows in `evaluations.json` — one primary judge, one secondary.

> **Scoring rule:** default aggregates use the **primary judge only**, never an average of the two. Averaging would destroy the reliability measurement the second judge exists to produce, and because the secondary judge rotates by producing model, it would also bake GPT-as-judge into the Claude distribution and vice versa. Agreement between the two is reported separately, on the Judge Agreement tab.

### `results.json` — 21 columns

| Column | Notes |
|---|---|
| `result_id` | Primary key; **join key** to evaluations |
| `task_id` | → `tasks.json` |
| `task_version` | Content hash of the scoring-relevant task fields; detects a run made against since-edited task content |
| `model_name` | `claude-sonnet-5` or `gpt-5.5-2026-04-23` |
| `model_provenance_fingerprint` | Provider-reported identity at call time |
| `prompt_condition` | `baseline` or `craft` |
| `run_number` | 1 for main runs; 1–3 for the stability subset |
| `run_type` | `main` (n=1) or `stability` (n=3) |
| `decoding_params` | Provider defaults — `null` for Claude, `1.0` for GPT |
| `max_tokens` | 4000 |
| `system_prompt` | |
| `run_settings_hash` | Rejects a pair whose two conditions did not run under identical settings |
| `run_settings_fields` | The fields that hash covers |
| `run_date` | |
| `raw_model_output` | Full untruncated response text |
| `anonymized_output_id` | Opaque token (`OUT-0001`) shown to judges instead of model/condition |
| `truncated` | True for exactly one run — T010, claude-sonnet-5, baseline |
| `reasoning_tokens` | |
| `retry_count`, `retry_log` | Zero across all 320 generations |
| `notes` | |

### `evaluations.json` — 13 columns

| Column | Notes |
|---|---|
| `evaluation_id` | Primary key |
| `result_id` | **Join key** to results |
| `evaluator_model` | `gemini-3.7-flash` (always primary), or the rotating secondary |
| `evaluator_provenance_fingerprint` | |
| `is_primary` | **True selects the headline figures** |
| `evaluated_at` | |
| `constraint_adherence_score_0_4` | Rubric metric 1 |
| `logical_accuracy_score_0_4` | Rubric metric 2 |
| `completeness_score_0_2` | Rubric metric 3 |
| `total_score_0_10` | Sum of the three |
| `retry_count`, `retry_log` | Judge-side reliability; see the report's limitations |
| `evaluator_justification` | The judge's written reasoning for the scores |

---

## Repository layout

```
app/                    Next.js App Router
  api/                  Route handlers — reads are open, writes are gated by REVIEW_MODE
  paper/                The study report as a route
  results/ tasks/ progress/ export/     Read-only views
  run/ batch/           The runners (hidden and 403'd in review mode)
components/             UI, incl. review/ (the read-only mode) and results/ (charts)
lib/                    Study logic — see below
data/                   THE STUDY RECORD (see below)
scripts/                Preflight gates and analysis CLIs
tests/                  12 node:test suites over the load-bearing logic
public/paper/           The report PDF
```

Notable modules in `lib/`: `craft.ts` (mechanical CRAFT prompt assembly), `promptAssembly.ts`, `evaluator.ts` (judge prompt + response parsing), `blinding.ts` / `blindingGuard.ts` (opaque tokens, server-side family-collision rejection), `resultsJoin.ts` (the primary-judge-only rule), `stats.ts`, `irr.ts`, `models/provenance.ts`, and `reviewMode.ts`.

### `data/` — the run record

Everything below is committed. This is the study; the app is just a reader for it.

| File | What it is |
|---|---|
| `tasks.json` | The 50-task registry: stimulus, expected constraints, and the five authored CRAFT component fields per task. 8 coding, 9 finance, 9 policy, 9 data analysis, 8 education, 7 communication |
| `results.json` | 320 generations |
| `evaluations.json` | 640 evaluations |
| `blinding_map.json` | Output token → task/model/condition. Stored **outside** every evaluator code path, which is what makes the blinding real rather than conventional |
| `eval_attempts.json` | 759 judge-call telemetry records — the source of the retry and failure rates in the report |
| `stability_subset.json` | The frozen 10-task subset, with the seed and draw order that produced it |
| `model_manifests/` | 10 timestamped provider manifests bracketing each dispatch period, used to prove no model changed mid-study |
| `current_leg.json` | Dispatch leg marker |
| `remedy_thinking_dump.json` | Record of the 16 secondary evaluations that needed an extended output budget |

---

## Reproducing a run

> **Running the study costs money.** It makes paid API calls to Anthropic, OpenAI, and Google. A full main study is 200 generations plus 400 evaluations; the stability subset adds 120 more generations. Do not start a batch to see what the button does — the review-mode instructions above show you the finished study for free.

### Prerequisites

- Node.js ≥ 20.9
- Funded API accounts with **Anthropic**, **OpenAI**, and **Google** — all three are required, because every run calls the test model *and* both rotation judges

### Environment variables

Copy [`.env.example`](.env.example) to `.env.local` and fill in the three keys:

```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

**`.env.local` is the only place in this repository where a credential belongs.** It is gitignored and must stay that way. Nothing else here is safe to paste a key into — this repo is a study record and everything in it is meant to be readable. Environment variables are read at server startup, so restart the dev server after editing the file.

Leave `REVIEW_MODE` unset (or `false`) to run the study.

### The four preflight gates

Run in this order before dispatching anything. The first three are free; the fourth spends about 30 tokens.

```bash
npm run validate                # 1. Parity gate — non-zero exit means the study is not in a runnable state
npm run check-models            # 2. Every configured model ID is actually offered by its provider
npm run capture-model-manifest  # 3. Timestamped provenance snapshot, before and after each dispatch period
npm run check-callable          # 4. One ~10-token generation per provider
```

Gate 4 exists because gates 1–3 use model-**list** endpoints, which consume no credit — so an exhausted balance passes all of them. Only an actual generation proves the key can spend.

### Running

`npm run dev`, then **Prompt Runner** for a single task or **Batch Runner** for a batch. Batch Runner blocks dispatch if any of the three keys is missing, and pauses at a checkpoint partway through.

### Other scripts

```bash
npm run checkpoint              # Read-only progress + stats report; makes no model calls
npm run stability-report        # Within-cell variance over the frozen subset
npm run evaluate-pending        # Score generations that have no evaluation yet
npm test                        # 12 test suites
npm run lint
```

---

## Caveats

- **The model versions are not archival snapshots.** Neither Anthropic nor Google offers dated snapshot identifiers for the models used, so two of the three identifiers are bare and repointable. Findings are attributable only to the model state **observed in August 2026**, as documented in `data/model_manifests/`. This is a property of the provider ecosystem, not of the study design.
- **Findings apply to this task set at this difficulty.** The tasks were calibrated against source material written for an earlier model generation and were then run on 2026 frontier models, which solved them easily. The resulting ceiling — 9.12/10 at baseline, 54% of pairs tied at 10/10 — is the dominant feature of the data. A different, harder task set could give a different answer.
- **Evaluation is LLM-judged, not human-validated.** No human rater scored any output. Inter-rater agreement is measured between the two LLM judges (ICC(3,1) = 0.821 on total scores), which speaks to their consistency with each other, not to their agreement with human judgment.
- **Cross-model comparison is descriptive only.** The secondary judge rotates by producing model and the two models run under different decoding regimes. Only the baseline-vs-CRAFT comparison *within* a model is a controlled contrast.
- **The effect is small relative to noise.** The pooled delta of −0.30 exceeds the mean within-cell run-to-run SD of 0.220 by a factor of 1.37. No individual pair's delta is interpretable at n=1; the result holds only because 100 paired comparisons average the noise out.

---


## A note on the commit history

Commits in this repository are auto-generated by [GitDoc](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.gitdoc), which commits on save. Messages are bare timestamps and **commit boundaries carry no meaning** — a single commit may hold half an edit, and a coherent change may span several. Read the tree, not the history.

## Citation

See [`CITATION.cff`](CITATION.cff). CFF 1.2.0 has no field for a supervisory role, so the advisor is named in the abstract rather than listed as an author.

## License

None yet. Open-sourcing is a decision that has not been made, and the absence of a LICENSE file is deliberate — default copyright applies.

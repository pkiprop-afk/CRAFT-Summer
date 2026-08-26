<!-- GENERATED FILE — DO NOT EDIT BY HAND.
     Source of truth: lib/references.ts
     Regenerate with: npm run references -->

# References

Sources for the CRAFT benchmark study, organized by function. Every entry is drawn from one of three documents supplied by the researcher — the research proposal, the reflection paper, or the study report. **Nothing here has been completed or inferred from outside those documents:** thin citations are marked *Incomplete* rather than repaired, and citations that are owed but not yet supplied are marked **OUTSTANDING**.

This page is also rendered in the app at `/references`.

## Citation style

APA 7 throughout. The reflection paper's list was already APA 7 and is reproduced as written; the proposal's IEEE-numeric entries were converted and are marked “converted from IEEE” so the conversion can be checked against the original. Nothing has been completed from outside the three supplied documents: thin citations are marked incomplete rather than filled in.

### Source documents

- **Research proposal** ([`/proposal`](/proposal)): Structured Prompt Engineering Framework: Assessing The Effectiveness of The CRAFT Framework
- **Reflection paper** ([`/reflection`](/reflection)): Reflection Paper
- **Study report** ([`/paper`](/paper)): Results, Methods, and Deviations

---

## Task sourcing

Where the 50 benchmark tasks came from. Seventeen tasks adapt problems from a published benchmark; four build on documented statistical phenomena; the remaining 29 (5 data analysis, 9 policy, 8 education, 7 communication) are original constructions with no external source.

- Chen, M., Tworek, J., Jun, H., Yuan, Q., Pinto, H. P. de O., Kaplan, J., Edwards, H., Burda, Y., Joseph, N., Brockman, G., Ray, A., Puri, R., Krueger, G., Petrov, M., Khlaaf, H., Sastry, G., Mishkin, P., Chan, B., Gray, S., … Zaremba, W. (2021). Evaluating large language models trained on code. arXiv:2107.03374 [Cs].
  <https://arxiv.org/abs/2107.03374>
  — [`Reflection [1]`](/reflection#ref-1) · Reflection paper
  - **Used for:** HumanEval — the source benchmark for 17 tasks. Coding (T001–T008) adapt nine HumanEval problems (/3, /9, /21, /26, /47, /52, /61, /110, /135) as applied scenarios with original injected bugs; Finance (T018–T026) transpose the same computational structures into financial framings. The task-to-problem mapping is recorded per task in the source_or_origin field of data/tasks.json.
  - **Editorial note:** The supplied reference list prints the first author as “hen, M.”; corrected to “Chen, M.” on the researcher's confirmation.

- Bickel, P. J., Hammel, E. A., & O’Connell, J. W. (1975). Sex bias in graduate admissions: Data from Berkeley. Science, 187(4175), 398–404.
  <https://doi.org/10.1126/science.187.4175.398>
  — [`Reflection [2]`](/reflection#ref-2) · Reflection paper
  - **Used for:** Cited jointly with Tversky & Kahneman (1974) for the documented statistical and decision-making phenomena behind the Data Analysis tasks: Simpson's paradox, survivorship bias, regression to the mean, and base-rate neglect. Four tasks invoke these (T009, T012, T016, T017); the numbers in each are original.

- Tversky, A., & Kahneman, D. (1974). Judgment under uncertainty: Heuristics and Biases. Science, 185(4157), 1124–1131.
  <https://www.science.org/doi/10.1126/science.185.4157.1124>
  — [`Reflection [3]`](/reflection#ref-3) · Reflection paper
  - **Used for:** Cited jointly with Bickel et al. (1975) — see above. Underpins the base-rate and heuristics reasoning tested in the Data Analysis tasks.

- Liu, X., Wu, Z., Wu, X., Lu, P., Chang, K.-W., & Feng, Y. (2024). Are LLMs capable of data-based statistical and causal reasoning? Benchmarking advanced quantitative reasoning with data. In L.-W. Ku, A. Martins, & V. Srikumar (Eds.), Findings of the Association for Computational Linguistics: ACL 2024 (pp. 9215–9235). Association for Computational Linguistics.
  <https://doi.org/10.18653/v1/2024.findings-acl.548>
  — [`Reflection [4]`](/reflection#ref-4) · Reflection paper
  - **Used for:** QRData — evaluated as a possible source for the Data Analysis tasks and rejected. Its questions rely on separate data sheets, whereas this study required self-contained text inputs that could be presented identically under both prompt conditions. Retained as related work.
  - **Editorial note:** Stray BibTeX braces in “Are {LLM}s” removed, and the page range “9215--9235” normalised to an en dash, on the researcher's confirmation.

---

## Prompt engineering and framework literature

The CRAFT framework itself, and the prior work situating it. Entries drawn from the research proposal were converted from IEEE to APA 7 and are flagged accordingly.

- Joshi, D., et al. (2026). CRAFT prompt generation framework for teachers. In Proceedings of the 57th ACM Technical Symposium on Computer Science Education (Vol. 2).
  — [`Proposal [7]`](/proposal#ref-7) · Research proposal · **converted from IEEE — verify**
  - **Used for:** The source of the CRAFT framework (Context, Role, Actions, Format, Tone) that this study evaluates.
  - **Incomplete:** No page range, DOI, or publisher in the supplied proposal. The full author list is given only as “Joshi, Deepti, et al.”

- Schulhoff, S., et al. (2024). The prompt report: A systematic survey of prompt engineering techniques. arXiv:2406.06608.
  <https://arxiv.org/abs/2406.06608>
  — [`Proposal [2]`](/proposal#ref-2) · Research proposal · **converted from IEEE — verify**
  - **Used for:** The taxonomy of prompting techniques, and the observation that the field lacks a unified vocabulary and standardised frameworks for non-expert users — the gap this study addresses.
  - **Incomplete:** Full author list not given in the proposal (“S. Schulhoff et al.”).

- Anam, R. (2025). Prompt engineering and the effectiveness of large language models in enhancing human productivity: A preprint.
  — [`Proposal [1]`](/proposal#ref-1) · Research proposal · **converted from IEEE — verify**
  - **Used for:** The working definition of prompt engineering used in the proposal's introduction.
  - **Incomplete:** No venue, publisher, DOI, or URL in the supplied proposal.

- Dell’acqua, F., et al. (2024). Navigating the jagged technological frontier: Field experimental evidence of the effects of AI on knowledge worker productivity and quality (Harvard Business School Technology & Operations Mgt. Unit Working Paper).
  — [`Proposal [3]`](/proposal#ref-3) · Research proposal · **converted from IEEE — verify**
  - **Used for:** The BCG field-experiment findings quoted in the proposal — 12.2% more tasks completed, 25.1% faster, and the parallel MIT figures of 40% time reduction and 18% quality increase.
  - **Incomplete:** No working-paper number, DOI, or URL in the supplied proposal. Full author list not given (“F. Dell’acqua et al.”).

- Kulkarni, N., & Tupsakhare, P. (2024). Crafting effective prompts: Enhancing AI performance through structured input design. Journal of Recent Trends in Computer Science Engineering, 12(1), 1–10.
  — [`Proposal [4]`](/proposal#ref-4) · Research proposal · **converted from IEEE — verify**
  - **Used for:** Prior work on general structured input design.

- Robino, G. (2025). Conversation routines: A prompt engineering framework for task-oriented dialog systems. arXiv:2501.11613.
  <https://arxiv.org/abs/2501.11613>
  — [`Proposal [5]`](/proposal#ref-5) · Research proposal · **converted from IEEE — verify**
  - **Used for:** Prior work on prompt engineering frameworks.

- Ramnath, K., et al. (2025). A systematic survey of automatic prompt optimization techniques. arXiv:2502.16923.
  <https://arxiv.org/abs/2502.16923>
  — [`Proposal [6]`](/proposal#ref-6) · Research proposal · **converted from IEEE — verify**
  - **Used for:** Prior work on automatic prompt optimization.
  - **Incomplete:** Full author list not given in the proposal (“K. Ramnath et al.”).

- Anthropic. (2025a). Effective context engineering for AI agents. Anthropic. Anthropic.Com.
  <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
  — [`Reflection [6]`](/reflection#ref-6) · Reflection paper
  - **Used for:** Context-engineering guidance: use the smallest high-signal set of information that supports the expected behaviour, then add instructions or examples in response to observed failure modes. Also cited for the point that context engineering is broader than prompt engineering.

- Anthropic. (2025b). Prompt engineering overview. Anthropic. Claude API Docs.
  <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview>
  — [`Reflection [5]`](/reflection#ref-5) · Reflection paper
  - **Used for:** Evaluation-first guidance: define success criteria, test against them, and recognise that not every failure should be solved by adding more prompt engineering.

---

## Evaluation methodology

The statistical procedures the study reports. None of the three supplied documents cites a source for any of them, so the three entries below are outstanding — the researcher is supplying full references. They are deliberately left unfilled rather than completed from memory.

- *Shrout & Fleiss (1979) — full reference to be supplied.*
  — **OUTSTANDING**
  - **Used for:** ICC(3,1), two-way mixed, single measure, consistency — the inter-rater reliability statistic reported for total scores (0.821). Computed in lib/irr.ts.

- *Wilcoxon (1945) — full reference to be supplied.*
  — **OUTSTANDING**
  - **Used for:** Wilcoxon signed-rank test — the primary significance test, chosen because the ceiling zero-inflates the paired deltas. Implemented in lib/stats.ts.

- *Cohen (1988) — full reference to be supplied.*
  — **OUTSTANDING**
  - **Used for:** Cohen's d_z — the paired effect size reported per model (−0.416 for claude-sonnet-5, −0.043 for gpt-5.5). Implemented in lib/stats.ts.

---

## Considered but not used

Named in the research proposal as candidates and not carried into the executed study. None was given a citation in the proposal, so none is listed with one here.

- DS-1000 — named in the proposal; no citation given.
  — Research proposal
  - **Used for:** Listed in the proposal's methodology as an example benchmark the task set might draw on. Not used: the executed task set draws on HumanEval and original construction.
  - **Incomplete:** No citation supplied in the proposal.

- FinBen — named in the proposal; no citation given.
  — Research proposal
  - **Used for:** Listed in the proposal's methodology as an example benchmark for the finance domain. Not used: the Finance tasks transpose HumanEval computational structures into financial framings instead.
  - **Incomplete:** No citation supplied in the proposal.

- Manus 1.6 Pro — named in the proposal; no citation given.
  — Research proposal
  - **Used for:** Named in the proposal as one of two candidate evaluator models, alongside Gemini 1.5 Pro. Not used: see the deviations section of the study report for the evaluator substitution.
  - **Incomplete:** No citation supplied in the proposal.

---

## Models and APIs

The exact identifiers used in the run record. These are not research citations.

| Identifier | Role | Notes |
|---|---|---|
| `claude-sonnet-5` | Test model (Anthropic) | Prompted under both baseline and CRAFT conditions. Also serves as rotating secondary judge on GPT-produced output. Decoding at provider default; temperature not accepted, recorded as null. |
| `gpt-5.5-2026-04-23` | Test model (OpenAI) | Prompted under both conditions. Also serves as rotating secondary judge on Claude-produced output. Temperature pinned by the provider at 1.0; reasoning effort explicitly set to low. This dated identifier is what appears in the model_name column of data/results.json; the study report refers to it as gpt-5.5. |
| `gemini-3.7-flash` | Primary judge (Google) | Scores every output in the study. Family-neutral to both test models, which is the property the judge design rests on. |

Neither Anthropic nor Google publishes dated snapshot identifiers for the models used, so two of the three identifiers are bare and repointable. Timestamped provider manifests were captured before and after each dispatch period and are committed in data/model_manifests/; fingerprints were byte-identical across all of them. The models named in the original proposal — Claude 3.5 Sonnet, GPT-4o, and Gemini 1.5 Pro — were retired or access-restricted before data collection; the substitutions are documented in the study report.

---

## Software and tooling

Dependency manifest, not research citations. None of these appears in the researcher's proposal, reflection, or study report; they are listed so the environment that produced the run record is identifiable. Versions are the resolved versions actually installed, not the semver ranges in package.json.

| Package | Version | Role |
|---|---|---|
| `next` | 16.2.12 | Application framework (App Router) |
| `react` | 19.2.4 | UI runtime |
| `react-dom` | 19.2.4 | UI runtime |
| `recharts` | 3.10.1 | Result charts |
| `@anthropic-ai/sdk` | 0.115.0 | Anthropic API client |
| `openai` | 7.3.0 | OpenAI API client |
| `@google/generative-ai` | 0.24.1 | Google Generative AI client |
| `exceljs` | 4.4.0 | Task registry workbook import |
| `lucide-react` | 1.28.0 | Icons |
| `tailwindcss` | 4.3.3 | Styling |
| `typescript` | 5.9.3 | Type checking |
| `eslint` | ^9 | Linting |
| `Node.js` | ≥ 20.9 (24.13.0 used) | Runtime |

### Implementation validation

Used to validate the statistical implementations in lib/stats.ts against a known result. Recorded here for completeness; these are engineering checks, not sources for the study's methods.

- **Wilcoxon signed-rank implementation:** Wikipedia's worked example, cross-checked against scipy.stats.wilcoxon (statistic 18.0) (`tests/stats.test.ts`)

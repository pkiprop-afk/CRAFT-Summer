/**
 * CANONICAL REFERENCE LIST — the single source of truth.
 *
 * The /references route, the references block at the foot of the paper route,
 * and REFERENCES.md all read from this module. REFERENCES.md is GENERATED:
 * run `npm run references` after editing here. Never hand-edit REFERENCES.md —
 * it will be overwritten, and a hand-edit is exactly the drift this module
 * exists to prevent.
 *
 * SOURCING RULE: every entry here comes verbatim from one of three documents
 * the researcher supplied — the research proposal, the reflection paper, or
 * "Results, Methods, and Deviations". Nothing is inferred, completed, or
 * filled in from outside those documents. Where a citation is thin, it is
 * marked `incomplete` and rendered with that caveat visible rather than
 * quietly repaired. Where a citation is owed but not yet supplied, it is
 * marked `placeholder` and rendered as outstanding.
 *
 * Style: APA 7 throughout. The reflection paper was already APA 7 and its
 * entries are reproduced as written. The proposal was IEEE-numeric; those
 * entries are marked `convertedFromIEEE` so the conversion can be checked
 * against the original.
 */

/** Which of the researcher's documents an entry was drawn from. */
export type SourceDoc = "proposal" | "reflection" | "paper" | "repository";

export const SOURCE_DOC_LABEL: Record<SourceDoc, string> = {
  proposal: "Research proposal",
  reflection: "Reflection paper",
  paper: "Results, Methods, and Deviations",
  repository: "This repository",
};

export interface Reference {
  id: string;
  /** Full citation. APA 7. Verbatim from the source document unless noted. */
  citation: string;
  /** Only when the source document itself supplies one. Never constructed. */
  url?: string;
  /** What this source was actually used for in this study. */
  usedFor: string;
  /** Which supplied document(s) the citation appears in. */
  appearsIn: SourceDoc[];
  /** Where the citation sits in the source document, so the marker can link to it. */
  origin?: { doc: DocSlug; num: number };
  /** Converted from the proposal's IEEE format; verify against the original. */
  convertedFromIEEE?: boolean;
  /** What the supplied citation is missing. Rendered as a visible caveat. */
  incomplete?: string;
  /** Citation owed but not yet supplied. Rendered as outstanding. */
  placeholder?: boolean;
  /** Editorial change made to the supplied text, and why. */
  editorialNote?: string;
}

export interface ReferenceSection {
  id: string;
  title: string;
  blurb: string;
  entries: Reference[];
}

// ---------------------------------------------------------------------------

export const TASK_SOURCING: ReferenceSection = {
  id: "task-sourcing",
  title: "Task sourcing",
  blurb:
    "Where the 50 benchmark tasks came from. Seventeen tasks adapt problems from a published benchmark; four build on documented statistical phenomena; the remaining 29 (5 data analysis, 9 policy, 8 education, 7 communication) are original constructions with no external source.",
  entries: [
    {
      id: "chen-2021",
      citation:
        "Chen, M., Tworek, J., Jun, H., Yuan, Q., Pinto, H. P. de O., Kaplan, J., Edwards, H., Burda, Y., Joseph, N., Brockman, G., Ray, A., Puri, R., Krueger, G., Petrov, M., Khlaaf, H., Sastry, G., Mishkin, P., Chan, B., Gray, S., … Zaremba, W. (2021). Evaluating large language models trained on code. arXiv:2107.03374 [Cs].",
      url: "https://arxiv.org/abs/2107.03374",
      usedFor:
        "HumanEval — the source benchmark for 17 tasks. Coding (T001–T008) adapt nine HumanEval problems (/3, /9, /21, /26, /47, /52, /61, /110, /135) as applied scenarios with original injected bugs; Finance (T018–T026) transpose the same computational structures into financial framings. The task-to-problem mapping is recorded per task in the source_or_origin field of data/tasks.json.",
      appearsIn: ["reflection"],
      origin: { doc: "reflection", num: 1 },
      editorialNote:
        "The supplied reference list prints the first author as “hen, M.”; corrected to “Chen, M.” on the researcher's confirmation.",
    },
    {
      id: "bickel-1975",
      citation:
        "Bickel, P. J., Hammel, E. A., & O’Connell, J. W. (1975). Sex bias in graduate admissions: Data from Berkeley. Science, 187(4175), 398–404.",
      url: "https://doi.org/10.1126/science.187.4175.398",
      usedFor:
        "Cited jointly with Tversky & Kahneman (1974) for the documented statistical and decision-making phenomena behind the Data Analysis tasks: Simpson's paradox, survivorship bias, regression to the mean, and base-rate neglect. Four tasks invoke these (T009, T012, T016, T017); the numbers in each are original.",
      appearsIn: ["reflection"],
      origin: { doc: "reflection", num: 2 },
    },
    {
      id: "tversky-1974",
      citation:
        "Tversky, A., & Kahneman, D. (1974). Judgment under uncertainty: Heuristics and Biases. Science, 185(4157), 1124–1131.",
      url: "https://www.science.org/doi/10.1126/science.185.4157.1124",
      usedFor:
        "Cited jointly with Bickel et al. (1975) — see above. Underpins the base-rate and heuristics reasoning tested in the Data Analysis tasks.",
      appearsIn: ["reflection"],
      origin: { doc: "reflection", num: 3 },
    },
    {
      id: "liu-2024",
      citation:
        "Liu, X., Wu, Z., Wu, X., Lu, P., Chang, K.-W., & Feng, Y. (2024). Are LLMs capable of data-based statistical and causal reasoning? Benchmarking advanced quantitative reasoning with data. In L.-W. Ku, A. Martins, & V. Srikumar (Eds.), Findings of the Association for Computational Linguistics: ACL 2024 (pp. 9215–9235). Association for Computational Linguistics.",
      url: "https://doi.org/10.18653/v1/2024.findings-acl.548",
      usedFor:
        "QRData — evaluated as a possible source for the Data Analysis tasks and rejected. Its questions rely on separate data sheets, whereas this study required self-contained text inputs that could be presented identically under both prompt conditions. Retained as related work.",
      appearsIn: ["reflection"],
      origin: { doc: "reflection", num: 4 },
      editorialNote:
        "Stray BibTeX braces in “Are {LLM}s” removed, and the page range “9215--9235” normalised to an en dash, on the researcher's confirmation.",
    },
  ],
};

export const FRAMEWORK_LITERATURE: ReferenceSection = {
  id: "framework-literature",
  title: "Prompt engineering and framework literature",
  blurb:
    "The CRAFT framework itself, and the prior work situating it. Entries drawn from the research proposal were converted from IEEE to APA 7 and are flagged accordingly.",
  entries: [
    {
      id: "joshi-2026",
      citation:
        "Joshi, D., et al. (2026). CRAFT prompt generation framework for teachers. In Proceedings of the 57th ACM Technical Symposium on Computer Science Education (Vol. 2).",
      usedFor:
        "The source of the CRAFT framework (Context, Role, Actions, Format, Tone) that this study evaluates.",
      appearsIn: ["proposal"],
      origin: { doc: "proposal", num: 7 },
      convertedFromIEEE: true,
      incomplete:
        "No page range, DOI, or publisher in the supplied proposal. The full author list is given only as “Joshi, Deepti, et al.”",
    },
    {
      id: "schulhoff-2024",
      citation:
        "Schulhoff, S., et al. (2024). The prompt report: A systematic survey of prompt engineering techniques. arXiv:2406.06608.",
      url: "https://arxiv.org/abs/2406.06608",
      usedFor:
        "The taxonomy of prompting techniques, and the observation that the field lacks a unified vocabulary and standardised frameworks for non-expert users — the gap this study addresses.",
      appearsIn: ["proposal"],
      origin: { doc: "proposal", num: 2 },
      convertedFromIEEE: true,
      incomplete:
        "Full author list not given in the proposal (“S. Schulhoff et al.”).",
    },
    {
      id: "anam-2025",
      citation:
        "Anam, R. (2025). Prompt engineering and the effectiveness of large language models in enhancing human productivity: A preprint.",
      usedFor: "The working definition of prompt engineering used in the proposal's introduction.",
      appearsIn: ["proposal"],
      origin: { doc: "proposal", num: 1 },
      convertedFromIEEE: true,
      incomplete: "No venue, publisher, DOI, or URL in the supplied proposal.",
    },
    {
      id: "dellacqua-2024",
      citation:
        "Dell’acqua, F., et al. (2024). Navigating the jagged technological frontier: Field experimental evidence of the effects of AI on knowledge worker productivity and quality (Harvard Business School Technology & Operations Mgt. Unit Working Paper).",
      usedFor:
        "The BCG field-experiment findings quoted in the proposal — 12.2% more tasks completed, 25.1% faster, and the parallel MIT figures of 40% time reduction and 18% quality increase.",
      appearsIn: ["proposal"],
      origin: { doc: "proposal", num: 3 },
      convertedFromIEEE: true,
      incomplete:
        "No working-paper number, DOI, or URL in the supplied proposal. Full author list not given (“F. Dell’acqua et al.”).",
    },
    {
      id: "kulkarni-2024",
      citation:
        "Kulkarni, N., & Tupsakhare, P. (2024). Crafting effective prompts: Enhancing AI performance through structured input design. Journal of Recent Trends in Computer Science Engineering, 12(1), 1–10.",
      usedFor: "Prior work on general structured input design.",
      appearsIn: ["proposal"],
      origin: { doc: "proposal", num: 4 },
      convertedFromIEEE: true,
    },
    {
      id: "robino-2025",
      citation:
        "Robino, G. (2025). Conversation routines: A prompt engineering framework for task-oriented dialog systems. arXiv:2501.11613.",
      url: "https://arxiv.org/abs/2501.11613",
      usedFor: "Prior work on prompt engineering frameworks.",
      appearsIn: ["proposal"],
      origin: { doc: "proposal", num: 5 },
      convertedFromIEEE: true,
    },
    {
      id: "ramnath-2025",
      citation:
        "Ramnath, K., et al. (2025). A systematic survey of automatic prompt optimization techniques. arXiv:2502.16923.",
      url: "https://arxiv.org/abs/2502.16923",
      usedFor: "Prior work on automatic prompt optimization.",
      appearsIn: ["proposal"],
      origin: { doc: "proposal", num: 6 },
      convertedFromIEEE: true,
      incomplete:
        "Full author list not given in the proposal (“K. Ramnath et al.”).",
    },
    {
      id: "anthropic-2025a",
      citation:
        "Anthropic. (2025a). Effective context engineering for AI agents. Anthropic. Anthropic.Com.",
      url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents",
      usedFor:
        "Context-engineering guidance: use the smallest high-signal set of information that supports the expected behaviour, then add instructions or examples in response to observed failure modes. Also cited for the point that context engineering is broader than prompt engineering.",
      appearsIn: ["reflection"],
      origin: { doc: "reflection", num: 6 },
    },
    {
      id: "anthropic-2025b",
      citation: "Anthropic. (2025b). Prompt engineering overview. Anthropic. Claude API Docs.",
      url: "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview",
      usedFor:
        "Evaluation-first guidance: define success criteria, test against them, and recognise that not every failure should be solved by adding more prompt engineering.",
      appearsIn: ["reflection"],
      origin: { doc: "reflection", num: 5 },
    },
  ],
};

export const EVALUATION_METHODOLOGY: ReferenceSection = {
  id: "evaluation-methodology",
  title: "Evaluation methodology",
  blurb:
    "The statistical procedures the study reports. None of the three supplied documents cites a source for any of them, so the three entries below are outstanding — the researcher is supplying full references. They are deliberately left unfilled rather than completed from memory.",
  entries: [
    {
      id: "shrout-fleiss-1979",
      citation: "Shrout & Fleiss (1979) — full reference to be supplied.",
      usedFor:
        "ICC(3,1), two-way mixed, single measure, consistency — the inter-rater reliability statistic reported for total scores (0.821). Computed in lib/irr.ts.",
      appearsIn: [],
      placeholder: true,
    },
    {
      id: "wilcoxon-1945",
      citation: "Wilcoxon (1945) — full reference to be supplied.",
      usedFor:
        "Wilcoxon signed-rank test — the primary significance test, chosen because the ceiling zero-inflates the paired deltas. Implemented in lib/stats.ts.",
      appearsIn: [],
      placeholder: true,
    },
    {
      id: "cohen-1988",
      citation: "Cohen (1988) — full reference to be supplied.",
      usedFor:
        "Cohen's d_z — the paired effect size reported per model (−0.416 for claude-sonnet-5, −0.043 for gpt-5.5). Implemented in lib/stats.ts.",
      appearsIn: [],
      placeholder: true,
    },
  ],
};

export const CONSIDERED_NOT_USED: ReferenceSection = {
  id: "considered-not-used",
  title: "Considered but not used",
  blurb:
    "Named in the research proposal as candidates and not carried into the executed study. None was given a citation in the proposal, so none is listed with one here.",
  entries: [
    {
      id: "ds-1000",
      citation: "DS-1000 — named in the proposal; no citation given.",
      usedFor:
        "Listed in the proposal's methodology as an example benchmark the task set might draw on. Not used: the executed task set draws on HumanEval and original construction.",
      appearsIn: ["proposal"],
      incomplete: "No citation supplied in the proposal.",
    },
    {
      id: "finben",
      citation: "FinBen — named in the proposal; no citation given.",
      usedFor:
        "Listed in the proposal's methodology as an example benchmark for the finance domain. Not used: the Finance tasks transpose HumanEval computational structures into financial framings instead.",
      appearsIn: ["proposal"],
      incomplete: "No citation supplied in the proposal.",
    },
    {
      id: "manus-16-pro",
      citation: "Manus 1.6 Pro — named in the proposal; no citation given.",
      usedFor:
        "Named in the proposal as one of two candidate evaluator models, alongside Gemini 1.5 Pro. Not used: see the deviations section of the study report for the evaluator substitution.",
      appearsIn: ["proposal"],
      incomplete: "No citation supplied in the proposal.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Models and software are not research citations. They are recorded so the run
// is identifiable and reproducible, and are kept separate for that reason.

export interface ModelEntry {
  identifier: string;
  role: string;
  note: string;
}

export const MODELS: ModelEntry[] = [
  {
    identifier: "claude-sonnet-5",
    role: "Test model (Anthropic)",
    note: "Prompted under both baseline and CRAFT conditions. Also serves as rotating secondary judge on GPT-produced output. Decoding at provider default; temperature not accepted, recorded as null.",
  },
  {
    identifier: "gpt-5.5-2026-04-23",
    role: "Test model (OpenAI)",
    note: "Prompted under both conditions. Also serves as rotating secondary judge on Claude-produced output. Temperature pinned by the provider at 1.0; reasoning effort explicitly set to low. This dated identifier is what appears in the model_name column of data/results.json; the study report refers to it as gpt-5.5.",
  },
  {
    identifier: "gemini-3.7-flash",
    role: "Primary judge (Google)",
    note: "Scores every output in the study. Family-neutral to both test models, which is the property the judge design rests on.",
  },
];

export const MODEL_PROVENANCE_NOTE =
  "Neither Anthropic nor Google publishes dated snapshot identifiers for the models used, so two of the three identifiers are bare and repointable. Timestamped provider manifests were captured before and after each dispatch period and are committed in data/model_manifests/; fingerprints were byte-identical across all of them. The models named in the original proposal — Claude 3.5 Sonnet, GPT-4o, and Gemini 1.5 Pro — were retired or access-restricted before data collection; the substitutions are documented in the study report.";

export interface SoftwareEntry {
  name: string;
  version: string;
  role: string;
}

export const SOFTWARE: SoftwareEntry[] = [
  { name: "next", version: "16.2.12", role: "Application framework (App Router)" },
  { name: "react", version: "19.2.4", role: "UI runtime" },
  { name: "react-dom", version: "19.2.4", role: "UI runtime" },
  { name: "recharts", version: "3.10.1", role: "Result charts" },
  { name: "@anthropic-ai/sdk", version: "0.115.0", role: "Anthropic API client" },
  { name: "openai", version: "7.3.0", role: "OpenAI API client" },
  { name: "@google/generative-ai", version: "0.24.1", role: "Google Generative AI client" },
  { name: "exceljs", version: "4.4.0", role: "Task registry workbook import" },
  { name: "lucide-react", version: "1.28.0", role: "Icons" },
  { name: "tailwindcss", version: "4.3.3", role: "Styling" },
  { name: "typescript", version: "5.9.3", role: "Type checking" },
  { name: "eslint", version: "^9", role: "Linting" },
  { name: "Node.js", version: "≥ 20.9 (24.13.0 used)", role: "Runtime" },
];

export const SOFTWARE_NOTE =
  "Dependency manifest, not research citations. None of these appears in the researcher's proposal, reflection, or study report; they are listed so the environment that produced the run record is identifiable. Versions are the resolved versions actually installed, not the semver ranges in package.json.";

export interface ValidationSource {
  target: string;
  source: string;
  location: string;
}

export const VALIDATION_SOURCES: ValidationSource[] = [
  {
    target: "Wilcoxon signed-rank implementation",
    source:
      "Wikipedia's worked example, cross-checked against scipy.stats.wilcoxon (statistic 18.0)",
    location: "tests/stats.test.ts",
  },
];

export const VALIDATION_NOTE =
  "Used to validate the statistical implementations in lib/stats.ts against a known result. Recorded here for completeness; these are engineering checks, not sources for the study's methods.";

// ---------------------------------------------------------------------------

export const REFERENCE_SECTIONS: ReferenceSection[] = [
  TASK_SOURCING,
  FRAMEWORK_LITERATURE,
  EVALUATION_METHODOLOGY,
  CONSIDERED_NOT_USED,
];

/** Sources the researcher supplied, from which every entry above was drawn. */
export const SOURCE_DOCUMENTS = [
  {
    title: "Structured Prompt Engineering Framework: Assessing the Effectiveness of the CRAFT Framework",
    kind: "Research proposal",
    note: "IEEE-numeric reference list, entries [1]–[7].",
  },
  {
    title: "Reflection Paper",
    kind: "Reflection",
    note: "APA 7 reference list, entries [1]–[6].",
  },
  {
    title: "Results, Methods, and Deviations",
    kind: "Study report",
    note: "No reference list. Available in this app under Paper.",
  },
];

export const STYLE_NOTE =
  "APA 7 throughout. The reflection paper's list was already APA 7 and is reproduced as written; the proposal's IEEE-numeric entries were converted and are marked “converted from IEEE” so the conversion can be checked against the original. Nothing has been completed from outside the three supplied documents: thin citations are marked incomplete rather than filled in.";

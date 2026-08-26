/**
 * Transcription of "Results, Methods, and Deviations" (Peter Kiprop, advised by
 * Prof. Vlad Veksler), the study report supplied as
 * public/paper/craft-results-methods-deviations.pdf.
 *
 * The text follows the source document. Two figures in the source tables are
 * typographic slips contradicted by their own surrounding text; they are
 * corrected here and every correction is listed in TRANSCRIPTION_NOTES at the
 * foot of the page, so the rendered version never diverges from the PDF
 * silently.
 */

export const PAPER_TITLE = "Results, Methods, and Deviations";
export const PAPER_BYLINE = [
  { role: "Advisor", name: "Prof. Vlad Veksler" },
  { role: "Researcher", name: "Peter Kiprop" },
];
export const PAPER_PDF_HREF = "/paper/craft-results-methods-deviations.pdf";

export interface Section {
  id: string;
  heading: string;
}

export const SECTIONS: Section[] = [
  { id: "methods-and-deviations", heading: "Methods and Deviations" },
  { id: "summary-of-what-changed", heading: "Summary of what changed" },
  { id: "model-substitutions", heading: "Model Substitutions" },
  { id: "decoding-parameters", heading: "Decoding Parameters" },
  { id: "retained-unchanged", heading: "What was retained unchanged" },
  { id: "what-was-added", heading: "What was added" },
  { id: "known-limitations", heading: "Known limitations" },
  { id: "ceiling-effect", heading: "Ceiling effect" },
  { id: "results", heading: "Results" },
  { id: "what-drove-the-losses", heading: "What drove the losses" },
  { id: "mechanism", heading: "Mechanism" },
  { id: "inter-rater-reliability", heading: "Inter-rater reliability" },
  { id: "stability-subset", heading: "Stability subset" },
  { id: "provenance", heading: "Provenance" },
];

export const CHANGES_TABLE = {
  head: ["Element", "As proposed", "As executed", "Cause"],
  rows: [
    ["Test model 1", "claude-3-5-sonnet", "claude-sonnet-5", "Provider retirement"],
    ["Test model 2", "gpt-4o", "gpt-5.5", "Migrated for generational parity."],
    ["Evaluator", "gemini-1.5-pro", "gemini-3.7-flash", "Provider retirement, then access restriction."],
    ["Evaluator count", "One judge", "Two judges (primary + rotating secondary)", "Design strengthening."],
    ["Temperature", "0.2, both models", "Provider defaults", "Parameter removed or pinned by providers."],
    ["Generation max_tokens", "2000", "4000", "Truncation risk to structured output."],
    ["Judge max_tokens", "1024", "4000", "Systematic evaluation failures on complex inputs."],
  ],
};

export const HEADLINE_TABLE = {
  head: ["", "claude-sonnet-5", "gpt-5.5", "pooled"],
  rows: [
    ["Pairs", "50", "50", "100"],
    ["Baseline mean", "9.28", "8.96", "9.12"],
    ["CRAFT mean", "8.74", "8.90", "8.82"],
    ["Delta", "\u22120.54", "\u22120.06", "\u22120.30"],
    ["Wins/losses/ties", "2/16/32", "9/9/32", "11/25/64"],
    ["Wilcoxon p", "0.0028", "0.5518", "0.0225"],
    ["Paired t", "t(49) = \u22122.944, p = 0.0049", "t(49) = \u22120.305, p = 0.7617", "t(99) = \u22122.207, p = 0.0297"],
    ["Cohen\u2019s d_z", "\u22120.416", "\u22120.043", "\u22120.221"],
  ],
};

export const ASYMMETRY_TABLE = {
  head: ["Analysis", "claude-sonnet-5", "gpt-5.5"],
  rows: [
    ["Mean delta", "\u22120.54", "\u22120.06"],
    ["Significance", "p = 0.0028, d_z = \u22120.42", "p = 0.5518, d_z = \u22120.04"],
    ["Constraint-type correlation", "r = \u22120.31", "r = +0.11"],
  ],
};

export const LOSS_PATTERN_TABLE = {
  head: ["Subscore pattern", "Count"],
  rows: [
    ["Constraint adherence only", "8"],
    ["Constraint + logical", "7"],
    ["Constraint + logical + completeness", "6"],
    ["Completeness only", "2"],
    ["Logical + completeness", "1"],
    ["Logical only", "1"],
  ],
};

export const IRR_TABLE = {
  head: ["Metric", "Exact agreement", "MAD"],
  rows: [
    ["Constraint adherence (0\u20134)", "75.0%", "0.285"],
    ["Logical accuracy (0\u20134)", "77.5%", "0.265"],
    ["Completeness (0\u20132)", "92.5%", "0.095"],
    ["Total (0\u201310)", "65.0%", "0.645"],
  ],
};

export const STABILITY_TABLE = {
  head: ["Cut", "Mean within-cell SD"],
  rows: [
    ["All 40 cells", "0.220"],
    ["claude-sonnet-5", "0.298"],
    ["gpt-5.5", "0.141"],
    ["Baseline condition", "0.227"],
    ["CRAFT condition", "0.212"],
  ],
};

export const TRANSCRIPTION_NOTES = [
  "Headline table, Delta for claude-sonnet-5: the source PDF prints \u201c-0/54\u201d. Rendered here as \u22120.54, which is what the cell's own column implies (9.28 \u2212 8.74) and what the asymmetry table below reports as the mean delta.",
  "Asymmetry table, Significance for claude-sonnet-5: the source PDF prints \u201cd_x = -0.42\u201d. Rendered here as d_z, matching Cohen\u2019s d_z of \u22120.416 in the headline table and the statistic used throughout.",
  "No other figure, claim, or wording has been changed. Where the source is ambiguous or incomplete, it is transcribed as written.",
];

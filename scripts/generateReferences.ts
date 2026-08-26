/**
 * Generates REFERENCES.md from lib/references.ts.
 *
 * lib/references.ts is the single source of truth: the /references route, the
 * references block on the paper route, and this file all read from it. Editing
 * REFERENCES.md by hand is pointless — the next run overwrites it. Edit the
 * module and regenerate.
 *
 * Run: npm run references
 * Check without writing (exits 1 if stale): npm run references -- --check
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  MODELS,
  MODEL_PROVENANCE_NOTE,
  REFERENCE_SECTIONS,
  SOFTWARE,
  SOFTWARE_NOTE,
  SOURCE_DOCUMENTS,
  SOURCE_DOC_LABEL,
  STYLE_NOTE,
  VALIDATION_NOTE,
  VALIDATION_SOURCES,
  type Reference,
} from "../lib/references.ts";

const OUT = path.join(process.cwd(), "REFERENCES.md");

function entryMd(e: Reference): string {
  const lines: string[] = [];
  lines.push(`- ${e.placeholder ? `*${e.citation}*` : e.citation}`);
  if (e.url) lines.push(`  <${e.url}>`);

  const tags: string[] = [];
  if (e.originalRef) tags.push(`\`${e.originalRef}\``);
  for (const d of e.appearsIn) tags.push(SOURCE_DOC_LABEL[d]);
  if (e.convertedFromIEEE) tags.push("**converted from IEEE — verify**");
  if (e.placeholder) tags.push("**OUTSTANDING**");
  if (tags.length) lines.push(`  — ${tags.join(" · ")}`);

  lines.push(`  - **Used for:** ${e.usedFor}`);
  if (e.incomplete) lines.push(`  - **Incomplete:** ${e.incomplete}`);
  if (e.editorialNote) lines.push(`  - **Editorial note:** ${e.editorialNote}`);
  return lines.join("\n");
}

function render(): string {
  const out: string[] = [];

  out.push("<!-- GENERATED FILE — DO NOT EDIT BY HAND.");
  out.push("     Source of truth: lib/references.ts");
  out.push("     Regenerate with: npm run references -->");
  out.push("");
  out.push("# References");
  out.push("");
  out.push(
    "Sources for the CRAFT benchmark study, organized by function. Every entry is drawn from one of three documents supplied by the researcher — the research proposal, the reflection paper, or the study report. **Nothing here has been completed or inferred from outside those documents:** thin citations are marked *Incomplete* rather than repaired, and citations that are owed but not yet supplied are marked **OUTSTANDING**."
  );
  out.push("");
  out.push("This page is also rendered in the app at `/references`.");
  out.push("");
  out.push("## Citation style");
  out.push("");
  out.push(STYLE_NOTE);
  out.push("");
  out.push("### Source documents");
  out.push("");
  for (const d of SOURCE_DOCUMENTS) out.push(`- **${d.kind}:** ${d.title} — ${d.note}`);
  out.push("");

  for (const s of REFERENCE_SECTIONS) {
    out.push("---");
    out.push("");
    out.push(`## ${s.title}`);
    out.push("");
    out.push(s.blurb);
    out.push("");
    for (const e of s.entries) {
      out.push(entryMd(e));
      out.push("");
    }
  }

  out.push("---");
  out.push("");
  out.push("## Models and APIs");
  out.push("");
  out.push("The exact identifiers used in the run record. These are not research citations.");
  out.push("");
  out.push("| Identifier | Role | Notes |");
  out.push("|---|---|---|");
  for (const m of MODELS) out.push(`| \`${m.identifier}\` | ${m.role} | ${m.note} |`);
  out.push("");
  out.push(MODEL_PROVENANCE_NOTE);
  out.push("");

  out.push("---");
  out.push("");
  out.push("## Software and tooling");
  out.push("");
  out.push(SOFTWARE_NOTE);
  out.push("");
  out.push("| Package | Version | Role |");
  out.push("|---|---|---|");
  for (const s of SOFTWARE) out.push(`| \`${s.name}\` | ${s.version} | ${s.role} |`);
  out.push("");
  out.push("### Implementation validation");
  out.push("");
  out.push(VALIDATION_NOTE);
  out.push("");
  for (const v of VALIDATION_SOURCES) {
    out.push(`- **${v.target}:** ${v.source} (\`${v.location}\`)`);
  }
  out.push("");

  return out.join("\n");
}

const rendered = render();

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf-8");
  } catch {
    console.error("REFERENCES.md is missing. Run: npm run references");
    process.exit(1);
  }
  // Compare ignoring line-ending differences: the repo is authored on Windows.
  if (current.replace(/\r\n/g, "\n").trim() !== rendered.replace(/\r\n/g, "\n").trim()) {
    console.error(
      "REFERENCES.md is out of date with lib/references.ts. Run: npm run references"
    );
    process.exit(1);
  }
  console.log("REFERENCES.md is up to date with lib/references.ts.");
} else {
  writeFileSync(OUT, rendered, "utf-8");
  const total = REFERENCE_SECTIONS.reduce((n, s) => n + s.entries.length, 0);
  const outstanding = REFERENCE_SECTIONS.flatMap((s) => s.entries).filter(
    (e) => e.placeholder
  ).length;
  const incomplete = REFERENCE_SECTIONS.flatMap((s) => s.entries).filter(
    (e) => e.incomplete
  ).length;
  console.log(
    `Wrote REFERENCES.md — ${total} entries (${outstanding} outstanding, ${incomplete} flagged incomplete), ` +
      `${MODELS.length} models, ${SOFTWARE.length} packages.`
  );
}

import type { Metadata } from "next";
import { AlertCircle, BookMarked, ExternalLink } from "lucide-react";
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
} from "@/lib/references";

export const metadata: Metadata = {
  title: "References — CRAFT Benchmark",
  description:
    "Sources for the CRAFT benchmark study, organized by function: task sourcing, framework literature, evaluation methodology, models, and software.",
};

function Entry({ entry }: { entry: Reference }) {
  return (
    <li className="border-l-2 border-cream-border pl-4 py-1 space-y-1.5">
      <p
        className={`text-sm leading-relaxed ${
          entry.placeholder ? "text-text-muted italic" : "text-text-body"
        }`}
      >
        {entry.citation}
      </p>

      {entry.url ? (
        <p>
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 break-all font-mono text-xs text-navy-700 hover:text-navy-900 hover:underline"
          >
            {entry.url}
            <ExternalLink size={11} className="shrink-0" />
          </a>
        </p>
      ) : null}

      <p className="text-xs text-text-muted">
        <span className="font-medium text-text-body">Used for:</span> {entry.usedFor}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {entry.originalRef ? (
          <span className="rounded bg-cream-card border border-cream-border px-1.5 py-0.5 text-[11px] font-mono text-text-muted">
            {entry.originalRef}
          </span>
        ) : null}
        {entry.appearsIn.map((d) => (
          <span
            key={d}
            className="rounded bg-cream-card border border-cream-border px-1.5 py-0.5 text-[11px] text-text-muted"
          >
            {SOURCE_DOC_LABEL[d]}
          </span>
        ))}
        {entry.convertedFromIEEE ? (
          <span className="rounded bg-navy-100 border border-navy-500/30 px-1.5 py-0.5 text-[11px] text-navy-700">
            Converted from IEEE — verify
          </span>
        ) : null}
        {entry.placeholder ? (
          <span className="inline-flex items-center gap-1 rounded bg-warning/15 border border-warning/40 px-1.5 py-0.5 text-[11px] text-warning">
            <AlertCircle size={10} /> Outstanding
          </span>
        ) : null}
      </div>

      {entry.incomplete ? (
        <p className="text-xs text-warning">
          <span className="font-medium">Incomplete:</span> {entry.incomplete}
        </p>
      ) : null}
      {entry.editorialNote ? (
        <p className="text-xs text-text-muted">
          <span className="font-medium">Editorial note:</span> {entry.editorialNote}
        </p>
      ) : null}
    </li>
  );
}

export default function ReferencesPage() {
  return (
    <div className="max-w-3xl space-y-8 pb-16">
      <header className="space-y-3">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <BookMarked size={14} />
          Sources
        </p>
        <h1 className="text-4xl font-display font-bold text-text-heading">References</h1>
        <p className="text-base text-text-body">
          Every source below is drawn from one of three documents: the research proposal, the
          reflection paper, or the study report. Nothing here has been completed or inferred from
          outside them — thin citations are marked incomplete rather than repaired, and citations
          that are owed but not yet supplied are marked outstanding.
        </p>
      </header>

      <section className="rounded-lg border border-cream-border bg-cream-card px-4 py-3 space-y-2">
        <p className="text-sm font-semibold text-text-heading">Citation style</p>
        <p className="text-xs text-text-body">{STYLE_NOTE}</p>
        <p className="pt-1 text-xs font-semibold text-text-heading">Source documents</p>
        <ul className="space-y-0.5 text-xs text-text-muted">
          {SOURCE_DOCUMENTS.map((d) => (
            <li key={d.title}>
              <span className="text-text-body">{d.kind}:</span> {d.title} — {d.note}
            </li>
          ))}
        </ul>
      </section>

      {REFERENCE_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-6 space-y-3">
          <h2 className="text-2xl font-display font-bold text-text-heading border-t border-cream-border pt-5">
            {section.title}
          </h2>
          <p className="text-sm text-text-muted">{section.blurb}</p>
          <ul className="space-y-4">
            {section.entries.map((e) => (
              <Entry key={e.id} entry={e} />
            ))}
          </ul>
        </section>
      ))}

      {/* Models — identifiers, not citations */}
      <section id="models" className="scroll-mt-6 space-y-3">
        <h2 className="text-2xl font-display font-bold text-text-heading border-t border-cream-border pt-5">
          Models and APIs
        </h2>
        <p className="text-sm text-text-muted">
          The exact identifiers used in the run record. These are not research citations.
        </p>
        <div className="overflow-x-auto rounded-lg border border-cream-border">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="bg-navy-900/5">
                <th className="border-b border-cream-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-heading">
                  Identifier
                </th>
                <th className="border-b border-cream-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-heading">
                  Role
                </th>
                <th className="border-b border-cream-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-heading">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {MODELS.map((m) => (
                <tr key={m.identifier} className="even:bg-cream-card/40">
                  <td className="border-b border-cream-border px-3 py-2 align-top font-mono text-[13px] text-text-heading">
                    {m.identifier}
                  </td>
                  <td className="border-b border-cream-border px-3 py-2 align-top text-text-body">
                    {m.role}
                  </td>
                  <td className="border-b border-cream-border px-3 py-2 align-top text-xs text-text-muted">
                    {m.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-text-muted">{MODEL_PROVENANCE_NOTE}</p>
      </section>

      {/* Software — tooling, not sources */}
      <section id="software" className="scroll-mt-6 space-y-3">
        <h2 className="text-2xl font-display font-bold text-text-heading border-t border-cream-border pt-5">
          Software and tooling
        </h2>
        <p className="text-sm text-text-muted">{SOFTWARE_NOTE}</p>
        <div className="overflow-x-auto rounded-lg border border-cream-border">
          <table className="w-full min-w-[30rem] border-collapse text-sm">
            <thead>
              <tr className="bg-navy-900/5">
                <th className="border-b border-cream-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-heading">
                  Package
                </th>
                <th className="border-b border-cream-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-heading">
                  Version
                </th>
                <th className="border-b border-cream-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-heading">
                  Role
                </th>
              </tr>
            </thead>
            <tbody>
              {SOFTWARE.map((s) => (
                <tr key={s.name} className="even:bg-cream-card/40">
                  <td className="border-b border-cream-border px-3 py-2 align-top font-mono text-[13px] text-text-heading">
                    {s.name}
                  </td>
                  <td className="border-b border-cream-border px-3 py-2 align-top font-mono text-[13px] text-text-body">
                    {s.version}
                  </td>
                  <td className="border-b border-cream-border px-3 py-2 align-top text-text-body">
                    {s.role}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="pt-2 text-sm font-semibold text-text-heading">Implementation validation</p>
        <p className="text-xs text-text-muted">{VALIDATION_NOTE}</p>
        <ul className="space-y-1 text-xs text-text-body">
          {VALIDATION_SOURCES.map((v) => (
            <li key={v.target}>
              <span className="font-medium text-text-heading">{v.target}:</span> {v.source}{" "}
              <span className="font-mono text-text-muted">({v.location})</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

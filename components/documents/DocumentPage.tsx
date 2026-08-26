import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { DOCUMENTS, type DocSlug } from "@/lib/references";

/**
 * Renders one of the researcher's source documents: its reference list exactly
 * as the document prints it, plus the PDF itself.
 *
 * The reference list is rendered as text rather than left inside the PDF so it
 * can be deep-linked: each entry carries an id="ref-N" anchor, and the origin
 * markers on the References page point at them. Following "Proposal [7]" back
 * to the line that made the citation is the whole reason these routes exist.
 *
 * The PDF is embedded rather than transcribed. A transcription would be a
 * second copy of the text that could drift from the source; the PDF cannot.
 */
export function DocumentPage({ slug }: { slug: DocSlug }) {
  const doc = DOCUMENTS[slug];

  return (
    <article className="max-w-3xl space-y-6 pb-16">
      <header className="space-y-3">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <FileText size={14} />
          {doc.shortTitle}
        </p>
        <h1 className="text-3xl font-display font-bold text-text-heading">{doc.title}</h1>
        <p className="text-sm text-text-muted">{doc.byline}</p>
        <p className="text-base text-text-body">{doc.summary}</p>
        <a
          href={doc.pdf}
          download
          className="inline-flex items-center gap-2 rounded-lg bg-navy-700 px-4 py-2 text-sm font-medium text-white hover:bg-navy-900"
        >
          <Download size={16} />
          Download PDF
        </a>
      </header>

      {doc.referenceList.length > 0 ? (
        <section
          id="references"
          className="scroll-mt-6 space-y-3 border-t border-cream-border pt-5"
        >
          <h2 className="text-2xl font-display font-bold text-text-heading">
            Reference list, as printed
          </h2>
          {doc.referenceListNote ? (
            <p className="text-sm text-text-muted">{doc.referenceListNote}</p>
          ) : null}
          <ol className="space-y-3">
            {doc.referenceList.map((r) => (
              <li
                key={r.num}
                id={`ref-${r.num}`}
                className="scroll-mt-24 target:bg-warning/10 target:ring-2 target:ring-warning/40 flex gap-3 rounded px-2 py-1.5"
              >
                <span className="shrink-0 font-mono text-xs text-text-muted pt-0.5">
                  [{r.num}]
                </span>
                <span className="text-sm leading-relaxed text-text-body break-words">
                  {r.text}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-text-muted">
            The cleaned, functionally organized version of these sources — with what each was used
            for — is on the{" "}
            <Link href="/references" className="text-navy-700 hover:text-navy-900 underline">
              References
            </Link>{" "}
            page.
          </p>
        </section>
      ) : (
        <p className="text-sm text-text-muted border-t border-cream-border pt-5">
          {doc.referenceListNote}{" "}
          <Link href="/references" className="text-navy-700 hover:text-navy-900 underline">
            See References
          </Link>
          .
        </p>
      )}

      <section className="space-y-2 border-t border-cream-border pt-5">
        <h2 className="text-2xl font-display font-bold text-text-heading">Full document</h2>
        <p className="text-sm text-text-muted">
          If the viewer below does not load in your browser, use the download button above.
        </p>
        <iframe
          src={doc.pdf}
          title={doc.title}
          className="w-full rounded-lg border border-cream-border bg-white"
          style={{ height: "80vh", minHeight: "480px" }}
        />
      </section>

      <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-cream-border pt-5 text-sm">
        <span className="text-text-muted">Other documents:</span>
        {(Object.keys(DOCUMENTS) as DocSlug[])
          .filter((s) => s !== slug)
          .map((s) => (
            <Link
              key={s}
              href={DOCUMENTS[s].route}
              className="font-medium text-navy-700 hover:text-navy-900 hover:underline"
            >
              {DOCUMENTS[s].shortTitle}
            </Link>
          ))}
      </nav>
    </article>
  );
}

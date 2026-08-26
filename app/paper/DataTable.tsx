/**
 * Plain bordered table for the paper's figures. Scrolls inside its own box so a
 * wide table never forces the page body sideways on a narrow window.
 */
export function DataTable({
  head,
  rows,
  firstColHeader = true,
  mono = true,
}: {
  head: string[];
  rows: string[][];
  /** Renders the first cell of each row as a row header, as in the source doc. */
  firstColHeader?: boolean;
  /** Off for tables whose cells are prose rather than figures. */
  mono?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cream-border">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="bg-navy-900/5">
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="border-b border-cream-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-heading"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="even:bg-cream-card/40">
              {row.map((cell, c) =>
                c === 0 && firstColHeader ? (
                  <th
                    key={c}
                    scope="row"
                    className="border-b border-cream-border px-3 py-2 text-left font-medium text-text-heading align-top"
                  >
                    {cell}
                  </th>
                ) : (
                  <td
                    key={c}
                    className={`border-b border-cream-border px-3 py-2 text-text-body align-top ${
                      mono ? "font-mono text-[13px]" : ""
                    }`}
                  >
                    {cell}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";
import katex from "katex";

interface Props {
  formulas: { latex: string; caption: string }[];
  table?: { headers: string[]; rows: string[][] } | null;
  keyPoints: string[];
}

const NAVY = "#0f1c4d";
const GOLD = "#C8A84B";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function Formula({ latex, caption }: { latex: string; caption: string }) {
  // KaTeX renderToString produces XSS-safe HTML (it escapes its own input and
  // never emits script). The catch fallback escapes raw latex to be safe.
  let html = "";
  try {
    html = katex.renderToString(latex, { throwOnError: false, displayMode: true });
  } catch {
    html = `<span>${escapeHtml(latex)}</span>`;
  }
  return (
    <div className="rounded-xl px-4 py-3"
      style={{ background: "rgba(255,255,255,0.96)", border: `1px solid ${GOLD}55`,
        boxShadow: "0 2px 12px rgba(15,28,77,0.10)" }}>
      <div className="overflow-x-auto" style={{ color: NAVY }}
        dangerouslySetInnerHTML={{ __html: html }} />
      {caption && (
        <p className="mt-1.5 text-xs" style={{ color: "rgba(15,28,77,0.6)" }}>{caption}</p>
      )}
    </div>
  );
}

function VisualTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl"
      style={{ border: `1px solid ${GOLD}55`, boxShadow: "0 2px 12px rgba(15,28,77,0.10)" }}>
      <table className="w-full text-sm" style={{ borderCollapse: "collapse", color: NAVY }}>
        <thead>
          <tr style={{ background: `${GOLD}22` }}>
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-bold"
                style={{ borderBottom: `1px solid ${GOLD}55`, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ background: ri % 2 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.9)" }}>
              {r.map((c, ci) => (
                <td key={ci} className="px-3 py-1.5"
                  style={{ borderBottom: `1px solid ${NAVY}12`, whiteSpace: "nowrap" }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InfographicCard({ formulas, table, keyPoints }: Props) {
  const hasTable = !!table && table.headers.length > 0 && table.rows.length > 0;
  if (formulas.length === 0 && !hasTable && keyPoints.length === 0) return null;
  return (
    <div className="mt-3 rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: "linear-gradient(160deg, rgba(200,168,75,0.12), rgba(15,28,77,0.06))",
        border: `1px solid ${NAVY}1a` }}>
      <p className="text-[11px] font-mono uppercase tracking-widest" style={{ color: GOLD }}>
        {hasTable && formulas.length === 0 ? "Visual table" : "Key formulas"}
      </p>
      {formulas.map((f, i) => <Formula key={i} latex={f.latex} caption={f.caption} />)}
      {hasTable && <VisualTable headers={table!.headers} rows={table!.rows} />}
      {keyPoints.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1.5">
          {keyPoints.map((k, i) => (
            <li key={i} className="text-sm flex gap-2" style={{ color: NAVY }}>
              <span style={{ color: GOLD }}>•</span><span>{k}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { getRubric } from "@/lib/objectiveRubrics";

interface Props {
  objectiveId:     string;
  arenaAccent?:    string;
  arenaAccentGlow?: string;
}

const TIER_META: Record<string, { color: string; rgb: string; label: string }> = {
  "T1 — EXPLORE":    { color: "#b78bfa", rgb: "124,58,237",  label: "EXPLORE"    },
  "T2 — COMPARE":    { color: "#5edfff", rgb: "0,212,255",   label: "COMPARE"    },
  "T3 — CONSTRUCT":  { color: "#ffb07a", rgb: "255,107,43",  label: "CONSTRUCT"  },
  "T4 — EXPERIMENT": { color: "#5fffb0", rgb: "0,255,148",   label: "EXPERIMENT" },
  "T5 — COMBINE":    { color: "#ff7ab5", rgb: "255,45,120",  label: "COMBINE"    },
  "T6 — CREATE":     { color: "#d4ff4d", rgb: "200,255,0",   label: "CREATE"     },
};

const CRITERIA = [
  { key: "pass"        as const, label: "PASS",        color: "#5edfff", rgb: "94,223,255",  icon: "◎" },
  { key: "merit"       as const, label: "MERIT",       color: "#c084fc", rgb: "192,132,252", icon: "◈" },
  { key: "distinction" as const, label: "DISTINCTION", color: "#C8FF00", rgb: "200,255,0",   icon: "✦" },
];

function hexToRgb(hex: string): string {
  if (!hex.startsWith("#") || hex.length < 7) return "124,58,237";
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

export function ObjectiveCard({ objectiveId, arenaAccent = "#7C3AED" }: Props) {
  const lmsId  = objectiveId.replace(/^a(\d+)-(\d+)$/, (_, a, n) => `l${a}-${n.padStart(2, "0")}`);
  const rubric = getRubric(lmsId);
  const [expanded, setExpanded] = useState(false);

  if (!rubric) return null;

  const tier   = TIER_META[rubric.tier] ?? TIER_META["T1 — EXPLORE"];
  const aRgb   = hexToRgb(arenaAccent);

  const criteriaText = {
    pass:        rubric.passCriteria,
    merit:       rubric.meritCriteria,
    distinction: rubric.distinctionCriteria,
  };

  return (
    <>
      <style>{`
        @keyframes obj-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        .obj-dot { animation: obj-pulse 2s ease-in-out infinite; }
      `}</style>

      <div style={{
        flexShrink: 0, marginBottom: 8,
        borderRadius: expanded ? 14 : 40,
        background: "rgba(255,255,255,0.92)",
        border: `1px solid rgba(${aRgb},${expanded ? "0.35" : "0.25"})`,
        boxShadow: expanded
          ? `0 4px 24px rgba(${aRgb},0.12), 0 1px 0 rgba(255,255,255,0.9) inset`
          : `0 2px 12px rgba(${aRgb},0.10)`,
        backdropFilter: "blur(20px)",
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
      }}>

        {/* ── Header ── */}
        <button onClick={() => setExpanded(v => !v)} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: expanded ? "10px 14px" : "7px 14px",
          background: "none", border: "none", cursor: "pointer",
          borderBottom: expanded ? "1px solid rgba(0,0,0,0.07)" : "none",
        }}>

          {/* Pulsing dot + label */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <span className="obj-dot" style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: arenaAccent, boxShadow: `0 0 6px ${arenaAccent}`,
            }}/>
            <span style={{
              fontSize: 8, fontWeight: 800, letterSpacing: "0.12em",
              color: arenaAccent, textTransform: "uppercase",
              fontFamily: "'Syne', sans-serif",
            }}>
              OBJECTIVE
            </span>
          </div>

          <div style={{ width: 1, height: 12, background: "rgba(0,0,0,0.12)", flexShrink: 0 }}/>

          {/* Title */}
          <span style={{
            flex: 1, fontSize: 11, fontWeight: 700, textAlign: "left",
            color: "#0a0a2e",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {rubric.title}
          </span>

          {/* Tier pill */}
          <span style={{
            fontSize: 8, fontWeight: 800, letterSpacing: "0.08em",
            padding: "3px 8px", borderRadius: 20, flexShrink: 0,
            background: `rgba(${tier.rgb},0.12)`,
            color: tier.color,
            border: `1px solid rgba(${tier.rgb},0.3)`,
            fontFamily: "'Syne', sans-serif",
          }}>
            {tier.label}
          </span>

          {/* Stars */}
          <span style={{ flexShrink: 0, fontSize: 10, color: arenaAccent }}>
            {"★".repeat(rubric.difficulty)}
            <span style={{ opacity: 0.2, color: "#000" }}>{"★".repeat(6 - rubric.difficulty)}</span>
          </span>

          {/* Chevron */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
            flexShrink: 0, transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}>
            <path d="M2.5 4.5l3.5 3.5 3.5-3.5"
              stroke={`rgba(${aRgb},0.6)`} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* ── Expanded body ── */}
        {expanded && (
          <div style={{ display: "flex", flexDirection: "column" }}>

            {/* Meta row: ID + tools */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              padding: "9px 14px",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
            }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                color: `rgba(${aRgb},0.8)`,
                fontFamily: "'JetBrains Mono', monospace",
                background: `rgba(${aRgb},0.08)`,
                padding: "2px 7px", borderRadius: 4,
                border: `1px solid rgba(${aRgb},0.2)`,
              }}>
                {lmsId.toUpperCase()}
              </span>

              <div style={{ width: 1, height: 10, background: "rgba(0,0,0,0.1)" }}/>

              <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(0,0,0,0.35)", letterSpacing: "0.06em" }}>
                TOOLS
              </span>
              {rubric.tools.map(t => (
                <span key={t} style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 9px", borderRadius: 20,
                  background: "rgba(0,0,0,0.05)",
                  color: "rgba(0,0,0,0.6)",
                  border: "1px solid rgba(0,0,0,0.1)",
                }}>
                  {t}
                </span>
              ))}
            </div>

            {/* Mission brief */}
            <div style={{ padding: "10px 14px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }}/>
                <span style={{
                  fontSize: 8, fontWeight: 800, letterSpacing: "0.12em",
                  color: `rgba(${aRgb},0.7)`, textTransform: "uppercase",
                  fontFamily: "'Syne', sans-serif",
                }}>
                  MISSION BRIEF
                </span>
                <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }}/>
              </div>
              <div style={{
                fontSize: 11, color: "rgba(0,0,0,0.65)", lineHeight: 1.65,
                background: `rgba(${aRgb},0.04)`,
                border: `1px solid rgba(${aRgb},0.12)`,
                borderRadius: 8, padding: "10px 12px",
                maxHeight: 88, overflowY: "auto",
                scrollbarWidth: "none",
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {rubric.labTask}
              </div>
            </div>

            {/* Grading rubric */}
            <div style={{ padding: "10px 14px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }}/>
                <span style={{
                  fontSize: 8, fontWeight: 800, letterSpacing: "0.12em",
                  color: `rgba(${aRgb},0.7)`, textTransform: "uppercase",
                  fontFamily: "'Syne', sans-serif",
                }}>
                  HOW IT'S CHECKED
                </span>
                <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }}/>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {CRITERIA.map((lvl, i) => (
                  <div key={lvl.key} style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    padding: "8px 10px", borderRadius: 8,
                    background: `rgba(${lvl.rgb},0.06)`,
                    border: `1px solid rgba(${lvl.rgb},0.18)`,
                    borderLeft: `3px solid rgba(${lvl.rgb},0.7)`,
                  }}>
                    <div style={{ flexShrink: 0, width: 68, display: "flex", flexDirection: "column", gap: 2, paddingTop: 1 }}>
                      <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.1em", color: lvl.color, fontFamily: "'Syne', sans-serif" }}>
                        {lvl.icon} {lvl.label}
                      </span>
                      <div style={{ display: "flex", gap: 2 }}>
                        {Array.from({ length: i + 1 }).map((_, s) => (
                          <div key={s} style={{ width: 14, height: 2, borderRadius: 2, background: lvl.color, opacity: 0.6 }}/>
                        ))}
                      </div>
                    </div>
                    <div style={{ width: 1, alignSelf: "stretch", background: `rgba(${lvl.rgb},0.18)`, flexShrink: 0 }}/>
                    <p style={{
                      margin: 0, fontSize: 10, color: "rgba(0,0,0,0.6)",
                      lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif",
                    }}>
                      {criteriaText[lvl.key]}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </>
  );
}

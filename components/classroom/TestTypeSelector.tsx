"use client";

import {
  Brain, PenLine, Clock, BarChart2, ChevronRight, ChevronLeft,
  ClipboardList, FileEdit, Sparkles, Star,
} from "lucide-react";
import type { Chapter } from "@/types";

interface Props {
  chapter:  Chapter;
  onSelect: (type: "mcq" | "written") => void;
  onBack:   () => void;
}

const NAVY = "#0f1c4d";
const GOLD = "#C8A84B";

export function TestTypeSelector({ chapter, onSelect, onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-y-auto">

      {/* ── Back + breadcrumb ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-mono transition-opacity hover:opacity-100 opacity-60"
          style={{ color: NAVY }}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <span className="text-xs font-mono opacity-30" style={{ color: NAVY }}>·</span>
        <span className="text-xs font-mono" style={{ color: `${NAVY}60` }}>
          Ch. {chapter.chapter_number} — {chapter.chapter_title}
        </span>
      </div>

      {/* ── CHOOSE TEST TYPE divider ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 mb-4">
        <div className="h-px flex-1" style={{ background: `rgba(200,168,75,0.3)` }} />
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.25em]" style={{ color: GOLD }}>
          Choose Test Type
        </span>
        <div className="h-px flex-1" style={{ background: `rgba(200,168,75,0.3)` }} />
      </div>

      {/* ── Cards ───────────────────────────────────────────────────────────── */}
      <div className="px-5 space-y-3 pb-4">

        {/* MCQ Card */}
        <button onClick={() => onSelect("mcq")} className="w-full text-left">
          <div
            className="flex items-center gap-4 p-5 rounded-2xl transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.92)",
              border:     "1px solid rgba(255,255,255,0.7)",
              boxShadow:  "0 4px 20px rgba(15,28,77,0.07), 0 1px 4px rgba(15,28,77,0.04)",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(15,28,77,0.12), 0 2px 8px rgba(15,28,77,0.06)";
              (e.currentTarget as HTMLElement).style.transform  = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(15,28,77,0.07), 0 1px 4px rgba(15,28,77,0.04)";
              (e.currentTarget as HTMLElement).style.transform  = "translateY(0)";
            }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #2563eb, #1a4db5)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}>
              <Brain className="w-7 h-7 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-display font-bold text-base" style={{ color: NAVY }}>MCQ Test</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.2)" }}>
                  Phase 1
                </span>
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: `${NAVY}70` }}>
                15 multiple-choice questions randomly selected from a bank of 40.
              </p>
              <div className="flex items-center gap-3 text-[11px]" style={{ color: `${NAVY}55` }}>
                <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3" />7 easy · 5 medium · 3 hard</span>
                <span className="w-px h-3 bg-current opacity-30" />
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />~20 min</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <ClipboardList className="w-10 h-10" style={{ color: "rgba(15,28,77,0.08)" }} />
              <div className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.15)" }}>
                <ChevronRight className="w-4 h-4" style={{ color: "#2563eb" }} />
              </div>
            </div>
          </div>
        </button>

        {/* Written Card */}
        <button onClick={() => onSelect("written")} className="w-full text-left">
          <div
            className="flex items-center gap-4 p-5 rounded-2xl transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.92)",
              border:     "1px solid rgba(255,255,255,0.7)",
              boxShadow:  "0 4px 20px rgba(15,28,77,0.07), 0 1px 4px rgba(15,28,77,0.04)",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(15,28,77,0.12), 0 2px 8px rgba(15,28,77,0.06)";
              (e.currentTarget as HTMLElement).style.transform  = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(15,28,77,0.07), 0 1px 4px rgba(15,28,77,0.04)";
              (e.currentTarget as HTMLElement).style.transform  = "translateY(0)";
            }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #d4a017, #a87c20)", boxShadow: "0 4px 16px rgba(200,168,75,0.4)" }}>
              <PenLine className="w-7 h-7 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-display font-bold text-base" style={{ color: NAVY }}>Written Test</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(200,168,75,0.12)", color: GOLD, border: `1px solid rgba(200,168,75,0.25)` }}>
                  Phase 2
                </span>
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: `${NAVY}70` }}>
                CBSE-style question paper. Write on paper, upload photos for AI evaluation.
              </p>
              <div className="flex items-center gap-3 text-[11px]" style={{ color: `${NAVY}55` }}>
                <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3" />24 marks · Sec A / B / C</span>
                <span className="w-px h-3 bg-current opacity-30" />
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />45 min</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <FileEdit className="w-10 h-10" style={{ color: "rgba(15,28,77,0.08)" }} />
              <div className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(200,168,75,0.08)", border: `1px solid rgba(200,168,75,0.2)` }}>
                <ChevronRight className="w-4 h-4" style={{ color: GOLD }} />
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* ── Bottom feature bar ───────────────────────────────────────────────── */}
      <div className="mt-auto mx-5 mb-5 rounded-2xl px-4 py-3"
        style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(255,255,255,0.8)", backdropFilter: "blur(12px)" }}>
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: <Sparkles className="w-3.5 h-3.5" />, label: "AI-Powered",    sub: "Instant. Accurate.",  color: "#2563eb" },
            { icon: <ClipboardList className="w-3.5 h-3.5" />, label: "CBSE Aligned", sub: "100% curriculum",  color: GOLD },
            { icon: <BarChart2 className="w-3.5 h-3.5" />, label: "Track Progress", sub: "Analyse. Improve.", color: "#16a34a" },
            { icon: <Star className="w-3.5 h-3.5" />,     label: "Top Learners",  sub: "Excellence. daily.", color: "#dc2626" },
          ].map(({ icon, label, sub, color }) => (
            <div key={label} className="flex flex-col items-center text-center gap-1 py-1">
              <div style={{ color }}>{icon}</div>
              <span className="text-[10px] font-bold leading-none" style={{ color: NAVY }}>{label}</span>
              <span className="text-[9px] leading-tight" style={{ color: `${NAVY}50` }}>{sub}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

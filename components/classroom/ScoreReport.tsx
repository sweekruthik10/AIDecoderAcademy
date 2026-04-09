"use client";

import { CheckCircle2, XCircle, RotateCcw, Trophy, TrendingUp, Home } from "lucide-react";
import type { MCQQuestion } from "@/types";
import type { SubmitResult } from "./MCQTest";

interface Props {
  result:       SubmitResult;
  chapterTitle: string;
  onRetry:      () => void;
  onHome:       () => void;
}

const NAVY    = "#0f1c4d";
const NAVY_70 = "rgba(15,28,77,0.70)";
const NAVY_55 = "rgba(15,28,77,0.55)";
const NAVY_08 = "rgba(15,28,77,0.08)";

const DIFF_COLORS = {
  easy:   { text: "#16a34a", bg: "rgba(22,163,74,0.1)",  border: "rgba(22,163,74,0.2)"  },
  medium: { text: "#d97706", bg: "rgba(217,119,6,0.1)",  border: "rgba(217,119,6,0.2)"  },
  hard:   { text: "#dc2626", bg: "rgba(220,38,38,0.1)",  border: "rgba(220,38,38,0.2)"  },
};

function scoreColor(pct: number) {
  if (pct >= 0.8) return "#16a34a";
  if (pct >= 0.5) return "#d97706";
  return "#dc2626";
}

function gradeLabel(pct: number): { label: string; color: string } {
  if (pct >= 0.9)  return { label: "Outstanding!", color: "#16a34a" };
  if (pct >= 0.75) return { label: "Very Good",    color: "#2563eb" };
  if (pct >= 0.5)  return { label: "Good",          color: "#d97706" };
  if (pct >= 0.33) return { label: "Needs Work",    color: "#ea580c" };
  return                  { label: "Keep Trying",   color: "#dc2626" };
}

function ScoreRing({ score, max }: { score: number; max: number }) {
  const pct  = max > 0 ? score / max : 0;
  const r    = 52;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  const color = scoreColor(pct);

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg width="144" height="144" viewBox="0 0 144 144" className="-rotate-90">
        <circle cx="72" cy="72" r={r} fill="none" stroke={NAVY_08} strokeWidth="10" />
        <circle cx="72" cy="72" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)", filter: `drop-shadow(0 0 8px ${color}60)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold leading-none" style={{ color, fontFamily:"'DM Sans',sans-serif" }}>{score}</span>
        <span className="text-sm font-mono mt-0.5" style={{ color: NAVY_55 }}>/ {max}</span>
      </div>
    </div>
  );
}

export function ScoreReport({ result, chapterTitle, onRetry, onHome }: Props) {
  const { score, max_score, feedback, questions, answers } = result;
  const pct   = max_score > 0 ? score / max_score : 0;
  const grade = gradeLabel(pct);

  const byDiff = {
    easy:   questions.filter(q => q.difficulty === "easy"),
    medium: questions.filter(q => q.difficulty === "medium"),
    hard:   questions.filter(q => q.difficulty === "hard"),
  };

  const correct   = questions.filter(q => feedback[q.id]?.correct).length;
  const incorrect = questions.length - correct;

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* ── Hero ── */}
      <div className="flex-shrink-0 flex flex-col items-center gap-5 pt-7 pb-5 px-6"
        style={{ borderBottom: `1px solid ${NAVY_08}` }}>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          <Trophy className="w-4 h-4" style={{ color: "#C8A84B" }} />
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color: NAVY_55 }}>
            MCQ Results
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full"
            style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.2)" }}>
            {chapterTitle}
          </span>
        </div>

        <ScoreRing score={score} max={max_score} />

        <div className="text-center">
          <p className="text-2xl font-bold leading-none" style={{ color: grade.color, fontFamily:"'DM Sans',sans-serif" }}>
            {grade.label}
          </p>
          <p className="text-sm mt-2" style={{ color: NAVY_55 }}>
            {Math.round(pct * 100)}% · {score} / {max_score} marks
          </p>
        </div>

        {/* Correct / Incorrect */}
        <div className="flex gap-3 w-full max-w-xs">
          <div className="flex-1 rounded-xl p-3 text-center"
            style={{ background: "rgba(22,163,74,0.07)", border: "1px solid rgba(22,163,74,0.18)" }}>
            <p className="text-xl font-bold" style={{ color: "#16a34a", fontFamily:"'DM Sans',sans-serif" }}>{correct}</p>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(22,163,74,0.7)" }}>Correct</p>
          </div>
          <div className="flex-1 rounded-xl p-3 text-center"
            style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.18)" }}>
            <p className="text-xl font-bold" style={{ color: "#dc2626", fontFamily:"'DM Sans',sans-serif" }}>{incorrect}</p>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(220,38,38,0.7)" }}>Incorrect</p>
          </div>
        </div>

        {/* Difficulty breakdown */}
        <div className="flex gap-2 w-full max-w-xs">
          {(["easy", "medium", "hard"] as const).map(d => {
            const qs = byDiff[d];
            if (!qs.length) return null;
            const s  = qs.filter(q => feedback[q.id]?.correct).length;
            const dc = DIFF_COLORS[d];
            const p  = qs.length > 0 ? s / qs.length : 0;
            return (
              <div key={d} className="flex-1 rounded-xl p-2.5"
                style={{ background: dc.bg, border: `1px solid ${dc.border}` }}>
                <span className="text-[10px] font-mono uppercase block mb-1.5 font-bold" style={{ color: dc.text }}>{d}</span>
                <span className="text-sm font-bold block" style={{ color: dc.text, fontFamily:"'DM Sans',sans-serif" }}>
                  {s}/{qs.length}
                </span>
                <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.5)" }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${p * 100}%`, background: dc.text }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Per-question review ── */}
      <div className="flex-1 px-4 py-5 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4" style={{ color: "#C8A84B" }} />
          <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: NAVY_55 }}>
            Question Review
          </span>
        </div>

        {questions.map((q, idx) => {
          const fb      = feedback[q.id];
          const correct = fb?.correct ?? false;
          const chosen  = answers[q.id] ?? -1;
          const diff    = DIFF_COLORS[q.difficulty] ?? DIFF_COLORS.easy;

          return (
            <div key={q.id} className="rounded-2xl overflow-hidden"
              style={{
                background: correct ? "rgba(22,163,74,0.04)"  : "rgba(220,38,38,0.04)",
                border:     correct ? "1px solid rgba(22,163,74,0.18)" : "1px solid rgba(220,38,38,0.18)",
              }}>

              {/* Question top bar */}
              <div className="flex items-center gap-2.5 px-4 py-2.5"
                style={{ background: "rgba(255,255,255,0.6)", borderBottom: `1px solid ${NAVY_08}` }}>
                {correct
                  ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#16a34a" }} />
                  : <XCircle      className="w-4 h-4 flex-shrink-0" style={{ color: "#dc2626" }} />
                }
                <span className="text-xs font-mono font-bold" style={{ color: correct ? "#16a34a" : "#dc2626" }}>
                  Q{idx + 1}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full ml-1"
                  style={{ background: diff.bg, color: diff.text, border: `1px solid ${diff.border}` }}>
                  {q.difficulty}
                </span>
                <span className="text-[10px] font-mono ml-auto" style={{ color: NAVY_55 }}>1 mark</span>
              </div>

              {/* Body */}
              <div className="px-4 py-3 space-y-2">
                <p className="text-sm leading-relaxed font-medium" style={{ color: "rgba(15,28,77,0.85)" }}>
                  {q.question}
                </p>

                {q.options.map((opt, optIdx) => {
                  const isCorrectOpt = optIdx === fb?.correct_index;
                  const isChosenOpt  = optIdx === chosen;
                  let bg = "rgba(255,255,255,0.6)";
                  let color = NAVY_55;
                  if (isCorrectOpt) { bg = "rgba(22,163,74,0.1)"; color = "#16a34a"; }
                  else if (isChosenOpt && !isCorrectOpt) { bg = "rgba(220,38,38,0.1)"; color = "#dc2626"; }

                  return (
                    <div key={optIdx} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                      style={{ background: bg, color, border: isCorrectOpt ? "1px solid rgba(22,163,74,0.3)" : isChosenOpt ? "1px solid rgba(220,38,38,0.3)" : "1px solid transparent" }}>
                      {isCorrectOpt && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                      {isChosenOpt && !isCorrectOpt && <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                      {!isCorrectOpt && !isChosenOpt && <span className="w-3.5 h-3.5 flex-shrink-0" />}
                      <span>{opt}</span>
                    </div>
                  );
                })}

                {fb?.explanation && (
                  <div className="px-3 py-2 rounded-xl mt-1"
                    style={{ background: "rgba(255,255,255,0.8)", borderLeft: `3px solid ${correct ? "#16a34a" : "#dc2626"}` }}>
                    <p className="text-xs leading-relaxed" style={{ color: NAVY_70 }}>
                      {fb.explanation}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className="h-2" />
      </div>

      {/* ── Actions ── */}
      <div className="flex-shrink-0 px-6 py-4 flex gap-3" style={{ borderTop: `1px solid ${NAVY_08}` }}>
        <button onClick={onHome}
          className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all"
          style={{ flex:"0 0 auto", paddingLeft:20, paddingRight:20,
            background: "rgba(15,28,77,0.05)", border: "1px solid rgba(15,28,77,0.15)", color: NAVY_70,
            fontFamily:"'DM Sans',sans-serif" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(15,28,77,0.10)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(15,28,77,0.05)"; }}
        >
          <Home className="w-4 h-4" /> Home
        </button>
        <button onClick={onRetry}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all"
          style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", color: "#2563eb",
            fontFamily:"'DM Sans',sans-serif" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(37,99,235,0.14)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(37,99,235,0.08)"; }}
        >
          <RotateCcw className="w-4 h-4" /> Try Again
        </button>
      </div>
    </div>
  );
}

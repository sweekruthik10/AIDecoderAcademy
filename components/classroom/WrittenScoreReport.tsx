"use client";

import { useState, useCallback } from "react";
import { Trophy, RotateCcw, TrendingUp, CheckCircle2, AlertCircle, MinusCircle, Home, ChevronLeft, ChevronRight, FileImage, Download, Maximize2, X } from "lucide-react";
import type { WrittenQuestion, WrittenFeedbackItem } from "@/types";
import type { WrittenResult } from "./WrittenTest";

interface Props {
  result:       WrittenResult;
  chapterTitle: string;
  onRetry:      () => void;
  onHome:       () => void;
}

const NAVY     = "#0f1c4d";
const NAVY_60  = "rgba(15,28,77,0.6)";
const NAVY_45  = "rgba(15,28,77,0.45)";
const NAVY_08  = "rgba(15,28,77,0.08)";

const SECTION_LABELS: Record<string, string> = {
  A: "Section A — Short Answer",
  B: "Section B — Medium Answer",
  C: "Section C — Long Answer",
};

const SECTION_COLORS: Record<string, string> = {
  A: "#C8A84B",   // gold
  B: "#2563eb",   // blue
  C: "#dc2626",   // red
};

// Score-based colours — adjusted for light background
function scoreColor(pct: number) {
  if (pct >= 0.75) return "#16a34a";   // green
  if (pct >= 0.4)  return "#d97706";   // amber
  return "#dc2626";                     // red
}

function gradeLabel(pct: number): { label: string; color: string } {
  if (pct >= 0.9)  return { label: "Outstanding!", color: "#16a34a" };
  if (pct >= 0.75) return { label: "Very Good",    color: "#2563eb" };
  if (pct >= 0.5)  return { label: "Good",          color: "#d97706" };
  if (pct >= 0.33) return { label: "Needs Work",    color: "#ea580c" };
  return                  { label: "Keep Trying",   color: "#dc2626" };
}

function ScoreRing({ score, max }: { score: number; max: number }) {
  const pct   = max > 0 ? score / max : 0;
  const r     = 52;
  const circ  = 2 * Math.PI * r;
  const dash  = circ * pct;
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
        <span className="text-sm font-mono mt-0.5" style={{ color: NAVY_45 }}>/ {max}</span>
      </div>
    </div>
  );
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct   = max > 0 ? score / max : 0;
  const color = scoreColor(pct);
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: NAVY_08 }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct * 100}%`, background: color }} />
      </div>
      <span className="text-xs font-mono flex-shrink-0 font-bold" style={{ color, minWidth: 36, textAlign: "right" }}>
        {score}/{max}
      </span>
    </div>
  );
}

// ── Download helper (fetch-as-blob so cross-origin works) ────────────────────
async function downloadImage(url: string, pageNum: number) {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href     = blobUrl;
    a.download = `marked-answer-sheet-page-${pageNum}.jpg`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback: open in new tab
    window.open(url, "_blank");
  }
}

// ── Full-screen modal for viewing annotated pages ────────────────────────────
function AnnotatedModal({
  urls, startPage, onClose,
}: {
  urls: string[]; startPage: number; onClose: () => void;
}) {
  const [page, setPage] = useState(startPage);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async (all: boolean) => {
    setDownloading(true);
    if (all) {
      for (let i = 0; i < urls.length; i++) {
        await downloadImage(urls[i]!, i + 1);
        // small gap between downloads
        if (i < urls.length - 1) await new Promise(r => setTimeout(r, 400));
      }
    } else {
      await downloadImage(urls[page]!, page + 1);
    }
    setDownloading(false);
  }, [urls, page]);

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ zIndex: 9999, background: "rgba(2,4,14,0.92)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5 py-3"
        style={{ background: "rgba(15,28,77,0.7)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <FileImage className="w-4 h-4" style={{ color: "#2563eb" }} />
          <span className="text-sm font-bold text-white">
            Marked Answer Sheet
            {urls.length > 1 && <span className="ml-2 text-xs font-normal" style={{ color: "rgba(255,255,255,0.5)" }}>Page {page + 1} of {urls.length}</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Download current page */}
          <button
            onClick={() => handleDownload(false)}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-opacity disabled:opacity-50"
            style={{ background: "rgba(37,99,235,0.25)", color: "#93c5fd", border: "1px solid rgba(37,99,235,0.4)" }}
          >
            <Download className="w-3.5 h-3.5" />
            {urls.length > 1 ? "This page" : "Download"}
          </button>
          {/* Download all pages */}
          {urls.length > 1 && (
            <button
              onClick={() => handleDownload(true)}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-opacity disabled:opacity-50"
              style={{ background: "rgba(37,99,235,0.15)", color: "#93c5fd", border: "1px solid rgba(37,99,235,0.3)" }}
            >
              <Download className="w-3.5 h-3.5" />
              All pages
            </button>
          )}
          {/* Close */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden px-4 py-4"
        onClick={e => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[page]}
          alt={`Marked page ${page + 1}`}
          className="max-w-full max-h-full object-contain rounded-xl"
          style={{ boxShadow: "0 8px 48px rgba(0,0,0,0.6)" }}
        />
      </div>

      {/* Page navigation */}
      {urls.length > 1 && (
        <div
          className="flex-shrink-0 flex items-center justify-center gap-4 py-4"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-10 h-10 rounded-2xl flex items-center justify-center disabled:opacity-30 transition-colors"
            style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>

          {/* Dot indicators */}
          <div className="flex gap-2">
            {urls.map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === page ? 24 : 8, height: 8,
                  background: i === page ? "#2563eb" : "rgba(255,255,255,0.25)",
                }}
              />
            ))}
          </div>

          <button
            onClick={() => setPage(p => Math.min(urls.length - 1, p + 1))}
            disabled={page === urls.length - 1}
            className="w-10 h-10 rounded-2xl flex items-center justify-center disabled:opacity-30 transition-colors"
            style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

export function WrittenScoreReport({ result, chapterTitle, onRetry, onHome }: Props) {
  const { score, max_score, feedback, questions, annotated_image_urls } = result;
  const [annotatedPage, setAnnotatedPage] = useState(0);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [downloading,   setDownloading]   = useState(false);

  const handleDownloadCurrent = useCallback(async () => {
    if (!annotated_image_urls?.length) return;
    setDownloading(true);
    await downloadImage(annotated_image_urls[annotatedPage]!, annotatedPage + 1);
    setDownloading(false);
  }, [annotated_image_urls, annotatedPage]);
  const pct   = max_score > 0 ? score / max_score : 0;
  const grade = gradeLabel(pct);

  const bySection = questions.reduce<Record<string, WrittenQuestion[]>>((acc, q) => {
    if (!acc[q.section]) acc[q.section] = [];
    acc[q.section]!.push(q);
    return acc;
  }, {});

  let qCounter = 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* ── Hero ── */}
      <div className="flex-shrink-0 flex flex-col items-center gap-5 pt-7 pb-5 px-6"
        style={{ borderBottom: `1px solid ${NAVY_08}` }}>

        {/* Title row */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <Trophy className="w-4 h-4" style={{ color: "#C8A84B" }} />
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color: NAVY_60 }}>
            Written Test Results
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full"
            style={{ background: "rgba(200,168,75,0.1)", color: "#C8A84B", border: "1px solid rgba(200,168,75,0.25)" }}>
            {chapterTitle}
          </span>
        </div>

        <ScoreRing score={score} max={max_score} />

        <div className="text-center">
          <p className="text-2xl font-bold leading-none" style={{ color: grade.color, fontFamily:"'DM Sans',sans-serif" }}>
            {grade.label}
          </p>
          <p className="text-sm mt-2" style={{ color: NAVY_60 }}>
            {Math.round(pct * 100)}% · {score} / {max_score} marks
          </p>
        </div>

        {/* Section breakdown */}
        <div className="w-full max-w-sm space-y-2">
          {Object.entries(bySection).map(([sec, qs]) => {
            const secScore = qs.reduce((s, q) => s + (feedback[q.id]?.score ?? 0), 0);
            const secMax   = qs.reduce((s, q) => s + q.marks, 0);
            const secColor = SECTION_COLORS[sec] ?? "#C8A84B";
            return (
              <div key={sec} className="rounded-xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.85)", border: `1px solid ${NAVY_08}` }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-black"
                      style={{ background: `${secColor}18`, color: secColor }}>
                      {sec}
                    </div>
                    <span className="text-xs font-semibold" style={{ color: NAVY_60 }}>
                      {SECTION_LABELS[sec]?.split("—")[1]?.trim()}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold" style={{ color: secColor }}>
                    {secScore}/{secMax}
                  </span>
                </div>
                <ScoreBar score={secScore} max={secMax} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Per-question review ── */}
      <div className="flex-1 px-4 py-5 space-y-5">

        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: "#C8A84B" }} />
          <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: NAVY_60 }}>
            Question-by-Question Feedback
          </span>
        </div>

        {Object.entries(bySection).map(([sec, qs]) => {
          const secColor = SECTION_COLORS[sec] ?? "#C8A84B";
          return (
            <div key={sec}>
              {/* Section header */}
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-mono font-black"
                  style={{ background: `${secColor}18`, color: secColor }}>
                  {sec}
                </div>
                <span className="text-xs font-semibold" style={{ color: secColor }}>
                  {SECTION_LABELS[sec]}
                </span>
                <div className="flex-1 h-px" style={{ background: `${secColor}30` }} />
              </div>

              <div className="space-y-3">
                {qs.map(q => {
                  qCounter++;
                  const fb    = feedback[q.id];
                  const s     = fb?.score ?? 0;
                  const m     = q.marks;
                  const pctQ  = m > 0 ? s / m : 0;
                  const color = scoreColor(pctQ);
                  const Icon  = pctQ >= 0.75 ? CheckCircle2 : pctQ >= 0.4 ? MinusCircle : AlertCircle;

                  const bgMap = {
                    good:    "rgba(22,163,74,0.05)",
                    partial: "rgba(217,119,6,0.05)",
                    poor:    "rgba(220,38,38,0.05)",
                  };
                  const borderMap = {
                    good:    "rgba(22,163,74,0.18)",
                    partial: "rgba(217,119,6,0.18)",
                    poor:    "rgba(220,38,38,0.18)",
                  };
                  const tier = pctQ >= 0.75 ? "good" : pctQ >= 0.4 ? "partial" : "poor";

                  return (
                    <div key={q.id} className="rounded-2xl overflow-hidden"
                      style={{ background: bgMap[tier], border: `1px solid ${borderMap[tier]}` }}>

                      {/* Card header */}
                      <div className="flex items-center justify-between px-4 py-2.5"
                        style={{ background: "rgba(255,255,255,0.6)", borderBottom: `1px solid ${NAVY_08}` }}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" style={{ color }} />
                          <span className="text-xs font-mono font-bold" style={{ color: NAVY }}>
                            Q{qCounter}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full overflow-hidden" style={{ background: NAVY_08 }}>
                            <div className="h-full rounded-full" style={{ width: `${pctQ * 100}%`, background: color }} />
                          </div>
                          <span className="text-xs font-mono font-bold" style={{ color }}>
                            {s}/{m}
                          </span>
                        </div>
                      </div>

                      {/* Card body */}
                      <div className="px-4 py-3">
                        <p className="text-sm leading-relaxed mb-2.5" style={{ color: "rgba(15,28,77,0.82)" }}>
                          {q.question}
                        </p>
                        {fb?.feedback && (
                          <div className="px-3 py-2.5 rounded-xl"
                            style={{ background: "rgba(255,255,255,0.8)", borderLeft: `3px solid ${color}` }}>
                            <p className="text-xs leading-relaxed" style={{ color: NAVY_60 }}>
                              {fb.feedback}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="h-2" />
      </div>

      {/* ── Annotated answer sheets ── */}
      {annotated_image_urls && annotated_image_urls.length > 0 && (
        <div className="flex-shrink-0 px-6 py-5" style={{ borderTop: `1px solid ${NAVY_08}` }}>

          {/* Section header with download button */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileImage className="w-4 h-4" style={{ color: "#2563eb" }} />
              <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: NAVY_60 }}>
                Marked Answer Sheet
              </span>
            </div>
            <button
              onClick={handleDownloadCurrent}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.2)" }}
            >
              <Download className="w-3.5 h-3.5" />
              {downloading ? "Downloading…" : annotated_image_urls.length > 1 ? `Page ${annotatedPage + 1}` : "Download"}
            </button>
          </div>

          {/* Clickable image — opens modal */}
          <div
            className="relative rounded-2xl overflow-hidden cursor-pointer group"
            style={{ border: "1.5px solid rgba(37,99,235,0.25)", background: "#f4f4f8" }}
            onClick={() => setModalOpen(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={annotated_image_urls[annotatedPage]}
              alt={`Marked page ${annotatedPage + 1}`}
              className="w-full object-contain"
              style={{ maxHeight: 380 }}
            />

            {/* "Expand" hint overlay — visible on hover */}
            <div
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "rgba(15,28,77,0.35)", backdropFilter: "blur(2px)" }}
            >
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
                <Maximize2 className="w-4 h-4" style={{ color: "#2563eb" }} />
                <span className="text-sm font-bold" style={{ color: "#1a1a2e" }}>View Full Size</span>
              </div>
            </div>

            {/* Page nav bar (multi-page) — stop propagation so nav doesn't open modal */}
            {annotated_image_urls.length > 1 && (
              <div
                className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2"
                style={{ background: "rgba(15,28,77,0.55)", backdropFilter: "blur(6px)" }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => setAnnotatedPage(p => Math.max(0, p - 1))}
                  disabled={annotatedPage === 0}
                  className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30"
                  style={{ background: "rgba(255,255,255,0.15)" }}>
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
                <span className="text-xs font-bold text-white">
                  Page {annotatedPage + 1} of {annotated_image_urls.length}
                </span>
                <button
                  onClick={() => setAnnotatedPage(p => Math.min(annotated_image_urls.length - 1, p + 1))}
                  disabled={annotatedPage === annotated_image_urls.length - 1}
                  className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30"
                  style={{ background: "rgba(255,255,255,0.15)" }}>
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
              </div>
            )}
          </div>

          {/* Tap hint */}
          <p className="text-center text-[10px] mt-1.5" style={{ color: "rgba(15,28,77,0.35)" }}>
            Tap image to view full size
          </p>

          {/* Thumbnail strip (multi-page) */}
          {annotated_image_urls.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {annotated_image_urls.map((url, i) => (
                <button key={i} onClick={() => setAnnotatedPage(i)}
                  className="flex-shrink-0 rounded-lg overflow-hidden"
                  style={{ width: 48, height: 64,
                    border: i === annotatedPage ? "2px solid #2563eb" : "2px solid transparent",
                    boxShadow: i === annotatedPage ? "0 0 10px rgba(37,99,235,0.4)" : "none",
                    background: "#eee" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Full-screen modal ── */}
      {modalOpen && annotated_image_urls && annotated_image_urls.length > 0 && (
        <AnnotatedModal
          urls={annotated_image_urls}
          startPage={annotatedPage}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* ── Actions ── */}
      <div className="flex-shrink-0 px-6 py-4 flex gap-3" style={{ borderTop: `1px solid ${NAVY_08}` }}>
        <button onClick={onHome}
          className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all"
          style={{ flex:"0 0 auto", paddingLeft:20, paddingRight:20,
            background: "rgba(15,28,77,0.05)", border: "1px solid rgba(15,28,77,0.15)", color: NAVY_60,
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
          <RotateCcw className="w-4 h-4" /> Attempt Again
        </button>
      </div>
    </div>
  );
}

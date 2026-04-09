"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, AlertTriangle, BookX, Sparkles, Download, Maximize2, X } from "lucide-react";
import type { CorrectionResult, CorrectionIssue, CorrectionIssueType } from "@/types";

// ── Download helper (fetch-as-blob for cross-origin) ─────────────────────────
async function downloadImage(url: string, pageNum: number) {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `corrected-notes-page-${pageNum}.jpg`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch { window.open(url, "_blank"); }
}

// ── Full-screen modal ────────────────────────────────────────────────────────
function ImageModal({ urls, startPage, onClose }: {
  urls: string[]; startPage: number; onClose: () => void;
}) {
  const [page,        setPage]        = useState(startPage);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async (all: boolean) => {
    setDownloading(true);
    if (all) {
      for (let i = 0; i < urls.length; i++) {
        await downloadImage(urls[i]!, i + 1);
        if (i < urls.length - 1) await new Promise(r => setTimeout(r, 400));
      }
    } else {
      await downloadImage(urls[page]!, page + 1);
    }
    setDownloading(false);
  }, [urls, page]);

  return (
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 9999, background: "rgba(2,4,14,0.93)", backdropFilter: "blur(12px)" }}
      onClick={onClose}>

      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3"
        style={{ background: "rgba(6,182,212,0.08)", borderBottom: "1px solid rgba(6,182,212,0.15)" }}
        onClick={e => e.stopPropagation()}>
        <span className="text-sm font-bold text-white">Annotated Notes</span>
        <div className="flex items-center gap-2">
          <button onClick={() => handleDownload(false)} disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-50"
            style={{ background: "rgba(6,182,212,0.2)", color: "#67e8f9", border: "1px solid rgba(6,182,212,0.35)" }}>
            <Download className="w-3.5 h-3.5" />
            {urls.length > 1 ? "This page" : "Download"}
          </button>
          {urls.length > 1 && (
            <button onClick={() => handleDownload(true)} disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-50"
              style={{ background: "rgba(6,182,212,0.12)", color: "#67e8f9", border: "1px solid rgba(6,182,212,0.25)" }}>
              <Download className="w-3.5 h-3.5" />
              All pages
            </button>
          )}
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-4 py-4"
        onClick={e => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[page]} alt={`Page ${page + 1}`}
          className="max-w-full max-h-full object-contain rounded-xl"
          style={{ boxShadow: "0 8px 48px rgba(0,0,0,0.6)" }} />
      </div>

      {/* Navigation */}
      {urls.length > 1 && (
        <div className="flex-shrink-0 flex items-center justify-center gap-4 py-4"
          onClick={e => e.stopPropagation()}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="w-10 h-10 rounded-2xl flex items-center justify-center disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex gap-2">
            {urls.map((_, i) => (
              <button key={i} onClick={() => setPage(i)} className="rounded-full transition-all"
                style={{ width: i === page ? 24 : 8, height: 8,
                  background: i === page ? "#06B6D4" : "rgba(255,255,255,0.25)" }} />
            ))}
          </div>
          <button onClick={() => setPage(p => Math.min(urls.length - 1, p + 1))} disabled={page === urls.length - 1}
            className="w-10 h-10 rounded-2xl flex items-center justify-center disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

interface Props {
  result:   CorrectionResult;
  chapter:  string;
  onBack:   () => void;
}

const NAVY = "#0f1c4d";
const TEAL = "#06B6D4";

// ── Issue type config ────────────────────────────────────────────────────────
const ISSUE_CONFIG: Record<CorrectionIssueType, {
  label: string; icon: React.ElementType; bg: string; border: string; text: string; dot: string;
}> = {
  wrong_formula:    { label: "Wrong Formula",    icon: BookX,        bg: "rgba(220,38,38,0.07)",  border: "rgba(220,38,38,0.25)",  text: "#dc2626", dot: "#dc2626" },
  spelling:         { label: "Spelling",         icon: AlertCircle,  bg: "rgba(234,179,8,0.07)",  border: "rgba(234,179,8,0.3)",   text: "#b45309", dot: "#eab308" },
  missing_content:  { label: "Missing Content",  icon: AlertTriangle,bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.28)", text: "#ea580c", dot: "#f97316" },
  conceptual_error: { label: "Conceptual Error", icon: BookX,        bg: "rgba(168,85,247,0.07)", border: "rgba(168,85,247,0.25)", text: "#7c3aed", dot: "#a855f7" },
};

const SEVERITY_BADGE: Record<string, { label: string; style: React.CSSProperties }> = {
  high:   { label: "High",   style: { background:"rgba(220,38,38,0.12)",  color:"#dc2626" } },
  medium: { label: "Medium", style: { background:"rgba(234,179,8,0.12)",  color:"#b45309" } },
  low:    { label: "Low",    style: { background:"rgba(34,197,94,0.12)",  color:"#16a34a" } },
};

// ── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r   = 32;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
      <svg width="88" height="88" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="6" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)" }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-black text-xl leading-none" style={{ color }}>{score}</span>
        <span className="text-[9px] font-bold" style={{ color: `${NAVY}60` }}>/100</span>
      </div>
    </div>
  );
}

// ── Issue card ───────────────────────────────────────────────────────────────
function IssueCard({ issue }: { issue: CorrectionIssue }) {
  const cfg = ISSUE_CONFIG[issue.type];
  const Icon = cfg.icon;
  const sev  = SEVERITY_BADGE[issue.severity] ?? SEVERITY_BADGE.medium!;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl p-3 mb-2"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cfg.text }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: cfg.text }}>
              {cfg.label}
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={sev.style}>
              {sev.label}
            </span>
          </div>
          {issue.student_wrote && (
            <div className="flex items-start gap-1.5 mb-1.5 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-md font-mono"
                style={{ background: "rgba(220,38,38,0.12)", color: "#dc2626",
                  textDecoration: "line-through" }}>
                {issue.student_wrote}
              </span>
              <span className="text-[10px] self-center" style={{ color: `${NAVY}50` }}>→</span>
              <span className="text-xs px-2 py-0.5 rounded-md font-mono font-bold"
                style={{ background: "rgba(34,197,94,0.12)", color: "#16a34a" }}>
                {issue.correct_version}
              </span>
            </div>
          )}
          {!issue.student_wrote && (
            <p className="text-xs mb-1 font-semibold" style={{ color: cfg.text }}>
              Add: {issue.correct_version}
            </p>
          )}
          <p className="text-[11px] leading-relaxed" style={{ color: `${NAVY}70` }}>
            {issue.description}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function CorrectionReport({ result, chapter, onBack }: Props) {
  const [page,      setPage]      = useState(0);
  const [tab,       setTab]       = useState<"issues" | "pages">("issues");
  const [modalOpen, setModalOpen] = useState(false);

  const { accuracy_score, teacher_summary, issues, positives, image_urls,
          annotated_image_urls } = result;
  // Show annotated images in the Pages tab if available, else originals
  const displayUrls = (annotated_image_urls?.length ? annotated_image_urls : image_urls);

  // Group issues by type
  const byType: Partial<Record<CorrectionIssueType, CorrectionIssue[]>> = {};
  for (const issue of issues) {
    if (!byType[issue.type]) byType[issue.type] = [];
    byType[issue.type]!.push(issue);
  }

  const grade =
    accuracy_score >= 90 ? "Excellent! 🌟" :
    accuracy_score >= 75 ? "Good Work! 👍" :
    accuracy_score >= 50 ? "Needs Revision ✏️" :
    "Keep Practising 📖";

  return (
    <div className="flex flex-col h-full"
      style={{ fontFamily: "var(--font-dm-sans,'DM Sans',sans-serif)" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: `1px solid ${TEAL}22` }}>
        <button onClick={onBack}
          className="flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-70"
          style={{ color: NAVY }}>
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: TEAL }}>
            Correction Report
          </p>
          <p className="text-sm font-bold truncate" style={{ color: NAVY }}>{chapter}</p>
        </div>
      </div>

      {/* ── Score hero ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 py-4 flex items-center gap-4"
        style={{ borderBottom: `1px solid rgba(0,0,0,0.06)`,
          background: "linear-gradient(135deg, rgba(6,182,212,0.04), rgba(15,28,77,0.02))" }}>
        <ScoreRing score={accuracy_score} />
        <div className="flex-1 min-w-0">
          <p className="font-black text-base leading-tight" style={{ color: NAVY }}>{grade}</p>
          <p className="text-xs leading-relaxed mt-1" style={{ color: `${NAVY}70` }}>
            {teacher_summary}
          </p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {issues.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg"
                style={{ background:"rgba(220,38,38,0.1)", color:"#dc2626" }}>
                {issues.length} {issues.length === 1 ? "issue" : "issues"} found
              </span>
            )}
            {positives.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg"
                style={{ background:"rgba(34,197,94,0.1)", color:"#16a34a" }}>
                {positives.length} ✓ correct
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex border-b"
        style={{ borderColor: "rgba(0,0,0,0.06)" }}>
        {(["issues", "pages"] as const).map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2.5 text-xs font-bold transition-colors relative"
            style={{ color: tab === t ? TEAL : `${NAVY}55` }}>
            {t === "issues" ? `Issues (${issues.length})` : `Pages (${image_urls.length})`}
            {tab === t && (
              <motion.div layoutId="tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                style={{ background: TEAL }} />
            )}
          </button>
        ))}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>

        {/* Issues tab */}
        {tab === "issues" && (
          <div className="px-5 py-4">
            {issues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <CheckCircle2 className="w-10 h-10" style={{ color: "#22c55e" }} />
                <p className="font-bold text-sm" style={{ color: NAVY }}>No issues found!</p>
                <p className="text-xs text-center" style={{ color: `${NAVY}60` }}>
                  Your notes look great for this chapter. Keep it up!
                </p>
              </div>
            ) : (
              <>
                {/* Issues grouped by type */}
                {(Object.keys(ISSUE_CONFIG) as CorrectionIssueType[])
                  .filter(type => byType[type]?.length)
                  .map(type => (
                    <div key={type} className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full"
                          style={{ background: ISSUE_CONFIG[type].dot }} />
                        <p className="text-[11px] font-black uppercase tracking-wider"
                          style={{ color: ISSUE_CONFIG[type].text }}>
                          {ISSUE_CONFIG[type].label} ({byType[type]!.length})
                        </p>
                      </div>
                      {byType[type]!.map((issue, i) => (
                        <IssueCard key={i} issue={issue} />
                      ))}
                    </div>
                  ))}
              </>
            )}

            {/* Positives */}
            {positives.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: "#22c55e" }} />
                  <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: "#16a34a" }}>
                    Done Well ({positives.length})
                  </p>
                </div>
                {positives.map((p, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: i * 0.05 }}
                    className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-1.5"
                    style={{ background:"rgba(34,197,94,0.07)", border:"1px solid rgba(34,197,94,0.2)" }}>
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color:"#22c55e" }} />
                    <p className="text-xs leading-relaxed" style={{ color:`${NAVY}80` }}>{p}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pages tab — show annotated images (with underlines/circles/ticks) */}
        {tab === "pages" && (
          <div className="px-5 py-4">
            {displayUrls.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: `${NAVY}50` }}>No images available</p>
            ) : (
              <>
                {/* Header row: label + download button */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-widest"
                    style={{ color: `${NAVY}55` }}>
                    {annotated_image_urls?.length ? "Annotated by Teacher AI" : "Uploaded Pages"}
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        const res  = await fetch(displayUrls[page]!);
                        const blob = await res.blob();
                        const a    = document.createElement("a");
                        a.href     = URL.createObjectURL(blob);
                        a.download = `corrected-notes-page-${page + 1}.jpg`;
                        a.click();
                      } catch { window.open(displayUrls[page], "_blank"); }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold"
                    style={{ background: `${TEAL}15`, color: TEAL, border: `1px solid ${TEAL}30` }}>
                    <Download className="w-3 h-3" />
                    Download
                  </button>
                </div>

                {/* Image carousel — click to open modal */}
                <div className="relative rounded-2xl overflow-hidden mb-3 cursor-pointer group"
                  style={{ border: `1.5px solid ${TEAL}30`, minHeight: 320, background: "#f0f0f0" }}
                  onClick={() => setModalOpen(true)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayUrls[page]}
                    alt={`Page ${page + 1}`}
                    className="w-full object-contain"
                    style={{ maxHeight: 480 }}
                  />
                  {/* Expand hover overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(15,28,77,0.35)", backdropFilter: "blur(2px)" }}>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl"
                      style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
                      <Maximize2 className="w-4 h-4" style={{ color: TEAL }} />
                      <span className="text-sm font-bold" style={{ color: "#1a1a2e" }}>View Full Size</span>
                    </div>
                  </div>
                  {displayUrls.length > 1 && (
                    <div className="absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center justify-between"
                      style={{ background: "rgba(15,28,77,0.6)", backdropFilter: "blur(6px)" }}
                      onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30"
                        style={{ background: "rgba(255,255,255,0.15)" }}>
                        <ChevronLeft className="w-4 h-4 text-white" />
                      </button>
                      <span className="text-xs font-bold text-white">
                        Page {page + 1} of {displayUrls.length}
                      </span>
                      <button
                        onClick={() => setPage(p => Math.min(displayUrls.length - 1, p + 1))}
                        disabled={page === displayUrls.length - 1}
                        className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30"
                        style={{ background: "rgba(255,255,255,0.15)" }}>
                        <ChevronRight className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Legend */}
                {annotated_image_urls?.length && (
                  <div className="flex gap-3 flex-wrap mb-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-0.5 rounded" style={{ background: "#cc0000" }} />
                      <span className="text-[10px]" style={{ color: `${NAVY}60` }}>Spelling</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-4 rounded-full border-2" style={{ borderColor: "#cc0000" }} />
                      <span className="text-[10px]" style={{ color: `${NAVY}60` }}>Wrong / Error</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold" style={{ color: "#cc0000" }}>✓</span>
                      <span className="text-[10px]" style={{ color: `${NAVY}60` }}>Correct</span>
                    </div>
                  </div>
                )}

                {/* Thumbnail row */}
                {displayUrls.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                    {displayUrls.map((url, i) => (
                      <button key={i} onClick={() => setPage(i)}
                        className="flex-shrink-0 rounded-lg overflow-hidden transition-all"
                        style={{ width: 52, height: 70,
                          border: i === page ? `2px solid ${TEAL}` : "2px solid transparent",
                          boxShadow: i === page ? `0 0 12px ${TEAL}50` : "none",
                          background: "#eee" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Thumb ${i+1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 py-4"
        style={{ borderTop: `1px solid rgba(0,0,0,0.06)` }}>
        <button onClick={onBack}
          className="w-full py-3 rounded-2xl font-black text-sm text-white"
          style={{ background: `linear-gradient(135deg, ${TEAL}, #0891B2)`,
            boxShadow: `0 4px 20px ${TEAL}40` }}>
          Back to Chapter
        </button>
      </div>

      {/* ── Full-screen modal ───────────────────────────────────────────────── */}
      {modalOpen && displayUrls.length > 0 && (
        <ImageModal
          urls={displayUrls}
          startPage={page}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

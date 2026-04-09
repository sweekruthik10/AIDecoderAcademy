"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft, Clock, Play, Upload, X, ImagePlus,
  Loader2, AlertCircle, CheckCircle2, Send,
} from "lucide-react";
import type { WrittenQuestion, WrittenFeedbackItem, Chapter } from "@/types";

interface Props {
  paperId:       string;
  questions:     WrittenQuestion[];
  chapter:       Chapter;
  onComplete:    (result: WrittenResult) => void;
  onBack:        () => void;
  onPhaseChange?: (phase: string) => void;
}

export interface WrittenResult {
  score:                  number;
  max_score:              number;
  feedback:               Record<string, WrittenFeedbackItem>;
  questions:              WrittenQuestion[];
  annotated_image_urls?:  string[];   // teacher-annotated pages from evaluate-written
}

const DURATION_SECS = 45 * 60; // 45 minutes

function formatTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const SECTION_LABELS: Record<string, string> = {
  A: "Section A — Short Answer (2 marks each)",
  B: "Section B — Medium Answer (4 marks each)",
  C: "Section C — Long Answer (5 marks each)",
};

export function WrittenTest({ paperId, questions, chapter, onBack, onComplete, onPhaseChange }: Props) {
  type Phase = "intro" | "test" | "upload" | "evaluating";
  const [phase,       setPhase]       = useState<Phase>("intro");

  // Notify parent whenever phase changes so proctoring can be paused/resumed
  const changePhase = (p: Phase) => { setPhase(p); onPhaseChange?.(p); };
  const [timeLeft,    setTimeLeft]    = useState(DURATION_SECS);
  const [timesUp,     setTimesUp]     = useState(false);
  const [images,      setImages]      = useState<{ file: File; preview: string; url?: string }[]>([]);
  const [uploading,   setUploading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [startTime,   setStartTime]   = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef  = useRef<HTMLInputElement>(null);

  // Countdown timer
  useEffect(() => {
    if (phase !== "test") return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setTimesUp(true);
          changePhase("upload");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase]);

  const startTest = () => {
    setStartTime(Date.now());
    changePhase("test");
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setImages(prev => [...prev, ...newImages].slice(0, 5));
    e.target.value = "";
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const submitAnswers = useCallback(async () => {
    if (!images.length) { setError("Upload at least one photo of your answer sheet."); return; }
    setUploading(true);
    setError(null);
    changePhase("evaluating");

    try {
      // Upload all images
      const urls: string[] = [];
      for (const img of images) {
        const fd = new FormData();
        fd.append("file", img.file);
        const res = await fetch("/api/classroom/upload-answers", { method: "POST", body: fd });
        if (!res.ok) throw new Error("Image upload failed");
        const { url } = await res.json();
        urls.push(url);
      }

      // Evaluate
      const timeTaken = startTime ? Math.round((Date.now() - startTime) / 1000) : undefined;
      const evalRes = await fetch("/api/classroom/evaluate-written", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ paper_id: paperId, image_urls: urls, time_taken_secs: timeTaken }),
      });
      if (!evalRes.ok) throw new Error(await evalRes.text());
      const data = await evalRes.json();
      onComplete({ ...data, questions });
    } catch (e: any) {
      setError(e.message ?? "Evaluation failed. Please try again.");
      changePhase("upload");
    } finally {
      setUploading(false);
    }
  }, [images, paperId, startTime, questions, onComplete]);

  const isUrgent = timeLeft <= 300 && phase === "test"; // < 5 min

  // ── Intro screen ─────────────────────────────────────────────────────────
  if (phase === "intro") {
    const bySection = questions.reduce<Record<string, WrittenQuestion[]>>((acc, q) => {
      if (!acc[q.section]) acc[q.section] = [];
      acc[q.section]!.push(q);
      return acc;
    }, {});

    const SECTION_COLORS: Record<string, string> = {
      A: "#FFB800",
      B: "#FF6B2B",
      C: "#dc2626",
    };

    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3.5"
          style={{ borderBottom: "1px solid rgba(15,28,77,0.07)" }}>
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-sm transition-all px-3 py-1.5 rounded-lg"
            style={{ color: "rgba(15,28,77,0.45)", background: "rgba(15,28,77,0.05)", border: "1px solid rgba(15,28,77,0.1)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(15,28,77,0.9)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(15,28,77,0.45)"; }}>
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="text-center">
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,184,0,0.6)" }}>Written Test</p>
            <p className="text-sm font-display font-bold mt-0.5 max-w-[200px] truncate" style={{ color: "rgba(15,28,77,0.92)" }}>{chapter.chapter_title}</p>
          </div>
          <div className="w-20" />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-7">
            {[
              { label: "Total Marks", value: `${questions.reduce((s,q)=>s+q.marks,0)}`, icon: "📋" },
              { label: "Questions",   value: `${questions.length}`,                       icon: "✏️" },
              { label: "Duration",    value: "45 min",                                    icon: "⏱" },
            ].map(({ label, value, icon }) => (
              <div key={label} className="rounded-2xl p-4 text-center"
                style={{ background: "rgba(255,184,0,0.05)", border: "1px solid rgba(255,184,0,0.15)" }}>
                <p className="text-lg mb-0.5">{icon}</p>
                <p className="font-display font-black text-xl" style={{ color: "#FFB800" }}>{value}</p>
                <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(15,28,77,0.3)" }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Section structure */}
          <p className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: "rgba(15,28,77,0.25)" }}>
            Paper Structure
          </p>
          <div className="space-y-2 mb-7">
            {Object.entries(bySection).map(([sec, qs]) => {
              const secColor = SECTION_COLORS[sec] ?? "#FFB800";
              const totalMarks = qs.reduce((s, q) => s + q.marks, 0);
              return (
                <div key={sec} className="rounded-xl overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(15,28,77,0.07)" }}>
                  <div className="flex items-center justify-between px-4 py-2.5"
                    style={{ background: "rgba(15,28,77,0.03)", borderBottom: "1px solid rgba(15,28,77,0.06)" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold"
                        style={{ background: `${secColor}22`, color: secColor }}>
                        {sec}
                      </div>
                      <span className="text-xs font-mono" style={{ color: secColor }}>
                        {SECTION_LABELS[sec]?.split("—")[1]?.trim()}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono" style={{ color: "rgba(15,28,77,0.3)" }}>
                      {totalMarks} marks
                    </span>
                  </div>
                  <div className="px-4 py-2.5 space-y-1.5">
                    {qs.map((q, i) => (
                      <p key={q.id} className="text-xs leading-relaxed" style={{ color: "rgba(15,28,77,0.45)" }}>
                        <span className="font-mono mr-1.5" style={{ color: `${secColor}88` }}>Q{i+1}.</span>
                        {q.question.slice(0, 85)}{q.question.length > 85 ? "…" : ""}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Instructions */}
          <p className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: "rgba(15,28,77,0.25)" }}>
            Instructions
          </p>
          <div className="rounded-xl p-4 space-y-2.5"
            style={{ background: "rgba(255,184,0,0.04)", border: "1px solid rgba(255,184,0,0.15)" }}>
            {[
              "Read all questions carefully before answering.",
              "Write your answers on paper using a blue or black pen.",
              "The timer begins when you click Start Test.",
              "Photograph your answer sheets clearly and upload them.",
              "AI will evaluate your answers within ~30 seconds.",
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0 mt-0.5"
                  style={{ background: "rgba(255,184,0,0.15)", color: "#FFB800" }}>
                  {i + 1}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(15,28,77,0.5)" }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-shrink-0 px-6 py-4" style={{ borderTop: "1px solid rgba(15,28,77,0.07)", background: "rgba(255,255,255,0.01)" }}>
          <button onClick={startTest}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-display font-bold text-sm transition-all"
            style={{
              background: "linear-gradient(135deg, #FFB800, #FF8C00)",
              color: "#08080F",
              boxShadow: "0 0 30px rgba(255,184,0,0.35)",
            }}>
            <Play className="w-4 h-4" /> Start Test — Timer Begins Now
          </button>
        </div>
      </div>
    );
  }

  // ── Test in progress ──────────────────────────────────────────────────────
  if (phase === "test") {
    const bySection = questions.reduce<Record<string, WrittenQuestion[]>>((acc, q) => {
      if (!acc[q.section]) acc[q.section] = [];
      acc[q.section]!.push(q);
      return acc;
    }, {});

    let qCounter = 0;

    const timerPct = timeLeft / DURATION_SECS;

    return (
      <div className="flex flex-col h-full">
        {/* Sticky timer bar */}
        <div className="flex-shrink-0"
          style={{
            background:   isUrgent ? "rgba(255,45,120,0.06)" : "rgba(255,184,0,0.04)",
            borderBottom: `1px solid ${isUrgent ? "rgba(220,38,38,0.2)" : "rgba(255,184,0,0.15)"}`,
          }}>
          <div className="flex items-center justify-between px-6 py-3">
            <p className="text-xs font-mono truncate max-w-[140px]" style={{ color: "rgba(15,28,77,0.35)" }}>
              {chapter.chapter_title}
            </p>
            <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full"
              style={{
                background: isUrgent ? "rgba(255,45,120,0.12)" : "rgba(255,184,0,0.1)",
                border: `1px solid ${isUrgent ? "rgba(255,45,120,0.3)" : "rgba(255,184,0,0.25)"}`,
              }}>
              <Clock className="w-3.5 h-3.5" style={{ color: isUrgent ? "#dc2626" : "#FFB800" }} />
              <span className="font-mono font-bold text-base tabular-nums"
                style={{ color: isUrgent ? "#dc2626" : "#FFB800" }}>
                {formatTime(timeLeft)}
              </span>
            </div>
            <button
              onClick={() => changePhase("upload")}
              className="text-xs font-display font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: "rgba(15,28,77,0.06)", color: "rgba(15,28,77,0.6)", border: "1px solid rgba(15,28,77,0.12)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(15,28,77,0.9)"; (e.currentTarget as HTMLElement).style.background = "rgba(15,28,77,0.08)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(15,28,77,0.6)"; (e.currentTarget as HTMLElement).style.background = "rgba(15,28,77,0.05)"; }}
            >
              I&apos;m Done
            </button>
          </div>
          {/* Timer drain bar */}
          <div className="h-0.5 w-full" style={{ background: "rgba(15,28,77,0.06)" }}>
            <div className="h-full transition-all duration-1000"
              style={{
                width: `${timerPct * 100}%`,
                background: isUrgent ? "#dc2626" : "#FFB800",
                boxShadow: isUrgent ? "0 0 8px rgba(255,45,120,0.6)" : "0 0 8px rgba(255,184,0,0.5)",
              }} />
          </div>
        </div>

        {/* Questions */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
          {Object.entries(bySection).map(([sec, qs]) => {
            const secColors: Record<string, string> = { A: "#FFB800", B: "#FF6B2B", C: "#dc2626" };
            const secColor = secColors[sec] ?? "#FFB800";
            return (
              <div key={sec}>
                {/* Section header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center font-display font-black text-sm"
                    style={{ background: `${secColor}18`, color: secColor, border: `1px solid ${secColor}30` }}>
                    {sec}
                  </div>
                  <div>
                    <p className="text-xs font-mono" style={{ color: secColor }}>
                      {SECTION_LABELS[sec]}
                    </p>
                  </div>
                  <div className="flex-1 h-px" style={{ background: `${secColor}20` }} />
                </div>

                <div className="space-y-3">
                  {qs.map(q => {
                    qCounter++;
                    return (
                      <div key={q.id} className="rounded-2xl p-4"
                        style={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(15,28,77,0.07)" }}>
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-mono font-bold mt-0.5"
                            style={{ background: `${secColor}15`, color: secColor, border: `1px solid ${secColor}25` }}>
                            {qCounter}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                                style={{ background: "rgba(15,28,77,0.06)", color: "rgba(15,28,77,0.4)", border: "1px solid rgba(15,28,77,0.1)" }}>
                                {q.marks} mark{q.marks > 1 ? "s" : ""}
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed" style={{ color: "rgba(15,28,77,0.88)" }}>
                              {q.question}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="h-4" />
        </div>
      </div>
    );
  }

  // ── Upload phase ──────────────────────────────────────────────────────────
  if (phase === "upload") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3.5"
          style={{ borderBottom: "1px solid rgba(15,28,77,0.07)" }}>
          <button
            onClick={() => { if (!uploading) changePhase("test"); }}
            className="flex items-center gap-1.5 text-sm transition-all px-3 py-1.5 rounded-lg"
            style={{
              color: "rgba(15,28,77,0.45)",
              background: "rgba(15,28,77,0.06)",
              border: "1px solid rgba(15,28,77,0.1)",
              pointerEvents: uploading ? "none" : "auto",
              opacity: uploading ? 0.4 : 1,
            }}
            onMouseEnter={e => { if (!uploading) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(15,28,77,0.45)"; }}
          >
            <ChevronLeft className="w-4 h-4" />
            {timesUp ? "Time's Up" : "Back to Paper"}
          </button>
          <div className="text-center">
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: timesUp ? "#dc2626" : "rgba(255,184,0,0.7)" }}>
              {timesUp ? "⏱ Time's Up" : "Upload Answers"}
            </p>
            <p className="text-sm font-display font-bold mt-0.5" style={{ color: "rgba(15,28,77,0.8)" }}>
              {images.length}/5 photos
            </p>
          </div>
          <div className="w-24" />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-sm mb-5 leading-relaxed" style={{ color: "rgba(15,28,77,0.45)" }}>
            Take clear photos of your written answer sheets. Make sure all answers are legible.
          </p>

          {/* Upload drop zone */}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
          {images.length < 5 && (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-7 rounded-2xl mb-5 transition-all"
              style={{
                background:   "rgba(255,184,0,0.04)",
                border:       "2px dashed rgba(255,184,0,0.22)",
                color:        "#FFB800",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,184,0,0.09)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,184,0,0.4)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,184,0,0.04)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,184,0,0.22)";
              }}
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(255,184,0,0.15)", border: "1px solid rgba(255,184,0,0.25)" }}>
                <ImagePlus className="w-5 h-5" style={{ color: "#FFB800" }} />
              </div>
              <span className="text-sm font-display font-bold">
                {images.length === 0 ? "Tap to Add Answer Sheet Photos" : `Add More (${images.length}/5)`}
              </span>
              <span className="text-[11px] font-mono" style={{ color: "rgba(255,184,0,0.5)" }}>
                JPG, PNG — up to 5 images
              </span>
            </button>
          )}

          {/* Image previews */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {images.map((img, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden group"
                  style={{ border: "1px solid rgba(255,255,255,0.1)", aspectRatio: "3/4" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.preview} alt={`Sheet ${i+1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(0,0,0,0.3)" }} />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all"
                    style={{ background: "rgba(0,0,0,0.75)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold"
                    style={{ background: "rgba(0,0,0,0.65)", color: "rgba(255,255,255,0.75)", backdropFilter: "blur(4px)" }}>
                    Page {i + 1}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl mb-3"
              style={{ background: "rgba(255,45,120,0.08)", color: "#dc2626", border: "1px solid rgba(255,45,120,0.18)" }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          {images.length > 0 && (
            <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(22,163,74,0.06)", color: "rgba(0,255,148,0.75)", border: "1px solid rgba(0,255,148,0.14)" }}>
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {images.length} photo{images.length > 1 ? "s" : ""} ready to submit
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-6 py-4" style={{ borderTop: "1px solid rgba(15,28,77,0.07)", background: "rgba(255,255,255,0.01)" }}>
          <button
            onClick={submitAnswers}
            disabled={!images.length || uploading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-display font-bold text-sm transition-all"
            style={{
              background: images.length && !uploading ? "linear-gradient(135deg, #2563eb, #1a4db5)" : "rgba(15,28,77,0.06)",
              color:      images.length && !uploading ? "#ffffff" : "rgba(15,28,77,0.3)",
              cursor:     images.length && !uploading ? "pointer" : "not-allowed",
              boxShadow:  images.length && !uploading ? "0 0 30px rgba(255,184,0,0.3)" : "none",
            }}
          >
            <Upload className="w-4 h-4" />
            Submit for AI Evaluation
          </button>
        </div>
      </div>
    );
  }

  // ── Evaluating ────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <div className="relative">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, rgba(255,184,0,0.18), rgba(255,184,0,0.05))",
            border:     "1px solid rgba(255,184,0,0.3)",
            boxShadow:  "0 0 60px rgba(255,184,0,0.2)",
          }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#FFB800" }} />
        </div>
        <div className="absolute -inset-3 rounded-[28px] opacity-15 animate-pulse"
          style={{ background: "radial-gradient(circle, rgba(255,184,0,0.5), transparent 70%)" }} />
      </div>

      <div className="text-center max-w-xs">
        <p className="font-display font-bold text-base mb-2" style={{ color: "rgba(15,28,77,0.85)" }}>
          Evaluating your answers
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "rgba(15,28,77,0.35)" }}>
          AI is reading your handwriting and scoring each answer against the marking scheme. This takes 20–40 seconds.
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-xs">
        {["Reading handwriting…", "Matching to marking scheme…", "Generating feedback…"].map((step, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
            style={{ background: "rgba(255,255,255,0.92)", border: "1px solid rgba(15,28,77,0.06)" }}>
            <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ background: "rgba(255,184,0,0.15)", border: "1px solid rgba(255,184,0,0.25)" }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#FFB800", animationDelay: `${i * 0.3}s` }} />
            </div>
            <span className="text-xs font-mono" style={{ color: "rgba(15,28,77,0.4)" }}>{step}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs px-4 py-2.5 rounded-xl max-w-sm"
          style={{ background: "rgba(255,45,120,0.08)", color: "#dc2626", border: "1px solid rgba(255,45,120,0.18)" }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}
    </div>
  );
}

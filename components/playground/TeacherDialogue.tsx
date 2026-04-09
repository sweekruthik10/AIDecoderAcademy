"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { speakAsTeacher, type SpeakHandle } from "@/lib/teacherAudio";
import type { ObjectiveRubric } from "@/lib/objectiveRubrics";
import { pickTeacherOpeningLine } from "@/lib/teacherPersona";

// JRPG-style
// Layout matches the user's reference image: large character portrait
// bottom-left bleeding below the dialogue box, dark dialogue box with
// purple-pink border + name plate, typewriter text, action buttons.
//
// Tone: themed for our dark/purple aesthetic (#08080F + #7C3AED accents)
// rather than the warm-wood reference, but the structure is identical.

export type ValidationResult = {
  score:        number;
  tier:         "distinction" | "merit" | "pass" | "fail";
  passed:       boolean;
  summary:      string;
  strengths:    string[];
  improvements: string[];
  hintForRetry: string | null;
};

interface Props {
  open:        boolean;
  rubric:      ObjectiveRubric;
  onClose:     () => void;
  onValidate:  () => Promise<{ result: ValidationResult; attemptId: string } | null>;
  onComplete:  (attemptId: string) => Promise<void>;
}

type Phase =
  | "greeting"      // initial dialogue, awaiting student action
  | "validating"    // /api/aida/validate in flight
  | "result"        // showing the validation panel
  | "completing";   // PATCH /api/objective-attempts in flight

const TIER_META: Record<ValidationResult["tier"], { label: string; color: string; emoji: string }> = {
  distinction: { label: "DISTINCTION", color: "#C8FF00", emoji: "🏆" },
  merit:       { label: "MERIT",       color: "#FFB020", emoji: "⭐" },
  pass:        { label: "PASS",        color: "#7BFFC4", emoji: "✅" },
  fail:        { label: "TRY AGAIN",   color: "#FF6B6B", emoji: "🔄" },
};

export function TeacherDialogue({ open, rubric, onClose, onValidate, onComplete }: Props) {
  const [phase, setPhase]         = useState<Phase>("greeting");
  const [text, setText]           = useState("");          // text being typed
  const [revealed, setRevealed]   = useState(0);           // chars visible
  const [result, setResult]       = useState<ValidationResult | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [showTaskText, setShowTaskText] = useState(false); // overrides ResultPanel when re-reading the task

  const speakRef     = useRef<SpeakHandle | null>(null);
  const validateAbortRef = useRef<AbortController | null>(null);

  // ── Reset when opened ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setPhase("greeting");
    setError(null);
    setResult(null);
    setAttemptId(null);
    setShowTaskText(false);
    const greeting = pickTeacherOpeningLine(rubric.lmsId);
    // Build a contextual greeting: identify the objective + encourage
    const taskBlurb = rubric.labTask.length > 120
      ? rubric.labTask.slice(0, 117) + "..."
      : rubric.labTask;
    const taskEndsInPunct = /[.!?]$/.test(taskBlurb);
    const contextualGreeting = `You're working on "${rubric.title}". ${taskBlurb}${taskEndsInPunct ? "" : "."} Take your time — come back when you're done and I'll check it.`;
    speakLine(contextualGreeting);
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rubric.lmsId]);

  // ── Esc to close ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase]);

  function stopSpeaking() {
    if (speakRef.current) { speakRef.current.cancel(); speakRef.current = null; }
  }

  function speakLine(line: string) {
    stopSpeaking();
    setText(line);
    setRevealed(0);
    speakRef.current = null;
    speakAsTeacher(line).then(h => { speakRef.current = h; }).catch(() => {});
  }

  // ── Typewriter — synced to audio progress when audio is playing,
  //    falls back to ~30cps when audio fails or hasn't started yet. ─────
  useEffect(() => {
    if (!open) return;
    if (text.length === 0) return;

    let raf = 0;
    let fallbackStart = 0;

    const tick = (now: number) => {
      const handle = speakRef.current;
      const audioProgress = handle?.progress01() ?? 0;

      // If audio is reporting real progress, sync to it.
      // Otherwise fall back to a steady 33ms/char timer.
      let target: number;
      if (audioProgress > 0) {
        target = Math.floor(text.length * audioProgress);
      } else {
        if (fallbackStart === 0) fallbackStart = now;
        target = Math.min(text.length, Math.floor((now - fallbackStart) / 33));
      }

      setRevealed(prev => (target > prev ? target : prev));

      if (target < text.length) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, open]);

  function instantReveal() {
    setRevealed(text.length);
  }

  // ── Action handlers ──────────────────────────────────────────────────
  async function handleValidate() {
    setPhase("validating");
    setError(null);
    setShowTaskText(false);
    speakLine("Hmm, let me have a look at your work…");

    const ctrl = new AbortController();
    validateAbortRef.current = ctrl;

    try {
      const out = await onValidate();
      if (ctrl.signal.aborted) return;     // cancelled mid-flight
      validateAbortRef.current = null;

      if (!out) {
        setError("Validation failed. Please try again.");
        setPhase("greeting");
        speakLine("Something went wrong reading your work. Want to try again?");
        return;
      }
      setResult(out.result);
      setAttemptId(out.attemptId);
      setPhase("result");
      speakLine(out.result.summary);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("[TeacherDialogue] validate failed:", err);
      setError("Validation failed. Please try again.");
      setPhase("greeting");
    }
  }

  async function handleMarkComplete() {
    if (!attemptId) return;
    setPhase("completing");
    try {
      await onComplete(attemptId);
      handleClose();
    } catch (err) {
      console.error("[TeacherDialogue] mark complete failed:", err);
      setError("Could not mark complete. Please try again.");
      setPhase("result");
    }
  }

  function handleExplainTask() {
    const line = `Here's your mission. ${rubric.labTask} To pass, ${rubric.submitRequirements}`;
    setShowTaskText(true);
    speakLine(line);
  }

  function handleTryAgain() {
    setResult(null);
    setAttemptId(null);
    setShowTaskText(false);
    setPhase("greeting");
    speakLine("No worries — keep working and call me back when you're ready.");
    // Closing here would also be reasonable; we leave the dialogue open
    // so the student can immediately re-validate after one more iteration.
    setTimeout(() => onClose(), 1200);
  }

  function handleClose() {
    // Cancel anything in flight
    if (validateAbortRef.current) { validateAbortRef.current.abort(); validateAbortRef.current = null; }
    stopSpeaking();
    onClose();
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="teacher-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[60] pointer-events-auto"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent 40%)" }}
        onClick={(e) => {
          // Click outside the dialogue closes it
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        {/* Portrait — bottom-left, bleeds below the dialogue box.
            Fluid height: scales with viewport between ~240 and ~480px. */}
        <motion.img
          key="teacher-portrait"
          src="/teacher.png"
          alt="Validator"
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0,   opacity: 1 }}
          exit={{    x: -40, opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="absolute pointer-events-none select-none"
          style={{
            bottom:    "-3vh",
            left:      "1vw",
            height:    "clamp(340px, 56vh, 660px)",
            width:     "auto",
            filter:    "drop-shadow(0 0 34px rgba(124,58,237,0.55))",
          }}
        />

        {/* Dialogue box — bottom area, right of the portrait.
            Capped at 920px and centered in the remaining space so it doesn't
            stretch across ultrawide monitors. */}
        <motion.div
          key="teacher-dialogue-box"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0,  opacity: 1 }}
          exit={{    y: 40, opacity: 0 }}
          transition={{ duration: 0.28, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="absolute"
          style={{
            left:      "clamp(260px, 22vw, 360px)",
            right:     "clamp(24px, 4vw, 64px)",
            bottom:    "clamp(20px, 4vh, 48px)",
            maxWidth:  920,
            margin:    "0 auto",
          }}
        >
          {/* Name plate */}
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 mb-2 rounded-md"
            style={{
              background: "linear-gradient(135deg, #7C3AED, #FF2D78)",
              boxShadow:  "0 4px 18px rgba(124,58,237,0.4)",
            }}
          >
            <span className="text-[11px] font-display font-extrabold text-white tracking-wider">VALIDATOR</span>
          </div>

          {/* Box */}
          <div
            onClick={instantReveal}
            className="rounded-xl px-5 py-4 cursor-pointer"
            style={{
              background:     "rgba(8,8,15,0.96)",
              border:         "1px solid rgba(124,58,237,0.55)",
              boxShadow:      "0 0 40px rgba(124,58,237,0.35), 0 12px 40px rgba(0,0,0,0.6)",
              backdropFilter: "blur(20px)",
              minHeight:      120,
            }}
          >
            {/* Body text — typewriter */}
            {phase !== "result" || !result || showTaskText ? (
              <p
                className="text-[14px] leading-relaxed"
                style={{
                  color:      "rgba(255,255,255,0.92)",
                  fontFamily: "'JetBrains Mono', monospace",
                  minHeight:  56,
                }}
              >
                {text.slice(0, revealed)}
                {revealed < text.length && (
                  <span className="inline-block w-2 h-4 align-middle ml-0.5" style={{ background: "#7C3AED", animation: "blink 0.9s steps(2,start) infinite" }}/>
                )}
              </p>
            ) : (
              <ResultPanel result={result}/>
            )}

            {/* Error banner */}
            {error && (
              <div className="mt-3 text-[12px]" style={{ color: "#FF6B6B" }}>{error}</div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
              {phase === "greeting" && (
                <>
                  <ActionButton primary onClick={handleValidate}>Validate my work</ActionButton>
                  <ActionButton onClick={handleExplainTask}>Explain the task</ActionButton>
                  <ActionButton onClick={handleClose}>Close</ActionButton>
                </>
              )}
              {phase === "validating" && (
                <ActionButton disabled>Reviewing…</ActionButton>
              )}
              {phase === "result" && result && (
                <>
                  {result.passed ? (
                    <ActionButton primary onClick={handleMarkComplete}>Mark Complete</ActionButton>
                  ) : (
                    <ActionButton primary onClick={handleTryAgain}>Try Again</ActionButton>
                  )}
                  <ActionButton onClick={handleExplainTask}>Re-read task</ActionButton>
                  <ActionButton onClick={handleClose}>Close</ActionButton>
                </>
              )}
              {phase === "completing" && (
                <ActionButton disabled>Saving…</ActionButton>
              )}
            </div>
          </div>
        </motion.div>

        <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function ActionButton({
  children, onClick, primary, disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      style={primary ? {
        background: "linear-gradient(135deg, #7C3AED, #FF2D78)",
        color:      "#fff",
        boxShadow:  "0 4px 14px rgba(124,58,237,0.45)",
      } : {
        background: "rgba(255,255,255,0.06)",
        border:     "1px solid rgba(255,255,255,0.12)",
        color:      "rgba(255,255,255,0.85)",
      }}
    >
      {children}
    </button>
  );
}

function ResultPanel({ result }: { result: ValidationResult }) {
  const meta = TIER_META[result.tier];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className="text-[44px] font-display font-extrabold leading-none"
          style={{ color: meta.color, textShadow: `0 0 18px ${meta.color}55` }}
        >
          {result.score}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] tracking-widest text-white/40">SCORE / 100</span>
          <span
            className="text-[13px] font-display font-extrabold tracking-wider"
            style={{ color: meta.color }}
          >
            {meta.emoji} {meta.label}
          </span>
        </div>
      </div>

      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "rgba(255,255,255,0.92)", fontFamily: "'JetBrains Mono', monospace" }}
      >
        {result.summary}
      </p>

      {result.strengths.length > 0 && (
        <div>
          <p className="text-[10px] tracking-widest text-white/45 mb-1">WHAT WORKED</p>
          <ul className="space-y-0.5">
            {result.strengths.map((s, i) => (
              <li key={i} className="text-[12px] text-white/80">• {s}</li>
            ))}
          </ul>
        </div>
      )}

      {result.improvements.length > 0 && (
        <div>
          <p className="text-[10px] tracking-widest text-white/45 mb-1">WHAT TO IMPROVE</p>
          <ul className="space-y-0.5">
            {result.improvements.map((s, i) => (
              <li key={i} className="text-[12px] text-white/80">• {s}</li>
            ))}
          </ul>
        </div>
      )}

      {result.hintForRetry && (
        <p className="text-[12px] italic" style={{ color: "#FFB020" }}>
          💡 {result.hintForRetry}
        </p>
      )}
    </div>
  );
}

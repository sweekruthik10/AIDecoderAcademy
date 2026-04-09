"use client";

// Bhavna's welcome panel — a one-shot greeting shown when the student enters
// the classroom. Deliberately uses the SAME stage layout as LecturePanel
// (full-body portrait bottom-left, dialogue box bottom-right, navy/gold
// palette) so the welcome feels like Bhavna stepping in to talk — not a
// generic centred modal card.
//
// - Greeting text comes from buildClassroomGreeting (learner-model aware).
// - The spoken line is prefetched + played on mount for an instant feel.
// - A speaker toggle (shared `bhavna:hintAudio` key) silences the voice.
// - Dispatches validator-panel-open/-close so AIDA + worksheet sprite hide.

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, X, ArrowRight, MessageSquare } from "lucide-react";
import { buildClassroomGreeting } from "@/lib/teacherPanelGreeting";
import { speakBhavna } from "./bhavnaTts";
import type { Profile } from "@/types";

interface Props {
  profile:    Profile | null;
  onClose:    () => void;
  /** Opens the full TeacherChat (student wants to ask something now). */
  onOpenChat: () => void;
}

// ── Palette (matches LecturePanel) ──────────────────────────────────────────
const GOLD        = "#E0B14C";
const GOLD_GLOW   = "rgba(224,177,76,0.45)";
const VIOLET      = "#9D6BFF";
const VIOLET_DEEP = "#5B2BCC";
const TEXT_HI     = "#F4ECD7";
const TEXT_MID    = "rgba(244,236,215,0.78)";

const HINT_AUDIO_KEY = "bhavna:hintAudio";

export function BhavnaWelcomePanel({ profile, onClose, onOpenChat }: Props) {
  const [audioOn, setAudioOn] = useState(true);
  const ttsAbortRef = useRef<AbortController | null>(null);

  // Greeting is built once — learner-model aware, returning-student framing.
  const greetingRef = useRef(
    buildClassroomGreeting({
      displayName:     profile?.display_name ?? "Explorer",
      activeArena:     profile?.active_arena ?? null,
      isReturning:     true,
      learnerModelRaw: (profile as { learner_model?: Record<string, unknown> } | null)?.learner_model ?? null,
    }),
  );
  const greeting = greetingRef.current;

  // ── Hide AIDA + worksheet sprite while the welcome panel is up ────────────
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("validator-panel-open"));
    return () => { window.dispatchEvent(new CustomEvent("validator-panel-close")); };
  }, []);

  // ── Prefetch + play the spoken greeting on mount ──────────────────────────
  useEffect(() => {
    const muted = typeof window !== "undefined" && localStorage.getItem(HINT_AUDIO_KEY) === "off";
    if (muted) { setAudioOn(false); return; }
    const ctrl = new AbortController();
    ttsAbortRef.current = ctrl;
    speakBhavna(greeting.spoken, ctrl.signal).catch(() => { /* autoplay block — silent */ });
    return () => ctrl.abort();
  }, [greeting.spoken]);

  const toggleAudio = useCallback(() => {
    setAudioOn(v => {
      const next = !v;
      if (typeof window !== "undefined") {
        localStorage.setItem(HINT_AUDIO_KEY, next ? "on" : "off");
      }
      if (!next) {
        ttsAbortRef.current?.abort();
      } else {
        const ctrl = new AbortController();
        ttsAbortRef.current = ctrl;
        speakBhavna(greetingRef.current.spoken, ctrl.signal).catch(() => {});
      }
      return next;
    });
  }, []);

  const close = useCallback(() => {
    ttsAbortRef.current?.abort();
    onClose();
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        key="welcome-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[60] pointer-events-auto"
        style={{ background: "linear-gradient(to top, rgba(10,18,48,0.88), rgba(0,0,0,0.45) 40%)" }}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        {/* Bhavna portrait — bottom-left, same as LecturePanel */}
        <motion.img
          src="/classroom/teacher-bhavna.png"
          alt="Ms. Bhavna"
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0,   opacity: 1 }}
          exit={{    x: -40, opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="absolute pointer-events-none select-none"
          style={{
            bottom: "-3vh",
            left:   "1vw",
            height: "clamp(340px, 56vh, 660px)",
            width:  "auto",
            filter: `drop-shadow(0 0 34px ${GOLD_GLOW})`,
          }}
        />

        {/* Dialogue box — bottom-right */}
        <motion.div
          key="welcome-box"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0,  opacity: 1 }}
          exit={{    y: 40, opacity: 0 }}
          transition={{ duration: 0.28, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="absolute flex flex-col gap-2"
          style={{
            left:      "clamp(260px, 22vw, 360px)",
            right:     "clamp(16px, 3vw, 48px)",
            bottom:    "clamp(16px, 3vh, 40px)",
            maxWidth:  880,
            fontFamily: "var(--font-dm-sans,'DM Sans',sans-serif)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Name plate + controls row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md"
              style={{
                background: `linear-gradient(135deg, ${VIOLET_DEEP}, ${GOLD})`,
                boxShadow:  `0 4px 18px ${GOLD_GLOW}`,
              }}
            >
              <span style={{
                fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)",
                fontSize: 9, fontWeight: 700, color: TEXT_HI,
                letterSpacing: "0.18em", textTransform: "uppercase",
              }}>
                Ms. Bhavna · Welcome
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={toggleAudio}
                title={audioOn ? "Mute Bhavna" : "Unmute Bhavna"}
                aria-label={audioOn ? "Mute Bhavna" : "Unmute Bhavna"}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${audioOn ? GOLD : "rgba(255,255,255,0.12)"}` }}
              >
                {audioOn ? <Volume2 size={12} color={TEXT_HI} /> : <VolumeX size={12} color={TEXT_HI} />}
              </button>
              <button
                onClick={close}
                aria-label="Close welcome"
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.04)", color: TEXT_MID }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Main dialogue box */}
          <div
            className="rounded-2xl px-5 py-4"
            style={{
              background: `
                radial-gradient(120% 80% at 0% 0%, ${VIOLET_DEEP}22 0%, transparent 60%),
                radial-gradient(120% 80% at 100% 100%, ${GOLD}1a 0%, transparent 55%),
                rgba(8,8,15,0.97)
              `,
              border:    `1px solid ${GOLD}55`,
              boxShadow: `0 1px 0 ${TEXT_HI}1a inset, 0 0 40px rgba(0,0,0,0.5), 0 0 36px -10px ${GOLD_GLOW}`,
            }}
          >
            <div className="space-y-4 py-1">
              <p style={{
                color: GOLD, fontSize: 10,
                fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)",
                fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
              }}>
                👩‍🏫 YOUR CLASSROOM TEACHER
              </p>
              <p style={{ color: TEXT_HI, fontSize: 14, lineHeight: 1.65 }}>
                {greeting.text}
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={close}
                  className="px-4 py-2 rounded-full text-[12px] font-bold flex items-center gap-1.5"
                  style={{
                    background: `linear-gradient(135deg, ${GOLD}, ${VIOLET})`,
                    color: TEXT_HI, boxShadow: `0 4px 14px ${GOLD_GLOW}`,
                  }}
                >
                  Let&rsquo;s begin <ArrowRight size={13} />
                </button>
                <button
                  onClick={() => { ttsAbortRef.current?.abort(); onOpenChat(); }}
                  className="px-4 py-2 rounded-full text-[12px] font-semibold flex items-center gap-1.5"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)", color: TEXT_MID,
                  }}
                >
                  <MessageSquare size={13} /> Ask Ms. Bhavna a question
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default BhavnaWelcomePanel;

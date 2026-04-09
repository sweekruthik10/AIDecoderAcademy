"use client";

// Classroom Teacher (Ms. Bhavna) — full-body standee + chat + lecture.
// Click standee → opens TeacherChat (free chat).
// Click "Lesson" inside TeacherChat → opens LecturePanel overlay.
//
// Contextual hint bubble: instead of a static "Talk to Ms. Bhavna", the
// standee periodically surfaces a rotating, encouraging nudge — doubt prompts,
// revision offers, and (when a learner_model is present) messages tied to the
// student's actual growth areas. Idle students get gentler check-ins. Each
// nudge can be spoken aloud in Bhavna's voice; a speaker toggle disables that.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { useClassroomWriter } from "@/lib/chatChannels";
import type { Profile } from "@/types";
import { TeacherChat } from "./TeacherChat";
import { LecturePanel } from "./LecturePanel";
import { BhavnaWelcomePanel } from "./BhavnaWelcomePanel";
import { speakBhavna } from "./bhavnaTts";

interface Props {
  profile: Profile | null;
  chapterTitle?: string;
  hidden?: boolean;
}

const GOLD      = "#E0B14C";
const GOLD_GLOW = "rgba(224,177,76,0.55)";

const HINT_AUDIO_KEY = "bhavna:hintAudio";

// ── Nudge copy ───────────────────────────────────────────────────────────────
// Generic doubt / revision / encouragement prompts — what an AI teacher should
// actually say, not just "talk to me".
const GENERIC_HINTS = [
  "Stuck on something? Ask me — that's what I'm here for. 🙂",
  "Have a doubt? Don't keep it — let's clear it together.",
  "Want me to explain this topic more clearly? Just tap me.",
  "Need help understanding this chapter? I can walk you through it.",
  "Revising? I can make quick notes or flashcards for you.",
  "No question is too small — tap me if anything feels confusing.",
  "Want to understand this better? Let's go through it step by step.",
];

// Gentler check-ins shown when the student has been idle a while.
const IDLE_HINTS = [
  "Still there? I'm right here if you need help. 🙂",
  "Take your time — ask me whenever you're ready.",
  "Want to go over something together?",
];

// Turns the student's learner_model growth areas into targeted nudges.
function deriveLearnerHints(profile: Profile | null): string[] {
  const lm = (profile as { learner_model?: unknown } | null)?.learner_model as
    | { cognitive_profile?: { top_growth_areas?: { concept?: string }[] } }
    | undefined;
  const areas = lm?.cognitive_profile?.top_growth_areas;
  if (!Array.isArray(areas)) return [];
  return areas
    .slice(0, 2)
    .map(a => (a?.concept ?? "").replace(/_/g, " ").trim())
    .filter(Boolean)
    .flatMap(concept => [
      `${concept} can be tricky — want to break it down together?`,
      `Shall we revise ${concept}? I'll keep it simple.`,
    ]);
}

// Auto-open the welcome panel once per JS session (per full page load).
// Module-level so a remount doesn't re-greet; an F5 re-evaluates the module
// and re-greets — the desired behaviour.
let _bhavnaWelcomed = false;

export function TeacherCharacter({ profile, chapterTitle, hidden }: Props) {
  const [chatOpen,    setChatOpen]    = useState(false);
  const [lectureOpen, setLectureOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [speaking,    setSpeaking]    = useState(false);
  const writer = useClassroomWriter();

  // ── Hint-bubble state ──────────────────────────────────────────────────────
  const [hintText,    setHintText]    = useState<string | null>(null);
  const [audioOn,     setAudioOn]     = useState(true);

  const lastActivityRef = useRef<number>(Date.now());
  const cycleRef        = useRef(0);              // rotates through the pool
  const ttsAbortRef     = useRef<AbortController | null>(null);

  // Build the message pool once per profile (generic + learner-targeted).
  // Memoised so the nudge-cycle effect below isn't reset on every render.
  const learnerHints = useMemo(() => deriveLearnerHints(profile), [profile]);

  // ── Lesson-writer lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    writer.startLesson("classroom");
    return () => {
      writer.endLesson({
        topic:            chapterTitle || "classroom_visit",
        summary:          `Student visited the classroom${chapterTitle ? ` for ${chapterTitle}` : ""}.`,
        keyConcepts:      [],
        studentResponses: [],
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Warm up the TTS pipeline on mount ─────────────────────────────────────
  // ElevenLabs cold-starts ~5s on the first call each page load. A tiny
  // throwaway request now means the welcome panel, hint bubble, and lesson
  // audio all hit a warm pipeline and play instantly.
  useEffect(() => {
    fetch("/api/aida/tts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text: ".", role: "classroom" }),
    }).catch(() => { /* warmup is best-effort */ });
  }, []);

  // ── Auto-open the welcome panel once per page load ────────────────────────
  // Flag is set inside the timeout (not before) so React Strict Mode's
  // mount→cleanup→mount cycle in dev doesn't consume it before the panel opens.
  useEffect(() => {
    if (_bhavnaWelcomed || hidden || typeof window === "undefined") return;
    const t = setTimeout(() => { _bhavnaWelcomed = true; setWelcomeOpen(true); }, 600);
    return () => clearTimeout(t);
  }, [hidden]);

  // ── Audio-preference persistence ───────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(HINT_AUDIO_KEY) === "off") {
      setAudioOn(false);
    }
  }, []);

  const toggleAudio = useCallback(() => {
    setAudioOn(v => {
      const next = !v;
      if (typeof window !== "undefined") {
        localStorage.setItem(HINT_AUDIO_KEY, next ? "on" : "off");
      }
      if (!next) ttsAbortRef.current?.abort();   // silencing → cut any playback
      return next;
    });
  }, []);

  // ── Track student activity so idle nudges can be gentler ──────────────────
  useEffect(() => {
    const mark = () => { lastActivityRef.current = Date.now(); };
    const evs: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll"];
    evs.forEach(e => window.addEventListener(e, mark, { passive: true }));
    return () => evs.forEach(e => window.removeEventListener(e, mark));
  }, []);

  // ── Hide the bubble (and any audio) while a panel is open ─────────────────
  useEffect(() => {
    if (chatOpen || lectureOpen || welcomeOpen) {
      setHintText(null);
      ttsAbortRef.current?.abort();
    }
  }, [chatOpen, lectureOpen, welcomeOpen]);

  // ── Contextual nudge cycle ─────────────────────────────────────────────────
  // Surfaces a hint only when the student hasn't interacted with the page in a
  // while (idle >30s). Active students (recent scroll/click/typing) get skipped.
  // First hint waits 15s, then rotates every ~98s (8s visible + 90s gap).
  // Max 3 hints per page load — after that, no more nudges.
  useEffect(() => {
    if (hidden || chatOpen || lectureOpen || welcomeOpen) return;

    let showTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let shownCount = 0;
    const MAX_HINTS = 3;

    const pickMessage = (): string => {
      const idle = Date.now() - lastActivityRef.current > 60_000;
      if (idle) return IDLE_HINTS[cycleRef.current % IDLE_HINTS.length];
      const pool = [...GENERIC_HINTS, ...learnerHints];
      return pool[cycleRef.current % pool.length];
    };

    const recentlyActive = (): boolean =>
      Date.now() - lastActivityRef.current < 30_000;

    const show = () => {
      if (cancelled || shownCount >= MAX_HINTS) return;

      // Skip if the student was active in the last 30s (scrolling, typing, etc.)
      if (recentlyActive()) {
        showTimer = setTimeout(show, 30_000);
        return;
      }

      const msg = pickMessage();
      cycleRef.current += 1;
      shownCount += 1;
      setHintText(msg);
      if (audioOn) {
        ttsAbortRef.current?.abort();
        const ctrl = new AbortController();
        ttsAbortRef.current = ctrl;
        speakBhavna(msg, ctrl.signal).catch(() => { /* autoplay block / abort — silent */ });
      }
      hideTimer = setTimeout(() => {
        if (cancelled) return;
        setHintText(null);
        showTimer = setTimeout(show, 90_000);
      }, 8_000);
    };

    // First nudge appears 15s after page load — gives the student time to settle.
    showTimer = setTimeout(show, 15_000);

    return () => {
      cancelled = true;
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      ttsAbortRef.current?.abort();
    };
  }, [hidden, chatOpen, lectureOpen, welcomeOpen, audioOn, learnerHints]);

  if (hidden) return null;

  return (
    <>
      {/* ── Standee (hidden while the welcome OR lecture panel is up —
             both render their own full-body Bhavna, so they'd overlap) ── */}
      {!welcomeOpen && !lectureOpen && (
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="fixed z-30 pointer-events-none"
        style={{
          left:   "-8px",
          bottom: "0px",
          height: "clamp(280px, 38vh, 460px)",
          width:  "auto",
        }}
      >
        {/* Floor glow — wider pulse range when speaking */}
        <motion.div
          className="absolute pointer-events-none"
          style={{
            bottom: 0, left: "50%", transform: "translateX(-50%)",
            width: "130%", height: "36%",
            background: `radial-gradient(ellipse at center bottom, ${GOLD_GLOW} 0%, transparent 70%)`,
            filter: "blur(10px)",
          }}
          animate={{ opacity: speaking ? [0.2, 1.0, 0.2] : 0.45, scale: speaking ? [0.95, 1.05, 0.95] : 1 }}
          transition={speaking
            ? { duration: 1.0, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.4 }}
        />

        <motion.button
          type="button"
          onClick={() => setChatOpen(true)}
          aria-label="Talk to Ms. Bhavna"
          className="relative h-full pointer-events-auto cursor-pointer"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ background: "transparent", border: "none", padding: 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/classroom/teacher-bhavna.png"
            alt="Ms. Bhavna — your classroom teacher"
            draggable={false}
            className="select-none h-full w-auto block"
            style={{
              objectFit: "contain",
              filter: "drop-shadow(0 12px 22px rgba(0,0,0,0.45))",
            }}
          />
        </motion.button>

        {/* Contextual hint bubble */}
        <AnimatePresence>
          {hintText && (
            <motion.div
              initial={{ opacity: 0, x: -8, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -8, scale: 0.96 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setChatOpen(true)}
              className="absolute pointer-events-auto cursor-pointer flex items-start gap-2"
              style={{
                top: "16%",
                left: "100%",
                marginLeft: 10,
                maxWidth: 230,
                background: "linear-gradient(180deg, rgba(21,34,78,0.97), rgba(10,18,48,0.97))",
                color: "#F4ECD7",
                border: `1px solid ${GOLD}66`,
                borderRadius: 14,
                padding: "10px 12px",
                fontSize: 12.5,
                lineHeight: 1.5,
                fontFamily: "var(--font-dm-sans,'DM Sans',sans-serif)",
                fontWeight: 500,
                boxShadow: `0 10px 28px rgba(0,0,0,0.45), 0 0 18px ${GOLD_GLOW}`,
              }}
            >
              <span style={{ flex: 1 }}>{hintText}</span>
              {/* Disable-audio toggle */}
              <button
                type="button"
                aria-label={audioOn ? "Mute Ms. Bhavna's voice hints" : "Unmute Ms. Bhavna's voice hints"}
                title={audioOn ? "Mute voice hints" : "Unmute voice hints"}
                onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
                className="shrink-0 rounded-md transition-colors"
                style={{
                  padding: 3,
                  marginTop: -1,
                  color: audioOn ? GOLD : "rgba(244,236,215,0.45)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {audioOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      )}

      {/* ── Welcome panel (one-shot greeting on classroom entry) ─────── */}
      <AnimatePresence>
        {welcomeOpen && (
          <BhavnaWelcomePanel
            profile={profile}
            onClose={() => setWelcomeOpen(false)}
            onOpenChat={() => { setWelcomeOpen(false); setChatOpen(true); }}
          />
        )}
      </AnimatePresence>

      {/* ── Chat panel ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {chatOpen && (
          <TeacherChat
            profile={profile}
            chapterTitle={chapterTitle}
            onClose={() => setChatOpen(false)}
            onSpeakingChange={setSpeaking}
            onOpenLecture={() => setLectureOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* ── Lecture panel (full overlay, opens on top of chat) ──────── */}
      <AnimatePresence>
        {lectureOpen && (
          <LecturePanel
            profile={profile}
            chapterTitle={chapterTitle}
            onClose={() => setLectureOpen(false)}
            onSpeakingChange={setSpeaking}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default TeacherCharacter;

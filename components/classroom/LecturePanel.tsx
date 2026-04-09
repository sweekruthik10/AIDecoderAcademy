"use client";

// LecturePanel — Ms. Bhavna's guided lesson overlay.
// Layout mirrors the validator's TeacherDialogue: portrait bottom-left,
// dialogue box bottom-right, Bhavna's warm navy/gold/violet palette.
//
// Phases:  topic → loading → concept (with doubt Q&A) → summary
// Voice:   fuzzy advance phrases + tap-to-speak mic on concept phase
// Safety:  confirm-close dialog when mid-lecture (concept phase)

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, Mic, Square, Volume2, VolumeX, MessageSquare } from "lucide-react";
import { useTeacherVoice } from "./useTeacherVoice";
import ReactMarkdown from "react-markdown";
import type { Profile } from "@/types";

// Compact markdown styling for Bhavna's doubt replies — renders ## / ** / ```
// as real formatting instead of dumping raw symbols into the lesson panel.
const LP_MD_CSS = `
.lp-md > :first-child { margin-top: 0; }
.lp-md > :last-child  { margin-bottom: 0; }
.lp-md p              { margin: 0 0 6px; }
.lp-md ul, .lp-md ol  { margin: 0 0 6px; padding-left: 18px; }
.lp-md li             { margin: 2px 0; }
.lp-md h1, .lp-md h2, .lp-md h3 { font-weight: 700; margin: 8px 0 4px; line-height: 1.3; font-family: inherit; letter-spacing: normal; }
.lp-md h1 { font-size: 14px; }
.lp-md h2 { font-size: 13.5px; }
.lp-md h3 { font-size: 13px; }
.lp-md strong { font-weight: 800; }
.lp-md code   { background: rgba(255,255,255,0.12); border-radius: 4px; padding: 1px 4px; font-size: 11.5px; }
.lp-md pre    { background: rgba(0,0,0,0.4); border-radius: 8px; padding: 8px 10px; overflow-x: auto; margin: 0 0 6px; }
.lp-md pre code { background: transparent; padding: 0; }
`;

// Bullets sometimes arrive as a U+2212 minus / en-dash — normalise to "- ".
const normalizeMd = (s: string) => s.replace(/^[−–]\s/gm, "- ");

// ── Palette ──────────────────────────────────────────────────────────────────
const GOLD        = "#E0B14C";
const GOLD_GLOW   = "rgba(224,177,76,0.45)";
const VIOLET      = "#9D6BFF";
const VIOLET_DEEP = "#5B2BCC";
const TEXT_HI     = "#F4ECD7";
const TEXT_MID    = "rgba(244,236,215,0.78)";
const TEXT_LO     = "rgba(244,236,215,0.50)";

// ── Fuzzy voice advance ───────────────────────────────────────────────────────
// Much more lenient than exact-match: "alright next", "ok continue", "sure" etc.
function isAdvancePhrase(norm: string): boolean {
  const EXACT = [
    "next","continue","go on","carry on","keep going","next please","move on",
    "i'm ready","im ready","ready","got it","understood","yes","yeah","yep",
    "alright","ok","okay","sure","let's go","lets go","go ahead",
  ];
  if (EXACT.includes(norm)) return true;
  const ADVANCE_WORDS = ["next", "continue", "go on", "carry on", "move on", "keep going"];
  return ADVANCE_WORDS.some(w => {
    const idx = norm.indexOf(w);
    if (idx === -1) return false;
    const before = idx === 0 || /\W/.test(norm[idx - 1]);
    const after  = idx + w.length >= norm.length || /\W/.test(norm[idx + w.length]);
    return before && after;
  });
}

// ── Types ────────────────────────────────────────────────────────────────────
interface LessonConcept { title: string; explanation: string; example?: string }
type Phase = "topic" | "loading" | "concept" | "summary";

interface Props {
  profile:           Profile | null;
  chapterTitle?:     string;
  onClose:           () => void;
  onSpeakingChange?: (s: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function LecturePanel({ profile: _profile, chapterTitle, onClose, onSpeakingChange }: Props) {
  const [phase,         setPhase]         = useState<Phase>("topic");
  const [customTopic,   setCustomTopic]   = useState("");
  const [activeTopic,   setActiveTopic]   = useState(chapterTitle ?? "");
  const [outline,       setOutline]       = useState<string[]>([]);
  const [conceptIdx,    setConceptIdx]    = useState(0);
  const [concept,       setConcept]       = useState<LessonConcept | null>(null);
  const [summary,       setSummary]       = useState("");
  const [doubt,         setDoubt]         = useState("");
  const [doubtReply,    setDoubtReply]    = useState("");
  const [doubtStreaming, setDoubtStreaming] = useState(false);
  const [confirmClose,  setConfirmClose]  = useState(false);
  const [simplifying,   setSimplifying]   = useState(false);
  const [exampling,     setExampling]     = useState(false);

  const conceptCache  = useRef<Map<number, LessonConcept>>(new Map());
  const doubtAbortRef = useRef<AbortController | null>(null);
  const doubtGenRef   = useRef(0);
  const conceptIdxRef = useRef(0);
  const outlineRef    = useRef<string[]>([]);
  const activeTopicRef = useRef(chapterTitle ?? "");
  const scrollRef     = useRef<HTMLDivElement>(null);

  useEffect(() => { conceptIdxRef.current = conceptIdx; }, [conceptIdx]);
  useEffect(() => { outlineRef.current = outline; }, [outline]);
  useEffect(() => { activeTopicRef.current = activeTopic; }, [activeTopic]);

  // ── Voice ──────────────────────────────────────────────────────────────
  const handleTranscript = useCallback((t: string) => {
    const norm = t.trim().toLowerCase().replace(/[.!?]+$/, "");
    if (phase === "concept" && isAdvancePhrase(norm)) {
      nextConceptRef.current();
      return;
    }
    // Treat as a doubt question
    setDoubt(t);
    sendDoubtRef.current(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const voice = useTeacherVoice({
    onTranscript: handleTranscript,
    onInterrupt: () => {
      doubtAbortRef.current?.abort();
      setDoubtStreaming(false);
    },
  });

  useEffect(() => {
    onSpeakingChange?.(voice.voiceState === "speaking");
  }, [voice.voiceState, onSpeakingChange]);

  // Cleanup voice on unmount
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  useEffect(() => () => voiceRef.current.cleanup(), []);

  // Speak the opening prompt on mount — the lesson should greet aloud as well
  // as on screen (the topic phase had text only; concepts already speak).
  useEffect(() => {
    const prompt = chapterTitle
      ? `Ready to learn about ${chapterTitle}? Or we can study something different.`
      : "What would you like to learn today?";
    void voiceRef.current.speak(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll on content changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [concept, doubtReply]);

  // ── Lesson API ─────────────────────────────────────────────────────────
  const fetchConcept = useCallback(async (idx: number, ol: string[], topicStr: string): Promise<LessonConcept | null> => {
    if (conceptCache.current.has(idx)) return conceptCache.current.get(idx)!;
    try {
      const r = await fetch("/api/classroom/lesson", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ mode: "concept", chapterTitle: topicStr, outline: ol, index: idx }),
      });
      if (!r.ok) return null;
      const c = await r.json() as LessonConcept;
      conceptCache.current.set(idx, c);
      return c;
    } catch { return null; }
  }, []);

  const speakConcept = useCallback((c: LessonConcept) => {
    void voice.speak(
      `${c.title}. ${c.explanation}${c.example ? `. For example, ${c.example}` : ""}. Any questions, or shall we continue?`
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startLesson = useCallback(async (topicStr: string) => {
    setActiveTopic(topicStr); activeTopicRef.current = topicStr;
    setPhase("loading");
    conceptCache.current.clear();
    try {
      const r = await fetch("/api/classroom/lesson", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ mode: "outline", chapterTitle: topicStr }),
      });
      if (!r.ok) throw new Error("outline failed");
      const { outline: ol } = await r.json() as { outline: string[] };
      if (!Array.isArray(ol) || ol.length === 0) throw new Error("empty outline");
      setOutline(ol); outlineRef.current = ol;
      const first = await fetchConcept(0, ol, topicStr);
      if (!first) throw new Error("first concept failed");
      setConceptIdx(0); conceptIdxRef.current = 0;
      setConcept(first);
      setDoubt(""); setDoubtReply("");
      setPhase("concept");
      speakConcept(first);
      // Prefetch second
      void fetchConcept(1, ol, topicStr);
    } catch {
      setPhase("topic");
    }
  }, [fetchConcept, speakConcept]);

  const nextConcept = useCallback(async () => {
    const ol    = outlineRef.current;
    const next  = conceptIdxRef.current + 1;
    if (next < ol.length) {
      setPhase("loading");
      const c = await fetchConcept(next, ol, activeTopicRef.current);
      if (!c) { setPhase("concept"); return; }
      setConceptIdx(next); conceptIdxRef.current = next;
      setConcept(c);
      setDoubt(""); setDoubtReply("");
      setPhase("concept");
      speakConcept(c);
      void fetchConcept(next + 1, ol, activeTopicRef.current);
    } else {
      setPhase("loading");
      let rev = "Great work! You've covered all the key concepts.";
      try {
        const r = await fetch("/api/classroom/lesson", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ mode: "summary", chapterTitle: activeTopicRef.current, outline: ol }),
        });
        if (r.ok) rev = (await r.json() as { revisionSummary: string }).revisionSummary;
      } catch { /* keep fallback */ }
      setSummary(rev);
      setPhase("summary");
      void voice.speak(`Quick revision. ${rev}. Lesson complete!`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchConcept, speakConcept]);

  const nextConceptRef = useRef(nextConcept);
  nextConceptRef.current = nextConcept;

  // ── Doubt chat ─────────────────────────────────────────────────────────
  const sendDoubt = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || doubtStreaming) return;
    setDoubt("");
    setDoubtStreaming(true);
    setDoubtReply("…");
    const myGen = ++doubtGenRef.current;
    const ctrl  = new AbortController();
    doubtAbortRef.current = ctrl;
    const conceptContext = concept ? `${concept.title}: ${concept.explanation}` : undefined;
    try {
      const res = await fetch("/api/classroom/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  ctrl.signal,
        body: JSON.stringify({
          message:        t,
          chapterTitle:   activeTopicRef.current || "General Study",
          history:        [],
          isVoiceMode:    false,
          conceptContext,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Chat ${res.status}`);
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", full = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (doubtGenRef.current !== myGen) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const p = line.slice(6).trim();
          if (p === "[DONE]") continue;
          try {
            const j = JSON.parse(p);
            if (j.content) { full += j.content; setDoubtReply(full); }
          } catch { /* ignore malformed frame */ }
        }
      }
      if (doubtGenRef.current !== myGen) return;
      setDoubtReply(full);
      if (full.trim()) void voice.speak(full);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      if (doubtGenRef.current !== myGen) return;
      setDoubtReply("(Couldn't reach Ms. Bhavna — please try again.)");
    } finally {
      if (doubtGenRef.current === myGen) setDoubtStreaming(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept, doubtStreaming]);

  const sendDoubtRef = useRef(sendDoubt);
  sendDoubtRef.current = sendDoubt;

  // ── Inline helpers ─────────────────────────────────────────────────────
  const requestSimpler = useCallback(() => {
    if (!concept || simplifying || doubtStreaming) return;
    setSimplifying(true);
    sendDoubt(`Can you explain "${concept.title}" in simpler terms?`)
      .finally(() => setSimplifying(false));
  }, [concept, simplifying, doubtStreaming, sendDoubt]);

  const requestExample = useCallback(() => {
    if (!concept || exampling || doubtStreaming) return;
    setExampling(true);
    sendDoubt(`Can you give me another example of "${concept.title}"?`)
      .finally(() => setExampling(false));
  }, [concept, exampling, doubtStreaming, sendDoubt]);

  // ── Close ──────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (phase === "concept") { setConfirmClose(true); return; }
    voice.cleanup();
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, onClose]);

  const confirmAndClose = useCallback(() => {
    setConfirmClose(false);
    voice.cleanup();
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // Reset back to the topic picker so the student can take another lesson
  // without leaving the panel ("Learn another topic" on the summary screen).
  const startNewTopic = useCallback(() => {
    doubtAbortRef.current?.abort();
    conceptCache.current.clear();
    setConcept(null);
    setOutline([]);        outlineRef.current    = [];
    setConceptIdx(0);      conceptIdxRef.current = 0;
    setSummary("");
    setDoubt(""); setDoubtReply(""); setCustomTopic("");
    setPhase("topic");
  }, []);

  // Keyboard shortcuts: Esc = close/confirm, N = next concept
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") handleClose();
      if ((e.key === "n" || e.key === "N") && phase === "concept" && !doubtStreaming) {
        void nextConcept();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose, phase, doubtStreaming, nextConcept]);

  // ── Derived ────────────────────────────────────────────────────────────
  const effectiveTopic  = customTopic.trim() || chapterTitle || "AI & Technology";
  const isLast          = conceptIdx >= outline.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        key="lecture-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[60] pointer-events-auto"
        style={{ background: "linear-gradient(to top, rgba(10,18,48,0.88), rgba(0,0,0,0.45) 40%)" }}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        {/* Bhavna portrait — bottom-left, mirrors validator layout */}
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

        {/* Dialogue box */}
        <motion.div
          key="lecture-box"
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
        >
          {/* Name plate + progress + controls row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Name plate */}
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
                Ms. Bhavna · Lesson
              </span>
            </div>

            {/* Progress dots + counter */}
            {phase === "concept" && outline.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GOLD}44` }}>
                <div className="flex gap-0.5 items-center">
                  {outline.map((_, i) => (
                    <div key={i} className="rounded-full transition-all" style={{
                      width:  i === conceptIdx ? 8 : 5,
                      height: i === conceptIdx ? 8 : 5,
                      background: i < conceptIdx ? GOLD : i === conceptIdx ? GOLD : "rgba(255,255,255,0.2)",
                      boxShadow:  i === conceptIdx ? `0 0 6px ${GOLD}` : "none",
                      opacity:    i > conceptIdx ? 0.4 : 1,
                    }} />
                  ))}
                </div>
                <span style={{ color: TEXT_MID, fontSize: 11, fontWeight: 600 }}>
                  {conceptIdx + 1} / {outline.length}
                </span>
              </div>
            )}

            {/* Mute + close pushed to right */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={voice.toggleMute}
                title={voice.muted ? "Unmute Bhavna" : "Mute Bhavna"}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${voice.muted ? GOLD : "rgba(255,255,255,0.12)"}` }}
              >
                {voice.muted ? <VolumeX size={12} color={TEXT_HI} /> : <Volume2 size={12} color={TEXT_HI} />}
              </button>
              <button
                onClick={handleClose}
                aria-label="Close lesson"
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.04)", color: TEXT_MID }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Main dialogue box */}
          <div
            ref={scrollRef}
            className="rounded-2xl px-5 py-4 overflow-y-auto"
            style={{
              background: `
                radial-gradient(120% 80% at 0% 0%, ${VIOLET_DEEP}22 0%, transparent 60%),
                radial-gradient(120% 80% at 100% 100%, ${GOLD}1a 0%, transparent 55%),
                rgba(8,8,15,0.97)
              `,
              border:    `1px solid ${GOLD}55`,
              boxShadow: `0 1px 0 ${TEXT_HI}1a inset, 0 0 40px rgba(0,0,0,0.5), 0 0 36px -10px ${GOLD_GLOW}`,
              maxHeight: "55vh",
              scrollbarWidth: "thin",
            }}
          >
            {/* Phase: topic confirmation */}
            {phase === "topic" && (
              <div className="space-y-4 py-1">
                <p style={{ color: TEXT_HI, fontSize: 14, lineHeight: 1.65 }}>
                  {chapterTitle
                    ? <>Ready to learn about <strong style={{ color: GOLD }}>&ldquo;{chapterTitle}&rdquo;</strong>? Or study something different?</>
                    : <>What would you like to learn today?</>}
                </p>
                <div>
                  <p style={{ color: TEXT_LO, fontSize: 12, marginBottom: 6 }}>
                    {chapterTitle ? "Or type a different topic:" : "Type your topic:"}
                  </p>
                  <input
                    value={customTopic}
                    onChange={e => setCustomTopic(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void startLesson(effectiveTopic); }}
                    placeholder={chapterTitle ?? "e.g. Photosynthesis, World War 2…"}
                    className="w-full bg-transparent outline-none text-[13px] px-3 py-2 rounded-lg"
                    style={{ border: `1px solid ${GOLD}55`, color: TEXT_HI, background: "rgba(255,255,255,0.04)" }}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => void startLesson(effectiveTopic)}
                    className="px-4 py-2 rounded-full text-[12px] font-bold"
                    style={{
                      background: `linear-gradient(135deg, ${GOLD}, ${VIOLET})`,
                      color: TEXT_HI,
                      boxShadow: `0 4px 14px ${GOLD_GLOW}`,
                    }}
                  >
                    Start lesson{customTopic.trim() ? ` on "${customTopic.trim()}"` : chapterTitle ? ` on "${chapterTitle}"` : ""}
                  </button>
                  <button
                    onClick={() => { voice.cleanup(); onClose(); }}
                    className="px-4 py-2 rounded-full text-[12px] font-semibold"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: TEXT_MID }}
                  >
                    Back to chat
                  </button>
                </div>
              </div>
            )}

            {/* Phase: loading */}
            {phase === "loading" && (
              <div className="flex flex-col gap-3 py-4">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full" style={{
                      background: GOLD,
                      animation:  `lpulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
                <p style={{ color: TEXT_MID, fontSize: 13 }}>Preparing your lesson…</p>
              </div>
            )}

            {/* Phase: concept */}
            {phase === "concept" && concept && (
              <div className="space-y-4">
                {/* Concept content */}
                <div>
                  <p style={{
                    color: GOLD, fontSize: 10,
                    fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)",
                    fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4,
                  }}>
                    CONCEPT
                  </p>
                  <p style={{
                    color: TEXT_HI, fontSize: 15, fontWeight: 700, marginBottom: 8,
                    fontFamily: "var(--font-syne,'Syne',sans-serif)",
                  }}>
                    {concept.title}
                  </p>
                  <div className="lp-md" style={{ color: TEXT_HI, fontSize: 13.5, lineHeight: 1.65 }}>
                    <ReactMarkdown>{normalizeMd(concept.explanation)}</ReactMarkdown>
                  </div>
                  {concept.example && (
                    <div className="mt-3 px-3 py-2 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.04)", borderLeft: `3px solid ${GOLD}` }}>
                      <p style={{ color: TEXT_LO, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Example</p>
                      <div className="lp-md" style={{ color: TEXT_HI, fontSize: 13, lineHeight: 1.55 }}>
                        <ReactMarkdown>{normalizeMd(concept.example)}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>

                {/* Inline help buttons */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={requestSimpler}
                    disabled={simplifying || doubtStreaming}
                    className="px-3 py-1 rounded-full text-[11px] font-semibold transition-colors"
                    style={{
                      background: "rgba(255,255,255,0.06)", border: `1px solid ${GOLD}44`,
                      color: TEXT_MID, opacity: (simplifying || doubtStreaming) ? 0.5 : 1,
                    }}
                  >
                    {simplifying ? "…" : "I didn't get this"}
                  </button>
                  <button
                    onClick={requestExample}
                    disabled={exampling || doubtStreaming}
                    className="px-3 py-1 rounded-full text-[11px] font-semibold transition-colors"
                    style={{
                      background: "rgba(255,255,255,0.06)", border: `1px solid ${GOLD}44`,
                      color: TEXT_MID, opacity: (exampling || doubtStreaming) ? 0.5 : 1,
                    }}
                  >
                    {exampling ? "…" : "Give another example"}
                  </button>
                  <button
                    onClick={handleClose}
                    className="px-3 py-1 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1"
                    style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                      color: TEXT_MID,
                    }}
                  >
                    <MessageSquare size={11} /> Back to chat
                  </button>
                </div>

                {/* Doubt reply bubble */}
                {doubtReply && (
                  <div className="px-3 py-2.5 rounded-xl"
                    style={{ background: `${TEXT_HI}0a`, border: `1px solid ${TEXT_HI}18` }}>
                    <div className="lp-md" style={{ color: TEXT_MID, fontSize: 13, lineHeight: 1.6 }}>
                      <ReactMarkdown>{normalizeMd(doubtReply)}</ReactMarkdown>
                      {doubtStreaming && (
                        <span className="inline-block w-1 h-3 ml-0.5 align-middle"
                          style={{ background: GOLD, animation: "lblink 1s steps(2) infinite" }} />
                      )}
                    </div>
                  </div>
                )}

                {/* Doubt input */}
                <div className="flex gap-2 items-center">
                  <input
                    value={doubt}
                    onChange={e => setDoubt(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && doubt.trim() && !doubtStreaming) void sendDoubt(doubt);
                    }}
                    placeholder="Ask a doubt about this concept…"
                    disabled={doubtStreaming}
                    className="flex-1 bg-transparent outline-none text-[12.5px] px-3 py-1.5 rounded-lg"
                    style={{ border: `1px solid ${GOLD}33`, color: TEXT_HI, background: "rgba(255,255,255,0.03)" }}
                  />
                  <button
                    onClick={() => void sendDoubt(doubt)}
                    disabled={doubtStreaming || !doubt.trim()}
                    className="px-3 py-1.5 rounded-full text-[11px] font-semibold flex-shrink-0"
                    style={{
                      background: doubt.trim() && !doubtStreaming ? `linear-gradient(135deg, ${GOLD}, ${VIOLET})` : "rgba(255,255,255,0.06)",
                      color:   TEXT_HI,
                      opacity: (doubtStreaming || !doubt.trim()) ? 0.5 : 1,
                    }}
                  >
                    Ask
                  </button>
                </div>

                {/* Voice mic + Next row */}
                <div className="flex items-center gap-2 pt-1">
                  {voice.voiceOK && (
                    <button
                      onClick={voice.toggleTap}
                      aria-label={voice.voiceState !== "idle" ? "Stop" : "Speak your question"}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
                      style={{
                        background: voice.voiceState !== "idle"
                          ? `linear-gradient(135deg, ${GOLD}, ${VIOLET})`
                          : "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color:  TEXT_HI,
                      }}
                    >
                      {voice.voiceState !== "idle" ? <Square size={11} /> : <Mic size={11} />}
                      {voice.voiceState === "idle"       ? "Speak" :
                       voice.voiceState === "listening"  ? "Listening…" :
                       voice.voiceState === "processing" ? "Processing…" :
                                                           "Speaking…"}
                    </button>
                  )}
                  <button
                    onClick={() => void nextConcept()}
                    disabled={doubtStreaming}
                    className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold"
                    style={{
                      background: `linear-gradient(135deg, ${GOLD}, ${VIOLET})`,
                      color:      TEXT_HI,
                      opacity:    doubtStreaming ? 0.5 : 1,
                      boxShadow:  `0 0 12px ${GOLD_GLOW}`,
                    }}
                  >
                    {isLast ? "Finish" : "Next"} <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* Phase: summary */}
            {phase === "summary" && (
              <div className="space-y-4 py-1">
                <p style={{
                  color: GOLD, fontSize: 10,
                  fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)",
                  fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                }}>
                  🎓 LESSON COMPLETE
                </p>
                <div className="lp-md" style={{ color: TEXT_HI, fontSize: 13.5, lineHeight: 1.65 }}>
                  <ReactMarkdown>{normalizeMd(summary)}</ReactMarkdown>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={startNewTopic}
                    className="px-4 py-2 rounded-full text-[12px] font-bold flex items-center gap-1.5"
                    style={{
                      background: `linear-gradient(135deg, ${GOLD}, ${VIOLET})`,
                      color: TEXT_HI, boxShadow: `0 4px 14px ${GOLD_GLOW}`,
                    }}
                  >
                    <ArrowRight size={13} /> Learn another topic
                  </button>
                  <button
                    onClick={() => { voice.cleanup(); onClose(); }}
                    className="px-4 py-2 rounded-full text-[12px] font-semibold flex items-center gap-1.5"
                    style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: TEXT_MID,
                    }}
                  >
                    <MessageSquare size={13} /> Back to chat
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Confirm-close dialog — slides in below the box */}
          <AnimatePresence>
            {confirmClose && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: "rgba(8,8,15,0.97)", border: `1px solid ${GOLD}55` }}
              >
                <span style={{ color: TEXT_MID, fontSize: 12, flex: 1 }}>
                  Leave the lesson? Your progress this session will be lost.
                </span>
                <button
                  onClick={() => setConfirmClose(false)}
                  className="px-3 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: TEXT_MID }}
                >
                  Stay
                </button>
                <button
                  onClick={confirmAndClose}
                  className="px-3 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: `linear-gradient(135deg, ${VIOLET_DEEP}, ${GOLD})`, color: TEXT_HI }}
                >
                  Leave
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <style>{`
          ${LP_MD_CSS}
          @keyframes lpulse { 0%, 100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
          @keyframes lblink  { from { opacity: 1; } to { opacity: 0; } }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
}

export default LecturePanel;

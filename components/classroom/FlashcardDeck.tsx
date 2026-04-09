"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X, RotateCcw } from "lucide-react";

export interface FlashCard {
  question: string;
  answer: string;
}

export function parseFlashcards(markdown: string): FlashCard[] {
  const cards: FlashCard[] = [];
  let currentQ = "";
  let currentA = "";

  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    const qMatch = trimmed.match(/^\*\*Q:\*\*\s*(.+)/);
    const aMatch = trimmed.match(/^\*\*A:\*\*\s*(.+)/);

    if (qMatch) {
      if (currentQ && currentA) cards.push({ question: currentQ, answer: currentA });
      currentQ = qMatch[1].trim();
      currentA = "";
    } else if (aMatch) {
      currentA = aMatch[1].trim();
    } else if (currentA && trimmed && !trimmed.startsWith("**")) {
      currentA += " " + trimmed;
    }
  }

  if (currentQ && currentA) cards.push({ question: currentQ, answer: currentA });
  return cards;
}

interface Props {
  cards: FlashCard[];
  rawContent: string;
  chapterTitle: string;
  onClose: () => void;
  onSave: (content: string) => void;
}

export function FlashcardDeck({ cards, rawContent, chapterTitle, onClose, onSave }: Props) {
  const [idx,      setIdx]      = useState(0);
  const [isFlipped, setFlipped] = useState(false);
  const [dir,      setDir]      = useState(1);
  const [known,    setKnown]    = useState<Set<number>>(new Set());
  const [unknown,  setUnknown]  = useState<Set<number>>(new Set());
  const [phase,    setPhase]    = useState<"study" | "end" | "retry">("study");
  const [retryQ,   setRetryQ]   = useState<number[]>([]);
  const [retryIdx, setRetryIdx] = useState(0);
  const [saved,    setSaved]    = useState(false);

  const activeCards = phase === "retry" ? retryQ.map(i => cards[i]) : cards;
  const activeIdx   = phase === "retry" ? retryIdx : idx;
  const currentCard = activeCards[activeIdx];
  const total       = activeCards.length;

  const advance = useCallback(() => {
    setDir(1);
    setFlipped(false);
    const cur = phase === "retry" ? retryIdx : idx;
    const len = phase === "retry" ? retryQ.length : cards.length;
    if (cur + 1 < len) {
      if (phase === "retry") setRetryIdx(i => i + 1);
      else setIdx(i => i + 1);
    } else {
      setPhase("end");
    }
  }, [phase, idx, retryIdx, retryQ.length, cards.length]);

  const go = useCallback((d: -1 | 1) => {
    if (d === 1) { advance(); return; }
    const cur = phase === "retry" ? retryIdx : idx;
    if (cur > 0) {
      setDir(-1);
      setFlipped(false);
      if (phase === "retry") setRetryIdx(i => i - 1);
      else setIdx(i => i - 1);
    }
  }, [phase, idx, retryIdx, advance]);

  const mark = useCallback((asKnown: boolean) => {
    const cardIdx = phase === "retry" ? retryQ[retryIdx] : idx;
    if (asKnown) {
      setKnown(p => new Set([...p, cardIdx]));
      setUnknown(p => { const s = new Set(p); s.delete(cardIdx); return s; });
    } else {
      setUnknown(p => new Set([...p, cardIdx]));
      setKnown(p => { const s = new Set(p); s.delete(cardIdx); return s; });
    }
    advance();
  }, [phase, retryQ, retryIdx, idx, advance]);

  useEffect(() => {
    if (phase === "end") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped(f => !f); }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, phase]);

  const startRetry = () => {
    setRetryQ([...unknown]);
    setRetryIdx(0);
    setFlipped(false);
    setPhase("retry");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ zIndex: 60, background: "rgba(5,8,25,0.93)", backdropFilter: "blur(14px)" }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
        style={{ color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="absolute top-4 left-0 right-0 flex flex-col items-center gap-0.5 pointer-events-none">
        <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(124,58,237,0.75)" }}>
          {chapterTitle}
        </p>
        <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.65)", fontFamily: "'DM Sans',sans-serif" }}>
          {phase === "retry" ? "Retry Mode" : "Flashcard Study"}
        </p>
      </div>

      {/* ── Study / Retry phase ── */}
      {phase !== "end" && currentCard && (
        <div className="flex flex-col items-center" style={{ width: "min(500px,86vw)" }}>

          {/* Progress */}
          <div className="flex items-center justify-between w-full mb-2">
            <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
              {activeIdx + 1} / {total}
            </span>
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              {known.size} ✓ · {unknown.size} ↺
            </span>
          </div>
          <div className="w-full rounded-full mb-5" style={{ height: 3, background: "rgba(255,255,255,0.07)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg,#7C3AED,#2563eb)" }}
              animate={{ width: `${(activeIdx / total) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Card */}
          <div
            style={{ perspective: "1200px", width: "100%", height: "min(280px,42vh)", cursor: "pointer" }}
            onClick={() => setFlipped(f => !f)}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${phase}-${activeIdx}`}
                initial={{ opacity: 0, x: dir * 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -50 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{ width: "100%", height: "100%" }}
              >
                <motion.div
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    width: "100%", height: "100%",
                    transformStyle: "preserve-3d",
                    position: "relative",
                  }}
                >
                  {/* Front — Question */}
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: 20,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden" as React.CSSProperties["WebkitBackfaceVisibility"],
                    background: "rgba(255,255,255,0.97)",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: "28px 32px", textAlign: "center",
                  }}>
                    <div className="rounded-full mb-5" style={{ width: 64, height: 3, background: "linear-gradient(90deg,#7C3AED,#2563eb)" }} />
                    <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 17, color: "#0f1c4d", lineHeight: 1.55 }}>
                      {currentCard.question}
                    </p>
                    <p className="mt-4 text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(15,28,77,0.25)" }}>
                      tap to reveal answer
                    </p>
                  </div>

                  {/* Back — Answer */}
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: 20,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden" as React.CSSProperties["WebkitBackfaceVisibility"],
                    transform: "rotateY(180deg)",
                    background: "linear-gradient(160deg,#1a0533 0%,#0c1a5e 100%)",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,58,237,0.25), 0 0 36px rgba(124,58,237,0.12)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: "28px 32px", textAlign: "center",
                  }}>
                    <p className="mb-3 text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(124,58,237,0.75)" }}>
                      Answer
                    </p>
                    <div className="rounded-full mb-4" style={{ width: 64, height: 3, background: "linear-gradient(90deg,#7C3AED,#2563eb)" }} />
                    <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 17, color: "rgba(255,255,255,0.92)", lineHeight: 1.55 }}>
                      {currentCard.answer}
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Mark buttons — appear after flip */}
          <div className="flex items-center justify-center mt-4" style={{ height: 48 }}>
            <AnimatePresence mode="wait">
              {isFlipped ? (
                <motion.div key="mark"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.18 }}
                  className="flex gap-3"
                >
                  <button
                    onClick={e => { e.stopPropagation(); mark(false); }}
                    className="px-5 py-2 rounded-xl font-semibold text-sm hover:scale-105 transition-transform"
                    style={{ background: "rgba(239,68,68,0.13)", border: "1px solid rgba(239,68,68,0.3)", color: "rgba(252,165,165,0.9)", fontFamily: "'DM Sans',sans-serif" }}
                  >
                    ↺ Still learning
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); mark(true); }}
                    className="px-5 py-2 rounded-xl font-semibold text-sm hover:scale-105 transition-transform"
                    style={{ background: "rgba(34,197,94,0.13)", border: "1px solid rgba(34,197,94,0.3)", color: "rgba(134,239,172,0.9)", fontFamily: "'DM Sans',sans-serif" }}
                  >
                    ✓ Got it
                  </button>
                </motion.div>
              ) : (
                <motion.p key="hint"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  flip to mark · ← → to navigate
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Nav arrows */}
          <div className="flex items-center gap-5 mt-3">
            <button
              onClick={() => go(-1)}
              disabled={activeIdx === 0}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-20"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => go(1)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── End phase ── */}
      {phase === "end" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.28 }}
          className="flex flex-col items-center gap-5 text-center"
          style={{ width: "min(380px,80vw)" }}
        >
          <div style={{ fontSize: 52 }}>
            {known.size >= cards.length * 0.8 ? "🎉" : known.size >= cards.length * 0.5 ? "💪" : "📚"}
          </div>
          <div>
            <p style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: 40, color: "#fff", lineHeight: 1 }}>
              {known.size}
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 24 }}> / {cards.length}</span>
            </p>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.45)", fontFamily: "'DM Sans',sans-serif" }}>
              cards mastered
            </p>
          </div>

          <div className="w-full rounded-full overflow-hidden" style={{ height: 8, background: "rgba(255,255,255,0.07)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg,#7C3AED,#22c55e)" }}
              initial={{ width: 0 }}
              animate={{ width: `${(known.size / cards.length) * 100}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </div>

          <div className="flex gap-3 flex-wrap justify-center">
            {unknown.size > 0 && (
              <button
                onClick={startRetry}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm hover:scale-105 transition-transform"
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)", color: "rgba(252,165,165,0.9)", fontFamily: "'DM Sans',sans-serif" }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry {unknown.size} unknown
              </button>
            )}
            {!saved ? (
              <button
                onClick={() => { onSave(rawContent); setSaved(true); }}
                className="px-4 py-2.5 rounded-xl font-semibold text-sm hover:scale-105 transition-transform"
                style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.45),rgba(37,99,235,0.45))", border: "1px solid rgba(124,58,237,0.45)", color: "rgba(255,255,255,0.9)", fontFamily: "'DM Sans',sans-serif" }}
              >
                💾 Save Deck
              </button>
            ) : (
              <div
                className="px-4 py-2.5 rounded-xl text-sm"
                style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.28)", color: "rgba(134,239,172,0.9)", fontFamily: "'DM Sans',sans-serif" }}
              >
                ✓ Saved to library
              </div>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-semibold text-sm hover:scale-105 transition-transform"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)", fontFamily: "'DM Sans',sans-serif" }}
            >
              Close
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight, Shuffle, Check } from "lucide-react";

export interface FlashCard {
  question: string;
  answer: string;
  imagePrompt?: string;
  imageUrl?: string;
  imageError?: boolean;
}

export function parseFlashcards(markdown: string): FlashCard[] {
  const cards: FlashCard[] = [];
  let currentQ = "";
  let currentA = "";
  let currentImg = "";

  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    const qMatch = trimmed.match(/^\*\*Q:\*\*\s*(.+)/);
    const aMatch = trimmed.match(/^\*\*A:\*\*\s*(.+)/);
    const imgMatch = trimmed.match(/^\*\*IMG:\*\*\s*(.+)/);

    if (qMatch) {
      if (currentQ && currentA) cards.push({ question: currentQ, answer: currentA, imagePrompt: currentImg || undefined });
      currentQ = qMatch[1].trim();
      currentA = "";
      currentImg = "";
    } else if (aMatch) {
      currentA = aMatch[1].trim();
    } else if (imgMatch) {
      currentImg = imgMatch[1].trim();
    } else if (currentA && !currentImg && trimmed && !trimmed.startsWith("**")) {
      currentA += " " + trimmed;
    }
  }

  if (currentQ && currentA) cards.push({ question: currentQ, answer: currentA, imagePrompt: currentImg || undefined });
  return cards;
}

interface Props {
  cards: FlashCard[];
  rawContent: string;
  chapterTitle: string;
  isLoadingImages?: boolean;
  onClose: () => void;
  onSave: (content: string) => void;
  // kept for backward compatibility — no longer used in the FlashMaster grid view
  onRetryImages?: (indices: number[]) => void;
}

// FlashMaster palette
const C = {
  pageBg:      "#F2F6FA",
  headerBg:    "#FFFFFF",
  title:       "#1A9FE0", // bright sky blue
  subtitle:    "#F5A623", // orange
  pillBg:      "#FCE9CF",
  pillText:    "#E8821A",
  cardText:    "#1E2A52", // navy
  flipHint:    "#9AA3B2",
  cardBack:    "#1AA0E8", // solid blue back
  btnPrev:     "#1A9FE0",
  btnShuffle:  "#F5C518",
  btnNext:     "#F36C21",
  btnSave:     "#22A06B",
};

export function FlashcardDeck({ cards, rawContent, chapterTitle, isLoadingImages, onClose, onSave }: Props) {
  // display order — position → original card index (so Shuffle can reorder)
  const [order,   setOrder]   = useState<number[]>(() => cards.map((_, i) => i));
  const [flipped, setFlipped] = useState<boolean[]>(() => cards.map(() => false));
  const [current, setCurrent] = useState(0); // active position in the grid
  const [saved,   setSaved]   = useState(false);

  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const total = order.length;

  // keep state arrays in sync if the deck length changes
  useEffect(() => {
    setOrder(cards.map((_, i) => i));
    setFlipped(cards.map(() => false));
    setCurrent(0);
  }, [cards]);

  const scrollToCard = useCallback((pos: number) => {
    cardRefs.current[pos]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const go = useCallback((d: -1 | 1) => {
    setCurrent(c => {
      const next = Math.min(total - 1, Math.max(0, c + d));
      scrollToCard(next);
      return next;
    });
  }, [total, scrollToCard]);

  const toggleFlip = useCallback((pos: number) => {
    setCurrent(pos);
    setFlipped(f => f.map((v, i) => (i === pos ? !v : v)));
  }, []);

  const shuffle = useCallback(() => {
    setOrder(prev => {
      const a = [...prev];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });
    setFlipped(cards.map(() => false));
    setCurrent(0);
    scrollToCard(0);
  }, [cards, scrollToCard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleFlip(current); }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, toggleFlip, current, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: C.pageBg,
        display: "flex", flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <style>{`
        @keyframes fmShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>

      {/* ── Header bar ─────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, background: C.headerBg,
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        padding: "18px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
      }}>
        {/* Left: back + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 0 }}>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 15px", borderRadius: 999,
              background: "rgba(26,159,224,0.10)", border: "1px solid rgba(26,159,224,0.28)",
              color: C.title, fontWeight: 700, fontSize: 13.5, cursor: "pointer",
              flexShrink: 0, transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(26,159,224,0.18)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(26,159,224,0.10)")}
          >
            <ArrowLeft size={16} /> Back to Classroom
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 900, fontSize: 30,
              color: C.title, lineHeight: 1, letterSpacing: "-0.01em",
            }}>
              FlashMaster
            </h1>
            <p style={{
              color: C.subtitle, fontWeight: 700, fontSize: 14, marginTop: 3,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {chapterTitle}
            </p>
          </div>
        </div>

        {/* Right: pill + save */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {!saved ? (
            <button
              onClick={() => { onSave(rawContent); setSaved(true); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 999,
                background: C.btnSave, border: "none",
                color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                boxShadow: "0 4px 12px rgba(34,160,107,0.3)",
              }}
            >
              Save Deck
            </button>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 16px", borderRadius: 999,
              background: "rgba(34,160,107,0.12)", color: C.btnSave,
              fontWeight: 700, fontSize: 13.5,
            }}>
              <Check size={15} /> Saved
            </div>
          )}
          <div style={{
            padding: "8px 18px", borderRadius: 999,
            background: C.pillBg, color: C.pillText,
            fontWeight: 800, fontSize: 14, whiteSpace: "nowrap",
          }}>
            Card {current + 1} of {total}
          </div>
        </div>
      </div>

      {/* ── Card grid ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 28px 24px" }}>
        <div style={{
          maxWidth: 1180, margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 26,
        }}>
          {order.map((cardIdx, pos) => {
            const card = cards[cardIdx];
            const isFlipped = flipped[pos];
            const isActive = pos === current;
            return (
              <div
                key={cardIdx}
                ref={el => { cardRefs.current[pos] = el; }}
                onClick={() => toggleFlip(pos)}
                style={{ perspective: "1400px", height: 380, cursor: "pointer" }}
              >
                <motion.div
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  style={{ width: "100%", height: "100%", position: "relative", transformStyle: "preserve-3d" }}
                >
                  {/* Front — image + question */}
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: 22,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden" as React.CSSProperties["WebkitBackfaceVisibility"],
                    background: "#FFFFFF",
                    border: isActive ? `2px solid ${C.subtitle}` : "1px solid rgba(0,0,0,0.05)",
                    boxShadow: isActive
                      ? "0 14px 34px rgba(245,166,35,0.22), 0 4px 12px rgba(0,0,0,0.06)"
                      : "0 10px 28px rgba(30,42,82,0.08)",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    padding: "26px 22px 18px", overflow: "hidden",
                  }}>
                    {/* image */}
                    <div style={{
                      width: "100%", height: 140, borderRadius: 12, overflow: "hidden",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 18, flexShrink: 0,
                    }}>
                      {card.imageUrl ? (
                        <img src={card.imageUrl} alt={card.question}
                          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                      ) : (
                        <div style={{
                          width: "100%", height: "100%", borderRadius: 12,
                          background: isLoadingImages
                            ? "linear-gradient(90deg,#e8eef6 25%,#dbe4f0 50%,#e8eef6 75%)"
                            : "#eef3f9",
                          backgroundSize: "200% 100%",
                          animation: isLoadingImages ? "fmShimmer 1.5s infinite" : "none",
                        }} />
                      )}
                    </div>
                    {/* question */}
                    <p style={{
                      flex: 1, display: "flex", alignItems: "center", textAlign: "center",
                      color: C.cardText, fontWeight: 800, fontSize: 17.5, lineHeight: 1.35,
                    }}>
                      {card.question}
                    </p>
                    <p style={{
                      marginTop: 12, color: C.flipHint, fontSize: 11.5, fontWeight: 700,
                      letterSpacing: "0.14em", textTransform: "uppercase",
                    }}>
                      Click to flip
                    </p>
                  </div>

                  {/* Back — answer */}
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: 22,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden" as React.CSSProperties["WebkitBackfaceVisibility"],
                    transform: "rotateY(180deg)",
                    background: C.cardBack,
                    boxShadow: "0 14px 34px rgba(26,160,232,0.32)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "30px 28px", textAlign: "center",
                  }}>
                    <p style={{
                      color: "#fff", fontWeight: 800, fontSize: 19, lineHeight: 1.5,
                    }}>
                      {card.answer}
                    </p>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom controls ────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: "18px 28px 26px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
      }}>
        <button
          onClick={() => go(-1)}
          disabled={current === 0}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "13px 30px", borderRadius: 14, border: "none",
            background: C.btnPrev, color: "#fff", fontWeight: 800, fontSize: 15,
            cursor: current === 0 ? "default" : "pointer",
            opacity: current === 0 ? 0.45 : 1,
            boxShadow: "0 6px 16px rgba(26,159,224,0.3)",
          }}
        >
          <ChevronLeft size={18} /> Previous
        </button>
        <button
          onClick={shuffle}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "13px 30px", borderRadius: 14, border: "none",
            background: C.btnShuffle, color: "#3b2f00", fontWeight: 800, fontSize: 15,
            cursor: "pointer", boxShadow: "0 6px 16px rgba(245,197,24,0.32)",
          }}
        >
          <Shuffle size={17} /> Shuffle
        </button>
        <button
          onClick={() => go(1)}
          disabled={current === total - 1}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "13px 30px", borderRadius: 14, border: "none",
            background: C.btnNext, color: "#fff", fontWeight: 800, fontSize: 15,
            cursor: current === total - 1 ? "default" : "pointer",
            opacity: current === total - 1 ? 0.45 : 1,
            boxShadow: "0 6px 16px rgba(243,108,33,0.3)",
          }}
        >
          Next <ChevronRight size={18} />
        </button>
      </div>
    </motion.div>
  );
}

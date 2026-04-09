"use client";

import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Chapter } from "@/types";

interface Props {
  chapter:          Chapter;
  onSelectTest:     (type: "mcq" | "written") => void;
  onBack:           () => void;
  onEnterArena?:    () => void;
  onCorrectNotes?:  () => void;
}

// ── Lock medallion (same as arena / chapter map) ──────────────────────────────
function Lock({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center rounded-full flex-shrink-0"
      style={{ width: size, height: size,
        background: "linear-gradient(180deg,#0B1A2F,#050E1F)",
        border: "1.5px solid rgba(125,211,252,0.6)",
        boxShadow: "0 0 14px rgba(0,212,255,0.45), inset 0 0 8px rgba(0,212,255,0.15)" }}>
      <svg width={size * 0.44} height={size * 0.44} viewBox="0 0 24 24" fill="none">
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="#E8F4FF" strokeWidth="1.8"/>
        <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="#E8F4FF" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ── Hotspot zone — clickable card overlay ─────────────────────────────────────
function Hotspot({ onClick, color, label }: {
  onClick: () => void; color: string; label: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="absolute w-full h-full rounded-2xl flex items-end justify-start p-2"
      style={{ cursor: "pointer", background: "transparent" }}
      whileHover={{ background: `${color}18` }}
      transition={{ duration: 0.15 }}
    >
      {/* Hover glow ring */}
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        style={{ border: `2px solid ${color}`, boxShadow: `0 0 20px ${color}40` }}
      />
      {/* "Start" badge visible on hover */}
      <motion.span
        initial={{ opacity: 0, y: 4 }}
        whileHover={{ opacity: 1, y: 0 }}
        className="relative z-10 text-[10px] font-black px-2 py-1 rounded-lg"
        style={{ background: color, color: "#fff", boxShadow: `0 0 12px ${color}60` }}
      >
        Start →
      </motion.span>
    </motion.button>
  );
}

// ── Locked card overlay ───────────────────────────────────────────────────────
function LockedCard() {
  return (
    <div className="absolute inset-0 rounded-2xl flex items-center justify-center"
      style={{ backdropFilter: "blur(1px) saturate(85%)", background: "rgba(8,16,32,0.08)" }}>
      <Lock size={34} />
    </div>
  );
}

// ── Card zone helper — wraps a positioned card area ───────────────────────────
// All positions are % of the full-page image (1440×900 reference)
// Left MCQ column:  left 2.5%–27%, rows at 20% / 31.5% / 43% / 54.5% / 66%
// Right Board column: left 54%–79%, same row tops
// Each card height ~10%

const MCQ_CARDS = [
  { level: 1, locked: false, top: "24%",   color: "#2563eb" },
  { level: 2, locked: true,  top: "38%", color: "#2563eb" },
  { level: 3, locked: true,  top: "52%",   color: "#2563eb" },
  { level: 4, locked: true,  top: "65%", color: "#2563eb" },
  { level: 5, locked: true,  top: "79%",   color: "#2563eb" },
] as const;

const BOARD_CARDS = [
  { level: 1, locked: false, top: "24%",   color: "#7C3AED" },
  { level: 2, locked: true,  top: "38%", color: "#7C3AED" },
  { level: 3, locked: true,  top: "52%",   color: "#7C3AED" },
  { level: 4, locked: true,  top: "65%", color: "#7C3AED" },
  { level: 5, locked: true,  top: "79%",   color: "#7C3AED" },
] as const;

// ── Main component ────────────────────────────────────────────────────────────
export function ObjectivePage({ chapter, onSelectTest, onBack, onEnterArena, onCorrectNotes }: Props) {
  const router = useRouter();

  return (
    <div className="relative overflow-hidden select-none"
      style={{ height: "100dvh", fontFamily: "var(--font-dm-sans,'DM Sans',sans-serif)" }}>

      {/* Full-page objectives image stretched to fill */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={chapter.subject === "Mathematics"
          ? "/classroom/objectives/objectives_mathematics.png"
          : "/classroom/objectives/objectives_chemistry.png"}
        alt="Chapter Objectives"
        draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "fill", zIndex: 0 }}
      />

      {/* ── Back button ──────────────────────────────────────────────────────── */}
      <button
        onClick={onBack}
        className="absolute flex items-center gap-1.5 text-sm font-semibold transition-all px-3 py-1.5 rounded-xl hover:opacity-80"
        style={{ top: 16, left: 16, zIndex: 20,
          background: "rgba(255,255,255,0.88)", backdropFilter: "blur(12px)",
          color: "rgba(15,28,77,0.7)", border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 2px 12px rgba(15,28,77,0.08)" }}
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Chapters
      </button>

      {/* ── Interactive card zones ────────────────────────────────────────────── */}
      {/* Left MCQ column — left: 2.5%, width: 24.5% */}
      {MCQ_CARDS.map(card => (
        <div key={`mcq-${card.level}`}
          className="absolute"
          style={{ top: card.top, left: "3%", width: "22%", height: "10%", zIndex: 10 }}>
          {card.locked
            ? <LockedCard />
            : <Hotspot onClick={() => onSelectTest("mcq")} color={card.color} label="MCQ" />
          }
        </div>
      ))}

      {/* Right Board column — left: 54%, width: 24.5% */}
      {BOARD_CARDS.map(card => (
        <div key={`board-${card.level}`}
          className="absolute"
          style={{ top: card.top, left: "55%", width: "21%", height: "10%", zIndex: 10 }}>
          {card.locked
            ? <LockedCard />
            : <Hotspot onClick={() => onSelectTest("written")} color={card.color} label="Board" />
          }
        </div>
      ))}

      {/* "Enter Classroom" button — center circle */}
      <motion.button
        onClick={() => onEnterArena ? onEnterArena() : router.push("/dashboard/playground")}
        className="absolute rounded-2xl"
        style={{ top: "64%", left: "33%", width: "14%", height: "6%", zIndex: 10, cursor: "pointer" }}
        whileHover={{ background: "rgba(124,58,237,0.18)", boxShadow: "0 0 24px rgba(124,58,237,0.4)" }}
        transition={{ duration: 0.15 }}
      />

      {/* "Correct My Notes" button — below arena circle, centered between columns */}
      <motion.button
        onClick={() => onCorrectNotes?.()}
        className="absolute flex items-center justify-center gap-1.5 rounded-2xl text-[11px] font-black"
        style={{
          top: "73%", left: "29%", width: "20%", height: "5%", zIndex: 10,
          cursor: "pointer", color: "#fff",
          background: "linear-gradient(135deg, #06B6D4cc, #0891B2cc)",
          backdropFilter: "blur(8px)",
          border: "1.5px solid rgba(6,182,212,0.6)",
          boxShadow: "0 0 16px rgba(6,182,212,0.35)",
          letterSpacing: "0.01em",
        }}
        whileHover={{ boxShadow: "0 0 28px rgba(6,182,212,0.6)", scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.15 }}>
        ✏️ Correct My Notes
      </motion.button>
    </div>
  );
}

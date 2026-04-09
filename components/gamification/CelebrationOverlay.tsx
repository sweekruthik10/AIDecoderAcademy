"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

const CONFETTI_COUNT = 52;

const FALL_COLORS = [
  "#C8FF00",
  "#00D4FF",
  "#FF2D78",
  "#7C3AED",
  "#00FF94",
  "#FF6B2B",
  "#FFFFFF",
];

type Piece = {
  id: number;
  leftPct: number;
  w: number;
  h: number;
  color: string;
  delay: number;
  duration: number;
  rotateTo: number;
  drift: number;
};

function buildPieces(accent: string): Piece[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    leftPct: (i * 37 + (i % 9) * 11) % 100,
    w:       6 + (i % 5) * 2,
    h:       8 + (i % 4) * 2,
    color:   i % 7 === 0 ? accent : FALL_COLORS[i % FALL_COLORS.length],
    delay:   (i % 14) * 0.045,
    duration: 2.4 + (i % 6) * 0.35,
    rotateTo: (i % 2 === 0 ? 1 : -1) * (280 + (i % 120)),
    drift:   ((i % 11) - 5) * 14,
  }));
}

type Props = {
  /** Arena accent hex — some confetti matches the arena */
  accent: string;
  /** When true, only a subtle static burst (no falling motion) */
  reducedMotion: boolean;
};

/**
 * Full-screen falling confetti / shapes for level-up (kids 12–17 friendly, no emoji).
 */
export function CelebrationOverlay({ accent, reducedMotion }: Props) {
  const pieces = useMemo(() => buildPieces(accent), [accent]);

  if (reducedMotion) {
    return (
      <div
        className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center overflow-hidden"
        aria-hidden>
        <motion.div
          className="rounded-full"
          style={{
            width:      280,
            height:     280,
            background: `radial-gradient(circle, ${accent}44 0%, transparent 72%)`,
          }}
          animate={{ scale: [0.88, 1.06, 0.92], opacity: [0.38, 0.58, 0.42] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-sm shadow-sm"
          style={{
            left:       `${p.leftPct}%`,
            top:        "-6%",
            width:      p.w,
            height:     p.h,
            background: p.color,
            boxShadow:  `0 0 10px ${p.color}55`,
          }}
          initial={{ y: "0vh", x: 0, opacity: 1, rotate: 0 }}
          animate={{
            y:       "115vh",
            x:       p.drift,
            opacity: [1, 1, 0.92, 0.75],
            rotate:  p.rotateTo,
          }}
          transition={{
            duration:  p.duration,
            delay:     p.delay,
            ease:      [0.08, 0.65, 0.35, 0.98],
            opacity:   { times: [0, 0.55, 0.85, 1] },
          }}
        />
      ))}
      {/* A few larger “streamers” */}
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={`ribbon-${i}`}
          className="absolute rounded-full opacity-70"
          style={{
            left:       `${15 + i * 23}%`,
            top:        "-12%",
            width:      10,
            height:     44,
            background: `linear-gradient(180deg, ${accent}, transparent)`,
          }}
          initial={{ y: "0vh", rotate: -12 + i * 8, opacity: 0.85 }}
          animate={{ y: "120vh", rotate: 25 + i * 12, opacity: [0.85, 0.7, 0.4] }}
          transition={{
            duration: 2.8 + i * 0.2,
            delay:    0.08 + i * 0.12,
            ease:     "linear",
          }}
        />
      ))}
    </div>
  );
}

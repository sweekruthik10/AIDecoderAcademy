"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Award, X } from "lucide-react";
import type { Badge } from "@/lib/arenas";
import { playBadgeUnlockSound } from "@/lib/gameAudio";

type Props = {
  badge: Badge & { earned_at: string };
  accent:       string;
  accentGlow:   string;
  onDismiss:    () => void;
};

const AUTO_MS = 5200;

/**
 * P3 — Toast when a new achievement badge is earned (stacked via parent queue).
 */
export function BadgeUnlockToast({ badge, accent, accentGlow, onDismiss }: Props) {
  useEffect(() => {
    playBadgeUnlockSound(badge.id);
    const t = window.setTimeout(onDismiss, AUTO_MS);
    return () => window.clearTimeout(t);
  }, [badge.id, onDismiss]);

  return (
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        className="fixed bottom-24 left-1/2 z-[110] w-[min(92vw,22rem)] -translate-x-1/2 pointer-events-auto"
        role="status"
        aria-live="polite"
        aria-atomic="true">
        <div
          className="relative rounded-2xl border px-4 py-3 pr-10 shadow-2xl"
          style={{
            background:  "linear-gradient(135deg, rgba(15,15,26,0.98), rgba(25,25,40,0.98))",
            borderColor: `${accent}55`,
            boxShadow:   `0 12px 40px rgba(0,0,0,0.45), 0 0 24px ${accentGlow}`,
          }}>
          <button
            type="button"
            onClick={onDismiss}
            className="absolute right-2 top-2 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Dismiss">
            <X size={16} />
          </button>
          <div className="flex items-start gap-3">
            <div
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border"
              style={{ borderColor: `${accent}44`, background: `${accent}18` }}>
              <Award size={22} style={{ color: accent }} aria-hidden />
            </div>
            <div className="min-w-0 pt-0.5">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest mb-0.5" style={{ color: accent }}>
                Badge unlocked
              </p>
              <p className="font-display font-black text-base text-white leading-tight flex items-center gap-1.5">
                <span className="text-lg" aria-hidden>{badge.emoji}</span>
                {badge.name}
              </p>
              <p className="text-[11px] text-white/45 mt-1 leading-snug">{badge.description}</p>
            </div>
          </div>
        </div>
      </motion.div>
  );
}

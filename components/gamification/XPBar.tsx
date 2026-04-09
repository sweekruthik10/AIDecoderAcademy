"use client";
import { motion } from "framer-motion";
import { getArena, getXPProgress, getXPForNextLevel, XP_THRESHOLDS } from "@/lib/arenas";

interface Props {
  xp:    number;
  level: number;
  compact?: boolean;
}

export function XPBar({ xp, level, compact = false }: Props) {
  const arena    = getArena(level);
  const progress = getXPProgress(xp, level);
  const toNext   = getXPForNextLevel(level) - xp;
  const isMaxed  = level >= 6;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm" style={{ color: arena.accent }}>{arena.emoji}</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${isMaxed ? 100 : progress}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full"
            style={{ background: arena.accent }}
          />
        </div>
        <span className="text-[10px] font-mono text-white/40">
          {isMaxed ? "MAX" : `Lv${level}`}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{arena.emoji}</span>
          <div>
            <p className="font-display font-black text-sm text-white">{arena.role}</p>
            <p className="text-[10px] text-white/40">Level {level}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-sm" style={{ color: arena.accent }}>{xp} XP</p>
          {!isMaxed && (
            <p className="text-[10px] text-white/30">{toNext} to next level</p>
          )}
        </div>
      </div>

      <div className="h-2 rounded-full bg-white/8 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${isMaxed ? 100 : progress}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-full"
          style={{
            background:  `linear-gradient(90deg, ${arena.accent}, ${arena.accentGlow.replace("rgba", "rgb").replace(/,\s*[\d.]+\)/, ")")})`,
            boxShadow:   `0 0 8px ${arena.accentGlow}`,
          }}
        />
      </div>
    </div>
  );
}
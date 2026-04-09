"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  streakDays: number;
  accent:       string;
  accentDim:    string;
  accentGlow:   string;
};

const MILESTONES = [3, 7, 14];

/**
 * P3 — Sidebar streak meter: current count + milestone ticks toward longer streaks.
 */
export function StreakMeter({ streakDays, accent, accentDim, accentGlow }: Props) {
  const nextMilestone = MILESTONES.find((m) => streakDays < m) ?? null;
  const prevMilestone = nextMilestone != null
    ? (MILESTONES.filter((m) => m < nextMilestone).pop() ?? 0)
    : MILESTONES[MILESTONES.length - 1];
  const goal = nextMilestone ?? MILESTONES[MILESTONES.length - 1];
  const span = Math.max(goal - prevMilestone, 1);
  const pct  = nextMilestone != null
    ? Math.min(100, Math.round(((streakDays - prevMilestone) / span) * 100))
    : 100;

  return (
    <div
      className="rounded-2xl border px-3 py-3 mb-3"
      style={{
        background:  accentDim,
        borderColor: `${accent}35`,
        boxShadow:    `0 0 16px ${accentGlow}`,
      }}>
      <div className="flex items-center gap-2 mb-2">
        <Flame size={16} className={cn(streakDays >= 3 ? "text-orange-400" : "text-white/40")} aria-hidden />
        <span className="font-display font-black text-sm text-white">{streakDays} day streak</span>
      </div>
      <p className="text-[9px] text-white/40 leading-snug mb-2">
        Create on consecutive days. At 3+ days you earn bonus XP when you play.
      </p>
      <div className="flex justify-between text-[8px] font-mono text-white/30 mb-1">
        <span>{prevMilestone}d</span>
        <span>
          {nextMilestone != null ? `Next goal · ${nextMilestone}d` : "14d+ milestones"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width:      `${pct}%`,
            background: accent,
            boxShadow:  `0 0 8px ${accentGlow}`,
          }}
        />
      </div>
      <div className="flex justify-between mt-1.5 px-0.5">
        {MILESTONES.map((m) => (
          <div
            key={m}
            className={cn(
              "h-1 w-1 rounded-full transition-colors",
              streakDays >= m ? "opacity-100" : "opacity-25",
            )}
            style={{ background: streakDays >= m ? accent : "rgba(255,255,255,0.35)" }}
            title={`${m}-day milestone`}
          />
        ))}
      </div>
    </div>
  );
}

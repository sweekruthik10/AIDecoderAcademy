"use client";
import { useCallback } from "react";
import type { Badge } from "./arenas";

export interface XPResult {
  xp_earned:         number;
  streak_bonus:      number;
  total_xp:          number;
  level:             number;
  leveled_up:        boolean;
  unlocked_arena_id: number | null;
  new_badges:        (Badge & { earned_at: string })[];
  streak_days:       number;
  xp_to_next:        number;
}

export function useXP(
  onLevelUp?:  (result: XPResult) => void,
  onBadge?:    (badge: Badge & { earned_at: string }) => void,
) {
  const awardXP = useCallback(async (
    event_type: string,
    meta: Record<string, unknown> = {}
  ): Promise<XPResult | null> => {
    try {
      const res  = await fetch("/api/xp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ event_type, meta }),
      });
      if (!res.ok) return null;
      const result = await res.json() as XPResult;

      if (result.leveled_up && onLevelUp) onLevelUp(result);
      result.new_badges?.forEach(badge => onBadge?.(badge));

      return result;
    } catch (err) {
      console.error("[useXP] Failed to award XP:", err);
      return null;
    }
  }, [onLevelUp, onBadge]);

  return { awardXP };
}
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ArenaEnvironment } from "@/components/dashboard/ArenaEnvironment";
import { AidaAssistant } from "@/components/aida/AidaAssistant";
import { PersonalisationNudge } from "@/components/dashboard/PersonalisationNudge";
import { ChatChannelsProvider } from "@/lib/chatChannels";
import { getArena, ACTIVE_ARENA_CHANGED_EVENT } from "@/lib/arenas";
import { playArenaEnterSound } from "@/lib/gameAudio";
import type { Profile } from "@/types";


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [arenaOverride, setArenaOverride] = useState<number | null>(null);
  const [navVisible, setNavVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevArenaRef = useRef<number | null>(null);

  const showNav = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setNavVisible(true);
  }, []);

  const scheduleHide = useCallback(() => {
    hideTimerRef.current = setTimeout(() => setNavVisible(false), 300);
  }, []);

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : { profile: null })
      .then(({ profile }) => setProfile(profile))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onArena = (e: Event) => {
      const ce = e as CustomEvent<{ arenaId: number }>;
      if (typeof ce.detail?.arenaId === "number") setArenaOverride(ce.detail.arenaId);
    };
    window.addEventListener(ACTIVE_ARENA_CHANGED_EVENT, onArena);
    return () => window.removeEventListener(ACTIVE_ARENA_CHANGED_EVENT, onArena);
  }, []);

  useEffect(() => {
    if (arenaOverride != null && profile?.active_arena === arenaOverride) {
      setArenaOverride(null);
    }
  }, [profile?.active_arena, arenaOverride]);

  const effectiveArenaId = arenaOverride ?? profile?.active_arena ?? 1;
  const arena = getArena(effectiveArenaId);

  // P2: soft chime on arena change (opt-in + no chime until profile loaded — avoids default “1” → real id false positive)
  useEffect(() => {
    if (profile == null) return;
    if (prevArenaRef.current === null) {
      prevArenaRef.current = effectiveArenaId;
      return;
    }
    if (prevArenaRef.current !== effectiveArenaId) {
      playArenaEnterSound(arena.environmentPreset);
      prevArenaRef.current = effectiveArenaId;
    }
  }, [profile, effectiveArenaId, arena.environmentPreset]);
  const xp    = profile?.xp    ?? 0;
  const level = profile?.level ?? 1;

  // XP progress within current level
  const currentThreshold = [0, 100, 300, 600, 1000, 1500][level - 1] ?? 0;
  const nextThreshold    = [100, 300, 600, 1000, 1500, 99999][level - 1] ?? 99999;
  const isMaxed          = level >= 6;
  const progress         = isMaxed ? 100
    : Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100);

  return (
    <ChatChannelsProvider>
    <div
      className="relative overflow-hidden bg-[#08080F]"
      style={{ height: "100dvh", position: "fixed", inset: 0 }}
    >
      <ArenaEnvironment preset={arena.environmentPreset} gradient={arena.gradient} />

      {/* ── Hover trigger strip — always visible, sits at top ── */}
      <div
        className="fixed top-0 left-0 right-0 z-50"
        style={{ height: 10 }}
        onMouseEnter={showNav}
      />

      {/* ── Top nav — slides in from top on hover ── */}
      <header
        className="fixed top-0 left-0 right-0 z-40 border-b"
        style={{
          background:       "rgba(255,255,255,0.92)",
          borderColor:      "rgba(0,0,0,0.07)",
          backdropFilter:   "blur(20px)",
          transform:        navVisible ? "translateY(0)" : "translateY(-100%)",
          transition:       "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
        }}
        onMouseEnter={showNav}
        onMouseLeave={scheduleHide}
      >
        <div className="flex items-center justify-between px-5 py-2.5 w-full gap-4">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: arena.accent }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 6V10L8 14L2 10V6L8 2Z" fill="#08080F"/>
              </svg>
            </div>
            <span className="font-display font-black text-base tracking-tight hidden sm:block" style={{ color: "#1a1a2e" }}>
              AI<span style={{ color: arena.accent }}>Decoder</span>
            </span>
          </Link>


          <div className="flex-1" />

          {/* Right — XP + level + avatar */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {profile && (
              <div className="hidden sm:flex items-center gap-2.5">
                {/* Level badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border"
                  style={{ background: arena.accentDim, borderColor: arena.accent + "40" }}>
                  <span className="text-sm">{arena.emoji}</span>
                  <span className="font-display font-black text-xs" style={{ color: arena.accent }}>
                    Lv {level}
                  </span>
                </div>

                {/* XP bar */}
                <div className="w-24 space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-[9px] font-mono" style={{ color: "rgba(0,0,0,0.35)" }}>{xp} XP</span>
                    {!isMaxed && <span className="text-[9px] font-mono" style={{ color: "rgba(0,0,0,0.25)" }}>{nextThreshold}</span>}
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.10)" }}>
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width:      `${progress}%`,
                        background: arena.accent,
                        boxShadow:  `0 0 6px ${arena.accentGlow}`,
                      }}/>
                  </div>
                </div>

                {/* Streak */}
                {(profile.streak_days ?? 0) > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-orange-500/20"
                    style={{ background: "rgba(255,107,43,0.1)" }}>
                    <span className="text-sm">🔥</span>
                    <span className="font-display font-black text-xs text-orange-400">
                      {profile.streak_days}
                    </span>
                  </div>
                )}
              </div>
            )}
            <UserButton afterSignOutUrl="/auth/sign-in"/>
          </div>
        </div>
      </header>

      {/* ── Main content — always full-height since nav is overlaid ── */}
      <main className="relative z-10 w-full overflow-hidden" style={{ height: "100dvh" }}>
        {children}
      </main>

      <AidaAssistant profile={profile} />
      <PersonalisationNudge profile={profile} />
    </div>
    </ChatChannelsProvider>
  );
}
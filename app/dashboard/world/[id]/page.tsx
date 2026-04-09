"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Zap, Lock } from "lucide-react";
import { getArena } from "@/lib/arenas";
import { getArenaObjectives, getCompletedObjectives, isArenaUnlocked, type Objective } from "@/lib/objectives";
import type { Profile } from "@/types";
import Arena1HotspotMap from "@/components/worlds/Arena1HotspotMap";
import Arena1CenterOverlay from "@/components/worlds/Arena1CenterOverlay";

const OUTPUT_LABELS: Record<string, { label: string; color: string }> = {
  text:   { label: "Text",   color: "#C4B5FD" },
  json:   { label: "JSON",   color: "#7BFFC4" },
  image:  { label: "Image",  color: "#7AEFFF" },
  audio:  { label: "Audio",  color: "#FF8FB8" },
  slides: { label: "Slides", color: "#C8FF00" },
};

export default function WorldPage() {
  const params  = useParams();
  const router  = useRouter();
  const arenaId = parseInt(params.id as string) || 1;
  const arena   = getArena(arenaId);

  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [completed,  setCompleted]  = useState<Set<string>>(new Set());
  const [launching,  setLaunching]  = useState<string | null>(null);
  // Arena 1: refined on image load so hotspot % positions stay aligned to image content
  const [arena1Aspect, setArena1Aspect] = useState(1.6);

  const objectives = getArenaObjectives(arenaId);

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : { profile: null })
      .then(({ profile }) => setProfile(profile))
      .catch(() => {});
    setCompleted(getCompletedObjectives());
  }, []);

  const unlocked  = isArenaUnlocked(arenaId);

  const handleStartObjective = (obj: Objective) => {
    if (!unlocked) return;
    setLaunching(obj.id);
    // Only pass the objective ID — prompt and outputType are looked up
    // in the playground from lib/objectives so they're never exposed in the URL.
    const params = new URLSearchParams({ objective: obj.id });
    setTimeout(() => {
      router.push(`/dashboard/playground?${params.toString()}`);
    }, 400);
  };

  const completedCount  = objectives.filter(o => completed.has(o.id)).length;
  const allDone         = completedCount === objectives.length;

  return (
    <div className="relative w-full overflow-hidden" style={{ height: "100vh" }}>

      {/* ── World background ── */}
      {arenaId === 1 ? (
        /*
         * Arena 1 — image + hotspots share the same aspect-ratio-preserving container.
         * This means hotspot % positions always map to the same spot on the image,
         * regardless of viewport size (no object-fit crop misalignment).
         *
         * The inner div is sized so it exactly covers the viewport while preserving
         * the image's native aspect ratio, then centered with translate(-50%,-50%).
         */
        <div className="absolute inset-0 overflow-hidden">
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              // Cover the viewport: whichever dimension is the bottleneck, fill it.
              width:  `max(100vw, calc(100vh * ${arena1Aspect}))`,
              height: `max(100vh, calc(100vw / ${arena1Aspect}))`,
            }}
          >
            <img
              src="/worlds/arena-1.png"
              alt=""
              draggable={false}
              style={{ width: "100%", height: "100%", display: "block" }}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setArena1Aspect(img.naturalWidth / img.naturalHeight);
                }
              }}
            />
            {/* Subtle vignette — keeps edges readable without obscuring panels */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(6,6,15,0.12) 0%, rgba(6,6,15,0.0) 40%, rgba(6,6,15,0.22) 100%)" }}
            />
            {/* Hotspot overlay lives inside the same container — % positions are image-accurate */}
            {unlocked && (
              <Arena1HotspotMap
                objectives={objectives}
                completed={completed}
                onObjectiveClick={handleStartObjective}
              />
            )}

            {/* Center summary + engagement overlay */}
            {unlocked && (
              <Arena1CenterOverlay
                objectives={objectives}
                completed={completed}
                profile={profile}
                onStartNext={handleStartObjective}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0">
          <img
            src={`/worlds/arena-${arenaId}.png`}
            alt={arena.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              if (el.src.endsWith(".png")) {
                el.src = `/worlds/arena-${arenaId}.jpg`;
              } else {
                el.src = `/arena${arenaId}/background.png`;
              }
            }}
          />
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(6,6,15,0.55) 0%, rgba(6,6,15,0.3) 40%, rgba(6,6,15,0.7) 100%)" }}/>
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse 60% 50% at 50% 0%, ${arena.accentGlow} 0%, transparent 60%)` }}/>
        </div>
      )}

      {/* ── Back button ── */}
      <motion.button
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        onClick={() => router.push("/dashboard")}
        className="absolute top-5 left-5 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-display font-bold text-white/60 hover:text-white transition-all"
        style={{ background: "rgba(6,6,15,0.6)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)" }}
      >
        <ArrowLeft size={14}/> Hub
      </motion.button>

      {/* ── Arenas 2–6: Mission cards grid ── */}
      {arenaId !== 1 && (
        <div className="absolute inset-0 flex items-center justify-center z-30 px-4 sm:px-8"
          style={{ paddingTop: "100px", paddingBottom: "20px" }}>
          <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-4">
            {objectives.map((obj, i) => {
              const done           = completed.has(obj.id);
              const prevDone       = i === 0 || completed.has(objectives[i - 1].id);
              const isObjLocked    = !unlocked || !prevDone;
              const isLaunching    = launching === obj.id;
              const outMeta        = OUTPUT_LABELS[obj.outputType] ?? OUTPUT_LABELS.text;

              return (
                <motion.div
                  key={obj.id}
                  initial={{ opacity: 0, y: 32 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.12 + 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <motion.button
                    onClick={() => !isObjLocked && handleStartObjective(obj)}
                    disabled={isObjLocked || isLaunching}
                    whileHover={!isObjLocked ? { y: -4, scale: 1.02 } : {}}
                    whileTap={!isObjLocked   ? { scale: 0.97 }         : {}}
                    className="w-full text-left rounded-2xl overflow-hidden transition-all duration-200 relative"
                    style={{
                      background:     done ? `${arena.accent}18` : "rgba(15,15,26,0.82)",
                      border:         `1px solid ${done ? arena.accent + "60" : isObjLocked ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)"}`,
                      backdropFilter: "blur(20px)",
                      boxShadow:      done ? `0 0 24px ${arena.accentGlow}` : "0 8px 32px rgba(0,0,0,0.4)",
                      cursor:         isObjLocked ? "not-allowed" : "pointer",
                    }}
                  >
                    <div className="h-0.5 w-full" style={{ background: done ? arena.accent : "rgba(255,255,255,0.08)" }}/>

                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{obj.emoji}</span>
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
                            style={{ background: `${outMeta.color}15`, color: outMeta.color, border: `1px solid ${outMeta.color}30` }}>
                            {outMeta.label}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {done ? (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ background: arena.accent, color: "#08080F" }}>✓</div>
                          ) : (
                            <span className="text-[10px] font-mono text-white/30">
                              Mission {obj.order}
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="font-display font-black text-base tracking-tight text-white mb-1.5 leading-tight">
                        {obj.title}
                      </h3>

                      <p className="text-xs text-white/55 leading-relaxed mb-4">
                        {obj.description}
                      </p>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-xs font-bold"
                          style={{ color: arena.accent }}>
                          <Zap size={11} fill="currentColor"/>
                          +{obj.xpReward} XP
                        </div>

                        {!isObjLocked && (
                          <div
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-display font-extrabold transition-all duration-200"
                            style={done ? {
                              background: "rgba(0,255,148,0.12)",
                              color: "#7BFFC4",
                              border: "1px solid rgba(0,255,148,0.2)",
                            } : {
                              background: isLaunching ? arena.accent : `${arena.accent}20`,
                              color: isLaunching ? "#08080F" : arena.accent,
                              border: `1px solid ${arena.accent}40`,
                            }}
                          >
                            {isLaunching ? (
                              <span className="flex items-center gap-1">
                                <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none">
                                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4" strokeDashoffset="10"/>
                                </svg>
                                Launching…
                              </span>
                            ) : done ? "Redo ↺" : "Start →"}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Transparent sequential lock overlay */}
                    {isObjLocked && (
                      <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-2"
                        style={{ background: "rgba(4,2,14,0.65)", backdropFilter: "blur(2px)", zIndex: 10 }}>
                        <Lock size={16} className="text-white/30"/>
                        <p className="text-[10px] font-mono text-white/35 text-center px-4">
                          {!unlocked ? `Complete Arena ${arenaId - 1} first` : "Complete the previous mission first"}
                        </p>
                      </div>
                    )}
                  </motion.button>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Locked world overlay ── */}
      {!unlocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-40 flex flex-col items-center justify-center"
          style={{ background: "rgba(6,6,15,0.75)", backdropFilter: "blur(4px)" }}
        >
          <div className="text-center px-8 max-w-sm">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="font-display font-black text-white text-2xl mb-2">
              {arena.name} is Locked
            </h2>
            <p className="text-white/50 text-sm mb-6">
              Complete all objectives in Arena {arenaId - 1} to unlock this world.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-6 py-3 rounded-xl font-display font-extrabold text-sm transition-all duration-200 active:scale-95"
              style={{ background: arena.accent, color: "#08080F", boxShadow: `0 0 20px ${arena.accentGlow}` }}
            >
              ← Back to Hub
            </button>
          </div>
        </motion.div>
      )}

      {/* ── All done banner ── */}
      {allDone && !launching && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl"
          style={{
            background: "rgba(15,15,26,0.92)",
            border: `1px solid ${arena.accent}50`,
            boxShadow: `0 0 32px ${arena.accentGlow}`,
            backdropFilter: "blur(20px)",
          }}
        >
          <span className="text-xl">🎉</span>
          <div>
            <p className="font-display font-extrabold text-sm" style={{ color: arena.accent }}>
              World Complete!
            </p>
            <p className="text-xs text-white/40">All missions in {arena.name} done.</p>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="ml-2 px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-all active:scale-95"
            style={{ background: arena.accent, color: "#08080F" }}
          >
            ← Back to Hub
          </button>
        </motion.div>
      )}
    </div>
  );
}

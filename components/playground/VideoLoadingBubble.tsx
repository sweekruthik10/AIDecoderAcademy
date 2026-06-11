"use client";

import { useEffect, useState } from "react";
import { Film, Pencil, Mic, Image as ImageIcon, Sparkles } from "lucide-react";

// Honest, kid-friendly progress steps that roughly match wall-clock timings
// of the actual Modal pipeline:
//   plan (GPT)              ~6s
//   ElevenLabs narration    ~10-15s for 5 shots
//   fal flux keyframes      ~15-25s for 5 shots
//   LTX 13B render          ~90-120s
//   ffmpeg mux + upload     ~5s
// Total ~2-3 min. We over-estimate slightly so the UI is never "stuck on last"
// while still finishing before reality.
const STEPS: { label: string; icon: typeof Film; durationMs: number }[] = [
  { label: "Writing the story…",          icon: Pencil,     durationMs:  8_000 },
  { label: "Recording the narration…",    icon: Mic,        durationMs: 18_000 },
  { label: "Painting the keyframes…",     icon: ImageIcon,  durationMs: 25_000 },
  { label: "Rendering the video scenes…", icon: Film,       durationMs: 110_000 },
  { label: "Adding final polish…",        icon: Sparkles,   durationMs:  20_000 },
];

interface Props {
  arenaAccent?:    string;
  arenaAccentGlow?: string;
}

export default function VideoLoadingBubble({
  arenaAccent     = "#C8FF00",
  arenaAccentGlow = "rgba(200,255,0,0.45)",
}: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [elapsed,   setElapsed]   = useState(0);

  // Advance through steps on a timer; lock to last step if we go over (so the
  // bubble never disappears or looks broken if Modal is slow).
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const now    = Date.now() - start;
      let cumulative = 0;
      let nextIdx = STEPS.length - 1;
      for (let i = 0; i < STEPS.length; i++) {
        cumulative += STEPS[i].durationMs;
        if (now < cumulative) {
          nextIdx = i;
          break;
        }
      }
      setActiveIdx(nextIdx);
      setElapsed(now);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const totalDuration = STEPS.reduce((a, b) => a + b.durationMs, 0);
  const progress      = Math.min(elapsed / totalDuration, 0.97);

  return (
    <div
      className="rounded-2xl px-4 py-4 w-full max-w-md"
      style={{
        background:  "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
        border:      `1px solid ${arenaAccent}33`,
        boxShadow:   `0 0 32px ${arenaAccentGlow}`,
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center animate-pulse"
          style={{ background: `${arenaAccent}22`, color: arenaAccent }}
        >
          <Film size={15} />
        </div>
        <div className="flex-1">
          <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: arenaAccent }}>
            Building your video
          </div>
          <div className="text-[10px] text-white/45 mt-0.5">
            This usually takes about 2-3 minutes. Stay on this page.
          </div>
        </div>
      </div>

      {/* Step list */}
      <div className="space-y-1.5 mb-3">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isDone   = idx < activeIdx;
          const isActive = idx === activeIdx;
          const isFuture = idx > activeIdx;
          return (
            <div
              key={step.label}
              className="flex items-center gap-2.5 text-[12px] transition-all duration-300"
              style={{
                color: isActive ? arenaAccent : isDone ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.30)",
                opacity: isFuture ? 0.45 : 1,
              }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: isActive
                    ? `${arenaAccent}33`
                    : isDone
                    ? "rgba(0,255,148,0.18)"
                    : "rgba(255,255,255,0.06)",
                  border: isActive ? `1px solid ${arenaAccent}99` : "1px solid transparent",
                }}
              >
                {isDone ? (
                  <span style={{ color: "#00FF94", fontSize: 11, lineHeight: 1 }}>✓</span>
                ) : (
                  <StepIcon size={11} className={isActive ? "animate-pulse" : ""} />
                )}
              </div>
              <span className="truncate">{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="relative h-1 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-500"
          style={{
            width:      `${progress * 100}%`,
            background: `linear-gradient(90deg, ${arenaAccent}88, ${arenaAccent})`,
            boxShadow:  `0 0 10px ${arenaAccentGlow}`,
          }}
        />
      </div>

      <div className="mt-2 text-[10px] text-white/40 text-right tabular-nums">
        {Math.floor(elapsed / 1000)}s
      </div>
    </div>
  );
}

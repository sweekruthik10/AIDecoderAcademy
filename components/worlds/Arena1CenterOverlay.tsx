"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Zap, Flame, Target, ChevronRight } from "lucide-react";
import { isObjectiveEnabled, type Objective } from "@/lib/objectives";

const TIPS = [
  "Each mission you complete sharpens your AI skills — keep the streak alive!",
  "Try mixing tools: ChatGPT for text, Canva for images, Suno for music.",
  "The best prompts are specific. Add mood, style, and detail to get better results.",
  "Save every creation — your Capstone Film is built from the best ones.",
  "Explore each tool at least once before your Capstone blueprint.",
];

interface Props {
  objectives: Objective[];
  completed:  Set<string>;
  profile:    { xp?: number; streak_days?: number; display_name?: string } | null;
  onStartNext: (obj: Objective) => void;
}

export default function Arena1CenterOverlay({
  objectives,
  completed,
  profile,
  onStartNext,
}: Props) {
  const total     = objectives.length;
  const doneCount = objectives.filter(o => completed.has(o.id)).length;
  const pct       = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Only point the "Next Mission" CTA at objectives that are actually
  // playable today (OBJ 6, OBJ 10). Otherwise the kid clicks a locked tile
  // through the central card.
  const nextObj = useMemo(
    () => objectives.find(o => !completed.has(o.id) && isObjectiveEnabled(o.id)) ?? null,
    [objectives, completed]
  );

  const tipIndex  = doneCount % TIPS.length;
  const tip       = TIPS[tipIndex];
  const arenaXP   = objectives
    .filter(o => completed.has(o.id))
    .reduce((sum, o) => sum + o.xpReward, 0);

  const firstName = profile?.display_name?.split(" ")[0] ?? "Creator";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
      style={{
        position:  "absolute",
        left:      "41%",
        top:       "29%",
        transform: "translate(-50%, -50%)",
        width:     "clamp(260px, 22vw, 340px)",
        zIndex:    35,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background:     "rgba(255,255,255,0.93)",
          border:         "1.5px solid rgba(0,100,255,0.25)",
          borderRadius:   "20px",
          backdropFilter: "blur(20px)",
          boxShadow:      "0 8px 40px rgba(0,80,255,0.18), 0 2px 0 rgba(255,255,255,0.9) inset",
          padding:        "20px",
          pointerEvents:  "auto",
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            position:     "absolute",
            top:          0,
            left:         "10%",
            right:        "10%",
            height:       "2.5px",
            background:   "linear-gradient(90deg, transparent, #1E5FFF, transparent)",
            borderRadius: "2px",
          }}
        />

        {/* Greeting */}
        <div className="flex items-center gap-2 mb-3">
          <div
            style={{
              width:        28,
              height:       28,
              borderRadius: "50%",
              background:   "linear-gradient(135deg, #1E5FFF22, #00A8FF22)",
              border:       "1.5px solid rgba(30,95,255,0.4)",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              fontSize:     12,
            }}
          >
            🤖
          </div>
          <div>
            <p style={{ fontSize: 10, color: "#1E5FFF", fontFamily: "monospace", letterSpacing: "0.08em", fontWeight: 700 }}>
              AI EXPLORER ARENA
            </p>
            <p style={{ fontSize: 13, color: "#0a0a2e", fontWeight: 800, lineHeight: 1.2 }}>
              Welcome back, {firstName}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontSize: 10, color: "rgba(0,0,0,0.4)", fontFamily: "monospace", fontWeight: 700 }}>
              MISSIONS
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#1E5FFF", fontFamily: "monospace" }}>
              {doneCount}/{total}
            </span>
          </div>
          <div
            style={{
              height:       6,
              background:   "rgba(30,95,255,0.1)",
              borderRadius: 4,
              overflow:     "hidden",
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
              style={{
                height:     "100%",
                background: pct === 100
                  ? "linear-gradient(90deg, #00C27A, #1E5FFF)"
                  : "linear-gradient(90deg, #1E5FFF, #00A8FF)",
                borderRadius: 4,
                boxShadow:  "0 0 8px rgba(30,95,255,0.5)",
              }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div
          className="grid grid-cols-3 gap-2 mb-3"
        >
          {[
            { icon: <Zap size={11} fill="#1E5FFF" color="#1E5FFF"/>, label: "Arena XP", value: `+${arenaXP}` },
            { icon: <Flame size={11} color="#FF6B2B"/>, label: "Streak", value: `${profile?.streak_days ?? 0}d` },
            { icon: <Target size={11} color="#00A8FF"/>, label: "Done", value: `${pct}%` },
          ].map(s => (
            <div
              key={s.label}
              style={{
                background:   "rgba(30,95,255,0.06)",
                border:       "1px solid rgba(30,95,255,0.15)",
                borderRadius: 10,
                padding:      "8px 6px",
                textAlign:    "center",
              }}
            >
              <div className="flex justify-center mb-1">{s.icon}</div>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#0a0a2e", lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 9, color: "rgba(0,0,0,0.4)", fontFamily: "monospace", marginTop: 2 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Next mission CTA */}
        {nextObj && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onStartNext(nextObj)}
            style={{
              width:        "100%",
              background:   "rgba(30,95,255,0.08)",
              border:       "1px solid rgba(30,95,255,0.3)",
              borderRadius: 12,
              padding:      "10px 12px",
              display:      "flex",
              alignItems:   "center",
              gap:          8,
              cursor:       "pointer",
              marginBottom: 10,
              textAlign:    "left",
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{nextObj.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 9, color: "#1E5FFF", fontFamily: "monospace", marginBottom: 2, fontWeight: 700 }}>
                NEXT MISSION #{nextObj.order}
              </p>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#0a0a2e", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {nextObj.title}
              </p>
            </div>
            <div
              style={{
                width:        22,
                height:       22,
                borderRadius: "50%",
                background:   "#1E5FFF",
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                flexShrink:   0,
              }}
            >
              <ChevronRight size={12} color="#fff"/>
            </div>
          </motion.button>
        )}

        {doneCount === total && (
          <div
            style={{
              background:   "rgba(0,194,122,0.1)",
              border:       "1px solid rgba(0,194,122,0.35)",
              borderRadius: 12,
              padding:      "10px 12px",
              marginBottom: 10,
              textAlign:    "center",
            }}
          >
            <p style={{ fontSize: 14 }}>🎉</p>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#00A85A" }}>Arena Complete!</p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>All 15 missions done. Legendary.</p>
          </div>
        )}

        {/* Tip */}
        <div
          style={{
            background:   "rgba(30,95,255,0.06)",
            border:       "1px solid rgba(30,95,255,0.12)",
            borderRadius: 10,
            padding:      "8px 10px",
            display:      "flex",
            gap:          6,
          }}
        >
          <span style={{ fontSize: 11, flexShrink: 0 }}>💡</span>
          <p style={{ fontSize: 10, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, fontStyle: "italic" }}>
            {tip}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

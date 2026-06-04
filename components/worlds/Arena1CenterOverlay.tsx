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
  selectedObjective?: Objective | null;
  profile:    { xp?: number; streak_days?: number; display_name?: string } | null;
  onStartNext: (obj: Objective) => void;
}

export default function Arena1CenterOverlay({
  objectives,
  completed,
  selectedObjective = null,
  profile,
  onStartNext,
}: Props) {
  const total     = objectives.length;
  const doneCount = objectives.filter(o => completed.has(o.id)).length;
  const pct       = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const nextObj = useMemo(
    () => objectives.find(o => !completed.has(o.id) && isObjectiveEnabled(o.id)) ?? null,
    [objectives, completed]
  );
  const activeObj  = selectedObjective ?? nextObj;
  const isSelected = selectedObjective != null;

  const tipIndex = doneCount % TIPS.length;
  const tip      = TIPS[tipIndex];
  const arenaXP  = objectives
    .filter(o => completed.has(o.id))
    .reduce((sum, o) => sum + o.xpReward, 0);

  const firstName = profile?.display_name?.split(" ")[0] ?? "Creator";

  return (
    <div
      style={{
        position:      "absolute",
        left:          "50%",
        top:           "66%",
        transform:     "translate(-50%, -50%)",
        // Width scales with viewport but never smaller than 300px or wider than 620px
        width:         "clamp(300px, 44vw, 620px)",
        // Never taller than 85% of the viewport — scrolls internally if content is tall
        maxHeight:     "85vh",
        zIndex:        80,
        pointerEvents: "none",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
        style={{ maxHeight: "inherit" }}
      >
        <div
          style={{
            background:     "rgba(255,255,255,0.93)",
            border:         "1.5px solid rgba(0,100,255,0.25)",
            borderRadius:   "clamp(16px, 1.5vw, 24px)",
            backdropFilter: "blur(20px)",
            boxShadow:      "0 12px 56px rgba(0,80,255,0.22), 0 2px 0 rgba(255,255,255,0.9) inset",
            // Padding scales: smaller on small screens, larger on big ones
            padding:        "clamp(14px, 2vw, 28px) clamp(16px, 2.5vw, 32px)",
            pointerEvents:  "auto",
            overflowY:      "auto",
            maxHeight:      "inherit",
            scrollbarWidth: "none",
            position:       "relative",
          }}
        >
          {/* Top accent line */}
          <div
            style={{
              position:     "absolute",
              top:          0,
              left:         "5%",
              right:        "5%",
              height:       "3px",
              background:   "linear-gradient(90deg, transparent, #1E5FFF, transparent)",
              borderRadius: "2px",
            }}
          />

          {/* Greeting */}
          <div style={{ display: "flex", alignItems: "center", gap: "clamp(8px, 1vw, 14px)", marginBottom: "clamp(10px, 1.5vw, 16px)" }}>
            <div
              style={{
                width:          "clamp(28px, 3vw, 36px)",
                height:         "clamp(28px, 3vw, 36px)",
                borderRadius:   "50%",
                background:     "linear-gradient(135deg, #1E5FFF22, #00A8FF22)",
                border:         "1.5px solid rgba(30,95,255,0.4)",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                fontSize:       "clamp(12px, 1.4vw, 16px)",
                flexShrink:     0,
              }}
            >
              🤖
            </div>
            <div>
              <p style={{
                fontSize:      "clamp(8px, 0.85vw, 11px)",
                color:         "#1E5FFF",
                fontFamily:    "monospace",
                letterSpacing: "0.1em",
                fontWeight:    700,
              }}>
                AI EXPLORER ARENA
              </p>
              <p style={{
                fontSize:   "clamp(13px, 1.4vw, 17px)",
                color:      "#0a0a2e",
                fontWeight: 800,
                lineHeight: 1.2,
              }}>
                Welcome back, {firstName} 👋
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: "clamp(10px, 1.5vw, 16px)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "clamp(4px, 0.5vw, 6px)" }}>
              <span style={{ fontSize: "clamp(8px, 0.85vw, 11px)", color: "rgba(0,0,0,0.4)", fontFamily: "monospace", fontWeight: 700 }}>
                MISSIONS
              </span>
              <span style={{ fontSize: "clamp(9px, 0.9vw, 12px)", fontWeight: 700, color: "#1E5FFF", fontFamily: "monospace" }}>
                {doneCount}/{total}
              </span>
            </div>
            <div style={{ height: "clamp(4px, 0.5vw, 7px)", background: "rgba(30,95,255,0.1)", borderRadius: 6, overflow: "hidden" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
                style={{
                  height:       "100%",
                  background:   pct === 100
                    ? "linear-gradient(90deg, #00C27A, #1E5FFF)"
                    : "linear-gradient(90deg, #1E5FFF, #00A8FF)",
                  borderRadius: 6,
                  boxShadow:    "0 0 10px rgba(30,95,255,0.5)",
                }}
              />
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "clamp(6px, 1vw, 12px)", marginBottom: "clamp(10px, 1.5vw, 16px)" }}>
            {[
              { icon: <Zap size={12} fill="#1E5FFF" color="#1E5FFF"/>, label: "Arena XP", value: `+${arenaXP}` },
              { icon: <Flame size={12} color="#FF6B2B"/>,              label: "Streak",   value: `${profile?.streak_days ?? 0}d` },
              { icon: <Target size={12} color="#00A8FF"/>,             label: "Done",     value: `${pct}%` },
            ].map(s => (
              <div
                key={s.label}
                style={{
                  background:     "rgba(30,95,255,0.06)",
                  border:         "1px solid rgba(30,95,255,0.15)",
                  borderRadius:   "clamp(8px, 1vw, 12px)",
                  padding:        "clamp(7px, 1vw, 12px) clamp(4px, 0.8vw, 8px)",
                  textAlign:      "center",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "clamp(4px, 0.5vw, 6px)" }}>{s.icon}</div>
                <p style={{ fontSize: "clamp(13px, 1.5vw, 18px)", fontWeight: 900, color: "#0a0a2e", lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: "clamp(8px, 0.8vw, 10px)", color: "rgba(0,0,0,0.4)", fontFamily: "monospace", marginTop: "clamp(2px, 0.3vw, 4px)" }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Mission CTA */}
          {activeObj && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onStartNext(activeObj)}
              style={{
                width:        "100%",
                background:   "rgba(30,95,255,0.08)",
                border:       "1px solid rgba(30,95,255,0.3)",
                borderRadius: "clamp(10px, 1.2vw, 14px)",
                padding:      "clamp(10px, 1.2vw, 14px) clamp(10px, 1.5vw, 16px)",
                display:      "flex",
                alignItems:   "center",
                gap:          "clamp(8px, 1vw, 12px)",
                cursor:       "pointer",
                marginBottom: "clamp(8px, 1vw, 12px)",
                textAlign:    "left",
              }}
            >
              <span style={{ fontSize: "clamp(16px, 2vw, 22px)", flexShrink: 0 }}>{activeObj.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "clamp(8px, 0.85vw, 10px)", color: "#1E5FFF", fontFamily: "monospace", marginBottom: 3, fontWeight: 700 }}>
                  {isSelected ? `START MISSION #${activeObj.order}` : `NEXT MISSION #${activeObj.order}`}
                </p>
                <p style={{ fontSize: "clamp(11px, 1.2vw, 14px)", fontWeight: 700, color: "#0a0a2e", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeObj.title}
                </p>
              </div>
              <div
                style={{
                  width:          "clamp(22px, 2.5vw, 30px)",
                  height:         "clamp(22px, 2.5vw, 30px)",
                  borderRadius:   "50%",
                  background:     "#1E5FFF",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  flexShrink:     0,
                }}
              >
                <ChevronRight size={13} color="#fff"/>
              </div>
            </motion.button>
          )}

          {doneCount === total && (
            <div
              style={{
                background:   "rgba(0,194,122,0.1)",
                border:       "1px solid rgba(0,194,122,0.35)",
                borderRadius: "clamp(10px, 1.2vw, 14px)",
                padding:      "clamp(10px, 1.2vw, 14px) clamp(10px, 1.5vw, 16px)",
                marginBottom: "clamp(8px, 1vw, 12px)",
                textAlign:    "center",
              }}
            >
              <p style={{ fontSize: "clamp(16px, 2vw, 20px)" }}>🎉</p>
              <p style={{ fontSize: "clamp(12px, 1.3vw, 15px)", fontWeight: 800, color: "#00A85A" }}>Arena Complete!</p>
              <p style={{ fontSize: "clamp(9px, 0.9vw, 11px)", color: "rgba(0,0,0,0.4)", marginTop: 3 }}>All {total} missions done. Legendary.</p>
            </div>
          )}

          {/* Tip */}
          <div
            style={{
              background:   "rgba(30,95,255,0.06)",
              border:       "1px solid rgba(30,95,255,0.12)",
              borderRadius: "clamp(8px, 1vw, 12px)",
              padding:      "clamp(7px, 0.9vw, 10px) clamp(8px, 1.2vw, 14px)",
              display:      "flex",
              gap:          "clamp(5px, 0.7vw, 8px)",
            }}
          >
            <span style={{ fontSize: "clamp(11px, 1.2vw, 13px)", flexShrink: 0 }}>💡</span>
            <p style={{ fontSize: "clamp(9px, 0.9vw, 11px)", color: "rgba(0,0,0,0.5)", lineHeight: 1.6, fontStyle: "italic" }}>
              {tip}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

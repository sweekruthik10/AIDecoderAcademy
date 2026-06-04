"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";
import { isObjectiveEnabled, type Objective } from "@/lib/objectives";

/*
 * Arena-1.png  16:9
 *
 *   Left  column (01–05) : x  3 – 19 %
 *   Right column (06–10) : x 80 – 96 %
 *
 *   5 rows, each ~13 % tall, starting at 8 %:
 *     tops at 8 / 21 / 34 / 47 / 60 %
 *
 *   Positions are % of image height (object-fit:fill → same as container %).
 */
const LEFT_X  = 3;
const LEFT_W  = 16;
const RIGHT_X = 80;
const RIGHT_W = 16;
const CARD_H  = 13;
const ROWS    = [8, 21, 34, 47, 60];

const ACCENT: Record<string, string> = {
  text:   "#C4B5FD",
  json:   "#7BFFC4",
  image:  "#7AEFFF",
  audio:  "#FF8FB8",
  slides: "#C8FF00",
};

interface Props {
  objectives:         Objective[];
  completed:          Set<string>;
  onObjectiveClick:   (obj: Objective) => void;
  onObjectiveSelect?: (obj: Objective) => void;
  onObjectiveHover?:  (obj: Objective | null) => void;
}

export default function Arena1HotspotMap({ objectives, completed, onObjectiveClick, onObjectiveSelect, onObjectiveHover }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
      {objectives.map((obj) => {
        const rowIdx = obj.order <= 5 ? obj.order - 1 : obj.order - 6;
        const top    = ROWS[rowIdx];
        const isLeft = obj.order <= 5;
        const left   = isLeft ? LEFT_X  : RIGHT_X;
        const cardW  = isLeft ? LEFT_W  : RIGHT_W;

        if (top === undefined) return null;

        const done    = completed.has(obj.id);
        const enabled = isObjectiveEnabled(obj.id);
        const accent  = ACCENT[obj.outputType] ?? "#7C3AED";
        const isOpen  = hoveredId === obj.id;

        return (
          <div
            key={obj.id}
            onMouseEnter={() => { setHoveredId(obj.id); onObjectiveHover?.(obj); }}
            onMouseLeave={() => { setHoveredId(null); onObjectiveHover?.(null); }}
            onClick={() => onObjectiveSelect?.(obj)}
            style={{
              position:      "absolute",
              left:          `${left}%`,
              top:           `${top}%`,
              width:         `${cardW}%`,
              height:        `${CARD_H}%`,
              zIndex:        isOpen ? 100 : 20,
              pointerEvents: "auto",
              cursor:        "pointer",
            }}
          >
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, x: isLeft ? -10 : 10, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0,                 scale: 1    }}
                  exit={{    opacity: 0, x: isLeft ? -10 : 10, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position:      "absolute",
                    // Bottom rows (04, 05) → tooltip grows upward to stay in viewport
                    ...(rowIdx >= 3 ? { bottom: 0, top: "auto" } : { top: 0 }),
                    ...(isLeft ? { left: "calc(100% + 6px)" } : { right: "calc(100% + 6px)" }),
                    width:         232,
                    zIndex:        110,
                    pointerEvents: "auto",
                  }}
                >
                  {/* Arrow nub — top for rows 01-03, bottom for rows 04-05 */}
                  <div style={{
                    position:      "absolute",
                    ...(rowIdx >= 3 ? { bottom: 22, top: "auto" } : { top: 22 }),
                    width:         9,
                    height:        9,
                    background:    "rgba(6,6,15,0.97)",
                    border:        `1px solid ${accent}50`,
                    transform:     "rotate(45deg)",
                    pointerEvents: "none",
                    ...(isLeft
                      ? { left:  -5, borderBottom: "none", borderRight: "none" }
                      : { right: -5, borderTop:    "none", borderLeft:  "none" }),
                  }} />

                  {/* Card body */}
                  <div className="rounded-2xl p-4" style={{
                    background:     "rgba(6,6,15,0.96)",
                    border:         `1px solid ${accent}50`,
                    backdropFilter: "blur(28px)",
                    boxShadow:      `0 8px 40px rgba(0,0,0,0.75), 0 0 28px ${accent}25`,
                  }}>
                    {/* Type + status */}
                    <div className="flex items-center gap-2 mb-2.5 pr-4">
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}40` }}>
                        {obj.outputType.toUpperCase()}
                      </span>
                      {done && (
                        <span className="text-[9px] font-mono font-bold" style={{ color: "#00FF94" }}>
                          ✓ DONE
                        </span>
                      )}
                      <span className="text-[8px] font-mono ml-auto"
                        style={{ color: enabled ? `${accent}bb` : "rgba(255,255,255,0.22)" }}>
                        {enabled ? "click to enter →" : "coming soon"}
                      </span>
                    </div>

                    {/* Title */}
                    <p className="font-display font-black text-white text-xs leading-tight mb-1.5">
                      {obj.emoji} {obj.title}
                    </p>

                    {/* Description */}
                    <p className="text-[10px] leading-snug mb-3" style={{ color: "rgba(255,255,255,0.48)" }}>
                      {obj.description}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: accent }}>
                        <Zap size={9} fill="currentColor" />+{obj.xpReward} XP
                      </span>
                      {enabled && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onObjectiveClick(obj);
                          }}
                          className="text-[9px] font-display font-extrabold px-2.5 py-1 rounded-lg transition-all active:scale-95"
                          style={{
                            background: done ? "rgba(0,255,148,0.14)" : `${accent}20`,
                            color:      done ? "#00FF94"               : accent,
                            border:     `1px solid ${done ? "rgba(0,255,148,0.28)" : accent + "38"}`,
                            cursor:     "pointer",
                          }}
                        >
                          {done ? "Redo ↺" : "Start →"}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

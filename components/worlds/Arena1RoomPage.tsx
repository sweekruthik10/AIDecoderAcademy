"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Zap, Lock } from "lucide-react";
import { getArenaObjectives, getCompletedObjectives, type Objective } from "@/lib/objectives";

// ── Theme constants ───────────────────────────────────────────────────────────
const ACCENT      = "#7C3AED";
const ACCENT_GLOW = "rgba(124,58,237,0.45)";
const ACCENT_DIM  = "rgba(124,58,237,0.12)";

const OUTPUT_META: Record<string, { label: string; color: string }> = {
  text:   { label: "Text",   color: "#C4B5FD" },
  json:   { label: "JSON",   color: "#7BFFC4" },
  image:  { label: "Image",  color: "#7AEFFF" },
  audio:  { label: "Audio",  color: "#FF8FB8" },
  slides: { label: "Slides", color: "#C8FF00" },
};

// ── Main page component ───────────────────────────────────────────────────────
export default function Arena1RoomPage({ level }: { level: number }) {
  const router    = useRouter();
  const objectives = getArenaObjectives(1);           // ordered 01-14
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => { setCompleted(getCompletedObjectives()); }, []);

  const unlocked = level >= 1; // Arena 1 is always available

  const handleClick = (obj: Objective) => {
    if (!unlocked || launching) return;
    setLaunching(obj.id);
    const p = new URLSearchParams({ outputType: obj.outputType, prompt: obj.starterPrompt, objective: obj.id });
    setTimeout(() => router.push(`/dashboard/playground?${p.toString()}`), 380);
  };

  // Split 14 missions: left wall (01-04), back wall (05-10), right wall (11-14)
  const leftObjs   = objectives.slice(0, 4);
  const centerObjs = objectives.slice(4, 10);
  const rightObjs  = objectives.slice(10, 14);

  const completedCount = objectives.filter(o => completed.has(o.id)).length;
  const allDone        = completedCount === objectives.length;

  return (
    <div
      className="relative w-full overflow-hidden select-none"
      style={{ height: "100dvh", background: "#04020E" }}
    >

      {/* ── Room background ── */}
      <img
        src="/worlds/arena-1.png"
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ objectFit: "cover", objectPosition: "center", opacity: 0.55 }}
        onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
      />

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "linear-gradient(180deg, rgba(4,2,14,0.72) 0%, rgba(4,2,14,0.2) 35%, rgba(4,2,14,0.82) 100%)",
      }}/>
      {/* Purple radial glow from top-center */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 75% 55% at 50% 15%, rgba(124,58,237,0.32) 0%, transparent 65%)",
      }}/>
      {/* Side wall depth shadows */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "linear-gradient(90deg, rgba(4,2,14,0.55) 0%, transparent 22%, transparent 78%, rgba(4,2,14,0.55) 100%)",
      }}/>

      {/* ── Holographic floor ring ── */}
      <div
        className="absolute left-1/2 pointer-events-none"
        style={{ bottom: "clamp(40px, 8vh, 100px)", transform: "translateX(-50%)", zIndex: 6 }}
      >
        {[1, 0.65, 0.38].map((scale, i) => (
          <motion.div
            key={i}
            className="absolute top-1/2 left-1/2"
            style={{
              width:        "clamp(280px, 44vw, 620px)",
              height:       "clamp(40px,  7vw,  90px)",
              borderRadius: "50%",
              border:       `${i === 0 ? "1.5px" : "1px"} solid ${ACCENT}${i === 0 ? "cc" : "66"}`,
              boxShadow:    i === 0 ? `0 0 28px ${ACCENT_GLOW}, inset 0 0 18px ${ACCENT_GLOW}` : "none",
              transform:    `translate(-50%, -50%) scale(${scale})`,
            }}
            animate={{ opacity: [0.3 + i * 0.15, 0.7 + i * 0.1, 0.3 + i * 0.15] }}
            transition={{ duration: 3 + i * 0.8, repeat: Infinity, ease: "easeInOut", delay: i * 0.6 }}
          />
        ))}
        {/* Centre dot */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: 8, height: 8, background: ACCENT, boxShadow: `0 0 16px ${ACCENT_GLOW}` }}
          animate={{ scale: [1, 1.6, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* ── Back button ── */}
      <motion.button
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        onClick={() => router.push("/dashboard")}
        className="absolute top-5 left-5 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-display font-bold text-white/60 hover:text-white transition-all"
        style={{ background: "rgba(6,6,15,0.65)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)" }}
      >
        <ArrowLeft size={14}/> Hub
      </motion.button>

      {/* ── Arena header ── */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="absolute top-0 left-0 right-0 z-40 flex flex-col items-center pt-4 pointer-events-none"
      >
        <span className="text-2xl mb-0.5">⚛️</span>
        <h1
          className="font-display font-black text-white uppercase tracking-tight leading-none"
          style={{
            fontSize: "clamp(1.25rem, 3vw, 2.25rem)",
            textShadow: `0 0 40px ${ACCENT_GLOW}, 0 0 80px ${ACCENT_GLOW}`,
          }}
        >
          AI Explorer Arena
        </h1>
        <p
          className="font-mono uppercase tracking-[0.22em] mt-1"
          style={{ fontSize: "clamp(0.55rem, 1vw, 0.7rem)", color: ACCENT }}
        >
          Master · Explore · Build the Future
        </p>

        {/* Progress dots */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex gap-[3px]">
            {objectives.map((o, i) => (
              <div
                key={o.id}
                className="rounded-full overflow-hidden"
                style={{ width: "clamp(8px,1.2vw,12px)", height: 3, background: "rgba(255,255,255,0.1)" }}
              >
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: completed.has(o.id) ? "100%" : "0%" }}
                  transition={{ delay: i * 0.03 + 0.6, duration: 0.35 }}
                  style={{ background: ACCENT }}
                />
              </div>
            ))}
          </div>
          <span className="font-mono text-[10px]" style={{ color: ACCENT }}>
            {completedCount}/{objectives.length}
          </span>
          {allDone && (
            <span className="text-[10px] font-bold text-[#7BFFC4]">✓ Complete!</span>
          )}
        </div>
      </motion.div>

      {/* ── Three-column room layout ── */}
      <div
        className="absolute inset-0 flex items-stretch z-20"
        style={{
          paddingTop:    "clamp(88px, 11vh, 120px)",
          paddingBottom: "clamp(60px, 10vh, 100px)",
        }}
      >

        {/* ════ LEFT WALL — missions 01–04 ════ */}
        <motion.div
          initial={{ opacity: 0, x: -48 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          className="flex flex-col gap-2 overflow-y-auto"
          style={{
            width:           "clamp(140px, 19%, 240px)",
            padding:         "4px 10px 4px 12px",
            transformOrigin: "left center",
            transform:       "perspective(700px) rotateY(20deg)",
            // fade out top & bottom edges for depth effect
            maskImage:       "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
          }}
        >
          {leftObjs.map((obj, i) => (
            <RoomCard
              key={obj.id}
              obj={obj}
              index={i}
              completed={completed.has(obj.id)}
              unlocked={unlocked}
              launching={launching === obj.id}
              onClick={() => handleClick(obj)}
            />
          ))}
        </motion.div>

        {/* ════ BACK WALL — missions 05–10 ════ */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          className="flex-1 flex flex-col overflow-y-auto"
          style={{ padding: "0 clamp(6px, 1.5%, 20px)" }}
        >
          {/* 2 × 3 grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 h-full">
            {centerObjs.map((obj, i) => (
              <RoomCard
                key={obj.id}
                obj={obj}
                index={i + 4}
                completed={completed.has(obj.id)}
                unlocked={unlocked}
                launching={launching === obj.id}
                onClick={() => handleClick(obj)}
                featured={i >= 4}   // last two cards get extra visual weight
              />
            ))}
          </div>
        </motion.div>

        {/* ════ RIGHT WALL — missions 11–14 ════ */}
        <motion.div
          initial={{ opacity: 0, x: 48 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
          className="flex flex-col gap-2 overflow-y-auto"
          style={{
            width:           "clamp(140px, 19%, 240px)",
            padding:         "4px 12px 4px 10px",
            transformOrigin: "right center",
            transform:       "perspective(700px) rotateY(-20deg)",
            maskImage:       "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
          }}
        >
          {rightObjs.map((obj, i) => (
            <RoomCard
              key={obj.id}
              obj={obj}
              index={i + 10}
              completed={completed.has(obj.id)}
              unlocked={unlocked}
              launching={launching === obj.id}
              onClick={() => handleClick(obj)}
            />
          ))}
        </motion.div>

      </div>

      {/* ── All-done banner ── */}
      <AnimatePresence>
        {allDone && !launching && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{    opacity: 0, y: 12 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl"
            style={{
              background: "rgba(12,8,28,0.95)",
              border: `1px solid ${ACCENT}55`,
              boxShadow: `0 0 36px ${ACCENT_GLOW}`,
              backdropFilter: "blur(20px)",
            }}
          >
            <span className="text-xl">🎉</span>
            <div>
              <p className="font-display font-extrabold text-sm" style={{ color: ACCENT }}>
                Arena Complete!
              </p>
              <p className="text-xs text-white/40">All 15 missions done. You're an AI Explorer.</p>
            </div>
            <button
              onClick={() => router.push("/dashboard/world/2")}
              className="ml-2 px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-all active:scale-95"
              style={{ background: ACCENT, color: "#fff" }}
            >
              Prompt Lab →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// ── RoomCard ──────────────────────────────────────────────────────────────────
function RoomCard({
  obj, index, completed, unlocked, launching, onClick, featured = false,
}: {
  obj:       Objective;
  index:     number;
  completed: boolean;
  unlocked:  boolean;
  launching: boolean;
  onClick:   () => void;
  featured?: boolean;
}) {
  const out    = OUTPUT_META[obj.outputType] ?? OUTPUT_META.text;
  const num    = String(index + 1).padStart(2, "0");
  const isDone = completed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 + 0.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={featured ? "col-span-1" : ""}
    >
      <motion.button
        whileHover={unlocked ? { y: -3, scale: 1.025 } : {}}
        whileTap={unlocked   ? { scale: 0.97 }         : {}}
        onClick={onClick}
        disabled={!unlocked || !!launching}
        className="w-full h-full text-left"
        style={{ cursor: unlocked ? "pointer" : "not-allowed" }}
      >
        <div
          className="relative w-full h-full rounded-xl flex flex-col gap-1.5 overflow-hidden"
          style={{
            padding:    "clamp(8px, 1.2vw, 14px)",
            background: isDone ? ACCENT_DIM : "rgba(10,6,26,0.84)",
            border:     `1px solid ${isDone ? ACCENT + "55" : "rgba(255,255,255,0.09)"}`,
            backdropFilter: "blur(18px)",
            boxShadow:  isDone
              ? `0 0 22px ${ACCENT_GLOW}`
              : "0 4px 28px rgba(0,0,0,0.55)",
            minHeight: featured ? "clamp(80px, 10vh, 120px)" : "clamp(70px, 9vh, 110px)",
          }}
        >
          {/* Top accent stripe */}
          <div
            className="absolute top-0 left-0 right-0 rounded-t-xl"
            style={{ height: 2, background: isDone ? ACCENT : "rgba(255,255,255,0.07)" }}
          />

          {/* Number + type badge */}
          <div className="flex items-center justify-between gap-1">
            <span
              className="font-mono font-black leading-none"
              style={{
                fontSize: "clamp(0.65rem, 1.1vw, 0.8rem)",
                color: isDone ? ACCENT : "rgba(255,255,255,0.28)",
                textShadow: isDone ? `0 0 12px ${ACCENT_GLOW}` : "none",
              }}
            >
              {num}
            </span>
            <div className="flex items-center gap-1">
              <span
                className="font-mono rounded-full"
                style={{
                  fontSize:   "clamp(0.5rem, 0.8vw, 0.65rem)",
                  padding:    "2px 6px",
                  background: `${out.color}18`,
                  color:       out.color,
                  border:     `1px solid ${out.color}30`,
                }}
              >
                {out.label}
              </span>
              {isDone && (
                <div
                  className="flex items-center justify-center rounded-full font-bold"
                  style={{
                    width: 16, height: 16,
                    fontSize: "0.55rem",
                    background: ACCENT,
                    color: "#08080F",
                  }}
                >
                  ✓
                </div>
              )}
            </div>
          </div>

          {/* Emoji + title */}
          <div className="flex items-start gap-1.5">
            <span style={{ fontSize: "clamp(0.9rem, 1.4vw, 1.2rem)", lineHeight: 1, marginTop: 1 }}>
              {obj.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className="font-display font-extrabold text-white leading-tight"
                style={{ fontSize: "clamp(0.65rem, 1vw, 0.82rem)" }}
              >
                {obj.title}
              </p>
              <p
                className="text-white/45 leading-tight mt-0.5 line-clamp-2"
                style={{ fontSize: "clamp(0.55rem, 0.8vw, 0.68rem)" }}
              >
                {obj.description}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-auto pt-0.5">
            <div
              className="flex items-center gap-0.5 font-bold"
              style={{ fontSize: "clamp(0.55rem, 0.8vw, 0.68rem)", color: ACCENT }}
            >
              <Zap size={9} fill="currentColor"/>
              +{obj.xpReward} XP
            </div>
            {unlocked ? (
              <span
                className="font-display font-extrabold transition-colors"
                style={{
                  fontSize: "clamp(0.55rem, 0.8vw, 0.68rem)",
                  color: launching ? "rgba(255,255,255,0.5)" : isDone ? "#7BFFC4" : ACCENT,
                }}
              >
                {launching ? "↗ Going…" : isDone ? "Redo ↺" : "Start →"}
              </span>
            ) : (
              <Lock size={10} className="text-white/25"/>
            )}
          </div>

          {/* Locked overlay */}
          {!unlocked && (
            <div
              className="absolute inset-0 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(4,2,14,0.7)", backdropFilter: "blur(3px)" }}
            >
              <Lock size={14} className="text-white/30"/>
            </div>
          )}
        </div>
      </motion.button>
    </motion.div>
  );
}

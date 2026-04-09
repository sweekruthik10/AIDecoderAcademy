"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Loader2 } from "lucide-react";
import type { Chapter } from "@/types";

interface Props {
  onChapterSelect: (chapter: Chapter) => void;
  onBack:          () => void;
}

type LeaderboardEntry = {
  display_name: string; avatar_emoji: string; xp: number;
  level: number; active_arena: number; rank: number; is_current_user: boolean;
};

const ARENA_ACCENTS: Record<number,string> = {
  1:"#7C3AED",2:"#00D4FF",3:"#FF6B2B",4:"#00FF94",5:"#FF2D78",6:"#C8FF00",
};
const PODIUM_META = [
  { rank:2, ring:"#C0C0C0", glow:"rgba(192,192,192,0.35)", platform:28, avatar:30, label:"🥈" },
  { rank:1, ring:"#FFD700", glow:"rgba(255,215,0,0.40)",   platform:42, avatar:38, label:"👑" },
  { rank:3, ring:"#CD7F32", glow:"rgba(205,127,50,0.35)",  platform:18, avatar:26, label:"🥉" },
];

// ── Chapter tiles: positioned in a pentagon around the center ─────────────────
// Center at (47%, 50%) of body. Radius = 290px. Tile size 300×145.
const TILES = [
  { key:"chemical", src:"/classroom/chapter/chemical.png", num:1, locked:false,
    style:{ top:"calc(50% - 362px)", left:"calc(47% - 150px)" } },
  { key:"acids",    src:"/classroom/chapter/acids.png",    num:2, locked:true,
    style:{ top:"calc(50% - 162px)", left:"calc(47% + 131px)" } },
  { key:"metals",   src:"/classroom/chapter/metals.png",   num:3, locked:true,
    style:{ top:"calc(50% + 163px)", left:"calc(47% + 25px)" } },
  { key:"carbon",   src:"/classroom/chapter/carbon.png",   num:4, locked:true,
    style:{ top:"calc(50% + 163px)", left:"calc(47% - 315px)" } },
  { key:"periodic", src:"/classroom/chapter/periodic.png", num:5, locked:true,
    style:{ top:"calc(50% - 162px)", left:"calc(47% - 421px)" } },
] as const;

// SVG connectors — from pentagon center (47,50) to each tile center
const CONNECTORS = [
  { id:"c1", x1:47, y1:50, x2:47,   y2:11  },  // → chemical (top)
  { id:"c2", x1:47, y1:50, x2:66,   y2:38  },  // → acids    (right)
  { id:"c3", x1:47, y1:50, x2:59,   y2:82  },  // → metals   (bottom-right)
  { id:"c4", x1:47, y1:50, x2:35,   y2:82  },  // → carbon   (bottom-left)
  { id:"c5", x1:47, y1:50, x2:28,   y2:38  },  // → periodic (left)
];

// ── Lock icon (reused from arena style) ───────────────────────────────────────
function LockMedallion() {
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
      style={{ backdropFilter:"blur(1.5px) saturate(85%)", background:"rgba(8,16,32,0.1)" }}>
      <div className="flex items-center justify-center rounded-full"
        style={{ width:42, height:42,
          background:"linear-gradient(180deg,#0B1A2F,#050E1F)",
          border:"1.5px solid rgba(125,211,252,0.65)",
          boxShadow:"0 0 18px rgba(0,212,255,0.5), inset 0 0 10px rgba(0,212,255,0.18)" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="#E8F4FF" strokeWidth="1.8"/>
          <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="#E8F4FF" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}

// ── Leaderboard components ────────────────────────────────────────────────────
function PodiumSpot({ entry, meta }: { entry:LeaderboardEntry; meta:typeof PODIUM_META[0] }) {
  const isMe = entry.is_current_user;
  const accent = ARENA_ACCENTS[entry.active_arena] ?? "#7C3AED";
  return (
    <motion.div className="flex flex-col items-center flex-1"
      initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }}
      transition={{ duration:0.4, delay:meta.rank===1?0:0.15 }}>
      <div style={{ fontSize:meta.rank===1?14:12, marginBottom:3 }}>{meta.label}</div>
      <div className="rounded-full flex items-center justify-center"
        style={{ width:meta.avatar, height:meta.avatar,
          background:isMe?"rgba(124,58,237,0.12)":"rgba(255,255,255,0.88)",
          border:`2.5px solid ${meta.ring}`, boxShadow:`0 0 10px ${meta.glow}`,
          fontSize:meta.avatar*0.52 }}>
        {entry.avatar_emoji||"🧑‍💻"}
      </div>
      <div className="w-1.5 h-1.5 rounded-full mt-1" style={{ background:accent }} />
      <div className="font-black text-center truncate mt-0.5"
        style={{ fontSize:10, color:isMe?"#7C3AED":"#1a1a2e", maxWidth:64 }}>
        {isMe?"You":entry.display_name.split(" ")[0]}
      </div>
      <div className="font-black" style={{ fontSize:10, color:"#7C3AED", marginTop:1 }}>
        {entry.xp.toLocaleString()}
      </div>
      <div className="w-full rounded-t-lg flex items-end justify-center pb-1 mt-1"
        style={{ height:meta.platform,
          background:`linear-gradient(180deg,${meta.ring}28,${meta.ring}0c)`,
          borderTop:`1.5px solid ${meta.ring}55`,
          borderLeft:`1px solid ${meta.ring}33`, borderRight:`1px solid ${meta.ring}33`,
          fontSize:11, color:meta.ring, fontWeight:900 }}>
        {meta.rank}
      </div>
    </motion.div>
  );
}

function LeaderboardRow({ entry, index }: { entry:LeaderboardEntry; index:number }) {
  const isMe = entry.is_current_user;
  const accent = ARENA_ACCENTS[entry.active_arena] ?? "#7C3AED";
  return (
    <motion.div className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
      initial={{ opacity:0,x:10 }} animate={{ opacity:1,x:0 }}
      transition={{ duration:0.3, delay:index*0.04 }}
      style={{ background:isMe?"rgba(124,58,237,0.08)":"rgba(0,0,0,0.02)",
        border:isMe?"1px solid rgba(124,58,237,0.15)":"1px solid transparent" }}>
      <span className="w-5 font-black text-center flex-shrink-0" style={{ fontSize:10, color:"#bbb" }}>{entry.rank}</span>
      <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ background:accent }} />
      <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
        style={{ background:isMe?"rgba(124,58,237,0.1)":"rgba(0,0,0,0.05)", fontSize:13 }}>
        {entry.avatar_emoji||"🧑‍💻"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate" style={{ fontSize:11, color:isMe?"#7C3AED":"#1a1a2e", lineHeight:1 }}>
          {isMe?"You":entry.display_name.split(" ")[0]}
        </div>
        <div style={{ fontSize:9, color:"#bbb", lineHeight:1, marginTop:2 }}>Lv {entry.level}</div>
      </div>
      <div className="font-black flex-shrink-0" style={{ fontSize:11, color:isMe?"#7C3AED":"#333" }}>
        {entry.xp.toLocaleString()}
      </div>
    </motion.div>
  );
}

// ── Progress ring ─────────────────────────────────────────────────────────────
function ProgressRing({ pct, color }: { pct:number; color:string }) {
  const r = 38; const circ = 2*Math.PI*r;
  return (
    <div className="relative flex items-center justify-center" style={{ width:96, height:96 }}>
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${circ*pct} ${circ}`} strokeLinecap="round"
          style={{ transition:"stroke-dasharray 1s cubic-bezier(0.16,1,0.3,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-black leading-none" style={{ fontSize:20, color }}>{Math.round(pct*100)}%</span>
        <span className="text-[10px] font-medium mt-0.5" style={{ color:"rgba(15,28,77,0.5)" }}>Completed</span>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function ChapterMapPage({ onChapterSelect, onBack }: Props) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [lbData,   setLbData]   = useState<{top10:LeaderboardEntry[]}|null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/classroom/chapters").then(r=>r.json()),
      fetch("/api/leaderboard").then(r=>r.ok?r.json():null).catch(()=>null),
    ]).then(([chapData, lb]) => {
      const scienceChaps = (chapData.chapters as Chapter[]).filter(
        c => c.subject==="Science" && c.chapter_number < 90
      );
      setChapters(scienceChaps);
      setLbData(lb);
      setLoading(false);
    });
  }, []);

  const handleClick = (num: number, locked: boolean) => {
    if (locked) return;
    const ch = chapters.find(c => c.chapter_number === num);
    if (ch) onChapterSelect(ch);
  };

  // Count only Chemistry-specific chapters (chapter 1-5)
  const chemChapters = chapters.filter(c => c.chapter_number <= 5);
  const progressPct  = chemChapters.length / 5;

  const lbEntries    = lbData?.top10 ?? [];
  const podium       = lbEntries.slice(0, 3);
  const ranked       = lbEntries.slice(3);

  return (
    <div className="relative overflow-hidden"
      style={{ height:"100dvh", fontFamily:"var(--font-dm-sans,'DM Sans',sans-serif)" }}>

      {/* Background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/classroom/chapter/background.png" alt="" aria-hidden draggable={false}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        style={{ zIndex:0 }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background:"rgba(220,225,255,0.18)", zIndex:1 }} />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="relative flex items-center px-6 py-3.5 gap-4 flex-shrink-0"
        style={{ zIndex:20, background:"rgba(255,255,255,0.9)", backdropFilter:"blur(20px)",
          borderBottom:"1px solid rgba(255,255,255,0.6)",
          boxShadow:"0 2px 20px rgba(15,28,77,0.07)" }}>

        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-70"
          style={{ color:"rgba(15,28,77,0.6)" }}>
          <ChevronLeft className="w-4 h-4" />
          Back to Subjects
        </button>

        <div className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🧪</span>
            <span className="font-display font-black text-2xl tracking-tight" style={{ color:"#0f1c4d" }}>
              CHEMISTRY
            </span>
          </div>
          <span className="text-xs font-medium mt-0.5" style={{ color:"rgba(15,28,77,0.45)" }}>
            CBSE Class 10
          </span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
          style={{ background:"rgba(124,58,237,0.07)", border:"1px solid rgba(124,58,237,0.18)" }}>
          <span className="text-sm">📋</span>
          <span className="text-xs font-bold" style={{ color:"#7C3AED" }}>Board: CBSE</span>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="relative" style={{ height:"calc(100dvh - 57px)", zIndex:10 }}>

        {/* SVG connector lines — drawn behind tiles */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex:2 }}
          viewBox="0 0 100 100" preserveAspectRatio="none">
          {CONNECTORS.map(c => (
            <line key={c.id}
              x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
              stroke="rgba(255,255,255,0.6)" strokeWidth="0.4"
              strokeDasharray="1.8 1.5" strokeLinecap="round" />
          ))}
        </svg>

        {/* Center exam circle — 300px, lock centered over image */}
        <motion.div initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }}
          transition={{ duration:0.5, delay:0.1 }}
          className="absolute"
          style={{ width:300, height:300, zIndex:3,
            top:"calc(50% - 150px)", left:"calc(47% - 150px)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/classroom/chapter/mid_term_exam.png" alt="Integrated Exam Practice"
            className="w-full h-full object-contain select-none" draggable={false} />
          {/* Lock centered over the image */}
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ paddingTop:80 /* push below the title text in the image */ }}>
            <div className="flex items-center justify-center rounded-full"
              style={{ width:40, height:40,
                background:"linear-gradient(180deg,#0B1A2F,#050E1F)",
                border:"1.5px solid rgba(125,211,252,0.65)",
                boxShadow:"0 0 18px rgba(0,212,255,0.55), inset 0 0 10px rgba(0,212,255,0.2)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="#E8F4FF" strokeWidth="1.8"/>
                <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="#E8F4FF" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        </motion.div>

        {/* Chapter tiles */}
        {TILES.map((tile, i) => (
          <motion.div key={tile.key}
            className="absolute"
            style={{ ...tile.style, width:300, zIndex:4, cursor:tile.locked?"not-allowed":"pointer" }}
            initial={{ opacity:0, scale:0.88 }} animate={{ opacity:1, scale:1 }}
            transition={{ duration:0.4, delay:0.2 + i*0.08 }}
            whileHover={!tile.locked ? { scale:1.04 } : {}}
            whileTap={!tile.locked ? { scale:0.97 } : {}}
            onClick={() => handleClick(tile.num, tile.locked)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tile.src} alt={tile.key}
              className="w-full h-auto rounded-2xl select-none"
              draggable={false}
              style={{ boxShadow: tile.locked
                ? "0 4px 16px rgba(15,28,77,0.12)"
                : "0 6px 28px rgba(15,28,77,0.18), 0 0 0 2px rgba(99,102,241,0.3)" }} />
            {tile.locked && <LockMedallion />}
          </motion.div>
        ))}

        {/* Progress card — top-left */}
        <motion.div initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }}
          transition={{ duration:0.45 }}
          className="absolute rounded-2xl p-4"
          style={{ top:20, left:20, width:260, zIndex:5,
            background:"rgba(255,255,255,0.92)", backdropFilter:"blur(20px)",
            border:"1px solid rgba(255,255,255,0.75)",
            boxShadow:"0 8px 32px rgba(15,28,77,0.1)" }}>

          <p className="font-display font-black text-sm mb-3" style={{ color:"#0f1c4d" }}>
            Subject Progress
          </p>

          <div className="flex items-center gap-4 mb-3">
            <ProgressRing pct={progressPct} color="#7C3AED" />
            <div className="space-y-2 flex-1">
              {[
                { label:"Chapters Completed", value:`${chemChapters.length}/5` },
                { label:"Tests Attempted",    value:"—" },
                { label:"Avg. Accuracy",      value:"—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color:"rgba(15,28,77,0.5)" }}>{label}</span>
                  <span className="text-[11px] font-black" style={{ color:"#0f1c4d" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Leaderboard panel — matches hub page exactly */}
        <motion.div initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }}
          transition={{ duration:0.45 }}
          style={{ position:"absolute", top:80, right:20, height:"60%", width:320, zIndex:5,
            display:"flex", flexDirection:"column", borderRadius:16, overflow:"hidden",
            background:"rgba(255,255,255,0.90)", backdropFilter:"blur(20px)",
            boxShadow:"0 8px 32px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.8) inset",
            border:"1px solid rgba(255,255,255,0.75)" }}>

          {/* Header */}
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5"
            style={{ background:"linear-gradient(135deg,rgba(124,58,237,0.10),rgba(0,212,255,0.05))",
              borderBottom:"1px solid rgba(0,0,0,0.06)" }}>
            <span style={{ fontSize:16 }}>🏆</span>
            <span className="font-black tracking-tight flex-1"
              style={{ fontSize:13, color:"#1a1a2e", fontFamily:"var(--font-space-grotesk,'Space Grotesk',sans-serif)" }}>
              Leaderboard
            </span>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color:"#7C3AED" }} />
            </div>
          ) : lbEntries.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p style={{ fontSize:11, color:"#bbb" }}>No data yet</p>
            </div>
          ) : (
            <>
              {podium.length === 3 && (
                <div className="flex-shrink-0 flex items-end gap-1 px-3 pt-4 pb-1"
                  style={{ background:"linear-gradient(180deg,rgba(124,58,237,0.04),transparent)" }}>
                  {PODIUM_META.map(meta => {
                    const entry = podium.find(e=>e.rank===meta.rank);
                    return entry ? <PodiumSpot key={meta.rank} entry={entry} meta={meta} /> : null;
                  })}
                </div>
              )}
              {ranked.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0">
                    <div className="flex-1 h-px" style={{ background:"rgba(0,0,0,0.06)" }} />
                    <span style={{ fontSize:9, color:"#ccc", fontWeight:700, letterSpacing:"0.08em" }}>RANKING</span>
                    <div className="flex-1 h-px" style={{ background:"rgba(0,0,0,0.06)" }} />
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth:"none" }}>
                    <div className="flex flex-col gap-0.5 px-2 pb-2">
                      {ranked.map((e,i) => <LeaderboardRow key={e.rank} entry={e} index={i} />)}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </motion.div>

      </div>
    </div>
  );
}

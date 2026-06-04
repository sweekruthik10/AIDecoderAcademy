"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ARENAS } from "@/lib/arenas";
import { isArenaUnlocked } from "@/lib/objectives";
import type { Profile } from "@/types";

// ── Onboarding modal (shown on first visit when profile is incomplete) ────────

const BOARDS = ["CBSE", "ICSE", "State Board"];
const GRADES = ["6", "7", "8", "9", "10", "11", "12"];
const ACCENT = "#7C3AED";
const ACCENT_GLOW = "rgba(124,58,237,0.4)";

function gradeToAgeGroup(grade: string) {
  const g = parseInt(grade);
  if (g <= 5)  return "5-7";
  if (g <= 7)  return "8-10";
  if (g <= 10) return "11-13";
  return "14+";
}

function getDefaultAvatar(name: string): string {
  const map: Record<string, string> = {
    a:"🦁",b:"🐻",c:"🐱",d:"🐶",e:"🦅",f:"🦊",g:"🦍",h:"🐹",i:"🦔",j:"🐯",
    k:"🦘",l:"🦁",m:"🐭",n:"🦎",o:"🦉",p:"🐼",q:"🦆",r:"🐰",s:"🐍",t:"🐯",
    u:"🦄",v:"🦅",w:"🐺",x:"🦖",y:"🦚",z:"🦓",
  };
  return map[name?.charAt(0).toLowerCase() ?? "s"] ?? "🚀";
}

function OnboardingModal({ initialName, onComplete }: {
  initialName: string;
  onComplete: (profile: Profile) => void;
}) {
  const [step,         setStep]         = useState(0);
  const [displayName,  setDisplayName]  = useState(initialName);
  const [board,        setBoard]        = useState("CBSE");
  const [grade,        setGrade]        = useState("8");
  const [interests,    setInterests]    = useState<string[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile,    setPhotoFile]    = useState<File | null>(null);
  const [saving,       setSaving]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const INTEREST_OPTIONS = [
    "Gaming","Music","Sports","Art","Science","Technology","Movies","Books",
    "Dance","Travel","Cooking","Fashion","Nature","Photography","Math","History",
  ];

  const toggleInterest = (i: string) =>
    setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : prev.length < 8 ? [...prev, i] : prev);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    let avatarUrl: string | null = null;
    if (photoFile) {
      const fd = new FormData();
      fd.append("file", photoFile);
      const r = await fetch("/api/profile/photo", { method: "POST", body: fd });
      if (r.ok) ({ url: avatarUrl } = await r.json());
    }
    const defaultEmoji = getDefaultAvatar(displayName);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: displayName || "Explorer",
        avatar_emoji: defaultEmoji,
        avatar_url:   avatarUrl ?? null,
        age_group:    gradeToAgeGroup(grade),
        interests,
      }),
    });
    if (res.ok) {
      const { profile } = await res.json();
      onComplete(profile);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(6,6,15,0.85)", backdropFilter: "blur(12px)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{ background: "rgba(15,15,26,0.98)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Progress bar */}
        <div className="h-1 w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="h-full transition-all duration-500" style={{ width: step === 0 ? "50%" : "100%", background: ACCENT, boxShadow: `0 0 8px ${ACCENT_GLOW}` }}/>
        </div>

        <div className="px-8 pt-7 pb-8">
          {/* Header */}
          <div className="mb-6">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: ACCENT }}>
              Step {step + 1} of 2
            </span>
            <h2 className="font-display font-black text-2xl text-white mt-1">
              {step === 0 ? "Set up your profile 🚀" : "Personalise your experience ✨"}
            </h2>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
              {step === 0 ? "Add a photo and your name — takes 30 seconds." : "Pick your grade and what you're into."}
            </p>
          </div>

          {step === 0 ? (
            <div className="space-y-5">
              {/* Photo + name */}
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden transition-all hover:opacity-80"
                  style={{ background: "rgba(255,255,255,0.05)", border: `2px dashed ${photoPreview ? ACCENT : "rgba(255,255,255,0.15)"}` }}
                >
                  {photoPreview
                    ? <img src={photoPreview} alt="" className="w-full h-full object-cover"/>
                    : <span className="text-3xl absolute inset-0 flex items-center justify-center">{getDefaultAvatar(displayName)}</span>
                  }
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(0,0,0,0.5)" }}>
                    <span className="text-xs text-white font-bold">Edit</span>
                  </div>
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange}/>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Display Name
                  </label>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your first name"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                    }}
                    onFocus={e => (e.target.style.borderColor = ACCENT)}
                    onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={!displayName.trim()}
                onClick={() => setStep(1)}
                className="w-full font-display font-black py-3.5 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                style={{ background: ACCENT, color: "#fff", boxShadow: `0 0 24px ${ACCENT_GLOW}` }}
              >
                Next →
              </button>
              <p className="text-center text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                Photo is optional — we'll use the emoji if you skip.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Board */}
              <div>
                <label className="block text-[10px] font-bold mb-2.5 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Education Board
                </label>
                <div className="flex gap-2">
                  {BOARDS.map(b => (
                    <button key={b} type="button" onClick={() => setBoard(b)}
                      className="px-4 py-2 rounded-xl text-sm font-bold border transition-all"
                      style={{
                        background: board === b ? `${ACCENT}22` : "rgba(255,255,255,0.04)",
                        borderColor: board === b ? `${ACCENT}60` : "rgba(255,255,255,0.08)",
                        color: board === b ? ACCENT : "rgba(255,255,255,0.4)",
                      }}>
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grade */}
              <div>
                <label className="block text-[10px] font-bold mb-2.5 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Grade / Class
                </label>
                <div className="flex gap-2 flex-wrap">
                  {GRADES.map(g => (
                    <button key={g} type="button" onClick={() => setGrade(g)}
                      className="w-11 h-11 rounded-xl text-sm font-black border transition-all"
                      style={{
                        background: grade === g ? `${ACCENT}22` : "rgba(255,255,255,0.04)",
                        borderColor: grade === g ? `${ACCENT}60` : "rgba(255,255,255,0.08)",
                        color: grade === g ? ACCENT : "rgba(255,255,255,0.4)",
                      }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interests */}
              <div>
                <label className="block text-[10px] font-bold mb-2.5 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Interests <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(pick up to 8)</span>
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                  {INTEREST_OPTIONS.map(i => (
                    <button key={i} type="button" onClick={() => toggleInterest(i)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                      style={{
                        background: interests.includes(i) ? `${ACCENT}22` : "rgba(255,255,255,0.04)",
                        borderColor: interests.includes(i) ? `${ACCENT}60` : "rgba(255,255,255,0.08)",
                        color: interests.includes(i) ? ACCENT : "rgba(255,255,255,0.4)",
                      }}>
                      {i}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setStep(0)}
                  className="px-5 py-3.5 rounded-xl text-sm font-bold border transition-all"
                  style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.03)" }}>
                  ← Back
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="flex-1 font-display font-black py-3.5 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                  style={{ background: ACCENT, color: "#fff", boxShadow: `0 0 24px ${ACCENT_GLOW}` }}>
                  {saving ? "Saving…" : "Launch my journey 🚀"}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Leaderboard types ──────────────────────────────────────────────────────

type LeaderboardEntry = {
  display_name: string;
  avatar_emoji: string;
  xp: number;
  level: number;
  streak_days: number;
  active_arena: number;
  rank: number;
  is_current_user: boolean;
};

type LeaderboardData = {
  top10: LeaderboardEntry[];
  currentUserRank: number | null;
  currentUserEntry: LeaderboardEntry | null;
  isInTop10: boolean;
};

const ARENA_ACCENTS: Record<number, string> = {
  1: "#7C3AED", 2: "#00D4FF", 3: "#FF6B2B",
  4: "#00FF94", 5: "#FF2D78", 6: "#C8FF00",
};

const PODIUM_META = [
  { rank: 2, ring: "#C0C0C0", glow: "rgba(192,192,192,0.35)", platform: 28, avatar: 30, label: "🥈" },
  { rank: 1, ring: "#FFD700", glow: "rgba(255,215,0,0.40)",   platform: 42, avatar: 38, label: "👑" },
  { rank: 3, ring: "#CD7F32", glow: "rgba(205,127,50,0.35)",  platform: 18, avatar: 26, label: "🥉" },
];

function PodiumSpot({ entry, meta }: { entry: LeaderboardEntry; meta: typeof PODIUM_META[0] }) {
  const isMe = entry.is_current_user;
  const accentColor = ARENA_ACCENTS[entry.active_arena] ?? "#7C3AED";
  return (
    <motion.div className="flex flex-col items-center flex-1"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: meta.rank === 1 ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}>
      <div style={{ fontSize: meta.rank === 1 ? 14 : 12, marginBottom: 3 }}>{meta.label}</div>
      <div className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{ width: meta.avatar, height: meta.avatar,
          background: isMe ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.85)",
          border: `2.5px solid ${meta.ring}`, boxShadow: `0 0 10px ${meta.glow}`,
          fontSize: meta.avatar * 0.52 }}>
        {entry.avatar_emoji || "🧑‍💻"}
      </div>
      <div className="w-1.5 h-1.5 rounded-full mt-1.5" style={{ background: accentColor }} />
      <div className="font-black text-center truncate mt-0.5"
        style={{ fontSize: 10, color: isMe ? "#7C3AED" : "#1a1a2e", maxWidth: 64, lineHeight: 1.2 }}>
        {isMe ? "You" : entry.display_name.split(" ")[0]}
      </div>
      <div className="font-black" style={{ fontSize: 10, color: "#7C3AED", marginTop: 1 }}>
        {entry.xp.toLocaleString()}
      </div>
      <div className="w-full rounded-t-lg flex items-end justify-center pb-1 mt-2"
        style={{ height: meta.platform,
          background: `linear-gradient(180deg, ${meta.ring}28, ${meta.ring}0c)`,
          borderTop: `1.5px solid ${meta.ring}55`, borderLeft: `1px solid ${meta.ring}33`,
          borderRight: `1px solid ${meta.ring}33`, fontSize: 11, color: meta.ring, fontWeight: 900 }}>
        {meta.rank}
      </div>
    </motion.div>
  );
}

function LeaderboardRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const isMe = entry.is_current_user;
  const accentColor = ARENA_ACCENTS[entry.active_arena] ?? "#7C3AED";
  return (
    <motion.div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
      style={{ background: isMe ? "rgba(124,58,237,0.08)" : "rgba(0,0,0,0.02)",
        border: `1px solid ${isMe ? "rgba(124,58,237,0.22)" : "transparent"}` }}
      initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}>
      <div className="flex-shrink-0 w-4 text-center font-black" style={{ fontSize: 10, color: "#ccc" }}>
        {entry.rank}
      </div>
      <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} />
      <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
        style={{ background: isMe ? "rgba(124,58,237,0.10)" : "rgba(0,0,0,0.05)", fontSize: 13 }}>
        {entry.avatar_emoji || "🧑‍💻"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate" style={{ fontSize: 11, color: isMe ? "#7C3AED" : "#1a1a2e", lineHeight: 1 }}>
          {isMe ? "You" : entry.display_name.split(" ")[0]}
        </div>
        <div style={{ fontSize: 9, color: "#bbb", lineHeight: 1, marginTop: 2 }}>Lv {entry.level}</div>
      </div>
      {entry.streak_days >= 3 && (
        <div className="flex-shrink-0 flex items-center gap-0.5 font-bold" style={{ fontSize: 9, color: "#FF6B2B" }}>
          🔥{entry.streak_days}
        </div>
      )}
      <div className="flex-shrink-0 text-right">
        <div className="font-black" style={{ fontSize: 11, color: isMe ? "#7C3AED" : "#333", lineHeight: 1 }}>
          {entry.xp.toLocaleString()}
        </div>
        <div style={{ fontSize: 8, color: "#ccc", lineHeight: 1, marginTop: 2 }}>XP</div>
      </div>
    </motion.div>
  );
}

function LeaderboardPanel() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const entries = data?.top10 ?? [];
  const podiumEntries = entries.slice(0, 3);
  const listEntries = entries.slice(3);

  return (
    <div style={{ height: "75%", display: "flex", flexDirection: "column", paddingRight: 12, paddingBottom: 12, paddingTop: 4, overflow: "hidden", fontFamily: "var(--font-space-grotesk,'Space Grotesk',sans-serif)" }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", borderRadius: 16, overflow: "hidden",
        background: "rgba(255,255,255,0.90)", backdropFilter: "blur(20px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.8) inset",
        border: "1px solid rgba(255,255,255,0.75)" }}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5"
          style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.10), rgba(0,212,255,0.05))",
            borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <span style={{ fontSize: 16 }}>🏆</span>
          <span className="font-black tracking-tight flex-1"
            style={{ fontSize: 13, color: "#1a1a2e", fontFamily: "var(--font-space-grotesk,'Space Grotesk',sans-serif)" }}>
            Leaderboard
          </span>
          {!loading && !data?.isInTop10 && data?.currentUserRank && (
            <motion.span initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
              className="font-bold"
              style={{ fontSize: 10, color: "#7C3AED", background: "rgba(124,58,237,0.10)",
                borderRadius: 8, padding: "2px 7px", border: "1px solid rgba(124,58,237,0.18)" }}>
              You · #{data.currentUserRank}
            </motion.span>
          )}
        </div>

        {loading ? (
          <div className="p-3 flex flex-col gap-2">
            <div className="flex gap-2 justify-center mb-1">
              {[28, 38, 26].map((h, i) => (
                <div key={i} className="flex-1 animate-pulse rounded-xl" style={{ height: h + 60, background: "rgba(0,0,0,0.06)" }} />
              ))}
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-8 rounded-xl animate-pulse" style={{ background: "rgba(0,0,0,0.05)" }} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p style={{ fontSize: 11, color: "#bbb" }}>No data yet</p>
          </div>
        ) : (
          <>
            {podiumEntries.length === 3 && (
              <div className="flex-shrink-0 flex items-end gap-1 px-3 pt-4 pb-0"
                style={{ background: "linear-gradient(180deg, rgba(124,58,237,0.04), transparent)" }}>
                {PODIUM_META.map(meta => {
                  const entry = podiumEntries.find(e => e.rank === meta.rank);
                  return entry ? <PodiumSpot key={meta.rank} entry={entry} meta={meta} /> : null;
                })}
              </div>
            )}
            {listEntries.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0">
                <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.06)" }} />
                <span style={{ fontSize: 9, color: "#ccc", fontWeight: 700, letterSpacing: "0.08em" }}>RANKING</span>
                <div className="flex-1 h-px" style={{ background: "rgba(0,0,0,0.06)" }} />
              </div>
            )}
            {listEntries.length > 0 && (
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                <div className="flex flex-col gap-0.5 px-2 pb-2">
                  {listEntries.map((entry, i) => (
                    <LeaderboardRow key={entry.rank} entry={entry} index={i} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const LEFT_PANELS = [
  { arenaId: 1, src: "/panels/ai_explorer.png",  alt: "AI Explorer"   },
  { arenaId: 2, src: "/panels/prompt_lab.png",   alt: "Prompt Lab"    },
  { arenaId: 3, src: "/panels/script.png",        alt: "Story Forge"   },
  { arenaId: 4, src: "/panels/pic_drop.png",      alt: "Visual Studio" },
] as const;

const RIGHT_PANELS = [
  { arenaId: 5, src: "/panels/audio_fusion.png", alt: "Sound Booth"    },
  { arenaId: 6, src: "/panels/video_vision.png", alt: "Script Module"  },
  { arenaId: 7, src: "/panels/slide_skate.png",  alt: "Director Suite" },
] as const;

function PanelImage({ arenaId, src, alt, onClick, locked, imgClass = "hub-img" }: {
  arenaId: number; src: string; alt: string; onClick: (id: number) => void; locked: boolean; imgClass?: string;
}) {
  return (
    <motion.div
      aria-label={alt}
      role="button"
      tabIndex={0}
      aria-disabled={locked}
      className={`${imgClass} relative`}
      style={{
        width:              "100%",
        backgroundImage:    `url(${src})`,
        backgroundSize:     "cover",
        backgroundPosition: "center center",
        cursor:             locked ? "not-allowed" : "pointer",
      }}
      whileHover={locked ? {} : { scale: 1.02 }}
      whileTap={locked   ? {} : { scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => onClick(arenaId)}
    >
      {locked && (
        <>
          {/* Minimal frost — just enough to soften the panel art so the
              lock medallion has a clean focal point. Text in the panel art
              stays readable. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backdropFilter:       "blur(1px) saturate(90%)",
              WebkitBackdropFilter: "blur(1px) saturate(90%)" as unknown as string,
              background:           "rgba(8,16,32,0.05)",
              pointerEvents:        "none",
            }}
          />

          {/* Focal lock medallion on top of the frost. */}
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width:       46,
                height:      46,
                background:  "linear-gradient(180deg, #0B1A2F 0%, #050E1F 100%)",
                border:      "1.5px solid rgba(125,211,252,0.7)",
                boxShadow:
                  "0 0 22px rgba(0,212,255,0.55), inset 0 0 12px rgba(0,212,255,0.22)",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="#E8F4FF" strokeWidth="1.8"/>
                <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="#E8F4FF" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

export default function HubPage() {
  const router = useRouter();
  const [profile,        setProfile]        = useState<Profile | null>(null);
  const [transitioning,  setTransitioning]  = useState<number | null>(null);
  const [videoError,     setVideoError]     = useState(false);
  const [lockedToast,    setLockedToast]    = useState<number | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [initialName,    setInitialName]    = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : { profile: null })
      .then(({ profile }) => {
        if (!profile || !(profile.display_name && profile.age_group)) {
          setInitialName(profile?.display_name ?? "");
          setShowOnboarding(true);
        } else {
          setProfile(profile);
        }
      })
      .catch(() => {});
  }, []);

  const handleClick = useCallback((arenaId: number) => {
    if (!isArenaUnlocked(arenaId)) {
      setLockedToast(arenaId);
      setTimeout(() => setLockedToast(null), 2200);
      return;
    }
    setLockedToast(null);
    setTransitioning(arenaId);
    setVideoError(false);
  }, []);

  useEffect(() => {
    if (transitioning === null) return;
    const t = setTimeout(() => router.push(`/dashboard/world/${transitioning}`), 8000);
    return () => clearTimeout(t);
  }, [transitioning, router]);

  const goToWorld = useCallback(() => {
    if (transitioning !== null) router.push(`/dashboard/world/${transitioning}`);
  }, [transitioning, router]);

  const firstName = (profile?.display_name ?? "Explorer").split(" ")[0];

  return (
    <div className="relative w-full flex flex-col overflow-hidden"
      style={{ height: "100dvh", fontFamily: "var(--font-dm-sans,'DM Sans',sans-serif)" }}>

      {/* Onboarding modal — shown on first visit when profile is incomplete */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingModal
            initialName={initialName}
            onComplete={(p) => {
              setProfile(p);
              setShowOnboarding(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Responsive styles */}
      <style>{`
        .hub-grid { grid-template-columns: 23fr 34fr 23fr 20fr; }
        .hub-spacer { height: 18%; }
        .hub-col-left  { padding-left: 12px; padding-top: 60px; transform: translateX(120px); overflow: hidden; }
        .hub-col-right { padding-right: 12px; padding-top: 60px; overflow: hidden; }
        .hub-img      { display: block; width: 100%; height: calc((100dvh - 38dvh - 68px) / 4); margin: 0; padding: 0; }
        .hub-img-right { display: block; width: 100%; height: calc((100dvh - 38dvh - 68px) / 3); margin: 0; padding: 0; }
        @media (max-width: 1280px) {
          .hub-grid { grid-template-columns: 25fr 30fr 25fr 20fr; }
        }
        @media (max-width: 1100px) {
          .hub-grid { grid-template-columns: 26fr 48fr 26fr 0fr; }
          .hub-leaderboard { display: none; }
        }
        @media (max-height: 760px) {
          .hub-spacer { height: 14%; }
          .hub-col-left  { padding-top: 32px; }
          .hub-col-right { padding-top: 32px; }
          .hub-img       { height: calc((100dvh - 20dvh - 60px) / 4); }
          .hub-img-right { height: calc((100dvh - 20dvh - 60px) / 3); }
        }
        @media (max-height: 600px) {
          .hub-spacer { height: 10%; }
          .hub-col-left  { padding-top: 16px; }
          .hub-col-right { padding-top: 16px; }
          .hub-img       { height: calc((100dvh - 20dvh - 60px) / 4); }
          .hub-img-right { height: calc((100dvh - 20dvh - 60px) / 3); }
        }
      `}</style>

      {/* Background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/panels/background.png" alt="" aria-hidden draggable={false}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        style={{ zIndex: 0 }} />

      {/* Title spacer + stats bar */}
      <div className="hub-spacer relative flex-shrink-0" style={{ zIndex: 10 }}>
        <div className="absolute bottom-[-24px]" style={{ left: "44%", transform: "translateX(-50%)" }}>
          <div className="flex items-center px-4 py-2 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(16px)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid rgba(255,255,255,0.7)",
              whiteSpace: "nowrap" }}>
            {[
              { icon: "📄", label: "Projects",   value: "24"  },
              { icon: "⭐", label: "Creations",  value: "156" },
              { icon: "⏱",  label: "Time Saved", value: "82h" },
              { icon: "✨", label: "AI Credits", value: "450" },
            ].map((s, i) => (
              <div key={s.label} className="flex items-center">
                {i > 0 && <div className="w-px h-6 mx-3" style={{ background: "rgba(0,0,0,0.08)" }} />}
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{s.icon}</span>
                  <div>
                    <div className="font-black text-[13px] leading-none" style={{ color: "#1a1a2e" }}>{s.value}</div>
                    <div className="text-[10px] leading-none mt-0.5" style={{ color: "#aaa" }}>{s.label}</div>
                  </div>
                </div>
              </div>
            ))}
            <div className="w-px h-6 mx-3" style={{ background: "rgba(0,0,0,0.08)" }} />
            <div className="text-[12px] font-medium" style={{ color: "#666" }}>
              Welcome back, <span className="font-black" style={{ color: "#7C3AED" }}>{firstName}!</span> 👋
            </div>
            <div className="ml-3 w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0"
              style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.15),rgba(124,58,237,0.3))",
                border: "2px solid rgba(124,58,237,0.3)" }}>
              {profile?.avatar_emoji ?? "🧑‍💻"}
            </div>
          </div>
        </div>
      </div>

      {/* 4-column panel grid */}
      <div className="hub-grid relative flex-1 min-h-0"
        style={{ display: "grid", gridTemplateRows: "100%", gap: "0", overflow: "hidden", zIndex: 10 }}>

        {/* Left — 4 images */}
        <div className="hub-col-left">
          {LEFT_PANELS.map(p => (
            <PanelImage key={p.arenaId} arenaId={p.arenaId} src={p.src} alt={p.alt} onClick={handleClick}
              locked={!isArenaUnlocked(p.arenaId)} />
          ))}
        </div>

        {/* Center — transparent */}
        <div />

        {/* Right — 3 images, same row height as left so 05↔01, 06↔02, 07↔03 */}
        <div className="hub-col-right">
          {RIGHT_PANELS.map(p => (
            <PanelImage key={p.arenaId} arenaId={p.arenaId} src={p.src} alt={p.alt} onClick={handleClick}
              locked={!isArenaUnlocked(p.arenaId)} imgClass="hub-img" />
          ))}
        </div>

        {/* Far right — leaderboard */}
        <div className="hub-leaderboard">
          <LeaderboardPanel />
        </div>
      </div>

      {/* Locked toast */}
      <AnimatePresence>
        {lockedToast !== null && (
          <motion.div key="locked"
            initial={{ opacity: 0, y: 12, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 -translate-x-1/2 z-[9000] px-5 py-3 rounded-2xl"
            style={{ bottom: 80, background: "rgba(255,255,255,0.97)",
              border: "1px solid rgba(239,68,68,0.3)", boxShadow: "0 8px 32px rgba(0,0,0,0.14)" }}>
            <p className="text-sm font-bold text-center" style={{ color: "#1a1a2e" }}>
              🔒 Complete the previous module first
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video transition overlay */}
      <AnimatePresence>
        {transitioning !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }} className="fixed inset-0 bg-black" style={{ zIndex: 9999 }}>
            {!videoError ? (
              <video key={transitioning} src={`/transitions/arena-${transitioning}.mp4`}
                autoPlay playsInline className="absolute inset-0 w-full h-full object-cover"
                onEnded={goToWorld} onError={() => setVideoError(true)} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center"
                style={{ background: `radial-gradient(ellipse at center, ${ARENAS.find(a => a.id === transitioning)?.accent ?? "#7C3AED"}33 0%, #000 70%)` }}>
                <div className="text-center">
                  <div className="text-6xl mb-4 animate-bounce">{ARENAS.find(a => a.id === transitioning)?.emoji ?? "🚀"}</div>
                  <p className="font-black text-white text-xl tracking-tight">
                    Entering {ARENAS.find(a => a.id === transitioning)?.name ?? "module"}…
                  </p>
                </div>
              </div>
            )}
            <button onClick={goToWorld}
              className="absolute top-5 right-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white/60 hover:text-white border border-white/20 hover:border-white/40 transition-all"
              style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.4)" }}>
              Skip →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

// Learner Stats — RPG-style stat bars + AIDA-notices card + weekly recs.
// Canon: ../../obsidian/AIDA/AIDA Dev/Adaptive Learner/references/architecture-decisions.md
//        §"Decision 3 — Profile Visualization — Game-Like Motivation".
//
// Design direction: Editorial-meets-retro-arcade. Capital uppercase eyebrow
// labels in JetBrains Mono, Syne for the big numbers, DM Sans body.
// Bars are double-clad: a thin chrome rail above, a soft inner glow inside.
// The five categories are colour-coded by what each maps to in the playground.

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Sparkles, TrendingUp, Zap } from "lucide-react";
import { hydrateLearnerModel, type LearnerModel } from "@/lib/learnerModel";
import type { Profile } from "@/types";

interface LearnerStatsProps {
  profile: Profile & { learner_model?: Record<string, unknown> | null };
  /** Quality / usage counts to drive bars when concept mastery is sparse. */
  outputCounts?: Record<string, number>;
}

interface StatRow {
  key:     string;
  label:   string;
  emoji:   string;
  hue:     string;       // arena-accent style
  level:   number;       // 0..1
  trend:   "up" | "down" | "flat" | "new";
  delta:   number;       // signed value to show next to bar
  count:   number;       // usage samples
}

const CATEGORIES: Array<{ key: string; label: string; emoji: string; hue: string; conceptKeys: string[]; outputTypes: string[] }> = [
  { key: "art",     label: "Art",       emoji: "🎨", hue: "#00D4FF", conceptKeys: ["visual_description", "color_theory", "composition"], outputTypes: ["image"] },
  { key: "story",   label: "Story",     emoji: "📝", hue: "#FF6B2B", conceptKeys: ["narrative_design", "prompt_crafting", "vocabulary"], outputTypes: ["text", "json"] },
  { key: "audio",   label: "Audio",     emoji: "🎵", hue: "#FF2D78", conceptKeys: ["audio_direction", "voice_acting", "scripting"], outputTypes: ["audio"] },
  { key: "present", label: "Presents",  emoji: "📊", hue: "#00FF94", conceptKeys: ["structured_presentation", "outline", "summarisation"], outputTypes: ["slides"] },
  { key: "video",   label: "Video",     emoji: "🎬", hue: "#C8FF00", conceptKeys: ["scene_blocking", "cinematography", "pacing"], outputTypes: ["video"] },
];

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function rowFromModel(
  cat: typeof CATEGORIES[number],
  m: LearnerModel,
  outputCounts: Record<string, number>,
): StatRow {
  let levelSum = 0, levelCount = 0, deltaSum = 0;
  for (const k of cat.conceptKeys) {
    const e = m.cognitive_profile.concept_mastery[k];
    if (!e) continue;
    levelSum += e.level;
    levelCount += 1;
    deltaSum += e.trend_velocity ?? 0;
  }
  let count = 0;
  for (const t of cat.outputTypes) {
    const p = m.cognitive_profile.output_type_preferences[t];
    if (p) count += p.usage_count;
    if (outputCounts[t]) count += outputCounts[t];
  }
  // Fallback: when no concepts have been seeded for the category yet, use
  // creation usage as a weak proxy so the bar shows *something* once the
  // student has done anything at all.
  const fromConcepts = levelCount > 0 ? levelSum / levelCount : null;
  const fromCounts   = count > 0 ? Math.min(0.7, count / 20) : 0;
  const level = clamp01(fromConcepts ?? fromCounts);
  const avgDelta = levelCount > 0 ? deltaSum / levelCount : 0;
  const trend: StatRow["trend"] =
    count > 0 && levelCount === 0 ? "new"
    : avgDelta > 0.03  ? "up"
    : avgDelta < -0.03 ? "down"
    : "flat";
  return {
    key:    cat.key,
    label:  cat.label,
    emoji:  cat.emoji,
    hue:    cat.hue,
    level,
    trend,
    delta:  Math.round(avgDelta * 100),
    count,
  };
}

function StatBar({ row, index, coldStart }: { row: StatRow; index: number; coldStart: boolean }) {
  const widthPct = coldStart ? 0 : Math.round(row.level * 100);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: 0.05 * index, ease: [0.16, 1, 0.3, 1] }}
      className="grid items-center"
      style={{ gridTemplateColumns: "104px 1fr 56px 64px", gap: 12, padding: "6px 0" }}
    >
      {/* Label */}
      <div className="flex items-center gap-2 min-w-0">
        <span style={{ fontSize: 16 }}>{row.emoji}</span>
        <span
          className="uppercase tracking-[0.14em] font-bold truncate"
          style={{
            fontSize: 10.5,
            color:    "rgba(255,255,255,0.78)",
            fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)",
          }}
        >
          {row.label}
        </span>
      </div>

      {/* Bar */}
      <div
        className="relative h-2.5 rounded-full overflow-hidden"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
          border:     "1px solid rgba(255,255,255,0.06)",
          boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.35)",
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${widthPct}%` }}
          transition={{ duration: 0.9, delay: 0.1 + 0.05 * index, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 top-0 h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${row.hue}cc 0%, ${row.hue} 60%, ${row.hue}cc 100%)`,
            boxShadow:  `0 0 12px ${row.hue}88, inset 0 1px 0 rgba(255,255,255,0.3)`,
          }}
        />
        {coldStart && (
          <motion.div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(90deg, transparent, ${row.hue}33, transparent)`,
            }}
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>

      {/* Value */}
      <div className="text-right">
        <span
          style={{
            color:      "#fff",
            fontSize:   13,
            fontFamily: "var(--font-syne,'Syne',sans-serif)",
            fontWeight: 900,
            letterSpacing: "-0.01em",
          }}
        >
          {coldStart ? "—" : `${widthPct}%`}
        </span>
      </div>

      {/* Trend chip */}
      <div className="text-right">
        {!coldStart && row.trend === "up" && (
          <span style={{ color: "#7CFFB2", fontSize: 11, fontWeight: 700 }}>▲ +{Math.abs(row.delta)}%</span>
        )}
        {!coldStart && row.trend === "down" && (
          <span style={{ color: "#FF7C9F", fontSize: 11, fontWeight: 700 }}>▼ {row.delta}%</span>
        )}
        {!coldStart && row.trend === "flat" && (
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700 }}>—</span>
        )}
        {(coldStart || row.trend === "new") && (
          <span
            className="uppercase tracking-widest"
            style={{ color: row.hue, fontSize: 9, fontWeight: 800 }}
          >
            new
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default function LearnerStats({ profile, outputCounts = {} }: LearnerStatsProps) {
  const m = useMemo(() => hydrateLearnerModel(profile.learner_model ?? null), [profile.learner_model]);
  const reflectionCount = m.reflection_count ?? 0;
  const coldStart = reflectionCount === 0 && Object.values(outputCounts).every(c => !c);
  const rows = useMemo(
    () => CATEGORIES.map(cat => rowFromModel(cat, m, outputCounts)),
    [m, outputCounts],
  );

  // Edge case 14: 5-7 year olds get a friendly "stars collected" view instead
  // of stat bars + percentages. Confidence-eroding numbers don't help here.
  if (profile.age_group === "5-7") {
    const totalCreations = Object.values(outputCounts).reduce((s, n) => s + (n ?? 0), 0);
    const stars = Math.min(50, totalCreations);
    return (
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-3xl p-6"
        style={{
          background: "linear-gradient(135deg, rgba(255,213,124,0.10), rgba(124,168,255,0.10))",
          border:     "1px solid rgba(255,213,124,0.30)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div
          className="uppercase tracking-[0.22em] mb-2"
          style={{
            fontSize: 9.5, color: "#FFD57C", fontWeight: 800,
            fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)",
          }}
        >
          Stars Collected
        </div>
        <div
          style={{
            fontFamily: "var(--font-syne,'Syne',sans-serif)",
            color: "#fff", fontSize: 28, fontWeight: 900, lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          You&apos;ve made {totalCreations} thing{totalCreations === 1 ? "" : "s"}!
        </div>
        <div className="mt-3 text-2xl tracking-wider" aria-label={`${stars} stars`}>
          {"⭐".repeat(stars) || "✨"}
        </div>
        <p className="mt-3 text-[13px] text-white/75 leading-relaxed">
          Keep playing — every creation is a star.
        </p>
      </motion.section>
    );
  }

  const weekly = m.weekly_analysis;
  const strengths = m.cognitive_profile.top_strengths.slice(0, 3);
  const growth    = m.cognitive_profile.top_growth_areas.slice(0, 3);

  // Pick a weekly focus: the lowest-level category with at least some samples,
  // or the first recommendation from the weekly cron — whichever is fresher.
  const focusFromRec = weekly?.recommendations?.[0];
  const focusFromBar = [...rows].filter(r => r.count > 0).sort((a, b) => a.level - b.level)[0];
  const focusText = focusFromRec
    ?? (focusFromBar
        ? `Your ${focusFromBar.label.toLowerCase()} bar is lowest — try 2 ${focusFromBar.label.toLowerCase()} creations this week.`
        : "Make your first creation to set a baseline.");

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-3xl overflow-hidden"
      style={{
        background: "linear-gradient(170deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
        border:     "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(24px)",
        boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* Top hairline */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.55) 30%, rgba(124,58,237,0.55) 70%, transparent)",
        }}
      />

      <div className="p-5 md:p-6">
        {/* Heading */}
        <div className="flex items-end justify-between mb-4">
          <div>
            <div
              className="uppercase tracking-[0.22em] mb-1"
              style={{
                fontSize: 9.5,
                color: "#7AD7FF",
                fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)",
                fontWeight: 800,
              }}
            >
              Your Creator Stats
            </div>
            <h2
              style={{
                fontFamily: "var(--font-syne,'Syne',sans-serif)",
                color:      "#fff",
                fontSize:   22,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              {coldStart
                ? "Your stats are coming to life…"
                : reflectionCount === 1
                  ? "First read — still settling in"
                  : `Read from ${reflectionCount} sessions`}
            </h2>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Overall</div>
            <div
              style={{
                fontFamily: "var(--font-syne,'Syne',sans-serif)",
                color:      "#fff",
                fontSize:   28,
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1,
              }}
            >
              {coldStart
                ? "—"
                : Math.round(rows.reduce((s, r) => s + r.level, 0) / rows.length * 100) + "%"}
            </div>
          </div>
        </div>

        {/* Bars */}
        <div className="border-t border-white/[0.06] pt-2">
          {rows.map((r, i) => (
            <StatBar key={r.key} row={r} index={i} coldStart={coldStart} />
          ))}
        </div>

        {/* Insights row */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* AIDA notices */}
          <div
            className="relative rounded-2xl p-4"
            style={{
              background: "linear-gradient(180deg, rgba(0,212,255,0.06), rgba(124,58,237,0.04))",
              border:     "1px solid rgba(125, 211, 252, 0.18)",
              boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} style={{ color: "#7AD7FF" }} />
              <span
                className="uppercase tracking-[0.18em]"
                style={{
                  fontSize: 9,
                  color: "#7AD7FF",
                  fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)",
                  fontWeight: 800,
                }}
              >
                AIDA Notices
              </span>
            </div>
            {coldStart ? (
              <p className="text-[13px] leading-relaxed text-white/70">
                Start creating in the playground and AIDA will begin learning how you think.
              </p>
            ) : (
              <p className="text-[13px] leading-relaxed text-white/80">
                {weekly?.weekly_summary && weekly.weekly_summary.length > 0 ? (
                  weekly.weekly_summary
                ) : strengths.length > 0 ? (
                  <>
                    You&apos;re strong in <span className="text-white font-semibold">{strengths[0].concept.replace(/_/g, " ")}</span>
                    {growth[0] ? (
                      <> and there&apos;s room to grow in <span className="text-white font-semibold">{growth[0].concept.replace(/_/g, " ")}</span>.</>
                    ) : "."}
                  </>
                ) : (
                  "I'm still getting a read on your style — keep going and I'll spot patterns."
                )}
              </p>
            )}
          </div>

          {/* Weekly focus */}
          <div
            className="relative rounded-2xl p-4"
            style={{
              background: "linear-gradient(180deg, rgba(200,255,0,0.05), rgba(0,255,148,0.03))",
              border:     "1px solid rgba(200,255,0,0.22)",
              boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} style={{ color: "#C8FF00" }} />
              <span
                className="uppercase tracking-[0.18em]"
                style={{
                  fontSize: 9,
                  color: "#C8FF00",
                  fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)",
                  fontWeight: 800,
                }}
              >
                This Week&apos;s Focus
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-white/80">{focusText}</p>
            {(weekly?.plateau_warnings?.length ?? 0) > 0 && (
              <div className="mt-2 text-[11px] flex items-center gap-1 text-white/55">
                <TrendingUp size={11} />
                {weekly!.plateau_warnings[0]}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

"use client";

// TeacherViewCard — "How your teachers see you".
//
// Two index-card style dossiers, one per AI teacher, written in the voice
// of that teacher. Mirrors the editorial-meets-retro-arcade direction of
// LearnerStats: JetBrains Mono eyebrow caps, Syne display, DM Sans body.
//
// Bhavna  — Classroom teacher  — navy / gold / violet palette.
// Validator — Skeptical mentor — steel-blue / grey palette.
//
// Everything is derived from the learner_model JSONB and re-phrased into
// plain, student-facing language. No raw concept keys, no JSON, no jargon.

import { motion } from "framer-motion";
import { useMemo } from "react";
import { hydrateLearnerModel } from "@/lib/learnerModel";
import type { Profile } from "@/types";

interface TeacherViewCardProps {
  profile: Profile;
  learner_model?: Record<string, unknown> | null;
}

// ── Plain-language maps — never surface raw enum/concept keys ────────────────
const PACE: Record<string, { icon: string; label: string }> = {
  fast:     { icon: "🚀", label: "Quick pace" },
  moderate: { icon: "➡️", label: "Steady pace" },
  careful:  { icon: "🐢", label: "Careful pace" },
};

const EXPLAIN: Record<string, string> = {
  step_by_step: "Step by step",
  narrative:    "Through stories",
  visual:       "Pictures & visuals",
  analogy:      "Everyday analogies",
  mixed:        "A mix of styles",
};

const HUMOR: Record<string, string> = {
  none:    "Keeps it straightforward",
  light:   "A little light humour",
  playful: "Playful and fun",
};

const HELP_SEEKING: Record<string, string> = {
  immediate:     "Asks for help early",
  after_attempt: "Tries first, then asks",
  independent:   "Likes to work it out solo",
};

const CONFIDENCE: Record<string, string> = {
  underconfident: "Underrates their own work",
  accurate:       "Reads their progress honestly",
  overconfident:  "Confident — runs ahead of the proof",
  unknown:        "Still getting a read",
};

/** "prompt_crafting" → "prompt crafting" — strips key formatting only. */
function humanizeConcept(raw: string): string {
  return raw.replace(/_/g, " ").trim();
}

// ── A single labelled row inside a card ─────────────────────────────────────
function CardRow({
  k, v, accent,
}: { k: string; v: string; accent: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span
        className="uppercase tracking-[0.16em] shrink-0"
        style={{
          fontSize: 9,
          fontWeight: 800,
          color: accent,
          fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)",
        }}
      >
        {k}
      </span>
      <span
        className="text-right leading-snug"
        style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}
      >
        {v}
      </span>
    </div>
  );
}

// ── One teacher's dossier card ──────────────────────────────────────────────
interface MiniCardProps {
  index:     number;
  iconSrc?:  string;        // teacher face image (replaces emoji when present)
  emoji?:    string;        // fallback when iconSrc not provided
  title:     string;
  role:      string;
  accent:    string;        // primary accent (eyebrow / labels)
  accent2:   string;        // secondary accent (used in quote rule)
  gradient:  string;        // card background
  border:    string;
  glow:      string;
  rows:      Array<{ k: string; v: string }>;
  quote:     string;
  empty:     string | null; // cold-start message, or null when there's data
}

function MiniCard({
  index, iconSrc, emoji, title, role, accent, accent2, gradient, border, glow, rows, quote, empty,
}: MiniCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.08 * index, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: gradient,
        border: `1px solid ${border}`,
        backdropFilter: "blur(20px)",
        boxShadow: `0 18px 44px -22px ${glow}, inset 0 1px 0 rgba(255,255,255,0.07)`,
      }}
    >
      {/* Top hairline in the teacher's accent */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      {/* Corner glow */}
      <div
        aria-hidden
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: accent, filter: "blur(46px)", opacity: 0.16 }}
      />

      <div className="relative p-5 flex flex-col gap-3.5 h-full">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{
              background: `linear-gradient(135deg, ${accent}33, ${accent2}1a)`,
              border: `1.5px solid ${accent}55`,
            }}
          >
            {iconSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={iconSrc} alt="" className="w-full h-full"
                style={{ objectFit: "cover" }} />
            ) : (
              <span className="text-xl">{emoji}</span>
            )}
          </div>
          <div className="min-w-0">
            <div
              className="uppercase tracking-[0.2em] mb-0.5"
              style={{
                fontSize: 8.5,
                fontWeight: 800,
                color: accent,
                fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)",
              }}
            >
              {role}
            </div>
            <h3
              className="leading-none truncate"
              style={{
                fontFamily: "var(--font-syne,'Syne',sans-serif)",
                fontSize: 16,
                fontWeight: 900,
                color: "#fff",
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h3>
          </div>
        </div>

        {empty ? (
          /* Cold start — no reflections yet */
          <div
            className="rounded-xl px-3.5 py-4 text-[12.5px] leading-relaxed"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px dashed rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            {empty}
          </div>
        ) : (
          <>
            {/* Stat rows */}
            <div className="border-t border-white/[0.07] pt-1">
              {rows.map(r => (
                <CardRow key={r.k} k={r.k} v={r.v} accent={accent} />
              ))}
            </div>

            {/* Quote — written in the teacher's own voice */}
            <div
              className="mt-auto rounded-xl px-3.5 py-3 relative"
              style={{
                background: `linear-gradient(180deg, ${accent}1f, ${accent2}10)`,
                border: `1px solid ${accent}33`,
              }}
            >
              <span
                aria-hidden
                className="absolute -top-1 left-3 select-none"
                style={{
                  fontFamily: "var(--font-syne,'Syne',sans-serif)",
                  fontSize: 30,
                  lineHeight: 1,
                  color: `${accent}66`,
                }}
              >
                &ldquo;
              </span>
              <p
                className="italic leading-relaxed pl-3"
                style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)" }}
              >
                {quote}
              </p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────
export default function TeacherViewCard({ profile, learner_model }: TeacherViewCardProps) {
  const m = useMemo(() => hydrateLearnerModel(learner_model ?? null), [learner_model]);

  const name        = profile.display_name || "this student";
  const reflections = m.reflection_count ?? 0;
  const coldStart   = reflections === 0;

  const lp  = m.learning_style_profile;
  const cp  = m.communication_preferences;
  const cog = m.cognitive_profile;

  const topStrength = cog.top_strengths[0]?.concept
    ? humanizeConcept(cog.top_strengths[0].concept)
    : null;
  const topGrowth = cog.top_growth_areas[0]?.concept
    ? humanizeConcept(cog.top_growth_areas[0].concept)
    : null;

  const pace = PACE[lp.pace_preference] ?? PACE.moderate;

  // ── Bhavna's dossier ──────────────────────────────────────────────────────
  const bhavnaRows = [
    { k: "Pace",  v: `${pace.icon}  ${pace.label}` },
    { k: "Style", v: EXPLAIN[cp.explanation_preference] ?? EXPLAIN.mixed },
    { k: "Humor", v: HUMOR[cp.humor_level] ?? HUMOR.light },
    { k: "Focus", v: topGrowth ? `Building up ${topGrowth} — small steps` : "Finding a baseline together" },
  ];

  const bhavnaQuote = topStrength
    ? `${name} does really well with ${topStrength}. I'll lean on that strength when we hit something new today.`
    : `${name} is just getting started with me — I'll keep each step small, clear, and encouraging.`;

  // ── Validator's assessment ────────────────────────────────────────────────
  const validatorRows = [
    { k: "Self-read", v: CONFIDENCE[lp.confidence_calibration] ?? CONFIDENCE.unknown },
    { k: "When stuck", v: HELP_SEEKING[lp.help_seeking] ?? HELP_SEEKING.after_attempt },
    { k: "Strength on record", v: topStrength ? `Solid ${topStrength}` : "Not yet established" },
    { k: "Watching", v: topGrowth ? `Proof of ${topGrowth}` : "First submission" },
  ];

  const validatorQuote = (() => {
    switch (lp.confidence_calibration) {
      case "overconfident":
        return `${name} moves with confidence — good. I'll keep asking for the proof behind each claim before I sign off.`;
      case "underconfident":
        return `${name}'s work is stronger than they give it credit for. I grade what's on the page, not the doubt around it.`;
      case "accurate":
        return `${name} reads their own progress honestly. My job is just to confirm the evidence holds up.`;
      default:
        return `I check ${name}'s work against the rubric — evidence first, every time. No marks for guesswork.`;
    }
  })();

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Section heading */}
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="font-display font-black text-xl text-white flex items-center gap-2">
          <span className="text-2xl">🪞</span> Through Your Teachers&apos; Eyes
        </h2>
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30">
          {coldStart ? "no notes yet" : `from ${reflections} session${reflections === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bhavna — navy / gold / violet */}
        <MiniCard
          index={0}
          iconSrc="/classroom/teacher-bhavna-face.png"
          title="Ms. Bhavna's Notes"
          role="Classroom Teacher"
          accent="#E8B84B"
          accent2="#8B7CFF"
          gradient="linear-gradient(165deg, rgba(30,32,68,0.72) 0%, rgba(18,18,38,0.9) 100%)"
          border="rgba(232,184,75,0.26)"
          glow="rgba(232,184,75,0.32)"
          rows={bhavnaRows}
          quote={bhavnaQuote}
          empty={coldStart ? `Ms. Bhavna hasn't taught ${name} yet — take a class and her notes will appear here.` : null}
        />

        {/* Validator — steel-blue / grey */}
        <MiniCard
          index={1}
          iconSrc="/classroom/teacher-validator-face.png"
          title="Validator's Assessment"
          role="Skeptical Mentor"
          accent="#8FB0D4"
          accent2="#5E7A9E"
          gradient="linear-gradient(165deg, rgba(28,36,48,0.78) 0%, rgba(16,20,28,0.92) 100%)"
          border="rgba(143,176,212,0.24)"
          glow="rgba(143,176,212,0.28)"
          rows={validatorRows}
          quote={validatorQuote}
          empty={coldStart ? `The Validator hasn't reviewed ${name}'s work yet — submit something and the verdict lands here.` : null}
        />
      </div>
    </motion.section>
  );
}

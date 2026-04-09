// Classroom Teacher (Bhavna) — greeting builder.
// Reads the shared learner_model but adapts as an *instructor*, not a companion.
// Canon: references/teacher-persona.md §"Teacher's Awareness of Learner Model".
//
// ROLE: The Teacher owns curriculum progression (chapters in order), tracks
// assignments, and pushes for mastery. She is NOT AIDA — she does not follow
// tangents or explore creatively. She pushes students through the syllabus.
// AIDA handles everything else. This distinction is critical.

import type { LearnerModel } from "@/lib/learnerModel";
import { hydrateLearnerModel } from "@/lib/learnerModel";

const ARENA_NAMES: Record<number, string> = {
  1: "the AI Explorer Arena",
  2: "the Prompt Lab",
  3: "the Story Forge",
  4: "the Visual Studio",
  5: "the Sound Booth",
  6: "the Director's Suite",
};

export interface GreetingInputs {
  displayName: string;
  activeArena?: number | null;
  isReturning?: boolean;
  learnerModelRaw?: Record<string, unknown> | null;
  // Curriculum tracking — Teacher owns this, AIDA does not
  currentChapter?: { id: string; title: string; order: number } | null;
  totalChapters?: number;
  lastChapterScore?: number | null;     // Validator score on last submitted attempt
  pendingWorksheet?: string | null;      // Title of incomplete worksheet
  pendingObjective?: string | null;      // Title of incomplete objective
}

export interface Greeting {
  /** What appears in the speech bubble (markdown allowed). */
  text: string;
  /** Stripped of markdown, what the TTS reads aloud (≤ 220 chars). */
  spoken: string;
}

function firstName(name: string): string {
  return (name || "Explorer").split(/\s+/)[0];
}

function pickStrength(m: LearnerModel): string | null {
  const top = m.cognitive_profile.top_strengths[0];
  if (!top) return null;
  return top.concept.replace(/_/g, " ");
}

function pickGrowth(m: LearnerModel): string | null {
  const top = m.cognitive_profile.top_growth_areas[0];
  if (!top) return null;
  return top.concept.replace(/_/g, " ");
}

// ── Chapter helper ──────────────────────────────────────────────────────────

function chapterStatus(p: GreetingInputs): string | null {
  if (!p.currentChapter) return null;
  const ch = p.currentChapter;
  const total = p.totalChapters ?? 0;

  // Pending worksheet/objective — must complete before advancing
  if (p.pendingWorksheet) {
    return `${p.pendingWorksheet} needs to be submitted before we move on.`;
  }
  if (p.pendingObjective) {
    return `You have an outstanding objective: "${p.pendingObjective}". Let's finish that first.`;
  }

  // Mastery push — retry if score too low
  if (p.lastChapterScore != null && p.lastChapterScore < 80) {
    const score = Math.round(p.lastChapterScore);
    return `You scored ${score}% on "${ch.title}". Let's review and retry — I want to see you hit 80% before we advance.`;
  }

  // Normal progress
  if (total > 0) {
    return `You're on "${ch.title}" (${ch.order} of ${total}). Let's keep the momentum going.`;
  }
  return null;
}

export function buildClassroomGreeting(p: GreetingInputs): Greeting {
  const name = firstName(p.displayName);
  const arena = p.activeArena ? ARENA_NAMES[p.activeArena] ?? null : null;

  // ── Chapter progress (Teacher owns this — AIDA doesn't touch it) ──────────
  const chapterNote = chapterStatus(p);

  // ── Cold start — no learner data yet ──────────────────────────────────
  if (!p.learnerModelRaw || Object.keys(p.learnerModelRaw).length === 0) {
    if (p.isReturning) {
      const text = chapterNote
        ? `Welcome back, ${name}. ${chapterNote}`
        : `Welcome back, ${name}. Pick a chapter and we'll begin where you left off.`;
      return { text, spoken: text.slice(0, 220) };
    }
    const text = `Welcome to the classroom, ${name}. I'm your teacher here at AI Decoder Academy. ${arena ? `I see you've been exploring ${arena} in the playground — that's a lovely place to start.` : ""} When you're ready, choose a chapter from the wall and we'll begin.`;
    return { text, spoken: text };
  }

  const m = hydrateLearnerModel(p.learnerModelRaw);
  const strength = pickStrength(m);
  const growth   = pickGrowth(m);

  const lines: string[] = [];
  lines.push(p.isReturning ? `Welcome back, ${name}.` : `Welcome to the classroom, ${name}.`);

  // Chapter progress takes priority (Teacher owns curriculum)
  if (chapterNote) {
    lines.push(chapterNote);
  } else {
    if (arena) lines.push(`I noticed you've been spending time in ${arena}.`);
    if (strength && m.reflection_count >= 2) {
      lines.push(`You're doing well with ${strength} — we'll lean on that today.`);
    }
    if (growth && m.reflection_count >= 3) {
      lines.push(`We'll also take a careful look at ${growth} — small steps, no rush.`);
    }
  }

  // ── Curriculum push: never let them plateau ─────────────────────────
  if (!chapterNote && m.reflection_count >= 3 && !p.currentChapter) {
    const lowBars = Object.entries(m.cognitive_profile.concept_mastery)
      .filter(([, v]) => v.level < 0.4 && v.sample_count >= 3)
      .sort(([, a], [, b]) => a.level - b.level)
      .slice(0, 1);
    if (lowBars.length > 0) {
      const skill = lowBars[0][0].replace(/_/g, " ");
      lines.push(`I'd like to focus on ${skill} today. Let's work through it together.`);
    }
  }

  const text   = lines.join(" ");
  const spoken = lines.slice(0, 3).join(" ").slice(0, 220);
  return { text, spoken };
}

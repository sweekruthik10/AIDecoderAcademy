// Merge engine — exponential decay + surface-weighted confidence.
// Canon: references/storage-schema.md §"How Merging Works" and
// references/architecture-decisions.md §"Decision 2".

import type {
  AdaptationEntry,
  ConceptEntry,
  LearnerModel,
  ReflectionSurface,
  SessionMetrics,
  SessionReflectionResult,
  Trend,
} from "./types";
import { defaultLearnerModel, hydrateLearnerModel } from "./types";

export const DECAY_RATE = 0.7;            // existing share when merging new signal
export const NEW_CONCEPT_BASE_CONFIDENCE = 0.3;
export const STRUGGLE_DAMPING = 0.5;      // struggles affect level half as hard as demonstrations

export const SURFACE_WEIGHTS: Record<ReflectionSurface, number> = {
  validator:         0.9,
  classroom_test:    0.8,
  classroom_teacher: 0.7,
  playground:        0.6,
  aida_chat:         0.4,
  diagnostic:        0.3,
  weekly_cron:       0.5,
};

export function toConceptKey(concept: string): string {
  return concept.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function computeTrend(entry: ConceptEntry, newSignal: number): Trend {
  if (entry.sample_count < 3) return "insufficient_data";
  const delta = newSignal - entry.level;
  if (delta > 0.05) return "improving";
  if (delta < -0.05) return "declining";
  return "stable";
}

function updateTopLists(model: LearnerModel): void {
  const entries = Object.entries(model.cognitive_profile.concept_mastery)
    .map(([concept, e]) => ({ concept, level: e.level, confidence: e.confidence }));
  // Only count concepts with at least minimal confidence — avoid one-shot anomalies.
  const trustworthy = entries.filter(e => e.confidence >= 0.35);
  const sortedDesc = [...trustworthy].sort((a, b) => b.level - a.level);
  const sortedAsc  = [...trustworthy].sort((a, b) => a.level - b.level);
  model.cognitive_profile.top_strengths    = sortedDesc.slice(0, 5).map(e => ({ concept: e.concept, level: e.level }));
  model.cognitive_profile.top_growth_areas = sortedAsc.slice(0, 5).map(e => ({ concept: e.concept, level: e.level }));
}

export function mergeReflection(
  existing: Partial<LearnerModel> | null | undefined,
  reflection: SessionReflectionResult,
  surface: ReflectionSurface,
  metrics?: SessionMetrics,
): LearnerModel {
  const weight = SURFACE_WEIGHTS[surface] ?? 0.5;
  const updated = hydrateLearnerModel(existing);
  const nowIso = new Date().toISOString();

  // 1) concepts_demonstrated → boost level
  for (const demo of reflection.concepts_demonstrated ?? []) {
    const key = toConceptKey(demo.concept);
    if (!key) continue;
    const entry = updated.cognitive_profile.concept_mastery[key];
    const signal = clamp01(demo.confidence);
    if (entry) {
      const next = (entry.level * DECAY_RATE) + (signal * (1 - DECAY_RATE) * weight);
      entry.trend = computeTrend(entry, signal);
      entry.trend_velocity = next - entry.level;
      entry.level = clamp01(next);
      entry.confidence = clamp01(entry.confidence + (0.1 * weight));
      entry.sample_count += 1;
      entry.last_updated = nowIso;
    } else {
      updated.cognitive_profile.concept_mastery[key] = {
        level: clamp01(signal * weight),
        confidence: NEW_CONCEPT_BASE_CONFIDENCE,
        sample_count: 1,
        last_updated: nowIso,
        trend: "insufficient_data",
        trend_velocity: 0,
      };
    }
  }

  // 2) concepts_struggled → drop level
  for (const struggle of reflection.concepts_struggled ?? []) {
    const key = toConceptKey(struggle.concept);
    if (!key) continue;
    const signal = clamp01(struggle.confidence);
    const entry = updated.cognitive_profile.concept_mastery[key];
    if (entry) {
      const next = (entry.level * DECAY_RATE) - (signal * (1 - DECAY_RATE) * weight * STRUGGLE_DAMPING);
      entry.trend_velocity = next - entry.level;
      entry.level = clamp01(next);
      entry.confidence = clamp01(entry.confidence + (0.05 * weight));
      entry.sample_count += 1;
      entry.last_updated = nowIso;
      entry.trend = entry.trend_velocity < -0.05 ? "declining" : entry.trend;
    } else {
      updated.cognitive_profile.concept_mastery[key] = {
        level: clamp01(0.4 - (signal * weight * STRUGGLE_DAMPING)),
        confidence: NEW_CONCEPT_BASE_CONFIDENCE,
        sample_count: 1,
        last_updated: nowIso,
        trend: "insufficient_data",
        trend_velocity: 0,
      };
    }
  }

  // 3) Communication preferences — slow merge (only flip after consistent signal).
  const cp = updated.communication_preferences;
  const adapt = reflection.adaptation_suggestions;
  if (adapt) {
    if (adapt.humor_level && (adapt.humor_level === cp.humor_level || weight >= 0.7)) {
      if (["none", "light", "playful"].includes(adapt.humor_level)) {
        cp.humor_level = adapt.humor_level as typeof cp.humor_level;
      }
    }
    if (adapt.analogy_domain) {
      const a = adapt.analogy_domain.toLowerCase();
      if (["everyday","tech","nature","sports","gaming","fantasy"].includes(a)) {
        cp.analogy_style = a as typeof cp.analogy_style;
      }
      // example_domain is free-form (auto-detected interest)
      cp.example_domain = adapt.analogy_domain.slice(0, 40);
    }
    if (adapt.explanation_depth && ["simple","moderate","deep"].includes(adapt.explanation_depth)) {
      updated.learning_style_profile.explanation_depth =
        adapt.explanation_depth as typeof updated.learning_style_profile.explanation_depth;
    }
    if (adapt.pacing && ["fast","moderate","careful"].includes(adapt.pacing)) {
      updated.learning_style_profile.pace_preference =
        adapt.pacing as typeof updated.learning_style_profile.pace_preference;
    }
  }

  // 4) Engagement patterns — direct merge from metrics
  if (metrics) {
    const ep = updated.engagement_patterns;
    if (typeof metrics.session_duration_minutes === "number") {
      const prev = ep.avg_session_duration_minutes || 0;
      ep.avg_session_duration_minutes = prev === 0
        ? metrics.session_duration_minutes
        : prev * 0.7 + metrics.session_duration_minutes * 0.3;
    }
    if (metrics.output_types_used?.length) {
      const out = updated.cognitive_profile.output_type_preferences;
      for (const t of metrics.output_types_used) {
        const cur = out[t] ?? {
          usage_count: 0,
          avg_quality_score: null,
          avg_prompt_length: null,
          last_used: null,
          trend: "stable" as const,
        };
        cur.usage_count += 1;
        cur.last_used = nowIso;
        out[t] = cur;
      }
    }
    ep.last_updated = nowIso;
  }

  // 5) Adaptation history — short audit log (cap at 50 entries).
  const newEntry: AdaptationEntry = {
    timestamp: nowIso,
    surface: surface === "classroom_teacher" || surface === "classroom_test"
      ? "classroom"
      : surface === "playground" || surface === "validator"
      ? "playground"
      : "aida_chat",
    what_was_tried: `${surface} reflection · ${reflection.concepts_demonstrated?.length ?? 0} demoed, ${reflection.concepts_struggled?.length ?? 0} struggled`,
    outcome: (reflection.engagement?.level === "high") ? "positive"
           : (reflection.engagement?.level === "low") ? "negative"
           : "neutral",
    reinforced: true,
  };
  updated.adaptation_history = [newEntry, ...updated.adaptation_history].slice(0, 50);

  // 6) Recompute top lists + bookkeeping
  updateTopLists(updated);
  updated.reflection_count = (existing?.reflection_count ?? 0) + 1;
  updated.last_reflection_at = nowIso;
  updated.updated_at = nowIso;
  if (!updated.created_at) updated.created_at = nowIso;

  return updated;
}

// Re-export hydrate so callers don't have to import from types.
export { hydrateLearnerModel, defaultLearnerModel };

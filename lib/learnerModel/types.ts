// Adaptive Learner Model — TypeScript types.
// See obsidian://AIDA Dev/Adaptive Learner/references/storage-schema.md
// for the canonical source.

export const LEARNER_MODEL_SCHEMA_VERSION = 1;

export type ReflectionSurface =
  | "aida_chat"
  | "playground"
  | "validator"
  | "classroom_test"
  | "classroom_teacher"
  | "diagnostic"
  | "weekly_cron";

export type Trend = "improving" | "declining" | "stable" | "insufficient_data";

export interface ConceptEntry {
  level: number;            // 0..1 estimated mastery
  confidence: number;       // 0..1 certainty of the estimate
  sample_count: number;
  last_updated: string;     // ISO date
  trend: Trend;
  trend_velocity: number;   // rate of change per week
}

export interface OutputTypePref {
  usage_count: number;
  avg_quality_score: number | null;
  avg_prompt_length: number | null;
  last_used: string | null;
  trend: "increasing" | "decreasing" | "stable";
}

export interface CognitiveProfile {
  concept_mastery: Record<string, ConceptEntry>;
  output_type_preferences: Record<string, OutputTypePref>;
  top_strengths: Array<{ concept: string; level: number }>;
  top_growth_areas: Array<{ concept: string; level: number }>;
}

export interface LearningStyleProfile {
  preferred_modality: "visual" | "verbal" | "hands_on" | "structured" | "mixed";
  explanation_depth: "simple" | "moderate" | "deep";
  pace_preference: "fast" | "moderate" | "careful";
  interaction_style: "guided" | "explorer" | "practical" | "creative";
  feedback_sensitivity: "low" | "moderate" | "high";
  help_seeking: "immediate" | "after_attempt" | "independent";
  confidence_calibration: "underconfident" | "accurate" | "overconfident" | "unknown";
}

export interface CommunicationPreferences {
  humor_level: "none" | "light" | "playful";
  analogy_style: "everyday" | "tech" | "nature" | "sports" | "gaming" | "fantasy";
  praise_frequency: "rare" | "moderate" | "frequent";
  formality: "casual" | "semi_formal" | "formal";
  language_mix: "en" | "hi" | "en_with_hi_terms";
  example_domain: string;
  explanation_preference: "step_by_step" | "narrative" | "visual" | "analogy" | "mixed";
  comprehension_check_frequency: "low" | "medium" | "high";
}

export interface EngagementPatterns {
  peak_hours: string[];
  preferred_days: string[];
  avg_session_duration_minutes: number;
  streak_history: number[];
  completion_rate: number;
  retry_rate: number;
  weekly_active_days: number;
  last_updated: string;
}

export interface WeeklyAnalysis {
  last_analysis_at: string | null;
  weekly_summary: string;
  trend_deltas: Record<string, number>;
  recommendations: string[];
  plateau_warnings: string[];
}

export interface AdaptationEntry {
  timestamp: string;
  surface: "aida_chat" | "classroom" | "playground";
  what_was_tried: string;
  outcome: "positive" | "neutral" | "negative";
  reinforced: boolean;
}

export interface LearnerModel {
  cognitive_profile: CognitiveProfile;
  learning_style_profile: LearningStyleProfile;
  communication_preferences: CommunicationPreferences;
  engagement_patterns: EngagementPatterns;
  weekly_analysis?: WeeklyAnalysis;
  adaptation_history: AdaptationEntry[];
  schema_version: number;
  last_reflection_at: string | null;
  reflection_count: number;
  created_at: string;
  updated_at: string;
}

// ── Reflection LLM output ────────────────────────────────────────────────────

export interface ConceptSignal {
  concept: string;
  confidence: number;
  evidence: string;
}

export interface SessionReflectionResult {
  concepts_demonstrated: ConceptSignal[];
  concepts_struggled: ConceptSignal[];
  communication_style: {
    vocabulary_level: string;
    thinking_style: string;
    curiosity_level: string;
    help_seeking: string;
  };
  effective_strategies: {
    what_worked: string;
    what_didnt: string;
  };
  engagement: {
    level: string;
    frustration_moments: string[];
    delight_moments: string[];
  };
  domain_interests: string[];
  adaptation_suggestions: {
    analogy_domain: string;
    humor_level: string;
    explanation_depth: string;
    pacing: string;
  };
  confidence_assessment: string;
}

export interface SessionMetrics {
  message_count: number;
  user_message_count: number;
  avg_response_time_seconds?: number;
  had_creation?: boolean;
  output_types_used?: string[];
  session_duration_minutes?: number;
}

// ── Defaults ────────────────────────────────────────────────────────────────

export function defaultLearnerModel(): LearnerModel {
  const now = new Date().toISOString();
  return {
    cognitive_profile: {
      concept_mastery: {},
      output_type_preferences: {},
      top_strengths: [],
      top_growth_areas: [],
    },
    learning_style_profile: {
      preferred_modality: "mixed",
      explanation_depth: "moderate",
      pace_preference: "moderate",
      interaction_style: "explorer",
      feedback_sensitivity: "moderate",
      help_seeking: "after_attempt",
      confidence_calibration: "unknown",
    },
    communication_preferences: {
      humor_level: "light",
      analogy_style: "everyday",
      praise_frequency: "moderate",
      formality: "casual",
      language_mix: "en",
      example_domain: "everyday",
      explanation_preference: "mixed",
      comprehension_check_frequency: "medium",
    },
    engagement_patterns: {
      peak_hours: [],
      preferred_days: [],
      avg_session_duration_minutes: 0,
      streak_history: [],
      completion_rate: 0,
      retry_rate: 0,
      weekly_active_days: 0,
      last_updated: now,
    },
    weekly_analysis: {
      last_analysis_at: null,
      weekly_summary: "",
      trend_deltas: {},
      recommendations: [],
      plateau_warnings: [],
    },
    adaptation_history: [],
    schema_version: LEARNER_MODEL_SCHEMA_VERSION,
    last_reflection_at: null,
    reflection_count: 0,
    created_at: now,
    updated_at: now,
  };
}

export const DEFAULT_LEARNER_MODEL: LearnerModel = defaultLearnerModel();

// Hydrate any partial/empty value into a complete LearnerModel.
// Used at every read site so call-sites never need null checks.
export function hydrateLearnerModel(raw: unknown): LearnerModel {
  const base = defaultLearnerModel();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<LearnerModel>;
  return {
    ...base,
    ...r,
    cognitive_profile: {
      ...base.cognitive_profile,
      ...(r.cognitive_profile ?? {}),
      concept_mastery: {
        ...base.cognitive_profile.concept_mastery,
        ...(r.cognitive_profile?.concept_mastery ?? {}),
      },
      output_type_preferences: {
        ...base.cognitive_profile.output_type_preferences,
        ...(r.cognitive_profile?.output_type_preferences ?? {}),
      },
      top_strengths: r.cognitive_profile?.top_strengths ?? [],
      top_growth_areas: r.cognitive_profile?.top_growth_areas ?? [],
    },
    learning_style_profile: {
      ...base.learning_style_profile,
      ...(r.learning_style_profile ?? {}),
    },
    communication_preferences: {
      ...base.communication_preferences,
      ...(r.communication_preferences ?? {}),
    },
    engagement_patterns: {
      ...base.engagement_patterns,
      ...(r.engagement_patterns ?? {}),
    },
    weekly_analysis: {
      ...(base.weekly_analysis as WeeklyAnalysis),
      ...(r.weekly_analysis ?? {}),
    },
    adaptation_history: r.adaptation_history ?? [],
    schema_version: r.schema_version ?? LEARNER_MODEL_SCHEMA_VERSION,
  };
}

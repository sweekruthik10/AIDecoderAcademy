// Cold-start stereotype seeding from onboarding data.
// Canon: references/architecture-decisions.md §"Decision 1 — Layer 1".

import type { LearnerModel } from "./types";
import { defaultLearnerModel } from "./types";

interface SeedInputs {
  age_group?: string | null;
  current_grade?: number | null;
  board?: string | null;
  interests?: string[] | null;
  language_preference?: "en" | "hi" | "en_with_hi_terms" | null;
  learning_style?: "visual" | "hands_on" | "story" | "facts_and_logic" | null;
  difficulty_preference?: "challenge_me" | "explain_gently" | "let_me_pick" | null;
}

function inferDomain(interests?: string[] | null): string {
  if (!interests?.length) return "everyday";
  const lc = interests.map(s => s.toLowerCase());
  if (lc.some(i => /(game|gaming|minecraft|roblox|fortnite|chess)/.test(i))) return "gaming";
  if (lc.some(i => /(anime|manga|comic|movie|film|book|story|fantasy)/.test(i))) return "fantasy";
  if (lc.some(i => /(sport|football|cricket|basketball|tennis)/.test(i))) return "sports";
  if (lc.some(i => /(nature|animal|plant|space|astronomy)/.test(i))) return "nature";
  if (lc.some(i => /(code|coding|robot|tech|computer|ai)/.test(i))) return "tech";
  return "everyday";
}

export function seedLearnerModel(p: SeedInputs): LearnerModel {
  const m = defaultLearnerModel();
  const cp = m.communication_preferences;
  const lp = m.learning_style_profile;

  cp.example_domain = inferDomain(p.interests);

  // Age-based defaults
  if (p.age_group === "5-7" || p.age_group === "8-10") {
    lp.explanation_depth = "simple";
    lp.help_seeking = "immediate";
    cp.humor_level = "playful";
    cp.praise_frequency = "frequent";
    cp.formality = "casual";
    cp.comprehension_check_frequency = "high";
  } else if (p.age_group === "11-13") {
    lp.explanation_depth = "moderate";
    cp.humor_level = "light";
    cp.formality = "casual";
  } else if (p.age_group === "14+") {
    lp.explanation_depth = "deep";
    cp.humor_level = "light";
    cp.formality = "semi_formal";
    cp.comprehension_check_frequency = "low";
  }

  // Grade-based bump
  if (typeof p.current_grade === "number" && p.current_grade >= 9) {
    lp.explanation_depth = "deep";
    lp.interaction_style = "guided";
  }

  // Board flavor
  if (p.board === "CBSE") lp.interaction_style = "guided";
  else if (p.board === "ICSE") lp.interaction_style = "explorer";

  // Language preference
  if (p.language_preference === "hi") cp.language_mix = "hi";
  else if (p.language_preference === "en_with_hi_terms") cp.language_mix = "en_with_hi_terms";

  // Onboarding learning_style → modality
  if (p.learning_style === "visual") lp.preferred_modality = "visual";
  else if (p.learning_style === "hands_on") lp.preferred_modality = "hands_on";
  else if (p.learning_style === "story") {
    lp.preferred_modality = "verbal";
    cp.explanation_preference = "narrative";
  } else if (p.learning_style === "facts_and_logic") {
    lp.preferred_modality = "structured";
    cp.explanation_preference = "step_by_step";
  }

  // Difficulty preference
  if (p.difficulty_preference === "challenge_me") {
    lp.help_seeking = "independent";
    lp.feedback_sensitivity = "low";
  } else if (p.difficulty_preference === "explain_gently") {
    lp.feedback_sensitivity = "high";
    cp.praise_frequency = "frequent";
  }

  return m;
}

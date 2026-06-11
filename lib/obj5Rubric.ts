// OBJ 5 — AI Writes and Sings Your Theme Song.
// Audio artefact: 1 Suno.ai MP3 + worksheet (5 personality words + style brief).

import type { WorksheetUpload, CanvasMode, StagedRubric } from "@/lib/obj10Rubric";

export interface Obj5CanvasFields { intent: string; assumptions: string; audience: string; success: string; }

export interface Obj5StoryItFields {
  word1: string; word2: string; word3: string; word4: string; word5: string;
  styleBrief:        string;
  obj6Energy:        string;
  iterationElement:  string;
}

export interface Obj5ReflectionFields {
  correctAssumption:     string;
  mostImpactfulElement:  string;
}

export interface Obj5CanvasStageResult {
  stage: "canvas"; passed: boolean; score: number; mode: CanvasMode;
  fieldFeedback: { intent: string; assumptions: string; audience: string; success: string };
  summary: string;
}

export interface Obj5StoryItStageResult {
  stage:              "storyIt";
  passed:             boolean;
  fiveWordsPresent:   boolean;
  noGenreOrInstrument:boolean;
  styleBriefHasAllFour:boolean;
  summary:            string;
}

export interface Obj5CreateItStageResult {
  stage:              "createIt";
  score:              number;
  tier:               "distinction" | "merit" | "pass" | "fail";
  trackPresent:       boolean;
  reflectionThoughtful:boolean;   // merit
  identifiesIteration:boolean;    // distinction
  summary:            string;
}

export interface Obj5FinalResult {
  passed: boolean; composite: number; tier: "distinction" | "merit" | "pass" | "fail";
  canvas: Obj5CanvasStageResult; storyIt: Obj5StoryItStageResult | null;
  createIt: Obj5CreateItStageResult | null;
  feedbackScript: string; blockedAtStage?: "canvas" | "storyIt";
}

export const OBJ5_RUBRIC = {
  lmsId: "l1-05", legacyId: "a1-5", title: "AI Writes and Sings Your Theme Song",
  canvas: {
    weight: 0.25, minPassPct: 65,
    fieldHints: {
      intent: { genuineEx: "To create a track that sounds so much like me that anyone who knows me immediately says — that is exactly your vibe — before I tell them it is mine." },
      assumptions: { genuineEx: "I assume 5 personality words will be enough — but Suno.ai might need genre and mood words too, or interpret 'fierce' as aggressive rather than confident." },
      audience: { genuineEx: "My classmates who mostly listen to hip-hop and Afrobeats — they will know immediately whether this track feels authentic or like generic AI music." },
      success: { genuineEx: "If my best friend hears it without knowing I made it and says — this sounds like something you would listen to." },
    },
  },
  storyIt: {
    weight: 0.25,
    checks: {
      fiveWordsPresent: { fail: "I need exactly 5 personality words. Fill all 5.", pass: "All 5 personality words present." },
      noGenreOrInstrument: { fail: "Your words include genre or instrument names — those belong in the style brief, not the 5-word personality description. Rethink your word choices.", pass: "Your 5 words describe personality, not music style." },
      styleBriefHasAllFour: { fail: "Your style brief is missing at least one element. Need: GENRE + ENERGY LEVEL + MOOD + at least one specific instrument or sound.", pass: "Style brief has all four required elements." },
    },
  },
  createIt: {
    weight: 0.50,
    passCriteria: "MP3 uploaded. Worksheet complete. 5 personality words + complete style brief.",
    meritCriteria: "Track has distinct personality. Reflection identifies which specific element of the brief had the most impact on the track's character.",
    distinctionCriteria: "Student iterated — compared 5 words / brief versions OR identifies which element they would change in next iteration.",
  },
  feedbackScripts: {
    pass: "Your theme song exists — built from words you chose. That is the difference between using a tool and directing one. This track plays under your OBJ 6 avatar reveal — think about whether it carries that moment.",
    merit: "Your track has a distinct personality — not default AI music. Read your Success Definition: does this achieve THAT reaction from THAT person? Play it for them before OBJ 6.",
    distinction: "You treated this as creative direction — not generation. Iterated, compared, chose deliberately. When this plays under your avatar reveal, your classmates will hear something designed.",
  },
} as const;

export type Obj5Rubric = typeof OBJ5_RUBRIC;

export const OBJ5_STAGED_RUBRIC: StagedRubric = {
  kind: "staged", lmsId: OBJ5_RUBRIC.lmsId, title: OBJ5_RUBRIC.title,
  tier: "T1 — EXPLORE", difficulty: 2, tools: ["Suno.ai"],
  worksheetTemplateUrl: "/worksheets/OBJ5_StudentWorksheet.docx",
  worksheetTemplateName: "OBJ5_StudentWorksheet.docx",
  objectiveBlurb:
    "Describe yourself in just 5 personality words. Then build a Suno.ai " +
    "style brief — genre, energy, mood, instrument. Suno turns that into " +
    "your personal Level 1 Theme Song. It plays under your OBJ 6 avatar reveal.",
  thinkItBrief: "Four Canvas fields before you pick your 5 words.",
  storyItBrief: "5 personality words (no genres / instruments) + a full Suno style brief.",
  createItBrief: "Generate in Suno.ai. Drop the MP3 in chat. Complete the reflection.",
  canvas: {
    weight: OBJ5_RUBRIC.canvas.weight, minPassPct: OBJ5_RUBRIC.canvas.minPassPct,
    fieldHints: {
      intent: { label: "🎯 Intent", placeholder: "What should listeners FEEL in the first 5 seconds?", placeholderEx: "To make a song.", genuineEx: OBJ5_RUBRIC.canvas.fieldHints.intent.genuineEx },
      assumptions: { label: "🔍 Assumptions", placeholder: "What are you betting on about how Suno will interpret your words?", placeholderEx: "It'll sound good.", genuineEx: OBJ5_RUBRIC.canvas.fieldHints.assumptions.genuineEx },
      audience: { label: "👥 Audience", placeholder: "Who hears this first — and what music do they listen to?", placeholderEx: "My friends.", genuineEx: OBJ5_RUBRIC.canvas.fieldHints.audience.genuineEx },
      success: { label: "✅ Success", placeholder: "What does one specific person SAY or DO if it captures you?", placeholderEx: "If it sounds nice.", genuineEx: OBJ5_RUBRIC.canvas.fieldHints.success.genuineEx },
    },
  },
  storyIt: {
    weight: OBJ5_RUBRIC.storyIt.weight,
    failLines: { setupTwistPayoff: OBJ5_RUBRIC.storyIt.checks.fiveWordsPresent.fail, panel3IsPunchline: OBJ5_RUBRIC.storyIt.checks.noGenreOrInstrument.fail, characterConsistent: OBJ5_RUBRIC.storyIt.checks.styleBriefHasAllFour.fail },
    passLines: { setupTwistPayoff: OBJ5_RUBRIC.storyIt.checks.fiveWordsPresent.pass, panel3IsPunchline: OBJ5_RUBRIC.storyIt.checks.noGenreOrInstrument.pass, characterConsistent: OBJ5_RUBRIC.storyIt.checks.styleBriefHasAllFour.pass },
    funnyTestQuestion: "(N/A for OBJ 5)", funnyTestFailureScript: "(N/A for OBJ 5)",
  },
  createIt: {
    weight: OBJ5_RUBRIC.createIt.weight,
    requirements: { panels: 1, avatarNameRequired: false, consistentCharacter: false },
    passCriteria: OBJ5_RUBRIC.createIt.passCriteria,
    meritCriteria: OBJ5_RUBRIC.createIt.meritCriteria,
    distinctionCriteria: OBJ5_RUBRIC.createIt.distinctionCriteria,
  },
  feedbackScripts: {
    pass: OBJ5_RUBRIC.feedbackScripts.pass, merit: OBJ5_RUBRIC.feedbackScripts.merit,
    distinction: OBJ5_RUBRIC.feedbackScripts.distinction, funnyTestFailure: "(N/A for OBJ 5)",
  },
};

// OBJ 8 — AI Speaks Your Words: Voice Direction Lab.
// 3 ElevenLabs MP3s + worksheet (blind observation/interpretation then reveal).

import type { WorksheetUpload, CanvasMode, StagedRubric } from "@/lib/obj10Rubric";

export interface Obj8CanvasFields { intent: string; assumptions: string; audience: string; success: string; }

export interface Obj8StoryItFields {
  topic: string; sentence1: string; sentence2: string; sentence3: string;
  voice1Name: string; voice2Name: string; voice3Name: string;
}

export interface Obj8BlindEvalFields {
  voiceAObservation: string; voiceAInterpretation: string;
  voiceBObservation: string; voiceBInterpretation: string;
  voiceCObservation: string; voiceCInterpretation: string;
}

export interface Obj8ReflectionFields {
  voiceAReveal: string; voiceBReveal: string; voiceCReveal: string;
  whereWrong: string;
  mostInterestingMismatch: string;
}

export interface Obj8CanvasStageResult {
  stage: "canvas"; passed: boolean; score: number; mode: CanvasMode;
  fieldFeedback: { intent: string; assumptions: string; audience: string; success: string };
  summary: string;
}

export interface Obj8StoryItStageResult {
  stage: "storyIt"; passed: boolean;
  threeSentencesComplete: boolean;
  threeVoicesNamed: boolean;
  summary: string;
}

export interface Obj8CreateItStageResult {
  stage: "createIt"; score: number;
  tier: "distinction" | "merit" | "pass" | "fail";
  threeAudioFilesPresent: boolean;
  observationsAreLiteral: boolean;     // merit
  interpretationsAreDistinct: boolean; // merit
  identifiesMismatch: boolean;         // distinction
  summary: string;
}

export interface Obj8FinalResult {
  passed: boolean; composite: number; tier: "distinction" | "merit" | "pass" | "fail";
  canvas: Obj8CanvasStageResult; storyIt: Obj8StoryItStageResult | null;
  createIt: Obj8CreateItStageResult | null;
  feedbackScript: string; blockedAtStage?: "canvas" | "storyIt";
}

export const OBJ8_RUBRIC = {
  lmsId: "l1-08", legacyId: "a1-8", title: "AI Speaks Your Words: Voice Direction Lab",
  canvas: {
    weight: 0.25, minPassPct: 65,
    fieldHints: {
      intent: { genuineEx: "To test whether I can distinguish a voice's actual personality from just its surface qualities — by listening before I see the voice name." },
      assumptions: { genuineEx: "I assume I'll be able to spot a 'warm' voice immediately — but I'm betting I'll confuse 'calm' with 'distant' until I hear all three back-to-back." },
      audience: { genuineEx: "A podcast editor — someone who picks voices for tone, not just clarity." },
      success: { genuineEx: "If my observations describe specific pace/tone/warmth (facts) rather than personality conclusions — that means I actually listened analytically." },
    },
  },
  storyIt: {
    weight: 0.25,
    checks: {
      threeSentencesComplete: { fail: "I need 3 complete, emotionally clear sentences — not a list of words.", pass: "3 sentences present." },
      threeVoicesNamed: { fail: "Name all 3 ElevenLabs voices BY NAME. No previews — pick by name only.", pass: "3 voices named." },
    },
  },
  createIt: {
    weight: 0.50,
    passCriteria: "3 audio files uploaded. Blind evaluation completed for all 3 voices BEFORE reveal. Reveal section completed.",
    meritCriteria: "Observations are literal auditory facts (pace, tone, warmth) — NOT personality conclusions. Interpretations are clearly distinct across the 3 voices.",
    distinctionCriteria: "Student identifies a specific mismatch between observation and interpretation — and names the auditory cue that misled them.",
  },
  feedbackScripts: {
    pass: "You ran the blind evaluation in order. You did not peek. That alone is rare — most people argue with the design instead of running it. Good.",
    merit: "Your observations stayed in auditory facts. Your interpretations earned their conclusions. That's CT Skill 2 working — separate what you hear from what you decide it means.",
    distinction: "You found the cue that misled you and named it specifically. Next time you cast a voice, you'll listen for THAT first. That's how trained listeners get built.",
  },
} as const;

export type Obj8Rubric = typeof OBJ8_RUBRIC;

export const OBJ8_STAGED_RUBRIC: StagedRubric = {
  kind: "staged", lmsId: OBJ8_RUBRIC.lmsId, title: OBJ8_RUBRIC.title,
  tier: "T1 — EXPLORE", difficulty: 3, tools: ["ElevenLabs"],
  worksheetTemplateUrl: "/worksheets/OBJ8_StudentWorksheet.docx",
  worksheetTemplateName: "OBJ8_StudentWorksheet.docx",
  objectiveBlurb:
    "Write 3 sentences. Pick 3 ElevenLabs voices BY NAME ONLY — no previews. " +
    "Generate. Listen BLIND — observe then interpret each voice without knowing " +
    "which is which. THEN reveal the names. Identify where your ear was wrong.",
  thinkItBrief: "Four Canvas fields before you write your sentences.",
  storyItBrief: "3 emotionally clear sentences + 3 voices chosen by NAME ONLY.",
  createItBrief: "Generate all 3. Drop them in chat as Voice A, B, C. Complete blind eval BEFORE reveal.",
  canvas: {
    weight: OBJ8_RUBRIC.canvas.weight, minPassPct: OBJ8_RUBRIC.canvas.minPassPct,
    fieldHints: {
      intent: { label: "🎯 Intent", placeholder: "What analytical question does this blind eval answer?", placeholderEx: "To hear AI voices.", genuineEx: OBJ8_RUBRIC.canvas.fieldHints.intent.genuineEx },
      assumptions: { label: "🔍 Assumptions", placeholder: "What are you betting about your ability to identify voice personality by ear?", placeholderEx: "I'll get it right.", genuineEx: OBJ8_RUBRIC.canvas.fieldHints.assumptions.genuineEx },
      audience: { label: "👥 Audience", placeholder: "Whose listening perspective are you borrowing?", placeholderEx: "Everyone.", genuineEx: OBJ8_RUBRIC.canvas.fieldHints.audience.genuineEx },
      success: { label: "✅ Success", placeholder: "What does accurate auditory observation look like?", placeholderEx: "If I get it right.", genuineEx: OBJ8_RUBRIC.canvas.fieldHints.success.genuineEx },
    },
  },
  storyIt: {
    weight: OBJ8_RUBRIC.storyIt.weight,
    failLines: { setupTwistPayoff: OBJ8_RUBRIC.storyIt.checks.threeSentencesComplete.fail, panel3IsPunchline: OBJ8_RUBRIC.storyIt.checks.threeVoicesNamed.fail, characterConsistent: "(N/A)" },
    passLines: { setupTwistPayoff: OBJ8_RUBRIC.storyIt.checks.threeSentencesComplete.pass, panel3IsPunchline: OBJ8_RUBRIC.storyIt.checks.threeVoicesNamed.pass, characterConsistent: "(N/A)" },
    funnyTestQuestion: "(N/A for OBJ 8)", funnyTestFailureScript: "(N/A for OBJ 8)",
  },
  createIt: {
    weight: OBJ8_RUBRIC.createIt.weight,
    requirements: { panels: 3, avatarNameRequired: false, consistentCharacter: false },
    passCriteria: OBJ8_RUBRIC.createIt.passCriteria,
    meritCriteria: OBJ8_RUBRIC.createIt.meritCriteria,
    distinctionCriteria: OBJ8_RUBRIC.createIt.distinctionCriteria,
  },
  feedbackScripts: {
    pass: OBJ8_RUBRIC.feedbackScripts.pass, merit: OBJ8_RUBRIC.feedbackScripts.merit,
    distinction: OBJ8_RUBRIC.feedbackScripts.distinction, funnyTestFailure: "(N/A for OBJ 8)",
  },
};

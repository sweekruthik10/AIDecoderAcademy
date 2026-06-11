// OBJ 2 — Three AI Brains, One Question.
// 3 screenshot images (ChatGPT, Gemini, Claude) + worksheet reflections.

import type { WorksheetUpload, CanvasMode, StagedRubric } from "@/lib/obj10Rubric";

export interface Obj2CanvasFields { intent: string; assumptions: string; audience: string; success: string; }

export interface Obj2StoryItFields {
  question:        string;
  isOpenEnded:     boolean;
  isPersonal:      boolean;
  requiresReasoning: boolean;
}

export interface Obj2ReflectionFields {
  chatGptObservation:     string;
  chatGptInterpretation:  string;
  geminiObservation:      string;
  geminiInterpretation:   string;
  claudeObservation:      string;
  claudeInterpretation:   string;
  surprisingDifference:   string;
  agreement:              string;
  whichAiForType:         string;
  correctAssumption:      string;
  wrongAssumption:        string;
}

export interface Obj2CanvasStageResult { stage: "canvas"; passed: boolean; score: number; mode: CanvasMode; fieldFeedback: { intent: string; assumptions: string; audience: string; success: string }; summary: string; }
export interface Obj2StoryItStageResult { stage: "storyIt"; passed: boolean; questionPresent: boolean; questionPassesCriteria: boolean; summary: string; }
export interface Obj2CreateItStageResult {
  stage: "createIt"; score: number; tier: "distinction" | "merit" | "pass" | "fail";
  allReachable: boolean;
  threeDistinctLlms: boolean;
  observationsAreLiteral: boolean;
  interpretationsAreSeparate: boolean;
  identifiesAgreement: boolean;
  identifiesDivergence: boolean;
  description: string;
  summary: string;
}
export interface Obj2FinalResult {
  passed: boolean; composite: number; tier: "distinction" | "merit" | "pass" | "fail";
  canvas: Obj2CanvasStageResult; storyIt: Obj2StoryItStageResult | null;
  createIt: Obj2CreateItStageResult | null;
  feedbackScript: string; blockedAtStage?: "canvas" | "storyIt";
}

export const OBJ2_RUBRIC = {
  lmsId: "l1-02", legacyId: "a1-2", title: "Three AI Brains, One Question",
  canvas: {
    weight: 0.25, minPassPct: 65,
    fieldHints: {
      intent: { genuineEx: "To test whether the three AIs genuinely disagree on a question that requires real reasoning — not just produce three versions of the same answer." },
      assumptions: { genuineEx: "I assume ChatGPT will give the longest, most structured answer. I'm not sure what Gemini or Claude will do differently — that's what I'm testing." },
      audience: { genuineEx: "Me. I need to be able to spot a real difference in how each AI reasons, not just style." },
      success: { genuineEx: "If I can point to ONE concrete thing each AI did that the other two did NOT — beyond formatting or tone." },
    },
  },
  storyIt: {
    weight: 0.25,
    checks: {
      questionPresent: { fail: "Question is empty. Write the exact question you'll ask all 3 AIs.", pass: "Question present." },
      questionPassesCriteria: { fail: "Your question fails the criteria. It must be: OPEN-ENDED (no single-fact answer), PERSONAL (you actually want to know), and REASONING-REQUIRED (Why / How / What if). 'When was the internet invented' fails. 'Why do people believe things that confirm what they already think' passes.", pass: "Question meets all three criteria — open, personal, reasoning-required." },
    },
  },
  createIt: {
    weight: 0.50,
    passCriteria: "Worksheet complete. 3 screenshots from 3 DIFFERENT LLMs (ChatGPT, Gemini, Claude). One observation + one interpretation per LLM.",
    meritCriteria: "Observations are literal (no conclusions in observation field). Comparison Synthesis identifies a specific agreement AND a specific divergence.",
    distinctionCriteria: "Student names a structural reasoning difference (not just tone/format) and articulates which AI they'd use for THIS type of question + why.",
  },
  feedbackScripts: {
    pass: "Three AIs. One question. Three responses. " + "Now read your interpretations — do they separate what you SAW from what you CONCLUDED? That separation is CT Skill 2.",
    merit: "Your observations stay literal. Your interpretations earn their conclusions. " + "And you found something all three agreed on — that's often more revealing than where they disagreed.",
    distinction: "You named a structural difference in how the AIs reason — not just how they write. " + "And you picked the one you'd use for this question type, with a reason. That's how you build judgement.",
  },
} as const;

export type Obj2Rubric = typeof OBJ2_RUBRIC;

export const OBJ2_STAGED_RUBRIC: StagedRubric = {
  kind: "staged", lmsId: OBJ2_RUBRIC.lmsId, title: OBJ2_RUBRIC.title,
  tier: "T1 — EXPLORE", difficulty: 2, tools: ["ChatGPT", "Google Gemini", "Claude.ai"],
  worksheetTemplateUrl: "/worksheets/OBJ2_StudentWorksheet.docx",
  worksheetTemplateName: "OBJ2_StudentWorksheet.docx",
  objectiveBlurb:
    "Ask one genuine question — something you actually want to know — to " +
    "ChatGPT, Gemini, and Claude. Same question. Three brains. Then apply " +
    "CT Skill 2: separate what you literally OBSERVE from what you " +
    "INTERPRET about how each AI reasons.",
  thinkItBrief: "Four Canvas fields before you write your question.",
  storyItBrief: "Choose your question deliberately — open, personal, reasoning-required.",
  createItBrief: "Ask all 3 AIs. Drop the 3 screenshots in chat in order: ChatGPT, Gemini, Claude. Complete observation + interpretation per AI.",
  canvas: {
    weight: OBJ2_RUBRIC.canvas.weight, minPassPct: OBJ2_RUBRIC.canvas.minPassPct,
    fieldHints: {
      intent: { label: "🎯 Intent", placeholder: "What do you want to learn from comparing 3 AIs?", placeholderEx: "To see what they say.", genuineEx: OBJ2_RUBRIC.canvas.fieldHints.intent.genuineEx },
      assumptions: { label: "🔍 Assumptions", placeholder: "Predict how each AI will respond differently", placeholderEx: "They'll all be different.", genuineEx: OBJ2_RUBRIC.canvas.fieldHints.assumptions.genuineEx },
      audience: { label: "👥 Audience", placeholder: "Who's reading this comparison?", placeholderEx: "Everyone.", genuineEx: OBJ2_RUBRIC.canvas.fieldHints.audience.genuineEx },
      success: { label: "✅ Success", placeholder: "What concrete difference would prove the test worked?", placeholderEx: "If they're different.", genuineEx: OBJ2_RUBRIC.canvas.fieldHints.success.genuineEx },
    },
  },
  storyIt: {
    weight: OBJ2_RUBRIC.storyIt.weight,
    failLines: { setupTwistPayoff: OBJ2_RUBRIC.storyIt.checks.questionPresent.fail, panel3IsPunchline: OBJ2_RUBRIC.storyIt.checks.questionPassesCriteria.fail, characterConsistent: "(N/A)" },
    passLines: { setupTwistPayoff: OBJ2_RUBRIC.storyIt.checks.questionPresent.pass, panel3IsPunchline: OBJ2_RUBRIC.storyIt.checks.questionPassesCriteria.pass, characterConsistent: "(N/A)" },
    funnyTestQuestion: "(N/A for OBJ 2)", funnyTestFailureScript: "(N/A for OBJ 2)",
  },
  createIt: {
    weight: OBJ2_RUBRIC.createIt.weight,
    requirements: { panels: 3, avatarNameRequired: false, consistentCharacter: false },
    passCriteria: OBJ2_RUBRIC.createIt.passCriteria,
    meritCriteria: OBJ2_RUBRIC.createIt.meritCriteria,
    distinctionCriteria: OBJ2_RUBRIC.createIt.distinctionCriteria,
  },
  feedbackScripts: {
    pass: OBJ2_RUBRIC.feedbackScripts.pass, merit: OBJ2_RUBRIC.feedbackScripts.merit,
    distinction: OBJ2_RUBRIC.feedbackScripts.distinction, funnyTestFailure: "(N/A for OBJ 2)",
  },
};

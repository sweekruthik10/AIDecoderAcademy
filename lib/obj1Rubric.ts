// OBJ 1 — Netflix Documentary Intro + Avatar Name.
// Text-only artefact: 2-sentence Netflix-style intro (pasted into worksheet
// "finalIntro" field) + chosen Avatar Name. No image/vision grading.

import type { WorksheetUpload, CanvasMode, StagedRubric } from "@/lib/obj10Rubric";

export interface Obj1CanvasFields { intent: string; assumptions: string; audience: string; success: string; }

export interface Obj1StoryItFields {
  q1WhoAreYou:     string;
  q2WhatYouCare:   string;
  q3WhatDrives:    string;
  q4WhereGoing:    string;
}

export interface Obj1CreateItInput {
  finalIntro:       string;   // ChatGPT-generated 2 sentences pasted in worksheet
  avatarName:       string;
  avatarNameReason: string;
  correctAssumption:   string;
  wrongAssumption:     string;
  observation:         string;
  interpretation:      string;
}

export interface Obj1CanvasStageResult {
  stage: "canvas"; passed: boolean; score: number; mode: CanvasMode;
  fieldFeedback: { intent: string; assumptions: string; audience: string; success: string };
  summary: string;
}

export interface Obj1StoryItStageResult {
  stage:                "storyIt";
  passed:               boolean;
  allFourAnswersFilled: boolean;
  answersAreSpecific:   boolean;
  summary:              string;
}

export interface Obj1CreateItStageResult {
  stage:                "createIt";
  score:                number;
  tier:                 "distinction" | "merit" | "pass" | "fail";
  finalIntroPresent:    boolean;
  isExactlyTwoSentences:boolean;
  feelsCinematic:       boolean;
  isPersonal:           boolean;
  avatarNameIntentional:boolean;
  reflectionShowsSurprise: boolean;     // merit signal
  identifiesIteration:  boolean;        // distinction signal
  summary:              string;
}

export interface Obj1FinalResult {
  passed: boolean; composite: number; tier: "distinction" | "merit" | "pass" | "fail";
  canvas: Obj1CanvasStageResult; storyIt: Obj1StoryItStageResult | null;
  createIt: Obj1CreateItStageResult | null;
  feedbackScript: string; blockedAtStage?: "canvas" | "storyIt";
}

export const OBJ1_RUBRIC = {
  lmsId: "l1-01", legacyId: "a1-1", title: "Netflix Documentary Intro + Avatar Name",
  canvas: {
    weight: 0.25, minPassPct: 65,
    fieldHints: {
      intent: { genuineEx: "To create an introduction that makes my classmates feel like they are about to watch a documentary about someone genuinely interesting — not a student answering questions." },
      assumptions: { genuineEx: "I assume more specific answers will produce a more personal intro — but ChatGPT might still make it generic even with detailed inputs. I assume 'Netflix style' means the same thing to ChatGPT as it does to me — it might not." },
      audience: { genuineEx: "The 15-20 people in this room, including my trainer, who'll hear this read aloud and form their first impression of who I am." },
      success: { genuineEx: "If at least one person in the room reacts after it is read — even a sound or a comment — rather than silence. Silence means it did not land." },
    },
  },
  storyIt: {
    weight: 0.25,
    checks: {
      allFourFilled: { fail: "All four self-questions need answers — at least 2-3 sentences each. Generic 'I like things' answers produce generic intros.", pass: "All four Story It answers present." },
      answersAreSpecific: { fail: "Your answers read as generic. Be specific — name actual things you do, actual problems you think about, actual people who'd describe you a certain way. Vague answers produce vague intros.", pass: "Answers are specific enough to produce a personal intro." },
    },
  },
  createIt: {
    weight: 0.50,
    passCriteria: "Worksheet complete with all 4 Canvas fields + all 4 Story It answers + final ChatGPT intro pasted + Avatar Name chosen.",
    meritCriteria: "Intro is specific and personal — contains details only this student could have given. Reflection identifies one assumption that proved correct AND one that surprised them.",
    distinctionCriteria: "Student submits a refined version (or describes the iteration) — explains which Story-It answer they made more specific, and how the regenerated intro changed.",
  },
  feedbackScripts: {
    pass:
      "Your intro exists. Your Avatar Name is chosen. " +
      "Now read your intent: did the intro land the way you wanted? " +
      "Imagine it read aloud in the room. Would it earn a reaction?",
    merit:
      "Your intro carries specific details only YOU could have given. " +
      "That's the difference between 'a student answering questions' and 'someone interesting being introduced'. " +
      "Hold this bar.",
    distinction:
      "You iterated. You named which answer needed to be more specific and you changed it. " +
      "That's the working loop — generate, evaluate, refine. " +
      "Most students don't do this in Objective 1.",
  },
} as const;

export type Obj1Rubric = typeof OBJ1_RUBRIC;

export const OBJ1_STAGED_RUBRIC: StagedRubric = {
  kind: "staged", lmsId: OBJ1_RUBRIC.lmsId, title: OBJ1_RUBRIC.title,
  tier: "T1 — EXPLORE", difficulty: 1, tools: ["ChatGPT"],
  worksheetTemplateUrl: "/worksheets/OBJ1_StudentWorksheet.docx",
  worksheetTemplateName: "OBJ1_StudentWorksheet.docx",
  objectiveBlurb:
    "Describe yourself by answering four questions — who you are, what you " +
    "care about, what drives you, where you are going. ChatGPT turns your " +
    "answers into a Netflix-style 2-line documentary introduction read aloud " +
    "in class. Then choose your Avatar Name — your identity for all 6 levels.",
  thinkItBrief: "Four Canvas fields before you answer any self-question.",
  storyItBrief: "Four answers about yourself — each 2-3 sentences, genuinely specific.",
  createItBrief: "Build your ChatGPT prompt from the four answers. Paste the final intro back into the worksheet. Choose your Avatar Name.",
  canvas: {
    weight: OBJ1_RUBRIC.canvas.weight, minPassPct: OBJ1_RUBRIC.canvas.minPassPct,
    fieldHints: {
      intent: { label: "🎯 Intent", placeholder: "Reaction you want when it's read aloud", placeholderEx: "To write a good intro.", genuineEx: OBJ1_RUBRIC.canvas.fieldHints.intent.genuineEx },
      assumptions: { label: "🔍 Assumptions", placeholder: "What might ChatGPT get wrong?", placeholderEx: "I assume it'll be cool.", genuineEx: OBJ1_RUBRIC.canvas.fieldHints.assumptions.genuineEx },
      audience: { label: "👥 Audience", placeholder: "The specific people in the room", placeholderEx: "My class.", genuineEx: OBJ1_RUBRIC.canvas.fieldHints.audience.genuineEx },
      success: { label: "✅ Success", placeholder: "Observable reaction from one person", placeholderEx: "If it sounds nice.", genuineEx: OBJ1_RUBRIC.canvas.fieldHints.success.genuineEx },
    },
  },
  storyIt: {
    weight: OBJ1_RUBRIC.storyIt.weight,
    failLines: { setupTwistPayoff: OBJ1_RUBRIC.storyIt.checks.allFourFilled.fail, panel3IsPunchline: OBJ1_RUBRIC.storyIt.checks.answersAreSpecific.fail, characterConsistent: "(N/A)" },
    passLines: { setupTwistPayoff: OBJ1_RUBRIC.storyIt.checks.allFourFilled.pass, panel3IsPunchline: OBJ1_RUBRIC.storyIt.checks.answersAreSpecific.pass, characterConsistent: "(N/A)" },
    funnyTestQuestion: "(N/A for OBJ 1)", funnyTestFailureScript: "(N/A for OBJ 1)",
  },
  createIt: {
    weight: OBJ1_RUBRIC.createIt.weight,
    requirements: { panels: 0, avatarNameRequired: true, consistentCharacter: false },
    passCriteria: OBJ1_RUBRIC.createIt.passCriteria,
    meritCriteria: OBJ1_RUBRIC.createIt.meritCriteria,
    distinctionCriteria: OBJ1_RUBRIC.createIt.distinctionCriteria,
  },
  feedbackScripts: {
    pass: OBJ1_RUBRIC.feedbackScripts.pass, merit: OBJ1_RUBRIC.feedbackScripts.merit,
    distinction: OBJ1_RUBRIC.feedbackScripts.distinction, funnyTestFailure: "(N/A for OBJ 1)",
  },
};

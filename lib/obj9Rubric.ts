// OBJ 9 — The Negative Prompt Lab: Editing Reality. Mirrors lib/obj4Rubric.ts.
// THREE Firefly images: V1 (base prompt only), V2 (first negative prompts),
// V3 (extended negative prompts). Same base prompt across all 3.

import type { WorksheetUpload, CanvasMode, StagedRubric } from "@/lib/obj10Rubric";

export interface Obj9CanvasFields {
  intent:      string;
  assumptions: string;
  audience:    string;
  success:     string;
}

export interface Obj9StoryItFields {
  basePrompt:           string;
  elementAudit:         string[];   // ≥5 uninvited elements from V1
  predictionVsActual:   string;
  v2NegativePrompt:     string;
  v3NegativePrompt:     string;
}

export interface Obj9ReflectionFields {
  mostImpactfulExclusion: string;   // which word changed the image most + why Firefly included it
  ctSkill1Assumption:     string;   // what assumption did Firefly make?
  v4Revision:             string;   // optional — distinction signal
}

export interface Obj9CanvasStageResult {
  stage: "canvas"; passed: boolean; score: number; mode: CanvasMode;
  fieldFeedback: { intent: string; assumptions: string; audience: string; success: string };
  summary: string;
}

export interface Obj9StoryItStageResult {
  stage:               "storyIt";
  passed:              boolean;
  basePromptPresent:   boolean;
  elementAuditHas5Plus: boolean;
  v2HasNegativePrompts: boolean;
  v3ExtendsV2:         boolean;
  summary:             string;
}

export interface Obj9CreateItStageResult {
  stage:                  "createIt";
  score:                  number;
  tier:                   "distinction" | "merit" | "pass" | "fail";
  allReachable:           boolean;
  baseSubjectConsistent:  boolean;   // same subject across all 3
  v2ShowsExclusions:      boolean;
  v3ShowsMoreExclusions:  boolean;
  auditIsSpecific:        boolean;
  identifiesImpactfulWord:boolean;
  ctSkill1Applied:        boolean;
  v4RevisionProvided:     boolean;
  description:            string;
  summary:                string;
}

export interface Obj9FinalResult {
  passed:          boolean;
  composite:       number;
  tier:            "distinction" | "merit" | "pass" | "fail";
  canvas:          Obj9CanvasStageResult;
  storyIt:         Obj9StoryItStageResult | null;
  createIt:        Obj9CreateItStageResult | null;
  feedbackScript:  string;
  blockedAtStage?: "canvas" | "storyIt";
}

export const OBJ9_RUBRIC = {
  lmsId:    "l1-09",
  legacyId: "a1-9",
  title:    "The Negative Prompt Lab: Editing Reality",
  canvas: {
    weight:     0.25,
    minPassPct: 65,
    fieldHints: {
      intent: {
        genuineEx:
          "To reveal what Firefly assumes belongs in an image when I don't specify it — and to test whether I can predict those assumptions in advance.",
      },
      assumptions: {
        genuineEx:
          "I predict Firefly will add a blue sky, shadows beneath the subject, and a horizon line — even though I didn't mention any of those. I'll check Version 1 to see how many I got right.",
      },
      audience: {
        genuineEx:
          "A classmate who has never seen my prompt — they should be able to describe what changed between Version 1 and Version 3 without me explaining anything.",
      },
      success: {
        genuineEx:
          "If I can name ONE specific Firefly assumption (sky, shadow, lighting, weather, framing) AND trace why it appeared based on a training-data pattern.",
      },
    },
  },
  storyIt: {
    weight: 0.25,
    checks: {
      basePromptPresent: {
        fail: "Base prompt is empty. Write ONE focused prompt — keep it simple so you can see what Firefly adds.",
        pass: "Base prompt present.",
      },
      elementAuditHas5Plus: {
        fail: "Element audit needs at least FIVE specific uninvited elements. Not 'background' — 'blue sky with scattered clouds'. Specific.",
        pass: "Element audit lists 5+ specific uninvited elements.",
      },
      v2HasNegativePrompts: {
        fail: "Version 2 needs negative prompts chosen from your element audit. E.g. 'no sky, no people, no shadows'.",
        pass: "Version 2 negative prompts present.",
      },
      v3ExtendsV2: {
        fail: "Version 3 must EXTEND Version 2 — include all V2 exclusions PLUS 2-3 more. Don't replace, build on.",
        pass: "Version 3 extends Version 2's exclusions.",
      },
    },
  },
  createIt: {
    weight: 0.50,
    passCriteria:
      "Worksheet complete. All 3 Firefly versions submitted in chat. Same subject visible across all 3. V2 and V3 show progressively excluded elements. Element audit has 5+ specific items.",
    meritCriteria:
      "All Pass criteria met. Student identifies which negative prompt word had the MOST visual impact AND explains why Firefly included that element by default.",
    distinctionCriteria:
      "All Merit criteria met. Student applies CT Skill 1: traces the Firefly assumption to its likely source (training data bias, stylistic default, cultural pattern). Bonus: includes a V4 revised base prompt.",
  },
  feedbackScripts: {
    pass:
      "You generated three versions and counted what Firefly added. " +
      "That's the first time most students REALISE AI images carry assumptions they never asked for. Hold that awareness.",
    merit:
      "You found the word that mattered most — and asked why Firefly assumed it. " +
      "That question — 'why did it think this belonged?' — is the start of reading AI images critically.",
    distinction:
      "You traced an AI assumption to its likely source. " +
      "That's CT Skill 1 at maximum rigour — questioning the source means asking why the model was trained to default to this. " +
      "You're reading the model, not just the output.",
  },
} as const;

export type Obj9Rubric = typeof OBJ9_RUBRIC;

export const OBJ9_STAGED_RUBRIC: StagedRubric = {
  kind:        "staged",
  lmsId:       OBJ9_RUBRIC.lmsId,
  title:       OBJ9_RUBRIC.title,
  tier:        "T3 — CONSTRUCT",
  difficulty:  4,
  tools:       ["Adobe Firefly"],
  worksheetTemplateUrl:  "/worksheets/OBJ9_StudentWorksheet.docx",
  worksheetTemplateName: "OBJ9_StudentWorksheet.docx",
  objectiveBlurb:
    "Generate one image in Adobe Firefly — then systematically remove " +
    "elements using negative prompts. Three versions, same base prompt, " +
    "each version excludes more. Identify which excluded words had the most " +
    "visual impact — and understand why Firefly added them in the first " +
    "place. AI images always contain assumptions you did not put there.",
  thinkItBrief:
    "Before generating — predict 3 elements Firefly will add that your " +
    "prompt does not mention. Check predictions against Version 1.",
  storyItBrief:
    "Write your base prompt. Generate V1. Audit uninvited elements. " +
    "Choose first negatives for V2. Extend for V3.",
  createItBrief:
    "Drop V1, V2, V3 in chat in order. Complete the Impact Analysis + CT " +
    "Skill 1 reflection in the worksheet.",
  canvas: {
    weight: OBJ9_RUBRIC.canvas.weight, minPassPct: OBJ9_RUBRIC.canvas.minPassPct,
    fieldHints: {
      intent: { label: "🎯 Intent", placeholder: "What specific Firefly assumption are you testing?", placeholderEx: "To see what negative prompts do.", genuineEx: OBJ9_RUBRIC.canvas.fieldHints.intent.genuineEx },
      assumptions: { label: "🔍 Assumptions", placeholder: "Name 3 elements you predict Firefly will add", placeholderEx: "I assume things will appear.", genuineEx: OBJ9_RUBRIC.canvas.fieldHints.assumptions.genuineEx },
      audience: { label: "👥 Audience", placeholder: "Someone who's never seen your prompt", placeholderEx: "My friends.", genuineEx: OBJ9_RUBRIC.canvas.fieldHints.audience.genuineEx },
      success: { label: "✅ Success", placeholder: "What discovery would be genuinely informative?", placeholderEx: "If the images look different.", genuineEx: OBJ9_RUBRIC.canvas.fieldHints.success.genuineEx },
    },
  },
  storyIt: {
    weight: OBJ9_RUBRIC.storyIt.weight,
    failLines: {
      setupTwistPayoff: OBJ9_RUBRIC.storyIt.checks.elementAuditHas5Plus.fail,
      panel3IsPunchline: OBJ9_RUBRIC.storyIt.checks.v3ExtendsV2.fail,
      characterConsistent: OBJ9_RUBRIC.storyIt.checks.v2HasNegativePrompts.fail,
    },
    passLines: {
      setupTwistPayoff: OBJ9_RUBRIC.storyIt.checks.elementAuditHas5Plus.pass,
      panel3IsPunchline: OBJ9_RUBRIC.storyIt.checks.v3ExtendsV2.pass,
      characterConsistent: OBJ9_RUBRIC.storyIt.checks.v2HasNegativePrompts.pass,
    },
    funnyTestQuestion: "(N/A for OBJ 9)", funnyTestFailureScript: "(N/A for OBJ 9)",
  },
  createIt: {
    weight: OBJ9_RUBRIC.createIt.weight,
    requirements: { panels: 3, avatarNameRequired: false, consistentCharacter: true },
    passCriteria: OBJ9_RUBRIC.createIt.passCriteria,
    meritCriteria: OBJ9_RUBRIC.createIt.meritCriteria,
    distinctionCriteria: OBJ9_RUBRIC.createIt.distinctionCriteria,
  },
  feedbackScripts: {
    pass: OBJ9_RUBRIC.feedbackScripts.pass,
    merit: OBJ9_RUBRIC.feedbackScripts.merit,
    distinction: OBJ9_RUBRIC.feedbackScripts.distinction,
    funnyTestFailure: "(N/A for OBJ 9)",
  },
};

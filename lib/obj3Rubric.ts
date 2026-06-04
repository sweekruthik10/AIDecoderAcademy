// OBJ 3 — Your Impossible World.
//
// Mirrors lib/obj6Rubric.ts. Create-It artefact is TWO IMAGES — Version 1
// (initial prompt, 10+ words) and Version 2 (Prompt 1 + 5 new descriptive
// words). Graded with gpt-4o vision against the Impossible Scene plan +
// the CT-Skill-1 reflection. Canvas threshold is 65%.
//
// Verbatim copy taken from OBJ3_Doc1_MasterSpec.docx Section 2 — do not
// rephrase.

import type { WorksheetUpload, CanvasMode, StagedRubric } from "@/lib/obj10Rubric";

export interface Obj3CanvasFields {
  intent:      string;
  assumptions: string;
  audience:    string;
  success:     string;
}

export interface Obj3StoryItFields {
  prompt1:              string;   // 10+ words, physically impossible scene
  additionalWords:      string[]; // 5 new descriptive words for Prompt 2
  additionalWordsWhy:   string;   // why those 5 words / expected visual change
}

export interface Obj3ReflectionFields {
  version1Reflection:  string;   // V1: expected vs got
  version2Reflection:  string;   // V2: which word had most impact
  ctSkill1Reflection:  string;   // which word AI misinterpreted + what was expected
}

export interface Obj3CanvasStageResult {
  stage:         "canvas";
  passed:        boolean;
  score:         number;
  mode:          CanvasMode;
  fieldFeedback: { intent: string; assumptions: string; audience: string; success: string };
  summary:       string;
}

export interface Obj3StoryItStageResult {
  stage:                "storyIt";
  passed:               boolean;
  prompt1WordCount:     number;
  prompt1IsImpossible:  boolean;   // LLM-judged: physically impossible scene
  additionalWordsCount: number;
  additionalWordsAreVisual: boolean; // LLM-judged: words add visual info
  summary:              string;
}

export interface Obj3CreateItStageResult {
  stage:                "createIt";
  score:                number;
  tier:                 "distinction" | "merit" | "pass" | "fail";
  bothImagesReachable:  boolean;
  // Vision-graded checks
  v1ShowsImpossible:    boolean;
  v2ShowsImpossible:    boolean;
  v2VisuallyDifferent:  boolean;   // V2 must be meaningfully different from V1
  // Reflection quality
  hasMeaningfulComparison: boolean;
  identifiesMostImpactfulWord: boolean;  // merit signal
  identifiesAiMisinterpretation: boolean; // distinction signal (CT Skill 1)
  description:          string;   // 1-2 sentences describing what model sees
  summary:              string;   // SAGE's reaction
}

export interface Obj3FinalResult {
  passed:          boolean;
  composite:       number;
  tier:            "distinction" | "merit" | "pass" | "fail";
  canvas:          Obj3CanvasStageResult;
  storyIt:         Obj3StoryItStageResult | null;
  createIt:        Obj3CreateItStageResult | null;
  feedbackScript:  string;
  blockedAtStage?: "canvas" | "storyIt";
}

export interface Obj3SubmissionInput {
  worksheet: WorksheetUpload;
  // Two final Canva-AI images. v1 = Prompt 1 output, v2 = Prompt 1 + 5 words.
  v1ImageUrl?: string;
  v2ImageUrl?: string;
  notes?:     string;
  profile:    { display_name: string; age_group: string };
}

// ─── Underlying rubric (verbatim copy from Section 2 of master spec) ────────

export const OBJ3_RUBRIC = {
  lmsId:    "l1-03",
  legacyId: "a1-3",
  title:    "Your Impossible World",

  canvas: {
    weight:     0.25,
    minPassPct: 65,
    fieldHints: {
      intent: {
        genuineEx:
          "To create an image that stops someone mid-scroll — something that makes them stare and ask: how is that possible? That reaction is my goal.",
      },
      assumptions: {
        genuineEx:
          "I assume Canva AI will interpret my words literally — so if I say floating city, it will show buildings in the sky. But it might show a city floating on water instead. That is a genuine risk I should plan for.",
      },
      audience: {
        genuineEx:
          "My classmates and Instagram followers aged 13–17 who scroll fast — I need something that stops the scroll in under 2 seconds. Something that makes no sense but looks completely real.",
      },
      success: {
        genuineEx:
          "If someone sees Version 2 and says — wait, what am I looking at? — before I explain what it is. That confusion is the success.",
      },
    },
  },

  storyIt: {
    weight: 0.25,
    checks: {
      prompt1Words10Plus: {
        fail:
          "Your prompt is fewer than 10 words — or describes something unusual rather than genuinely impossible. Canva AI needs enough detail to build a full visual world, not just a subject. Add more descriptive words about the environment, lighting, scale, and feeling. And check: is your scene truly impossible — something that could never happen in reality?",
        pass:
          "Prompt 1 is detailed and describes a genuinely impossible scene. Proceed to Check 2.",
      },
      addedWordsAreVisual: {
        fail:
          "Your Prompt 2 appears to only repeat or rephrase Prompt 1 — the 5 new words do not add visual information. Add words that describe lighting, texture, atmosphere, perspective, or scale — something that could change what Canva AI produces.",
        pass:
          "Prompt 2 adds meaningful visual descriptors to Prompt 1. Both images submitted. Create It is accepted.",
      },
    },
  },

  createIt: {
    weight: 0.50,
    passCriteria:
      "Worksheet uploaded with all Think It fields genuinely completed. Prompt 1 is at least 10 words. Both images submitted. Scene is genuinely impossible in both versions. Before-after comparison completed.",
    meritCriteria:
      "All Pass criteria met. Version 2 is visually different from Version 1 in a meaningful way — not just slightly brighter or slightly changed. Student can identify which of the 5 added words had the most visual impact on the output — and explains why.",
    distinctionCriteria:
      "All Merit criteria met. Student identifies a word or phrase in Prompt 1 that Canva AI interpreted differently from what was intended — and explains the assumption they made that the AI did not share. CT Skill 1 applied with precision.",
  },

  // SAGE's reactions — verbatim from Section 2.5. Short, in-character.
  feedbackScripts: {
    pass:
      "You imagined something impossible and gave Canva AI enough detail to build it. " +
      "Now read your Think It Canvas: did AI interpret your description the way you intended? " +
      "Comparing your intent to your output — that is CT Skill 1 in practice.",
    merit:
      "Version 2 is visually different — and you can identify which word caused the biggest change. " +
      "That is not a lucky observation. " +
      "That is the beginning of understanding how image AI actually responds to language — not how you assume it does.",
    distinction:
      "You identified an assumption you made about how Canva AI would interpret a word — and the AI proved you wrong. " +
      "That gap between expectation and output is exactly what CT Skill 1 is designed to surface. " +
      "The students who progress fastest in Level 4 are the ones who learned this lesson here.",
  },
} as const;

export type Obj3Rubric = typeof OBJ3_RUBRIC;

// ─── StagedRubric facade ──────────────────────────────────────────────────
// The submission panel + teacher character resolve a single `StagedRubric`
// shape via getStagedRubric(lmsId). OBJ 3 reuses that contract; OBJ10-specific
// fields (funnyTest, requirements.panels) are placeholders — never read on
// the OBJ 3 path because the validate route branches on lmsId.

export const OBJ3_STAGED_RUBRIC: StagedRubric = {
  kind:        "staged",
  lmsId:       OBJ3_RUBRIC.lmsId,
  title:       OBJ3_RUBRIC.title,
  tier:        "T2 — COMPARE",
  difficulty:  2,
  tools:       ["Canva AI"],

  worksheetTemplateUrl:  "/worksheets/OBJ3_StudentWorksheet.docx",
  worksheetTemplateName: "OBJ3_StudentWorksheet.docx",

  objectiveBlurb:
    "Imagine a scene that cannot exist in reality — and bring it to life in " +
    "Canva AI. Then add 5 more descriptive words and generate a second " +
    "version. Submit both with a before-after comparison: what changed, and " +
    "which word had the most visual impact? You are testing CT Skill 1 — did " +
    "the AI interpret your words the way you intended?",

  thinkItBrief:
    "Before imagining your world — answer four questions about who this " +
    "image is for and what reaction it needs to create.",

  storyItBrief:
    "Plan your prompts deliberately. Write Prompt 1 (10+ words describing " +
    "an impossible scene). Choose 5 additional words that will add new " +
    "visual information — lighting, texture, atmosphere, perspective, scale.",

  createItBrief:
    "Open Canva AI. Generate Prompt 1 → screenshot. Add your 5 words → " +
    "generate Prompt 2 → screenshot. Drop both images in chat. Then " +
    "complete the Before-After reflection in your worksheet.",

  canvas: {
    weight:     OBJ3_RUBRIC.canvas.weight,
    minPassPct: OBJ3_RUBRIC.canvas.minPassPct,
    fieldHints: {
      intent: {
        label:         "🎯 Intent",
        placeholder:   "What reaction in the first 2 seconds?",
        placeholderEx: "To make an impossible image.",
        genuineEx:     OBJ3_RUBRIC.canvas.fieldHints.intent.genuineEx,
      },
      assumptions: {
        label:         "🔍 Assumptions",
        placeholder:   "What might Canva AI get wrong?",
        placeholderEx: "I assume it will understand what I mean.",
        genuineEx:     OBJ3_RUBRIC.canvas.fieldHints.assumptions.genuineEx,
      },
      audience: {
        label:         "👥 Audience",
        placeholder:   "Who scrolls past vs zooms in?",
        placeholderEx: "My friends.",
        genuineEx:     OBJ3_RUBRIC.canvas.fieldHints.audience.genuineEx,
      },
      success: {
        label:         "✅ Success",
        placeholder:   "One specific reaction from one specific person",
        placeholderEx: "If it looks cool.",
        genuineEx:     OBJ3_RUBRIC.canvas.fieldHints.success.genuineEx,
      },
    },
  },

  // OBJ 3 doesn't use the OBJ-10 storyIt funny-test schema; placeholders
  // satisfy the type contract. Validator route branches on lmsId.
  storyIt: {
    weight:    OBJ3_RUBRIC.storyIt.weight,
    failLines: {
      setupTwistPayoff:    OBJ3_RUBRIC.storyIt.checks.prompt1Words10Plus.fail,
      panel3IsPunchline:   OBJ3_RUBRIC.storyIt.checks.addedWordsAreVisual.fail,
      characterConsistent: "(N/A for OBJ 3)",
    },
    passLines: {
      setupTwistPayoff:    OBJ3_RUBRIC.storyIt.checks.prompt1Words10Plus.pass,
      panel3IsPunchline:   OBJ3_RUBRIC.storyIt.checks.addedWordsAreVisual.pass,
      characterConsistent: "(N/A for OBJ 3)",
    },
    funnyTestQuestion:      "(N/A for OBJ 3)",
    funnyTestFailureScript: "(N/A for OBJ 3)",
  },

  createIt: {
    weight: OBJ3_RUBRIC.createIt.weight,
    requirements: {
      panels:              0,          // N/A — two separate images
      avatarNameRequired:  false,
      consistentCharacter: false,
    },
    passCriteria:        OBJ3_RUBRIC.createIt.passCriteria,
    meritCriteria:       OBJ3_RUBRIC.createIt.meritCriteria,
    distinctionCriteria: OBJ3_RUBRIC.createIt.distinctionCriteria,
  },

  feedbackScripts: {
    pass:             OBJ3_RUBRIC.feedbackScripts.pass,
    merit:            OBJ3_RUBRIC.feedbackScripts.merit,
    distinction:      OBJ3_RUBRIC.feedbackScripts.distinction,
    funnyTestFailure: "(N/A for OBJ 3)",
  },
};

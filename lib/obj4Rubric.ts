// OBJ 4 — Style Switcher: One Subject, Three Worlds.
//
// Mirrors lib/obj3Rubric.ts. Create-It artefact is THREE Firefly images of the
// SAME subject in three different styles: photorealistic, anime, and a student-
// chosen distinctive style. Graded with gpt-4o vision against subject
// consistency + style distinctness + CT-Skill-2 reflection quality.
// Canvas threshold 65%.
//
// Verbatim copy taken from OBJ4_Doc1_MasterSpec.docx Section 2.

import type { WorksheetUpload, CanvasMode, StagedRubric } from "@/lib/obj10Rubric";

export interface Obj4CanvasFields {
  intent:      string;
  assumptions: string;
  audience:    string;
  success:     string;
}

export interface Obj4StoryItFields {
  subject:      string;
  subjectWhy:   string;
  style3:       string;
  style3Why:    string;
  prompt1:      string;   // photorealistic
  prompt2:      string;   // anime
  prompt3:      string;   // student's chosen style
}

export interface Obj4ReflectionFields {
  style1Observation:    string;
  style1Interpretation: string;
  style2Observation:    string;
  style2Interpretation: string;
  style3Observation:    string;
  style3Interpretation: string;
  mostSurprisingStyle:  string;
  realCharacterArt:     string;  // which is "real", which "character", which "art"
  personalityDifferent: string;  // does subject feel like a different personality per style
}

export interface Obj4CanvasStageResult {
  stage:         "canvas";
  passed:        boolean;
  score:         number;
  mode:          CanvasMode;
  fieldFeedback: { intent: string; assumptions: string; audience: string; success: string };
  summary:       string;
}

export interface Obj4StoryItStageResult {
  stage:                  "storyIt";
  passed:                 boolean;
  subjectPresent:         boolean;
  style3IsDistinct:       boolean;  // not photorealistic/anime variant
  allThreePromptsPresent: boolean;
  promptsHaveStyleDescriptors: boolean;
  summary:                string;
}

export interface Obj4CreateItStageResult {
  stage:                "createIt";
  score:                number;
  tier:                 "distinction" | "merit" | "pass" | "fail";
  allReachable:         boolean;
  sameSubjectAllThree:  boolean;
  style1IsPhotoreal:    boolean;
  style2IsAnime:        boolean;
  style3IsDistinct:     boolean;
  observationsAreLiteral:     boolean;   // CT Skill 2 — pass signal
  interpretationsAreSeparate: boolean;   // CT Skill 2 — pass signal
  identifiesUnexpectedChoice: boolean;   // distinction signal (CT Skill 1 overlap)
  description:          string;
  summary:              string;
}

export interface Obj4FinalResult {
  passed:          boolean;
  composite:       number;
  tier:            "distinction" | "merit" | "pass" | "fail";
  canvas:          Obj4CanvasStageResult;
  storyIt:         Obj4StoryItStageResult | null;
  createIt:        Obj4CreateItStageResult | null;
  feedbackScript:  string;
  blockedAtStage?: "canvas" | "storyIt";
}

export interface Obj4SubmissionInput {
  worksheet: WorksheetUpload;
  v1ImageUrl?: string;   // photorealistic
  v2ImageUrl?: string;   // anime
  v3ImageUrl?: string;   // student's chosen style
  notes?:     string;
  profile:    { display_name: string; age_group: string };
}

export const OBJ4_RUBRIC = {
  lmsId:    "l1-04",
  legacyId: "a1-4",
  title:    "Style Switcher: One Subject, Three Worlds",

  canvas: {
    weight:     0.25,
    minPassPct: 65,
    fieldHints: {
      intent: {
        genuineEx:
          "To prove to myself — and anyone who sees the panels — that changing the style changes how the subject feels, even when nothing about the subject itself changed.",
      },
      assumptions: {
        genuineEx:
          "I assume photorealistic will feel the most serious and anime will feel the most energetic. But I am not sure what my Style 3 choice will produce — that is what I am genuinely testing.",
      },
      audience: {
        genuineEx:
          "My classmates who will see all three panels side by side — they should immediately feel that the subject has a different personality in each style, not just a different visual appearance.",
      },
      success: {
        genuineEx:
          "If someone sees all three panels and says the subject feels like a different character in each one — without me explaining anything. That reaction tells me style changed the meaning, not just the look.",
      },
    },
  },

  storyIt: {
    weight: 0.25,
    checks: {
      subjectConsistent: {
        fail: "Your three prompts describe different subjects. Same subject — three styles. Rewrite so the SUBJECT is identical and only the style descriptors change.",
        pass: "Subject is consistent across all three prompts.",
      },
      style3IsDistinct: {
        fail: "Your Style 3 is too close to photorealistic or anime. Pick something genuinely different — watercolour, ukiyo-e woodblock, pixel art, claymation, oil painting. Random doesn't teach you anything. Deliberate does.",
        pass: "Style 3 is a distinct, named artistic style.",
      },
      promptsHaveStyleDescriptors: {
        fail: "Your prompts don't include style-reinforcing descriptors. Don't just write '[subject], anime' — add style words like 'expressive eyes, vibrant colour palette, dynamic line'. Strong style anchors = strong contrast.",
        pass: "All three prompts have style-reinforcing descriptors.",
      },
    },
  },

  createIt: {
    weight: 0.50,
    passCriteria:
      "Worksheet uploaded with all Think It fields completed. Same subject visible in all three images. Style differences clearly visible. CT Skill 2 analysis present for each panel (one observation + one interpretation).",
    meritCriteria:
      "All Pass criteria met. Style differences are dramatic, not subtle. Interpretations are clearly separated from observations. Student identifies which style was most surprising — and explains why.",
    distinctionCriteria:
      "All Merit criteria met. Student identifies a specific visual choice Firefly made that was NOT in their prompt — applies CT Skill 1 to diagnose why. Demonstrates understanding that AI images carry hidden style assumptions.",
  },

  feedbackScripts: {
    pass:
      "Three panels. One subject. Three worlds. " +
      "Now read your Canvas — did the styles create the reaction you intended? " +
      "Comparing your intent to your output — that is the skill.",
    merit:
      "You can see the styles changed meaning, not just appearance. " +
      "Your interpretations show you noticed what Firefly prioritised in each style. " +
      "That's CT Skill 2 working — observation first, interpretation second.",
    distinction:
      "You caught Firefly making a choice you did not ask for — and you traced WHY. " +
      "That's the deeper skill: AI images always carry assumptions you did not put there. " +
      "Students who learn this in Level 1 read AI outputs critically forever after.",
  },
} as const;

export type Obj4Rubric = typeof OBJ4_RUBRIC;

export const OBJ4_STAGED_RUBRIC: StagedRubric = {
  kind:        "staged",
  lmsId:       OBJ4_RUBRIC.lmsId,
  title:       OBJ4_RUBRIC.title,
  tier:        "T2 — COMPARE",
  difficulty:  3,
  tools:       ["Adobe Firefly"],

  worksheetTemplateUrl:  "/worksheets/OBJ4_StudentWorksheet.docx",
  worksheetTemplateName: "OBJ4_StudentWorksheet.docx",

  objectiveBlurb:
    "Pick one subject. Generate it in three completely different visual styles " +
    "in Adobe Firefly — photorealistic, anime, and a style you choose " +
    "deliberately. Three panels prove one thing: how a subject is shown " +
    "changes everything about how it feels, even when the subject itself has " +
    "not changed. CT Skill 2 — observation vs interpretation.",

  thinkItBrief:
    "Before choosing your subject or opening Firefly — answer four questions " +
    "about the comparative effect you're trying to create.",

  storyItBrief:
    "Choose subject + Style 3 deliberately. Write all three Firefly prompts " +
    "BEFORE generating anything: same subject, three different style descriptors.",

  createItBrief:
    "Open Firefly. Generate Style 1 (photorealistic), Style 2 (anime), Style 3 " +
    "(your choice). Drop all three in chat in that order. Complete the CT-" +
    "Skill-2 analysis (observation + interpretation per panel) in the worksheet.",

  canvas: {
    weight:     OBJ4_RUBRIC.canvas.weight,
    minPassPct: OBJ4_RUBRIC.canvas.minPassPct,
    fieldHints: {
      intent: {
        label:         "🎯 Intent",
        placeholder:   "Specific reaction when someone sees all three panels",
        placeholderEx: "To make three versions of an image.",
        genuineEx:     OBJ4_RUBRIC.canvas.fieldHints.intent.genuineEx,
      },
      assumptions: {
        label:         "🔍 Assumptions",
        placeholder:   "What feeling do you predict each style will create?",
        placeholderEx: "I assume they will look different.",
        genuineEx:     OBJ4_RUBRIC.canvas.fieldHints.assumptions.genuineEx,
      },
      audience: {
        label:         "👥 Audience",
        placeholder:   "Who sees the panels + what makes the subject feel like a different character?",
        placeholderEx: "My friends.",
        genuineEx:     OBJ4_RUBRIC.canvas.fieldHints.audience.genuineEx,
      },
      success: {
        label:         "✅ Success",
        placeholder:   "What specific reaction would prove it worked?",
        placeholderEx: "If all three look good.",
        genuineEx:     OBJ4_RUBRIC.canvas.fieldHints.success.genuineEx,
      },
    },
  },

  storyIt: {
    weight:    OBJ4_RUBRIC.storyIt.weight,
    failLines: {
      setupTwistPayoff:    OBJ4_RUBRIC.storyIt.checks.subjectConsistent.fail,
      panel3IsPunchline:   OBJ4_RUBRIC.storyIt.checks.style3IsDistinct.fail,
      characterConsistent: OBJ4_RUBRIC.storyIt.checks.promptsHaveStyleDescriptors.fail,
    },
    passLines: {
      setupTwistPayoff:    OBJ4_RUBRIC.storyIt.checks.subjectConsistent.pass,
      panel3IsPunchline:   OBJ4_RUBRIC.storyIt.checks.style3IsDistinct.pass,
      characterConsistent: OBJ4_RUBRIC.storyIt.checks.promptsHaveStyleDescriptors.pass,
    },
    funnyTestQuestion:      "(N/A for OBJ 4)",
    funnyTestFailureScript: "(N/A for OBJ 4)",
  },

  createIt: {
    weight: OBJ4_RUBRIC.createIt.weight,
    requirements: {
      panels:              3,         // 3 style panels (same subject)
      avatarNameRequired:  false,
      consistentCharacter: true,      // same subject across all 3
    },
    passCriteria:        OBJ4_RUBRIC.createIt.passCriteria,
    meritCriteria:       OBJ4_RUBRIC.createIt.meritCriteria,
    distinctionCriteria: OBJ4_RUBRIC.createIt.distinctionCriteria,
  },

  feedbackScripts: {
    pass:             OBJ4_RUBRIC.feedbackScripts.pass,
    merit:            OBJ4_RUBRIC.feedbackScripts.merit,
    distinction:      OBJ4_RUBRIC.feedbackScripts.distinction,
    funnyTestFailure: "(N/A for OBJ 4)",
  },
};

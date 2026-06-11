// OBJ 7 — Your Film Poster: Coming Soon. Mirrors lib/obj6Rubric.ts.
// Single Firefly poster image — vision-graded against the Topic Sentence +
// Tone Word + Atmosphere Word + Avatar Name as Director credit.

import type { WorksheetUpload, CanvasMode, StagedRubric } from "@/lib/obj10Rubric";

export interface Obj7CanvasFields {
  intent:      string;
  assumptions: string;
  audience:    string;
  success:     string;
}

export interface Obj7StoryItFields {
  topicSentence: string;
  toneWord:      string;
  atmosphereWord: string;
  fireflyPrompt: string;
}

export interface Obj7ReflectionFields {
  observation:    string;
  interpretation: string;
  didItWork:      string;
}

export interface Obj7CanvasStageResult {
  stage:         "canvas";
  passed:        boolean;
  score:         number;
  mode:          CanvasMode;
  fieldFeedback: { intent: string; assumptions: string; audience: string; success: string };
  summary:       string;
}

export interface Obj7StoryItStageResult {
  stage:                "storyIt";
  passed:               boolean;
  topicIsAWorld:        boolean;   // describes a world/idea, not a character/genre
  hasToneWord:          boolean;
  hasAtmosphereWord:    boolean;
  promptCombinesAll:    boolean;
  summary:              string;
}

export interface Obj7CreateItStageResult {
  stage:                "createIt";
  score:                number;
  tier:                 "distinction" | "merit" | "pass" | "fail";
  imageReachable:       boolean;
  matchesPrompt:        boolean;
  hasCinematicQuality:  boolean;
  directorCreditVisible:boolean;
  atmosphereVisible:    boolean;
  observationIsLiteral: boolean;
  interpretationSeparate: boolean;
  identifiesPromptChange: boolean;   // distinction signal
  description:          string;
  summary:              string;
}

export interface Obj7FinalResult {
  passed:          boolean;
  composite:       number;
  tier:            "distinction" | "merit" | "pass" | "fail";
  canvas:          Obj7CanvasStageResult;
  storyIt:         Obj7StoryItStageResult | null;
  createIt:        Obj7CreateItStageResult | null;
  feedbackScript:  string;
  blockedAtStage?: "canvas" | "storyIt";
}

export const OBJ7_RUBRIC = {
  lmsId:    "l1-07",
  legacyId: "a1-7",
  title:    "Your Film Poster: Coming Soon",

  canvas: {
    weight:     0.25,
    minPassPct: 65,
    fieldHints: {
      intent: {
        genuineEx:
          "A stranger should see the poster and immediately know it's a sci-fi mystery — even before reading the tagline. Genre and mood communicated in 3 seconds.",
      },
      assumptions: {
        genuineEx:
          "I'm betting Firefly reads 'neon-lit' as cyberpunk colour palette. It might read it as decoration on top of a daytime scene. The atmosphere word is the biggest risk.",
      },
      audience: {
        genuineEx:
          "My classmate Ravi who watches a lot of sci-fi — he'll tell me immediately if the poster reads as sci-fi or as something else. He's my filter.",
      },
      success: {
        genuineEx:
          "If a stranger glances at the poster and says 'looks like a thriller set in a city at night' — that means the tone word and atmosphere word landed. They named what I intended.",
      },
    },
  },

  storyIt: {
    weight: 0.25,
    checks: {
      topicIsAWorld: {
        fail: "Your topic sentence describes a character or a genre — not a world. Try again: describe the WORLD the film exists in. 'A city where human memories can be extracted and sold as entertainment.' That's a world.",
        pass: "Topic sentence describes a world or idea — strong cinematic seed.",
      },
      hasToneWord: {
        fail: "Tone word is missing. Pick ONE emotional mood: haunting, triumphant, melancholic, urgent, dreamlike, ominous.",
        pass: "Tone word present.",
      },
      hasAtmosphereWord: {
        fail: "Visual atmosphere word is missing. Pick ONE: golden hour, stormy, neon-lit, misty, noir, sun-drenched.",
        pass: "Atmosphere word present.",
      },
      promptCombinesAll: {
        fail: "Your Firefly prompt doesn't combine the topic sentence + tone word + atmosphere word. Build it from your three elements.",
        pass: "Prompt combines all three elements.",
      },
    },
  },

  createIt: {
    weight: 0.50,
    passCriteria:
      "Worksheet uploaded with all Think It fields. Poster generated in Firefly and dropped in chat. Avatar Name visible as Director credit. Observation + interpretation written.",
    meritCriteria:
      "All Pass criteria met. Poster has clear cinematic atmosphere (lighting, composition, mood). Student can name which prompt word drove the visual mood most. Interpretation reflection is specific.",
    distinctionCriteria:
      "All Merit criteria met. Student identifies ONE specific word they would change in their prompt — and articulates the visual impact that change would have. Iterative thinking applied.",
  },

  feedbackScripts: {
    pass:
      "Poster exists. Avatar name visible. " +
      "Look at it again: does it match your Intent? " +
      "That comparison is the lesson — not the poster.",
    merit:
      "There's atmosphere here. You can point to the words that built it. " +
      "Show it to your audience without context. Their reaction tells you if it landed.",
    distinction:
      "You wrote a brief, generated a result, and named the next iteration — all in one pass. " +
      "That's a working creative loop. Most students don't get to this in Level 1. " +
      "Keep that loop active.",
  },
} as const;

export type Obj7Rubric = typeof OBJ7_RUBRIC;

export const OBJ7_STAGED_RUBRIC: StagedRubric = {
  kind:        "staged",
  lmsId:       OBJ7_RUBRIC.lmsId,
  title:       OBJ7_RUBRIC.title,
  tier:        "T2 — COMPARE",
  difficulty:  2,
  tools:       ["Adobe Firefly"],

  worksheetTemplateUrl:  "/worksheets/OBJ7_StudentWorksheet.docx",
  worksheetTemplateName: "OBJ7_StudentWorksheet.docx",

  objectiveBlurb:
    "Write one sentence about something you find genuinely interesting. Add a " +
    "tone word and a visual atmosphere word. Firefly turns those three " +
    "elements into a cinematic movie poster. Your Avatar Name appears as " +
    "Director. This is your first creative declaration of what your story " +
    "could be — and the seed of your Level 1 Capstone.",

  thinkItBrief:
    "Before writing your sentence — answer four questions about what your " +
    "poster should communicate in 3 seconds.",

  storyItBrief:
    "Write ONE sentence about the world of your film (not a character, not a " +
    "genre title — a world). Add ONE tone word + ONE atmosphere word. These " +
    "three combine into your Firefly prompt.",

  createItBrief:
    "Generate in Firefly. Avatar Name as Director credit. Drop in chat, then " +
    "complete observation + interpretation reflection in the worksheet.",

  canvas: {
    weight:     OBJ7_RUBRIC.canvas.weight,
    minPassPct: OBJ7_RUBRIC.canvas.minPassPct,
    fieldHints: {
      intent: {
        label:         "🎯 Intent",
        placeholder:   "What should a stranger be able to say in 3 seconds?",
        placeholderEx: "To make a cool poster.",
        genuineEx:     OBJ7_RUBRIC.canvas.fieldHints.intent.genuineEx,
      },
      assumptions: {
        label:         "🔍 Assumptions",
        placeholder:   "What might Firefly get wrong?",
        placeholderEx: "I assume it'll work.",
        genuineEx:     OBJ7_RUBRIC.canvas.fieldHints.assumptions.genuineEx,
      },
      audience: {
        label:         "👥 Audience",
        placeholder:   "One specific person who'll tell you if it worked",
        placeholderEx: "Everyone.",
        genuineEx:     OBJ7_RUBRIC.canvas.fieldHints.audience.genuineEx,
      },
      success: {
        label:         "✅ Success",
        placeholder:   "What can a stranger say about your film without explanation?",
        placeholderEx: "If it looks good.",
        genuineEx:     OBJ7_RUBRIC.canvas.fieldHints.success.genuineEx,
      },
    },
  },

  storyIt: {
    weight:    OBJ7_RUBRIC.storyIt.weight,
    failLines: {
      setupTwistPayoff:    OBJ7_RUBRIC.storyIt.checks.topicIsAWorld.fail,
      panel3IsPunchline:   OBJ7_RUBRIC.storyIt.checks.hasAtmosphereWord.fail,
      characterConsistent: OBJ7_RUBRIC.storyIt.checks.promptCombinesAll.fail,
    },
    passLines: {
      setupTwistPayoff:    OBJ7_RUBRIC.storyIt.checks.topicIsAWorld.pass,
      panel3IsPunchline:   OBJ7_RUBRIC.storyIt.checks.hasAtmosphereWord.pass,
      characterConsistent: OBJ7_RUBRIC.storyIt.checks.promptCombinesAll.pass,
    },
    funnyTestQuestion:      "(N/A for OBJ 7)",
    funnyTestFailureScript: "(N/A for OBJ 7)",
  },

  createIt: {
    weight: OBJ7_RUBRIC.createIt.weight,
    requirements: {
      panels:              0,
      avatarNameRequired:  true,
      consistentCharacter: false,
    },
    passCriteria:        OBJ7_RUBRIC.createIt.passCriteria,
    meritCriteria:       OBJ7_RUBRIC.createIt.meritCriteria,
    distinctionCriteria: OBJ7_RUBRIC.createIt.distinctionCriteria,
  },

  feedbackScripts: {
    pass:             OBJ7_RUBRIC.feedbackScripts.pass,
    merit:            OBJ7_RUBRIC.feedbackScripts.merit,
    distinction:      OBJ7_RUBRIC.feedbackScripts.distinction,
    funnyTestFailure: "(N/A for OBJ 7)",
  },
};

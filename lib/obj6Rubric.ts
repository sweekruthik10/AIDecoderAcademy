// OBJ 6 — Build Your AI Academy Avatar.
//
// Mirrors lib/obj10Rubric.ts. Create-It artefact is an AVATAR IMAGE — either
// generated from the kid's prompts (Visual Studio / Image output in our
// whiteboard) or a photo of themselves restyled into an avatar. Graded with
// gpt-4o vision against the Identity Card. Canvas threshold is 70% — the
// highest in Level 1.

import type { WorksheetUpload, CanvasMode, StagedRubric } from "@/lib/obj10Rubric";

export interface Obj6CanvasFields {
  intent:      string;
  assumptions: string;
  audience:    string;
  success:     string;
}

export interface Obj6IdentityCard {
  appearance:        string;
  voiceCharacter:    string;
  personalityTraits: string;
  presentationStyle: string;
  scriptConfirmed:   boolean;
  successTest:       string;
}

export interface Obj6CanvasStageResult {
  stage:         "canvas";
  passed:        boolean;
  score:         number;
  mode:          CanvasMode;
  fieldFeedback: { intent: string; assumptions: string; audience: string; success: string };
  summary:       string;
}

export interface Obj6IdentityCardStageResult {
  stage:                  "identityCard";
  passed:                 boolean;
  appearance40Plus:       boolean;
  voiceSpecific:          boolean;
  personalityBehavioural: boolean;
  scriptConfirmed:        boolean;
  summary:                string;
}

export interface Obj6CreateItStageResult {
  stage:                "createIt";
  score:                number;
  tier:                 "distinction" | "merit" | "pass" | "fail";
  imageReachable:       boolean;
  // Vision-graded checks against the Identity Card
  appearanceMatch:      boolean;  // does the rendered avatar match the kid's Section 2 appearance?
  personalityVisible:   boolean;  // do the personality cues show (posture, expression, vibe)?
  styleConsistent:      boolean;  // single coherent style, no glitches
  audienceAppropriate:  boolean;  // age-appropriate, safe content
  description:          string;   // 1-2 sentences describing what the model sees
  summary:              string;   // SAGE's reaction
}

export interface Obj6FinalResult {
  passed:          boolean;
  composite:       number;
  tier:            "distinction" | "merit" | "pass" | "fail";
  canvas:          Obj6CanvasStageResult;
  identityCard:    Obj6IdentityCardStageResult | null;
  createIt:        Obj6CreateItStageResult | null;
  feedbackScript:  string;
  blockedAtStage?: "canvas" | "identityCard";
}

export interface Obj6SubmissionInput {
  worksheet: WorksheetUpload;
  // The kid's final avatar image — either a fresh generation from Visual
  // Studio or a photo restyled into an avatar (both flow through chat first,
  // validator pulls the most recent image marker).
  avatarImageUrl?: string;
  notes?:          string;
  profile:         { display_name: string; age_group: string };
}

export const OBJ6_RUBRIC = {
  lmsId:    "l1-06",
  legacyId: "a1-6",
  title:    "Build Your AI Academy Avatar",

  canvas: {
    weight:     0.25,
    minPassPct: 70,                   // higher than OBJ 10
    fieldHints: {
      intent:      { genuineEx: "To design a presenter classmates immediately want to listen to before a single word is spoken." },
      assumptions: { genuineEx: "I assume my classmates trust informal energy more than formal authority." },
      audience:    { genuineEx: "Students 13–14 who scroll past polished but dull content; they respond to authenticity over polish." },
      success:     { genuineEx: "If a peer watched 10 seconds with no sound and thought 'I want to hear this person'." },
    },
  },

  identityCard: {
    weight: 0.25,
    checks: {
      appearance40Plus:        { fail: "Your appearance description is too short. Describe age, clothing, expression, and the setting they sit in. Forty words minimum." },
      voiceSpecific:           { fail: "'Clear and professional' could describe anyone. Name the ONE distinct quality — warm authority, quiet intensity, energetic curiosity." },
      personalityBehavioural:  { fail: "List one behavioural cue. Not 'friendly' — show how. 'Tilts head when listening' is a behavioural description." },
      scriptConfirmed:         { fail: "Confirm the three required identity lines from Section 6 — they're the brief, even if you only render the image." },
    },
  },

  createIt: {
    weight: 0.50,
    passCriteria:        "An avatar image exists, the character matches the Identity Card appearance, and the style is single + coherent.",
    meritCriteria:       "Avatar clearly reflects the Identity Card. Personality cues (posture, expression, signature element) are visible.",
    distinctionCriteria: "Avatar achieves the success definition from Think It Field 4 — distinctive, audience-appropriate, intentional.",
  },

  // Sage's reactions for OBJ 6. Short, in-character. Calls out something
  // specific instead of summarising the whole rubric.
  feedbackScripts: {
    pass:
      "There's a face on screen and it belongs to your Identity Card. " +
      "It's yours. Carry it forward.",
    merit:
      "That avatar actually reflects your Identity Card — same vibe, same character. " +
      "Hold this standard.",
    distinction:
      "I don't say this often. " +
      "You wrote a brief, and the image landed exactly on it. " +
      "Intent to evidence — that's the skill. Keep it.",
  },
} as const;

export type Obj6Rubric = typeof OBJ6_RUBRIC;

// ─── StagedRubric facade for the existing TeacherCharacter routing ─────────
// The panel + teacher character resolve a single `StagedRubric` shape via
// getStagedRubric(lmsId). OBJ 6 reuses that contract; the OBJ10-specific
// fields (funnyTest, requirements.panels) are populated with sensible
// placeholders and never read on the OBJ 6 path because the panel and the
// validate route both branch on rubric.lmsId.
export const OBJ6_STAGED_RUBRIC: StagedRubric = {
  kind:        "staged",
  lmsId:       OBJ6_RUBRIC.lmsId,
  title:       OBJ6_RUBRIC.title,
  tier:        "T3 — CONSTRUCT",
  difficulty:  3,
  tools:       ["Visual Studio (image)", "or upload a photo"],

  worksheetTemplateUrl:  "/worksheets/obj6-worksheet.docx",
  worksheetTemplateName: "OBJ6_StudentWorksheet.docx",

  objectiveBlurb: "Design your AI Academy avatar — appearance, vibe, presence — as an IMAGE. Generate one from your Identity Card prompt, or restyle your own photo. Identity persists for 6 levels.",
  thinkItBrief:   "Answer the four Canvas fields before generating. 70% threshold.",
  storyItBrief:   "Complete the Avatar Identity Card. All six sections.",
  createItBrief:  "Generate your avatar image in Visual Studio — or drop in a photo to restyle. Drop the final image in chat.",

  canvas: {
    weight:     OBJ6_RUBRIC.canvas.weight,
    minPassPct: OBJ6_RUBRIC.canvas.minPassPct,
    fieldHints: {
      intent: {
        label:        "Intent",
        placeholder:  "What impression before a word is spoken?",
        placeholderEx: "To create my avatar.",
        genuineEx:    OBJ6_RUBRIC.canvas.fieldHints.intent.genuineEx,
      },
      assumptions: {
        label:        "Assumptions",
        placeholder:  "What are you betting on?",
        placeholderEx: "I assume it will work.",
        genuineEx:    OBJ6_RUBRIC.canvas.fieldHints.assumptions.genuineEx,
      },
      audience: {
        label:        "Audience",
        placeholder:  "Specific people, specific reaction",
        placeholderEx: "My classmates.",
        genuineEx:    OBJ6_RUBRIC.canvas.fieldHints.audience.genuineEx,
      },
      success: {
        label:        "Success",
        placeholder:  "What they'd say or do",
        placeholderEx: "If it looks good.",
        genuineEx:    OBJ6_RUBRIC.canvas.fieldHints.success.genuineEx,
      },
    },
  },

  // OBJ 6 doesn't use Story-It / Funny-Test; placeholders satisfy the type
  // contract. Validator route branches on lmsId before hitting these.
  storyIt: {
    weight:    OBJ6_RUBRIC.identityCard.weight,
    failLines: {
      setupTwistPayoff:    "Identity Card needs another pass.",
      panel3IsPunchline:   "Identity Card needs another pass.",
      characterConsistent: "Identity Card needs another pass.",
    },
    passLines: {
      setupTwistPayoff:    "Identity Card complete.",
      panel3IsPunchline:   "Identity Card complete.",
      characterConsistent: "Identity Card complete.",
    },
    funnyTestQuestion:      "(N/A for OBJ 6)",
    funnyTestFailureScript: "(N/A for OBJ 6)",
  },

  createIt: {
    weight: OBJ6_RUBRIC.createIt.weight,
    requirements: {
      panels:              0,           // N/A — video, not panels
      avatarNameRequired:  true,
      consistentCharacter: true,
    },
    passCriteria:        OBJ6_RUBRIC.createIt.passCriteria,
    meritCriteria:       OBJ6_RUBRIC.createIt.meritCriteria,
    distinctionCriteria: OBJ6_RUBRIC.createIt.distinctionCriteria,
  },

  feedbackScripts: {
    pass:             OBJ6_RUBRIC.feedbackScripts.pass,
    merit:            OBJ6_RUBRIC.feedbackScripts.merit,
    distinction:      OBJ6_RUBRIC.feedbackScripts.distinction,
    funnyTestFailure: "(N/A for OBJ 6)",
  },
};

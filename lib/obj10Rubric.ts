// OBJ 10 — Your First AI Comic Strip — Staged Rubric
// Spec: OBJ10_Objectives_Specification.docx.pdf (Section 2)
//
// This rubric is STAGED — three sequential gated stages — not a single LLM
// pass like the other 17 objectives. The validator route at
// /api/aida/validate/obj10 reads this file to drive the pipeline.
//
// Why three stages and not one?
// - Stage 1 (Canvas): forces the student to articulate intent before tools open
// - Stage 2 (Story It): structural sanity check on the plan
// - Stage 3 (Create It): vision-grade the actual comic
// Each stage gates the next so a student can't skip the "thinking" parts.

import type { ComplexityTier } from "@/lib/objectiveRubrics";

// ─── Submission shape ──────────────────────────────────────────────────────
// The student uploads:
//   1. A worksheet file (.pdf or .docx) containing their Think It Canvas +
//      Story It plan + Funny Test confirmation. Mandatory.
//   2. Zero or more comic images (.png / .jpg / .webp / .gif). Optional —
//      if absent, the validator falls back to the most recent matching
//      whiteboard creation (image for OBJ 10 since outputType === "image").
//   3. A small free-text "notes" field. Optional. Used as supplementary
//      context for the LLM AND as override for missing worksheet fields.
//
// The validator extracts Canvas + Story It from the worksheet itself —
// students never type the form fields in-app any more.

// Worksheet payload sent to the validator.
//   - kind: "file"        — original .pdf/.docx upload route. Validator runs
//                            extractWorksheet(...) then extractFields(...).
//   - kind: "inline-form" — answers typed directly into WorksheetPopup. The
//                            validator skips OpenAI extraction entirely and
//                            uses extractFromInlineForm(...) — exact, fast.
export type WorksheetUpload =
  | { kind?: "file";        url: string; format: "pdf" | "docx"; filename: string }
  | { kind:  "inline-form"; data: Record<string, string | boolean>; lmsId: string };

export interface WhiteboardImageMessage {
  url: string;               // public URL of the generated image
  // We don't need the prompt/role/etc. — only the URL is fed to vision.
}

export interface ObjSubmissionInput {
  worksheet:        WorksheetUpload;
  comicImageUrls:   string[];               // student-uploaded images (preferred)
  notes:            string;                 // small textarea — context + override
  whiteboardImages: WhiteboardImageMessage[]; // fallback: recent whiteboard images
}

// Field shapes the LLM extracts from the worksheet — kept here so the
// graders can refer to them in their schemas / prompts.

export interface CanvasFields {
  intent:      string;
  assumptions: string;
  audience:    string;
  success:     string;
}

export interface StoryItPanel {
  imagePrompt: string;
  dialogue:    string;
}

export interface StoryItFields {
  oneSentenceStory: string;
  panels:           [StoryItPanel, StoryItPanel, StoryItPanel];
  funnyTestPassed:  boolean;       // strict: anything not clearly "Yes" → false
}

// ─── Stage results returned by the validator ────────────────────────────────

export type CanvasMode = "challenge" | "nudge" | "celebrate";

export interface CanvasStageResult {
  stage:           "canvas";
  passed:          boolean;        // score >= 65
  score:           number;         // 0-100
  mode:            CanvasMode;
  fieldFeedback: {
    intent:      string;
    assumptions: string;
    audience:    string;
    success:     string;
  };
  summary:         string;         // short line spoken by teacher
}

export interface StoryItStageResult {
  stage:           "storyIt";
  passed:          boolean;        // all 3 binary checks pass AND funny test passed
  checks: {
    setupTwistPayoff:    { passed: boolean; line: string };
    panel3IsPunchline:   { passed: boolean; line: string };
    characterConsistent: { passed: boolean; line: string };
  };
  funnyTestBlocked: boolean;       // true when student answered No but submitted
  summary:          string;
}

export interface CreateItStageResult {
  stage:           "createIt";
  score:           number;         // 0-100, applied to 50% weight
  tier:            "fail" | "pass" | "merit" | "distinction";
  panelsDetected:  number;
  characterConsistent: boolean;
  avatarNameVisible:   boolean;
  panel3VisuallyDistinct: boolean;
  summary:         string;
  description:     string;         // CoT description of the comic, for transparency
}

export interface FinalResult {
  passed:           boolean;
  composite:        number;        // 0-100, the headline score
  tier:             "fail" | "pass" | "merit" | "distinction";
  canvas:           CanvasStageResult;
  storyIt:          StoryItStageResult | null;
  createIt:         CreateItStageResult | null;
  feedbackScript:   string;        // verbatim post-submission script from spec
  blockedAtStage:   "canvas" | "storyIt" | null;
}

// ─── The rubric itself ──────────────────────────────────────────────────────

export interface StagedRubric {
  kind:        "staged";
  lmsId:       string;
  title:       string;
  tier:        ComplexityTier;
  difficulty:  1 | 2 | 3 | 4 | 5 | 6;
  tools:       string[];

  // Public path to a downloadable worksheet template the student fills in.
  // Served from /public/worksheets so it's just a static download — no API.
  worksheetTemplateUrl: string;
  worksheetTemplateName: string;

  // What's shown on the LMS card / objective summary in-app.
  objectiveBlurb: string;
  thinkItBrief:   string;
  storyItBrief:   string;
  createItBrief:  string;

  // Stage 1 — Canvas
  canvas: {
    weight:      number;            // 0.25 per spec
    minPassPct:  number;            // 65 per spec
    fieldHints:  Record<keyof CanvasFields, {
      label:        string;
      placeholder:  string;
      placeholderEx: string;        // shown faded — disappears on focus
      genuineEx:    string;         // shown as the bar to clear
    }>;
  };

  // Stage 2 — Story It
  storyIt: {
    weight: number;                 // 0.25 per spec
    failLines: {
      setupTwistPayoff:    string;  // verbatim from spec table row 1
      panel3IsPunchline:   string;  // verbatim from spec table row 2
      characterConsistent: string;  // verbatim from spec table row 3
    };
    passLines: {
      setupTwistPayoff:    string;
      panel3IsPunchline:   string;
      characterConsistent: string;
    };
    funnyTestQuestion:     string;
    funnyTestFailureScript: string; // verbatim from spec — when student says No but submits
  };

  // Stage 3 — Create It
  createIt: {
    weight: number;                 // 0.50 per spec
    requirements: {
      panels:              number;  // 3
      avatarNameRequired:  boolean; // true
      consistentCharacter: boolean; // true
    };
    passCriteria:        string;
    meritCriteria:       string;
    distinctionCriteria: string;
  };

  // Verbatim post-submission scripts (Section 2.5)
  feedbackScripts: {
    pass:               string;
    merit:              string;
    distinction:        string;
    funnyTestFailure:   string;
  };
}

// ─── OBJ 10 — Your First AI Comic Strip ─────────────────────────────────────
// All copy below is taken verbatim from the spec PDF. Do not rephrase.

export const OBJ10_RUBRIC: StagedRubric = {
  kind:       "staged",
  lmsId:      "l1-10",
  title:      "Your First AI Comic Strip",
  tier:       "T4 — EXPERIMENT",
  difficulty: 4,
  tools:      ["Whiteboard (image)"],

  worksheetTemplateUrl:  "/worksheets/OBJ10_StudentWorksheet.docx",
  worksheetTemplateName: "OBJ10_StudentWorksheet.docx",

  objectiveBlurb:
    "Create a 3-panel AI comic strip about anything funny, absurd, or " +
    "ridiculous you can imagine — generated right here in the whiteboard. " +
    "No drawing skills needed. Just your imagination, a plan, and a sense of " +
    "humour. By the end you will have something that looks like it came from " +
    "a professional comic artist — because in 2026, it does. There is only " +
    "one rule: if your comic does not make YOU laugh, fix it before you " +
    "submit.",

  thinkItBrief:
    "Before generating anything — answer four questions about who this comic " +
    "is for and what it needs to make them feel.",

  storyItBrief:
    "Plan your comic completely before generating anything. Write your " +
    "one-sentence story, break it into three panels, write your image " +
    "prompts, write your dialogue, and test whether panel 3 actually makes " +
    "you react.",

  createItBrief:
    "Switch the whiteboard output to IMAGE. Type your comic prompt — the " +
    "image generator produces all three panels side by side. Drop the final " +
    "image in chat and SAGE grades it.",

  canvas: {
    weight:     0.25,
    minPassPct: 65,
    fieldHints: {
      intent: {
        label:         "🎯 Intent",
        placeholder:   "What specific reaction from what specific person tells you this worked?",
        placeholderEx: "to make a comic",
        genuineEx:     "make someone laugh so hard they screenshot it and send it to their group chat",
      },
      assumptions: {
        label:         "🔍 Assumptions",
        placeholder:   "What bet are you making that could be wrong?",
        placeholderEx: "I assume it will work",
        genuineEx:     "I assume the punchline lands without panels 1 and 2 building tension — this could be wrong",
      },
      audience: {
        label:         "👥 Audience",
        placeholder:   "Specific person + their humour type",
        placeholderEx: "my friends",
        genuineEx:     "a 14-year-old who laughs when something ordinary goes catastrophically wrong",
      },
      success: {
        label:         "✅ Success Definition",
        placeholder:   "What observable behaviour proves it worked?",
        placeholderEx: "if it looks good",
        genuineEx:     "if someone tags a friend in the comments without being prompted to do so",
      },
    },
  },

  storyIt: {
    weight: 0.25,
    failLines: {
      setupTwistPayoff:
        "Your story sentence has no twist. Add the moment where something " +
        "changes or goes wrong — that shift is what makes panels 2 and 3 work.",
      panel3IsPunchline:
        "Panel 3 continues the story instead of ending it. It must be the " +
        "punchline or reveal. Does it make you react? If not — change it " +
        "before generating.",
      characterConsistent:
        "Character description changes between panels — copy the exact " +
        "appearance words from Panel 1 into Panels 2 and 3 verbatim.",
    },
    passLines: {
      setupTwistPayoff:
        "One-sentence story has all three elements. Panel breakdown is unlocked.",
      panel3IsPunchline:
        "Panel 3 line is a genuine punchline. Image generation is unlocked.",
      characterConsistent:
        "Character description consistent across all panels. Proceed to Create It output assessment.",
    },
    funnyTestQuestion:
      "Final check before you submit: does Panel 3 make YOU react? Be honest.",
    funnyTestFailureScript:
      "You confirmed in your worksheet that panel 3 did not make you react " +
      "— and you submitted anyway. Your Story It has one rule: if it does " +
      "not make you react, do not generate it. Go back. Fix panel 3. Resubmit.",
  },

  createIt: {
    weight: 0.50,
    requirements: {
      panels:              3,
      avatarNameRequired:  true,
      consistentCharacter: true,
    },
    passCriteria:
      "Worksheet uploaded with all Think It fields genuinely completed and " +
      "all five Story It parts present including Funny Test confirmation. " +
      "Comic submitted with 3 distinct panels, readable text, and Avatar " +
      "Name visible. Panel 3 is visually distinct from panels 1 and 2.",
    meritCriteria:
      "All Pass criteria met. Three panels tell a visually coherent story — " +
      "first-time reader follows the joke without explanation. Panel 3 " +
      "image clearly shows the punchline moment. Character appearance is " +
      "consistent across all three panels. Assumption reflection in " +
      "worksheet correctly identifies which assumption held and which did not.",
    distinctionCriteria:
      "All Merit criteria met. Comic achieves the exact success definition " +
      "written in Think It Canvas. Student adds one sentence in their " +
      "worksheet identifying which word in their Panel 3 image prompt had " +
      "the most visual impact — demonstrating understanding of prompt " +
      "precision. Comic is polished enough to post on Instagram without " +
      "appearing to be a student exercise.",
  },

  // Sage's reactions — short, in-character, lands like a coach who actually
  // looked at your work. Not a score-card. Not a bullet list. The score is
  // shown elsewhere; here the CHARACTER reacts. Each script is 2-4 short
  // sentences max — designed to be spoken aloud as TTS without dragging.
  feedbackScripts: {
    pass:
      "Panel three landed. That's the hard part — most people miss it. " +
      "The setup did its job, the punchline paid off. " +
      "Carry that loop into the next one.",
    merit:
      "That actually surprised me. The punchline didn't just land — it had timing. " +
      "Read your Success Definition again. Show this to someone who matches your Audience. " +
      "If they react the way you said they would, you've nailed it.",
    distinction:
      "I don't say this often. " +
      "You said what you'd make, and you made exactly that. " +
      "Thought, structure, build, evidence. The full loop. Keep it.",
    funnyTestFailure:
      "Hold on. Your worksheet says panel three didn't make you react — and you sent it anyway. " +
      "Story It has one rule: if it doesn't land for you, it doesn't ship. " +
      "Go fix three. Then come back.",
  },
};

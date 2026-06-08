"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { speakAsTeacher, type SpeakHandle } from "@/lib/teacherAudio";
import {
  type StagedRubric,
  type WorksheetUpload,
  type WhiteboardImageMessage,
  type FinalResult,
} from "@/lib/obj10Rubric";
import { useValidatorWriter } from "@/lib/chatChannels";
import { getObjectiveIntro, type ObjectiveIntroBeat } from "@/lib/objectiveIntros";

// SAGE — the validator's name. Replaces the bureaucratic "VALIDATOR" label.
// One syllable, gender-neutral, suggests insight without being old-timer.
const VALIDATOR_NAME = "SAGE";

// Pause between dialogue beats (ms). Short enough to feel like conversation,
// long enough that each line LANDS before the next starts. JRPG-paced.
const BEAT_PAUSE_MS = 600;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────
// Validator panel — DIALOGUE-ONLY.
//
// All inputs (worksheet form, .docx/.pdf upload, comic/video upload, notes)
// live in WorksheetPopup. This panel does just three things:
//   1. INTRO   — first session open: warm-coach greeting + Got It.
//   2. READY   — kid taps teacher again: shows status + a single Validate
//                button. Clicking it pulls the saved pending payload + the
//                most-recent whiteboard output and hits the validator route.
//   3. RESULT  — tier badge, stage scores, feedback script, retry/done.
// ─────────────────────────────────────────────────────────────────────────

interface Props {
  open:             boolean;
  rubric:           StagedRubric;
  profile:          { id?: string; display_name?: string; age_group?: string } | null;
  whiteboardImages: WhiteboardImageMessage[];   // recent images from whiteboard chat
  // Worksheet docs the kid dropped into chat (priority: popup wins, this is fallback)
  whiteboardDocs?:  { url: string; filename: string; format: "pdf" | "docx" }[];
  // Videos the kid dropped into chat (kept for forward-compat; OBJ 6 uses images now)
  whiteboardVideos?: { url: string; filename: string }[];
  // Audio files from whiteboard chat — used by OBJ 5 (Suno) and OBJ 8 (ElevenLabs)
  whiteboardAudios?: { url: string; filename: string }[];
  onClose:          () => void;
  onComplete:       (composite: number, tier: FinalResult["tier"]) => Promise<void>;
}

// ── Per-field roasty lines (empty field → specific callout) ─────────────────
// Roasty + funny tone per the design brief — dry wit, no cringe, Gen Z/Alpha.
// Each key matches the exact field id used in worksheetSchemas.ts / validators.
// Only fires for completely empty fields; vague-but-filled fields go to SAGE's
// rubric grading (she'll call them out there with specific feedback).

const OBJ6_FIELD_LINES: Record<string, string> = {
  intent:            "Intent — blank. What is this avatar actually for? Start there.",
  assumptions:       "Assumptions — empty. Bold of you to assume I won't notice.",
  audience:          "Audience — nothing. 'Everyone' is a red flag. Name one specific person.",
  success:           "Success — also blank. How will you know when it works? I can't read minds.",
  appearance:        "Appearance — skipped. Even stick figures have a description.",
  voiceCharacter:    "Voice and character — blank. Give it a personality or it's just a floating logo.",
  personalityTraits: "Personality traits — empty. Even NPCs have three of these.",
  presentationStyle: "Presentation style — nothing. Formal? Casual? Robotic? Pick one.",
  successTest:       "Success test — skipped. How will you know the avatar actually works for someone?",
};

const OBJ10_FIELD_LINES: Record<string, string> = {
  intent:           "Intent — blank. What is this comic actually about? Start there.",
  assumptions:      "Assumptions — empty. Bold of you to assume I won't notice.",
  audience:         "Audience — nothing. 'Everyone' is a red flag. Name one person.",
  success:          "Success — also blank. How will you know the comic landed?",
  oneSentenceStory: "One-sentence story — blank. The whole comic hangs off this one line. Write it.",
  panel1Image:      "Panel 1 image prompt — empty. The setup is kind of essential to the rest of this.",
  panel1Dialogue:   "Panel 1 dialogue — nothing. Someone has to say something in panel one.",
  panel2Image:      "Panel 2 image prompt — blank. Comics need a middle. That's the genre.",
  panel2Dialogue:   "Panel 2 dialogue — also blank. The two of you are matching.",
  panel3Image:      "Panel 3 image prompt — skipped. The punchline visual isn't optional.",
  panel3Dialogue:   "Panel 3 punchline dialogue — missing. That's a joke with no ending. Classic move.",
};

const OBJ1_FIELD_LINES: Record<string, string> = {
  intent:           "Intent — blank. What reaction do you want when this is read aloud?",
  assumptions:      "Assumptions — empty. What might ChatGPT get wrong? Name at least two.",
  audience:         "Audience — nothing. The specific people in this room. Name them.",
  success:          "Success — also blank. Observable reaction from ONE person.",
  q1WhoAreYou:      "Q1 (Who are you) — blank. 2-3 sentences. Not your name — what you're like.",
  q2WhatYouCare:    "Q2 (What you care about) — blank. 2-3 sentences. What keeps you thinking?",
  q3WhatDrives:     "Q3 (What drives you) — blank. 2-3 sentences. What pushes you forward?",
  q4WhereGoing:     "Q4 (Where going) — blank. 2-3 sentences. 5 years out.",
  finalIntro:       "Final intro — empty. Paste the 2-sentence Netflix intro from ChatGPT.",
  avatarName:       "Avatar Name — missing. Identity for 6 levels. Choose it intentionally.",
  avatarNameReason: "Avatar Name reason — empty. What does it represent?",
  correctAssumption:"Correct-assumption reflection — blank. What did ChatGPT do as predicted?",
  wrongAssumption:  "Wrong-assumption reflection — blank. What surprised you?",
  observation:      "Observation — blank. What does the intro literally say?",
  interpretation:   "Interpretation — blank. What does it imply about you?",
};

const OBJ9_FIELD_LINES: Record<string, string> = {
  intent:                  "Intent — blank. What specific Firefly assumption are you testing?",
  assumptions:             "Assumptions — empty. Predict 3 elements Firefly will add that you didn't request.",
  audience:                "Audience — nothing. Someone who hasn't seen your prompt — what would they say changed?",
  success:                 "Success — also blank. What specific discovery would be informative?",
  basePrompt:              "Base prompt — empty. Same prompt for all 3 versions. Keep it focused.",
  auditItem1:              "Element audit needs at least 5 specific uninvited elements.",
  auditItem2:              "Element audit needs at least 5 specific uninvited elements.",
  auditItem3:              "Element audit needs at least 5 specific uninvited elements.",
  auditItem4:              "Element audit needs at least 5 specific uninvited elements.",
  auditItem5:              "Element audit needs at least 5 specific uninvited elements.",
  v2NegativePrompt:        "V2 negative prompt — empty. Choose 2-4 elements from your audit.",
  v3NegativePrompt:        "V3 negative prompt — empty. Extend V2 with 2-3 more exclusions.",
  mostImpactfulExclusion:  "Most impactful exclusion — blank. Which word changed the image most? Why did Firefly include it?",
  ctSkill1Assumption:      "CT Skill 1 reflection — blank. What did Firefly assume + where did the assumption come from?",
};

const OBJ8_FIELD_LINES: Record<string, string> = {
  intent:                   "Intent — blank. What analytical question does this blind eval answer?",
  assumptions:              "Assumptions — empty. What are you betting about your ability to identify voice personality by ear?",
  audience:                 "Audience — nothing. Whose listening perspective are you borrowing?",
  success:                  "Success — also blank. What does accurate auditory observation look like?",
  topic:                    "Topic — empty. Write what your 3-sentence script is about.",
  sentence1:                "Sentence 1 — missing. Complete sentence, emotionally clear.",
  sentence2:                "Sentence 2 — missing.",
  sentence3:                "Sentence 3 — missing.",
  voice1Name:               "Voice 1 name — missing. Choose by ElevenLabs name, no previews.",
  voice2Name:               "Voice 2 name — missing.",
  voice3Name:               "Voice 3 name — missing.",
  voiceAObservation:        "Voice A observation — blank. Literal auditory facts only.",
  voiceAInterpretation:     "Voice A interpretation — blank. What personality does it communicate?",
  voiceBObservation:        "Voice B observation — blank.",
  voiceBInterpretation:     "Voice B interpretation — blank.",
  voiceCObservation:        "Voice C observation — blank.",
  voiceCInterpretation:     "Voice C interpretation — blank.",
  voiceAReveal:             "Voice A reveal — blank. Which ElevenLabs voice was it?",
  voiceBReveal:             "Voice B reveal — blank.",
  voiceCReveal:             "Voice C reveal — blank.",
  whereWrong:               "Where wrong — blank. Which voice did you misread?",
  mostInterestingMismatch:  "Most interesting mismatch — blank. What did the voice name imply that didn't match?",
};

const OBJ7_FIELD_LINES: Record<string, string> = {
  intent:         "Intent — blank. What should a stranger say about your film world in 3 seconds?",
  assumptions:    "Assumptions — empty. What might Firefly read differently from what you intend?",
  audience:       "Audience — nothing. Name ONE person who'll tell you if the poster worked.",
  success:        "Success — also blank. What can a stranger SAY about your film without explanation?",
  topicSentence:  "Topic sentence — empty. Describe the WORLD of your film, not a character or genre.",
  toneWord:       "Tone word — missing. Pick ONE: haunting, urgent, melancholic, dreamlike.",
  atmosphereWord: "Atmosphere word — missing. Pick ONE: golden hour, neon-lit, noir, stormy.",
  fireflyPrompt:  "Firefly prompt — empty. Combine all three elements into the prompt.",
  observation:    "Observation — blank. What do you LITERALLY see? Facts only.",
  interpretation: "Interpretation — blank. What does the poster communicate?",
  didItWork:      "Did it work — blank. Compare interpretation to intent. Which word would you change?",
};

const OBJ5_FIELD_LINES: Record<string, string> = {
  intent:                 "Intent — blank. What should listeners FEEL in the first 5 seconds?",
  assumptions:            "Assumptions — empty. What are you betting on about how Suno will interpret your words?",
  audience:               "Audience — nothing. Who hears this first — and what music do they listen to?",
  success:                "Success — also blank. What does one specific person SAY or DO if it captures you?",
  word1:                  "Personality Word 1 — missing. You need 5 words that describe YOU.",
  word2:                  "Personality Word 2 — missing.",
  word3:                  "Personality Word 3 — missing.",
  word4:                  "Personality Word 4 — missing.",
  word5:                  "Personality Word 5 — missing.",
  styleBrief:             "Style brief — empty. Need genre + energy + mood + instrument.",
  obj6Energy:             "OBJ 6 connection — blank. What energy should the audience feel during your avatar reveal?",
  iterationElement:       "Iteration plan — blank. What ONE element would you change if you regenerated?",
  correctAssumption:      "Correct assumption reflection — blank.",
  mostImpactfulElement:   "Most impactful element — blank. Name what in your brief shaped the track most.",
};

const OBJ4_FIELD_LINES: Record<string, string> = {
  intent:               "Intent — blank. What reaction do you want from someone seeing all three panels?",
  assumptions:          "Assumptions — empty. Predict the feeling each style will create. Which is the wildcard?",
  audience:             "Audience — nothing. Who sees this and what makes the subject feel like a different character?",
  success:              "Success — also blank. What does someone literally say or do when they see all three?",
  subject:              "Subject — empty. Same subject across all three. Pick one.",
  subjectWhy:           "Why this subject — blank. Why does it work across very different styles?",
  style3:               "Style 3 — missing. Watercolour? Ukiyo-e? Cyberpunk neon? Pick a named, distinct style.",
  style3Why:            "Why Style 3 — empty. What feeling do you expect it to create that 1 and 2 don't?",
  prompt1:              "Prompt 1 (Photorealistic) — empty. Include style-reinforcing words, not just 'photorealistic'.",
  prompt2:              "Prompt 2 (Anime) — empty. Same — anime needs descriptors: 'expressive eyes, dynamic pose, vibrant'.",
  prompt3:              "Prompt 3 (your style) — empty. Style word alone isn't enough. Add descriptors that reinforce it.",
  style1Observation:    "Style 1 observation — blank. Literally what changed visually? Facts only.",
  style1Interpretation: "Style 1 interpretation — blank. What did Firefly prioritise in photorealistic?",
  style2Observation:    "Style 2 observation — blank. Literally what changed?",
  style2Interpretation: "Style 2 interpretation — blank. What did Firefly emphasise in anime?",
  style3Observation:    "Style 3 observation — blank. Literally what changed?",
  style3Interpretation: "Style 3 interpretation — blank. What did Firefly do with your chosen style?",
  mostSurprisingStyle:  "Most surprising style — blank. Which one defied your prediction?",
  realCharacterArt:     "Real / character / art — blank. Which panel reads as which?",
  personalityDifferent: "Personality reflection — blank. Different character, or same character in different paint?",
};

const OBJ2_FIELD_LINES: Record<string, string> = {
  intent:                "Intent — blank. What are you actually testing across 3 AIs?",
  assumptions:           "Assumptions — empty. Predict how each AI will respond differently.",
  audience:              "Audience — nothing. Who needs to see the difference?",
  success:               "Success — also blank. What concrete difference would prove the test worked?",
  question:              "Question — empty. ONE question, asked to all 3 AIs. Open, personal, reasoning-required.",
  chatGptObservation:    "ChatGPT observation — blank. Facts only. What did it literally say?",
  chatGptInterpretation: "ChatGPT interpretation — blank. What does it tell you about how ChatGPT reasoned?",
  geminiObservation:     "Gemini observation — blank. Facts only.",
  geminiInterpretation:  "Gemini interpretation — blank.",
  claudeObservation:     "Claude observation — blank. Facts only.",
  claudeInterpretation:  "Claude interpretation — blank.",
  agreement:             "Agreement — blank. Where did all 3 agree?",
  surprisingDifference:  "Surprising divergence — blank. What did ONE AI do that the others did not?",
  whichAiForType:        "Which AI for this question type — blank. Name one + why.",
  correctAssumption:     "Correct-assumption reflection — blank.",
  wrongAssumption:       "Wrong-assumption reflection — blank.",
};

const OBJ3_FIELD_LINES: Record<string, string> = {
  intent:              "Intent — blank. What reaction should this image trigger? Start there.",
  assumptions:         "Assumptions — empty. You're betting on Canva AI reading your mind. Name the bet.",
  audience:            "Audience — nothing. 'My friends' is a category, not a person.",
  success:             "Success — also blank. What does it look like when this works?",
  prompt1:             "Prompt 1 — empty. Canva AI needs at least 10 words to build a world.",
  additionalWord1:     "Additional Word 1 — missing. You need 5 visual words.",
  additionalWord2:     "Additional Word 2 — missing.",
  additionalWord3:     "Additional Word 3 — missing.",
  additionalWord4:     "Additional Word 4 — missing.",
  additionalWord5:     "Additional Word 5 — missing.",
  additionalWordsWhy:  "Why those 5 words — empty. Tell me what visual change each one should make.",
  version1Reflection:  "Version 1 reflection — blank. What did you expect versus what did you get?",
  version2Reflection:  "Version 2 reflection — blank. Which of the 5 words moved the image most?",
  ctSkill1Reflection:  "CT Skill 1 reflection — blank. Which word did Canva AI misread? That's the whole point.",
};

function getEmptyFieldLines(
  data: Record<string, string | boolean>,
  isObj6: boolean,
  lmsId?: string,
): string[] {
  const map =
    lmsId === "l1-01" ? OBJ1_FIELD_LINES :
    lmsId === "l1-02" ? OBJ2_FIELD_LINES :
    lmsId === "l1-03" ? OBJ3_FIELD_LINES :
    lmsId === "l1-04" ? OBJ4_FIELD_LINES :
    lmsId === "l1-05" ? OBJ5_FIELD_LINES :
    lmsId === "l1-07" ? OBJ7_FIELD_LINES :
    lmsId === "l1-08" ? OBJ8_FIELD_LINES :
    lmsId === "l1-09" ? OBJ9_FIELD_LINES :
    isObj6            ? OBJ6_FIELD_LINES :
                        OBJ10_FIELD_LINES;
  return Object.entries(map)
    .filter(([key]) => {
      const val = data[key];
      return val === undefined || val === null || val.toString().trim() === "";
    })
    .map(([, line]) => line);
}

// Funny SAGE one-liners for "no worksheet anywhere" — kid sees one at random.
// SAGE = Skeptical Mentor, but with a wry sense of humour. Never mean.
const FUNNY_NO_WORKSHEET = [
  "The worksheet is emptier than my patience right now. Fill it in, or drop the doc.",
  "I'm staring at a blank slate. Worksheet, please.",
  "No worksheet, no validation. The form's right there. The upload zone's right there. Pick one.",
  "You came to be graded… without the work. Bold. Now fill the worksheet.",
  "Help me help you. I need either the form filled in or a doc uploaded.",
] as const;

// ── Punchy celebration openers ───────────────────────────────────────────────
// Short one-liners spoken BEFORE the rubric script when the kid hits pass /
// merit / distinction. Picked at random so demos and replays feel alive — the
// kid doesn't hear the same line twice. Each line is <12 words, no emojis,
// matches the Skeptical Mentor voice (warmer when they earn it).
const CELEBRATION_OPENERS: Record<"pass" | "merit" | "distinction", readonly string[]> = {
  pass: [
    "Okay. You did the thing.",
    "There it is.",
    "Not bad. Not bad at all.",
    "That works.",
    "Look at you actually shipping.",
  ],
  merit: [
    "Now we're cooking.",
    "Okay — that one had teeth.",
    "Yeah, that lands.",
    "Sharp work.",
    "I felt that one.",
  ],
  distinction: [
    "Wait. Run that back.",
    "Okay, full stop. That was special.",
    "That's the bar. Raised.",
    "Right. I'm taking notes now.",
    "Top of the class today.",
  ],
};

function pickCelebrationOpener(tier: "distinction" | "merit" | "pass" | "fail"): string | null {
  if (tier === "fail") return null;
  const pool = CELEBRATION_OPENERS[tier];
  return pool[Math.floor(Math.random() * pool.length)];
}

type Phase = "intro" | "ready" | "submitting" | "result";

// ── Context-aware ready-line picker ─────────────────────────────────────────
// On second+ opens (after the intro has been shown), Sage doesn't repeat the
// task brief. Instead Sage notices SOMETHING SPECIFIC about what the kid did —
// uploaded files, wrote thoughtful notes, generated whiteboard images — and
// reflects it back. This is the parasocial-bond mechanic: the kid feels SEEN.
// Generic random pools came across as a chatbot; this feels like a coach who
// looked at your work before you sat down.

const READY_LINES_EMPTY = [
  "No rush. Worksheet first… then come back.",
  "Take your time. Get the brief right and the rest follows.",
  "The worksheet is waiting whenever you are.",
];

const READY_LINES_GENERIC_PENDING = [
  "Right. Show me what you've got.",
  "Let me have a look.",
  "When you're ready, I am.",
];

interface ReadyContext {
  hasInlineForm:   boolean;
  hasFile:         boolean;
  mediaCount:      number;
  notesLen:        number;
  whiteboardCount: number;
  isObj6:          boolean;
  emptyFieldCount: number;  // required fields that are still blank in the inline form
}

function pickReadyLine(ctx: ReadyContext): string {
  const { hasInlineForm, hasFile, mediaCount, notesLen, whiteboardCount, isObj6, emptyFieldCount } = ctx;
  const hasWorksheet = hasInlineForm || hasFile;

  // Nothing yet — gentle, not pushy.
  if (!hasWorksheet && mediaCount === 0 && whiteboardCount === 0) {
    return pickRandom(READY_LINES_EMPTY);
  }

  // Inline form started but has gaps — surface the count so the kid knows
  // before they click validate and hear the full field-by-field breakdown.
  if (hasInlineForm && emptyFieldCount === 1) {
    return "One gap in there. Quick fix — then show me.";
  }
  if (hasInlineForm && emptyFieldCount === 2) {
    return "Found two gaps. Worth filling those before you hit validate.";
  }
  if (hasInlineForm && emptyFieldCount >= 3) {
    return `${emptyFieldCount} fields still empty. Check the worksheet, then come back.`;
  }

  // Specific notice patterns — Sage commenting on what the kid actually did.
  if (hasFile && mediaCount > 0 && notesLen > 50) {
    return "You filled this out properly. Let's see how it lands.";
  }
  if (mediaCount >= 3) {
    return `Three uploads? Confident move. Let me have a look.`;
  }
  if (notesLen > 100) {
    return "Your notes show you actually thought about it. Let's check the work.";
  }
  if (hasFile && !mediaCount) {
    return isObj6
      ? "Worksheet's in. Now I just need the avatar image."
      : "Worksheet's in. Where's the comic?";
  }
  if (!hasWorksheet && mediaCount > 0) {
    return "I see the upload, but the worksheet first. Always.";
  }
  if (!hasWorksheet && whiteboardCount > 0 && !isObj6) {
    return "I notice you've been drawing in the whiteboard. Worksheet first, then we'll talk about it.";
  }

  // Default: pending exists, nothing remarkable about it — generic ready line.
  return pickRandom(READY_LINES_GENERIC_PENDING);
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const TIER_META = {
  distinction: { label: "DISTINCTION", color: "#C8FF00", emoji: "🏆" },
  merit:       { label: "MERIT",       color: "#FFB020", emoji: "⭐" },
  pass:        { label: "PASS",        color: "#7BFFC4", emoji: "✅" },
  fail:        { label: "TRY AGAIN",   color: "#FF6B6B", emoji: "🔄" },
} as const;

// What the Worksheet popup writes to localStorage. Same shape as
// WorksheetSubmissionPayload — kept inline here to avoid a circular import.
interface PendingPayload {
  lmsId:           string;
  data:            Record<string, string | boolean>;
  worksheetFile?:  { url: string; format: "pdf" | "docx"; filename: string };
  mediaUrls?:      string[];
  notes?:          string;
}

function readPending(lmsId: string, profileId?: string): PendingPayload | null {
  if (typeof window === "undefined" || !profileId) return null;
  try {
    // Explicit submit wins — written when student clicks "Save & ready for validation"
    const pendingRaw = localStorage.getItem(`aida:worksheet:${lmsId}:${profileId}:pending`);
    if (pendingRaw) {
      const parsed = JSON.parse(pendingRaw);
      if (parsed && typeof parsed === "object" && parsed.lmsId === lmsId) return parsed as PendingPayload;
    }
    // Fall back to the autosaved draft — written on every keystroke.
    // This means SAGE can always read whatever the student typed, even if they
    // closed the worksheet without explicitly clicking "Save & ready".
    const draftRaw = localStorage.getItem(`aida:worksheet:${lmsId}:${profileId}:draft`);
    if (draftRaw) {
      const parsed = JSON.parse(draftRaw);
      if (parsed && typeof parsed === "object" && parsed.data && typeof parsed.data === "object") {
        return {
          lmsId,
          data:          parsed.data,
          worksheetFile: parsed.worksheetFile,
          mediaUrls:     Array.isArray(parsed.mediaUrls) ? parsed.mediaUrls : undefined,
          notes:         typeof parsed.notes === "string" ? parsed.notes : undefined,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function clearPending(lmsId: string, profileId?: string) {
  if (typeof window === "undefined" || !profileId) return;
  localStorage.removeItem(`aida:worksheet:${lmsId}:${profileId}:pending`);
}

function clearDraft(lmsId: string, profileId?: string) {
  if (typeof window === "undefined" || !profileId) return;
  localStorage.removeItem(`aida:worksheet:${lmsId}:${profileId}:draft`);
}

export function ObjectiveSubmissionPanel({
  open, rubric, profile, whiteboardImages, whiteboardDocs = [], whiteboardVideos = [], whiteboardAudios = [], onClose, onComplete,
}: Props) {
  // Dispatch table — add a row here when you add a new staged validator route.
  // Maps lmsId → validate route + arena (legacy) id used for attempts/logging.
  const DISPATCH: Record<string, { route: string; legacyId: string }> = {
    "l1-01": { route: "/api/aida/validate/obj1",  legacyId: "a1-1"  },
    "l1-02": { route: "/api/aida/validate/obj2",  legacyId: "a1-2"  },
    "l1-03": { route: "/api/aida/validate/obj3",  legacyId: "a1-3"  },
    "l1-04": { route: "/api/aida/validate/obj4",  legacyId: "a1-4"  },
    "l1-05": { route: "/api/aida/validate/obj5",  legacyId: "a1-5"  },
    "l1-06": { route: "/api/aida/validate/obj6",  legacyId: "a1-6"  },
    "l1-07": { route: "/api/aida/validate/obj7",  legacyId: "a1-7"  },
    "l1-08": { route: "/api/aida/validate/obj8",  legacyId: "a1-8"  },
    "l1-09": { route: "/api/aida/validate/obj9",  legacyId: "a1-9"  },
    "l1-10": { route: "/api/aida/validate/obj10", legacyId: "a1-10" },
  };
  const dispatch    = DISPATCH[rubric.lmsId] ?? DISPATCH["l1-10"];
  const isObj6      = rubric.lmsId === "l1-06";
  const validateUrl = dispatch.route;

  const [phase,   setPhase]   = useState<Phase>("intro");
  const [pending, setPending] = useState<PendingPayload | null>(null);
  const [result,  setResult]  = useState<FinalResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [text,    setText]    = useState("");
  const [revealed,setRevealed]= useState(0);

  const speakRef         = useRef<SpeakHandle | null>(null);
  const validateAbortRef = useRef<AbortController | null>(null);
  const whiteboardImagesRef = useRef(whiteboardImages);
  const whiteboardDocsRef   = useRef(whiteboardDocs);
  const whiteboardVideosRef = useRef(whiteboardVideos);
  const whiteboardAudiosRef = useRef(whiteboardAudios);
  // Tracks which doc URLs we already attempted to auto-parse this session so
  // we don't re-fire on every render that sees the same whiteboardDocs list.
  const parsedDocUrlsRef    = useRef(new Set<string>());
  const { setLast: publishValidator } = useValidatorWriter();

  // ── Speak helpers ────────────────────────────────────────────────────────
  // We track an "active speech generation" id so that if a new speak* call
  // fires while a beat sequence is mid-flight, the in-flight loop bails out
  // before starting the next beat instead of stomping on the new line.
  const speechGenRef = useRef(0);

  function stopSpeaking() {
    speechGenRef.current++;
    if (speakRef.current) { speakRef.current.cancel(); speakRef.current = null; }
  }
  function speakLine(line: string) {
    stopSpeaking();
    const myGen = speechGenRef.current;
    setText(line);
    setRevealed(0);
    speakRef.current = null;
    speakAsTeacher(line).then(h => {
      if (speechGenRef.current !== myGen) { h?.cancel(); return; }
      speakRef.current = h;
    }).catch(() => {});
  }
  /**
   * Speak a sequence of dialogue beats with a pause between each. Each beat
   * gets its own typewriter reveal — a 60-word block becomes three short
   * statements that each LAND before the next starts. JRPG-paced.
   *
   * If a new speak* call interrupts mid-sequence, the loop exits cleanly.
   */
  async function speakBeats(beats: ObjectiveIntroBeat[]) {
    stopSpeaking();
    const myGen = speechGenRef.current;
    for (let i = 0; i < beats.length; i++) {
      if (speechGenRef.current !== myGen) return;
      const beat = beats[i];
      setText(beat.text);
      setRevealed(0);
      try {
        const handle = await speakAsTeacher(beat.text);
        if (speechGenRef.current !== myGen) { handle?.cancel(); return; }
        speakRef.current = handle;
        // Wait for this beat's audio to mostly finish before pausing
        // and moving on. We poll progress01 instead of awaiting a "done"
        // because speakAsTeacher returns before audio finishes.
        await waitForBeatFinish(handle, myGen);
        if (speechGenRef.current !== myGen) return;
        if (i < beats.length - 1) await sleep(BEAT_PAUSE_MS);
      } catch {
        // Single beat failure is non-fatal — continue to next.
      }
    }
  }
  async function waitForBeatFinish(handle: SpeakHandle | null, myGen: number) {
    if (!handle) return;
    // Bail out if interrupted, audio finished, or 8s safety cap hit.
    const startedAt = Date.now();
    while (speechGenRef.current === myGen && (Date.now() - startedAt) < 8000) {
      const p = handle.progress01();
      if (p >= 0.95) return;
      await sleep(80);
    }
  }

  // Keep refs in sync with props so handleValidate always reads the latest
  // whiteboard media, even if called from a stale closure.
  useEffect(() => {
    whiteboardImagesRef.current = whiteboardImages;
    whiteboardDocsRef.current = whiteboardDocs;
    whiteboardVideosRef.current = whiteboardVideos;
    whiteboardAudiosRef.current = whiteboardAudios;
  }, [whiteboardImages, whiteboardDocs, whiteboardVideos, whiteboardAudios]);

  // Auto-parse: when the student drops a DOCX in the whiteboard chat, extract
  // its field values and write them to the worksheet localStorage draft so:
  //   1. The WorksheetPopup form shows the pre-filled answers on next open.
  //   2. The validator uses the reliable inline-form path instead of the
  //      fragile server-side file-extraction path.
  // We only run this when there is no substantial form data already — we never
  // overwrite work the student already typed into the popup.
  useEffect(() => {
    if (whiteboardDocs.length === 0 || !profile?.id) return;

    const latest    = whiteboardDocs[whiteboardDocs.length - 1];
    const lmsId     = rubric.lmsId;
    const profileId = profile.id;

    // Skip if we already attempted this URL in this session.
    if (parsedDocUrlsRef.current.has(latest.url)) return;

    // Skip DOCX formats we can't reliably extract (only docx supported for now).
    if (latest.format !== "docx") return;

    // Skip if there is already substantial typed form data — don't overwrite it.
    const existing = readPending(lmsId, profileId);
    const filledCount = existing?.data
      ? Object.values(existing.data).filter(v =>
          typeof v === "string" ? v.trim().length > 0 : v === true,
        ).length
      : 0;
    if (filledCount > 2) return;

    parsedDocUrlsRef.current.add(latest.url);

    fetch("/api/aida/parse-worksheet", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url: latest.url, format: latest.format, lmsId }),
    })
      .then(r => r.ok ? (r.json() as Promise<{ data: Record<string, string | boolean> }>) : null)
      .then(result => {
        if (!result?.data) return;
        // Require at least a few non-empty fields — extraction failures return mostly empty objects.
        const filledFields = Object.values(result.data).filter(v =>
          typeof v === "string" ? v.trim().length > 0 : v === true,
        ).length;
        if (filledFields < 2) return;

        const draftKey = `aida:worksheet:${lmsId}:${profileId}:draft`;
        try {
          localStorage.setItem(draftKey, JSON.stringify({
            data:          result.data,
            worksheetFile: { url: latest.url, format: latest.format, filename: latest.filename },
            updated_at:    new Date().toISOString(),
          }));
        } catch { return; /* localStorage quota — non-fatal */ }

        // Notify the WorksheetPopup in case it is currently open — it will
        // update its form state immediately without requiring a close/reopen.
        window.dispatchEvent(new CustomEvent("aida:worksheet-parsed", {
          detail: {
            lmsId,
            profileId,
            data:          result.data,
            worksheetFile: { url: latest.url, format: latest.format, filename: latest.filename },
          },
        }));

        // Refresh pending so ReadyView shows the correct worksheet status.
        setPending(readPending(lmsId, profileId));
      })
      .catch(() => { /* non-fatal — leave pending as-is */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteboardDocs.length, rubric.lmsId, profile?.id]);

  // ── Greet on open. First open of the session = intro (3-beat reveal).
  //     Subsequent opens = ready, with a context-aware notice line. ─────────
  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);

    const fresh = readPending(rubric.lmsId, profile?.id);
    setPending(fresh);

    let isFirstOpen = false;
    if (typeof window !== "undefined") {
      // v2 key so a previously-poisoned "shown" flag from earlier crash
      // loops doesn't suppress the pep-talk we want to play.
      const introKey = `aida:intro-shown-v2:${rubric.lmsId}`;
      if (!sessionStorage.getItem(introKey)) {
        isFirstOpen = true;
        sessionStorage.setItem(introKey, "1");
      }
    }

    const intro = getObjectiveIntro(rubric.lmsId);
    if (isFirstOpen && intro) {
      // Three-beat reveal — each beat lands separately.
      setPhase("intro");
      void speakBeats(intro.beats);
    } else {
      // Second+ open: contextual notice line that reflects what's pending.
      setPhase("ready");
      // Media now comes from chat — count whichever kind the objective needs.
      const isAudioObj = rubric.lmsId === "l1-05" || rubric.lmsId === "l1-08";
      const chatMediaCount = isAudioObj ? whiteboardAudios.length
        : whiteboardImages.length;
      const hasInlineForm = !!(fresh?.data && Object.keys(fresh.data).length > 0);
      const ctx: ReadyContext = {
        hasInlineForm,
        hasFile:         (whiteboardDocs?.length ?? 0) > 0,
        mediaCount:      chatMediaCount,
        notesLen:        fresh?.notes?.length ?? 0,
        whiteboardCount: whiteboardImages.length,
        isObj6,
        emptyFieldCount: hasInlineForm && fresh?.data
          ? getEmptyFieldLines(fresh.data, isObj6, rubric.lmsId).length
          : 0,
      };
      speakLine(pickReadyLine(ctx));
    }

    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Esc closes ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Typewriter (synced to TTS audio progress) ────────────────────────────
  useEffect(() => {
    if (!open || text.length === 0) return;
    let raf = 0;
    let fallbackStart = 0;
    const tick = (now: number) => {
      const handle = speakRef.current;
      const audioProgress = handle?.progress01() ?? 0;
      let target: number;
      if (audioProgress > 0) {
        target = Math.floor(text.length * audioProgress);
      } else {
        if (fallbackStart === 0) fallbackStart = now;
        target = Math.min(text.length, Math.floor((now - fallbackStart) / 33));
      }
      setRevealed(prev => (target > prev ? target : prev));
      if (target < text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, open]);

  // ── Validate ─────────────────────────────────────────────────────────────
  function buildWorksheetPayload(p: PendingPayload | null): WorksheetUpload | null {
    if (!p) return null;
    // Inline form data always wins when present — this covers both manual typing
    // and the auto-parse flow where a chat DOCX is extracted into p.data.
    // Using the data directly is more reliable than re-extracting the file server-side.
    if (p.data && Object.keys(p.data).length > 0) {
      return { kind: "inline-form", data: p.data, lmsId: p.lmsId };
    }
    // No form data → fall back to the raw file reference so the validator can
    // attempt server-side extraction (last-resort path).
    if (p.worksheetFile) {
      return {
        kind:     "file",
        url:      p.worksheetFile.url,
        format:   p.worksheetFile.format,
        filename: p.worksheetFile.filename,
      };
    }
    return null;
  }

  async function handleValidate() {
    setError(null);
    // Read from refs so we always get the latest whiteboard media, even if this
    // function was created during an earlier render with a stale snapshot.
    const fresh = readPending(rubric.lmsId, profile?.id) ?? pending;
    setPending(fresh);
    // Priority order:
    //   1. Popup data (inline form OR file uploaded inside the worksheet popup)
    //   2. Chat doc fallback (kid dropped a .pdf/.docx into the whiteboard)
    //   3. Funny SAGE complaint → bail
    let worksheetPayload = buildWorksheetPayload(fresh);
    if (!worksheetPayload && whiteboardDocsRef.current.length > 0) {
      const latest = whiteboardDocsRef.current[whiteboardDocsRef.current.length - 1];
      worksheetPayload = {
        kind:     "file",
        url:      latest.url,
        format:   latest.format,
        filename: latest.filename,
      };
    }
    if (!worksheetPayload) {
      const funny = FUNNY_NO_WORKSHEET[Math.floor(Math.random() * FUNNY_NO_WORKSHEET.length)];
      setError(funny);
      speakLine(funny);
      return;
    }

    // Media is ALWAYS from the whiteboard chat — the worksheet popup no
    // longer accepts uploads.
    //   OBJ 6  → most recent IMAGE (avatar)
    //   OBJ 10 → most recent IMAGE (comic)
    //   OBJ 3  → last TWO IMAGES (V1 + V2 — older first)
    //   OBJ 4  → last THREE IMAGES (Photoreal + Anime + Style 3 — oldest first)
    //   OBJ 5  → most recent AUDIO from chat (theme song MP3)
    //   OBJ 8  → last THREE AUDIO files (Voice A, B, C — oldest first)
    const isObj1 = rubric.lmsId === "l1-01";
    const isObj2 = rubric.lmsId === "l1-02";
    const isObj3 = rubric.lmsId === "l1-03";
    const isObj4 = rubric.lmsId === "l1-04";
    const isObj5 = rubric.lmsId === "l1-05";
    const isObj7 = rubric.lmsId === "l1-07";
    const isObj8 = rubric.lmsId === "l1-08";
    const isObj9 = rubric.lmsId === "l1-09";
    // OBJ 1 grades from worksheet only — no chat media required (finalIntro is inline).
    const worksheetOnly = isObj1;
    let mediaToUse: string[] = [];
    if (isObj2 || isObj4 || isObj9) {
      if (whiteboardImagesRef.current.length >= 3) {
        const n = whiteboardImagesRef.current.length;
        mediaToUse = [whiteboardImagesRef.current[n - 3].url, whiteboardImagesRef.current[n - 2].url, whiteboardImagesRef.current[n - 1].url];
      }
    } else if (isObj3) {
      if (whiteboardImagesRef.current.length >= 2) {
        const n = whiteboardImagesRef.current.length;
        mediaToUse = [whiteboardImagesRef.current[n - 2].url, whiteboardImagesRef.current[n - 1].url];
      }
    } else if (isObj5 && whiteboardAudiosRef.current.length > 0) {
      mediaToUse = [whiteboardAudiosRef.current[whiteboardAudiosRef.current.length - 1].url];
    } else if (isObj8 && whiteboardAudiosRef.current.length >= 3) {
      const n = whiteboardAudiosRef.current.length;
      mediaToUse = [whiteboardAudiosRef.current[n - 3].url, whiteboardAudiosRef.current[n - 2].url, whiteboardAudiosRef.current[n - 1].url];
    } else if (whiteboardImagesRef.current.length > 0) {
      mediaToUse = [whiteboardImagesRef.current[whiteboardImagesRef.current.length - 1].url];
    }

    if (isObj6 && mediaToUse.length === 0) {
      const msg = "I need your avatar image. Generate one in Visual Studio or drop a photo of yourself in chat, then come back.";
      setError(msg);
      speakLine(msg);
      return;
    }
    if (isObj3 && mediaToUse.length < 2) {
      const msg = "I need BOTH images — Version 1 and Version 2. Generate Prompt 1 first, then Prompt 1 + 5 words. Drop both in chat, then come back.";
      setError(msg);
      speakLine(msg);
      return;
    }
    if (isObj4 && mediaToUse.length < 3) {
      const msg = "I need ALL three images — Photorealistic, Anime, then your Style 3. Generate them in Firefly in order and drop all three in chat.";
      setError(msg);
      speakLine(msg);
      return;
    }
    if (isObj9 && mediaToUse.length < 3) {
      const msg = "I need all three Firefly versions — V1 (base), V2 (first exclusions), V3 (extended). Drop them in chat in order.";
      setError(msg);
      speakLine(msg);
      return;
    }
    if (isObj2 && mediaToUse.length < 3) {
      const msg = "I need all three screenshots — ChatGPT, Gemini, Claude. Drop them in chat in that order.";
      setError(msg);
      speakLine(msg);
      return;
    }
    if (isObj5 && mediaToUse.length === 0) {
      const msg = "I need your Suno.ai theme song. Generate audio in the whiteboard or drop an MP3 in chat, then resubmit.";
      setError(msg);
      speakLine(msg);
      return;
    }
    if (isObj8 && mediaToUse.length < 3) {
      const msg = "I need all three audio clips — Voice A, B, C. Generate them in the whiteboard or drop audio files in chat, then resubmit.";
      setError(msg);
      speakLine(msg);
      return;
    }
    if (isObj7 && mediaToUse.length === 0) {
      const msg = "I need your Firefly poster image. Generate it and drop the file in chat, then resubmit.";
      setError(msg);
      speakLine(msg);
      return;
    }
    if (!isObj5 && !isObj6 && !isObj2 && !isObj3 && !isObj4 && !isObj7 && !isObj8 && !isObj9 && !worksheetOnly && mediaToUse.length === 0) {
      const msg = "Worksheet — in. Comic — missing. I can read minds, not blank canvases. Generate the comic or drop it in chat.";
      setError(msg);
      speakLine(msg);
      return;
    }

    // Hard gate: call out every empty required field before sending to API.
    if (worksheetPayload.kind === "inline-form") {
      const emptyLines = getEmptyFieldLines(worksheetPayload.data, isObj6, rubric.lmsId);
      if (emptyLines.length > 0) {
        const beats: ObjectiveIntroBeat[] = [
          ...emptyLines.map(text => ({ text })),
          { text: "Fill those in. Then come back. I'll be here." },
        ];
        void speakBeats(beats);
        return;
      }
    }

    setPhase("submitting");
    speakLine("Alright… let me look at this.");

    const ctrl = new AbortController();
    validateAbortRef.current = ctrl;

    try {
      const body = isObj6
        ? {
            worksheet:      worksheetPayload,
            avatarImageUrl: mediaToUse[0],
            notes:          fresh?.notes ?? "",
            profile: {
              display_name: profile?.display_name ?? "Student",
              age_group:    profile?.age_group    ?? "11-13",
            },
          }
        : isObj3
        ? {
            worksheet:  worksheetPayload,
            v1ImageUrl: mediaToUse[0],
            v2ImageUrl: mediaToUse[1],
            notes:      fresh?.notes ?? "",
            profile: {
              display_name: profile?.display_name ?? "Student",
              age_group:    profile?.age_group    ?? "11-13",
            },
          }
        : isObj4 || isObj2
        ? {
            worksheet:  worksheetPayload,
            v1ImageUrl: mediaToUse[0],
            v2ImageUrl: mediaToUse[1],
            v3ImageUrl: mediaToUse[2],
            notes:      fresh?.notes ?? "",
            profile: {
              display_name: profile?.display_name ?? "Student",
              age_group:    profile?.age_group    ?? "11-13",
            },
          }
        : isObj7
        ? {
            worksheet:      worksheetPayload,
            posterImageUrl: mediaToUse[0],
            notes:          fresh?.notes ?? "",
            profile: {
              display_name: profile?.display_name ?? "Student",
              age_group:    profile?.age_group    ?? "11-13",
            },
          }
        : isObj5
        ? {
            worksheet:      worksheetPayload,
            trackAudioUrl:  mediaToUse[0],
            notes:          fresh?.notes ?? "",
            profile: {
              display_name: profile?.display_name ?? "Student",
              age_group:    profile?.age_group    ?? "11-13",
            },
          }
        : isObj8
        ? {
            worksheet:   worksheetPayload,
            voiceAUrl:   mediaToUse[0],
            voiceBUrl:   mediaToUse[1],
            voiceCUrl:   mediaToUse[2],
            notes:       fresh?.notes ?? "",
            profile: {
              display_name: profile?.display_name ?? "Student",
              age_group:    profile?.age_group    ?? "11-13",
            },
          }
        : isObj9
        ? {
            worksheet:  worksheetPayload,
            v1ImageUrl: mediaToUse[0],
            v2ImageUrl: mediaToUse[1],
            v3ImageUrl: mediaToUse[2],
            notes:      fresh?.notes ?? "",
            profile: {
              display_name: profile?.display_name ?? "Student",
              age_group:    profile?.age_group    ?? "11-13",
            },
          }
        : worksheetOnly
        ? {
            worksheet: worksheetPayload,
            notes:     fresh?.notes ?? "",
            profile: {
              display_name: profile?.display_name ?? "Student",
              age_group:    profile?.age_group    ?? "11-13",
            },
          }
        : {
            worksheet:        worksheetPayload,
            comicImageUrls:   mediaToUse,
            notes:            fresh?.notes ?? "",
            whiteboardImages,
            profile: {
              display_name: profile?.display_name ?? "Student",
              age_group:    profile?.age_group    ?? "11-13",
            },
          };

      const res = await fetch(validateUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  ctrl.signal,
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await res.text();
        setError(`Validation failed: ${msg.slice(0, 160)}`);
        setPhase("ready");
        return;
      }
      const final = await res.json() as FinalResult;
      validateAbortRef.current = null;
      setResult(final);
      setPhase("result");

      // Save worksheet to server when validation completes (pass or fail) so
      // the student's answers persist across sessions.
      const savedData = fresh?.data ?? {};
      if (Object.values(savedData).some(v =>
        typeof v === "string" ? v.trim().length > 0 : v === true,
      )) {
        fetch("/api/worksheet-drafts", {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lmsId:               rubric.lmsId,
            data:                savedData,
            notes:               fresh?.notes              ?? null,
            worksheetFileUrl:    fresh?.worksheetFile?.url     ?? null,
            worksheetFileName:   fresh?.worksheetFile?.filename ?? null,
            worksheetFileFormat: fresh?.worksheetFile?.format   ?? null,
          }),
        }).catch(() => {}); // non-fatal
      }
      // Punchy opener (random per tier) → tiny pause → core rubric script.
      // Lands like a coach reacting, then explaining.
      const opener = pickCelebrationOpener(final.tier);
      if (opener) {
        const beats: ObjectiveIntroBeat[] = [
          { text: opener },
          { text: final.feedbackScript },
        ];
        void speakBeats(beats);
      } else {
        speakLine(final.feedbackScript);
      }

      // Publish to validator channel so AIDA can ground its replies.
      let attemptCount = 0;
      try {
        const cRes = await fetch(`/api/objective-attempts?objective_id=${dispatch.legacyId}`);
        if (cRes.ok) attemptCount = (await cRes.json()).count ?? 0;
      } catch { /* non-fatal */ }
      publishValidator({
        lmsId:       rubric.lmsId,
        lastTier:    final.tier,
        lastMode:    final.canvas?.mode ?? null,
        lastSummary: final.feedbackScript,
        attempts:    { count: attemptCount, lastAt: new Date().toISOString() },
      });

      // Log + complete attempt.
      try {
        const objId = dispatch.legacyId;
        const aRes  = await fetch("/api/objective-attempts", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objective_id: objId,
            lms_id:       rubric.lmsId,
            score:        final.composite,
            tier:         final.tier,
            passed:       final.passed,
            feedback: {
              summary:      final.feedbackScript,
              strengths:    [],
              improvements: [],
              hintForRetry: final.blockedAtStage,
              stages: { canvas: final.canvas, storyIt: final.storyIt, createIt: final.createIt },
            },
          }),
        });
        if (aRes.ok && final.passed) {
          const { attempt_id } = await aRes.json() as { attempt_id: string };
          await fetch("/api/objective-attempts", {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ attempt_id }),
          });
          // Kid passed — clear pending + draft so future visits start fresh.
          clearPending(rubric.lmsId, profile?.id);
          clearDraft(rubric.lmsId, profile?.id);
          await onComplete(final.composite, final.tier);
        }
      } catch (err) {
        console.warn("[ObjectiveSubmissionPanel] log attempt failed:", err);
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("[ObjectiveSubmissionPanel] submit failed:", err);
      setError("Something went wrong. Please try again.");
      setPhase("ready");
    }
  }

  function handleRetry() {
    setResult(null);
    setPhase("ready");
    speakLine("Fix what we talked about, then come back. I'll be here.");
  }

  function handleClose() {
    if (validateAbortRef.current) { validateAbortRef.current.abort(); validateAbortRef.current = null; }
    stopSpeaking();
    onClose();
  }

  function handleIntroAck() {
    setPhase("ready");
    const fresh = readPending(rubric.lmsId, profile?.id);
    setPending(fresh);
    const isAudioObj = rubric.lmsId === "l1-05" || rubric.lmsId === "l1-08";
    const chatMediaCount = isAudioObj ? whiteboardAudios.length
      : whiteboardImages.length;
    const hasInlineForm = !!(fresh?.data && Object.keys(fresh.data).length > 0);
    const ctx: ReadyContext = {
      hasInlineForm,
      hasFile:         (whiteboardDocs?.length ?? 0) > 0,
      mediaCount:      chatMediaCount,
      notesLen:        fresh?.notes?.length ?? 0,
      whiteboardCount: whiteboardImages.length,
      isObj6:          isObj6,
      emptyFieldCount: hasInlineForm && fresh?.data
        ? getEmptyFieldLines(fresh.data, isObj6, rubric.lmsId).length
        : 0,
    };
    speakLine(pickReadyLine(ctx));
  }

  function handleReExplain() {
    // Re-play the full intro brief without changing the intro-shown flag.
    const intro = getObjectiveIntro(rubric.lmsId);
    if (intro) {
      void speakBeats(intro.beats);
    } else {
      speakLine(`${rubric.title}. Check the worksheet for the full task details.`);
    }
  }

  if (!open) return null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        key="obj-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[60] pointer-events-auto"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.35) 40%)" }}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        {/* Portrait */}
        <motion.img
          key="obj-portrait"
          src="/teacher.png"
          alt="Validator"
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0,   opacity: 1 }}
          exit={{    x: -40, opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="absolute pointer-events-none select-none"
          style={{
            bottom: "-2vh",
            left:   "1.5vw",
            height: "clamp(220px, 32vh, 420px)",
            width:  "auto",
            filter: "drop-shadow(0 0 28px rgba(0,212,255,0.55))",
          }}
        />

        {/* Dialogue box */}
        <motion.div
          key="obj-dialogue-box"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0,  opacity: 1 }}
          exit={{    y: 40, opacity: 0 }}
          transition={{ duration: 0.28, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="absolute"
          style={{
            left:    "clamp(240px, 20vw, 340px)",
            right:   "clamp(20px, 3vw, 48px)",
            bottom:  "clamp(16px, 3vh, 28px)",
            height:  "clamp(240px, 44vh, 420px)",
            maxWidth: 880,
          }}
        >
          {/* Name plate — steel-and-cyan chrome chip */}
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 mb-2 rounded-md"
            style={{
              background: "linear-gradient(180deg, #7DD3FC 0%, #00D4FF 50%, #0284C7 100%)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.4), " +
                "0 4px 18px rgba(0,212,255,0.45)",
            }}
          >
            <span
              className="text-[11px] font-display font-extrabold tracking-wider"
              style={{ color: "#031024" }}
            >
              {VALIDATOR_NAME} · {rubric.title.toUpperCase()}
            </span>
          </div>

          {/* Box — steel-and-cyan METALLIC, matches AIDA + upload modal */}
          <div
            className="rounded-xl px-5 py-4 flex flex-col"
            style={{
              background:
                "radial-gradient(ellipse 90% 55% at 25% 0%, rgba(0,212,255,0.18) 0%, rgba(8,12,28,0) 60%), " +
                "radial-gradient(ellipse 70% 50% at 100% 100%, rgba(125,211,252,0.08) 0%, rgba(8,12,28,0) 60%), " +
                "linear-gradient(180deg, " +
                  "rgba(58,98,158,0.55) 0%, " +
                  "rgba(20,38,72,0.95) 6%, " +
                  "rgba(10,18,38,0.97) 50%, " +
                  "rgba(18,32,62,0.96) 94%, " +
                  "rgba(58,98,158,0.45) 100%" +
                ")",
              border:    "1px solid rgba(0,212,255,0.55)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.22), " +
                "inset 0 -1px 0 rgba(255,255,255,0.06), " +
                "0 0 28px rgba(0,212,255,0.45), " +
                "0 0 80px rgba(0,212,255,0.18), " +
                "0 12px 40px rgba(0,0,0,0.7)",
              backdropFilter: "blur(22px)",
              height:    "calc(100% - 28px)",
              overflow:  "hidden",
            }}
          >
            {/* Teacher line — typewriter */}
            <p
              className="text-[15px] leading-relaxed mb-4"
              style={{ color: "rgba(255,255,255,0.95)", fontFamily: "'JetBrains Mono', monospace", minHeight: 60 }}
            >
              {text.slice(0, revealed)}
              {revealed < text.length && (
                <span
                  className="inline-block w-2 h-4 align-middle ml-0.5"
                  style={{ background: "#00D4FF", boxShadow: "0 0 6px #00D4FF", animation: "blink 0.9s steps(2,start) infinite" }}
                />
              )}
            </p>

            {/* Body — phase-driven */}
            <div className="flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
              {phase === "ready" && (
                <ReadyView
                  pending={pending}
                  isObj6={isObj6}
                  isObj5={rubric.lmsId === "l1-05"}
                  isObj8={rubric.lmsId === "l1-08"}
                  isWorksheetOnly={rubric.lmsId === "l1-01"}
                  whiteboardImageCount={whiteboardImages.length}
                  whiteboardAudioCount={whiteboardAudios.length}
                />
              )}
              {phase === "submitting" && <SubmittingPanel/>}
              {phase === "result" && result && (
                <ResultView result={result}/>
              )}
            </div>

            {/* Error banner */}
            {error && <div className="mt-2 text-[12px]" style={{ color: "#FF6B6B" }}>{error}</div>}

            {/* Action row */}
            <div
              className="flex justify-between items-center mt-3 pt-3"
              style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
            >
              <button
                onClick={handleClose}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold"
                style={{ background: "transparent", color: "rgba(255,255,255,0.6)" }}
              >
                Close
              </button>

              <div className="flex gap-2">
                {phase === "intro" && (
                  <ActionButton primary onClick={handleIntroAck}>Let&apos;s go</ActionButton>
                )}
                {phase === "ready" && (
                  <>
                    <ActionButton onClick={handleReExplain}>What was I doing?</ActionButton>
                    <ActionButton primary onClick={handleValidate}>Show my work</ActionButton>
                  </>
                )}
                {phase === "submitting" && <ActionButton disabled>Reading…</ActionButton>}
                {phase === "result" && result && (
                  result.passed
                    ? <ActionButton primary onClick={handleClose}>Done. Out.</ActionButton>
                    : <>
                        <ActionButton primary onClick={handleRetry}>I&apos;ll fix it</ActionButton>
                        <ActionButton onClick={handleClose}>Close</ActionButton>
                      </>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ActionButton({
  children, onClick, primary, disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      style={primary ? {
        background: "linear-gradient(180deg, #7DD3FC 0%, #00D4FF 50%, #0284C7 100%)",
        color:      "#031024",
        fontWeight: 700,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.4), " +
          "0 0 14px rgba(0,212,255,0.55), " +
          "0 4px 14px rgba(0,212,255,0.35)",
      } : {
        background:
          "linear-gradient(180deg, rgba(58,98,158,0.32) 0%, rgba(20,38,72,0.55) 100%)",
        border:     "1px solid rgba(0,212,255,0.32)",
        color:      "rgba(232,244,255,0.92)",
        boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.10)",
      }}
    >
      {children}
    </button>
  );
}

function ReadyView({
  pending, isObj6, isObj5, isObj8, isWorksheetOnly, whiteboardImageCount, whiteboardAudioCount,
}: {
  pending:              PendingPayload | null;
  isObj6:               boolean;
  isObj5:               boolean;
  isObj8:               boolean;
  isWorksheetOnly:      boolean;
  whiteboardImageCount: number;
  whiteboardAudioCount: number;
}) {
  const hasInline   = pending?.data && Object.keys(pending.data).length > 0;
  const hasFile     = !!pending?.worksheetFile;
  const mediaCount  = pending?.mediaUrls?.length ?? 0;

  const isAudioObj = isObj5 || isObj8;
  const usingWhiteboardFallback = !isAudioObj && mediaCount === 0 && whiteboardImageCount > 0;
  const usingWhiteboardAudio    = isAudioObj && mediaCount === 0 && whiteboardAudioCount > 0;

  const mediaLabel = isObj6 ? "Avatar image"
    : isAudioObj ? (isObj8 ? "Audio clips (3)" : "Audio track")
    : "Output image";

  const mediaOk = mediaCount > 0 || usingWhiteboardFallback || usingWhiteboardAudio;
  const mediaDetail = (() => {
    if (mediaCount > 0) return `${mediaCount} uploaded`;
    if (usingWhiteboardFallback) return isObj6 ? "Will use most recent avatar from chat" : "Will use most recent whiteboard image";
    if (usingWhiteboardAudio)    return isObj8 ? `${whiteboardAudioCount} audio clip(s) in chat` : "Will use most recent audio";
    if (isObj6)   return "Generate your avatar image in the whiteboard or upload a photo";
    if (isAudioObj) return "Generate audio in the whiteboard or drop files in chat";
    return "Generate the output in the whiteboard";
  })();

  return (
    <div className="space-y-2">
      <div className="text-[12px] font-display font-bold text-white/80">What I&apos;ll grade</div>
      <Row label="Worksheet"
           ok={!!(hasInline || hasFile)}
           detail={hasFile ? `📄 ${pending!.worksheetFile!.filename}` : hasInline ? "Filled in — ready" : "Not yet — open the worksheet and fill it in"}/>
      {isWorksheetOnly ? (
        // Worksheet-only objectives: image is optional. Show tick if present, hide row if not.
        whiteboardImageCount > 0 && (
          <Row label="Output image" ok detail="Generated in whiteboard"/>
        )
      ) : (
        <Row label={mediaLabel} ok={mediaOk} detail={mediaDetail}/>
      )}
      {pending?.notes && (
        <Row label="Your notes" ok detail={`"${pending.notes.slice(0, 80)}${pending.notes.length > 80 ? "…" : ""}"`}/>
      )}
    </div>
  );
}

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span style={{ color: ok ? "#7BFFC4" : "rgba(255,255,255,0.4)" }}>{ok ? "✓" : "○"}</span>
      <span className="font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>{label}:</span>
      <span style={{ color: "rgba(255,255,255,0.65)" }}>{detail}</span>
    </div>
  );
}

function SubmittingPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-3">
      <div
        className="w-12 h-12 rounded-full"
        style={{
          border: "3px solid rgba(0,212,255,0.18)",
          borderTopColor: "#00D4FF",
          animation: "spin 0.9s linear infinite",
        }}
      />
      <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>
        Reading the canvas… story… and the work itself.
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ResultView({ result }: { result: FinalResult }) {
  const meta = TIER_META[result.tier];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className="text-[44px] font-display font-extrabold leading-none"
          style={{ color: meta.color, textShadow: `0 0 18px ${meta.color}55` }}
        >
          {result.composite}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
            COMPOSITE / 100
          </span>
          <span className="text-[13px] font-display font-extrabold tracking-wider" style={{ color: meta.color }}>
            {meta.emoji} {meta.label}
          </span>
        </div>
      </div>

      <div className="space-y-1.5 text-[12px]" style={{ color: "rgba(255,255,255,0.85)" }}>
        <StageRow
          label="Think It Canvas (25%)"
          score={result.canvas.score}
          status={result.canvas.passed ? "pass" : "fail"}
          weight={25}
        />
        {result.storyIt && (
          <StageRow
            label="Story It (25%)"
            score={result.storyIt.passed ? 100 : 0}
            status={result.storyIt.passed ? "pass" : "fail"}
            weight={25}
          />
        )}
        {result.createIt && (
          <StageRow
            label="Create It (50%)"
            score={result.createIt.score}
            status={result.createIt.tier === "fail" ? "fail" : "pass"}
            weight={50}
          />
        )}
      </div>

      {!result.canvas.passed && (
        <div className="text-[11px] space-y-1 p-2 rounded-md" style={{ background: "rgba(255,107,107,0.05)", border: "1px solid rgba(255,107,107,0.2)" }}>
          <div className="font-display font-bold mb-1" style={{ color: "#FF6B6B" }}>Canvas feedback</div>
          {result.canvas.fieldFeedback.intent      && <div>• <b>Intent:</b> {result.canvas.fieldFeedback.intent}</div>}
          {result.canvas.fieldFeedback.assumptions && <div>• <b>Assumptions:</b> {result.canvas.fieldFeedback.assumptions}</div>}
          {result.canvas.fieldFeedback.audience    && <div>• <b>Audience:</b> {result.canvas.fieldFeedback.audience}</div>}
          {result.canvas.fieldFeedback.success     && <div>• <b>Success:</b> {result.canvas.fieldFeedback.success}</div>}
        </div>
      )}
      {result.storyIt && !result.storyIt.passed && !(result.storyIt as Record<string, unknown>).funnyTestBlocked && (
        <div className="text-[11px] space-y-1 p-2 rounded-md" style={{ background: "rgba(255,107,107,0.05)", border: "1px solid rgba(255,107,107,0.2)" }}>
          <div className="font-display font-bold mb-1" style={{ color: "#FF6B6B" }}>Story It checks</div>
          {result.storyIt.checks ? (
            <>
              {!result.storyIt.checks.setupTwistPayoff.passed    && <div>• {result.storyIt.checks.setupTwistPayoff.line}</div>}
              {!result.storyIt.checks.panel3IsPunchline.passed   && <div>• {result.storyIt.checks.panel3IsPunchline.line}</div>}
              {!result.storyIt.checks.characterConsistent.passed && <div>• {result.storyIt.checks.characterConsistent.line}</div>}
            </>
          ) : (
            <div>• {(result.storyIt as Record<string, unknown>).summary as string ?? "Revisit your Story It answers — make each one more specific."}</div>
          )}
        </div>
      )}
    </div>
  );
}

function StageRow({ label, score, status, weight }: { label: string; score: number; status: "pass" | "fail"; weight: number }) {
  const color = status === "pass" ? "#7BFFC4" : "#FF6B6B";
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full transition-all" style={{ width: `${score}%`, background: color, opacity: 0.85 }}/>
      </div>
      <span className="font-display font-bold flex-shrink-0" style={{ color, minWidth: 56, textAlign: "right" }}>
        {Math.round((score / 100) * weight)} / {weight}
      </span>
    </div>
  );
}

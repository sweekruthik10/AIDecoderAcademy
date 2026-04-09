import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import {
  OBJ10_RUBRIC,
  type CanvasFields,
  type StoryItFields,
  type CanvasStageResult,
  type StoryItStageResult,
  type CreateItStageResult,
  type FinalResult,
  type CanvasMode,
  type ObjSubmissionInput,
} from "@/lib/obj10Rubric";
import { moderateContent } from "@/lib/aidaSafety";
import { extractWorksheet, type WorksheetExtractResult, extractFromInlineForm } from "@/lib/worksheetExtract";
import { applyCopyMode } from "@/lib/validatorCopyMode";
import { createAdminClient } from "@/lib/supabase";

export const runtime     = "nodejs";
export const maxDuration = 90;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Three-stage gated validator for OBJ 10 — Your First AI Comic Strip.
//
// Submission model (matches spec Section 1C):
//   1. Worksheet file (.pdf | .docx) — required. Contains Canvas + Story It.
//   2. Comic image(s) — optional; falls back to recent whiteboard image.
//   3. Notes textarea — optional; used as context + worksheet override.
//
// Pipeline:
//   Stage 0 — Extract Canvas + Story It fields from the worksheet
//             (gpt-4o-mini, structured output, reads pdf via file_id or
//             docx text via mammoth).
//   Stage 1 — Canvas quality scoring (must clear 65% to proceed).
//   Stage 2 — Story It structural checks (3 binary checks + Funny Test).
//   Stage 3 — Create It vision grading on the comic image(s).
//
// All three grading stages use json_schema strict outputs so the trainer's
// verbatim feedback lines stay verbatim.

interface ValidateObj10Body extends ObjSubmissionInput {
  profile: {
    display_name: string;
    age_group:    string;
  };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const extractSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    canvas: {
      type: "object",
      additionalProperties: false,
      properties: {
        intent:      { type: "string" },
        assumptions: { type: "string" },
        audience:    { type: "string" },
        success:     { type: "string" },
      },
      required: ["intent", "assumptions", "audience", "success"],
    },
    storyIt: {
      type: "object",
      additionalProperties: false,
      properties: {
        oneSentenceStory: { type: "string" },
        panel1: {
          type: "object",
          additionalProperties: false,
          properties: { imagePrompt: { type: "string" }, dialogue: { type: "string" } },
          required: ["imagePrompt", "dialogue"],
        },
        panel2: {
          type: "object",
          additionalProperties: false,
          properties: { imagePrompt: { type: "string" }, dialogue: { type: "string" } },
          required: ["imagePrompt", "dialogue"],
        },
        panel3: {
          type: "object",
          additionalProperties: false,
          properties: { imagePrompt: { type: "string" }, dialogue: { type: "string" } },
          required: ["imagePrompt", "dialogue"],
        },
        funnyTestPassed:  { type: "boolean" },
      },
      required: ["oneSentenceStory", "panel1", "panel2", "panel3", "funnyTestPassed"],
    },
    extractionConfidence: { type: "string", enum: ["high", "partial", "low"] },
    missingFields:        { type: "array", items: { type: "string" } },
  },
  required: ["canvas", "storyIt", "extractionConfidence", "missingFields"],
} as const;

const canvasSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    score:   { type: "integer", minimum: 0, maximum: 100 },
    mode:    { type: "string", enum: ["challenge", "nudge", "celebrate"] },
    fieldFeedback: {
      type: "object",
      additionalProperties: false,
      properties: {
        intent:      { type: "string" },
        assumptions: { type: "string" },
        audience:    { type: "string" },
        success:     { type: "string" },
      },
      required: ["intent", "assumptions", "audience", "success"],
    },
    summary: { type: "string" },
  },
  required: ["score", "mode", "fieldFeedback", "summary"],
} as const;

const storyItSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    setupTwistPayoff:    { type: "boolean" },
    panel3IsPunchline:   { type: "boolean" },
    characterConsistent: { type: "boolean" },
    summary:             { type: "string" },
  },
  required: ["setupTwistPayoff", "panel3IsPunchline", "characterConsistent", "summary"],
} as const;

const createItSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    description:            { type: "string" },
    panelsDetected:         { type: "integer", minimum: 0, maximum: 10 },
    characterConsistent:    { type: "boolean" },
    avatarNameVisible:      { type: "boolean" },
    panel3VisuallyDistinct: { type: "boolean" },
    score:                  { type: "integer", minimum: 0, maximum: 100 },
    summary:                { type: "string" },
  },
  required: ["description", "panelsDetected", "characterConsistent", "avatarNameVisible", "panel3VisuallyDistinct", "score", "summary"],
} as const;

// ─── Stage 0 — Extract Canvas + Story It from the worksheet ─────────────────

async function extractFields(
  worksheet: WorksheetExtractResult,
  notes:     string,
): Promise<{ canvas: CanvasFields; storyIt: StoryItFields; confidence: "high" | "partial" | "low"; missing: string[] }> {
  const system = `
You are reading a student's filled-in worksheet for OBJ 10 — a 3-panel comic
strip planning exercise. Extract the student's ANSWERS into structured
fields. Ignore the worksheet's instructional text, weak/strong examples,
checklists, and headings — keep only what the student actually wrote.

The official worksheet uses these section anchors (look for them — but the
student MAY have used a different layout, so match by meaning if needed):

THINK IT CANVAS:
  - "🎯 FIELD 1 — INTENT"          → canvas.intent
  - "🔍 FIELD 2 — ASSUMPTIONS"     → canvas.assumptions
  - "👥 FIELD 3 — AUDIENCE"        → canvas.audience
  - "✅ FIELD 4 — SUCCESS DEFINITION" → canvas.success

STORY IT:
  - "PART 1 — THE ONE-SENTENCE STORY" → storyIt.oneSentenceStory
  - "PART 2 — PANEL BREAKDOWN — THREE SENTENCES" — IGNORE (it's a
    planning aid; not graded directly).
  - "PART 3 — IMAGE PROMPTS — ONE PER PANEL" → split into:
      "Panel 1 image prompt:"  → storyIt.panel1.imagePrompt
      "Panel 2 image prompt:"  → storyIt.panel2.imagePrompt
      "Panel 3 image prompt:"  → storyIt.panel3.imagePrompt
  - "PART 4 — DIALOGUE AND CAPTIONS" → split into:
      "Panel 1 text"  → storyIt.panel1.dialogue
      "Panel 2 text"  → storyIt.panel2.dialogue
      "Panel 3 text"  → storyIt.panel3.dialogue
  - "PART 5 — THE FUNNY TEST" → storyIt.funnyTestPassed
      The worksheet has two checkboxes: "☐ YES — ready to generate" and
      "☐ NO — I changed this".
      Mark funnyTestPassed = true ONLY if the YES box is clearly ticked
      ("☑", "X", filled in, or the student wrote "yes").
      Anything else (NO ticked, both blank, ambiguous, "kinda", "yeah I
      think so") → false.

PLACEHOLDER FILTERING — the worksheet contains template hints like:
  "[character appearance — be specific] + [setting] + [action] + [art style]"
  or
  "[SAME character appearance] + [punchline setting] + [punchline moment]"
These are TEMPLATE PLACEHOLDERS, not student answers. If a panel's image
prompt looks exactly like the bracket-template, treat it as empty.

NOTES TEXTAREA OVERRIDE:
The student's optional notes (below) may contain corrections or fill-in for
missing worksheet fields. Rules:
  - If a worksheet field is blank/missing AND notes mention that field's
    content → use notes to fill it.
  - If worksheet has content AND notes disagree → WORKSHEET WINS for
    grading. Notes are supplementary only.

OUTPUT:
- For each missing/blank field, leave the value as an empty string AND
  add the dotted name (e.g. "storyIt.panel3.dialogue") to missingFields.
- "extractionConfidence":
    "high"    — all fields clearly present and unambiguous
    "partial" — some fields ambiguous or filled from notes
    "low"     — many fields missing or worksheet structure didn't match

Return only the JSON object.
`.trim();

  // Build the user message — the worksheet content is delivered differently
  // depending on format.
  const userParts: OpenAI.Chat.ChatCompletionContentPart[] = [];

  if (worksheet.kind === "text") {
    userParts.push({
      type: "text",
      text: `STUDENT'S WORKSHEET (.docx, extracted as plain text):\n\n${worksheet.text}\n\n` +
            `STUDENT'S NOTES TEXTAREA (optional):\n${notes || "(empty)"}\n\nExtract now.`,
    });
  } else {
    // PDF — attached as a file_id. The model will read it natively.
    userParts.push(
      {
        type: "file",
        file: { file_id: worksheet.fileId },
      } as unknown as OpenAI.Chat.ChatCompletionContentPart,
      {
        type: "text",
        text: `(Worksheet PDF attached above.)\n\n` +
              `STUDENT'S NOTES TEXTAREA (optional):\n${notes || "(empty)"}\n\nExtract now.`,
      },
    );
  }

  const completion = await openai.chat.completions.create({
    model:           "gpt-4o-mini",
    response_format: {
      type: "json_schema",
      json_schema: { name: "worksheet_extract", schema: extractSchema, strict: true },
    },
    temperature: 0.1,
    max_tokens:  1200,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: userParts },
    ],
  });

  const raw    = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    canvas:  CanvasFields;
    storyIt: {
      oneSentenceStory: string;
      panel1: { imagePrompt: string; dialogue: string };
      panel2: { imagePrompt: string; dialogue: string };
      panel3: { imagePrompt: string; dialogue: string };
      funnyTestPassed: boolean;
    };
    extractionConfidence: "high" | "partial" | "low";
    missingFields: string[];
  };

  const storyIt: StoryItFields = {
    oneSentenceStory: parsed.storyIt.oneSentenceStory,
    panels: [parsed.storyIt.panel1, parsed.storyIt.panel2, parsed.storyIt.panel3],
    funnyTestPassed: parsed.storyIt.funnyTestPassed,
  };

  return {
    canvas:     parsed.canvas,
    storyIt,
    confidence: parsed.extractionConfidence,
    missing:    parsed.missingFields,
  };
}

// ─── Stage 1 — Canvas Quality ───────────────────────────────────────────────

async function gradeCanvas(
  canvas:       CanvasFields,
  ageGroup:     string,
  attemptCount: number,
  displayName:  string,
): Promise<CanvasStageResult> {
  const r = OBJ10_RUBRIC.canvas;
  const baseSystem = `
You are the Validator Teacher at AI Decoder Academy — a SKEPTICAL MENTOR.
The student has filled in the Think It Canvas for Objective 10 (3-panel comic). When you reference the mission in your reply, always say "Objective 10" (never "OBJ 10").

Score the four fields against THIS rubric:

🎯 INTENT
- PLACEHOLDER (0-30): Describes the output type ("to make a comic") with no
  effect, emotion, or audience reaction named.
- GENUINE (70-100): Names a specific emotional reaction from a specific
  type of person. Example: "${r.fieldHints.intent.genuineEx}"

🔍 ASSUMPTIONS
- PLACEHOLDER (0-30): "None" / blank / "I assume it will work" — no specific
  belief named, not testable.
- GENUINE (70-100): Names a specific bet being made. Example:
  "${r.fieldHints.assumptions.genuineEx}"

👥 AUDIENCE
- PLACEHOLDER (0-30): Group label only ("my friends", "students") — no
  characteristics, no humour preferences.
- GENUINE (70-100): Specific person with humour type. Example:
  "${r.fieldHints.audience.genuineEx}"

✅ SUCCESS
- PLACEHOLDER (0-30): Vague / creator-centred ("if it looks good", "if I'm
  happy with it").
- GENUINE (70-100): Observable audience behaviour. Example:
  "${r.fieldHints.success.genuineEx}"

Then pick MODE:
- "challenge" → any field is placeholder language.
- "nudge"     → at least one field shows real thinking but one or more are shallow.
- "celebrate" → all four fields are specific, audience-centred, testable.

Score is the average of the four field sub-scores.

VOICE — you are a Skeptical Mentor:
- Steady pacing. Few exclamation marks. No emojis.
- NEVER use the word "wrong". Use: "try again", "go deeper", "be more
  specific", "what specifically do you mean by that".
- Praise is selective. Mean what you say.
- Speak directly to the student ("you wrote…", not "the student wrote…").
- Adapt vocabulary to age group ${ageGroup}.

Field feedback: 1-2 sentences each. Summary: one short line spoken aloud.
`.trim();

  const user = `
Student's Think It Canvas (extracted from worksheet):

INTENT:
${canvas.intent || "(empty)"}

ASSUMPTIONS:
${canvas.assumptions || "(empty)"}

AUDIENCE:
${canvas.audience || "(empty)"}

SUCCESS:
${canvas.success || "(empty)"}

Grade now. Return only the JSON object.
`.trim();

  const system = applyCopyMode(baseSystem, attemptCount, displayName);

  const completion = await openai.chat.completions.create({
    model:           "gpt-4o-mini",
    response_format: {
      type: "json_schema",
      json_schema: { name: "canvas_grade", schema: canvasSchema, strict: true },
    },
    temperature: 0.2,
    max_tokens:  500,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    score: number;
    mode: CanvasMode;
    fieldFeedback: { intent: string; assumptions: string; audience: string; success: string };
    summary: string;
  };

  const score  = clamp(Math.round(parsed.score), 0, 100);
  const passed = score >= OBJ10_RUBRIC.canvas.minPassPct;

  return {
    stage:         "canvas",
    passed,
    score,
    mode:          parsed.mode,
    fieldFeedback: parsed.fieldFeedback,
    summary:       parsed.summary,
  };
}

// ─── Stage 2 — Story It Structural ──────────────────────────────────────────

async function gradeStoryIt(storyIt: StoryItFields, ageGroup: string): Promise<StoryItStageResult> {
  const r = OBJ10_RUBRIC.storyIt;

  // Funny Test self-check: if extraction said "no" (strict default), block
  // immediately without calling the LLM.
  if (!storyIt.funnyTestPassed) {
    return {
      stage:  "storyIt",
      passed: false,
      checks: {
        setupTwistPayoff:    { passed: false, line: r.failLines.setupTwistPayoff },
        panel3IsPunchline:   { passed: false, line: r.failLines.panel3IsPunchline },
        characterConsistent: { passed: false, line: r.failLines.characterConsistent },
      },
      funnyTestBlocked: true,
      summary:          r.funnyTestFailureScript,
    };
  }

  const system = `
You are the Validator Teacher — a Skeptical Mentor. The student has planned
their 3-panel comic. Run THREE binary structural checks. Be strict — these
checks gate image grading.

CHECK 1 — One-sentence story contains setup + twist + payoff
- "A cat sits on a chair" FAILS — no twist, no payoff.
- "A cat sits on a chair, then realises the chair is alive, and the chair
  bites back" PASSES — setup → twist → payoff present.

CHECK 2 — Panel 3 dialogue is a punchline, not a continuation
- Panel 3 must end the joke with a reveal, callback, or unexpected line.
- If Panel 3 reads like a middle scene ("they walked to the next room")
  it FAILS.

CHECK 3 — Character description is identical across all three image prompts
- Look at the appearance words (colour, species, clothing, body type) in
  the three image prompts.
- They must be VERBATIM identical or nearly so. Paraphrasing FAILS.

VOICE — you are a Skeptical Mentor:
- NEVER use the word "wrong". Use: "try again", "go deeper", "be more
  specific". Adapt to age group ${ageGroup}.
- Steady, direct, no emojis.

Return only the booleans + a one-line summary.
`.trim();

  const user = `
ONE-SENTENCE STORY:
${storyIt.oneSentenceStory || "(empty)"}

PANEL 1
  Image prompt: ${storyIt.panels[0].imagePrompt || "(empty)"}
  Dialogue:     ${storyIt.panels[0].dialogue    || "(empty)"}

PANEL 2
  Image prompt: ${storyIt.panels[1].imagePrompt || "(empty)"}
  Dialogue:     ${storyIt.panels[1].dialogue    || "(empty)"}

PANEL 3
  Image prompt: ${storyIt.panels[2].imagePrompt || "(empty)"}
  Dialogue:     ${storyIt.panels[2].dialogue    || "(empty)"}

Run the three checks. Return only the JSON object.
`.trim();

  const completion = await openai.chat.completions.create({
    model:           "gpt-4o-mini",
    response_format: {
      type: "json_schema",
      json_schema: { name: "story_it_checks", schema: storyItSchema, strict: true },
    },
    temperature: 0.1,
    max_tokens:  300,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user },
    ],
  });

  const raw    = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    setupTwistPayoff:    boolean;
    panel3IsPunchline:   boolean;
    characterConsistent: boolean;
    summary:             string;
  };

  const allPassed =
    parsed.setupTwistPayoff && parsed.panel3IsPunchline && parsed.characterConsistent;

  return {
    stage:  "storyIt",
    passed: allPassed,
    checks: {
      setupTwistPayoff: {
        passed: parsed.setupTwistPayoff,
        line:   parsed.setupTwistPayoff ? r.passLines.setupTwistPayoff : r.failLines.setupTwistPayoff,
      },
      panel3IsPunchline: {
        passed: parsed.panel3IsPunchline,
        line:   parsed.panel3IsPunchline ? r.passLines.panel3IsPunchline : r.failLines.panel3IsPunchline,
      },
      characterConsistent: {
        passed: parsed.characterConsistent,
        line:   parsed.characterConsistent ? r.passLines.characterConsistent : r.failLines.characterConsistent,
      },
    },
    funnyTestBlocked: false,
    summary:          parsed.summary,
  };
}

// ─── Stage 3 — Create It (Vision) ───────────────────────────────────────────

async function gradeCreateIt(
  imageUrls: string[],
  storyIt:   StoryItFields,
  canvas:    CanvasFields,
  profile:   { display_name: string; age_group: string },
): Promise<CreateItStageResult> {
  const r = OBJ10_RUBRIC.createIt;

  const system = `
You are the Validator Teacher — a Skeptical Mentor. The student has uploaded
their finished comic strip image(s). Grade against the rubric.

Multiple images may be provided — treat them as a single comic strip in
order. Look across all panels.

Step 1: Describe what you see — characters, setting, action in each panel,
the dialogue/text visible, and what stands out about panel 3.

Step 2: Check the requirements:
- panelsDetected: how many panels are visible across all uploads (target: 3).
- characterConsistent: same character (colour, species, clothing) across panels.
- avatarNameVisible: is any name/label visible somewhere in the comic that
  could be the student's chosen avatar/character name? (Look for a name
  on the character, in a caption, or anywhere in the image — it does NOT
  have to match the student's account name.)
- panel3VisuallyDistinct: does panel 3 look different from panels 1 and 2
  (the punchline beat)?

Step 3: Score against the rubric (out of 100):
- 80 (PASS): ${r.passCriteria}
- 90 (MERIT): ${r.meritCriteria}
- 100 (DISTINCTION): ${r.distinctionCriteria}
- <80 (FAIL): missing panels, wrong tool used, character clearly different
  across panels, or no avatar name.

VOICE — you are a Skeptical Mentor:
- NEVER use "wrong". Steady, direct, no emojis.
- Adapt to age group ${profile.age_group}. Speak directly to the student.
- Summary is one short line spoken aloud.
`.trim();

  const userParts: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `STUDENT'S CONTEXT (for reference — grade the image only):
- Audience they were aiming for: ${canvas.audience}
- Success they defined: ${canvas.success}
- Their one-sentence story: ${storyIt.oneSentenceStory}
- Panel 3 dialogue from their plan: "${storyIt.panels[2].dialogue}"

Grade the comic image(s) below. Return only the JSON object.`,
    },
    ...imageUrls.map((url): OpenAI.Chat.ChatCompletionContentPart => ({
      type: "image_url",
      image_url: { url, detail: "high" },
    })),
  ];

  const completion = await openai.chat.completions.create({
    model:           "gpt-4o-mini",
    response_format: {
      type: "json_schema",
      json_schema: { name: "create_it_grade", schema: createItSchema, strict: true },
    },
    temperature: 0.2,
    max_tokens:  700,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: userParts },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    description:            string;
    panelsDetected:         number;
    characterConsistent:    boolean;
    avatarNameVisible:      boolean;
    panel3VisuallyDistinct: boolean;
    score:                  number;
    summary:                string;
  };

  const score = clamp(Math.round(parsed.score), 0, 100);
  const tier: CreateItStageResult["tier"] =
    score >= 100 ? "distinction" :
    score >= 90  ? "merit"        :
    score >= 80  ? "pass"         :
    "fail";

  return {
    stage: "createIt",
    score,
    tier,
    panelsDetected:         parsed.panelsDetected,
    characterConsistent:    parsed.characterConsistent,
    avatarNameVisible:      parsed.avatarNameVisible,
    panel3VisuallyDistinct: parsed.panel3VisuallyDistinct,
    summary:                parsed.summary,
    description:            parsed.description,
  };
}

// ─── Composite scoring + script picking ─────────────────────────────────────

function pickFeedbackScript(tier: FinalResult["tier"], blocked: boolean): string {
  if (blocked) return OBJ10_RUBRIC.feedbackScripts.funnyTestFailure;
  switch (tier) {
    case "distinction": return OBJ10_RUBRIC.feedbackScripts.distinction;
    case "merit":       return OBJ10_RUBRIC.feedbackScripts.merit;
    case "pass":        return OBJ10_RUBRIC.feedbackScripts.pass;
    case "fail":        return "Not there yet. Look at what I flagged, fix that one thing, then come back.";
  }
}

function computeComposite(
  canvas:   CanvasStageResult,
  storyIt:  StoryItStageResult | null,
  createIt: CreateItStageResult | null,
): { composite: number; tier: FinalResult["tier"] } {
  const w = OBJ10_RUBRIC;
  const canvasPart   = canvas.score   * w.canvas.weight;
  const storyItPart  = storyIt  ? (storyIt.passed ? 100 : 0) * w.storyIt.weight  : 0;
  const createItPart = createIt ? createIt.score             * w.createIt.weight : 0;
  const composite = clamp(Math.round(canvasPart + storyItPart + createItPart), 0, 100);
  const tier: FinalResult["tier"] =
    composite >= 100 ? "distinction" :
    composite >= 90  ? "merit"        :
    composite >= 80  ? "pass"         :
    "fail";
  return { composite, tier };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ─── Whiteboard fallback for missing comic uploads ──────────────────────────
// Rule (per user spec): if comic upload is empty, look at the whiteboard for
// the most recent matching artefact. OBJ 10 → outputType "image" → take the
// most recent image. The client passes `whiteboardImages` in submission order
// (oldest first), so the LAST entry is the most recent.
function resolveImagesForGrading(input: ValidateObj10Body): string[] {
  if (input.comicImageUrls.length > 0) return input.comicImageUrls;
  if (input.whiteboardImages.length > 0) {
    return [input.whiteboardImages[input.whiteboardImages.length - 1].url];
  }
  return [];
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const body = (await req.json()) as ValidateObj10Body;
    if (!body?.worksheet) {
      return new Response("Worksheet payload is required", { status: 400 });
    }
    const isInlineForm = body.worksheet.kind === "inline-form";
    if (!isInlineForm) {
      // File-upload variant — keep the existing strict guards.
      const wf = body.worksheet as Extract<ValidateObj10Body["worksheet"], { url?: string }>;
      if (!wf.url || !wf.format) {
        return new Response("Worksheet upload is required", { status: 400 });
      }
      if (wf.format !== "pdf" && wf.format !== "docx") {
        return new Response("Worksheet must be .pdf or .docx", { status: 400 });
      }
    }

    const profile = body.profile ?? { display_name: "Student", age_group: "11-13" };
    const notes   = (body.notes || "").slice(0, 2000);  // cap to keep prompt small

    // Stage 0 — extract worksheet → fields
    let canvas: CanvasFields;
    let storyIt: StoryItFields;

    if (isInlineForm) {
      const inline = body.worksheet as Extract<ValidateObj10Body["worksheet"], { kind: "inline-form" }>;
      const r = extractFromInlineForm(inline.data);
      canvas  = r.canvas;
      storyIt = r.storyIt;
    } else {
      const wf = body.worksheet as Extract<ValidateObj10Body["worksheet"], { url?: string }>;
      const worksheetExtracted = await extractWorksheet(
        { url: wf.url!, format: wf.format! },
        openai,
        wf.filename || `worksheet.${wf.format}`,
      );
      const extracted = await extractFields(worksheetExtracted, notes);
      canvas  = extracted.canvas;
      storyIt = extracted.storyIt;
    }

    // Defensive moderation on the extracted text
    const worksheetText = [
      canvas.intent, canvas.assumptions, canvas.audience, canvas.success,
      storyIt.oneSentenceStory,
      ...storyIt.panels.flatMap(p => [p.imagePrompt, p.dialogue]),
      notes,
    ].join("\n");
    const verdict = await moderateContent(worksheetText);
    if (!verdict.allow) {
      console.warn("[validate/obj10] flagged content, refusing to grade:", verdict.reason);
      const blockedCanvas: CanvasStageResult = {
        stage:         "canvas",
        passed:        false,
        score:         0,
        mode:          "challenge",
        fieldFeedback: { intent: "", assumptions: "", audience: "", success: "" },
        summary:       "I can't grade this submission.",
      };
      const blocked: FinalResult = {
        passed:         false,
        composite:      0,
        tier:           "fail",
        canvas:         blockedCanvas,
        storyIt:        null,
        createIt:       null,
        feedbackScript: "I can't read this one. Pick a different submission and try again. If something's bothering you, talk to someone you trust.",
        blockedAtStage: "canvas",
      };
      return jsonResponse(blocked);
    }

    // Attempts-aware copy mode (research-backed: corrective → metacognitive
    // after attempt 3). Best-effort row count, default 0 on failure.
    let attemptCount = 0;
    try {
      const supabase = createAdminClient();
      const { data: prof } = await supabase
        .from("profiles").select("id").eq("clerk_user_id", userId).single();
      if (prof?.id) {
        const { count } = await supabase
          .from("objective_attempts")
          .select("*", { count: "exact", head: true })
          .eq("profile_id", prof.id)
          .eq("lms_id", "l1-10");
        attemptCount = count ?? 0;
      }
    } catch (err) {
      console.warn("[validate/obj10] attempts count failed, defaulting to 0:", err);
    }

    // Stage 1 — Canvas
    const canvasResult = await gradeCanvas(canvas, profile.age_group, attemptCount, profile.display_name);
    if (!canvasResult.passed) {
      const result: FinalResult = {
        passed:         false,
        composite:      Math.round(canvasResult.score * OBJ10_RUBRIC.canvas.weight),
        tier:           "fail",
        canvas:         canvasResult,
        storyIt:        null,
        createIt:       null,
        feedbackScript: canvasResult.summary,
        blockedAtStage: "canvas",
      };
      return jsonResponse(result);
    }

    // Stage 2 — Story It
    const storyItResult = await gradeStoryIt(storyIt, profile.age_group);
    if (!storyItResult.passed) {
      const result: FinalResult = {
        passed:         false,
        composite:      Math.round(canvasResult.score * OBJ10_RUBRIC.canvas.weight),
        tier:           "fail",
        canvas:         canvasResult,
        storyIt:        storyItResult,
        createIt:       null,
        feedbackScript: storyItResult.funnyTestBlocked
          ? OBJ10_RUBRIC.feedbackScripts.funnyTestFailure
          : storyItResult.summary,
        blockedAtStage: "storyIt",
      };
      return jsonResponse(result);
    }

    // Stage 3 — Create It (resolve image source: uploads → whiteboard fallback)
    const imagesForGrading = resolveImagesForGrading(body);
    if (imagesForGrading.length === 0) {
      const result: FinalResult = {
        passed:         false,
        composite:      Math.round(
          canvasResult.score * OBJ10_RUBRIC.canvas.weight +
          (storyItResult.passed ? 100 : 0) * OBJ10_RUBRIC.storyIt.weight,
        ),
        tier:           "fail",
        canvas:         canvasResult,
        storyIt:        storyItResult,
        createIt:       null,
        feedbackScript: "I can't find the comic — not in your upload, not on the whiteboard. Generate it or upload it, then come back.",
        blockedAtStage: null,
      };
      return jsonResponse(result);
    }

    const createItResult = await gradeCreateIt(imagesForGrading, storyIt, canvas, profile);
    const { composite, tier } = computeComposite(canvasResult, storyItResult, createItResult);
    const passed = composite >= 80;
    const final: FinalResult = {
      passed,
      composite,
      tier,
      canvas:         canvasResult,
      storyIt:        storyItResult,
      createIt:       createItResult,
      feedbackScript: pickFeedbackScript(tier, false),
      blockedAtStage: null,
    };
    return jsonResponse(final);
  } catch (err) {
    console.error("[validate/obj10]", err);
    return new Response("Internal server error", { status: 500 });
  }
}

function jsonResponse(body: FinalResult) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import {
  OBJ6_RUBRIC,
  type Obj6CanvasFields,
  type Obj6IdentityCard,
  type Obj6CanvasStageResult,
  type Obj6IdentityCardStageResult,
  type Obj6CreateItStageResult,
  type Obj6FinalResult,
} from "@/lib/obj6Rubric";
import { moderateContent } from "@/lib/aidaSafety";
import { applyCopyMode } from "@/lib/validatorCopyMode";
import { extractWorksheet } from "@/lib/worksheetExtract";
import { createAdminClient } from "@/lib/supabase";

export const runtime     = "nodejs";
export const maxDuration = 90;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Three-stage validator for Objective 6 (avatar IMAGE — generated in our
// whiteboard's Visual Studio or restyled from a kid's own photo).
// Stage 0: extract Canvas + Identity Card (inline-form direct, or LLM from .docx/.pdf)
// Stage 1: Canvas quality (70% threshold — highest in Level 1)
// Stage 2: Identity Card structural checks (4 binary)
// Stage 3: Avatar video — Whisper transcription + GPT script-line presence

interface Body {
  worksheet:
    | { kind: "file"; url: string; format: "pdf" | "docx"; filename: string }
    | { kind: "inline-form"; data: Record<string, string | boolean>; lmsId: string };
  // New deliverable model: the kid generates an avatar IMAGE (or restyles
  // their own photo); validator grades it with vision against the Identity
  // Card. `videoUrl` kept as a deprecated alias for any old client that
  // hasn't migrated yet — server normalises to `avatarImageUrl`.
  avatarImageUrl?: string;
  videoUrl?:       string;
  notes?:          string;
  profile:         { display_name: string; age_group: string };
}
function jsonResponse<T>(data: T) {
  return new Response(JSON.stringify(data), {
    status:  200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fromInline(data: Record<string, string | boolean>): { canvas: Obj6CanvasFields; card: Obj6IdentityCard } {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string).trim() : "");
  const b = (k: string) => data[k] === true;
  return {
    canvas: {
      intent:      s("intent"),
      assumptions: s("assumptions"),
      audience:    s("audience"),
      success:     s("success"),
    },
    card: {
      appearance:        s("appearance"),
      voiceCharacter:    s("voiceCharacter"),
      personalityTraits: s("personalityTraits"),
      presentationStyle: s("presentationStyle"),
      scriptConfirmed:   b("scriptConfirmed"),
      successTest:       s("successTest"),
    },
  };
}

async function gradeCanvas(
  canvas:       Obj6CanvasFields,
  ageGroup:     string,
  attemptCount: number,
  displayName:  string,
): Promise<Obj6CanvasStageResult> {
  const r = OBJ6_RUBRIC.canvas;
  const baseSystem = `
You are the Validator Teacher at AI Decoder Academy — a SKEPTICAL MENTOR.
The student has filled in the Think It Canvas for Objective 6 (build your avatar). When you reference the mission in your reply, always say "Objective 6" (never "OBJ 6").
This avatar persists for 6 levels — the bar is high. Threshold: ${r.minPassPct}%.

Score four fields:
🎯 INTENT
- PLACEHOLDER (0-30): describes the task, no audience purpose, no design goal.
- GENUINE (70-100): names a specific impression for a specific audience. Example: "${r.fieldHints.intent.genuineEx}"

🔍 ASSUMPTIONS
- PLACEHOLDER (0-30): "none" or a vague belief.
- GENUINE (70-100): specific, testable bet. Example: "${r.fieldHints.assumptions.genuineEx}"

👥 AUDIENCE
- PLACEHOLDER (0-30): generic group label.
- GENUINE (70-100): specific people + the response they have to presenters. Example: "${r.fieldHints.audience.genuineEx}"

✅ SUCCESS
- PLACEHOLDER (0-30): "if it looks good" — creator-centred.
- GENUINE (70-100): observable audience behaviour. Example: "${r.fieldHints.success.genuineEx}"

Pick MODE:
- "challenge" → any field is placeholder.
- "nudge"     → at least one is genuine but others are shallow.
- "celebrate" → all four are specific, audience-centred, testable.

Score is the average of the four field sub-scores.

VOICE — Skeptical Mentor:
- Steady. Few exclamation marks. No emojis.
- NEVER use "wrong". Use: "try again", "go deeper", "be more specific".
- Speak directly to the student. Adapt vocabulary to age group ${ageGroup}.

Field feedback: 1-2 sentences each. Summary: one short line spoken aloud.
Return strict JSON: { score, mode, fieldFeedback: { intent, assumptions, audience, success }, summary }.
`.trim();

  const user = `
INTENT:      ${canvas.intent      || "(empty)"}
ASSUMPTIONS: ${canvas.assumptions || "(empty)"}
AUDIENCE:    ${canvas.audience    || "(empty)"}
SUCCESS:     ${canvas.success     || "(empty)"}

Grade now. Return only the JSON object.
`.trim();

  const system = applyCopyMode(baseSystem, attemptCount, displayName);

  const completion = await openai.chat.completions.create({
    model:           "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature:     0.2,
    max_tokens:      500,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user },
    ],
  });

  const raw    = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    score: number;
    mode:  "challenge" | "nudge" | "celebrate";
    fieldFeedback: { intent: string; assumptions: string; audience: string; success: string };
    summary: string;
  };
  const score  = clamp(Math.round(parsed.score ?? 0), 0, 100);

  return {
    stage:         "canvas",
    passed:        score >= r.minPassPct,
    score,
    mode:          parsed.mode ?? "challenge",
    fieldFeedback: parsed.fieldFeedback ?? { intent: "", assumptions: "", audience: "", success: "" },
    summary:       parsed.summary ?? "",
  };
}

function gradeIdentityCard(card: Obj6IdentityCard): Obj6IdentityCardStageResult {
  const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const appearance40Plus       = wc(card.appearance) >= 40;
  const voiceTrim              = card.voiceCharacter.trim();
  const voiceSpecific          = voiceTrim.length > 0 && !/^(clear|professional|clear and professional)$/i.test(voiceTrim);
  const personalityBehavioural = card.personalityTraits.trim().length >= 20;
  const scriptConfirmed        = card.scriptConfirmed === true;

  const passed = appearance40Plus && voiceSpecific && personalityBehavioural && scriptConfirmed;
  const summary = passed
    ? "Identity Card complete. Avatar concept is ready to build."
    : "Identity Card needs another pass. See field feedback.";
  return {
    stage: "identityCard", passed,
    appearance40Plus, voiceSpecific, personalityBehavioural, scriptConfirmed,
    summary,
  };
}

// ─── Stage 3 — Vision grading on the avatar IMAGE ──────────────────────────
// The kid either generated the avatar via Visual Studio (image output type) or
// uploaded a photo restyled into an avatar — either path lands as a chat
// image marker, picked up by TeacherCharacter and passed in as avatarImageUrl.

const createItSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    description:         { type: "string" },
    appearanceMatch:     { type: "boolean" },
    personalityVisible:  { type: "boolean" },
    styleConsistent:     { type: "boolean" },
    audienceAppropriate: { type: "boolean" },
    score:               { type: "integer", minimum: 0, maximum: 100 },
    summary:             { type: "string" },
  },
  required: ["description", "appearanceMatch", "personalityVisible", "styleConsistent", "audienceAppropriate", "score", "summary"],
} as const;

async function gradeCreateIt(
  imageUrl:     string,
  avatarName:   string,
  card:         Obj6IdentityCard,
  canvas:       Obj6CanvasFields,
  ageGroup:     string,
): Promise<Obj6CreateItStageResult> {
  // 1. Reachability — quick HEAD check so we fail fast on dead URLs.
  let imageReachable = false;
  try {
    const head = await fetch(imageUrl, { method: "HEAD" });
    imageReachable = head.ok && (head.headers.get("content-type") ?? "").startsWith("image/");
  } catch { imageReachable = false; }
  if (!imageReachable) {
    return {
      stage: "createIt", score: 0, tier: "fail",
      imageReachable: false, appearanceMatch: false, personalityVisible: false,
      styleConsistent: false, audienceAppropriate: false,
      description: "", summary: "I can't load the avatar image — drop it in chat again, then come back.",
    };
  }

  // 2. Vision grade against the Identity Card.
  const system = `
You are the Validator Teacher at AI Decoder Academy — a SKEPTICAL MENTOR.
The student has generated (or restyled) their AI Academy avatar IMAGE. Grade
the rendered avatar against THEIR Identity Card. The kid's avatar persists
for 6 levels, so the bar is high.

Identity Card to grade against:
- Avatar Name: ${avatarName || "(not specified)"}
- Appearance brief: ${card.appearance || "(none)"}
- Personality traits + behaviour: ${card.personalityTraits || "(none)"}
- Voice character (cue for vibe / expression): ${card.voiceCharacter || "(none)"}
- Signature element / presentation style: ${card.presentationStyle || "(none)"}
- Their audience: ${canvas.audience || "(none)"}
- Success they defined: ${canvas.success || "(none)"}

Step 1 — DESCRIBE what you see in 1-2 sentences (characters, clothing, setting, expression).
Step 2 — RUN the four checks:
- appearanceMatch     : does the rendered avatar match the Appearance brief? (age range, clothing style, expression, setting, distinctive visual element)
- personalityVisible  : is at least ONE of the personality traits visible in posture / expression / framing?
- styleConsistent     : single coherent illustration / photo style — no glitches, no extra heads, no melted text
- audienceAppropriate : age-appropriate for ${ageGroup}, nothing scary or sexualised, identifiable as the kid's persona

Step 3 — SCORE 0–100:
- 80 (PASS)       : appearanceMatch + styleConsistent + audienceAppropriate all true. Personality may be partial.
- 90 (MERIT)      : all four checks true.
- 100 (DISTINCTION): all four true AND the avatar visibly achieves the success definition (someone watching for 10s with no sound would react as the kid said).
- <80 (FAIL)      : any of appearanceMatch / styleConsistent / audienceAppropriate is false.

VOICE — Skeptical Mentor:
- NEVER use "wrong". Steady, direct, no emojis.
- Adapt to age group ${ageGroup}.
- Summary is ONE short line spoken aloud.
`.trim();

  const completion = await openai.chat.completions.create({
    model:           "gpt-4o-mini",
    response_format: {
      type:        "json_schema",
      json_schema: { name: "obj6_create_grade", schema: createItSchema, strict: true },
    },
    temperature: 0.2,
    max_tokens:  700,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: [
        { type: "text", text: "Grade the avatar image below. Return only the JSON." },
        { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
      ]},
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    description:         string;
    appearanceMatch:     boolean;
    personalityVisible:  boolean;
    styleConsistent:     boolean;
    audienceAppropriate: boolean;
    score:               number;
    summary:             string;
  };

  const score = clamp(Math.round(parsed.score), 0, 100);
  const tier: Obj6CreateItStageResult["tier"] =
    score >= 100 ? "distinction" :
    score >= 90  ? "merit"        :
    score >= 80  ? "pass"         :
    "fail";

  return {
    stage: "createIt",
    score, tier,
    imageReachable:      true,
    appearanceMatch:     parsed.appearanceMatch,
    personalityVisible:  parsed.personalityVisible,
    styleConsistent:     parsed.styleConsistent,
    audienceAppropriate: parsed.audienceAppropriate,
    description:         parsed.description,
    summary:             parsed.summary,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function pickFeedback(tier: Obj6FinalResult["tier"]): string {
  switch (tier) {
    case "distinction": return OBJ6_RUBRIC.feedbackScripts.distinction;
    case "merit":       return OBJ6_RUBRIC.feedbackScripts.merit;
    case "pass":        return OBJ6_RUBRIC.feedbackScripts.pass;
    case "fail":        return "Have another look at your avatar — you've got this.";
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });
    const body = (await req.json()) as Body;

    if (!body?.worksheet) return new Response("Worksheet payload is required", { status: 400 });

    const profile = body.profile ?? { display_name: "Student", age_group: "11-13" };
    const notes   = (body.notes || "").slice(0, 2000);

    // Stage 0 — extract Canvas + Identity Card.
    let canvas: Obj6CanvasFields;
    let card:   Obj6IdentityCard;
    let avatarName = profile.display_name;
    let obj5Complete = true;   // default true if not specified

    if (body.worksheet.kind === "inline-form") {
      const r = fromInline(body.worksheet.data);
      canvas       = r.canvas;
      card         = r.card;
      avatarName   = (body.worksheet.data["avatarName"] as string) || profile.display_name;
      obj5Complete = body.worksheet.data["obj5Complete"] === true;
    } else {
      // .docx/.pdf path — extract raw worksheet text/file then ask GPT to map.
      const ws = await extractWorksheet(
        { url: body.worksheet.url, format: body.worksheet.format },
        openai,
        body.worksheet.filename,
      );
      const sys = `Extract the OBJ 6 worksheet into JSON: {
  canvas: { intent, assumptions, audience, success },
  card:   { appearance, voiceCharacter, personalityTraits, presentationStyle, scriptConfirmed (boolean), successTest },
  avatarName: string,
  obj5Complete: boolean
}.
Use empty strings for missing text fields and false for missing booleans.
Return strict JSON only.`;
      const userMsg = ws.kind === "text"
        ? `Worksheet:\n${ws.text}\nNotes:\n${notes}`
        : `(file_id: ${ws.fileId})\nNotes:\n${notes}`;
      const ext = await openai.chat.completions.create({
        model:           "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature:     0.1,
        max_tokens:      1200,
        messages: [
          { role: "system", content: sys },
          { role: "user",   content: userMsg },
        ],
      });
      const parsed = JSON.parse(ext.choices[0]?.message?.content ?? "{}");
      canvas = parsed.canvas ?? { intent: "", assumptions: "", audience: "", success: "" };
      card   = parsed.card   ?? {
        appearance: "", voiceCharacter: "", personalityTraits: "",
        presentationStyle: "", scriptConfirmed: false, successTest: "",
      };
      avatarName   = parsed.avatarName   || profile.display_name;
      obj5Complete = parsed.obj5Complete !== false;
    }

    // Moderation
    const fullText = [
      canvas.intent, canvas.assumptions, canvas.audience, canvas.success,
      card.appearance, card.voiceCharacter, card.personalityTraits, card.presentationStyle, card.successTest,
      notes,
    ].join("\n");
    const verdict = await moderateContent(fullText);
    if (!verdict.allow) {
      const blockedCanvas: Obj6CanvasStageResult = {
        stage: "canvas", passed: false, score: 0, mode: "challenge",
        fieldFeedback: { intent: "", assumptions: "", audience: "", success: "" },
        summary: "I can't grade this submission.",
      };
      const final: Obj6FinalResult = {
        passed: false, composite: 0, tier: "fail",
        canvas: blockedCanvas, identityCard: null, createIt: null,
        feedbackScript: "I can't grade this — let's pick a different submission. Talk to a grown-up if something's bothering you.",
        blockedAtStage: "canvas",
      };
      return jsonResponse(final);
    }

    // OBJ 5 dependency check (worksheet boolean only, until OBJ 5 ships).
    if (!obj5Complete) {
      const blockedCanvas: Obj6CanvasStageResult = {
        stage: "canvas", passed: false, score: 0, mode: "challenge",
        fieldFeedback: { intent: "", assumptions: "", audience: "", success: "" },
        summary: "Objective 5 must be complete before Objective 6 — confirm in your worksheet, or finish Objective 5 first.",
      };
      const final: Obj6FinalResult = {
        passed: false, composite: 0, tier: "fail",
        canvas: blockedCanvas, identityCard: null, createIt: null,
        feedbackScript: "Objective 5 must be complete before Objective 6.",
        blockedAtStage: "canvas",
      };
      return jsonResponse(final);
    }

    // Attempts count for copy mode (best-effort).
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
          .eq("lms_id", "l1-06");
        attemptCount = count ?? 0;
      }
    } catch (err) {
      console.warn("[validate/obj6] attempts count failed, defaulting to 0:", err);
    }

    // Stage 1 — Canvas.
    const canvasResult = await gradeCanvas(canvas, profile.age_group, attemptCount, profile.display_name);
    if (!canvasResult.passed) {
      return jsonResponse<Obj6FinalResult>({
        passed:         false,
        composite:      Math.round(canvasResult.score * OBJ6_RUBRIC.canvas.weight),
        tier:           "fail",
        canvas:         canvasResult,
        identityCard:   null,
        createIt:       null,
        feedbackScript: canvasResult.summary,
        blockedAtStage: "canvas",
      });
    }

    // Stage 2 — Identity Card.
    const cardResult = gradeIdentityCard(card);
    if (!cardResult.passed) {
      return jsonResponse<Obj6FinalResult>({
        passed:         false,
        composite:      Math.round(canvasResult.score * OBJ6_RUBRIC.canvas.weight),
        tier:           "fail",
        canvas:         canvasResult,
        identityCard:   cardResult,
        createIt:       null,
        feedbackScript: "Identity Card needs more specificity. See the four checks.",
        blockedAtStage: "identityCard",
      });
    }

    // Stage 3 — Avatar IMAGE. Pull from new field, fall back to legacy alias.
    const avatarImageUrl = body.avatarImageUrl ?? body.videoUrl;
    if (!avatarImageUrl) {
      return jsonResponse<Obj6FinalResult>({
        passed:         false,
        composite:      Math.round(
          canvasResult.score * OBJ6_RUBRIC.canvas.weight +
          100               * OBJ6_RUBRIC.identityCard.weight,
        ),
        tier:           "fail",
        canvas:         canvasResult,
        identityCard:   cardResult,
        createIt:       null,
        feedbackScript: "Drop your avatar image in chat — then I'll grade it.",
      });
    }
    const createItResult = await gradeCreateIt(avatarImageUrl, avatarName, card, canvas, profile.age_group);

    const composite = clamp(Math.round(
      canvasResult.score   * OBJ6_RUBRIC.canvas.weight +
      100                  * OBJ6_RUBRIC.identityCard.weight +
      createItResult.score * OBJ6_RUBRIC.createIt.weight,
    ), 0, 100);
    const tier: Obj6FinalResult["tier"] =
      composite >= 100 ? "distinction" :
      composite >= 90  ? "merit"        :
      composite >= 80  ? "pass"         :
      "fail";

    return jsonResponse<Obj6FinalResult>({
      passed:         tier !== "fail",
      composite, tier,
      canvas:         canvasResult,
      identityCard:   cardResult,
      createIt:       createItResult,
      feedbackScript: pickFeedback(tier),
    });
  } catch (e) {
    console.error("[validate/obj6] error:", e);
    return new Response("Validation failed", { status: 500 });
  }
}

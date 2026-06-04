import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import {
  OBJ3_RUBRIC,
  type Obj3CanvasFields,
  type Obj3StoryItFields,
  type Obj3ReflectionFields,
  type Obj3CanvasStageResult,
  type Obj3StoryItStageResult,
  type Obj3CreateItStageResult,
  type Obj3FinalResult,
} from "@/lib/obj3Rubric";
import { moderateContent } from "@/lib/aidaSafety";
import { applyCopyMode } from "@/lib/validatorCopyMode";
import { extractWorksheet } from "@/lib/worksheetExtract";
import { createAdminClient } from "@/lib/supabase";

export const runtime     = "nodejs";
export const maxDuration = 90;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Three-stage validator for Objective 3 — Your Impossible World.
// Stage 0: extract Canvas + Story-It (prompts + reasoning) + reflection
// Stage 1: Canvas quality (65% threshold)
// Stage 2: Story-It checks (Prompt 1 ≥10 words + impossible; 5 added words add visual info)
// Stage 3: Two images V1 + V2 — vision grading + reflection quality

interface Body {
  worksheet:
    | { kind: "file"; url: string; format: "pdf" | "docx"; filename: string }
    | { kind: "inline-form"; data: Record<string, string | boolean>; lmsId: string };
  v1ImageUrl?: string;
  v2ImageUrl?: string;
  notes?:     string;
  profile:    { display_name: string; age_group: string };
}

function jsonResponse<T>(data: T) {
  return new Response(JSON.stringify(data), {
    status:  200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

interface ExtractedFields {
  canvas:     Obj3CanvasFields;
  storyIt:    Obj3StoryItFields;
  reflection: Obj3ReflectionFields;
  avatarName: string;
}

function fromInline(data: Record<string, string | boolean>): ExtractedFields {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string).trim() : "");
  const additionalWords = [1, 2, 3, 4, 5]
    .map(i => s(`additionalWord${i}`))
    .filter(Boolean);
  return {
    canvas: {
      intent:      s("intent"),
      assumptions: s("assumptions"),
      audience:    s("audience"),
      success:     s("success"),
    },
    storyIt: {
      prompt1:            s("prompt1"),
      additionalWords,
      additionalWordsWhy: s("additionalWordsWhy"),
    },
    reflection: {
      version1Reflection:  s("version1Reflection"),
      version2Reflection:  s("version2Reflection"),
      ctSkill1Reflection:  s("ctSkill1Reflection"),
    },
    avatarName: s("avatarName"),
  };
}

// ─── Stage 1 — Canvas (Think It) ───────────────────────────────────────────

async function gradeCanvas(
  canvas:       Obj3CanvasFields,
  ageGroup:     string,
  attemptCount: number,
  displayName:  string,
): Promise<Obj3CanvasStageResult> {
  const r = OBJ3_RUBRIC.canvas;
  const baseSystem = `
You are the Validator Teacher at AI Decoder Academy — a SKEPTICAL MENTOR.
The student has filled in the Think It Canvas for Objective 3 (Your Impossible World — generate an impossible scene in Canva AI, then add 5 words and regenerate). When you reference the mission in your reply, always say "Objective 3" (never "OBJ 3"). Threshold: ${r.minPassPct}%.

Score four fields:
🎯 INTENT
- PLACEHOLDER (0-30): task description ("to make an impossible image"), no creative purpose or audience reaction named.
- GENUINE (70-100): specific reaction in first 2 seconds. Example: "${r.fieldHints.intent.genuineEx}"

🔍 ASSUMPTIONS
- PLACEHOLDER (0-30): vague ("I assume it will work"), not testable.
- GENUINE (70-100): specific bet about how Canva AI will interpret words. Example: "${r.fieldHints.assumptions.genuineEx}"

👥 AUDIENCE
- PLACEHOLDER (0-30): "my friends" / generic group label, no characteristics.
- GENUINE (70-100): specific people + what makes something visually striking to them. Example: "${r.fieldHints.audience.genuineEx}"

✅ SUCCESS
- PLACEHOLDER (0-30): "if it looks cool" — creator preference, not observable reaction.
- GENUINE (70-100): one specific reaction from one specific person. Example: "${r.fieldHints.success.genuineEx}"

Pick MODE:
- "challenge" → any field is placeholder.
- "nudge"     → at least one is genuine but others are shallow.
- "celebrate" → all four are specific, audience-centred, observable.

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

// ─── Stage 2 — Story-It (prompts) ─────────────────────────────────────────

async function gradeStoryIt(storyIt: Obj3StoryItFields): Promise<Obj3StoryItStageResult> {
  const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const prompt1WordCount     = wc(storyIt.prompt1);
  const additionalWordsCount = storyIt.additionalWords.filter(w => w.trim().length > 0).length;

  // Cheap LLM check — physically impossible scene? + are added words visual?
  const system = `
You are validating a student's Story-It plan for Objective 3 (Your Impossible World).

Return strict JSON: { isImpossible: boolean, wordsAreVisual: boolean, note: string }.

isImpossible — is the prompt describing a scene that is GENUINELY physically impossible (could not happen in reality, defies physics/biology/scale), not just unusual or fantasy-themed?
- TRUE  : "A city built inside a thundercloud, buildings made of lightning"
- TRUE  : "An ocean of liquid gold with mountains of melting glass rising from it"
- FALSE : "A futuristic city" (unusual, not impossible)
- FALSE : "A dragon flying over a castle" (fantasy, but not physically impossible in fiction)

wordsAreVisual — do the 5 added words add NEW visual information (lighting, texture, time of day, perspective, colour, artistic style), not just intensifiers ("very", "more", "bigger") or repetition of the subject?
- TRUE  : ["cinematic", "golden hour", "photorealistic", "aerial view", "hyperdetailed"]
- FALSE : ["very", "more", "bigger", "nice", "cool"]
- FALSE : ["impossible", "amazing", "incredible", "wow", "beautiful"]

note: one short sentence explaining the judgement (used internally, not shown to student).
`.trim();
  const user = `
PROMPT 1 (${prompt1WordCount} words):
${storyIt.prompt1 || "(empty)"}

5 ADDITIONAL WORDS:
${storyIt.additionalWords.join(", ") || "(empty)"}

WHY THESE WORDS:
${storyIt.additionalWordsWhy || "(empty)"}

Judge now. Return only JSON.
`.trim();

  let isImpossible    = false;
  let wordsAreVisual  = false;
  try {
    const completion = await openai.chat.completions.create({
      model:           "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature:     0.1,
      max_tokens:      200,
      messages: [
        { role: "system", content: system },
        { role: "user",   content: user },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { isImpossible: boolean; wordsAreVisual: boolean };
    isImpossible    = parsed.isImpossible === true;
    wordsAreVisual  = parsed.wordsAreVisual === true;
  } catch (err) {
    console.warn("[validate/obj3] story-it judge failed:", err);
  }

  const check1Pass = prompt1WordCount >= 10 && isImpossible;
  const check2Pass = additionalWordsCount >= 5 && wordsAreVisual;
  const passed     = check1Pass && check2Pass;

  let summary: string;
  if (!check1Pass) summary = OBJ3_RUBRIC.storyIt.checks.prompt1Words10Plus.fail;
  else if (!check2Pass) summary = OBJ3_RUBRIC.storyIt.checks.addedWordsAreVisual.fail;
  else summary = OBJ3_RUBRIC.storyIt.checks.addedWordsAreVisual.pass;

  return {
    stage: "storyIt", passed,
    prompt1WordCount,
    prompt1IsImpossible:      isImpossible,
    additionalWordsCount,
    additionalWordsAreVisual: wordsAreVisual,
    summary,
  };
}

// ─── Stage 3 — Create-It (vision on V1 + V2 + reflection quality) ─────────

const createItSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    description:           { type: "string" },
    v1ShowsImpossible:     { type: "boolean" },
    v2ShowsImpossible:     { type: "boolean" },
    v2VisuallyDifferent:   { type: "boolean" },
    hasMeaningfulComparison:        { type: "boolean" },
    identifiesMostImpactfulWord:    { type: "boolean" },
    identifiesAiMisinterpretation:  { type: "boolean" },
    score:                 { type: "integer" },
    summary:               { type: "string" },
  },
  required: [
    "description", "v1ShowsImpossible", "v2ShowsImpossible", "v2VisuallyDifferent",
    "hasMeaningfulComparison", "identifiesMostImpactfulWord", "identifiesAiMisinterpretation",
    "score", "summary",
  ],
} as const;

async function gradeCreateIt(
  v1ImageUrl:  string,
  v2ImageUrl:  string,
  canvas:      Obj3CanvasFields,
  storyIt:     Obj3StoryItFields,
  reflection:  Obj3ReflectionFields,
  ageGroup:    string,
): Promise<Obj3CreateItStageResult> {
  // 1. Reachability — quick HEAD checks.
  const check = async (url: string) => {
    try {
      const head = await fetch(url, { method: "HEAD" });
      return head.ok && (head.headers.get("content-type") ?? "").startsWith("image/");
    } catch { return false; }
  };
  const [v1Reachable, v2Reachable] = await Promise.all([check(v1ImageUrl), check(v2ImageUrl)]);
  const bothReachable = v1Reachable && v2Reachable;
  if (!bothReachable) {
    return {
      stage: "createIt", score: 0, tier: "fail",
      bothImagesReachable: false,
      v1ShowsImpossible: false, v2ShowsImpossible: false, v2VisuallyDifferent: false,
      hasMeaningfulComparison: false, identifiesMostImpactfulWord: false, identifiesAiMisinterpretation: false,
      description: "", summary: "I can't load one of your images — drop both in chat (Version 1 first, then Version 2) and try again.",
    };
  }

  // 2. Vision-grade both images + judge reflection.
  const system = `
You are the Validator Teacher at AI Decoder Academy — a SKEPTICAL MENTOR.
The student generated TWO Canva AI images for Objective 3:
- Version 1: their original prompt (10+ words describing an impossible scene)
- Version 2: same prompt + 5 ADDED descriptive words

You receive both images PLUS the student's written reflection. Grade:

Student's plan:
- PROMPT 1: ${storyIt.prompt1 || "(none)"}
- ADDED 5 WORDS: ${storyIt.additionalWords.join(", ") || "(none)"}
- WHY THESE WORDS: ${storyIt.additionalWordsWhy || "(none)"}

Their reflection (this is the CT-Skill-1 learning surface):
- V1 reflection: ${reflection.version1Reflection || "(empty)"}
- V2 reflection: ${reflection.version2Reflection || "(empty)"}
- Which assumption proved wrong: ${reflection.ctSkill1Reflection || "(empty)"}

Their Canvas:
- Intent: ${canvas.intent || "(none)"}
- Success: ${canvas.success || "(none)"}

Step 1 — DESCRIBE both images in 1-2 sentences each (briefly, what's in each).
Step 2 — RUN the checks:
- v1ShowsImpossible    : is V1 a genuinely impossible scene? (not just unusual or fantasy-stylised — physically impossible)
- v2ShowsImpossible    : same for V2
- v2VisuallyDifferent  : is V2 MEANINGFULLY visually different from V1 (different lighting, composition, palette, perspective, or atmosphere) — not just minor pixel-level variation
- hasMeaningfulComparison       : did the student write specific observations comparing V1 and V2 in their reflection?
- identifiesMostImpactfulWord   : in their V2 reflection, do they name WHICH of the 5 added words had the most visual impact AND explain why?
- identifiesAiMisinterpretation : in the CT-Skill-1 reflection, do they name ONE specific word or phrase in their prompt that Canva AI interpreted differently from their intention? (Not "AI got everything right" — they must identify a divergence.)

Step 3 — SCORE 0-100:
- 80 (PASS)        : both images present, both genuinely impossible, V2 visually different from V1, comparison reflection written.
- 90 (MERIT)       : all PASS criteria true + identifiesMostImpactfulWord true.
- 100 (DISTINCTION): MERIT criteria + identifiesAiMisinterpretation true (real CT-Skill-1 evidence).
- <80 (FAIL)       : any of v1ShowsImpossible / v2ShowsImpossible / v2VisuallyDifferent is false, OR hasMeaningfulComparison is false.

VOICE — Skeptical Mentor:
- NEVER use "wrong". Steady, direct, no emojis.
- Adapt to age group ${ageGroup}.
- Summary is ONE short line spoken aloud.
`.trim();

  const completion = await openai.chat.completions.create({
    model:           "gpt-4o-mini",
    response_format: {
      type:        "json_schema",
      json_schema: { name: "obj3_create_grade", schema: createItSchema, strict: true },
    },
    temperature: 0.2,
    max_tokens:  900,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: [
        { type: "text", text: "Grade against the rubric. Return only the JSON." },
        { type: "text", text: "VERSION 1:" },
        { type: "image_url", image_url: { url: v1ImageUrl, detail: "high" } },
        { type: "text", text: "VERSION 2:" },
        { type: "image_url", image_url: { url: v2ImageUrl, detail: "high" } },
      ]},
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    description:                   string;
    v1ShowsImpossible:             boolean;
    v2ShowsImpossible:             boolean;
    v2VisuallyDifferent:           boolean;
    hasMeaningfulComparison:       boolean;
    identifiesMostImpactfulWord:   boolean;
    identifiesAiMisinterpretation: boolean;
    score:                         number;
    summary:                       string;
  };

  const score = clamp(Math.round(parsed.score), 0, 100);
  const tier: Obj3CreateItStageResult["tier"] =
    score >= 100 ? "distinction" :
    score >= 90  ? "merit"        :
    score >= 80  ? "pass"         :
    "fail";

  return {
    stage: "createIt",
    score, tier,
    bothImagesReachable:           true,
    v1ShowsImpossible:             parsed.v1ShowsImpossible,
    v2ShowsImpossible:             parsed.v2ShowsImpossible,
    v2VisuallyDifferent:           parsed.v2VisuallyDifferent,
    hasMeaningfulComparison:       parsed.hasMeaningfulComparison,
    identifiesMostImpactfulWord:   parsed.identifiesMostImpactfulWord,
    identifiesAiMisinterpretation: parsed.identifiesAiMisinterpretation,
    description:                   parsed.description,
    summary:                       parsed.summary,
  };
}

function pickFeedback(tier: Obj3FinalResult["tier"]): string {
  switch (tier) {
    case "distinction": return OBJ3_RUBRIC.feedbackScripts.distinction;
    case "merit":       return OBJ3_RUBRIC.feedbackScripts.merit;
    case "pass":        return OBJ3_RUBRIC.feedbackScripts.pass;
    case "fail":        return "Have another look at your two versions — you've got this.";
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

    // Stage 0 — extract.
    let canvas:     Obj3CanvasFields;
    let storyIt:    Obj3StoryItFields;
    let reflection: Obj3ReflectionFields;

    if (body.worksheet.kind === "inline-form") {
      const r = fromInline(body.worksheet.data);
      canvas     = r.canvas;
      storyIt    = r.storyIt;
      reflection = r.reflection;
    } else {
      const ws = await extractWorksheet(
        { url: body.worksheet.url, format: body.worksheet.format },
        openai,
        body.worksheet.filename,
      );
      const sys = `Extract the OBJ 3 worksheet into JSON: {
  canvas: { intent, assumptions, audience, success },
  storyIt: { prompt1: string, additionalWords: string[] (max 5), additionalWordsWhy: string },
  reflection: { version1Reflection: string, version2Reflection: string, ctSkill1Reflection: string }
}.
Use empty strings / empty arrays for missing fields. Return strict JSON only.`;
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
      canvas     = parsed.canvas     ?? { intent: "", assumptions: "", audience: "", success: "" };
      storyIt    = parsed.storyIt    ?? { prompt1: "", additionalWords: [], additionalWordsWhy: "" };
      reflection = parsed.reflection ?? { version1Reflection: "", version2Reflection: "", ctSkill1Reflection: "" };
    }

    // Moderation
    const fullText = [
      canvas.intent, canvas.assumptions, canvas.audience, canvas.success,
      storyIt.prompt1, storyIt.additionalWords.join(" "), storyIt.additionalWordsWhy,
      reflection.version1Reflection, reflection.version2Reflection, reflection.ctSkill1Reflection,
      notes,
    ].join("\n");
    const verdict = await moderateContent(fullText);
    if (!verdict.allow) {
      const blockedCanvas: Obj3CanvasStageResult = {
        stage: "canvas", passed: false, score: 0, mode: "challenge",
        fieldFeedback: { intent: "", assumptions: "", audience: "", success: "" },
        summary: "I can't grade this submission.",
      };
      const final: Obj3FinalResult = {
        passed: false, composite: 0, tier: "fail",
        canvas: blockedCanvas, storyIt: null, createIt: null,
        feedbackScript: "I can't grade this — let's pick a different submission. Talk to a grown-up if something's bothering you.",
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
          .eq("lms_id", "l1-03");
        attemptCount = count ?? 0;
      }
    } catch (err) {
      console.warn("[validate/obj3] attempts count failed, defaulting to 0:", err);
    }

    // Stage 1 — Canvas.
    const canvasResult = await gradeCanvas(canvas, profile.age_group, attemptCount, profile.display_name);
    if (!canvasResult.passed) {
      return jsonResponse<Obj3FinalResult>({
        passed:         false,
        composite:      Math.round(canvasResult.score * OBJ3_RUBRIC.canvas.weight),
        tier:           "fail",
        canvas:         canvasResult,
        storyIt:        null,
        createIt:       null,
        feedbackScript: canvasResult.summary,
        blockedAtStage: "canvas",
      });
    }

    // Stage 2 — Story-It.
    const storyItResult = await gradeStoryIt(storyIt);
    if (!storyItResult.passed) {
      return jsonResponse<Obj3FinalResult>({
        passed:         false,
        composite:      Math.round(canvasResult.score * OBJ3_RUBRIC.canvas.weight),
        tier:           "fail",
        canvas:         canvasResult,
        storyIt:        storyItResult,
        createIt:       null,
        feedbackScript: storyItResult.summary,
        blockedAtStage: "storyIt",
      });
    }

    // Stage 3 — Both images required.
    if (!body.v1ImageUrl || !body.v2ImageUrl) {
      return jsonResponse<Obj3FinalResult>({
        passed:         false,
        composite:      Math.round(
          canvasResult.score   * OBJ3_RUBRIC.canvas.weight +
          100                  * OBJ3_RUBRIC.storyIt.weight,
        ),
        tier:           "fail",
        canvas:         canvasResult,
        storyIt:        storyItResult,
        createIt:       null,
        feedbackScript: "Drop BOTH images in chat — Version 1 first, then Version 2 — and resubmit.",
      });
    }
    const createItResult = await gradeCreateIt(
      body.v1ImageUrl, body.v2ImageUrl, canvas, storyIt, reflection, profile.age_group,
    );

    const composite = clamp(Math.round(
      canvasResult.score   * OBJ3_RUBRIC.canvas.weight +
      100                  * OBJ3_RUBRIC.storyIt.weight +
      createItResult.score * OBJ3_RUBRIC.createIt.weight,
    ), 0, 100);
    const tier: Obj3FinalResult["tier"] =
      composite >= 100 ? "distinction" :
      composite >= 90  ? "merit"        :
      composite >= 80  ? "pass"         :
      "fail";

    return jsonResponse<Obj3FinalResult>({
      passed:         tier !== "fail",
      composite, tier,
      canvas:         canvasResult,
      storyIt:        storyItResult,
      createIt:       createItResult,
      feedbackScript: pickFeedback(tier),
    });
  } catch (e) {
    console.error("[validate/obj3] error:", e);
    return new Response("Validation failed", { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import {
  OBJ4_RUBRIC,
  type Obj4CanvasFields,
  type Obj4StoryItFields,
  type Obj4ReflectionFields,
  type Obj4CanvasStageResult,
  type Obj4StoryItStageResult,
  type Obj4CreateItStageResult,
  type Obj4FinalResult,
} from "@/lib/obj4Rubric";
import { moderateContent } from "@/lib/aidaSafety";
import { applyCopyMode } from "@/lib/validatorCopyMode";
import { extractWorksheet } from "@/lib/worksheetExtract";
import { createAdminClient } from "@/lib/supabase";

export const runtime     = "nodejs";
export const maxDuration = 90;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface Body {
  worksheet:
    | { kind: "file"; url: string; format: "pdf" | "docx"; filename: string }
    | { kind: "inline-form"; data: Record<string, string | boolean>; lmsId: string };
  v1ImageUrl?: string;   // photorealistic
  v2ImageUrl?: string;   // anime
  v3ImageUrl?: string;   // student's chosen style
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
  canvas:     Obj4CanvasFields;
  storyIt:    Obj4StoryItFields;
  reflection: Obj4ReflectionFields;
}

function fromInline(data: Record<string, string | boolean>): ExtractedFields {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string).trim() : "");
  return {
    canvas: {
      intent:      s("intent"),
      assumptions: s("assumptions"),
      audience:    s("audience"),
      success:     s("success"),
    },
    storyIt: {
      subject:    s("subject"),
      subjectWhy: s("subjectWhy"),
      style3:     s("style3"),
      style3Why:  s("style3Why"),
      prompt1:    s("prompt1"),
      prompt2:    s("prompt2"),
      prompt3:    s("prompt3"),
    },
    reflection: {
      style1Observation:    s("style1Observation"),
      style1Interpretation: s("style1Interpretation"),
      style2Observation:    s("style2Observation"),
      style2Interpretation: s("style2Interpretation"),
      style3Observation:    s("style3Observation"),
      style3Interpretation: s("style3Interpretation"),
      mostSurprisingStyle:  s("mostSurprisingStyle"),
      realCharacterArt:     s("realCharacterArt"),
      personalityDifferent: s("personalityDifferent"),
    },
  };
}

// ─── Stage 1 — Canvas (Think It) ───────────────────────────────────────────

async function gradeCanvas(
  canvas:       Obj4CanvasFields,
  ageGroup:     string,
  attemptCount: number,
  displayName:  string,
): Promise<Obj4CanvasStageResult> {
  const r = OBJ4_RUBRIC.canvas;
  const baseSystem = `
You are the Validator Teacher at AI Decoder Academy — a SKEPTICAL MENTOR.
The student has filled in the Think It Canvas for Objective 4 (Style Switcher — one subject in 3 visual styles in Adobe Firefly). When you reference the mission, always say "Objective 4". Threshold: ${r.minPassPct}%.

Score four fields:
🎯 INTENT
- PLACEHOLDER (0-30): "to make three versions" — task description, no comparative purpose named.
- GENUINE (70-100): names a specific comparative reaction. Example: "${r.fieldHints.intent.genuineEx}"

🔍 ASSUMPTIONS
- PLACEHOLDER (0-30): "I assume they will look different" — vague.
- GENUINE (70-100): predicts feeling per style + names what they are uncertain about. Example: "${r.fieldHints.assumptions.genuineEx}"

👥 AUDIENCE
- PLACEHOLDER (0-30): generic group label.
- GENUINE (70-100): specific viewers + what would tell them the subject feels different. Example: "${r.fieldHints.audience.genuineEx}"

✅ SUCCESS
- PLACEHOLDER (0-30): "if they all look good".
- GENUINE (70-100): observable reaction from a specific person. Example: "${r.fieldHints.success.genuineEx}"

Pick MODE:
- "challenge" → any field is placeholder.
- "nudge"     → at least one is genuine but others are shallow.
- "celebrate" → all four are specific, audience-centred, observable.

Score is the average of the four field sub-scores.

VOICE — Skeptical Mentor:
- Steady. Few exclamation marks. No emojis.
- NEVER use "wrong". Use: "try again", "go deeper", "be more specific".
- Speak to age group ${ageGroup}.

Return strict JSON: { score, mode, fieldFeedback: { intent, assumptions, audience, success }, summary }.
`.trim();

  const user = `
INTENT:      ${canvas.intent      || "(empty)"}
ASSUMPTIONS: ${canvas.assumptions || "(empty)"}
AUDIENCE:    ${canvas.audience    || "(empty)"}
SUCCESS:     ${canvas.success     || "(empty)"}

Grade now. Return only JSON.
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

// ─── Stage 2 — Story-It (subject + style3 + prompts) ──────────────────────

async function gradeStoryIt(storyIt: Obj4StoryItFields): Promise<Obj4StoryItStageResult> {
  const subjectPresent         = storyIt.subject.trim().length >= 3;
  const allThreePromptsPresent = !!(storyIt.prompt1 && storyIt.prompt2 && storyIt.prompt3);

  // LLM check: subject consistent across prompts, style3 is distinct, prompts have style descriptors.
  const system = `
Validate Story-It plan for Objective 4 (Style Switcher).

Return strict JSON: { subjectConsistent: boolean, style3IsDistinct: boolean, promptsHaveStyleDescriptors: boolean, note: string }.

subjectConsistent — does the SAME subject appear in all three prompts? (e.g. all three mention "samurai in bamboo forest")
- TRUE  : "A samurai in bamboo forest, photorealistic" / "A samurai in bamboo forest, anime style" / "A samurai in bamboo forest, ukiyo-e"
- FALSE : "A samurai", "A dragon", "A city" (different subjects)

style3IsDistinct — is Style 3 a NAMED, distinct artistic style — NOT photorealistic, hyperreal, anime, or close variants?
- TRUE  : watercolour, oil painting, ukiyo-e, cyberpunk neon, claymation, pixel art, low-poly 3D, stained glass, impressionism
- FALSE : photorealistic, anime, realistic, manga, cartoon (too close to 1 or 2)

promptsHaveStyleDescriptors — do all three prompts include style-REINFORCING words beyond the bare style name?
- TRUE  : "anime art style, expressive eyes, dynamic pose, vibrant colour palette"
- FALSE : "anime" (just the bare word, no descriptors)

note: one short sentence explaining the judgement.
`.trim();

  const user = `
SUBJECT: ${storyIt.subject || "(empty)"}
STYLE 3: ${storyIt.style3 || "(empty)"}

PROMPT 1 (photorealistic): ${storyIt.prompt1 || "(empty)"}
PROMPT 2 (anime):         ${storyIt.prompt2 || "(empty)"}
PROMPT 3 (${storyIt.style3 || "Style 3"}): ${storyIt.prompt3 || "(empty)"}

Judge. Return only JSON.
`.trim();

  let subjectConsistent           = false;
  let style3IsDistinct            = false;
  let promptsHaveStyleDescriptors = false;
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
    const parsed = JSON.parse(raw) as {
      subjectConsistent: boolean;
      style3IsDistinct: boolean;
      promptsHaveStyleDescriptors: boolean;
    };
    subjectConsistent           = parsed.subjectConsistent === true;
    style3IsDistinct            = parsed.style3IsDistinct === true;
    promptsHaveStyleDescriptors = parsed.promptsHaveStyleDescriptors === true;
  } catch (err) {
    console.warn("[validate/obj4] story-it judge failed:", err);
  }

  const passed = subjectPresent && allThreePromptsPresent && subjectConsistent && style3IsDistinct && promptsHaveStyleDescriptors;

  let summary: string;
  if (!allThreePromptsPresent) summary = "All three prompts are required — Photorealistic, Anime, and your chosen Style 3.";
  else if (!subjectConsistent) summary = OBJ4_RUBRIC.storyIt.checks.subjectConsistent.fail;
  else if (!style3IsDistinct) summary = OBJ4_RUBRIC.storyIt.checks.style3IsDistinct.fail;
  else if (!promptsHaveStyleDescriptors) summary = OBJ4_RUBRIC.storyIt.checks.promptsHaveStyleDescriptors.fail;
  else summary = "Story It is complete. Three prompts, same subject, three distinct styles.";

  return {
    stage: "storyIt", passed,
    subjectPresent,
    style3IsDistinct,
    allThreePromptsPresent,
    promptsHaveStyleDescriptors,
    summary,
  };
}

// ─── Stage 3 — Create-It (vision on 3 images + reflection quality) ────────

const createItSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    description:                 { type: "string" },
    sameSubjectAllThree:         { type: "boolean" },
    style1IsPhotoreal:           { type: "boolean" },
    style2IsAnime:               { type: "boolean" },
    style3IsDistinct:            { type: "boolean" },
    observationsAreLiteral:      { type: "boolean" },
    interpretationsAreSeparate:  { type: "boolean" },
    identifiesUnexpectedChoice:  { type: "boolean" },
    score:                       { type: "integer" },
    summary:                     { type: "string" },
  },
  required: [
    "description", "sameSubjectAllThree", "style1IsPhotoreal", "style2IsAnime", "style3IsDistinct",
    "observationsAreLiteral", "interpretationsAreSeparate", "identifiesUnexpectedChoice",
    "score", "summary",
  ],
} as const;

async function gradeCreateIt(
  v1ImageUrl:  string,
  v2ImageUrl:  string,
  v3ImageUrl:  string,
  storyIt:     Obj4StoryItFields,
  canvas:      Obj4CanvasFields,
  reflection:  Obj4ReflectionFields,
  ageGroup:    string,
): Promise<Obj4CreateItStageResult> {
  const check = async (url: string) => {
    try {
      const head = await fetch(url, { method: "HEAD" });
      return head.ok && (head.headers.get("content-type") ?? "").startsWith("image/");
    } catch { return false; }
  };
  const [r1, r2, r3] = await Promise.all([check(v1ImageUrl), check(v2ImageUrl), check(v3ImageUrl)]);
  const allReachable = r1 && r2 && r3;
  if (!allReachable) {
    return {
      stage: "createIt", score: 0, tier: "fail",
      allReachable: false,
      sameSubjectAllThree: false, style1IsPhotoreal: false, style2IsAnime: false, style3IsDistinct: false,
      observationsAreLiteral: false, interpretationsAreSeparate: false, identifiesUnexpectedChoice: false,
      description: "",
      summary: "I can't load all three images — drop them in chat in order (Photorealistic → Anime → Your Style 3) and try again.",
    };
  }

  const system = `
You are the Validator Teacher at AI Decoder Academy — a SKEPTICAL MENTOR.
The student generated THREE Adobe Firefly images for Objective 4:
- Style 1: Photorealistic
- Style 2: Anime
- Style 3: ${storyIt.style3 || "(student's chosen style)"}

Subject (must be IDENTICAL across all 3): ${storyIt.subject || "(none)"}

Student's prompts:
- Prompt 1: ${storyIt.prompt1 || "(none)"}
- Prompt 2: ${storyIt.prompt2 || "(none)"}
- Prompt 3: ${storyIt.prompt3 || "(none)"}

Student's CT-Skill-2 reflection (observation vs interpretation):
- Style 1 OBS: ${reflection.style1Observation || "(empty)"}
- Style 1 INT: ${reflection.style1Interpretation || "(empty)"}
- Style 2 OBS: ${reflection.style2Observation || "(empty)"}
- Style 2 INT: ${reflection.style2Interpretation || "(empty)"}
- Style 3 OBS: ${reflection.style3Observation || "(empty)"}
- Style 3 INT: ${reflection.style3Interpretation || "(empty)"}
- Most surprising style: ${reflection.mostSurprisingStyle || "(empty)"}
- Real / character / art: ${reflection.realCharacterArt || "(empty)"}
- Subject feels like different personality? ${reflection.personalityDifferent || "(empty)"}

Their Canvas success definition: ${canvas.success || "(none)"}

Step 1 — DESCRIBE each panel in one short sentence.
Step 2 — RUN the checks:
- sameSubjectAllThree    : is the SAME subject clearly visible in all 3? (e.g. all 3 show a samurai in bamboo forest, not 3 different things)
- style1IsPhotoreal      : does Style 1 visually read as photorealistic (sharp detail, natural lighting, realistic textures)?
- style2IsAnime          : does Style 2 visually read as anime (stylised eyes/proportions, line art aesthetic)?
- style3IsDistinct       : is Style 3 genuinely distinct from photorealistic AND anime — visually clearly a different artistic style?
- observationsAreLiteral : are the 3 OBSERVATION fields describing what's literally visible (colours, lines, textures), not conclusions?
- interpretationsAreSeparate : are the INTERPRETATION fields clearly separated from observations — drawing conclusions about what Firefly emphasised?
- identifiesUnexpectedChoice : does ANY reflection field name a SPECIFIC visual element Firefly added that the student did NOT request? (e.g. "Firefly added a sunset I didn't ask for")

Step 3 — SCORE 0-100:
- 80 (PASS)        : sameSubjectAllThree + all 3 styles correct + observationsAreLiteral + interpretationsAreSeparate.
- 90 (MERIT)       : all PASS criteria true + mostSurprisingStyle reflection is specific (not vague).
- 100 (DISTINCTION): MERIT criteria + identifiesUnexpectedChoice true (CT Skill 1 applied).
- <80 (FAIL)       : any of sameSubjectAllThree / style1IsPhotoreal / style2IsAnime / style3IsDistinct is false, OR observations are not literal.

VOICE — Skeptical Mentor: steady, direct, no emojis, NEVER "wrong". Adapt to age group ${ageGroup}. Summary = one short line.
`.trim();

  const completion = await openai.chat.completions.create({
    model:           "gpt-4o-mini",
    response_format: {
      type:        "json_schema",
      json_schema: { name: "obj4_create_grade", schema: createItSchema, strict: true },
    },
    temperature: 0.2,
    max_tokens:  1000,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: [
        { type: "text", text: "Grade against the rubric. Return only JSON." },
        { type: "text", text: "STYLE 1 (Photorealistic):" },
        { type: "image_url", image_url: { url: v1ImageUrl, detail: "high" } },
        { type: "text", text: "STYLE 2 (Anime):" },
        { type: "image_url", image_url: { url: v2ImageUrl, detail: "high" } },
        { type: "text", text: `STYLE 3 (${storyIt.style3 || "Student's choice"}):` },
        { type: "image_url", image_url: { url: v3ImageUrl, detail: "high" } },
      ]},
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    description: string;
    sameSubjectAllThree: boolean;
    style1IsPhotoreal: boolean;
    style2IsAnime: boolean;
    style3IsDistinct: boolean;
    observationsAreLiteral: boolean;
    interpretationsAreSeparate: boolean;
    identifiesUnexpectedChoice: boolean;
    score: number;
    summary: string;
  };

  const score = clamp(Math.round(parsed.score), 0, 100);
  const tier: Obj4CreateItStageResult["tier"] =
    score >= 100 ? "distinction" :
    score >= 90  ? "merit"        :
    score >= 80  ? "pass"         :
    "fail";

  return {
    stage: "createIt",
    score, tier,
    allReachable:               true,
    sameSubjectAllThree:        parsed.sameSubjectAllThree,
    style1IsPhotoreal:          parsed.style1IsPhotoreal,
    style2IsAnime:              parsed.style2IsAnime,
    style3IsDistinct:           parsed.style3IsDistinct,
    observationsAreLiteral:     parsed.observationsAreLiteral,
    interpretationsAreSeparate: parsed.interpretationsAreSeparate,
    identifiesUnexpectedChoice: parsed.identifiesUnexpectedChoice,
    description:                parsed.description,
    summary:                    parsed.summary,
  };
}

function pickFeedback(tier: Obj4FinalResult["tier"]): string {
  switch (tier) {
    case "distinction": return OBJ4_RUBRIC.feedbackScripts.distinction;
    case "merit":       return OBJ4_RUBRIC.feedbackScripts.merit;
    case "pass":        return OBJ4_RUBRIC.feedbackScripts.pass;
    case "fail":        return "Have another look at your three panels — you've got this.";
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

    let canvas:     Obj4CanvasFields;
    let storyIt:    Obj4StoryItFields;
    let reflection: Obj4ReflectionFields;

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
      const sys = `Extract the OBJ 4 worksheet into JSON: {
  canvas: { intent, assumptions, audience, success },
  storyIt: { subject, subjectWhy, style3, style3Why, prompt1, prompt2, prompt3 },
  reflection: {
    style1Observation, style1Interpretation,
    style2Observation, style2Interpretation,
    style3Observation, style3Interpretation,
    mostSurprisingStyle, realCharacterArt, personalityDifferent
  }
}.
Use empty strings for missing fields. Return strict JSON only.`;
      const userMsg = ws.kind === "text"
        ? `Worksheet:\n${ws.text}\nNotes:\n${notes}`
        : `(file_id: ${ws.fileId})\nNotes:\n${notes}`;
      const ext = await openai.chat.completions.create({
        model:           "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature:     0.1,
        max_tokens:      1500,
        messages: [
          { role: "system", content: sys },
          { role: "user",   content: userMsg },
        ],
      });
      const parsed = JSON.parse(ext.choices[0]?.message?.content ?? "{}");
      canvas     = parsed.canvas     ?? { intent: "", assumptions: "", audience: "", success: "" };
      storyIt    = parsed.storyIt    ?? { subject: "", subjectWhy: "", style3: "", style3Why: "", prompt1: "", prompt2: "", prompt3: "" };
      reflection = parsed.reflection ?? {
        style1Observation: "", style1Interpretation: "",
        style2Observation: "", style2Interpretation: "",
        style3Observation: "", style3Interpretation: "",
        mostSurprisingStyle: "", realCharacterArt: "", personalityDifferent: "",
      };
    }

    // Moderation
    const fullText = [
      canvas.intent, canvas.assumptions, canvas.audience, canvas.success,
      storyIt.subject, storyIt.subjectWhy, storyIt.style3, storyIt.style3Why,
      storyIt.prompt1, storyIt.prompt2, storyIt.prompt3,
      reflection.style1Observation, reflection.style1Interpretation,
      reflection.style2Observation, reflection.style2Interpretation,
      reflection.style3Observation, reflection.style3Interpretation,
      reflection.mostSurprisingStyle, reflection.realCharacterArt, reflection.personalityDifferent,
      notes,
    ].join("\n");
    const verdict = await moderateContent(fullText);
    if (!verdict.allow) {
      const blockedCanvas: Obj4CanvasStageResult = {
        stage: "canvas", passed: false, score: 0, mode: "challenge",
        fieldFeedback: { intent: "", assumptions: "", audience: "", success: "" },
        summary: "I can't grade this submission.",
      };
      const final: Obj4FinalResult = {
        passed: false, composite: 0, tier: "fail",
        canvas: blockedCanvas, storyIt: null, createIt: null,
        feedbackScript: "I can't grade this — let's pick a different submission. Talk to a grown-up if something's bothering you.",
        blockedAtStage: "canvas",
      };
      return jsonResponse(final);
    }

    // Attempts count for copy mode.
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
          .eq("lms_id", "l1-04");
        attemptCount = count ?? 0;
      }
    } catch (err) {
      console.warn("[validate/obj4] attempts count failed:", err);
    }

    // Stage 1 — Canvas
    const canvasResult = await gradeCanvas(canvas, profile.age_group, attemptCount, profile.display_name);
    if (!canvasResult.passed) {
      return jsonResponse<Obj4FinalResult>({
        passed:         false,
        composite:      Math.round(canvasResult.score * OBJ4_RUBRIC.canvas.weight),
        tier:           "fail",
        canvas:         canvasResult,
        storyIt:        null,
        createIt:       null,
        feedbackScript: canvasResult.summary,
        blockedAtStage: "canvas",
      });
    }

    // Stage 2 — Story-It
    const storyItResult = await gradeStoryIt(storyIt);
    if (!storyItResult.passed) {
      return jsonResponse<Obj4FinalResult>({
        passed:         false,
        composite:      Math.round(canvasResult.score * OBJ4_RUBRIC.canvas.weight),
        tier:           "fail",
        canvas:         canvasResult,
        storyIt:        storyItResult,
        createIt:       null,
        feedbackScript: storyItResult.summary,
        blockedAtStage: "storyIt",
      });
    }

    // Stage 3 — Three images required
    if (!body.v1ImageUrl || !body.v2ImageUrl || !body.v3ImageUrl) {
      return jsonResponse<Obj4FinalResult>({
        passed:         false,
        composite:      Math.round(
          canvasResult.score * OBJ4_RUBRIC.canvas.weight +
          100               * OBJ4_RUBRIC.storyIt.weight,
        ),
        tier:           "fail",
        canvas:         canvasResult,
        storyIt:        storyItResult,
        createIt:       null,
        feedbackScript: "I need ALL three images — drop them in chat in order: Photorealistic, Anime, then your Style 3.",
      });
    }
    const createItResult = await gradeCreateIt(
      body.v1ImageUrl, body.v2ImageUrl, body.v3ImageUrl, storyIt, canvas, reflection, profile.age_group,
    );

    const composite = clamp(Math.round(
      canvasResult.score   * OBJ4_RUBRIC.canvas.weight +
      100                  * OBJ4_RUBRIC.storyIt.weight +
      createItResult.score * OBJ4_RUBRIC.createIt.weight,
    ), 0, 100);
    const tier: Obj4FinalResult["tier"] =
      composite >= 100 ? "distinction" :
      composite >= 90  ? "merit"        :
      composite >= 80  ? "pass"         :
      "fail";

    return jsonResponse<Obj4FinalResult>({
      passed:         tier !== "fail",
      composite, tier,
      canvas:         canvasResult,
      storyIt:        storyItResult,
      createIt:       createItResult,
      feedbackScript: pickFeedback(tier),
    });
  } catch (e) {
    console.error("[validate/obj4] error:", e);
    return new Response("Validation failed", { status: 500 });
  }
}

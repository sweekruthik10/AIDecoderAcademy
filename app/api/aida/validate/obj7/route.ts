import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import {
  OBJ7_RUBRIC,
  type Obj7CanvasFields,
  type Obj7StoryItFields,
  type Obj7ReflectionFields,
  type Obj7CanvasStageResult,
  type Obj7StoryItStageResult,
  type Obj7CreateItStageResult,
  type Obj7FinalResult,
} from "@/lib/obj7Rubric";
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
  posterImageUrl?: string;
  notes?:  string;
  profile: { display_name: string; age_group: string };
}

function jsonResponse<T>(data: T) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function fromInline(data: Record<string, string | boolean>) {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string).trim() : "");
  return {
    canvas: { intent: s("intent"), assumptions: s("assumptions"), audience: s("audience"), success: s("success") },
    storyIt: { topicSentence: s("topicSentence"), toneWord: s("toneWord"), atmosphereWord: s("atmosphereWord"), fireflyPrompt: s("fireflyPrompt") },
    reflection: { observation: s("observation"), interpretation: s("interpretation"), didItWork: s("didItWork") },
    avatarName: s("avatarName"),
  };
}

async function gradeCanvas(canvas: Obj7CanvasFields, ageGroup: string, attemptCount: number, displayName: string): Promise<Obj7CanvasStageResult> {
  const r = OBJ7_RUBRIC.canvas;
  const baseSystem = `
You are the Validator Teacher at AI Decoder Academy — a SKEPTICAL MENTOR.
The student has filled the Think It Canvas for Objective 7 (Your Film Poster — Firefly). Always say "Objective 7". Threshold: ${r.minPassPct}%.

Score four fields:
🎯 INTENT — placeholder: "to make a poster" / generic. Genuine: names what a stranger should say in 3 sec. Example: "${r.fieldHints.intent.genuineEx}"
🔍 ASSUMPTIONS — placeholder: "I assume it'll work". Genuine: names a specific bet about how Firefly reads words. Example: "${r.fieldHints.assumptions.genuineEx}"
👥 AUDIENCE — placeholder: "everyone". Genuine: ONE specific person + what they'd say. Example: "${r.fieldHints.audience.genuineEx}"
✅ SUCCESS — placeholder: "if it looks good". Genuine: observable phrase a stranger would utter. Example: "${r.fieldHints.success.genuineEx}"

MODE: "challenge" if any field placeholder; "nudge" if mixed; "celebrate" if all four genuine.
VOICE — Skeptical Mentor, steady, no emojis, never "wrong". Age ${ageGroup}.
Return strict JSON: { score, mode, fieldFeedback: { intent, assumptions, audience, success }, summary }.`.trim();

  const user = `INTENT: ${canvas.intent || "(empty)"}\nASSUMPTIONS: ${canvas.assumptions || "(empty)"}\nAUDIENCE: ${canvas.audience || "(empty)"}\nSUCCESS: ${canvas.success || "(empty)"}\nGrade. JSON only.`;
  const system = applyCopyMode(baseSystem, attemptCount, displayName);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 500,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    score: number; mode: "challenge"|"nudge"|"celebrate";
    fieldFeedback: { intent: string; assumptions: string; audience: string; success: string };
    summary: string;
  };
  const score = clamp(Math.round(parsed.score ?? 0), 0, 100);
  return {
    stage: "canvas", passed: score >= r.minPassPct, score,
    mode: parsed.mode ?? "challenge",
    fieldFeedback: parsed.fieldFeedback ?? { intent: "", assumptions: "", audience: "", success: "" },
    summary: parsed.summary ?? "",
  };
}

async function gradeStoryIt(storyIt: Obj7StoryItFields): Promise<Obj7StoryItStageResult> {
  const hasToneWord       = storyIt.toneWord.trim().length > 0 && storyIt.toneWord.trim().split(/\s+/).length <= 3;
  const hasAtmosphereWord = storyIt.atmosphereWord.trim().length > 0 && storyIt.atmosphereWord.trim().split(/\s+/).length <= 3;
  const promptCombinesAll = storyIt.fireflyPrompt.trim().length > 20;

  // LLM judge: is the topic a WORLD/idea (not just a character/genre)?
  let topicIsAWorld = false;
  try {
    const c = await openai.chat.completions.create({
      model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 150,
      messages: [
        { role: "system", content: `Return JSON: { isAWorld: boolean }. A WORLD describes a setting, situation, or world-idea (e.g. "A city where human memories are sold as entertainment"). A character name alone ("Detective Rivera") or genre title alone ("A thriller") is NOT a world.` },
        { role: "user", content: storyIt.topicSentence || "(empty)" },
      ],
    });
    const p = JSON.parse(c.choices[0]?.message?.content ?? "{}");
    topicIsAWorld = p.isAWorld === true;
  } catch (err) { console.warn("[obj7] judge err:", err); }

  const passed = topicIsAWorld && hasToneWord && hasAtmosphereWord && promptCombinesAll;
  let summary: string;
  if (!topicIsAWorld) summary = OBJ7_RUBRIC.storyIt.checks.topicIsAWorld.fail;
  else if (!hasToneWord) summary = OBJ7_RUBRIC.storyIt.checks.hasToneWord.fail;
  else if (!hasAtmosphereWord) summary = OBJ7_RUBRIC.storyIt.checks.hasAtmosphereWord.fail;
  else if (!promptCombinesAll) summary = OBJ7_RUBRIC.storyIt.checks.promptCombinesAll.fail;
  else summary = "Story It complete. Three elements combined into your Firefly prompt.";

  return { stage: "storyIt", passed, topicIsAWorld, hasToneWord, hasAtmosphereWord, promptCombinesAll, summary };
}

const createItSchema = {
  type: "object", additionalProperties: false,
  properties: {
    description: { type: "string" },
    matchesPrompt: { type: "boolean" },
    hasCinematicQuality: { type: "boolean" },
    directorCreditVisible: { type: "boolean" },
    atmosphereVisible: { type: "boolean" },
    observationIsLiteral: { type: "boolean" },
    interpretationSeparate: { type: "boolean" },
    identifiesPromptChange: { type: "boolean" },
    score: { type: "integer" },
    summary: { type: "string" },
  },
  required: ["description","matchesPrompt","hasCinematicQuality","directorCreditVisible","atmosphereVisible","observationIsLiteral","interpretationSeparate","identifiesPromptChange","score","summary"],
} as const;

async function gradeCreateIt(posterUrl: string, avatarName: string, canvas: Obj7CanvasFields, storyIt: Obj7StoryItFields, reflection: Obj7ReflectionFields, ageGroup: string): Promise<Obj7CreateItStageResult> {
  let reachable = false;
  try { const h = await fetch(posterUrl, { method: "HEAD" }); reachable = h.ok && (h.headers.get("content-type") ?? "").startsWith("image/"); } catch {}
  if (!reachable) {
    return {
      stage: "createIt", score: 0, tier: "fail", imageReachable: false,
      matchesPrompt: false, hasCinematicQuality: false, directorCreditVisible: false, atmosphereVisible: false,
      observationIsLiteral: false, interpretationSeparate: false, identifiesPromptChange: false,
      description: "", summary: "I can't load your poster — drop it in chat again, then resubmit.",
    };
  }

  const system = `
You are the Validator Teacher at AI Decoder Academy — SKEPTICAL MENTOR.
The student generated a cinematic movie poster in Adobe Firefly for Objective 7.

Plan:
- Topic sentence: ${storyIt.topicSentence || "(none)"}
- Tone word: ${storyIt.toneWord || "(none)"}
- Atmosphere word: ${storyIt.atmosphereWord || "(none)"}
- Final Firefly prompt: ${storyIt.fireflyPrompt || "(none)"}
- Avatar Name (as Director credit): ${avatarName || "(none)"}

Their reflection:
- Observation: ${reflection.observation || "(empty)"}
- Interpretation: ${reflection.interpretation || "(empty)"}
- Did it work / what to change: ${reflection.didItWork || "(empty)"}

Their Canvas intent: ${canvas.intent || "(none)"}

DESCRIBE the poster in 1-2 sentences.
RUN checks:
- matchesPrompt          : does the poster visually represent the topic sentence?
- hasCinematicQuality    : composition, framing, lighting feel like a movie poster (not flat or amateur)?
- directorCreditVisible  : is the Avatar Name "${avatarName}" visible on the poster as a director credit ("A film by ${avatarName}" / "Directed by ${avatarName}" or similar)?
- atmosphereVisible      : does the visual atmosphere word "${storyIt.atmosphereWord || ""}" show through in the image?
- observationIsLiteral   : does the student's observation list literal visual elements (colours, objects, lighting) — not conclusions?
- interpretationSeparate : is the interpretation clearly distinct from observation — drawing conclusions about mood/genre?
- identifiesPromptChange : in "did it work", does the student name ONE specific word they would change and what visual impact that change would have?

SCORE:
- 80 PASS: matchesPrompt + directorCreditVisible + observationIsLiteral + interpretationSeparate.
- 90 MERIT: all PASS + hasCinematicQuality + atmosphereVisible.
- 100 DISTINCTION: MERIT + identifiesPromptChange.
- <80 FAIL: any of matchesPrompt / directorCreditVisible / observationIsLiteral is false.

VOICE: Skeptical Mentor. Age ${ageGroup}. Summary = one short line.`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_schema", json_schema: { name: "obj7_create_grade", schema: createItSchema, strict: true } },
    temperature: 0.2, max_tokens: 900,
    messages: [
      { role: "system", content: system },
      { role: "user", content: [
        { type: "text", text: "Grade the poster. Return only JSON." },
        { type: "image_url", image_url: { url: posterUrl, detail: "high" } },
      ]},
    ],
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    description: string; matchesPrompt: boolean; hasCinematicQuality: boolean;
    directorCreditVisible: boolean; atmosphereVisible: boolean;
    observationIsLiteral: boolean; interpretationSeparate: boolean; identifiesPromptChange: boolean;
    score: number; summary: string;
  };
  const score = clamp(Math.round(parsed.score), 0, 100);
  const tier: Obj7CreateItStageResult["tier"] = score >= 100 ? "distinction" : score >= 90 ? "merit" : score >= 80 ? "pass" : "fail";
  return {
    stage: "createIt", score, tier, imageReachable: true,
    matchesPrompt: parsed.matchesPrompt, hasCinematicQuality: parsed.hasCinematicQuality,
    directorCreditVisible: parsed.directorCreditVisible, atmosphereVisible: parsed.atmosphereVisible,
    observationIsLiteral: parsed.observationIsLiteral, interpretationSeparate: parsed.interpretationSeparate,
    identifiesPromptChange: parsed.identifiesPromptChange,
    description: parsed.description, summary: parsed.summary,
  };
}

function pickFeedback(t: Obj7FinalResult["tier"]): string {
  switch (t) {
    case "distinction": return OBJ7_RUBRIC.feedbackScripts.distinction;
    case "merit":       return OBJ7_RUBRIC.feedbackScripts.merit;
    case "pass":        return OBJ7_RUBRIC.feedbackScripts.pass;
    case "fail":        return "Have another look at the poster — you've got this.";
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });
    const body = (await req.json()) as Body;
    if (!body?.worksheet) return new Response("Worksheet payload is required", { status: 400 });
    const profile = body.profile ?? { display_name: "Student", age_group: "11-13" };
    const notes = (body.notes || "").slice(0, 2000);

    let canvas: Obj7CanvasFields, storyIt: Obj7StoryItFields, reflection: Obj7ReflectionFields, avatarName = profile.display_name;

    if (body.worksheet.kind === "inline-form") {
      const r = fromInline(body.worksheet.data);
      canvas = r.canvas; storyIt = r.storyIt; reflection = r.reflection;
      avatarName = r.avatarName || profile.display_name;
    } else {
      const ws = await extractWorksheet({ url: body.worksheet.url, format: body.worksheet.format }, openai, body.worksheet.filename);
      const sys = `Extract OBJ 7 worksheet to JSON: {
  canvas: { intent, assumptions, audience, success },
  storyIt: { topicSentence, toneWord, atmosphereWord, fireflyPrompt },
  reflection: { observation, interpretation, didItWork },
  avatarName: string
}. Empty strings for missing. Return strict JSON only.`;
      const userMsg = ws.kind === "text" ? `Worksheet:\n${ws.text}\nNotes:\n${notes}` : `(file_id: ${ws.fileId})\nNotes:\n${notes}`;
      const ext = await openai.chat.completions.create({
        model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 1200,
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      });
      const p = JSON.parse(ext.choices[0]?.message?.content ?? "{}");
      canvas = p.canvas ?? { intent: "", assumptions: "", audience: "", success: "" };
      storyIt = p.storyIt ?? { topicSentence: "", toneWord: "", atmosphereWord: "", fireflyPrompt: "" };
      reflection = p.reflection ?? { observation: "", interpretation: "", didItWork: "" };
      avatarName = p.avatarName || profile.display_name;
    }

    const fullText = [canvas.intent, canvas.assumptions, canvas.audience, canvas.success, storyIt.topicSentence, storyIt.fireflyPrompt, reflection.observation, reflection.interpretation, reflection.didItWork, notes].join("\n");
    const verdict = await moderateContent(fullText);
    if (!verdict.allow) {
      const blocked: Obj7CanvasStageResult = { stage: "canvas", passed: false, score: 0, mode: "challenge", fieldFeedback: { intent: "", assumptions: "", audience: "", success: "" }, summary: "I can't grade this submission." };
      return jsonResponse<Obj7FinalResult>({ passed: false, composite: 0, tier: "fail", canvas: blocked, storyIt: null, createIt: null, feedbackScript: "I can't grade this — let's pick a different submission.", blockedAtStage: "canvas" });
    }

    let attemptCount = 0;
    try {
      const supabase = createAdminClient();
      const { data: prof } = await supabase.from("profiles").select("id").eq("clerk_user_id", userId).single();
      if (prof?.id) {
        const { count } = await supabase.from("objective_attempts").select("*", { count: "exact", head: true }).eq("profile_id", prof.id).eq("lms_id", "l1-07");
        attemptCount = count ?? 0;
      }
    } catch {}

    const canvasResult = await gradeCanvas(canvas, profile.age_group, attemptCount, profile.display_name);
    if (!canvasResult.passed) {
      return jsonResponse<Obj7FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ7_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: null, createIt: null, feedbackScript: canvasResult.summary, blockedAtStage: "canvas" });
    }
    const storyItResult = await gradeStoryIt(storyIt);
    if (!storyItResult.passed) {
      return jsonResponse<Obj7FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ7_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: storyItResult, createIt: null, feedbackScript: storyItResult.summary, blockedAtStage: "storyIt" });
    }
    if (!body.posterImageUrl) {
      return jsonResponse<Obj7FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ7_RUBRIC.canvas.weight + 100 * OBJ7_RUBRIC.storyIt.weight), tier: "fail", canvas: canvasResult, storyIt: storyItResult, createIt: null, feedbackScript: "Drop your Firefly poster in chat — then I'll grade it." });
    }
    const createItResult = await gradeCreateIt(body.posterImageUrl, avatarName, canvas, storyIt, reflection, profile.age_group);

    const composite = clamp(Math.round(canvasResult.score * OBJ7_RUBRIC.canvas.weight + 100 * OBJ7_RUBRIC.storyIt.weight + createItResult.score * OBJ7_RUBRIC.createIt.weight), 0, 100);
    const tier: Obj7FinalResult["tier"] = composite >= 100 ? "distinction" : composite >= 90 ? "merit" : composite >= 80 ? "pass" : "fail";
    return jsonResponse<Obj7FinalResult>({ passed: tier !== "fail", composite, tier, canvas: canvasResult, storyIt: storyItResult, createIt: createItResult, feedbackScript: pickFeedback(tier) });
  } catch (e) {
    console.error("[validate/obj7] error:", e);
    return new Response("Validation failed", { status: 500 });
  }
}

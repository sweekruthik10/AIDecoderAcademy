import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import {
  OBJ2_RUBRIC,
  type Obj2CanvasFields, type Obj2StoryItFields, type Obj2ReflectionFields,
  type Obj2CanvasStageResult, type Obj2StoryItStageResult, type Obj2CreateItStageResult, type Obj2FinalResult,
} from "@/lib/obj2Rubric";
import { moderateContent } from "@/lib/aidaSafety";
import { applyCopyMode } from "@/lib/validatorCopyMode";
import { extractWorksheet } from "@/lib/worksheetExtract";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 90;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface Body {
  worksheet:
    | { kind: "file"; url: string; format: "pdf" | "docx"; filename: string }
    | { kind: "inline-form"; data: Record<string, string | boolean>; lmsId: string };
  v1ImageUrl?: string;   // ChatGPT screenshot
  v2ImageUrl?: string;   // Gemini screenshot
  v3ImageUrl?: string;   // Claude screenshot
  notes?: string;
  profile: { display_name: string; age_group: string };
}

function jsonResponse<T>(data: T) { return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function fromInline(data: Record<string, string | boolean>) {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string).trim() : "");
  return {
    canvas: { intent: s("intent"), assumptions: s("assumptions"), audience: s("audience"), success: s("success") },
    storyIt: {
      question: s("question"),
      isOpenEnded: data["isOpenEnded"] === true,
      isPersonal: data["isPersonal"] === true,
      requiresReasoning: data["requiresReasoning"] === true,
    },
    reflection: {
      chatGptObservation: s("chatGptObservation"), chatGptInterpretation: s("chatGptInterpretation"),
      geminiObservation: s("geminiObservation"), geminiInterpretation: s("geminiInterpretation"),
      claudeObservation: s("claudeObservation"), claudeInterpretation: s("claudeInterpretation"),
      surprisingDifference: s("surprisingDifference"), agreement: s("agreement"),
      whichAiForType: s("whichAiForType"),
      correctAssumption: s("correctAssumption"), wrongAssumption: s("wrongAssumption"),
    },
  };
}

async function gradeCanvas(canvas: Obj2CanvasFields, ageGroup: string, attemptCount: number, displayName: string): Promise<Obj2CanvasStageResult> {
  const r = OBJ2_RUBRIC.canvas;
  const baseSystem = `Validator Teacher — SKEPTICAL MENTOR. Objective 2 (3 AI Brains). Threshold ${r.minPassPct}%.

🎯 INTENT — placeholder: "to see what they say". Genuine: ${r.fieldHints.intent.genuineEx}
🔍 ASSUMPTIONS — placeholder: "they'll be different". Genuine: ${r.fieldHints.assumptions.genuineEx}
👥 AUDIENCE — placeholder: "everyone". Genuine: ${r.fieldHints.audience.genuineEx}
✅ SUCCESS — placeholder: "if they're different". Genuine: ${r.fieldHints.success.genuineEx}

MODE: challenge/nudge/celebrate. Voice: skeptical mentor, no emojis, age ${ageGroup}.
Return JSON { score, mode, fieldFeedback: { intent, assumptions, audience, success }, summary }.`;
  const user = `INTENT: ${canvas.intent || "(empty)"}\nASSUMPTIONS: ${canvas.assumptions || "(empty)"}\nAUDIENCE: ${canvas.audience || "(empty)"}\nSUCCESS: ${canvas.success || "(empty)"}\nJSON only.`;
  const system = applyCopyMode(baseSystem, attemptCount, displayName);
  const c = await openai.chat.completions.create({ model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 500, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  const p = JSON.parse(c.choices[0]?.message?.content ?? "{}") as { score: number; mode: "challenge"|"nudge"|"celebrate"; fieldFeedback: { intent: string; assumptions: string; audience: string; success: string }; summary: string };
  const score = clamp(Math.round(p.score ?? 0), 0, 100);
  return { stage: "canvas", passed: score >= r.minPassPct, score, mode: p.mode ?? "challenge", fieldFeedback: p.fieldFeedback ?? { intent: "", assumptions: "", audience: "", success: "" }, summary: p.summary ?? "" };
}

async function gradeStoryIt(storyIt: Obj2StoryItFields): Promise<Obj2StoryItStageResult> {
  const questionPresent = storyIt.question.trim().length > 5;
  // LLM judge for open/personal/reasoning
  let questionPassesCriteria = false;
  if (questionPresent) {
    try {
      const c = await openai.chat.completions.create({
        model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 150,
        messages: [
          { role: "system", content: `Return JSON: { isOpenEnded: boolean, requiresReasoning: boolean, note: string }. isOpenEnded = cannot be answered by a single fact (not "When was X invented"). requiresReasoning = starts with or implies Why/How/What if/Should.` },
          { role: "user", content: storyIt.question },
        ],
      });
      const p = JSON.parse(c.choices[0]?.message?.content ?? "{}");
      questionPassesCriteria = p.isOpenEnded === true && p.requiresReasoning === true;
    } catch (err) { console.warn("[obj2] judge err:", err); }
  }
  const passed = questionPresent && questionPassesCriteria;
  const summary = !questionPresent ? OBJ2_RUBRIC.storyIt.checks.questionPresent.fail : (!questionPassesCriteria ? OBJ2_RUBRIC.storyIt.checks.questionPassesCriteria.fail : "Question passes the criteria. Ask all three AIs.");
  return { stage: "storyIt", passed, questionPresent, questionPassesCriteria, summary };
}

const createItSchema = {
  type: "object", additionalProperties: false,
  properties: {
    description: { type: "string" },
    threeDistinctLlms: { type: "boolean" },
    observationsAreLiteral: { type: "boolean" },
    interpretationsAreSeparate: { type: "boolean" },
    identifiesAgreement: { type: "boolean" },
    identifiesDivergence: { type: "boolean" },
    score: { type: "integer" },
    summary: { type: "string" },
  },
  required: ["description","threeDistinctLlms","observationsAreLiteral","interpretationsAreSeparate","identifiesAgreement","identifiesDivergence","score","summary"],
} as const;

async function gradeCreateIt(v1: string, v2: string, v3: string, storyIt: Obj2StoryItFields, reflection: Obj2ReflectionFields, ageGroup: string): Promise<Obj2CreateItStageResult> {
  const check = async (url: string) => { try { const h = await fetch(url, { method: "HEAD" }); return h.ok && (h.headers.get("content-type") ?? "").startsWith("image/"); } catch { return false; } };
  const [r1, r2, r3] = await Promise.all([check(v1), check(v2), check(v3)]);
  if (!(r1 && r2 && r3)) {
    return { stage: "createIt", score: 0, tier: "fail", allReachable: false, threeDistinctLlms: false, observationsAreLiteral: false, interpretationsAreSeparate: false, identifiesAgreement: false, identifiesDivergence: false, description: "", summary: "I can't load all three screenshots — drop them in chat in order: ChatGPT, Gemini, Claude." };
  }

  const system = `Validator Teacher — SKEPTICAL MENTOR. Objective 2 — grade 3 LLM screenshots + the student's CT-Skill-2 analysis.

Their question: ${storyIt.question || "(none)"}

Reflection:
- ChatGPT OBS: ${reflection.chatGptObservation || "(empty)"}
- ChatGPT INT: ${reflection.chatGptInterpretation || "(empty)"}
- Gemini OBS: ${reflection.geminiObservation || "(empty)"}
- Gemini INT: ${reflection.geminiInterpretation || "(empty)"}
- Claude OBS: ${reflection.claudeObservation || "(empty)"}
- Claude INT: ${reflection.claudeInterpretation || "(empty)"}
- Surprising difference: ${reflection.surprisingDifference || "(empty)"}
- Agreement: ${reflection.agreement || "(empty)"}
- Which AI for this type: ${reflection.whichAiForType || "(empty)"}

DESCRIBE each screenshot in one short sentence (recognise which LLM by UI).
RUN checks:
- threeDistinctLlms          : are the 3 screenshots from 3 DIFFERENT LLMs (ChatGPT chat.openai.com, Google Gemini gemini.google.com, Claude claude.ai), NOT 3 from the same?
- observationsAreLiteral     : are the 3 OBSERVATION fields describing literal screen content (length, structure, words) — not conclusions?
- interpretationsAreSeparate : are interpretations clearly drawing conclusions, distinct from observations?
- identifiesAgreement        : does the agreement field name ONE specific thing all 3 said (even if differently)?
- identifiesDivergence       : does the surprisingDifference field name a STRUCTURAL reasoning difference (not just tone/length)?

SCORE:
- 80 PASS: threeDistinctLlms + observationsAreLiteral + interpretationsAreSeparate.
- 90 MERIT: PASS + identifiesAgreement + identifiesDivergence.
- 100 DISTINCTION: MERIT + whichAiForType is specific (names AI + reason).
- <80 FAIL: same LLM 3× OR observations mixed with conclusions.

Voice: skeptical mentor, age ${ageGroup}, one-line summary.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_schema", json_schema: { name: "obj2_create_grade", schema: createItSchema, strict: true } },
    temperature: 0.2, max_tokens: 1000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: [
        { type: "text", text: "Grade against the rubric. JSON only." },
        { type: "text", text: "CHATGPT:" }, { type: "image_url", image_url: { url: v1, detail: "high" } },
        { type: "text", text: "GEMINI:" }, { type: "image_url", image_url: { url: v2, detail: "high" } },
        { type: "text", text: "CLAUDE:" }, { type: "image_url", image_url: { url: v3, detail: "high" } },
      ]},
    ],
  });
  const p = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    description: string; threeDistinctLlms: boolean; observationsAreLiteral: boolean;
    interpretationsAreSeparate: boolean; identifiesAgreement: boolean; identifiesDivergence: boolean;
    score: number; summary: string;
  };
  const score = clamp(Math.round(p.score), 0, 100);
  const tier: Obj2CreateItStageResult["tier"] = score >= 100 ? "distinction" : score >= 90 ? "merit" : score >= 80 ? "pass" : "fail";
  return { stage: "createIt", score, tier, allReachable: true, threeDistinctLlms: p.threeDistinctLlms, observationsAreLiteral: p.observationsAreLiteral, interpretationsAreSeparate: p.interpretationsAreSeparate, identifiesAgreement: p.identifiesAgreement, identifiesDivergence: p.identifiesDivergence, description: p.description, summary: p.summary };
}

function pickFeedback(t: Obj2FinalResult["tier"]): string {
  switch (t) {
    case "distinction": return OBJ2_RUBRIC.feedbackScripts.distinction;
    case "merit":       return OBJ2_RUBRIC.feedbackScripts.merit;
    case "pass":        return OBJ2_RUBRIC.feedbackScripts.pass;
    case "fail":        return "Look at the three responses again — what do they each emphasise?";
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

    let canvas: Obj2CanvasFields, storyIt: Obj2StoryItFields, reflection: Obj2ReflectionFields;
    if (body.worksheet.kind === "inline-form") {
      const r = fromInline(body.worksheet.data);
      canvas = r.canvas; storyIt = r.storyIt; reflection = r.reflection;
    } else {
      const ws = await extractWorksheet({ url: body.worksheet.url, format: body.worksheet.format }, openai, body.worksheet.filename);
      const sys = `Extract OBJ 2 worksheet to JSON: {
  canvas: { intent, assumptions, audience, success },
  storyIt: { question: string, isOpenEnded: boolean, isPersonal: boolean, requiresReasoning: boolean },
  reflection: {
    chatGptObservation, chatGptInterpretation,
    geminiObservation, geminiInterpretation,
    claudeObservation, claudeInterpretation,
    surprisingDifference, agreement, whichAiForType,
    correctAssumption, wrongAssumption
  }
}. Empty strings/false for missing. JSON only.`;
      const userMsg = ws.kind === "text" ? `Worksheet:\n${ws.text}\nNotes:\n${notes}` : `(file_id: ${ws.fileId})\nNotes:\n${notes}`;
      const ext = await openai.chat.completions.create({ model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 1500, messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }] });
      const p = JSON.parse(ext.choices[0]?.message?.content ?? "{}");
      canvas = p.canvas ?? { intent: "", assumptions: "", audience: "", success: "" };
      storyIt = p.storyIt ?? { question: "", isOpenEnded: false, isPersonal: false, requiresReasoning: false };
      reflection = p.reflection ?? { chatGptObservation: "", chatGptInterpretation: "", geminiObservation: "", geminiInterpretation: "", claudeObservation: "", claudeInterpretation: "", surprisingDifference: "", agreement: "", whichAiForType: "", correctAssumption: "", wrongAssumption: "" };
    }

    const fullText = [canvas.intent, canvas.assumptions, canvas.audience, canvas.success, storyIt.question, reflection.chatGptObservation, reflection.chatGptInterpretation, reflection.geminiObservation, reflection.geminiInterpretation, reflection.claudeObservation, reflection.claudeInterpretation, reflection.surprisingDifference, reflection.agreement, reflection.whichAiForType, notes].join("\n");
    const verdict = await moderateContent(fullText);
    if (!verdict.allow) {
      const blocked: Obj2CanvasStageResult = { stage: "canvas", passed: false, score: 0, mode: "challenge", fieldFeedback: { intent: "", assumptions: "", audience: "", success: "" }, summary: "I can't grade this submission." };
      return jsonResponse<Obj2FinalResult>({ passed: false, composite: 0, tier: "fail", canvas: blocked, storyIt: null, createIt: null, feedbackScript: "I can't grade this — let's pick a different submission.", blockedAtStage: "canvas" });
    }

    let attemptCount = 0;
    try {
      const supabase = createAdminClient();
      const { data: prof } = await supabase.from("profiles").select("id").eq("clerk_user_id", userId).single();
      if (prof?.id) { const { count } = await supabase.from("objective_attempts").select("*", { count: "exact", head: true }).eq("profile_id", prof.id).eq("lms_id", "l1-02"); attemptCount = count ?? 0; }
    } catch {}

    const canvasResult = await gradeCanvas(canvas, profile.age_group, attemptCount, profile.display_name);
    if (!canvasResult.passed) return jsonResponse<Obj2FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ2_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: null, createIt: null, feedbackScript: canvasResult.summary, blockedAtStage: "canvas" });

    const storyItResult = await gradeStoryIt(storyIt);
    if (!storyItResult.passed) return jsonResponse<Obj2FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ2_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: storyItResult, createIt: null, feedbackScript: storyItResult.summary, blockedAtStage: "storyIt" });

    if (!body.v1ImageUrl || !body.v2ImageUrl || !body.v3ImageUrl) return jsonResponse<Obj2FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ2_RUBRIC.canvas.weight + 100 * OBJ2_RUBRIC.storyIt.weight), tier: "fail", canvas: canvasResult, storyIt: storyItResult, createIt: null, feedbackScript: "I need all 3 screenshots — ChatGPT, Gemini, Claude — dropped in chat in that order." });

    const createItResult = await gradeCreateIt(body.v1ImageUrl, body.v2ImageUrl, body.v3ImageUrl, storyIt, reflection, profile.age_group);
    const composite = clamp(Math.round(canvasResult.score * OBJ2_RUBRIC.canvas.weight + 100 * OBJ2_RUBRIC.storyIt.weight + createItResult.score * OBJ2_RUBRIC.createIt.weight), 0, 100);
    const tier: Obj2FinalResult["tier"] = composite >= 100 ? "distinction" : composite >= 90 ? "merit" : composite >= 80 ? "pass" : "fail";
    return jsonResponse<Obj2FinalResult>({ passed: tier !== "fail", composite, tier, canvas: canvasResult, storyIt: storyItResult, createIt: createItResult, feedbackScript: pickFeedback(tier) });
  } catch (e) {
    console.error("[validate/obj2] error:", e);
    return new Response("Validation failed", { status: 500 });
  }
}

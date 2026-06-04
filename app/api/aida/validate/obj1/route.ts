import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import {
  OBJ1_RUBRIC,
  type Obj1CanvasFields, type Obj1StoryItFields, type Obj1CreateItInput,
  type Obj1CanvasStageResult, type Obj1StoryItStageResult, type Obj1CreateItStageResult, type Obj1FinalResult,
} from "@/lib/obj1Rubric";
import { moderateContent } from "@/lib/aidaSafety";
import { applyCopyMode } from "@/lib/validatorCopyMode";
import { extractWorksheet } from "@/lib/worksheetExtract";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface Body {
  worksheet:
    | { kind: "file"; url: string; format: "pdf" | "docx"; filename: string }
    | { kind: "inline-form"; data: Record<string, string | boolean>; lmsId: string };
  notes?: string;
  profile: { display_name: string; age_group: string };
}

function jsonResponse<T>(data: T) { return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function fromInline(data: Record<string, string | boolean>) {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string).trim() : "");
  return {
    canvas: { intent: s("intent"), assumptions: s("assumptions"), audience: s("audience"), success: s("success") },
    storyIt: { q1WhoAreYou: s("q1WhoAreYou"), q2WhatYouCare: s("q2WhatYouCare"), q3WhatDrives: s("q3WhatDrives"), q4WhereGoing: s("q4WhereGoing") },
    createIt: {
      finalIntro: s("finalIntro"), avatarName: s("avatarName"), avatarNameReason: s("avatarNameReason"),
      correctAssumption: s("correctAssumption"), wrongAssumption: s("wrongAssumption"),
      observation: s("observation"), interpretation: s("interpretation"),
    },
  };
}

async function gradeCanvas(canvas: Obj1CanvasFields, ageGroup: string, attemptCount: number, displayName: string): Promise<Obj1CanvasStageResult> {
  const r = OBJ1_RUBRIC.canvas;
  const baseSystem = `
Validator Teacher at AI Decoder Academy — SKEPTICAL MENTOR.
Objective 1 (Netflix Documentary Intro + Avatar Name — ChatGPT, read aloud in class). Threshold ${r.minPassPct}%.

Score four fields:
🎯 INTENT — placeholder: "to write a good intro". Genuine: names a specific reaction in the room. Example: "${r.fieldHints.intent.genuineEx}"
🔍 ASSUMPTIONS — placeholder: "it'll be cool". Genuine: names specific bets about how ChatGPT will interpret. Example: "${r.fieldHints.assumptions.genuineEx}"
👥 AUDIENCE — placeholder: "my class". Genuine: specific people in the room. Example: "${r.fieldHints.audience.genuineEx}"
✅ SUCCESS — placeholder: "if it sounds nice". Genuine: observable reaction. Example: "${r.fieldHints.success.genuineEx}"

MODE: challenge / nudge / celebrate. Score = avg. Voice: skeptical mentor, no emojis, age ${ageGroup}.
Return JSON { score, mode, fieldFeedback: { intent, assumptions, audience, success }, summary }.`.trim();
  const user = `INTENT: ${canvas.intent || "(empty)"}\nASSUMPTIONS: ${canvas.assumptions || "(empty)"}\nAUDIENCE: ${canvas.audience || "(empty)"}\nSUCCESS: ${canvas.success || "(empty)"}\nJSON only.`;
  const system = applyCopyMode(baseSystem, attemptCount, displayName);
  const c = await openai.chat.completions.create({ model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 500, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  const p = JSON.parse(c.choices[0]?.message?.content ?? "{}") as { score: number; mode: "challenge"|"nudge"|"celebrate"; fieldFeedback: { intent: string; assumptions: string; audience: string; success: string }; summary: string };
  const score = clamp(Math.round(p.score ?? 0), 0, 100);
  return { stage: "canvas", passed: score >= r.minPassPct, score, mode: p.mode ?? "challenge", fieldFeedback: p.fieldFeedback ?? { intent: "", assumptions: "", audience: "", success: "" }, summary: p.summary ?? "" };
}

async function gradeStoryIt(storyIt: Obj1StoryItFields): Promise<Obj1StoryItStageResult> {
  const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const minWords = 20;  // ~2-3 sentences
  const allFourAnswersFilled = wc(storyIt.q1WhoAreYou) >= minWords && wc(storyIt.q2WhatYouCare) >= minWords && wc(storyIt.q3WhatDrives) >= minWords && wc(storyIt.q4WhereGoing) >= minWords;

  // LLM judge for specificity. If the judge call fails, default to true when
  // all four answers are filled (give benefit of the doubt rather than a
  // silent false-fail that blocks the student for no reason).
  let answersAreSpecific = allFourAnswersFilled; // optimistic default on error
  try {
    const c = await openai.chat.completions.create({
      model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 200,
      messages: [
        { role: "system", content: `Return JSON: { areSpecific: boolean, note: string }. The four answers are specific if they contain CONCRETE details only this person could have given (specific hobbies, named topics, particular experiences). They are NOT specific if they read as generic ("I like sports", "I want to be successful", "I care about people").` },
        { role: "user", content: `Q1 Who are you: ${storyIt.q1WhoAreYou}\n\nQ2 What you care about: ${storyIt.q2WhatYouCare}\n\nQ3 What drives you: ${storyIt.q3WhatDrives}\n\nQ4 Where going: ${storyIt.q4WhereGoing}` },
      ],
    });
    const p = JSON.parse(c.choices[0]?.message?.content ?? "{}");
    answersAreSpecific = p.areSpecific === true;
  } catch (err) { console.warn("[obj1] judge err — defaulting to filled check:", err); }

  const passed = allFourAnswersFilled && answersAreSpecific;
  const summary = !allFourAnswersFilled ? OBJ1_RUBRIC.storyIt.checks.allFourFilled.fail : (!answersAreSpecific ? OBJ1_RUBRIC.storyIt.checks.answersAreSpecific.fail : "Four answers complete and specific. Build your ChatGPT prompt.");
  return { stage: "storyIt", passed, allFourAnswersFilled, answersAreSpecific, summary };
}

const createItSchema = {
  type: "object", additionalProperties: false,
  properties: {
    finalIntroPresent: { type: "boolean" },
    isExactlyTwoSentences: { type: "boolean" },
    feelsCinematic: { type: "boolean" },
    isPersonal: { type: "boolean" },
    avatarNameIntentional: { type: "boolean" },
    reflectionShowsSurprise: { type: "boolean" },
    identifiesIteration: { type: "boolean" },
    score: { type: "integer" },
    summary: { type: "string" },
  },
  required: ["finalIntroPresent","isExactlyTwoSentences","feelsCinematic","isPersonal","avatarNameIntentional","reflectionShowsSurprise","identifiesIteration","score","summary"],
} as const;

async function gradeCreateIt(create: Obj1CreateItInput, storyIt: Obj1StoryItFields, ageGroup: string): Promise<Obj1CreateItStageResult> {
  const system = `
Validator Teacher at AI Decoder Academy — SKEPTICAL MENTOR.
Objective 1 — Netflix Documentary Intro. Grade the FINAL intro produced by ChatGPT.

Student's Story-It answers (the source material the intro should reflect):
- Q1 Who are you: ${storyIt.q1WhoAreYou || "(empty)"}
- Q2 What you care about: ${storyIt.q2WhatYouCare || "(empty)"}
- Q3 What drives you: ${storyIt.q3WhatDrives || "(empty)"}
- Q4 Where going: ${storyIt.q4WhereGoing || "(empty)"}

Final ChatGPT-generated intro:
"""
${create.finalIntro || "(empty)"}
"""

Avatar Name: ${create.avatarName || "(empty)"}
Avatar reason: ${create.avatarNameReason || "(empty)"}

Reflection:
- Assumption that was CORRECT: ${create.correctAssumption || "(empty)"}
- Assumption that was WRONG / surprised them: ${create.wrongAssumption || "(empty)"}
- Observation about the intro: ${create.observation || "(empty)"}
- Interpretation: ${create.interpretation || "(empty)"}

Run checks:
- finalIntroPresent     : is there a non-empty final intro?
- isExactlyTwoSentences : is the intro EXACTLY 2 sentences (Netflix narrator style)?
- feelsCinematic        : does it read like a Netflix narrator — dramatic, present-tense, third-person, intriguing?
- isPersonal            : does it contain SPECIFIC details traceable to the student's Q1-Q4 answers (not generic)?
- avatarNameIntentional : is the Avatar Name more than just a first name (has a creative modifier) AND has a stated reason?
- reflectionShowsSurprise : in the WRONG-assumption field, does the student name something ChatGPT did that they did NOT predict?
- identifiesIteration   : does ANY field describe a refinement (e.g. "I made answer 2 more specific and regenerated")?

SCORE:
- 80 PASS: finalIntroPresent + isExactlyTwoSentences + avatarNameIntentional.
- 90 MERIT: all PASS + isPersonal + reflectionShowsSurprise.
- 100 DISTINCTION: MERIT + identifiesIteration.
- <80 FAIL: missing finalIntro OR not 2 sentences OR avatar name is just a first name.

Voice: skeptical mentor, age ${ageGroup}, one-line summary.`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_schema", json_schema: { name: "obj1_create_grade", schema: createItSchema, strict: true } },
    temperature: 0.2, max_tokens: 700,
    messages: [{ role: "system", content: system }, { role: "user", content: "Grade. JSON only." }],
  });
  const p = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    finalIntroPresent: boolean; isExactlyTwoSentences: boolean; feelsCinematic: boolean; isPersonal: boolean;
    avatarNameIntentional: boolean; reflectionShowsSurprise: boolean; identifiesIteration: boolean;
    score: number; summary: string;
  };
  const score = clamp(Math.round(p.score), 0, 100);
  const tier: Obj1CreateItStageResult["tier"] = score >= 100 ? "distinction" : score >= 90 ? "merit" : score >= 80 ? "pass" : "fail";
  return { stage: "createIt", score, tier, finalIntroPresent: p.finalIntroPresent, isExactlyTwoSentences: p.isExactlyTwoSentences, feelsCinematic: p.feelsCinematic, isPersonal: p.isPersonal, avatarNameIntentional: p.avatarNameIntentional, reflectionShowsSurprise: p.reflectionShowsSurprise, identifiesIteration: p.identifiesIteration, summary: p.summary };
}

function pickFeedback(t: Obj1FinalResult["tier"]): string {
  switch (t) {
    case "distinction": return OBJ1_RUBRIC.feedbackScripts.distinction;
    case "merit":       return OBJ1_RUBRIC.feedbackScripts.merit;
    case "pass":        return OBJ1_RUBRIC.feedbackScripts.pass;
    case "fail":        return "Read your intro out loud. Would the room react — or stay silent?";
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

    let canvas: Obj1CanvasFields, storyIt: Obj1StoryItFields, create: Obj1CreateItInput;
    if (body.worksheet.kind === "inline-form") {
      const r = fromInline(body.worksheet.data);
      canvas = r.canvas; storyIt = r.storyIt; create = r.createIt;
    } else {
      const ws = await extractWorksheet({ url: body.worksheet.url, format: body.worksheet.format }, openai, body.worksheet.filename);
      const sys = `Extract OBJ 1 worksheet to JSON: {
  canvas: { intent, assumptions, audience, success },
  storyIt: { q1WhoAreYou, q2WhatYouCare, q3WhatDrives, q4WhereGoing },
  createIt: { finalIntro, avatarName, avatarNameReason, correctAssumption, wrongAssumption, observation, interpretation }
}. Empty strings for missing. JSON only.`;
      const userMsg = ws.kind === "text" ? `Worksheet:\n${ws.text}\nNotes:\n${notes}` : `(file_id: ${ws.fileId})\nNotes:\n${notes}`;
      const ext = await openai.chat.completions.create({ model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 1500, messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }] });
      const p = JSON.parse(ext.choices[0]?.message?.content ?? "{}");
      canvas = p.canvas ?? { intent: "", assumptions: "", audience: "", success: "" };
      storyIt = p.storyIt ?? { q1WhoAreYou: "", q2WhatYouCare: "", q3WhatDrives: "", q4WhereGoing: "" };
      create = p.createIt ?? { finalIntro: "", avatarName: "", avatarNameReason: "", correctAssumption: "", wrongAssumption: "", observation: "", interpretation: "" };
    }

    const fullText = [canvas.intent, canvas.assumptions, canvas.audience, canvas.success, storyIt.q1WhoAreYou, storyIt.q2WhatYouCare, storyIt.q3WhatDrives, storyIt.q4WhereGoing, create.finalIntro, create.avatarName, create.avatarNameReason, create.correctAssumption, create.wrongAssumption, create.observation, create.interpretation, notes].join("\n");
    const verdict = await moderateContent(fullText);
    if (!verdict.allow) {
      const blocked: Obj1CanvasStageResult = { stage: "canvas", passed: false, score: 0, mode: "challenge", fieldFeedback: { intent: "", assumptions: "", audience: "", success: "" }, summary: "I can't grade this submission." };
      return jsonResponse<Obj1FinalResult>({ passed: false, composite: 0, tier: "fail", canvas: blocked, storyIt: null, createIt: null, feedbackScript: "I can't grade this — let's pick a different submission.", blockedAtStage: "canvas" });
    }

    let attemptCount = 0;
    try {
      const supabase = createAdminClient();
      const { data: prof } = await supabase.from("profiles").select("id").eq("clerk_user_id", userId).single();
      if (prof?.id) {
        const { count } = await supabase.from("objective_attempts").select("*", { count: "exact", head: true }).eq("profile_id", prof.id).eq("lms_id", "l1-01");
        attemptCount = count ?? 0;
      }
    } catch {}

    const canvasResult = await gradeCanvas(canvas, profile.age_group, attemptCount, profile.display_name);
    if (!canvasResult.passed) return jsonResponse<Obj1FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ1_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: null, createIt: null, feedbackScript: canvasResult.summary, blockedAtStage: "canvas" });

    const storyItResult = await gradeStoryIt(storyIt);
    if (!storyItResult.passed) return jsonResponse<Obj1FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ1_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: storyItResult, createIt: null, feedbackScript: storyItResult.summary, blockedAtStage: "storyIt" });

    const createItResult = await gradeCreateIt(create, storyIt, profile.age_group);
    const composite = clamp(Math.round(canvasResult.score * OBJ1_RUBRIC.canvas.weight + 100 * OBJ1_RUBRIC.storyIt.weight + createItResult.score * OBJ1_RUBRIC.createIt.weight), 0, 100);
    const tier: Obj1FinalResult["tier"] = composite >= 100 ? "distinction" : composite >= 90 ? "merit" : composite >= 80 ? "pass" : "fail";
    return jsonResponse<Obj1FinalResult>({ passed: tier !== "fail", composite, tier, canvas: canvasResult, storyIt: storyItResult, createIt: createItResult, feedbackScript: pickFeedback(tier) });
  } catch (e) {
    console.error("[validate/obj1] error:", e);
    return new Response("Validation failed", { status: 500 });
  }
}

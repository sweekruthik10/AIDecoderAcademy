import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import {
  OBJ8_RUBRIC,
  type Obj8CanvasFields, type Obj8StoryItFields, type Obj8BlindEvalFields, type Obj8ReflectionFields,
  type Obj8CanvasStageResult, type Obj8StoryItStageResult, type Obj8CreateItStageResult, type Obj8FinalResult,
} from "@/lib/obj8Rubric";
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
  voiceAUrl?: string;
  voiceBUrl?: string;
  voiceCUrl?: string;
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
    storyIt: {
      topic: s("topic"), sentence1: s("sentence1"), sentence2: s("sentence2"), sentence3: s("sentence3"),
      voice1Name: s("voice1Name"), voice2Name: s("voice2Name"), voice3Name: s("voice3Name"),
    },
    blindEval: {
      voiceAObservation: s("voiceAObservation"), voiceAInterpretation: s("voiceAInterpretation"),
      voiceBObservation: s("voiceBObservation"), voiceBInterpretation: s("voiceBInterpretation"),
      voiceCObservation: s("voiceCObservation"), voiceCInterpretation: s("voiceCInterpretation"),
    },
    reflection: {
      voiceAReveal: s("voiceAReveal"), voiceBReveal: s("voiceBReveal"), voiceCReveal: s("voiceCReveal"),
      whereWrong: s("whereWrong"), mostInterestingMismatch: s("mostInterestingMismatch"),
    },
  };
}

async function gradeCanvas(canvas: Obj8CanvasFields, ageGroup: string, attemptCount: number, displayName: string): Promise<Obj8CanvasStageResult> {
  const r = OBJ8_RUBRIC.canvas;
  const baseSystem = `
Validator at AI Decoder Academy — SKEPTICAL MENTOR. OBJ 8 (Voice Direction Lab — ElevenLabs blind eval). Threshold ${r.minPassPct}%.
🎯 INTENT — placeholder: "to hear AI voices". Genuine: specific analytical question about listening. Ex: "${r.fieldHints.intent.genuineEx}"
🔍 ASSUMPTIONS — placeholder: "I'll get it right". Genuine: specific bets about auditory perception. Ex: "${r.fieldHints.assumptions.genuineEx}"
👥 AUDIENCE — placeholder: "everyone". Genuine: specific listening perspective borrowed. Ex: "${r.fieldHints.audience.genuineEx}"
✅ SUCCESS — placeholder: "if I get it right". Genuine: observable accurate auditory observation. Ex: "${r.fieldHints.success.genuineEx}"
MODE: challenge/nudge/celebrate. Score=avg. Age ${ageGroup}. No emojis.
Return JSON { score, mode, fieldFeedback: { intent, assumptions, audience, success }, summary }.`.trim();
  const user = `INTENT: ${canvas.intent || "(empty)"}\nASSUMPTIONS: ${canvas.assumptions || "(empty)"}\nAUDIENCE: ${canvas.audience || "(empty)"}\nSUCCESS: ${canvas.success || "(empty)"}\nJSON only.`;
  const system = applyCopyMode(baseSystem, attemptCount, displayName);
  const c = await openai.chat.completions.create({ model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 500, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  const p = JSON.parse(c.choices[0]?.message?.content ?? "{}") as { score: number; mode: "challenge"|"nudge"|"celebrate"; fieldFeedback: { intent: string; assumptions: string; audience: string; success: string }; summary: string };
  const score = clamp(Math.round(p.score ?? 0), 0, 100);
  return { stage: "canvas", passed: score >= r.minPassPct, score, mode: p.mode ?? "challenge", fieldFeedback: p.fieldFeedback ?? { intent: "", assumptions: "", audience: "", success: "" }, summary: p.summary ?? "" };
}

async function gradeStoryIt(storyIt: Obj8StoryItFields): Promise<Obj8StoryItStageResult> {
  const threeSentencesComplete = [storyIt.sentence1, storyIt.sentence2, storyIt.sentence3].every(s => (s || "").trim().length >= 5);
  const threeVoicesNamed = [storyIt.voice1Name, storyIt.voice2Name, storyIt.voice3Name].every(v => (v || "").trim().length > 0);

  const passed = threeSentencesComplete && threeVoicesNamed;
  const summary =
    !threeSentencesComplete ? OBJ8_RUBRIC.storyIt.checks.threeSentencesComplete.fail :
    !threeVoicesNamed       ? OBJ8_RUBRIC.storyIt.checks.threeVoicesNamed.fail :
    "Story It complete — 3 complete sentences, 3 voices named.";
  return { stage: "storyIt", passed, threeSentencesComplete, threeVoicesNamed, summary };
}

const createItSchema = {
  type: "object", additionalProperties: false,
  properties: {
    threeAudioPresent: { type: "boolean" },
    observationsAreLiteral: { type: "boolean" },
    interpretationsAreDistinct: { type: "boolean" },
    identifiesMismatch: { type: "boolean" },
    score: { type: "integer" },
    summary: { type: "string" },
  },
  required: ["threeAudioPresent","observationsAreLiteral","interpretationsAreDistinct","identifiesMismatch","score","summary"],
} as const;

async function gradeCreateIt(
  voiceAUrl: string | undefined, voiceBUrl: string | undefined, voiceCUrl: string | undefined,
  blindEval: Obj8BlindEvalFields, reflection: Obj8ReflectionFields, ageGroup: string,
): Promise<Obj8CreateItStageResult> {
  const system = `
Validator at AI Decoder Academy — SKEPTICAL MENTOR. OBJ 8 Create It grading.
Audio files:
  Voice A: ${voiceAUrl ? "YES" : "NO"}
  Voice B: ${voiceBUrl ? "YES" : "NO"}
  Voice C: ${voiceCUrl ? "YES" : "NO"}

Blind evaluation:
  Voice A — observation: ${blindEval.voiceAObservation || "(empty)"} | interpretation: ${blindEval.voiceAInterpretation || "(empty)"}
  Voice B — observation: ${blindEval.voiceBObservation || "(empty)"} | interpretation: ${blindEval.voiceBInterpretation || "(empty)"}
  Voice C — observation: ${blindEval.voiceCObservation || "(empty)"} | interpretation: ${blindEval.voiceCInterpretation || "(empty)"}

Reveal:
  Voice A was: ${reflection.voiceAReveal || "(unknown)"}
  Voice B was: ${reflection.voiceBReveal || "(unknown)"}
  Voice C was: ${reflection.voiceCReveal || "(unknown)"}
  Where wrong: ${reflection.whereWrong || "(empty)"}
  Most interesting mismatch: ${reflection.mostInterestingMismatch || "(empty)"}

Checks:
- threeAudioPresent: are all 3 audio URLs provided?
- observationsAreLiteral: do the OBSERVATION fields describe literal auditory facts (pace, tone, warmth, pitch) — NOT personality conclusions?
- interpretationsAreDistinct: are the three INTERPRETATIONS clearly different from each other AND from the observation fields?
- identifiesMismatch: does "where wrong" or "most interesting mismatch" name a SPECIFIC auditory cue that misled them?

SCORE:
- 80 PASS: threeAudioPresent + observationsAreLiteral + interpretationsAreDistinct.
- 90 MERIT: all PASS + reflects on where wrong.
- 100 DISTINCTION: MERIT + identifiesMismatch names a specific auditory cue.
- <80 FAIL: threeAudioPresent false OR observationsAreLiteral false OR interpretationsAreDistinct false.

Age ${ageGroup}. JSON only.`.trim();
  const c = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_schema", json_schema: { name: "obj8_create_grade", schema: createItSchema, strict: true } },
    temperature: 0.2, max_tokens: 600,
    messages: [{ role: "system", content: system }, { role: "user", content: "Grade. JSON only." }],
  });
  const p = JSON.parse(c.choices[0]?.message?.content ?? "{}") as { threeAudioPresent: boolean; observationsAreLiteral: boolean; interpretationsAreDistinct: boolean; identifiesMismatch: boolean; score: number; summary: string };
  const score = clamp(Math.round(p.score), 0, 100);
  const tier: Obj8CreateItStageResult["tier"] = score >= 100 ? "distinction" : score >= 90 ? "merit" : score >= 80 ? "pass" : "fail";
  return { stage: "createIt", score, tier, threeAudioFilesPresent: p.threeAudioPresent, observationsAreLiteral: p.observationsAreLiteral, interpretationsAreDistinct: p.interpretationsAreDistinct, identifiesMismatch: p.identifiesMismatch, summary: p.summary };
}

function pickFeedback(t: Obj8FinalResult["tier"]): string {
  switch (t) {
    case "distinction": return OBJ8_RUBRIC.feedbackScripts.distinction;
    case "merit":       return OBJ8_RUBRIC.feedbackScripts.merit;
    case "pass":        return OBJ8_RUBRIC.feedbackScripts.pass;
    case "fail":        return "Listen again — blind. This time, write what you LITERALLY hear before you decide what it means. Those are different skills.";
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

    let canvas: Obj8CanvasFields, storyIt: Obj8StoryItFields, blindEval: Obj8BlindEvalFields, reflection: Obj8ReflectionFields;
    if (body.worksheet.kind === "inline-form") {
      const r = fromInline(body.worksheet.data);
      canvas = r.canvas; storyIt = r.storyIt; blindEval = r.blindEval; reflection = r.reflection;
    } else {
      const ws = await extractWorksheet({ url: body.worksheet.url, format: body.worksheet.format }, openai, body.worksheet.filename);
      const sys = `Extract OBJ 8 worksheet to JSON: {
  canvas: { intent, assumptions, audience, success },
  storyIt: { topic, sentence1, sentence2, sentence3, voice1Name, voice2Name, voice3Name },
  blindEval: { voiceAObservation, voiceAInterpretation, voiceBObservation, voiceBInterpretation, voiceCObservation, voiceCInterpretation },
  reflection: { voiceAReveal, voiceBReveal, voiceCReveal, whereWrong, mostInterestingMismatch }
}. Empty strings for missing. Return strict JSON only.`;
      const userMsg = ws.kind === "text" ? `Worksheet:\n${ws.text}\nNotes:\n${notes}` : `(file_id: ${ws.fileId})\nNotes:\n${notes}`;
      const ext = await openai.chat.completions.create({ model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 1200, messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }] });
      const p = JSON.parse(ext.choices[0]?.message?.content ?? "{}");
      canvas = p.canvas ?? { intent: "", assumptions: "", audience: "", success: "" };
      storyIt = p.storyIt ?? { topic: "", sentence1: "", sentence2: "", sentence3: "", voice1Name: "", voice2Name: "", voice3Name: "" };
      blindEval = p.blindEval ?? { voiceAObservation: "", voiceAInterpretation: "", voiceBObservation: "", voiceBInterpretation: "", voiceCObservation: "", voiceCInterpretation: "" };
      reflection = p.reflection ?? { voiceAReveal: "", voiceBReveal: "", voiceCReveal: "", whereWrong: "", mostInterestingMismatch: "" };
    }

    const fullText = [canvas.intent, canvas.assumptions, canvas.audience, canvas.success, storyIt.topic, storyIt.sentence1, storyIt.sentence2, storyIt.sentence3, blindEval.voiceAObservation, blindEval.voiceAInterpretation, blindEval.voiceBObservation, blindEval.voiceBInterpretation, blindEval.voiceCObservation, blindEval.voiceCInterpretation, reflection.whereWrong, reflection.mostInterestingMismatch, notes].join("\n");
    const verdict = await moderateContent(fullText);
    if (!verdict.allow) {
      const blocked: Obj8CanvasStageResult = { stage: "canvas", passed: false, score: 0, mode: "challenge", fieldFeedback: { intent: "", assumptions: "", audience: "", success: "" }, summary: "I can't grade this submission." };
      return jsonResponse<Obj8FinalResult>({ passed: false, composite: 0, tier: "fail", canvas: blocked, storyIt: null, createIt: null, feedbackScript: "I can't grade this — let's pick a different submission.", blockedAtStage: "canvas" });
    }

    let attemptCount = 0;
    try {
      const supabase = createAdminClient();
      const { data: prof } = await supabase.from("profiles").select("id").eq("clerk_user_id", userId).single();
      if (prof?.id) { const { count } = await supabase.from("objective_attempts").select("*", { count: "exact", head: true }).eq("profile_id", prof.id).eq("lms_id", "l1-08"); attemptCount = count ?? 0; }
    } catch {}

    const canvasResult = await gradeCanvas(canvas, profile.age_group, attemptCount, profile.display_name);
    if (!canvasResult.passed) return jsonResponse<Obj8FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ8_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: null, createIt: null, feedbackScript: canvasResult.summary, blockedAtStage: "canvas" });

    const storyItResult = await gradeStoryIt(storyIt);
    if (!storyItResult.passed) return jsonResponse<Obj8FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ8_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: storyItResult, createIt: null, feedbackScript: storyItResult.summary, blockedAtStage: "storyIt" });

    if (!body.voiceAUrl || !body.voiceBUrl || !body.voiceCUrl) return jsonResponse<Obj8FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ8_RUBRIC.canvas.weight + 100 * OBJ8_RUBRIC.storyIt.weight), tier: "fail", canvas: canvasResult, storyIt: storyItResult, createIt: null, feedbackScript: "I need all three audio files — Voice A, B, C. Drop them labelled in chat, then come back." });

    const createItResult = await gradeCreateIt(body.voiceAUrl, body.voiceBUrl, body.voiceCUrl, blindEval, reflection, profile.age_group);
    const composite = clamp(Math.round(canvasResult.score * OBJ8_RUBRIC.canvas.weight + 100 * OBJ8_RUBRIC.storyIt.weight + createItResult.score * OBJ8_RUBRIC.createIt.weight), 0, 100);
    const tier: Obj8FinalResult["tier"] = composite >= 100 ? "distinction" : composite >= 90 ? "merit" : composite >= 80 ? "pass" : "fail";
    return jsonResponse<Obj8FinalResult>({ passed: tier !== "fail", composite, tier, canvas: canvasResult, storyIt: storyItResult, createIt: createItResult, feedbackScript: pickFeedback(tier) });
  } catch (e) {
    console.error("[validate/obj8] error:", e);
    return new Response("Validation failed", { status: 500 });
  }
}

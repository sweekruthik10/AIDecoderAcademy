import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import {
  OBJ9_RUBRIC,
  type Obj9CanvasFields, type Obj9StoryItFields, type Obj9ReflectionFields,
  type Obj9CanvasStageResult, type Obj9StoryItStageResult, type Obj9CreateItStageResult, type Obj9FinalResult,
} from "@/lib/obj9Rubric";
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
  v1ImageUrl?: string; v2ImageUrl?: string; v3ImageUrl?: string;
  notes?: string;
  profile: { display_name: string; age_group: string };
}

function jsonResponse<T>(data: T) { return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function fromInline(data: Record<string, string | boolean>) {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string).trim() : "");
  const elementAudit = [1,2,3,4,5,6,7].map(i => s(`auditItem${i}`)).filter(Boolean);
  return {
    canvas: { intent: s("intent"), assumptions: s("assumptions"), audience: s("audience"), success: s("success") },
    storyIt: {
      basePrompt: s("basePrompt"), elementAudit, predictionVsActual: s("predictionVsActual"),
      v2NegativePrompt: s("v2NegativePrompt"), v3NegativePrompt: s("v3NegativePrompt"),
    },
    reflection: {
      mostImpactfulExclusion: s("mostImpactfulExclusion"),
      ctSkill1Assumption: s("ctSkill1Assumption"),
      v4Revision: s("v4Revision"),
    },
  };
}

async function gradeCanvas(canvas: Obj9CanvasFields, ageGroup: string, attemptCount: number, displayName: string): Promise<Obj9CanvasStageResult> {
  const r = OBJ9_RUBRIC.canvas;
  const baseSystem = `
You are the Validator Teacher at AI Decoder Academy — a SKEPTICAL MENTOR.
Objective 9 (Negative Prompt Lab — Firefly). Threshold: ${r.minPassPct}%.

Score four fields:
🎯 INTENT — placeholder: "to see what negative prompts do". Genuine: names a specific assumption to reveal. Example: "${r.fieldHints.intent.genuineEx}"
🔍 ASSUMPTIONS — placeholder: "things will appear". Genuine: names 3 specific predicted elements. Example: "${r.fieldHints.assumptions.genuineEx}"
👥 AUDIENCE — placeholder: "my friends". Genuine: someone who hasn't seen the prompt + what they'd describe. Example: "${r.fieldHints.audience.genuineEx}"
✅ SUCCESS — placeholder: "if images look different". Genuine: names a specific discovery type. Example: "${r.fieldHints.success.genuineEx}"

MODE: challenge if any placeholder; nudge if mixed; celebrate if all genuine.
Voice: skeptical mentor, no emojis, age ${ageGroup}.
Return JSON: { score, mode, fieldFeedback: { intent, assumptions, audience, success }, summary }.`.trim();
  const user = `INTENT: ${canvas.intent || "(empty)"}\nASSUMPTIONS: ${canvas.assumptions || "(empty)"}\nAUDIENCE: ${canvas.audience || "(empty)"}\nSUCCESS: ${canvas.success || "(empty)"}\nJSON only.`;
  const system = applyCopyMode(baseSystem, attemptCount, displayName);
  const c = await openai.chat.completions.create({ model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 500, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  const p = JSON.parse(c.choices[0]?.message?.content ?? "{}") as { score: number; mode: "challenge"|"nudge"|"celebrate"; fieldFeedback: { intent: string; assumptions: string; audience: string; success: string }; summary: string };
  const score = clamp(Math.round(p.score ?? 0), 0, 100);
  return { stage: "canvas", passed: score >= r.minPassPct, score, mode: p.mode ?? "challenge", fieldFeedback: p.fieldFeedback ?? { intent: "", assumptions: "", audience: "", success: "" }, summary: p.summary ?? "" };
}

function gradeStoryIt(storyIt: Obj9StoryItFields): Obj9StoryItStageResult {
  const basePromptPresent    = storyIt.basePrompt.trim().split(/\s+/).filter(Boolean).length >= 5;
  const elementAuditHas5Plus = storyIt.elementAudit.filter(s => s.trim().length > 2).length >= 5;
  const v2HasNegativePrompts = storyIt.v2NegativePrompt.trim().length > 5;
  // V3 must contain V2 words OR be longer than V2
  const v3Words = new Set(storyIt.v3NegativePrompt.toLowerCase().split(/[\s,]+/).filter(Boolean));
  const v2Words = storyIt.v2NegativePrompt.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const v3ExtendsV2 = v3Words.size > v2Words.length && v2Words.every(w => v3Words.has(w));

  const passed = basePromptPresent && elementAuditHas5Plus && v2HasNegativePrompts && v3ExtendsV2;
  let summary: string;
  if (!basePromptPresent) summary = OBJ9_RUBRIC.storyIt.checks.basePromptPresent.fail;
  else if (!elementAuditHas5Plus) summary = OBJ9_RUBRIC.storyIt.checks.elementAuditHas5Plus.fail;
  else if (!v2HasNegativePrompts) summary = OBJ9_RUBRIC.storyIt.checks.v2HasNegativePrompts.fail;
  else if (!v3ExtendsV2) summary = OBJ9_RUBRIC.storyIt.checks.v3ExtendsV2.fail;
  else summary = "Story It complete. Three versions planned with progressive exclusions.";

  return { stage: "storyIt", passed, basePromptPresent, elementAuditHas5Plus, v2HasNegativePrompts, v3ExtendsV2, summary };
}

const createItSchema = {
  type: "object", additionalProperties: false,
  properties: {
    description: { type: "string" },
    baseSubjectConsistent: { type: "boolean" },
    v2ShowsExclusions: { type: "boolean" },
    v3ShowsMoreExclusions: { type: "boolean" },
    auditIsSpecific: { type: "boolean" },
    identifiesImpactfulWord: { type: "boolean" },
    ctSkill1Applied: { type: "boolean" },
    v4RevisionProvided: { type: "boolean" },
    score: { type: "integer" },
    summary: { type: "string" },
  },
  required: ["description","baseSubjectConsistent","v2ShowsExclusions","v3ShowsMoreExclusions","auditIsSpecific","identifiesImpactfulWord","ctSkill1Applied","v4RevisionProvided","score","summary"],
} as const;

async function gradeCreateIt(v1: string, v2: string, v3: string, storyIt: Obj9StoryItFields, reflection: Obj9ReflectionFields, ageGroup: string): Promise<Obj9CreateItStageResult> {
  const check = async (url: string) => { try { const h = await fetch(url, { method: "HEAD" }); return h.ok && (h.headers.get("content-type") ?? "").startsWith("image/"); } catch { return false; } };
  const [r1, r2, r3] = await Promise.all([check(v1), check(v2), check(v3)]);
  const allReachable = r1 && r2 && r3;
  if (!allReachable) {
    return { stage: "createIt", score: 0, tier: "fail", allReachable: false, baseSubjectConsistent: false, v2ShowsExclusions: false, v3ShowsMoreExclusions: false, auditIsSpecific: false, identifiesImpactfulWord: false, ctSkill1Applied: false, v4RevisionProvided: false, description: "", summary: "I can't load all three images — drop V1, V2, V3 in chat in order and resubmit." };
  }

  const system = `
You are the Validator Teacher at AI Decoder Academy — SKEPTICAL MENTOR.
Student generated 3 Firefly images for Objective 9 (Negative Prompt Lab):
- V1: base prompt only
- V2: base prompt + first negative prompts
- V3: base prompt + extended negative prompts

Student's plan:
- Base prompt: ${storyIt.basePrompt || "(none)"}
- Element audit (uninvited): ${storyIt.elementAudit.join(" | ") || "(none)"}
- V2 negatives: ${storyIt.v2NegativePrompt || "(none)"}
- V3 negatives: ${storyIt.v3NegativePrompt || "(none)"}

Reflection:
- Most impactful exclusion: ${reflection.mostImpactfulExclusion || "(empty)"}
- CT Skill 1 (Firefly assumption + source): ${reflection.ctSkill1Assumption || "(empty)"}
- V4 revised base prompt (optional): ${reflection.v4Revision || "(empty)"}

DESCRIBE each version in one short sentence.
RUN checks:
- baseSubjectConsistent : is the SAME subject visible across V1, V2, V3? (only what's been excluded should change)
- v2ShowsExclusions     : does V2 visibly remove SOME elements present in V1?
- v3ShowsMoreExclusions : does V3 show MORE removals than V2?
- auditIsSpecific       : are the audit items specific ("blue sky with clouds") not vague ("background")?
- identifiesImpactfulWord : does the reflection name ONE specific word with explanation of WHY Firefly included it by default?
- ctSkill1Applied       : does the reflection trace the assumption to a likely source (training data bias, cultural pattern, stylistic default)?
- v4RevisionProvided    : did the student write a V4 revised base prompt? (boolean)

SCORE:
- 80 PASS: baseSubjectConsistent + v2ShowsExclusions + v3ShowsMoreExclusions + auditIsSpecific.
- 90 MERIT: all PASS + identifiesImpactfulWord.
- 100 DISTINCTION: MERIT + ctSkill1Applied (and v4RevisionProvided is a tie-breaker plus).
- <80 FAIL: any of baseSubjectConsistent / v2ShowsExclusions / v3ShowsMoreExclusions is false.

Voice: skeptical mentor, age ${ageGroup}, one-line summary.`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_schema", json_schema: { name: "obj9_create_grade", schema: createItSchema, strict: true } },
    temperature: 0.2, max_tokens: 1000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: [
        { type: "text", text: "Grade against the rubric. Return JSON only." },
        { type: "text", text: "VERSION 1 (base):" }, { type: "image_url", image_url: { url: v1, detail: "high" } },
        { type: "text", text: "VERSION 2 (first exclusions):" }, { type: "image_url", image_url: { url: v2, detail: "high" } },
        { type: "text", text: "VERSION 3 (extended exclusions):" }, { type: "image_url", image_url: { url: v3, detail: "high" } },
      ]},
    ],
  });
  const p = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    description: string; baseSubjectConsistent: boolean; v2ShowsExclusions: boolean; v3ShowsMoreExclusions: boolean;
    auditIsSpecific: boolean; identifiesImpactfulWord: boolean; ctSkill1Applied: boolean; v4RevisionProvided: boolean;
    score: number; summary: string;
  };
  const score = clamp(Math.round(p.score), 0, 100);
  const tier: Obj9CreateItStageResult["tier"] = score >= 100 ? "distinction" : score >= 90 ? "merit" : score >= 80 ? "pass" : "fail";
  return { stage: "createIt", score, tier, allReachable: true, baseSubjectConsistent: p.baseSubjectConsistent, v2ShowsExclusions: p.v2ShowsExclusions, v3ShowsMoreExclusions: p.v3ShowsMoreExclusions, auditIsSpecific: p.auditIsSpecific, identifiesImpactfulWord: p.identifiesImpactfulWord, ctSkill1Applied: p.ctSkill1Applied, v4RevisionProvided: p.v4RevisionProvided, description: p.description, summary: p.summary };
}

function pickFeedback(t: Obj9FinalResult["tier"]): string {
  switch (t) {
    case "distinction": return OBJ9_RUBRIC.feedbackScripts.distinction;
    case "merit":       return OBJ9_RUBRIC.feedbackScripts.merit;
    case "pass":        return OBJ9_RUBRIC.feedbackScripts.pass;
    case "fail":        return "Look at the three versions again — what changed, what didn't?";
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

    let canvas: Obj9CanvasFields, storyIt: Obj9StoryItFields, reflection: Obj9ReflectionFields;
    if (body.worksheet.kind === "inline-form") {
      const r = fromInline(body.worksheet.data);
      canvas = r.canvas; storyIt = r.storyIt; reflection = r.reflection;
    } else {
      const ws = await extractWorksheet({ url: body.worksheet.url, format: body.worksheet.format }, openai, body.worksheet.filename);
      const sys = `Extract OBJ 9 worksheet to JSON: {
  canvas: { intent, assumptions, audience, success },
  storyIt: { basePrompt: string, elementAudit: string[] (5-7), predictionVsActual: string, v2NegativePrompt: string, v3NegativePrompt: string },
  reflection: { mostImpactfulExclusion: string, ctSkill1Assumption: string, v4Revision: string }
}. Empty strings/arrays for missing. JSON only.`;
      const userMsg = ws.kind === "text" ? `Worksheet:\n${ws.text}\nNotes:\n${notes}` : `(file_id: ${ws.fileId})\nNotes:\n${notes}`;
      const ext = await openai.chat.completions.create({ model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 1500, messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }] });
      const p = JSON.parse(ext.choices[0]?.message?.content ?? "{}");
      canvas = p.canvas ?? { intent: "", assumptions: "", audience: "", success: "" };
      storyIt = p.storyIt ?? { basePrompt: "", elementAudit: [], predictionVsActual: "", v2NegativePrompt: "", v3NegativePrompt: "" };
      reflection = p.reflection ?? { mostImpactfulExclusion: "", ctSkill1Assumption: "", v4Revision: "" };
    }

    const fullText = [canvas.intent, canvas.assumptions, canvas.audience, canvas.success, storyIt.basePrompt, ...storyIt.elementAudit, storyIt.v2NegativePrompt, storyIt.v3NegativePrompt, reflection.mostImpactfulExclusion, reflection.ctSkill1Assumption, reflection.v4Revision, notes].join("\n");
    const verdict = await moderateContent(fullText);
    if (!verdict.allow) {
      const blocked: Obj9CanvasStageResult = { stage: "canvas", passed: false, score: 0, mode: "challenge", fieldFeedback: { intent: "", assumptions: "", audience: "", success: "" }, summary: "I can't grade this submission." };
      return jsonResponse<Obj9FinalResult>({ passed: false, composite: 0, tier: "fail", canvas: blocked, storyIt: null, createIt: null, feedbackScript: "I can't grade this — let's pick a different submission.", blockedAtStage: "canvas" });
    }

    let attemptCount = 0;
    try {
      const supabase = createAdminClient();
      const { data: prof } = await supabase.from("profiles").select("id").eq("clerk_user_id", userId).single();
      if (prof?.id) {
        const { count } = await supabase.from("objective_attempts").select("*", { count: "exact", head: true }).eq("profile_id", prof.id).eq("lms_id", "l1-09");
        attemptCount = count ?? 0;
      }
    } catch {}

    const canvasResult = await gradeCanvas(canvas, profile.age_group, attemptCount, profile.display_name);
    if (!canvasResult.passed) return jsonResponse<Obj9FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ9_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: null, createIt: null, feedbackScript: canvasResult.summary, blockedAtStage: "canvas" });

    const storyItResult = gradeStoryIt(storyIt);
    if (!storyItResult.passed) return jsonResponse<Obj9FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ9_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: storyItResult, createIt: null, feedbackScript: storyItResult.summary, blockedAtStage: "storyIt" });

    if (!body.v1ImageUrl || !body.v2ImageUrl || !body.v3ImageUrl) return jsonResponse<Obj9FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ9_RUBRIC.canvas.weight + 100 * OBJ9_RUBRIC.storyIt.weight), tier: "fail", canvas: canvasResult, storyIt: storyItResult, createIt: null, feedbackScript: "I need all three Firefly versions — V1, V2, V3 — dropped in chat in order." });

    const createItResult = await gradeCreateIt(body.v1ImageUrl, body.v2ImageUrl, body.v3ImageUrl, storyIt, reflection, profile.age_group);
    const composite = clamp(Math.round(canvasResult.score * OBJ9_RUBRIC.canvas.weight + 100 * OBJ9_RUBRIC.storyIt.weight + createItResult.score * OBJ9_RUBRIC.createIt.weight), 0, 100);
    const tier: Obj9FinalResult["tier"] = composite >= 100 ? "distinction" : composite >= 90 ? "merit" : composite >= 80 ? "pass" : "fail";
    return jsonResponse<Obj9FinalResult>({ passed: tier !== "fail", composite, tier, canvas: canvasResult, storyIt: storyItResult, createIt: createItResult, feedbackScript: pickFeedback(tier) });
  } catch (e) {
    console.error("[validate/obj9] error:", e);
    return new Response("Validation failed", { status: 500 });
  }
}

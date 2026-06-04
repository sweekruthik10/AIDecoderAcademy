import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import {
  OBJ5_RUBRIC,
  type Obj5CanvasFields, type Obj5StoryItFields, type Obj5ReflectionFields,
  type Obj5CanvasStageResult, type Obj5StoryItStageResult, type Obj5CreateItStageResult, type Obj5FinalResult,
} from "@/lib/obj5Rubric";
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
  trackAudioUrl?: string;
  notes?: string;
  profile: { display_name: string; age_group: string };
}

function jsonResponse<T>(d: T) { return new Response(JSON.stringify(d), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

const GENRE_OR_INSTR = /\b(hip[\s-]?hop|trap|rap|pop|r&b|rnb|drill|edm|techno|house|jazz|rock|metal|punk|country|folk|classical|reggae|afrobeat|lo[\s-]?fi|indie|dubstep|bass|drum|drums|guitar|piano|synth|808|violin|cello|saxophone|sax|flute|trumpet|cinematic|orchestral|electronic|acoustic)\b/i;

function fromInline(data: Record<string, string | boolean>) {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string).trim() : "");
  return {
    canvas: { intent: s("intent"), assumptions: s("assumptions"), audience: s("audience"), success: s("success") },
    storyIt: {
      word1: s("word1"), word2: s("word2"), word3: s("word3"), word4: s("word4"), word5: s("word5"),
      styleBrief: s("styleBrief"), obj6Energy: s("obj6Energy"), iterationElement: s("iterationElement"),
    },
    reflection: { correctAssumption: s("correctAssumption"), mostImpactfulElement: s("mostImpactfulElement") },
  };
}

async function gradeCanvas(c: Obj5CanvasFields, ageGroup: string, attemptCount: number, displayName: string): Promise<Obj5CanvasStageResult> {
  const r = OBJ5_RUBRIC.canvas;
  const baseSystem = `Validator at AI Decoder Academy — SKEPTICAL MENTOR. OBJ 5 (Theme Song via Suno.ai, plays under OBJ 6 avatar reveal). Threshold ${r.minPassPct}%.
🎯 INTENT — placeholder: "to make a song". Genuine: specific reaction in the room. Ex: "${r.fieldHints.intent.genuineEx}"
🔍 ASSUMPTIONS — placeholder: "it'll sound good". Genuine: specific bets about Suno interpretation. Ex: "${r.fieldHints.assumptions.genuineEx}"
👥 AUDIENCE — placeholder: "my friends". Genuine: specific listeners + their musical taste. Ex: "${r.fieldHints.audience.genuineEx}"
✅ SUCCESS — placeholder: "if it sounds nice". Genuine: observable reaction from one named person. Ex: "${r.fieldHints.success.genuineEx}"
MODE: challenge/nudge/celebrate. Score=avg. Age ${ageGroup}. No emojis.
Return JSON { score, mode, fieldFeedback: { intent, assumptions, audience, success }, summary }.`;
  const user = `INTENT: ${c.intent || "(empty)"}\nASSUMPTIONS: ${c.assumptions || "(empty)"}\nAUDIENCE: ${c.audience || "(empty)"}\nSUCCESS: ${c.success || "(empty)"}\nJSON only.`;
  const system = applyCopyMode(baseSystem, attemptCount, displayName);
  const cmp = await openai.chat.completions.create({ model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 500, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  const p = JSON.parse(cmp.choices[0]?.message?.content ?? "{}") as { score: number; mode: "challenge"|"nudge"|"celebrate"; fieldFeedback: { intent: string; assumptions: string; audience: string; success: string }; summary: string };
  const score = clamp(Math.round(p.score ?? 0), 0, 100);
  return { stage: "canvas", passed: score >= r.minPassPct, score, mode: p.mode ?? "challenge", fieldFeedback: p.fieldFeedback ?? { intent: "", assumptions: "", audience: "", success: "" }, summary: p.summary ?? "" };
}

async function gradeStoryIt(s: Obj5StoryItFields): Promise<Obj5StoryItStageResult> {
  const words = [s.word1, s.word2, s.word3, s.word4, s.word5].map(w => (w || "").trim());
  const fiveWordsPresent = words.every(w => w.length > 0);
  const noGenreOrInstrument = !words.some(w => GENRE_OR_INSTR.test(w));

  // Brief must mention genre + energy (high/medium/low) + mood + an instrument
  const brief = (s.styleBrief || "").toLowerCase();
  const hasEnergy = /\b(high|medium|low|driving|chill|calm|intense)\b/.test(brief) || /energy/.test(brief);
  let styleBriefHasAllFour = false;
  if (brief.length > 20) {
    try {
      const c = await openai.chat.completions.create({
        model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 200,
        messages: [
          { role: "system", content: `Return JSON: { hasGenre: boolean, hasEnergy: boolean, hasMood: boolean, hasInstrument: boolean, note: string }. A complete Suno.ai style brief includes: GENRE (e.g. hip-hop, Afrobeats, lo-fi), ENERGY level (high/medium/low/driving/chill), MOOD (confident, melancholic, triumphant, dreamlike), and at least one specific INSTRUMENT or sound (808 bass, piano, acoustic guitar, synth pad).` },
          { role: "user", content: `Style brief: ${s.styleBrief}` },
        ],
      });
      const p = JSON.parse(c.choices[0]?.message?.content ?? "{}");
      styleBriefHasAllFour = !!(p.hasGenre && (p.hasEnergy || hasEnergy) && p.hasMood && p.hasInstrument);
    } catch { /* ignore */ }
  }

  const passed = fiveWordsPresent && noGenreOrInstrument && styleBriefHasAllFour;
  const summary =
    !fiveWordsPresent ? OBJ5_RUBRIC.storyIt.checks.fiveWordsPresent.fail :
    !noGenreOrInstrument ? OBJ5_RUBRIC.storyIt.checks.noGenreOrInstrument.fail :
    !styleBriefHasAllFour ? OBJ5_RUBRIC.storyIt.checks.styleBriefHasAllFour.fail :
    "Story It complete — words are personality, brief is complete.";
  return { stage: "storyIt", passed, fiveWordsPresent, noGenreOrInstrument, styleBriefHasAllFour, summary };
}

const createItSchema = {
  type: "object", additionalProperties: false,
  properties: {
    trackPresent: { type: "boolean" },
    reflectionThoughtful: { type: "boolean" },
    identifiesIteration: { type: "boolean" },
    score: { type: "integer" },
    summary: { type: "string" },
  },
  required: ["trackPresent","reflectionThoughtful","identifiesIteration","score","summary"],
} as const;

async function gradeCreateIt(trackUrl: string | undefined, story: Obj5StoryItFields, reflection: Obj5ReflectionFields, ageGroup: string): Promise<Obj5CreateItStageResult> {
  const system = `Validator at AI Decoder Academy. OBJ 5 Create It grading.
Track uploaded: ${trackUrl ? "YES (" + trackUrl + ")" : "NO"}.
5 words: ${[story.word1, story.word2, story.word3, story.word4, story.word5].filter(Boolean).join(", ")}
Style brief: ${story.styleBrief || "(empty)"}
OBJ 6 connection energy: ${story.obj6Energy || "(empty)"}
Iteration plan element: ${story.iterationElement || "(empty)"}
Reflection — correct assumption: ${reflection.correctAssumption || "(empty)"}
Reflection — most impactful element: ${reflection.mostImpactfulElement || "(empty)"}

Checks:
- trackPresent: is there a track URL?
- reflectionThoughtful: does "most impactful element" name a SPECIFIC brief element (e.g. "the 808 bass made it heavier than I expected") rather than vague?
- identifiesIteration: does the iteration plan OR reflection name a SPECIFIC element they would change next time?

SCORE:
- 80 PASS: trackPresent.
- 90 MERIT: trackPresent + reflectionThoughtful.
- 100 DISTINCTION: MERIT + identifiesIteration.
- <80 FAIL: no track.
Age ${ageGroup}. JSON only.`;
  const c = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_schema", json_schema: { name: "obj5_create_grade", schema: createItSchema, strict: true } },
    temperature: 0.2, max_tokens: 500,
    messages: [{ role: "system", content: system }, { role: "user", content: "Grade. JSON only." }],
  });
  const p = JSON.parse(c.choices[0]?.message?.content ?? "{}") as { trackPresent: boolean; reflectionThoughtful: boolean; identifiesIteration: boolean; score: number; summary: string };
  const score = clamp(Math.round(p.score), 0, 100);
  const tier: Obj5CreateItStageResult["tier"] = score >= 100 ? "distinction" : score >= 90 ? "merit" : score >= 80 ? "pass" : "fail";
  return { stage: "createIt", score, tier, trackPresent: p.trackPresent, reflectionThoughtful: p.reflectionThoughtful, identifiesIteration: p.identifiesIteration, summary: p.summary };
}

function pickFeedback(t: Obj5FinalResult["tier"]): string {
  switch (t) {
    case "distinction": return OBJ5_RUBRIC.feedbackScripts.distinction;
    case "merit":       return OBJ5_RUBRIC.feedbackScripts.merit;
    case "pass":        return OBJ5_RUBRIC.feedbackScripts.pass;
    case "fail":        return "Re-listen. Does your track actually carry the energy you wrote in Field 4 for the OBJ 6 reveal?";
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

    let canvas: Obj5CanvasFields, storyIt: Obj5StoryItFields, reflection: Obj5ReflectionFields;
    if (body.worksheet.kind === "inline-form") {
      const r = fromInline(body.worksheet.data);
      canvas = r.canvas; storyIt = r.storyIt; reflection = r.reflection;
    } else {
      const ws = await extractWorksheet({ url: body.worksheet.url, format: body.worksheet.format }, openai, body.worksheet.filename);
      const sys = `Extract OBJ 5 worksheet to JSON: {
  canvas: { intent, assumptions, audience, success },
  storyIt: { word1, word2, word3, word4, word5, styleBrief, obj6Energy, iterationElement },
  reflection: { correctAssumption, mostImpactfulElement }
}. Empty strings for missing. JSON only.`;
      const userMsg = ws.kind === "text" ? `Worksheet:\n${ws.text}\nNotes:\n${notes}` : `(file_id: ${ws.fileId})\nNotes:\n${notes}`;
      const ext = await openai.chat.completions.create({ model: "gpt-4o-mini", response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 1200, messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }] });
      const p = JSON.parse(ext.choices[0]?.message?.content ?? "{}");
      canvas = p.canvas ?? { intent: "", assumptions: "", audience: "", success: "" };
      storyIt = p.storyIt ?? { word1: "", word2: "", word3: "", word4: "", word5: "", styleBrief: "", obj6Energy: "", iterationElement: "" };
      reflection = p.reflection ?? { correctAssumption: "", mostImpactfulElement: "" };
    }

    const fullText = [canvas.intent, canvas.assumptions, canvas.audience, canvas.success, storyIt.styleBrief, storyIt.obj6Energy, storyIt.iterationElement, reflection.correctAssumption, reflection.mostImpactfulElement, notes].join("\n");
    const verdict = await moderateContent(fullText);
    if (!verdict.allow) {
      const blocked: Obj5CanvasStageResult = { stage: "canvas", passed: false, score: 0, mode: "challenge", fieldFeedback: { intent: "", assumptions: "", audience: "", success: "" }, summary: "I can't grade this submission." };
      return jsonResponse<Obj5FinalResult>({ passed: false, composite: 0, tier: "fail", canvas: blocked, storyIt: null, createIt: null, feedbackScript: "I can't grade this — let's pick a different submission.", blockedAtStage: "canvas" });
    }

    let attemptCount = 0;
    try {
      const supabase = createAdminClient();
      const { data: prof } = await supabase.from("profiles").select("id").eq("clerk_user_id", userId).single();
      if (prof?.id) { const { count } = await supabase.from("objective_attempts").select("*", { count: "exact", head: true }).eq("profile_id", prof.id).eq("lms_id", "l1-05"); attemptCount = count ?? 0; }
    } catch {}

    const canvasResult = await gradeCanvas(canvas, profile.age_group, attemptCount, profile.display_name);
    if (!canvasResult.passed) return jsonResponse<Obj5FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ5_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: null, createIt: null, feedbackScript: canvasResult.summary, blockedAtStage: "canvas" });

    const storyItResult = await gradeStoryIt(storyIt);
    if (!storyItResult.passed) return jsonResponse<Obj5FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ5_RUBRIC.canvas.weight), tier: "fail", canvas: canvasResult, storyIt: storyItResult, createIt: null, feedbackScript: storyItResult.summary, blockedAtStage: "storyIt" });

    if (!body.trackAudioUrl) return jsonResponse<Obj5FinalResult>({ passed: false, composite: Math.round(canvasResult.score * OBJ5_RUBRIC.canvas.weight + 100 * OBJ5_RUBRIC.storyIt.weight), tier: "fail", canvas: canvasResult, storyIt: storyItResult, createIt: null, feedbackScript: "I need your Suno.ai theme song MP3. Drop it in chat, then come back." });

    const createItResult = await gradeCreateIt(body.trackAudioUrl, storyIt, reflection, profile.age_group);
    const composite = clamp(Math.round(canvasResult.score * OBJ5_RUBRIC.canvas.weight + 100 * OBJ5_RUBRIC.storyIt.weight + createItResult.score * OBJ5_RUBRIC.createIt.weight), 0, 100);
    const tier: Obj5FinalResult["tier"] = composite >= 100 ? "distinction" : composite >= 90 ? "merit" : composite >= 80 ? "pass" : "fail";
    return jsonResponse<Obj5FinalResult>({ passed: tier !== "fail", composite, tier, canvas: canvasResult, storyIt: storyItResult, createIt: createItResult, feedbackScript: pickFeedback(tier) });
  } catch (e) {
    console.error("[validate/obj5] error:", e);
    return new Response("Validation failed", { status: 500 });
  }
}

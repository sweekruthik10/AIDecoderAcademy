/**
 * POST /api/classroom/lesson
 *
 * Lazy lesson generator for Bhavna's Lecture mode. Generated in small calls
 * to stay under the Vercel free-tier 10s timeout:
 *   mode "outline"  → { outline: string[] }                 (concept titles)
 *   mode "concept"  → { title, explanation, example? }      (one concept body)
 *   mode "summary"  → { revisionSummary: string }
 */
import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase";
import { buildClassroomSystemPrompt } from "@/lib/classroomPersona";
import type { Profile } from "@/types";

export const runtime     = "nodejs";
export const maxDuration  = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Body =
  | { mode: "outline";  chapterTitle?: string }
  | { mode: "concept";  chapterTitle?: string; outline: string[]; index: number }
  | { mode: "summary";  chapterTitle?: string; outline: string[] };

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const body = await req.json() as Body;

    const supabase = createAdminClient();
    const { data: profileRow } = await supabase
      .from("profiles").select("*").eq("clerk_user_id", userId).single();
    if (!profileRow) return new Response("Profile not found", { status: 404 });
    const profile = profileRow as Profile;
    const learnerModel =
      (profileRow as { learner_model?: Record<string, unknown> | null }).learner_model ?? null;

    const system = buildClassroomSystemPrompt(profile, body.chapterTitle || undefined, {
      learnerModel,
    });
    const topic  = body.chapterTitle || "the current chapter";

    let userPrompt: string;
    if (body.mode === "outline") {
      userPrompt =
        `Plan a guided lesson on "${topic}". Return ONLY JSON: ` +
        `{"outline":["concept title 1","concept title 2",...]} with 4 to 7 short ` +
        `concept titles, in teaching order. No prose, no markdown.`;
    } else if (body.mode === "concept") {
      const title = body.outline[body.index] ?? "";
      userPrompt =
        `For the guided lesson on "${topic}", teach ONLY this one concept: ` +
        `"${title}". Return ONLY JSON: {"title":"...","explanation":"...",` +
        `"example":"..."}. explanation = 60-130 words, clear and friendly. ` +
        `example is optional — omit the key if not useful. No markdown.`;
    } else {
      userPrompt =
        `Write a quick revision summary for the guided lesson on "${topic}" ` +
        `covering: ${body.outline.join("; ")}. Return ONLY JSON: ` +
        `{"revisionSummary":"..."} — 50-90 words, plain sentences. No markdown.`;
    }

    const completion = await openai.chat.completions.create({
      model:           "gpt-4o-mini",
      temperature:     0.4,
      max_tokens:      body.mode === "concept" ? 400 : 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user",   content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch {
      console.error("[classroom/lesson] JSON parse failed:", raw.slice(0, 200));
      return new Response("Lesson generation failed", { status: 502 });
    }

    return Response.json(parsed);
  } catch (err) {
    console.error("[classroom/lesson]", err);
    return new Response("Internal error", { status: 500 });
  }
}

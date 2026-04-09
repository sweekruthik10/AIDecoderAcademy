/**
 * POST /api/classroom/arena/generate
 * Body: { type: "notes" | "flashcards", chapter_title: string, prompt?: string }
 *
 * notes      → SSE stream of markdown content
 * flashcards → JSON: { flashcards: [{question, answer}] }
 */

import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";

export const runtime    = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const NOTES_SYSTEM = `You are an expert CBSE Class 10 Science teacher creating study notes.
Produce well-structured markdown notes that a student can use for revision.
Use ## headings, bullet points, bold for key terms, and include chemical equations where relevant.
Keep it concise but comprehensive — aim for 400-600 words.`;

const FLASHCARDS_SYSTEM = `You are an expert CBSE Class 10 Science teacher creating flashcards.
Generate exactly 10 flashcards covering the most important concepts.
Return ONLY a valid JSON array — no markdown, no explanation:
[{"question":"...","answer":"..."},...]
Answers should be 1-3 sentences. Cover definitions, reactions, processes, and key facts.`;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const { type, chapter_title, prompt } = await req.json() as {
      type:          "notes" | "flashcards";
      chapter_title: string;
      prompt?:       string;
    };

    const userPrompt = prompt?.trim()
      || `Generate ${type} for CBSE Class 10 Science — ${chapter_title}`;

    // ── Flashcards: single JSON call ─────────────────────────────────────────
    if (type === "flashcards") {
      const completion = await openai.chat.completions.create({
        model:       "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system",  content: FLASHCARDS_SYSTEM },
          { role: "user",    content: userPrompt },
        ],
      });

      const raw   = completion.choices[0].message.content ?? "[]";
      const clean = raw.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();
      let flashcards: { question: string; answer: string }[];
      try { flashcards = JSON.parse(clean); }
      catch { return new Response("Failed to parse flashcards", { status: 500 }); }

      return Response.json({ flashcards });
    }

    // ── Notes: SSE streaming ─────────────────────────────────────────────────
    const stream = await openai.chat.completions.create({
      model:       "gpt-4o-mini",
      stream:      true,
      temperature: 0.7,
      messages: [
        { role: "system", content: NOTES_SYSTEM },
        { role: "user",   content: userPrompt },
      ],
    });

    const enc     = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    console.error("[arena/generate]", err);
    return new Response("Internal error", { status: 500 });
  }
}

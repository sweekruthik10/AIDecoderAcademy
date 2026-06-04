/**
 * POST /api/classroom/chat
 *
 * Dedicated SSE streaming route for the Classroom Arena.
 * Uses buildClassroomSystemPrompt — structured, curriculum-accurate,
 * no arena/game persona. Completely separate from /api/chat.
 *
 * Body: {
 *   message:        string;
 *   chapterTitle:   string;
 *   history:        { role: "user" | "assistant"; content: string }[];
 *   isVoiceMode?:   boolean;   // voice mode → concise, no-markdown reply
 *   conceptContext?: string;   // lecture doubt → concept being asked about
 * }
 */

import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase";
import { buildClassroomSystemPrompt } from "@/lib/classroomPersona";
import type { Profile } from "@/types";

export const runtime    = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const { message, chapterTitle, history = [], isVoiceMode = false, conceptContext } =
      await req.json() as {
        message:        string;
        chapterTitle:   string;
        history:        { role: "user" | "assistant"; content: string }[];
        isVoiceMode?:   boolean;
        conceptContext?: string;
      };

    if (!message?.trim()) return new Response("message required", { status: 400 });

    // Resolve profile
    const supabase = createAdminClient();
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("*")
      .eq("clerk_user_id", userId)
      .single();

    if (!profileRow) return new Response("Profile not found", { status: 404 });
    const profile = profileRow as Profile;
    const learnerModel =
      (profileRow as { learner_model?: Record<string, unknown> | null }).learner_model ?? null;

    // Build classroom-specific system prompt
    // chapterTitle is optional — when absent, the teacher answers across subjects.
    const systemPrompt = buildClassroomSystemPrompt(
      profile,
      chapterTitle || undefined,
      { isVoiceMode, conceptContext, learnerModel },
    );

    // Build message history for OpenAI (last 20 turns max to keep context window lean)
    const recentHistory = history.slice(-20).map(m => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
    }));

    // Stream from OpenAI
    const stream = await openai.chat.completions.create({
      model:       "gpt-4o-mini",
      max_tokens:  isVoiceMode ? 350 : 1500,
      temperature: 0.4,          // lower = more structured, consistent output
      stream:      true,
      messages: [
        { role: "system",  content: systemPrompt },
        ...recentHistory,
        { role: "user",    content: message },
      ],
    });

    // SSE stream back to client — same format as /api/chat
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e) {
          console.error("[classroom/chat] stream error", e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type":  "text/event-stream",
        "Cache-Control": "no-cache",
        Connection:      "keep-alive",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    console.error("[classroom/chat]", detail);
    const body = process.env.NODE_ENV === "development" ? detail : "Internal error";
    return new Response(body, { status: 500 });
  }
}

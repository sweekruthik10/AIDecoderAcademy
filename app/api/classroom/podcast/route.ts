import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import { synthLine, mergeMp3, uploadAudio } from "@/lib/classroomAudio";
import { matchPersona, buildDynamicPersona, HOST_VOICE } from "@/lib/podcastPersonas";

export const maxDuration = 300;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface Turn { speaker: "host" | "guest"; text: string; }

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { topic, chapterTitle } = (await req.json()) as { topic: string; chapterTitle: string };
  const subject = topic?.trim() || chapterTitle;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (o: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      try {
        // 1. Persona
        const persona = matchPersona(subject) ?? buildDynamicPersona(subject);
        send({ stage: "persona", persona: { name: persona.name, archetype: persona.archetype } });

        // 2. Script
        const sys =
          `Write a kids' podcast (ages 11-16) about "${subject}". Two speakers:\n` +
          `HOST = Bhavna (warm teacher). GUEST = ${persona.name}, a ${persona.archetype} ` +
          `(${persona.personality}; style: ${persona.speakingStyle}). The guest is a FICTIONAL character ` +
          `inspired by an archetype — never claim to be a real person, never quote real people.\n` +
          `Structure: a punchy COLD-OPEN hook, intro, 4-6 Q&A beats with light banter, one "whoa" fact, a wrap-up.\n` +
          `Plain spoken English, no markdown, no LaTeX. Target 24-32 short turns.\n` +
          `Return JSON: {"turns":[{"speaker":"host"|"guest","text":"..."}]}`;
        const raw = (await openai.chat.completions.create({
          model: "gpt-4o-mini", temperature: 0.8, response_format: { type: "json_object" },
          messages: [{ role: "system", content: sys }, { role: "user", content: `Topic: ${subject}` }],
        })).choices[0]?.message?.content ?? "{}";
        const turns: Turn[] = (JSON.parse(raw).turns ?? []).slice(0, 32);
        if (!turns.length) throw new Error("empty script");
        send({ stage: "script", total: turns.length });

        // 3. TTS (parallel batches of 4 to cut wall-clock, preserve order)
        const buffers: Buffer[] = new Array(turns.length);
        let done = 0;
        const BATCH = 4;
        for (let i = 0; i < turns.length; i += BATCH) {
          const slice = turns.slice(i, i + BATCH);
          await Promise.all(slice.map(async (t, j) => {
            const voice = t.speaker === "host" ? HOST_VOICE : persona.voice;
            buffers[i + j] = await synthLine(t.text, voice);
            send({ stage: "tts", done: ++done, total: turns.length });
          }));
        }

        // 4. Merge + upload
        const audioUrl = await uploadAudio(mergeMp3(buffers), `podcast/${userId}/${Date.now()}.mp3`);
        send({ stage: "done", audioUrl, transcript: turns, persona: { name: persona.name, archetype: persona.archetype },
               title: `Podcast: ${subject}` });
        controller.close();
      } catch (e) {
        send({ stage: "error", message: (e as Error).message });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}

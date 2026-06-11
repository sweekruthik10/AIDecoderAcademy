import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import { synthLineWithTimestamps, uploadAudio, BHAVNA_VOICE_ID } from "@/lib/classroomAudio";

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Gen =
  | { offTopic: true; quip: string }
  | {
      offTopic: false;
      title: string;
      script: string;
      formulas: { latex: string; caption: string }[];
      table: { headers: string[]; rows: string[][] } | null;
      keyPoints: string[];
    };

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { chapterTitle, focus } = (await req.json()) as {
    chapterTitle: string;
    focus?: string;
  };
  const wanted = focus?.trim() || chapterTitle;

  const sys =
    `You are Ms. Bhavna — a warm, encouraging Indian-English teacher who makes hard ideas click for students aged 11-16. ` +
    `You are giving a short SPOKEN audio overview (a real voice will read it aloud, so write for the EAR, not the eye) for the CBSE Class 10 chapter "${chapterTitle}".\n` +
    `Decide if the student's request is INSIDE this chapter (the whole chapter or a subtopic of it).\n` +
    `Return STRICT JSON, no prose.\n` +
    `If the request is UNRELATED to "${chapterTitle}", return:\n` +
    `  {"offTopic": true, "quip": "<one short, playful, kind line that redirects them back to ${chapterTitle}. Never mean, never preachy.>"}\n` +
    `Otherwise return:\n` +
    `  {"offTopic": false,\n` +
    `   "title": "Audio Overview: <topic>",\n` +
    `   "script": "<A 90-120 second spoken narration (~170-210 words) that teaches like a real teacher talking directly to ONE student. Write for the ear: short sentences, contractions, second person ('you'). Follow this teaching spine but BLEND it into one natural flowing narration — do NOT label or number the parts: (1) HOOK — open with a vivid everyday question or moment that sparks curiosity about this topic; (2) WHY — one line on why it matters or where they meet it in real life; (3) ANCHOR — give ONE concrete everyday analogy and briefly map it to the idea; (4) CORE — explain the main idea simply, building intuition FIRST and naming the term only after; if there is math, say it in words (e.g. 'sine of theta is opposite over hypotenuse') and say what it lets you DO; (5) RECAP — end with the single most important thing to remember plus one warm, encouraging line. Plain spoken English ONLY — no markdown, no headings, no bullet points, no LaTeX, no stage directions or sound cues. Warm and encouraging, never dry or list-like.>",\n` +
    `   "formulas": [{"latex": "\\\\sin\\\\theta = \\\\frac{opposite}{hypotenuse}", "caption": "<short plain caption>"}],\n` +
    `   "table": {"headers": ["Col A", "Col B"], "rows": [["a1","b1"],["a2","b2"]]},\n` +
    `   "keyPoints": ["<2-4 short revision bullets>"]}\n` +
    `VISUAL REPRESENTATION RULES — pick what best fits the content:\n` +
    `- Include "formulas" ONLY when the topic genuinely has equations; else use [].\n` +
    `- Include "table" ONLY when the content is naturally tabular (comparisons, value lists, ratios across angles, properties side-by-side). Otherwise set "table": null.\n` +
    `- You may include BOTH formulas and a table when both help. Keep tables small (<= 6 rows, <= 4 columns), plain text cells (no LaTeX/markdown in cells).`;

  let gen: Gen;
  try {
    const raw = (await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Student wants an audio overview of: ${wanted}` },
      ],
    })).choices[0]?.message?.content ?? "";
    gen = JSON.parse(raw) as Gen;
  } catch {
    return new Response("Script generation failed", { status: 500 });
  }

  if (gen.offTopic) {
    return Response.json({ offTopic: true, quip: gen.quip });
  }
  if (!gen.script?.trim()) {
    return new Response("Script generation failed", { status: 500 });
  }

  const { mp3, words } = await synthLineWithTimestamps(gen.script, { voiceId: BHAVNA_VOICE_ID });
  const audioUrl = await uploadAudio(mp3, `overview/${userId}/${Date.now()}.mp3`);

  return Response.json({
    offTopic: false,
    audioUrl,
    title: gen.title || `Audio Overview: ${wanted}`,
    script: gen.script,
    words,
    formulas: Array.isArray(gen.formulas) ? gen.formulas : [],
    table: gen.table && Array.isArray(gen.table.headers) && Array.isArray(gen.table.rows) ? gen.table : null,
    keyPoints: Array.isArray(gen.keyPoints) ? gen.keyPoints : [],
  });
}

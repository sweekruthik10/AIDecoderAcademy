/**
 * POST /api/classroom/evaluate-written
 * Body: { paper_id, image_urls: string[], time_taken_secs?: number }
 *
 * Gate 1 — rejects non-answer-sheet images immediately (0 for all).
 * Gate 2 — evaluates each question with its own focused API call so the
 *           model only needs to find ONE answer at a time, making partial
 *           submissions (e.g. only Q2 uploaded) work correctly.
 */

import { auth }               from "@clerk/nextjs/server";
import { createAdminClient }  from "@/lib/supabase";
import OpenAI                 from "openai";
import type { WrittenFeedbackItem } from "@/types";
import { annotateAnswerSheets } from "@/lib/annotateAnswerSheet";

export const runtime     = "nodejs";
export const maxDuration = 120;

// Using OpenRouter for model access — drop-in OpenAI-compatible client
const openai = new OpenAI({
  apiKey:  process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://ai-decoder-academy.vercel.app",
    "X-Title":      "AI Decoder Academy",
  },
});

// ── Convert a Supabase URL to a base64 image part ────────────────────────────
async function toBase64Part(url: string): Promise<OpenAI.Chat.ChatCompletionContentPart> {
  const res    = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const buffer = await res.arrayBuffer();
  const mime   = res.headers.get("content-type") ?? "image/jpeg";
  const b64    = Buffer.from(buffer).toString("base64");
  return { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "high" } };
}

// ── Gate 1: reject non-answer-sheet images ───────────────────────────────────
async function validateAnswerSheet(
  imageParts: OpenAI.Chat.ChatCompletionContentPart[]
): Promise<{ valid: boolean; reason: string }> {
  const res = await openai.chat.completions.create({
    model: "openai/gpt-5.4-mini",
    messages: [{
      role: "user",
      content: [
        ...imageParts,
        {
          type: "text",
          text: `Look at this image carefully.
Does it show a handwritten answer sheet — paper with handwritten text that appears to be exam answers?
Answer with JSON only, no markdown:
{ "is_answer_sheet": true/false, "reason": "one sentence describing what you actually see" }
Be strict. Photograph, scenery, food, printed text only, blank page = false.`,
        },
      ],
    }],
    max_tokens: 100,
    temperature: 0,
  });

  const raw = res.choices[0].message.content ?? "{}";
  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim());
    return { valid: !!parsed.is_answer_sheet, reason: parsed.reason ?? "" };
  } catch {
    return { valid: false, reason: "Could not parse validation response." };
  }
}

// ── Gate 2: one focused API call per question ────────────────────────────────
async function evaluateOneQuestion(
  q: any,
  qNumber: number,
  imageParts: OpenAI.Chat.ChatCompletionContentPart[],
  subject: string
): Promise<WrittenFeedbackItem> {
  const prompt = `You are a CBSE Class 10 ${subject} examiner evaluating a student's handwritten answer sheet.

You are evaluating QUESTION ${qNumber} only. The answer sheet may span multiple images — read ALL of them.

QUESTION NUMBER: ${qNumber}
QUESTION (${q.marks} marks): ${q.question}
EXPECTED ANSWER: ${q.expected_answer}
MARKING SCHEME: ${q.marking_scheme}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — FIND THE QUESTION ${qNumber} MARKER:

Search every image for the student's handwritten marker that signals the start of
their answer to Question ${qNumber}. Acceptable forms:
  ${qNumber})   ${qNumber}.   Q${qNumber}   Q.${qNumber}   (${qNumber})

KEY DISTINCTION — question numbers vs. sub-items:
• Questions are numbered with ARABIC NUMERALS: 1), 2), 3), 4) ...
• Sub-parts within a question use Roman numerals (i., ii., iii.) or letters (a., b., (a), (b)).
• If you see i. or ii. followed later by ${qNumber}), the ${qNumber}) IS a new question marker —
  do not treat it as a continuation of the previous question's sub-items.

Rules:
• The marker could appear on any of the images, not just the first.
• Do NOT evaluate based on position or order alone — the marker must be explicitly written.
• If after checking all images you cannot find any of these markers → return:
  { "read": "[Not attempted]", "score": 0, "feedback": "Question ${qNumber} was not attempted — marker not found." }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — COLLECT THE FULL ANSWER (only if marker found):

The student's answer for Question ${qNumber} begins immediately after its marker and ends
just before the next question's marker (Q${qNumber + 1} or higher) or the last page.

IMPORTANT: The answer may START on one image and CONTINUE on the next image.
Collect ALL text, equations, and working the student wrote for Question ${qNumber}
across ALL images before the next question marker appears.

Transcribe completely — fractions, roots (√), powers (²), trig ratios (sin/cos/tan).
Accept equivalent notations: 1/√2 = √2/2, sin²A = (sinA)², etc.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — SCORE:

Compare the full transcription to the marking scheme. Award marks generously for:
• Correct method shown even if final simplification differs slightly.
• Correct values in any equivalent form.
• Partial credit for partially correct steps where the scheme allows it.
Only deduct if a required step or value is genuinely absent across ALL pages.

Return JSON only, no markdown:
{
  "read": "full transcription of what student wrote for Q${qNumber} across all pages, or [Not attempted]",
  "score": <integer 0 to ${q.marks}>,
  "feedback": "1-3 sentences: what earned marks and what (if anything) was missing"
}`;

  const res = await openai.chat.completions.create({
    model: "openai/gpt-5.4-mini",
    messages: [{
      role: "user",
      content: [
        ...imageParts,
        { type: "text", text: prompt },
      ],
    }],
    max_tokens: 600,
    temperature: 0,
  });

  const raw = res.choices[0].message.content ?? "{}";
  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim());
    return {
      score:    Math.min(Math.max(0, parsed.score ?? 0), q.marks),
      max:      q.marks,
      feedback: parsed.feedback ?? "",
    };
  } catch {
    console.error(`[evaluate-written] Parse failed for ${q.id}:`, raw.slice(0, 200));
    return { score: 0, max: q.marks, feedback: "Evaluation failed for this question." };
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const { paper_id, image_urls, time_taken_secs } = await req.json() as {
      paper_id:         string;
      image_urls:       string[];
      time_taken_secs?: number;
    };

    if (!paper_id || !image_urls?.length)
      return new Response("paper_id and image_urls required", { status: 400 });

    const supabase = createAdminClient();

    const { data: profileRow } = await supabase
      .from("profiles").select("id").eq("clerk_user_id", userId).single();
    if (!profileRow) return new Response("Profile not found", { status: 404 });

    const { data: paper } = await supabase
      .from("question_papers")
      .select("id, questions, total_marks, chapter_id")
      .eq("id", paper_id).single();
    if (!paper) return new Response("Paper not found", { status: 404 });

    // Fetch subject so the prompt uses the correct examiner persona
    const { data: chapterRow } = await supabase
      .from("chapters").select("subject").eq("id", paper.chapter_id).single();
    const subject = chapterRow?.subject ?? "Science";

    const questions: any[] = paper.questions as any[];
    const maxScore = questions.reduce((s: number, q: any) => s + q.marks, 0);

    // Convert all images to base64 once — reused across all calls
    const imageParts = await Promise.all(image_urls.map(toBase64Part));

    // ── Gate 1: reject non-answer-sheet images ────────────────────────────────
    const { valid, reason } = await validateAnswerSheet(imageParts);

    if (!valid) {
      const feedback: Record<string, WrittenFeedbackItem> = {};
      for (const q of questions) {
        feedback[q.id] = {
          score:    0,
          max:      q.marks,
          feedback: `No handwritten answers detected (${reason}). Please upload a clear photo of your written answers.`,
        };
      }
      await supabase.from("student_attempts").insert({
        profile_id: profileRow.id, question_paper_id: paper_id,
        question_ids: questions.map((q: any) => q.id),
        answers: { image_urls }, score: 0, max_score: maxScore, feedback,
        time_taken_secs: time_taken_secs ?? null,
      });
      return Response.json({ score: 0, max_score: maxScore, feedback, annotated_image_urls: image_urls });
    }

    // ── Gate 2: evaluate each question independently in parallel ──────────────
    const results = await Promise.all(
      questions.map((q: any, i: number) => evaluateOneQuestion(q, i + 1, imageParts, subject))
    );

    const feedback: Record<string, WrittenFeedbackItem> = {};
    let score = 0;
    questions.forEach((q: any, i: number) => {
      feedback[q.id] = results[i]!;
      score += results[i]!.score;
    });

    // ── Annotation: draw teacher-style tick marks + scores on each page ───────
    let annotated_image_urls: string[] = image_urls;
    try {
      const feedbackForAnnotation: Record<string, { score: number; max: number; feedback: string }> = {};
      questions.forEach((q: any, i: number) => {
        feedbackForAnnotation[q.id] = {
          score:    results[i]!.score,
          max:      results[i]!.max,
          feedback: results[i]!.feedback,
        };
      });
      annotated_image_urls = await annotateAnswerSheets(
        image_urls, feedbackForAnnotation, questions, profileRow.id
      );
    } catch (annotateErr: any) {
      console.error("[evaluate-written] annotation failed (non-fatal):", annotateErr.message);
    }

    await supabase.from("student_attempts").insert({
      profile_id: profileRow.id, question_paper_id: paper_id,
      question_ids: questions.map((q: any) => q.id),
      answers: { image_urls, annotated_image_urls }, score, max_score: maxScore, feedback,
      time_taken_secs: time_taken_secs ?? null,
    });

    return Response.json({ score, max_score: maxScore, feedback, annotated_image_urls });
  } catch (err) {
    console.error("[classroom/evaluate-written]", err);
    return new Response("Internal error", { status: 500 });
  }
}

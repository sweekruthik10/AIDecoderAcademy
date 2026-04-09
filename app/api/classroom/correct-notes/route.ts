/**
 * POST /api/classroom/correct-notes
 * Body: { chapter_id: string, image_urls: string[] }
 *
 * Uses Claude Vision via OpenRouter (same setup as evaluate-written) with a
 * CBSE Class 10 teacher persona to correct a student's handwritten classwork
 * notes against the chapter reference content.
 *
 * Returns: { accuracy_score, teacher_summary, issues[], positives[], image_urls }
 * No DB save — this is a test build for quality validation.
 */

import { auth }              from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import OpenAI                from "openai";
import type { CorrectionIssue } from "@/types";
import { annotateNotesSheets } from "@/lib/annotateNotesSheet";

export const runtime     = "nodejs";
export const maxDuration = 120;

// OpenRouter — drop-in OpenAI-compatible client (same as evaluate-written)
const openai = new OpenAI({
  apiKey:  process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://ai-decoder-academy.vercel.app",
    "X-Title":      "AI Decoder Academy",
  },
});

// Claude model via OpenRouter
const CLAUDE_MODEL = "google/gemini-3.5-flash";

// ── Convert a Supabase URL to a base64 image part (same as evaluate-written) ──
async function toBase64Part(url: string): Promise<OpenAI.Chat.ChatCompletionContentPart> {
  const res    = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const buffer = await res.arrayBuffer();
  const mime   = res.headers.get("content-type") ?? "image/jpeg";
  const b64    = Buffer.from(buffer).toString("base64");
  return { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "high" } };
}

// ── Build the teacher system prompt ──────────────────────────────────────────
function buildSystemPrompt(subject: string, chapterTitle: string, contentText: string): string {
  return `You are a helpful CBSE Class 10 ${subject} teacher reviewing a student's handwritten classwork notes for the chapter "${chapterTitle}".

Your reference for this chapter:
---
${contentText}
---

YOUR JOB IS TO FLAG ONLY GENUINE ERRORS. Be lenient — these are classwork notes, not an exam.

━━━ STEP 1: CHECK EVERY CHEMICAL EQUATION USING THIS CHECKLIST ━━━

For each equation the student has written, go through ALL four checks:

CHECK 1 — DIATOMIC ELEMENTS (most common mistake):
   These 7 elements MUST have subscript 2 when written as pure elements in equations:
   H₂  N₂  O₂  F₂  Cl₂  Br₂  I₂
   If the student wrote just "O", "Cl", "H", "N", "F", "Br", "I" alone (not inside a compound)
   → it is WRONG. Flag it. Set student_wrote to just that symbol e.g. "O", "Cl".
   ✦ "2Mg + O → 2MgO"     → O should be O₂  → FLAG, student_wrote = "O"
   ✦ "2AgCl → 2Ag + Cl↑"  → Cl should be Cl₂ → FLAG, student_wrote = "Cl"

CHECK 2 — MISSING SUBSCRIPTS IN COMPOUNDS:
   Check every compound for missing subscript numbers.
   ✦ "CuSO"  → should be CuSO₄  → FLAG, student_wrote = "CuSO"
   ✦ "H₂SO"  → should be H₂SO₄  → FLAG, student_wrote = "H₂SO"
   ✦ "H2O2"  → check if subscripts are correct for the context

CHECK 3 — WRONG PRODUCTS:
   Verify the product compounds are chemically correct.
   ✦ Thermal decomposition of Pb(NO₃)₂ → products are PbO + NO₂ + O₂
     If student wrote "2Pb" (pure lead) instead of "2PbO" → FLAG, student_wrote = "2Pb"
   ✦ Do NOT flag products that are correct

CHECK 4 — BALANCING (only obvious imbalances):
   Count atoms on both sides. Flag only if clearly unbalanced.
   Do NOT flag if coefficients are simply omitted in note-taking style.

DEDUPLICATION RULE: If the same equation has multiple issues, report each as a SEPARATE issue.
But do NOT report the same mistake twice. One issue per error, not one per equation.

━━━ STEP 2: CHECK SPELLING ━━━
Flag actual misspellings of subject terms (e.g. "Electrolyisie" → "Electrolysis").
Do NOT flag: shorthand, abbreviations, handwriting style, or inline subscripts (H2O is fine).

━━━ DO NOT FLAG ━━━
✗ Correct formulas — always verify before flagging
✗ Missing reaction type labels or conditions above arrows
✗ Spacing, dot style, or arrow notation differences
✗ Content that is scientifically correct but worded differently

For "student_wrote": write the SPECIFIC wrong fragment only — e.g. "O" not "2Mg + O → 2MgO".
This is used to underline just the wrong part in the annotation.

Accuracy score: correct notes with only minor issues.

Return ONLY a valid JSON object — no markdown fences, no explanation outside the JSON:
{
  "accuracy_score": <integer 0-100>,
  "teacher_summary": "<2-3 encouraging sentences as a teacher's comment — focus on what the student got right>",
  "issues": [
    {
      "type": "<one of: wrong_formula | spelling | conceptual_error>",
      "student_wrote": "<ONLY the specific wrong fragment — e.g. 'O', 'CuSO', '2Pb' — NOT the full equation>",
      "correct_version": "<what that fragment should be — e.g. 'O₂', 'CuSO₄', '2PbO'>",
      "description": "<one clear sentence explaining why this is wrong>",
      "severity": "<high for factually wrong, low for spelling>",
      "approx_line_pct": <integer 0-100: estimated vertical position of this specific wrong fragment in the image, 0=very top, 100=very bottom>,
      "approx_x_pct": <integer 0-100: estimated horizontal position of this specific wrong fragment, 0=left edge, 100=right edge>
    }
  ],
  "positives": [
    "<one specific thing the student wrote correctly>"
  ]
}`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const { chapter_id, image_urls } = await req.json() as {
      chapter_id:  string;
      image_urls:  string[];
    };

    if (!chapter_id)         return new Response("chapter_id required", { status: 400 });
    if (!image_urls?.length) return new Response("image_urls required", { status: 400 });
    if (image_urls.length > 5) return new Response("Maximum 5 images allowed", { status: 400 });

    const supabase = createAdminClient();

    // Get profileId (needed for annotation uploads)
    const { data: profileRow } = await supabase
      .from("profiles").select("id").eq("clerk_user_id", userId).single();
    const profileId = profileRow?.id ?? userId;

    // Fetch chapter with content for the teacher reference
    const { data: chapter } = await supabase
      .from("chapters")
      .select("id, chapter_title, subject, content_text")
      .eq("id", chapter_id)
      .single();

    if (!chapter) return new Response("Chapter not found", { status: 404 });

    const { chapter_title, subject, content_text } = chapter;

    if (!content_text) {
      return new Response("Chapter has no reference content", { status: 422 });
    }

    // Convert all images to base64 in parallel (same helper as evaluate-written)
    let imageParts: OpenAI.Chat.ChatCompletionContentPart[];
    try {
      imageParts = await Promise.all(image_urls.map(toBase64Part));
    } catch (e: any) {
      console.error("[correct-notes] image fetch failed:", e.message);
      return new Response("Failed to fetch one or more images", { status: 422 });
    }

    const systemPrompt = buildSystemPrompt(subject, chapter_title, content_text);

    // Call Vision model via OpenRouter
    // User message ends with the JSON schema to force Llama-style models to respond in JSON
    const res = await openai.chat.completions.create({
      model: CLAUDE_MODEL,
      messages: [
        {
          role:    "system",
          content: "You are a JSON-only API. Your entire response must be a single valid JSON object. Do not write any explanation, prose, or markdown — only the JSON object.",
        },
        {
          role: "user",
          content: [
            ...imageParts,
            {
              type: "text",
              text: `${systemPrompt}

Analyse the handwritten notes in the ${imageParts.length === 1 ? "image" : `${imageParts.length} images`} above and respond with ONLY this JSON object (fill in the values, no other text):
{
  "accuracy_score": 0,
  "teacher_summary": "",
  "issues": [],
  "positives": []
}`,
            },
          ],
        },
      ],
      max_tokens:      8192,
      temperature:     0,
      response_format: { type: "json_object" },
    });

    const rawText = res.choices[0]?.message?.content ?? "";

    // Robust JSON extraction — handles markdown fences, thinking preamble, trailing content
    let parsed: {
      accuracy_score:  number;
      teacher_summary: string;
      issues:          CorrectionIssue[];
      positives:       string[];
    };

    try {
      // Strip markdown fences
      let clean = rawText
        .replace(/^```json\s*/m, "")
        .replace(/^```\s*/m, "")
        .replace(/```\s*$/m, "")
        .trim();

      // If model added preamble before JSON, extract the first {...} block
      const jsonStart = clean.indexOf("{");
      const jsonEnd   = clean.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        clean = clean.slice(jsonStart, jsonEnd + 1);
      }

      parsed = JSON.parse(clean);
    } catch {
      console.error("[correct-notes] JSON parse failed:", rawText.slice(0, 600));
      return new Response("AI returned malformed response — please try again", { status: 502 });
    }

    // Sanitise + clamp
    const issues   = Array.isArray(parsed.issues)    ? parsed.issues    : [];
    const result = {
      accuracy_score:  Math.min(100, Math.max(0, parsed.accuracy_score ?? 0)),
      teacher_summary: parsed.teacher_summary ?? "",
      issues,
      positives:       Array.isArray(parsed.positives) ? parsed.positives : [],
      image_urls,
      annotated_image_urls: image_urls,   // default to originals; overwritten below
    };

    // Annotate pages with underlines, circles, ticks (non-fatal)
    try {
      const annotated = await annotateNotesSheets(image_urls, issues, profileId);
      result.annotated_image_urls = annotated;
    } catch (annotateErr: any) {
      console.error("[correct-notes] annotation failed (non-fatal):", annotateErr.message);
    }

    return Response.json(result);

  } catch (err: any) {
    const detail = err?.error ?? err?.message ?? err;
    console.error("[classroom/correct-notes]", JSON.stringify(detail, null, 2));
    const msg = err?.error?.message ?? err?.message ?? "Internal error";
    return new Response(msg, { status: err?.status ?? 500 });
  }
}

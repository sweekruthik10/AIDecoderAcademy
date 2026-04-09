/**
 * POST /api/classroom/evaluate-mcq
 * Body: { paper_id, question_ids: string[], answers: Record<string, number> }
 *
 * Evaluates answers against stored correct_index, stores attempt, returns score + feedback.
 */

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import type { MCQFeedbackItem } from "@/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const { paper_id, question_ids, answers, time_taken_secs } = await req.json() as {
      paper_id:         string;
      question_ids:     string[];
      answers:          Record<string, number>;
      time_taken_secs?: number;
    };

    if (!paper_id || !question_ids?.length) {
      return new Response("paper_id and question_ids required", { status: 400 });
    }

    const supabase = createAdminClient();

    // Resolve profile id
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();

    if (!profileRow) return new Response("Profile not found", { status: 404 });

    // Fetch full paper (with correct answers)
    const { data: paper } = await supabase
      .from("question_papers")
      .select("id, questions")
      .eq("id", paper_id)
      .single();

    if (!paper) return new Response("Paper not found", { status: 404 });

    const allQuestions: any[] = paper.questions as any[];
    const questionMap = new Map(allQuestions.map(q => [q.id, q]));

    // Evaluate
    let score = 0;
    const feedback: Record<string, MCQFeedbackItem> = {};

    for (const qId of question_ids) {
      const q = questionMap.get(qId);
      if (!q) continue;

      const chosen  = answers[qId] ?? -1;
      const correct = chosen === q.correct_index;
      if (correct) score++;

      feedback[qId] = {
        correct,
        correct_index: q.correct_index,
        explanation:   q.explanation ?? "",
      };
    }

    const maxScore = question_ids.length;

    // Store attempt
    await supabase.from("student_attempts").insert({
      profile_id:        profileRow.id,
      question_paper_id: paper_id,
      question_ids,
      answers,
      score,
      max_score:        maxScore,
      feedback,
      time_taken_secs:  time_taken_secs ?? null,
    });

    return Response.json({ score, max_score: maxScore, feedback });
  } catch (err) {
    console.error("[classroom/evaluate-mcq]", err);
    return new Response("Internal error", { status: 500 });
  }
}

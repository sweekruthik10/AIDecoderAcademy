/**
 * GET /api/classroom/paper?chapter_id=X&type=mcq
 *
 * Returns a randomly selected subset of questions for one attempt.
 * MCQ: 7 easy + 5 medium + 3 hard picked at random from the seeded bank of 40.
 * Correct answers are stripped before sending to the client.
 */

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

const EASY_COUNT   = 7;
const MEDIUM_COUNT = 5;
const HARD_COUNT   = 3;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const { searchParams } = new URL(req.url);
    const chapterId = searchParams.get("chapter_id");
    const type      = searchParams.get("type") ?? "mcq";

    if (!chapterId) return new Response("chapter_id required", { status: 400 });

    const supabase = createAdminClient();

    // Fetch chapter metadata
    const { data: chapter } = await supabase
      .from("chapters")
      .select("id, subject, chapter_number, chapter_title, grade, board")
      .eq("id", chapterId)
      .single();

    if (!chapter) return new Response("Chapter not found", { status: 404 });

    // Fetch the seeded question bank
    const { data: paper } = await supabase
      .from("question_papers")
      .select("id, questions, total_marks")
      .eq("chapter_id", chapterId)
      .eq("type", type)
      .maybeSingle();

    if (!paper) {
      return new Response(
        "Question bank not seeded for this chapter. Run: npm run seed:classroom",
        { status: 404 }
      );
    }

    const allQuestions: any[] = paper.questions as any[];

    if (type === "written") {
      // Written papers: return all questions, strip server-only fields
      const clientQuestions = allQuestions.map(
        ({ expected_answer: _ea, marking_scheme: _ms, ...q }) => q
      );
      return Response.json({
        paper_id:    paper.id,
        questions:   clientQuestions,
        total_marks: paper.total_marks,
        chapter,
      });
    }

    // MCQ: randomly pick the subset for this attempt
    const easy   = pickRandom(allQuestions.filter(q => q.difficulty === "easy"),   EASY_COUNT);
    const medium = pickRandom(allQuestions.filter(q => q.difficulty === "medium"), MEDIUM_COUNT);
    const hard   = pickRandom(allQuestions.filter(q => q.difficulty === "hard"),   HARD_COUNT);

    // Shuffle so difficulty order isn't predictable
    const selected = shuffle([...easy, ...medium, ...hard]);

    // Strip correct_index and explanation — never sent to the client
    const clientQuestions = selected.map(({ correct_index: _ci, explanation: _ex, ...q }) => q);

    return Response.json({
      paper_id:     paper.id,
      question_ids: selected.map(q => q.id),
      questions:    clientQuestions,
      total_marks:  selected.length,
      chapter,
    });
  } catch (err) {
    console.error("[classroom/paper]", err);
    return new Response("Internal error", { status: 500 });
  }
}

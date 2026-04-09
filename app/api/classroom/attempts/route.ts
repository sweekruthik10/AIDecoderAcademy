/**
 * GET /api/classroom/attempts?chapter_id=X
 * Returns the current student's past attempts for a chapter's MCQ paper.
 */

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const { searchParams } = new URL(req.url);
    const chapterId = searchParams.get("chapter_id");

    const supabase = createAdminClient();

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();

    if (!profileRow) return new Response("Profile not found", { status: 404 });

    let query = supabase
      .from("student_attempts")
      .select(`
        id, score, max_score, time_taken_secs, submitted_at,
        question_paper_id,
        question_papers ( chapter_id )
      `)
      .eq("profile_id", profileRow.id)
      .order("submitted_at", { ascending: false });

    if (chapterId) {
      // Filter by chapter via the join
      const { data: paper } = await supabase
        .from("question_papers")
        .select("id")
        .eq("chapter_id", chapterId)
        .eq("type", "mcq")
        .maybeSingle();

      if (paper) {
        query = query.eq("question_paper_id", paper.id);
      } else {
        return Response.json({ attempts: [] });
      }
    }

    const { data: attempts, error } = await query.limit(20);
    if (error) throw error;

    return Response.json({ attempts: attempts ?? [] });
  } catch (err) {
    console.error("[classroom/attempts]", err);
    return new Response("Internal error", { status: 500 });
  }
}

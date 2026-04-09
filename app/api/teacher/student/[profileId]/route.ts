/**
 * GET /api/teacher/student/[profileId]
 * Returns full detail for one student — for the teacher drill-down page.
 * Requires the caller to have a row in teacher_profiles.
 *
 * Response: {
 *   student:  profile fields + badges,
 *   summary:  { total_attempts, overall_avg_pct, best_subject, weakest_subject },
 *   subjects: { name, attempts, avg_score_pct }[],
 *   attempts: AttemptDetail[]
 * }
 */

import { auth }              from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { profileId } = await params;

  const supabase = createAdminClient();

  // Verify caller is a teacher
  const { data: teacherRow } = await supabase
    .from("teacher_profiles")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (!teacherRow) return new Response("Forbidden — teacher profile required", { status: 403 });

  // Fetch student profile
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_emoji, avatar_url, level, xp, streak_days, last_active_date, badges, created_at")
    .eq("id", profileId)
    .single();

  if (profileErr || !profile) return new Response("Student not found", { status: 404 });

  // Fetch all attempts for this student, with chapter + paper info
  const { data: attemptsRaw, error: attemptsErr } = await supabase
    .from("student_attempts")
    .select(`
      id, score, max_score, time_taken_secs, submitted_at,
      question_ids, answers, feedback,
      question_papers (
        id, type, questions,
        chapters ( chapter_title, subject )
      )
    `)
    .eq("profile_id", profileId)
    .order("submitted_at", { ascending: false });

  if (attemptsErr) {
    console.error("[teacher/student]", attemptsErr);
    return new Response("Internal error", { status: 500 });
  }

  // Build subject aggregates and attempt details
  const subjectAgg = new Map<string, { totalPct: number; count: number }>();
  const attempts: any[] = [];

  for (const a of attemptsRaw ?? []) {
    const paper   = a.question_papers as any;
    const chapter = paper?.chapters as any;
    const subject      = chapter?.subject      ?? "Unknown";
    const chapterTitle = chapter?.chapter_title ?? "Unknown";
    const type         = paper?.type            ?? "mcq";

    const pct = (a.max_score ?? 0) > 0 ? ((a.score ?? 0) / a.max_score) * 100 : 0;
    const agg = subjectAgg.get(subject) ?? { totalPct: 0, count: 0 };
    subjectAgg.set(subject, { totalPct: agg.totalPct + pct, count: agg.count + 1 });

    // For written attempts: extract annotated images + question text
    let annotated_image_urls: string[] | undefined;
    let writtenQuestions: { id: string; question: string; marks: number; section: string }[] | undefined;

    if (type === "written") {
      const ans = a.answers as any;
      annotated_image_urls = ans?.annotated_image_urls ?? ans?.image_urls ?? [];

      // Filter question_papers.questions down to the ones this student attempted
      const allQs: any[]    = Array.isArray(paper?.questions) ? paper.questions : [];
      const servedIds        = new Set<string>(a.question_ids ?? []);
      writtenQuestions = allQs
        .filter(q => servedIds.has(q.id))
        .map(q => ({ id: q.id, question: q.question, marks: q.marks, section: q.section ?? "" }));
    }

    attempts.push({
      id:                    a.id,
      chapter_title:         chapterTitle,
      subject,
      type,
      score:                 a.score     ?? 0,
      max_score:             a.max_score ?? 0,
      time_taken_secs:       a.time_taken_secs ?? null,
      submitted_at:          a.submitted_at,
      feedback:              type === "written" ? (a.feedback ?? {}) : undefined,
      annotated_image_urls:  type === "written" ? annotated_image_urls : undefined,
      written_questions:     type === "written" ? writtenQuestions    : undefined,
    });
  }

  // Build subjects summary sorted by avg desc
  const subjects = [...subjectAgg.entries()]
    .map(([name, agg]) => ({
      name,
      attempts:      agg.count,
      avg_score_pct: Math.round(agg.totalPct / agg.count),
    }))
    .sort((a, b) => b.avg_score_pct - a.avg_score_pct);

  // Summary card values
  const total_attempts   = attempts.length;
  const overall_avg_pct  = total_attempts > 0
    ? Math.round(subjects.reduce((s, sub) => s + sub.avg_score_pct * sub.attempts, 0) / total_attempts)
    : 0;
  const best_subject     = subjects.length > 0 ? subjects[0]!.name    : null;
  const weakest_subject  = subjects.length > 1 ? subjects.at(-1)!.name : null;

  return Response.json({
    student: {
      id:               profile.id,
      display_name:     profile.display_name,
      avatar_emoji:     profile.avatar_emoji,
      avatar_url:       profile.avatar_url  ?? null,
      level:            profile.level        ?? 1,
      xp:               profile.xp           ?? 0,
      streak_days:      profile.streak_days  ?? 0,
      last_active_date: profile.last_active_date ?? null,
      badges:           Array.isArray(profile.badges) ? profile.badges : [],
      created_at:       profile.created_at,
    },
    summary: { total_attempts, overall_avg_pct, best_subject, weakest_subject },
    subjects,
    attempts,
  });
}

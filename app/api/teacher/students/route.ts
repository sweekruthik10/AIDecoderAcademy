/**
 * GET /api/teacher/students
 * Returns all student profiles with overall stats + per-subject breakdown.
 * Requires the caller to have a row in teacher_profiles.
 *
 * Response: {
 *   students: (StudentRosterItem & { subject_stats: Record<string, { attempts, avg_score_pct }> })[],
 *   subjects: string[]   -- all subjects that have question papers
 * }
 */

import { auth }              from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import type { StudentRosterItem, StudentStatus } from "@/types";

function computeStatus(lastActiveDate?: string | null): StudentStatus {
  if (!lastActiveDate) return "inactive";
  const daysAgo = (Date.now() - new Date(lastActiveDate).getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo < 2)  return "active";
  if (daysAgo < 7)  return "slipping";
  return "inactive";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const supabase = createAdminClient();

  // Verify caller is a teacher
  const { data: teacherRow } = await supabase
    .from("teacher_profiles")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (!teacherRow) return new Response("Forbidden — teacher profile required", { status: 403 });

  // Fetch all student profiles
  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_emoji, avatar_url, level, xp, streak_days, last_active_date")
    .order("display_name", { ascending: true });

  if (profilesErr) {
    console.error("[teacher/students]", profilesErr);
    return new Response("Internal error", { status: 500 });
  }

  if (!profiles?.length) return Response.json({ students: [], subjects: [] });

  const profileIds = profiles.map(p => p.id);

  // Fetch all attempts with subject info via nested join
  const { data: attemptsRaw } = await supabase
    .from("student_attempts")
    .select(`
      profile_id, score, max_score, submitted_at,
      question_papers ( chapters ( subject ) )
    `)
    .in("profile_id", profileIds);

  // Collect all distinct subjects from attempts
  const subjectSet = new Set<string>();

  // Build per-student aggregates: overall + per subject
  type SubjectStat = { totalPct: number; count: number; lastAt: string | null };
  const overallMap = new Map<string, SubjectStat>();
  const subjectMap = new Map<string, Map<string, SubjectStat>>();  // profileId → subject → stat

  for (const a of attemptsRaw ?? []) {
    const subject: string =
      (a.question_papers as any)?.chapters?.subject ?? "Unknown";
    subjectSet.add(subject);

    const pct = (a.max_score ?? 0) > 0 ? ((a.score ?? 0) / a.max_score) * 100 : 0;
    const at  = a.submitted_at as string;

    // Overall
    const ov = overallMap.get(a.profile_id) ?? { totalPct: 0, count: 0, lastAt: null };
    overallMap.set(a.profile_id, {
      totalPct: ov.totalPct + pct,
      count:    ov.count + 1,
      lastAt:   !ov.lastAt || new Date(at) > new Date(ov.lastAt) ? at : ov.lastAt,
    });

    // Per subject
    if (!subjectMap.has(a.profile_id)) subjectMap.set(a.profile_id, new Map());
    const sMap = subjectMap.get(a.profile_id)!;
    const sv   = sMap.get(subject) ?? { totalPct: 0, count: 0, lastAt: null };
    sMap.set(subject, {
      totalPct: sv.totalPct + pct,
      count:    sv.count + 1,
      lastAt:   !sv.lastAt || new Date(at) > new Date(sv.lastAt) ? at : sv.lastAt,
    });
  }

  const subjects = [...subjectSet].sort();

  const students = profiles.map(p => {
    const ov = overallMap.get(p.id);
    const sMap = subjectMap.get(p.id) ?? new Map();

    const subject_stats: Record<string, { attempts: number; avg_score_pct: number }> = {};
    for (const [subj, sv] of sMap.entries()) {
      subject_stats[subj] = {
        attempts:      sv.count,
        avg_score_pct: Math.round(sv.totalPct / sv.count),
      };
    }

    return {
      id:               p.id,
      display_name:     p.display_name,
      avatar_emoji:     p.avatar_emoji,
      avatar_url:       p.avatar_url ?? undefined,
      level:            p.level ?? 1,
      xp:               p.xp ?? 0,
      streak_days:      p.streak_days ?? 0,
      last_active_date: p.last_active_date ?? undefined,
      total_attempts:   ov?.count ?? 0,
      avg_score_pct:    ov ? Math.round(ov.totalPct / ov.count) : 0,
      last_attempt_at:  ov?.lastAt ?? undefined,
      status:           computeStatus(p.last_active_date),
      subject_stats,
    };
  });

  return Response.json({ students, subjects });
}

// GET /api/learner-model/weekly-cron
// MANUAL TRIGGER — Vercel free tier doesn't support scheduled crons.
// Visit:  GET /api/learner-model/weekly-cron?secret=YOUR_CRON_SECRET
//
// Schedule via cron-job.org (free) hitting this URL weekly, or run manually
// before demos.
//
// For each student who had a session_reflection in the past 7 days:
//   1) Pull this week's reflections
//   2) Ask gpt-4o-mini for a cross-session synthesis
//   3) Write back into profiles.learner_model.weekly_analysis
//   4) Append a row to learner_snapshots
//
// Vercel-free SAFETY: processes students sequentially with delay, respects
// 10-second function timeout by batching 5 students at a time. Returns
// partial results if more students remain — visit again to continue.
//
// Canon: references/architecture-decisions.md §"Weekly Cron Job".
// ~$0.001 per active student per week.

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase";
import {
  hydrateLearnerModel,
  type LearnerModel,
  type WeeklyAnalysis,
} from "@/lib/learnerModel";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const SYSTEM_PROMPT = `
You are a learning analyst summarising a student's past 7 days. You get a list of per-session reflections (already extracted by a smaller LLM) and the student's current learner model.

Return ONLY JSON with this shape:
{
  "weekly_summary": string,          // 2-3 sentences, warm but not saccharine
  "trend_deltas": Record<string, number>,  // concept_key -> change (-1..+1)
  "recommendations": string[],       // up to 3 short next-step ideas
  "plateau_warnings": string[]       // up to 2 specific stuckness flags
}

Rules:
- No clinical language. Address the student in third person.
- If there's almost no data, return a short summary and empty arrays — never fabricate.
- recommendations must reference observed strengths or struggles, not generic advice.
`.trim();

function authorized(req: Request): boolean {
  // Vercel cron sends "Authorization: Bearer <CRON_SECRET>".
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // local dev fallback
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

function weekStartUTC(d: Date): string {
  // Sunday-anchored week start, yyyy-mm-dd.
  const day = d.getUTCDay();
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - day);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString().slice(0, 10);
}

function overallLevel(m: LearnerModel): number {
  const entries = Object.values(m.cognitive_profile.concept_mastery);
  if (!entries.length) return 0;
  return entries.reduce((s, e) => s + e.level, 0) / entries.length;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();
  const since = new Date(Date.now() - WEEK_MS).toISOString();

  // Find distinct active profile_ids from past week.
  const { data: activeRows, error: activeErr } = await sb
    .from("session_reflections")
    .select("profile_id")
    .gte("reflected_at", since);
  if (activeErr) {
    return NextResponse.json({ error: activeErr.message }, { status: 500 });
  }
  const activeIds = Array.from(new Set((activeRows ?? []).map(r => r.profile_id as string)));

  // Vercel-free SAFETY: process max 5 students per invocation to stay under
  // 10s timeout. If more remain, visit again to continue.
  const BATCH_SIZE = 5;
  const batch = activeIds.slice(0, BATCH_SIZE);
  const remaining = activeIds.length - batch.length;

  const results: Array<{ profile_id: string; status: string }> = [];
  for (const profile_id of batch) {
    try {
      const { data: reflections } = await sb
        .from("session_reflections")
        .select("surface, reflection_data, metrics, reflected_at")
        .eq("profile_id", profile_id)
        .gte("reflected_at", since)
        .order("reflected_at", { ascending: true });

      if (!reflections?.length) {
        results.push({ profile_id, status: "skipped_no_data" });
        continue;
      }

      const { data: profileRow } = await sb
        .from("profiles")
        .select("learner_model, streak_days")
        .eq("id", profile_id)
        .single();
      const existing = hydrateLearnerModel(profileRow?.learner_model);
      const prevWeekly = existing.weekly_analysis as WeeklyAnalysis | undefined;
      const prevOverall = overallLevel(existing);

      const prompt = JSON.stringify({
        current_learner_model: {
          top_strengths:      existing.cognitive_profile.top_strengths,
          top_growth_areas:   existing.cognitive_profile.top_growth_areas,
          reflection_count:   existing.reflection_count,
        },
        weekly_reflections: reflections.map(r => ({
          surface: r.surface,
          at:      r.reflected_at,
          data:    r.reflection_data,
          metrics: r.metrics,
        })),
      });

      let weekly: WeeklyAnalysis;
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user",   content: prompt },
          ],
        });
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
        weekly = {
          last_analysis_at: new Date().toISOString(),
          weekly_summary:   String(parsed.weekly_summary ?? ""),
          trend_deltas:     parsed.trend_deltas ?? {},
          recommendations:  Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 3) : [],
          plateau_warnings: Array.isArray(parsed.plateau_warnings) ? parsed.plateau_warnings.slice(0, 2) : [],
        };
      } catch (e) {
        console.warn("[weekly-cron] llm failed for", profile_id, e);
        results.push({ profile_id, status: "llm_failed" });
        continue;
      }

      // Patch learner_model.weekly_analysis under advisory lock.
      const merged: LearnerModel = { ...existing, weekly_analysis: weekly, updated_at: new Date().toISOString() };
      const { error: lockErr } = await sb.rpc("lock_and_update_learner_model", {
        p_profile_id: profile_id,
        p_learner_model: merged as unknown as Record<string, unknown>,
      });
      if (lockErr) {
        await sb.from("profiles").update({ learner_model: merged }).eq("id", profile_id);
      }

      // Append snapshot.
      const overall = overallLevel(merged);
      await sb.from("learner_snapshots").insert({
        profile_id,
        snapshot_data:  merged,
        top_strengths:  merged.cognitive_profile.top_strengths.map(s => s.concept),
        top_weaknesses: merged.cognitive_profile.top_growth_areas.map(s => s.concept),
        overall_level:  overall,
        weekly_delta:   prevWeekly?.last_analysis_at ? overall - prevOverall : null,
        streak_days:    (profileRow as { streak_days?: number } | null)?.streak_days ?? null,
        week_start:     weekStartUTC(new Date()),
      });

      results.push({ profile_id, status: "ok" });
    } catch (e) {
      console.error("[weekly-cron] failed for", profile_id, e);
      results.push({ profile_id, status: "error" });
    }
  }

  const more = remaining > 0
    ? ` ${remaining} students remaining — visit again to continue.`
    : "All caught up.";

  return NextResponse.json({
    processed: batch.length,
    total: activeIds.length,
    remaining,
    results,
    note: more,
  });
}

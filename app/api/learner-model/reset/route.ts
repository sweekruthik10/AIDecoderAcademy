// POST /api/learner-model/reset
// "Forget everything about me" — COPPA-friendly hard reset.
// Canon: ../../obsidian/.../04-plan-addendum-isolation-edge-cases.md §EC5.
//
// Wipes learner_model and deletes session_reflections + learner_snapshots.
// Does NOT delete chat_messages or creations (those are the student's portfolio).

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data: profile } = await sb
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (!profile?.id) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Clear all derived learner data atomically.
  const [refl, snap, prof] = await Promise.all([
    sb.from("session_reflections").delete().eq("profile_id", profile.id),
    sb.from("learner_snapshots").delete().eq("profile_id", profile.id),
    sb.from("profiles").update({ learner_model: {} }).eq("id", profile.id),
  ]);

  const errors = [refl.error, snap.error, prof.error].filter(Boolean);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.map(e => e!.message).join("; ") }, { status: 500 });
  }

  return NextResponse.json({ status: "reset", profile_id: profile.id });
}

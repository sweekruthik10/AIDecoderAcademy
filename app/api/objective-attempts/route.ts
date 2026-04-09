import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

// POST  — log a validation attempt (one row per "Validate my work" click).
// PATCH — mark a passing attempt as Complete (sets completed_at). XP is
//         awarded by calling the existing /api/xp route from the client
//         after PATCH succeeds, so all XP/badge logic stays in one place.

interface PostBody {
  objective_id: string;            // legacy id (e.g. 'a1-3')
  lms_id:       string;            // canonical id (e.g. 'l1-03')
  score:        number;
  tier:         "distinction" | "merit" | "pass" | "fail";
  passed:       boolean;
  feedback: {
    summary:      string;
    strengths:    string[];
    improvements: string[];
    hintForRetry: string | null;
  };
}

interface PatchBody {
  attempt_id: string;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as PostBody;
    if (!body?.objective_id || !body?.lms_id) {
      return NextResponse.json({ error: "Missing objective ids" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("clerk_user_id", userId).single();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // Determine attempt number = (count of prior attempts for this objective) + 1
    const { count } = await supabase
      .from("objective_attempts")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .eq("lms_id",     body.lms_id);

    const attemptNumber = (count ?? 0) + 1;

    const { data, error } = await supabase
      .from("objective_attempts")
      .insert({
        profile_id:     profile.id,
        objective_id:   body.objective_id,
        lms_id:         body.lms_id,
        score:          body.score,
        tier:           body.tier,
        passed:         body.passed,
        feedback:       body.feedback,
        attempt_number: attemptNumber,
      })
      .select("id, attempt_number")
      .single();

    if (error) {
      console.error("[objective-attempts POST]", error);
      return NextResponse.json({ error: "Failed to log attempt" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, attempt_id: data.id, attempt_number: data.attempt_number });
  } catch (err) {
    console.error("[objective-attempts POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as PatchBody;
    if (!body?.attempt_id) {
      return NextResponse.json({ error: "Missing attempt_id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("clerk_user_id", userId).single();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // Verify the attempt belongs to this profile and is passing.
    const { data: attempt, error: fetchErr } = await supabase
      .from("objective_attempts")
      .select("id, profile_id, passed, completed_at")
      .eq("id", body.attempt_id)
      .single();

    if (fetchErr || !attempt) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }
    if (attempt.profile_id !== profile.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!attempt.passed) {
      return NextResponse.json({ error: "Cannot complete a failing attempt" }, { status: 400 });
    }
    if (attempt.completed_at) {
      // Already marked complete — idempotent OK.
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }

    const { error: updateErr } = await supabase
      .from("objective_attempts")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", body.attempt_id);

    if (updateErr) {
      console.error("[objective-attempts PATCH]", updateErr);
      return NextResponse.json({ error: "Failed to mark complete" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[objective-attempts PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET — list a student's attempts (used for attempt history + attempts-aware
// validator copy). Accepts either ?lms_id= (canonical) or ?objective_id=
// (legacy arena-room id). Returns { attempts, count } so the validator copy
// mode can switch from "standard" to "metacognitive" after attempt 3.
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const lmsId       = searchParams.get("lms_id");
    const objectiveId = searchParams.get("objective_id");
    if (!lmsId && !objectiveId) {
      return NextResponse.json({ error: "Missing lms_id or objective_id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("clerk_user_id", userId).single();
    if (!profile) return NextResponse.json({ attempts: [], count: 0 });

    let query = supabase
      .from("objective_attempts")
      .select("id, score, tier, passed, feedback, attempt_number, created_at, completed_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false });

    if (lmsId)       query = query.eq("lms_id",       lmsId);
    if (objectiveId) query = query.eq("objective_id", objectiveId);

    const { data, error } = await query;
    if (error) {
      console.error("[objective-attempts GET]", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const rows = data ?? [];
    return NextResponse.json({ attempts: rows, count: rows.length });
  } catch (err) {
    console.error("[objective-attempts GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

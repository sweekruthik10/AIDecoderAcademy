import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const runtime     = "nodejs";
// Async submit — returns Modal call_id quickly. Vercel-free 10s safe.
export const maxDuration = 10;

const VIDEO_QUOTA_PER_ACCOUNT = 3;

export async function POST(req: Request) {
  try {
    const MODAL_SUBMIT_URL    = process.env.MODAL_WORKER_URL;
    const MODAL_SHARED_SECRET = process.env.MODAL_WORKER_SHARED_SECRET;
    if (!MODAL_SUBMIT_URL || !MODAL_SHARED_SECRET) {
      return NextResponse.json(
        { error: "Video worker not configured. Ask an admin to set MODAL_WORKER_URL and MODAL_WORKER_SHARED_SECRET in Vercel env." },
        { status: 503 },
      );
    }

    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt ?? "").trim();
    const targetSeconds = Math.max(8, Math.min(40, Number(body.targetSeconds ?? 20)));

    if (!prompt || prompt.length < 4) {
      return NextResponse.json({ error: "Prompt is too short" }, { status: 400 });
    }
    if (prompt.length > 600) {
      return NextResponse.json({ error: "Prompt is too long (max 600 chars)" }, { status: 400 });
    }

    const sb = createAdminClient();

    const { data: profile, error: profErr } = await sb
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", userId)
      .maybeSingle();
    if (profErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Quota — count completed video creations (no video_jobs table needed)
    const { count } = await sb
      .from("creations")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .eq("output_type", "video");
    if ((count ?? 0) >= VIDEO_QUOTA_PER_ACCOUNT) {
      return NextResponse.json(
        { error: `You've used all ${VIDEO_QUOTA_PER_ACCOUNT} videos for this account.`, quotaExceeded: true },
        { status: 429 },
      );
    }

    // Spawn Modal job — returns call_id immediately
    const modalRes = await fetch(MODAL_SUBMIT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        auth_token: MODAL_SHARED_SECRET,
        job_id: crypto.randomUUID(),
        prompt,
        target_seconds: targetSeconds,
      }),
    });

    const modalJson = await modalRes.json().catch(() => ({}));
    if (!modalRes.ok || modalJson.error || !modalJson.call_id) {
      console.error("[generate-video] modal submit failed", modalJson);
      return NextResponse.json(
        { error: modalJson.error || `Worker submit failed: HTTP ${modalRes.status}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ callId: modalJson.call_id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generate-video] fatal", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

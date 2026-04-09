import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime     = "nodejs";
export const maxDuration = 10;

export async function GET(req: Request) {
  try {
    const submitUrl = process.env.MODAL_WORKER_URL;
    const secret    = process.env.MODAL_WORKER_SHARED_SECRET;
    if (!submitUrl || !secret) {
      return NextResponse.json(
        { error: "Video worker not configured (MODAL_WORKER_URL / MODAL_WORKER_SHARED_SECRET missing)" },
        { status: 503 },
      );
    }
    const modalStatusUrl = submitUrl.replace("-submit.", "-status.");

    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const callId = url.searchParams.get("callId");
    if (!callId) return NextResponse.json({ error: "Missing callId" }, { status: 400 });

    const modalRes = await fetch(modalStatusUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auth_token: secret, call_id: callId }),
    });
    const j = await modalRes.json().catch(() => ({}));

    if (!modalRes.ok || j.error) {
      return NextResponse.json({ error: j.error ?? `HTTP ${modalRes.status}` }, { status: 502 });
    }

    if (j.status === "running") return NextResponse.json({ status: "running" });
    if (j.status === "failed")  return NextResponse.json({ status: "failed", error: j.error });
    if (j.status === "done") {
      return NextResponse.json({
        status:          "done",
        videoUrl:        j.video_url,
        title:           j.title,
        durationSeconds: j.duration_seconds,
        shotCount:       j.shot_count,
        modelUsed:       j.model_used,
      });
    }
    return NextResponse.json({ status: "running" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

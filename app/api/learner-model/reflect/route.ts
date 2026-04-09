// POST /api/learner-model/reflect
// Body: { profile_id, session_id, surface, messages[], metrics, session_started_at, session_ended_at? }
// Fire-and-forget from session-end hooks. Internally rate-limited.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { reflectAndMerge } from "@/lib/learnerModel/reflect";
import type { ReflectionSurface, SessionMetrics } from "@/lib/learnerModel";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_SURFACES: ReflectionSurface[] = [
  "aida_chat","playground","validator","classroom_test",
  "classroom_teacher","diagnostic","weekly_cron",
];

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const b = body as {
    profile_id?: string;
    session_id?: string | null;
    surface?: string;
    messages?: Array<{ role: "user"|"assistant"|"system"; content: string }>;
    metrics?: SessionMetrics;
    session_started_at?: string;
    session_ended_at?: string;
  };

  if (!b.profile_id || !Array.isArray(b.messages) || !b.session_started_at) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const surface = (b.surface ?? "aida_chat") as ReflectionSurface;
  if (!VALID_SURFACES.includes(surface)) {
    return NextResponse.json({ error: "Invalid surface" }, { status: 400 });
  }

  const result = await reflectAndMerge({
    profile_id:         b.profile_id,
    session_id:         b.session_id ?? null,
    surface,
    messages:           b.messages,
    metrics:            b.metrics,
    session_started_at: b.session_started_at,
    session_ended_at:   b.session_ended_at,
  });

  return NextResponse.json(result);
}

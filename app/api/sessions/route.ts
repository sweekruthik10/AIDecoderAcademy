import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

async function getProfileId(userId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles").select("id").eq("clerk_user_id", userId).single();
  return data?.id ?? null;
}

// GET /api/sessions — list last 10 sessions for sidebar
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = await getProfileId(userId);
  if (!profileId) return NextResponse.json({ sessions: [] });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("id, title, mode, message_count, started_at, ended_at")
    .eq("profile_id", profileId)
    .gt("message_count", 0)
    .order("started_at", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

// POST /api/sessions — start new session
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = await getProfileId(userId);
  if (!profileId) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { mode } = await req.json();
  const supabase = createAdminClient();

  // Enforce 10 chat limit — delete oldest if over
  // Only count sessions with actual messages toward the 10 limit
  const { data: existing } = await supabase
    .from("sessions")
    .select("id, started_at")
    .eq("profile_id", profileId)
    .gt("message_count", 0)
    .order("started_at", { ascending: true });

  if (existing && existing.length >= 10) {
    const toDelete = existing.slice(0, existing.length - 9);
    await supabase.from("sessions").delete()
      .in("id", toDelete.map((s: { id: string }) => s.id));
  }

  // Also clean up any abandoned empty sessions older than 1 hour
  await supabase.from("sessions")
    .delete()
    .eq("profile_id", profileId)
    .eq("message_count", 0)
    .lt("started_at", new Date(Date.now() - 3600000).toISOString());

  const { data, error } = await supabase
    .from("sessions")
    .insert({ profile_id: profileId, mode })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data }, { status: 201 });
}

// PATCH /api/sessions — update title or close session
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { session_id, title, ended_at } = await req.json();
  const supabase = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (title) updates.title = title;
  if (ended_at) updates.ended_at = new Date().toISOString();

  const { data: session, error } = await supabase
    .from("sessions")
    .update(updates)
    .eq("id", session_id)
    .select("id, profile_id, mode, started_at, message_count")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire-and-forget adaptive learner reflection on session close.
  if (ended_at && session && session.message_count > 0) {
    void runReflectionForSession(session).catch((e) => {
      console.warn("[sessions] reflection enqueue failed", e);
    });
  }

  return NextResponse.json({ ok: true });
}

async function runReflectionForSession(session: {
  id: string;
  profile_id: string;
  mode: string;
  started_at: string;
  message_count: number;
}) {
  const sb = createAdminClient();
  const { data: messages } = await sb
    .from("chat_messages")
    .select("role, content, output_type, created_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  if (!messages || messages.length === 0) return;

  const outputTypes = Array.from(
    new Set((messages as Array<{ output_type?: string | null }>).map(m => m.output_type).filter(Boolean) as string[])
  );

  // Map playground modes to a reflection surface.
  const surface: "playground" | "aida_chat" =
    session.mode === "code" || session.mode === "art" || session.mode === "story" || session.mode === "quiz" || session.mode === "free"
      ? "playground"
      : "aida_chat";

  // Lazy import to avoid pulling OpenAI into the cold path on every PATCH.
  const { reflectAndMerge } = await import("@/lib/learnerModel/reflect");
  await reflectAndMerge({
    profile_id:         session.profile_id,
    session_id:         session.id,
    surface,
    messages: messages.map(m => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: String(m.content ?? ""),
    })),
    metrics: {
      message_count:      messages.length,
      user_message_count: messages.filter(m => m.role === "user").length,
      output_types_used:  outputTypes,
      session_duration_minutes:
        (Date.now() - new Date(session.started_at).getTime()) / 60000,
    },
    session_started_at: session.started_at,
    session_ended_at:   new Date().toISOString(),
  });
}
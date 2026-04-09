import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;
  const supabase = createAdminClient();

  // Get the profile for this user
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (!profile) return NextResponse.json({ messages: [] });

  // Verify session belongs to this profile
  const { data: session } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("profile_id", profile.id)
    .single();

  if (!session) {
    console.warn(`[sessions/messages] Session ${sessionId} not found for profile ${profile.id}`);
    return NextResponse.json({ messages: [] });
  }

  // Fetch all messages for this session
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, output_type, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[sessions/messages] DB error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[sessions/messages] Loaded ${data?.length ?? 0} messages for session ${sessionId}`);
  return NextResponse.json({ messages: data ?? [] });
}
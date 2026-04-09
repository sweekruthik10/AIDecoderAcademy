import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

// POST /api/sessions/messages-save
// Saves user + assistant message pair for non-text output types (image, audio, slides)

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { session_id, user_content, assistant_content, output_type } = await req.json();
    if (!session_id || !assistant_content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get profile UUID
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("clerk_user_id", userId).single();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // Verify session belongs to this user
    const { data: session } = await supabase
      .from("sessions").select("id")
      .eq("id", session_id).eq("profile_id", profile.id).single();
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const inserts = [];

    // Save user message if provided
    if (user_content) {
      inserts.push({
        session_id,
        profile_id:  profile.id,
        role:        "user",
        content:     user_content,
        output_type: "text",
      });
    }

    // Save assistant message with correct output_type
    inserts.push({
      session_id,
      profile_id:  profile.id,
      role:        "assistant",
      content:     assistant_content,
      output_type: output_type ?? "text",
    });

    const { error } = await supabase.from("chat_messages").insert(inserts);
    if (error) {
      console.error("[messages-save]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Increment message count
    await supabase.rpc("increment_message_count", { sid: session_id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[messages-save]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
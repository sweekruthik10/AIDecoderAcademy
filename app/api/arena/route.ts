import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { ARENAS } from "@/lib/arenas";

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { arena_id } = await req.json();
    const supabase = createAdminClient();

    const { data: profile } = await supabase
      .from("profiles").select("id, level").eq("clerk_user_id", userId).single();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const arena = ARENAS.find(a => a.id === arena_id);
    if (!arena) return NextResponse.json({ error: "Arena not found" }, { status: 404 });
    if (arena.unlockLevel > profile.level) {
      return NextResponse.json({ error: "Arena not unlocked yet" }, { status: 403 });
    }

    await supabase.from("profiles").update({ active_arena: arena_id }).eq("id", profile.id);
    return NextResponse.json({ ok: true, arena_id });
  } catch (err) {
    console.error("[arena]", err);
    return NextResponse.json({ error: "Failed to switch arena" }, { status: 500 });
  }
}
import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = createAdminClient();

  // Fetch creation by share_token, only if public
  const { data: creation, error } = await supabase
    .from("creations")
    .select("id, title, output_type, content, tags, created_at, is_public, share_token, profile_id")
    .eq("share_token", token)
    .eq("is_public", true)
    .single();

  if (error || !creation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch creator's first name only (no email, no avatar_url)
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_emoji, active_arena")
    .eq("id", creation.profile_id)
    .single();

  const displayName = profile?.display_name ?? "A student";
  const firstName   = displayName.split(" ")[0];

  return NextResponse.json({
    creation: {
      id:          creation.id,
      title:       creation.title,
      output_type: creation.output_type,
      content:     creation.content,
      tags:        creation.tags ?? [],
      created_at:  creation.created_at,
      share_token: creation.share_token,
    },
    creator: {
      first_name:   firstName,
      avatar_emoji: profile?.avatar_emoji ?? "🎓",
      active_arena: profile?.active_arena ?? 1,
    },
  });
}

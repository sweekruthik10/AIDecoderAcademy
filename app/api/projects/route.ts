import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

async function getProfileId(userId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles").select("id").eq("clerk_user_id", userId).single();
  return data?.id ?? null;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = await getProfileId(userId);
  if (!profileId) return NextResponse.json({ projects: [] });

  const supabase = createAdminClient();

  // Single query — get projects + creation counts in one shot using Supabase's
  // relation count syntax instead of N+1 separate queries
  const { data, error } = await supabase
    .from("projects")
    .select("*, creations(count)")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const projects = (data ?? []).map(p => ({
    ...p,
    creation_count: (p.creations as unknown as { count: number }[])?.[0]?.count ?? 0,
    creations: undefined, // don't leak full creations array
  }));

  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = await getProfileId(userId);
  if (!profileId) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ profile_id: profileId, name: name.trim() })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = await getProfileId(userId);

  const { id } = await req.json();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("projects").delete().eq("id", id).eq("profile_id", profileId!);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
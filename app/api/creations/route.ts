import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertCreation, deleteCreation } from "@/lib/pinecone";

const CreationSchema = z.object({
  title:       z.string().min(1).max(100),
  type:        z.enum(["story","code","art","quiz","chat","mixed"]),
  output_type: z.enum(["text","json","image","audio","slides","video"]).default("text"),
  content:     z.string().min(1),
  prompt_used: z.string().optional(),
  session_id:  z.string().uuid().optional(),
  project_id:  z.string().uuid().optional(),
  tags:        z.array(z.string()).default([]),
});

async function getProfileId(userId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles").select("id").eq("clerk_user_id", userId).single();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = await getProfileId(userId);
  if (!profileId) return NextResponse.json({ creations: [] });

  const { searchParams } = new URL(req.url);
  const type        = searchParams.get("type");
  const output_type = searchParams.get("output_type");
  const project_id  = searchParams.get("project_id");
  const search      = searchParams.get("search");
  const limit       = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const offset      = Number(searchParams.get("offset") ?? 0);

  const supabase = createAdminClient();
  let query = supabase
    .from("creations").select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type)        query = query.eq("type", type);
  if (output_type) query = query.eq("output_type", output_type);
  if (project_id === "unorganized") query = query.is("project_id", null);
  else if (project_id) query = query.eq("project_id", project_id);
  if (search) query = query.ilike("title", `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ creations: data ?? [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = await getProfileId(userId);
  if (!profileId) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const body = await req.json();
  const parsed = CreationSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("creations")
    .insert({ profile_id: profileId, ...parsed.data })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Upsert to Pinecone for context retrieval — non-blocking, fail silently
  upsertCreation({
    id:          data.id,
    profileId,
    title:       data.title,
    content:     data.content,
    outputType:  data.output_type,
    tags:        data.tags ?? [],
    promptUsed:  data.prompt_used ?? "",
  }).catch(err => console.error("[Pinecone] Upsert failed:", err));

  return NextResponse.json({ creation: data }, { status: 201 });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = await getProfileId(userId);

  const { id, is_favourite, project_id, title } = await req.json();
  const supabase = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (is_favourite !== undefined) updates.is_favourite = is_favourite;
  if (project_id !== undefined) updates.project_id = project_id;
  if (title !== undefined) updates.title = title;

  const { data, error } = await supabase
    .from("creations").update(updates)
    .eq("id", id).eq("profile_id", profileId!).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ creation: data });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = await getProfileId(userId);

  const { id } = await req.json();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("creations").delete().eq("id", id).eq("profile_id", profileId!);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Delete from Pinecone — non-blocking, fail silently
  if (profileId) {
    deleteCreation(id, profileId).catch(err => console.error("[Pinecone] Delete failed:", err));
  }

  return NextResponse.json({ ok: true });
}
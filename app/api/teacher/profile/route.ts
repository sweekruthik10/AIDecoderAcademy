/**
 * GET  /api/teacher/profile  — returns { teacher: TeacherProfile | null }
 * POST /api/teacher/profile  — creates/updates teacher profile
 *   Body: { display_name: string }
 *   Returns: { teacher: TeacherProfile }
 */

import { auth }              from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import type { TeacherProfile } from "@/types";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("*")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[teacher/profile GET]", error);
    return new Response("Internal error", { status: 500 });
  }

  return Response.json({ teacher: (data as TeacherProfile | null) });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { display_name } = await req.json() as { display_name: string };
  if (!display_name?.trim()) return new Response("display_name required", { status: 400 });

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("teacher_profiles")
    .upsert(
      { clerk_user_id: userId, display_name: display_name.trim() },
      { onConflict: "clerk_user_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("[teacher/profile POST]", error);
    return new Response("Internal error", { status: 500 });
  }

  return Response.json({ teacher: data as TeacherProfile });
}

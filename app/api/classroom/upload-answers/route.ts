/**
 * POST /api/classroom/upload-answers
 * Accepts a single image file as multipart/form-data (field: "file").
 * Uploads to Supabase Storage under answer-sheets/{profileId}/{timestamp}-{n}.jpg
 * Returns: { url: string }
 *
 * Call once per image. The client accumulates URLs and passes them to evaluate-written.
 */

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const supabase = createAdminClient();

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();

    if (!profileRow) return new Response("Profile not found", { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return new Response("No file provided", { status: 400 });

    const ext      = file.type === "image/png" ? "png" : "jpg";
    const path     = `answer-sheets/${profileRow.id}/${Date.now()}.${ext}`;
    const buffer   = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabase.storage
      .from("creations-media")
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabase.storage
      .from("creations-media")
      .getPublicUrl(path);

    return Response.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error("[classroom/upload-answers]", err);
    return new Response("Upload failed", { status: 500 });
  }
}

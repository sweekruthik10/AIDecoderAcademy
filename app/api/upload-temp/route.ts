import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const runtime     = "nodejs";
export const maxDuration = 30;

// Temporary file upload — stores uploaded files (images, PDFs, audio) in
// Supabase Storage under `creations-media/temp/{userId}/...` and returns
// a public URL.  The client swaps out the local data-URL on the chip
// with this persistent URL so the generation APIs can fetch it directly.
// Temp files are never auto-deleted (they're small); the bucket limit is fine.

const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "application/pdf"];
const ALLOWED_MIME_EXACT    = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // Validate type
    const mime = file.type.toLowerCase();
    const allowed =
      ALLOWED_MIME_PREFIXES.some(p => mime.startsWith(p)) ||
      ALLOWED_MIME_EXACT.includes(mime);
    if (!allowed) {
      return NextResponse.json({ error: `File type not supported: ${mime}` }, { status: 415 });
    }

    // Validate size
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
    }

    const supabase = createAdminClient();

    // Sanitise filename — keep original extension, strip special chars
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const path     = `temp/${userId}/${Date.now()}_${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("creations-media")
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("[upload-temp]", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabase.storage.from("creations-media").getPublicUrl(path);

    return NextResponse.json({
      url:  data.publicUrl,
      name: file.name,
      type: file.type,
      size: file.size,
    });
  } catch (err) {
    console.error("[upload-temp]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}

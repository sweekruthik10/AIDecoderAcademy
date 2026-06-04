import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const runtime     = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

const WORKSHEET_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const IMAGE_MIME = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
]);

type Kind = "worksheet" | "image";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url  = new URL(req.url);
  const kind = url.searchParams.get("kind") as Kind | null;
  if (kind !== "worksheet" && kind !== "image") {
    return NextResponse.json({ error: "Missing or invalid ?kind= (worksheet|image)" }, { status: 400 });
  }

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 413 });

  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const allowedByMime = kind === "worksheet" ? WORKSHEET_MIME.has(file.type) : IMAGE_MIME.has(file.type);
  const allowedByExt  = kind === "worksheet" ? (ext === "pdf" || ext === "docx") : ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);

  if (!allowedByMime && !allowedByExt) {
    const accept = kind === "worksheet" ? ".pdf or .docx" : ".png/.jpg/.webp/.gif";
    return NextResponse.json({ error: `Unsupported ${kind} type — please upload ${accept}` }, { status: 415 });
  }

  const bytes    = await file.arrayBuffer();
  const buffer   = Buffer.from(bytes);
  const baseName = (file.name.replace(/\.[^.]+$/, "") || kind).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || kind;
  const stamp    = Date.now();
  const path     = `obj3-submissions/${userId}/${kind}-${stamp}-${baseName}.${ext}`;

  const supabase = createAdminClient();
  const { error } = await supabase.storage.from("creations-media").upload(path, buffer, {
    contentType: file.type || (kind === "worksheet" ? "application/octet-stream" : "image/png"),
    upsert: false,
  });

  if (error) {
    console.error("[obj3-upload] supabase upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from("creations-media").getPublicUrl(path);
  return NextResponse.json({
    url: data.publicUrl, kind, filename: file.name,
    format: kind === "worksheet" ? (ext === "pdf" ? "pdf" : "docx") : undefined,
  });
}

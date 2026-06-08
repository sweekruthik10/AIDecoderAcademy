import { auth }          from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

// GET /api/worksheet-drafts?lmsId=l1-02
// Returns the latest saved draft for the current user + objective.
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return json({ draft: null }, 401);

    const lmsId = new URL(req.url).searchParams.get("lmsId");
    if (!lmsId) return json({ draft: null }, 400);

    const { data: profile } = await createAdminClient()
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();
    if (!profile) return json({ draft: null }, 404);

    const { data: draft } = await createAdminClient()
      .from("worksheet_drafts")
      .select("*")
      .eq("profile_id", profile.id)
      .eq("lms_id", lmsId)
      .single();

    return json({ draft: draft ?? null });
  } catch {
    return json({ draft: null }, 500);
  }
}

// PUT /api/worksheet-drafts
// Upserts (creates or updates) the draft for the current user + objective.
// Body: { lmsId, data, notes?, worksheetFileUrl?, worksheetFileName?, worksheetFileFormat? }
export async function PUT(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return json({ ok: false }, 401);

    const body = await req.json() as {
      lmsId:                string;
      data:                 Record<string, string | boolean>;
      notes?:               string;
      worksheetFileUrl?:    string;
      worksheetFileName?:   string;
      worksheetFileFormat?: "pdf" | "docx";
    };

    if (!body?.lmsId || !body?.data) return json({ ok: false }, 400);

    const { data: profile } = await createAdminClient()
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();
    if (!profile) return json({ ok: false }, 404);

    const hasContent = Object.values(body.data).some(v =>
      typeof v === "string" ? v.trim().length > 0 : v === true,
    );
    if (!hasContent && !body.notes?.trim()) return json({ ok: true }); // nothing worth saving

    const { error } = await createAdminClient()
      .from("worksheet_drafts")
      .upsert(
        {
          profile_id:           profile.id,
          lms_id:               body.lmsId,
          data:                 body.data,
          notes:                body.notes  ?? null,
          worksheet_file_url:   body.worksheetFileUrl  ?? null,
          worksheet_file_name:  body.worksheetFileName ?? null,
          worksheet_file_format: body.worksheetFileFormat ?? null,
          updated_at:           new Date().toISOString(),
        },
        { onConflict: "profile_id,lms_id" },
      );

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

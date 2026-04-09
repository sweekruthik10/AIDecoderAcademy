import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const supabase = createAdminClient();

    const { data: chapters, error } = await supabase
      .from("chapters")
      .select("id, subject, chapter_number, chapter_title, grade, board, created_at")
      .order("chapter_number", { ascending: true });

    if (error) throw error;

    // Group by subject
    const grouped: Record<string, typeof chapters> = {};
    for (const ch of chapters ?? []) {
      if (!grouped[ch.subject]) grouped[ch.subject] = [];
      grouped[ch.subject]!.push(ch);
    }

    return Response.json({ chapters: chapters ?? [], grouped });
  } catch (err) {
    console.error("[classroom/chapters]", err);
    return new Response("Internal error", { status: 500 });
  }
}

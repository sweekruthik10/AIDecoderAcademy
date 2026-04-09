// GET /api/context?query=<text>&limit=5
// Returns top-K relevant past creations for the current child

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import { queryContext } from "@/lib/pinecone";
import { NextResponse } from "next/server";

async function getProfileId(userId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles").select("id").eq("clerk_user_id", userId).single();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profileId = await getProfileId(userId);
    if (!profileId) return NextResponse.json({ context: [] });

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") ?? "";
    const limit = Math.min(Number(searchParams.get("limit") ?? 5), 10);

    if (!query.trim()) return NextResponse.json({ context: [] });

    const results = await queryContext({ profileId, query, topK: limit });

    return NextResponse.json({ context: results });
  } catch (err) {
    console.error("[context]", err);
    return NextResponse.json({ context: [] }); // fail silently — context is optional
  }
}
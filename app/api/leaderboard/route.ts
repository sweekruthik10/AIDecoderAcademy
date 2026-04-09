import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  const { data: rawEntries } = await supabase
    .from("profiles")
    .select("display_name, avatar_emoji, xp, level, streak_days, active_arena, clerk_user_id")
    .order("xp", { ascending: false })
    .limit(10);

  if (!rawEntries) {
    return NextResponse.json({ top10: [], currentUserRank: null, currentUserEntry: null, isInTop10: false });
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, avatar_emoji, xp, level, streak_days, active_arena")
    .eq("clerk_user_id", userId)
    .single();

  const top10 = rawEntries.map((entry, i) => ({
    display_name: entry.display_name,
    avatar_emoji: entry.avatar_emoji,
    xp: entry.xp,
    level: entry.level,
    streak_days: entry.streak_days ?? 0,
    active_arena: entry.active_arena ?? 1,
    rank: i + 1,
    is_current_user: entry.clerk_user_id === userId,
  }));

  const isInTop10 = top10.some(e => e.is_current_user);

  let currentUserEntry = null;
  let currentUserRank: number | null = null;

  if (me) {
    if (isInTop10) {
      currentUserRank = top10.find(e => e.is_current_user)?.rank ?? null;
    } else {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gt("xp", me.xp);

      currentUserRank = (count ?? 0) + 1;
      currentUserEntry = {
        display_name: me.display_name,
        avatar_emoji: me.avatar_emoji,
        xp: me.xp,
        level: me.level,
        streak_days: me.streak_days ?? 0,
        active_arena: me.active_arena ?? 1,
        rank: currentUserRank,
        is_current_user: true,
      };
    }
  }

  return NextResponse.json({ top10, currentUserRank, currentUserEntry, isInTop10 });
}

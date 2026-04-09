import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import {
  XP_REWARDS, getLevelFromXP, BADGES, getXPForNextLevel, ARENAS,
  type Badge,
} from "@/lib/arenas";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { event_type, meta = {} } = await req.json();
    const baseReward = XP_REWARDS[event_type];
    if (baseReward === undefined) return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
    // Variable-reward events (e.g. objective_complete) use meta.xp.
    const xpEarned = baseReward > 0 ? baseReward : Number(meta.xp ?? 0);
    if (!xpEarned || xpEarned <= 0) return NextResponse.json({ error: "Missing xp amount" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: profile } = await supabase
      .from("profiles").select("*").eq("clerk_user_id", userId).single();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const oldXP    = profile.xp    ?? 0;
    const oldLevel = profile.level ?? 1;
    const newXP    = oldXP + xpEarned;
    const newLevel = getLevelFromXP(newXP);

    // ─── Streak logic ──────────────────────────────────────────────
    const today        = new Date().toISOString().split("T")[0];
    const lastActive   = profile.last_active_date;
    const yesterday    = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    let   streakDays   = profile.streak_days ?? 0;
    let   streakBonus  = 0;

    if (lastActive !== today) {
      if (lastActive === yesterday) {
        streakDays += 1;
      } else {
        streakDays = 1; // reset
      }
      if (streakDays >= 3) streakBonus = XP_REWARDS.daily_streak;
    }

    // ─── Badge checks ──────────────────────────────────────────────
    const earnedBadges: string[] = (profile.badges ?? []).map((b: { id: string }) => b.id);
    const newBadges: { id: string; earned_at: string }[] = [];

    const checkBadge = (id: string, condition: boolean) => {
      if (condition && !earnedBadges.includes(id)) {
        newBadges.push({ id, earned_at: new Date().toISOString() });
        earnedBadges.push(id);
      }
    };

    // Count creations for badge checks
    const { count: creationCount } = await supabase
      .from("creations").select("*", { count: "exact", head: true })
      .eq("profile_id", profile.id);

    // Count distinct output types used
    const { data: outputTypes } = await supabase
      .from("creations").select("output_type")
      .eq("profile_id", profile.id);
    const distinctTypes = new Set((outputTypes ?? []).map((c: { output_type: string }) => c.output_type));

    checkBadge("first_creation",  (creationCount ?? 0) >= 1);
    checkBadge("librarian",       (creationCount ?? 0) >= 10);
    checkBadge("prolific",        (creationCount ?? 0) >= 25);
    checkBadge("image_maker",     event_type === "generate_image");
    checkBadge("voice_actor",     event_type === "generate_audio");
    checkBadge("slide_master",    event_type === "generate_slides");
    checkBadge("all_tools",       distinctTypes.size >= 5);
    checkBadge("streak_3",        streakDays >= 3);
    checkBadge("streak_7",        streakDays >= 7);
    checkBadge("prompt_lab",      newLevel >= 2);
    checkBadge("story_forge",     newLevel >= 3);
    checkBadge("visual_studio",   newLevel >= 4);
    checkBadge("sound_booth",     newLevel >= 5);
    checkBadge("directors_suite", newLevel >= 6);

    const finalBadges = [...(profile.badges ?? []), ...newBadges];
    const finalXP     = newXP + streakBonus;

    // ─── Update profile ────────────────────────────────────────────
    await supabase.from("profiles").update({
      xp:               finalXP,
      level:            newLevel,
      streak_days:      streakDays,
      last_active_date: today,
      badges:           finalBadges,
    }).eq("id", profile.id);

    // ─── Log XP event ──────────────────────────────────────────────
    await supabase.from("xp_events").insert({
      profile_id: profile.id,
      event_type,
      xp_earned:  xpEarned + streakBonus,
      meta,
    });

    const leveledUp     = newLevel > oldLevel;
    const unlockedArenaId = leveledUp
      ? (ARENAS.find(a => a.unlockLevel === newLevel)?.id ?? null)
      : null;

    const badgeDetails = newBadges.map(b => {
      const def = BADGES.find(bd => bd.id === b.id);
      return def ? { ...def, earned_at: b.earned_at } : null;
    }).filter(Boolean) as (Badge & { earned_at: string })[];

    return NextResponse.json({
      xp_earned:      xpEarned + streakBonus,
      streak_bonus:   streakBonus,
      total_xp:       finalXP,
      level:          newLevel,
      leveled_up:     leveledUp,
      unlocked_arena_id: unlockedArenaId,
      new_badges:     badgeDetails,
      streak_days:    streakDays,
      xp_to_next:     getXPForNextLevel(newLevel) - finalXP,
    });
  } catch (err) {
    console.error("[xp]", err);
    return NextResponse.json({ error: "Failed to award XP" }, { status: 500 });
  }
}
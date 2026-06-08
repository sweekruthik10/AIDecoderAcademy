"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { CreationsRoom }     from "@/components/playground/CreationsRoom";
import { SaveCreationModal } from "@/components/playground/SaveCreationModal";
import { TeacherCharacter }  from "@/components/playground/TeacherCharacter";
import { WorksheetIcon }     from "@/components/playground/WorksheetIcon";
import { WorksheetPopup }    from "@/components/playground/WorksheetPopup";
import { getWorksheetSchema } from "@/lib/worksheetSchemas";
import { BadgeUnlockToast }  from "@/components/gamification/BadgeUnlockToast";
import { XPFlash }           from "@/components/gamification/XPFlash";
import { useChat }           from "@/components/playground/useChat";
import { useXP, type XPResult } from "@/lib/useXP";
import { getArena, type Badge } from "@/lib/arenas";
import { markObjectiveComplete, getObjectiveById, normalizeObjectiveId } from "@/lib/objectives";
import type { Profile, PlaygroundMode, OutputType } from "@/types";

// ── helpers ────────────────────────────────────────────────────────────────

function mergeProfileFromXp(p: Profile, r: XPResult): Profile {
  const ids   = new Set((p.badges ?? []).map(b => b.id));
  const added = (r.new_badges ?? [])
    .filter(b => !ids.has(b.id))
    .map(b => ({ id: b.id, earned_at: b.earned_at }));
  return {
    ...p,
    xp:          r.total_xp,
    level:       r.level,
    streak_days: r.streak_days,
    badges:      [...(p.badges ?? []), ...added],
  };
}

// Only treat user's message as a modification request if it uses words that clearly
// refer back to something already generated. Without this guard, every second image/
// audio/slides request was silently treated as an edit of the previous one.
const MODIFICATION_RE = /\b(make|change|modify|update|adjust|redo|edit|alter|improve|transform|add|remove|darker|lighter|brighter|different version|another version|same but|like (this|that) but|keep|instead|instead of|rewrite|regenerate|tweak|refine|revise|continue|extend|expand|shorten|simplify|translate)\b/i;

function isModificationRequest(text: string): boolean {
  return MODIFICATION_RE.test(text);
}

function buildPreviousOutputContext(
  messages: Array<{ role: string; content: string; outputType?: string; isLoading?: boolean }>,
  outputType: string,
  userText: string,
): string {
  if (!isModificationRequest(userText)) return "";
  const last = [...messages]
    .reverse()
    .find(m => m.role === "assistant" && m.outputType === outputType && !m.isLoading && m.content);
  if (!last) return "";
  if (outputType === "image") {
    if (/^https?:\/\//i.test(last.content.trim()))
      return `[Image titled "previous output": ${last.content.trim()}]\n\n`;
  }
  if (outputType === "audio") {
    try {
      const p = JSON.parse(last.content);
      const narrator  = p?.script?.narrator_text ?? "";
      const dialogues = (p?.script?.dialogues ?? [])
        .map((d: { character: string; text: string }) => `${d.character}: ${d.text}`)
        .join(" | ");
      return `[Audio titled "previous output": Narrator: ${narrator}. Dialogues: ${dialogues || "none"}]\n\n`;
    } catch { return ""; }
  }
  if (outputType === "slides") {
    try {
      const p = JSON.parse(last.content);
      const sections = (p?.sections ?? [])
        .map((s: { title: string; concepts: string[] }) => `${s.title}: ${s.concepts?.join(", ")}`)
        .join(" | ");
      return `[Slides titled "previous output": ${sections}]\n\n`;
    } catch { return ""; }
  }
  return "";
}

// Arena accent is derived dynamically from profile.active_arena below

// ── page ───────────────────────────────────────────────────────────────────

export default function PlaygroundPage() {
  return (
    <Suspense>
      <PlaygroundInner />
    </Suspense>
  );
}

function PlaygroundInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  // Validator Teacher: only present when student arrived via an objective.
  // Arena room sends ?objective=<id> (e.g. "a1-3"). Free-play visits have no
  // ?objective= param so the teacher stays hidden.
  const rawObjectiveId = searchParams?.get("objective") ?? null;
  const activeObjectiveId = rawObjectiveId ? normalizeObjectiveId(rawObjectiveId) : null;
  // Look up prompt + outputType from local config — never exposed in the URL
  const activeObjective = activeObjectiveId ? getObjectiveById(activeObjectiveId) : null;
  // Derive which arena to go back to from the objective param (format "a{id}-{n}" or "l{id}-{nn}")
  const backArenaId = (() => {
    if (!activeObjectiveId) return null;
    const m = activeObjectiveId.match(/^a(\d+)-/);
    return m ? parseInt(m[1]) : null;
  })();

  const [profile,        setProfile]        = useState<Profile | null>(null);
  const [mode]                               = useState<PlaygroundMode>("free");
  const [outputType,     setOutputType]      = useState<OutputType>("text");
  const [saveOpen,       setSaveOpen]        = useState(false);
  const [saveContent,    setSaveContent]     = useState("");
  const [saveOutputType, setSaveOutputType]  = useState<OutputType>("text");
  const [xpFlash,        setXpFlash]         = useState<{ amount: number; streak: boolean } | null>(null);
  const [badgeToast,     setBadgeToast]      = useState<(Badge & { earned_at: string }) | null>(null);
  // Worksheet popup state — only meaningful when activeObjectiveId resolves
  // to a staged-rubric worksheet schema (currently OBJ 10 + OBJ 6).
  const [worksheetOpen,  setWorksheetOpen]   = useState(false);
  const [hasDraft,       setHasDraft]        = useState(false);
  const badgeQueueRef = useRef<(Badge & { earned_at: string })[]>([]);
  const didInit       = useRef(false);

  const {
    messages, isStreaming, sessionId,
    startSession,
    sendMessage, sendImage, sendAudio, sendSlides, sendVideo,
    reset,
  } = useChat(profile, mode, activeObjectiveId);

  // Whiteboard messages are mirrored into the chat-channel automatically by
  // useChat itself (see lib/chatChannels.tsx + components/playground/useChat.ts).
  // No manual sync needed here.

  const onBadgeUnlock = useCallback((b: Badge & { earned_at: string }) => {
    setBadgeToast(prev => {
      if (prev) { badgeQueueRef.current.push(b); return prev; }
      return b;
    });
  }, []);

  const dismissBadgeToast = useCallback(() => {
    setBadgeToast(() => badgeQueueRef.current.shift() ?? null);
  }, []);

  const { awardXP } = useXP(
    () => {}, // no level-up modal needed
    onBadgeUnlock,
  );

  const showXPFlash = (amount: number, streak = false) => {
    setXpFlash({ amount, streak });
    setTimeout(() => setXpFlash(null), 2500);
  };

  const handleXpResult = useCallback((r: XPResult | null) => {
    if (!r) return;
    setProfile(p => (p ? mergeProfileFromXp(p, r) : null));
    showXPFlash(r.xp_earned, r.streak_bonus > 0);
  }, []);

  // Load profile once
  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : { profile: null })
      .then(({ profile }) => {
        if (!profile) {
          router.replace("/dashboard/profile");
          return;
        }
        setProfile(profile);
      });
  }, [router]);

  // Start session once profile is ready, then pre-configure for the active objective.
  //
  // IMPORTANT: We do NOT auto-fire the objective's starterPrompt anymore.
  // Reason: most starter prompts (e.g. OBJ 1 "First Prompt Ever") are templates
  // the kid is meant to copy into an EXTERNAL tool (ChatGPT/Canva/HeyGen), take
  // a screenshot, and submit. Auto-sending it in the in-app whiteboard pollutes
  // the canvas with a prompt the kid never wrote and validator might grade
  // against. The starter prompt stays available in the objective record for
  // reference (rendered in the objective card / SAGE intro).
  useEffect(() => {
    if (profile && !didInit.current) {
      didInit.current = true;
      startSession(mode).then(() => {
        if (activeObjective?.outputType) {
          // Pre-set output type to match the objective (e.g. "image" for OBJ 10).
          setOutputType(activeObjective.outputType as OutputType);
        }
      });
    }
  }, [profile]); // eslint-disable-line

  const handleNewChat = useCallback(async () => {
    reset();
    await startSession(mode);
  }, [reset, startSession, mode]);

  // Called by CreationsRoom when user hits send
  const handleSend = async (text: string, outType: OutputType) => {
    if (!text.trim() || isStreaming) return;
    setOutputType(outType);

    // Parse ALL leading context marker blocks (one per \n\n-delimited segment).
    // Each block looks like [Type titled "X": URL]. We extract every URL into
    // allBubbleMeta so MessageBubble can render chips for all of them, and set
    // cleanDisplay to just the user's typed text so no raw markers appear in the bubble.
    const textBlocks   = text.split("\n\n");
    const ctxBlocks: string[] = [];
    let ctxCount = 0;
    for (const block of textBlocks) {
      const t = block.trim();
      if (t.startsWith("[") && t.endsWith("]")) { ctxBlocks.push(t); ctxCount++; }
      else break;
    }
    const isCtxMarker = ctxCount > 0;
    const userText    = isCtxMarker ? textBlocks.slice(ctxCount).join("\n\n") : text;
    const displayText = isCtxMarker ? userText : undefined;

    // Build allBubbleMeta from every context block:
    //   "img:URL"   → TeacherCharacter (wantsImages) + MessageBubble thumbnail chip
    //   "docx:URL"  → TeacherCharacter (wantsDocs)   + MessageBubble file chip
    //   "audio:URL" → TeacherCharacter (wantsAudio)  + MessageBubble audio chip
    //   "video:URL" → TeacherCharacter (wantsVideo)  + MessageBubble video chip
    // Only https:// URLs are stored; data-URLs (upload not yet complete) are skipped.
    const allBubbleMeta: string[] = [];
    for (const block of ctxBlocks) {
      const imgM = block.match(/^\[Image titled "[^"]+": (https?:\/\/\S+)\]$/);
      if (imgM) { allBubbleMeta.push(`img:${imgM[1]}`); continue; }
      const docM = block.match(/^\[Document titled "[^"]+": (https?:\/\/\S+)\]$/);
      if (docM) { allBubbleMeta.push(`docx:${docM[1]}`); continue; }
      const audioM = block.match(/^\[Audio titled "[^"]+": (https?:\/\/\S+)\]$/);
      if (audioM) { allBubbleMeta.push(`audio:${audioM[1]}`); continue; }
      const videoM = block.match(/^\[Video titled "[^"]+": (https?:\/\/\S+)\]$/);
      if (videoM) { allBubbleMeta.push(`video:${videoM[1]}`); continue; }
    }

    // Skip auto-inject when user explicitly dragged a creation into the prompt —
    // that would prepend a second [Image...] marker and extractImageUrl in the API
    // would pick the wrong one (always takes the first match).
    const context = isCtxMarker ? "" : buildPreviousOutputContext(messages, outType, userText);
    const enrichedText = context ? context + text : text;
    const hasContext = !!context;

    // Clean display text — the user's actual message without any injected context markers.
    // Falls back to userText when there's auto-injected previous-output context.
    const cleanDisplay = displayText ?? (hasContext ? userText : undefined);

    if (outType === "image") {
      await sendImage(enrichedText, cleanDisplay, allBubbleMeta);
      awardXP("generate_image").then(handleXpResult);
    } else if (outType === "audio") {
      await sendAudio(enrichedText, profile?.age_group ?? "11-13", cleanDisplay, allBubbleMeta);
      awardXP("generate_audio").then(handleXpResult);
    } else if (outType === "slides") {
      await sendSlides(enrichedText, profile?.age_group ?? "11-13", cleanDisplay, allBubbleMeta);
      awardXP("generate_slides").then(handleXpResult);
    } else if (outType === "video") {
      await sendVideo(enrichedText, cleanDisplay, allBubbleMeta, 20);
      awardXP("generate_video").then(handleXpResult);
    } else {
      // Pass displayPrompt (6th arg) so the bubble shows the clean text, not the context marker
      await sendMessage(enrichedText, outType, [], undefined, allBubbleMeta.length ? allBubbleMeta : undefined, cleanDisplay);
      awardXP("generate_text").then(handleXpResult);
    }
  };

  const openSave = (content: string, type: OutputType) => {
    setSaveContent(content);
    setSaveOutputType(type);
    setSaveOpen(true);
  };

  const handleSave = async (title: string, outType: OutputType, tags: string[], projectId?: string) => {
    awardXP("save_creation").then(handleXpResult);
    await fetch("/api/creations", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, type: "chat", output_type: outType,
        content: saveContent, tags,
        project_id: projectId,
        session_id: sessionId,
        prompt_used: messages.filter(m => m.role === "user").slice(-1)[0]?.content ?? "",
      }),
    });
  };

  // Derive arena theme from profile
  const activeArena     = getArena(profile?.active_arena ?? 1);
  const ARENA_ACCENT      = activeArena.accent;
  const ARENA_ACCENT_GLOW = activeArena.accentGlow;

  // Worksheet schema for the active objective. Null if the objective has no
  // staged worksheet (in which case the icon stays hidden).
  const worksheetSchema = activeObjectiveId ? getWorksheetSchema(activeObjectiveId) : null;

  // hasDraft = there's a saved worksheet draft for this profile + objective.
  // Re-checked when the popup closes so the indicator dot stays accurate.
  useEffect(() => {
    if (!worksheetSchema || !profile?.id || typeof window === "undefined") {
      setHasDraft(false);
      return;
    }
    const key = `aida:worksheet:${worksheetSchema.lmsId}:${profile.id}:draft`;
    setHasDraft(!!localStorage.getItem(key));
  }, [worksheetSchema, profile?.id, worksheetOpen]);

  // Also set hasDraft immediately when auto-parse writes data (DOCX upload path).
  // The effect above won't re-run after the parse because its deps don't change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onParsed(e: Event) {
      const { detail } = e as CustomEvent<{ lmsId: string; profileId: string }>;
      if (!worksheetSchema || detail.lmsId !== worksheetSchema.lmsId) return;
      if (detail.profileId !== profile?.id) return;
      setHasDraft(true);
    }
    window.addEventListener("aida:worksheet-parsed", onParsed);
    return () => window.removeEventListener("aida:worksheet-parsed", onParsed);
  }, [worksheetSchema, profile?.id]);

  // Pre-fetch worksheet draft from server on mount — hydrates localStorage so
  // the icon dot appears immediately and the popup opens with previous answers.
  useEffect(() => {
    if (!worksheetSchema || !profile?.id) return;
    const lmsId = worksheetSchema.lmsId;
    const profileId = profile.id;
    fetch(`/api/worksheet-drafts?lmsId=${lmsId}`)
      .then(r => r.ok ? r.json() : null)
      .then((res: { draft: { data: Record<string,unknown>; notes?: string; worksheet_file_url?: string; worksheet_file_name?: string; worksheet_file_format?: string; updated_at?: string } | null } | null) => {
        if (!res?.draft?.data) return;
        const hasContent = Object.values(res.draft.data).some(v =>
          typeof v === "string" ? (v as string).trim().length > 0 : v === true,
        );
        if (!hasContent) return;
        // Only hydrate if localStorage is empty or server data is newer.
        const localKey = `aida:worksheet:${lmsId}:${profileId}:draft`;
        const existing = typeof window !== "undefined" ? localStorage.getItem(localKey) : null;
        let shouldWrite = !existing;
        if (existing && res.draft.updated_at) {
          try {
            const local = JSON.parse(existing) as { updated_at?: string };
            const localTime  = local.updated_at ? new Date(local.updated_at).getTime() : 0;
            const serverTime = new Date(res.draft.updated_at).getTime();
            shouldWrite = serverTime > localTime;
          } catch { shouldWrite = false; }
        }
        if (shouldWrite && typeof window !== "undefined") {
          localStorage.setItem(localKey, JSON.stringify({
            data:          res.draft.data,
            notes:         res.draft.notes ?? "",
            worksheetFile: res.draft.worksheet_file_url
              ? { url: res.draft.worksheet_file_url, filename: res.draft.worksheet_file_name ?? "", format: res.draft.worksheet_file_format ?? "docx" }
              : undefined,
            updated_at: res.draft.updated_at,
          }));
        }
        setHasDraft(true);
      })
      .catch(() => {});
  }, [worksheetSchema?.lmsId, profile?.id]);

  // Loading state
  if (!profile) return (
    <div className="flex flex-col items-center justify-center gap-4" style={{ height: "100dvh", background: "linear-gradient(145deg, #F3F0FF 0%, #EDE9FE 35%, #F8F6FF 65%, #EEF2FF 100%)" }}>
      <div className="flex gap-2">
        {[0,1,2].map(i => (
          <div key={i} className="dot w-3 h-3 rounded-full" style={{ background: ARENA_ACCENT, boxShadow: `0 0 12px ${ARENA_ACCENT_GLOW}` }}/>
        ))}
      </div>
      <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(26,26,46,0.4)", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.04em" }}>
        Loading Creators Room…
      </p>
    </div>
  );

  // Arena the user came from — fallback to profile's active arena
  const sourceArenaId = backArenaId ?? profile.active_arena ?? 1;

  return (
    <div className="relative w-full overflow-hidden" style={{ height: "100dvh" }}>

      {/* ── Back to Arena button ── */}
      <button
        onClick={() => router.push(`/dashboard/world/${sourceArenaId}`)}
        className="absolute top-4 left-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-display font-bold transition-all active:scale-95"
        style={{
          background: "rgba(6,6,15,0.7)",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(12px)",
          color: "rgba(255,255,255,0.6)",
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#fff"}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Arena {sourceArenaId}
      </button>

      {/* Creation Room — full screen */}
      <CreationsRoom
        profile={profile}
        sessionId={sessionId}
        messages={messages}
        isStreaming={isStreaming}
        onSend={handleSend}
        onNewChat={handleNewChat}
        onSave={openSave}
        arenaId={activeArena.id}
        arenaAccent={ARENA_ACCENT}
        arenaAccentGlow={ARENA_ACCENT_GLOW}
        objectiveId={activeObjectiveId}
      />

      {/* XP flash overlay */}
      {xpFlash && (
        <XPFlash amount={xpFlash.amount} visible streak={xpFlash.streak}/>
      )}

      {/* Badge toast */}
      <AnimatePresence mode="wait">
        {badgeToast && (
          <BadgeUnlockToast
            key={badgeToast.id}
            badge={badgeToast}
            accent={ARENA_ACCENT}
            accentGlow={ARENA_ACCENT_GLOW}
            onDismiss={dismissBadgeToast}
          />
        )}
      </AnimatePresence>

      {/* Save modal */}
      <SaveCreationModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={handleSave}
        defaultOutputType={saveOutputType}
        suggestedTitle=""
      />

      {/* Validator Teacher — only when entered via an objective */}
      {activeObjectiveId && (
        <TeacherCharacter
          objectiveId={activeObjectiveId}
          messages={messages}
          profile={profile}
          onObjectiveCompleted={(objectiveId) => {
            markObjectiveComplete(objectiveId);
            // Send the kid back to the arena room so they see the green tick.
            router.push(`/dashboard/world/${profile?.active_arena ?? 1}`);
          }}
        />
      )}

      {/* Worksheet — visible on every objective. For missions without a real
          schema yet (everything except OBJ 6 / OBJ 10), the popup shows a
          short "coming soon" placeholder so the floor sprite still feels alive. */}
      {activeObjectiveId && profile && (
        <>
          <WorksheetIcon
            arenaAccent={ARENA_ACCENT}
            arenaAccentGlow={ARENA_ACCENT_GLOW}
            hasDraft={hasDraft}
            onClick={() => setWorksheetOpen(true)}
          />
          <WorksheetPopup
            open={worksheetOpen}
            lmsId={worksheetSchema?.lmsId ?? activeObjectiveId}
            profileId={profile.id}
            arenaAccent={ARENA_ACCENT}
            arenaAccentGlow={ARENA_ACCENT_GLOW}
            onClose={() => setWorksheetOpen(false)}
            onSubmit={async (payload) => {
              // Hand off the FULL payload to ObjectiveSubmissionPanel via
              // localStorage. The panel pulls and validates on click.
              if (typeof window !== "undefined" && worksheetSchema) {
                localStorage.setItem(
                  `aida:worksheet:${worksheetSchema.lmsId}:${profile.id}:pending`,
                  JSON.stringify(payload),
                );
              }
              setWorksheetOpen(false);
              alert("Saved. Tap the teacher and hit Validate when you're ready.");
            }}
          />
        </>
      )}
    </div>
  );
}

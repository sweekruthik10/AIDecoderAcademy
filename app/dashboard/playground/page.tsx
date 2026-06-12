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
import { markObjectiveComplete, getObjectiveById } from "@/lib/objectives";
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

// Words to ignore when scoring keyword overlap between the current user prompt
// and past prompts. Mostly stop-words + modification verbs already covered by
// MODIFICATION_RE, so they don't dominate the score.
const SCORE_STOPWORDS = new Set([
  "the","and","but","for","with","from","into","about","that","this","these","those",
  "have","has","had","was","were","been","being","are","you","your","yours",
  "me","my","mine","our","ours","we","us","it","its","they","them","their",
  "make","made","create","creates","creating","change","modify","update","adjust",
  "redo","edit","alter","improve","transform","add","remove","keep","instead",
  "rewrite","regenerate","tweak","refine","revise","continue","extend","expand",
  "shorten","simplify","translate","recreate","remake","redesign","another",
  "version","same","different","like","just","also","really","please","now","new",
  "very","more","less","than","again","one","two","time","want","need","try",
  "build","draw","show","give","picture","image","slide","slides","audio","story",
  "darker","lighter","brighter","bigger","smaller","longer","shorter",
]);

function scoreTokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 3 && !SCORE_STOPWORDS.has(w))
  );
}

function pickBestPriorOutput(
  messages: Array<{ role: string; content: string; outputType?: string; isLoading?: boolean }>,
  outputType: string,
  userText: string,
): { content: string; titleHint: string } | null {
  // Collect every past assistant output of this type alongside the user prompt
  // that generated it (assistant follows user in normal flow).
  const candidates: { content: string; userPrompt: string }[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "assistant" || m.outputType !== outputType || m.isLoading || !m.content) continue;
    let userPrompt = "";
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].role === "user") { userPrompt = messages[j].content; break; }
    }
    candidates.push({ content: m.content, userPrompt });
  }
  if (candidates.length === 0) return null;

  // Single candidate → no ambiguity, take it.
  if (candidates.length === 1) {
    const c = candidates[0];
    return { content: c.content, titleHint: c.userPrompt.slice(0, 60) || "previous output" };
  }

  // Multiple candidates → score by token-overlap between current userText and
  // each past user prompt. Higher overlap = better intent match.
  // Score by keyword overlap. Walk newest → oldest so that on a tie, the most
  // recent match wins (e.g. "change the castle to night" when both an older
  // dragon-over-castle and a newer castle-in-snow exist → take the newer one).
  const userTokens = scoreTokens(userText);
  let best = candidates[candidates.length - 1];
  let bestScore = 0;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    const promptTokens = scoreTokens(c.userPrompt);
    let overlap = 0;
    for (const t of userTokens) if (promptTokens.has(t)) overlap += 1;
    if (overlap > bestScore) { bestScore = overlap; best = c; }
  }
  return {
    content: best.content,
    titleHint: bestScore > 0
      ? best.userPrompt.slice(0, 60)
      : "previous output",
  };
}

function buildPreviousOutputContext(
  messages: Array<{ role: string; content: string; outputType?: string; isLoading?: boolean }>,
  outputType: string,
  userText: string,
): string {
  if (!isModificationRequest(userText)) return "";
  const picked = pickBestPriorOutput(messages, outputType, userText);
  if (!picked) return "";
  const title = picked.titleHint.replace(/"/g, "'").trim() || "previous output";

  if (outputType === "image") {
    if (/^https?:\/\//i.test(picked.content.trim()))
      return `[Image titled "${title}": ${picked.content.trim()}]\n\n`;
  }
  if (outputType === "audio") {
    try {
      const p = JSON.parse(picked.content);
      const narrator  = p?.script?.narrator_text ?? "";
      const dialogues = (p?.script?.dialogues ?? [])
        .map((d: { character: string; text: string }) => `${d.character}: ${d.text}`)
        .join(" | ");
      return `[Audio titled "${title}": Narrator: ${narrator}. Dialogues: ${dialogues || "none"}]\n\n`;
    } catch { return ""; }
  }
  if (outputType === "slides") {
    try {
      const p = JSON.parse(picked.content);
      const sections = (p?.sections ?? [])
        .map((s: { title: string; concepts: string[] }) => `${s.title}: ${s.concepts?.join(", ")}`)
        .join(" | ");
      return `[Slides titled "${title}": ${sections}]\n\n`;
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
  const activeObjectiveId = searchParams?.get("objective") ?? null;
  // Look up prompt + outputType from local config — never exposed in the URL
  const activeObjective = activeObjectiveId ? getObjectiveById(activeObjectiveId) : null;
  // Derive which arena to go back to from the objective param (format "a{id}-{n}")
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

    // If the text starts with a creation context marker ([Type titled "...": ...]\n\n),
    // split it out so the user bubble shows only their clean message.
    const nnIdx         = text.indexOf("\n\n");
    const contextPart   = nnIdx > -1 ? text.slice(0, nnIdx) : "";
    const isCtxMarker   = contextPart.startsWith("[") && contextPart.endsWith("]");
    const userText      = isCtxMarker ? text.slice(nnIdx + 2) : text;
    const displayText   = isCtxMarker ? userText : undefined;

    // If an image creation was injected, extract its URL for thumbnail display in the bubble.
    const imgUrlMatch    = isCtxMarker
      ? contextPart.match(/^\[Image titled "[^"]+": (https?:\/\/\S+)\]$/)
      : null;
    const injectedImgUrl  = imgUrlMatch ? imgUrlMatch[1] : null;
    const imgBubbleMeta   = injectedImgUrl ? [`img:${injectedImgUrl}`] : [];

    // If a document was injected, extract filename + URL for the bubble badge.
    const docMatch       = isCtxMarker
      ? contextPart.match(/^\[Document titled "([^"]+)": (https?:\/\/\S+)\]$/)
      : null;
    const docBubbleMeta  = docMatch ? [`doc:${docMatch[1]}:${docMatch[2]}`] : [];

    // If an audio file was injected, extract filename + URL for the bubble badge.
    const audioMatch     = isCtxMarker
      ? contextPart.match(/^\[Audio titled "([^"]+)": (https?:\/\/\S+)\]$/)
      : null;
    const audioBubbleMeta = audioMatch ? [`audio:${audioMatch[1]}:${audioMatch[2]}`] : [];

    // Merge: image thumbnail first, then doc/audio badges
    const attachBubbleMeta = [...imgBubbleMeta, ...docBubbleMeta, ...audioBubbleMeta];

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
      await sendImage(enrichedText, cleanDisplay, attachBubbleMeta);
      awardXP("generate_image").then(handleXpResult);
    } else if (outType === "audio") {
      await sendAudio(enrichedText, profile?.age_group ?? "11-13", cleanDisplay, attachBubbleMeta);
      awardXP("generate_audio").then(handleXpResult);
    } else if (outType === "slides") {
      await sendSlides(enrichedText, profile?.age_group ?? "11-13", cleanDisplay, attachBubbleMeta);
      awardXP("generate_slides").then(handleXpResult);
    } else if (outType === "video") {
      await sendVideo(enrichedText, cleanDisplay, attachBubbleMeta);
    } else {
      // Pass displayPrompt (6th arg) so the bubble shows the clean text, not the context marker
      await sendMessage(enrichedText, outType, [], undefined, attachBubbleMeta.length ? attachBubbleMeta : undefined, cleanDisplay);
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

  // Loading state
  if (!profile) return (
    <div className="flex flex-col items-center justify-center gap-4" style={{ height: "100vh", background: "linear-gradient(145deg, #F3F0FF 0%, #EDE9FE 35%, #F8F6FF 65%, #EEF2FF 100%)" }}>
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
    <div className="relative w-full overflow-hidden" style={{ height: "100vh" }}>

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

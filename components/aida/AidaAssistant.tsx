"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { X, Send, Mic, Square, MessageSquare, Radio, PhoneOff } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useWhiteboardReader, useValidatorReader, useWorksheetReader, useClassroomReader } from "@/lib/chatChannels";
import { useLiveVoice } from "@/components/aida/voice/useLiveVoice";
import type { LiveState } from "@/components/aida/voice/LiveVoiceSession";
import type { Profile } from "@/types";

// Static welcome lines streamed by the chat route on session __init__.
// These aren't real conversation — they're hard-coded greetings — and feeding
// them to AIDA as "session context" pollutes its view of what the student is
// actually doing. Skip them.
const WHITEBOARD_WELCOME_RE = /^Hey\s.+,\s*(?:📖|💻|🎨|🧠|🚀)\s*Welcome to/i;

function isWhiteboardSystemNoise(content: string): boolean {
  if (content === "__init__") return true;
  if (WHITEBOARD_WELCOME_RE.test(content)) return true;
  return false;
}

// Serialize live whiteboard messages so AIDA can reason about them.
// Labels are written in the third person and tagged [whiteboard] so the LLM
// is less tempted to fold these lines into its own turn structure.
// (See lib/aidaPersona.ts — the surrounding system-prompt block reinforces
// that this is observed activity, not AIDA's own conversation.)
function serializePlaygroundSession(msgs: PlaygroundMessage[]): { text: string; imageUrls: string[] } {
  const lines: string[] = [];
  const imageUrls: string[] = [];

  for (const m of msgs) {
    if (m.isLoading || !m.content) continue;
    if (isWhiteboardSystemNoise(m.content)) continue;
    const type = m.outputType ?? "text";

    if (m.role === "user") {
      lines.push(`[whiteboard] student typed (${type} prompt): ${m.content}`);
      continue;
    }

    switch (type) {
      case "image": {
        if (m.content.startsWith("http")) {
          imageUrls.push(m.content);
          lines.push(`[whiteboard] whiteboard AI produced image #${imageUrls.length} (see attached image)`);
        }
        break;
      }
      case "audio": {
        try {
          const d = JSON.parse(m.content);
          if (Array.isArray(d.script)) {
            const fullScript = d.script
              .map((s: { character?: string; text?: string }) =>
                `${s.character ?? "Narrator"}: ${s.text ?? ""}`)
              .join("\n");
            lines.push(`[whiteboard] whiteboard AI produced audio story. Full script:\n${fullScript}`);
          }
        } catch { lines.push("[whiteboard] whiteboard AI produced an audio story"); }
        break;
      }
      case "slides": {
        try {
          const d = JSON.parse(m.content);
          if (Array.isArray(d.sections)) {
            const slidesText = d.sections
              .map((s: { title?: string; bullets?: string[]; content?: string }) => {
                const body = Array.isArray(s.bullets)
                  ? s.bullets.join(" | ")
                  : (s.content ?? "");
                return `  Slide "${s.title}": ${body}`;
              })
              .join("\n");
            lines.push(`[whiteboard] whiteboard AI produced slides:\n${slidesText}`);
          }
        } catch { lines.push("[whiteboard] whiteboard AI produced slides"); }
        break;
      }
      default:
        lines.push(`[whiteboard] whiteboard AI replied (${type}): ${m.content}`);
    }
  }

  return { text: lines.join("\n"), imageUrls };
}

interface ChatMessage {
  role:    "user" | "assistant";
  content: string;
  // "nudge" = AIDA's inline thought-bubble reaction to a whiteboard prompt.
  // Rendered with a distinct (italic, dimmer) thought-bubble style. Not part
  // of the conversation history sent back to /api/aida.
  kind?:   "nudge";
  nudgeKind?: "progress" | "encourage" | "stray";
}

type PlaygroundMessage = import("@/components/playground/useChat").Message;
type VoiceState        = "idle" | "listening" | "processing" | "speaking";
type VoiceSubMode      = "tap" | "live";

const HIDDEN_ON: string[] = [];

const VOICE_LABEL: Record<VoiceState, string> = {
  idle:       "Tap mic to start",
  listening:  "Recording… tap stop to send",
  processing: "Thinking…",
  speaking:   "Speaking…",
};

// Live-mode UI strings + colors per state. Keeps the indicator coherent across
// the conversation lifecycle (listening → user-speaking → thinking → ai-speaking).
const LIVE_LABEL: Record<LiveState, string> = {
  "idle":          "Tap to start a live call",
  "arming":        "Connecting…",
  "listening":     "Listening… just talk",
  "user-speaking": "Heard you — keep going",
  "awaiting-end":  "Catching the rest…",
  "llm-thinking":  "Thinking…",
  "ai-speaking":   "Speaking… (talk to interrupt)",
};

const LIVE_COLOR: Record<LiveState, string> = {
  "idle":          "#7C3AED",
  "arming":        "rgba(255,255,255,0.4)",
  "listening":     "#7C3AED",
  "user-speaking": "#FF2D78",
  "awaiting-end":  "#9D5BFF",
  "llm-thinking":  "#FFB020",
  "ai-speaking":   "#00D4FF",
};

export function AidaAssistant({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  // Picks up the playground objective param so the server can flip on
  // hint-or-answer scaffolding only when the student is on a graded mission.
  // We deliberately avoid useSearchParams() here because this component is
  // mounted in the dashboard layout, which prerenders /dashboard at build
  // time — useSearchParams forces that page into client-rendering and trips
  // Next.js's missing-suspense-boundary error during prerender. We're a
  // client component already, so reading window.location is safe at runtime
  // and the value re-evaluates on every render.
  const [activeObjectiveId, setActiveObjectiveId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const sp = new URLSearchParams(window.location.search);
      setActiveObjectiveId(sp.get("objective"));
    };
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, [pathname]);
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [input, setInput]             = useState("");
  const [streaming, setStreaming]     = useState(false);
  const [mode, setMode]               = useState<"text" | "voice">("text");
  const [voiceSubMode, setVoiceSubMode] = useState<VoiceSubMode>("tap");
  const [voiceState, setVoiceState]   = useState<VoiceState>("idle");
  const [streamReady, setStreamReady] = useState(false);
  const [voiceOK, setVoiceOK]         = useState(false);
  const [voiceError, setVoiceError]   = useState<string | null>(null);
  // Seed from the window flag so an AidaAssistant that mounts after the
  // validator panel already auto-opened still starts hidden (the one-shot
  // "validator-panel-open" event would otherwise be missed).
  const [validatorPanelOpen, setValidatorPanelOpen] = useState(
    () => typeof window !== "undefined" &&
      !!(window as Window & { __validatorPanelOpen?: boolean }).__validatorPanelOpen,
  );
  const [worksheetPopupOpen, setWorksheetPopupOpen] = useState(false);

  // Whether AIDA voices her thought-bubble nudges. Persisted in localStorage
  // so the kid's preference survives reloads. Default: ON.
  const [nudgeAudioEnabled, setNudgeAudioEnabled] = useState<boolean>(true);

  // Most-recent floating nudge — shown as a speech bubble above the AIDA
  // sprite when the chat PANEL is closed (so kids see the thought even if
  // they haven't opened the chat). Auto-dismisses after ~9s.
  const [floatingNudge, setFloatingNudge] = useState<{
    text: string;
    kind: "progress" | "encourage" | "stray";
    at:   number;
  } | null>(null);
  useEffect(() => {
    if (!floatingNudge) return;
    const t = setTimeout(() => setFloatingNudge(null), 9000);
    return () => clearTimeout(t);
  }, [floatingNudge]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("aida:nudgeAudio");
    if (stored === "off") setNudgeAudioEnabled(false);
  }, []);

  // Warm up the TTS pipeline on mount — the first ElevenLabs call each page
  // load cold-starts ~5s. AIDA renders in the dashboard layout, so this throw-
  // away request warms /api/aida/tts for every page (AIDA nudges, validator
  // teacher, etc. all share that endpoint).
  useEffect(() => {
    fetch("/api/aida/tts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text: "." }),
    }).catch(() => { /* warmup is best-effort */ });
  }, []);

  const toggleNudgeAudio = () => {
    setNudgeAudioEnabled(v => {
      const next = !v;
      if (typeof window !== "undefined") {
        localStorage.setItem("aida:nudgeAudio", next ? "on" : "off");
      }
      return next;
    });
  };

  useEffect(() => {
    const onValidatorOpen  = () => setValidatorPanelOpen(true);
    const onValidatorClose = () => setValidatorPanelOpen(false);
    const onWorksheetOpen  = () => setWorksheetPopupOpen(true);
    const onWorksheetClose = () => setWorksheetPopupOpen(false);
    window.addEventListener("validator-panel-open",  onValidatorOpen);
    window.addEventListener("validator-panel-close", onValidatorClose);
    window.addEventListener("worksheet-popup-open",  onWorksheetOpen);
    window.addEventListener("worksheet-popup-close", onWorksheetClose);
    return () => {
      window.removeEventListener("validator-panel-open",  onValidatorOpen);
      window.removeEventListener("validator-panel-close", onValidatorClose);
      window.removeEventListener("worksheet-popup-open",  onWorksheetOpen);
      window.removeEventListener("worksheet-popup-close", onWorksheetClose);
    };
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const prevPathRef = useRef(pathname);
  const { messages: playgroundMessages } = useWhiteboardReader();
  const validatorState = useValidatorReader();
  const worksheetState = useWorksheetReader();
  const classroomState = useClassroomReader();
  const isOnPlayground = pathname.startsWith("/dashboard/playground");

  // ── Stable refs (avoid stale closures in async callbacks) ─────────────────
  const messagesRef        = useRef<ChatMessage[]>([]);
  const audioRef           = useRef<HTMLAudioElement | null>(null);
  const voiceStateRef      = useRef<VoiceState>("idle");
  const modeRef            = useRef<"text" | "voice">("text");
  const subModeRef         = useRef<VoiceSubMode>("tap");
  // Stashed partial AI response when the user interrupts mid-speech in Live mode.
  // Consumed by the next coreSend() call and forwarded to /api/aida as
  // interruptedContext (route already supports this — see app/api/aida/route.ts).
  const interruptedContextRef = useRef<string | null>(null);
  const profileRef         = useRef(profile);
  const pathnameRef        = useRef(pathname);
  const isOnPGRef          = useRef(isOnPlayground);
  const objectiveIdRef     = useRef(activeObjectiveId);
  const pmRef              = useRef(playgroundMessages);
  const sendIdRef          = useRef(0);
  const audioQueueRef      = useRef<{ audio: HTMLAudioElement; url: string }[]>([]);
  const ttsAbortRef        = useRef<AbortController | null>(null);
  const ttsGenRef          = useRef(0);
  const cancelledRef       = useRef(false);
  const mediaRecorderRef   = useRef<MediaRecorder | null>(null);
  const audioChunksRef     = useRef<Blob[]>([]);
  const micStreamRef       = useRef<MediaStream | null>(null);
  const sttAbortRef        = useRef<AbortController | null>(null);
  const vizCanvasRef       = useRef<HTMLCanvasElement>(null);
  const vizAudioCtxRef     = useRef<AudioContext | null>(null);
  const vizRafRef          = useRef<number>(0);

  // Function refs — updated every render so async callbacks always call latest
  const coreSendRef       = useRef<(text: string) => void>(() => {});
  const startListeningRef = useRef<() => void>(() => {});
  const speakTextRef      = useRef<(text: string) => Promise<void>>(async () => {});
  // Live-session setter (set after useLiveVoice runs below). Bridges TTS
  // start/end events to the LiveVoiceSession state machine so the VAD knows
  // when AIDA is talking — required for interruption detection.
  const liveSetAiSpeakingRef = useRef<(speaking: boolean) => void>(() => {});

  // ── Sync state → refs ─────────────────────────────────────────────────────
  useEffect(() => { messagesRef.current = messages; },        [messages]);
  useEffect(() => { modeRef.current = mode; },                [mode]);
  useEffect(() => { subModeRef.current = voiceSubMode; },     [voiceSubMode]);
  useEffect(() => { profileRef.current = profile; },          [profile]);
  useEffect(() => { pathnameRef.current = pathname; },        [pathname]);
  useEffect(() => { isOnPGRef.current = isOnPlayground; },    [isOnPlayground]);
  useEffect(() => { objectiveIdRef.current = activeObjectiveId; }, [activeObjectiveId]);
  useEffect(() => { pmRef.current = playgroundMessages; },    [playgroundMessages]);

  // ── Nudge trigger: fire AIDA's inline thought bubble on each new user prompt
  // in the whiteboard. We compare current vs. previous whiteboard user-message
  // count; on increase, take the newest user message and POST to /api/aida/nudge.
  // The response is appended as a ChatMessage with kind:"nudge" so it renders
  // with a distinct thought-bubble style (italic, dimmer, 💭 prefix).
  //
  // Off-objective (no activeObjectiveId) → only encourages, never strays. Server
  // already handles that gracefully (no rubric → "encourage" kind).
  const prevWhiteboardUserCountRef = useRef<number>(0);
  const nudgeInFlightRef            = useRef<boolean>(false);
  useEffect(() => {
    if (!isOnPlayground) return;
    const userMessages = playgroundMessages.filter(
      m => m.role === "user" && m.content && !isWhiteboardSystemNoise(m.content),
    );
    const prevCount = prevWhiteboardUserCountRef.current;
    prevWhiteboardUserCountRef.current = userMessages.length;
    // Skip first paint (count goes 0 → N on history load) and any non-increase.
    if (prevCount === 0 || userMessages.length <= prevCount) return;
    if (nudgeInFlightRef.current) return;
    const latest = userMessages[userMessages.length - 1];
    if (!latest?.content) return;

    nudgeInFlightRef.current = true;
    const recentHistory = userMessages.slice(-4, -1).map(m => m.content);
    (async () => {
      try {
        const res = await fetch("/api/aida/nudge", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userPrompt:    latest.content,
            objectiveId:   activeObjectiveId,
            ageGroup:      profile?.age_group ?? "11-13",
            displayName:   profile?.display_name ?? "you",
            recentHistory,
            // Attempt-aware tone: count + lastTier come from the validator
            // channel, refreshed each time SAGE finishes grading.
            attemptCount:  validatorState.attempts?.count ?? 0,
            lastTier:      validatorState.lastTier,
          }),
        });
        if (!res.ok) return;
        const data = await res.json() as { text: string; kind: "progress" | "encourage" | "stray" };
        if (!data?.text?.trim()) return;
        // Nudges live ONLY as floating cartoon thought-bubbles above the AIDA
        // sprite — not in the chat history. They're a side commentary, not a
        // turn in the conversation.
        setFloatingNudge({ text: data.text, kind: data.kind, at: Date.now() });
        // Speak the nudge unless the kid has muted thought-bubble audio.
        // Re-read the localStorage flag so a toggle between renders is
        // respected without waiting for state to flow back here.
        const audioOn = typeof window !== "undefined"
          ? localStorage.getItem("aida:nudgeAudio") !== "off"
          : true;
        if (audioOn) {
          // Fire and forget — failures shouldn't block the bubble appearing.
          speakTextRef.current(data.text).catch(() => {});
        }
      } catch (err) {
        console.warn("[AIDA nudge] failed:", err);
      } finally {
        nudgeInFlightRef.current = false;
      }
    })();
    // We deliberately watch only playgroundMessages — the rest are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playgroundMessages, isOnPlayground]);

  // ── Check MediaRecorder availability (voice mode requires it) ─────────────
  useEffect(() => {
    setVoiceOK(typeof window !== "undefined"
      && typeof window.MediaRecorder !== "undefined"
      && typeof navigator?.mediaDevices?.getUserMedia === "function");
  }, []);

  // ── Reset on page navigation ──────────────────────────────────────────────
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      setMessages([]);
      setInput("");
      setOpen(false);
      cleanupVoice();
      // Live session also has to drop its WS + VAD on navigation.
      // useLiveVoice's own unmount handler covers component removal, but
      // navigation keeps the assistant mounted, so stop explicitly.
      void liveVoice.stop();
    }
  }, [pathname]);

  // ── Scroll to latest message ──────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Mic audio visualizer (uses the shared mic stream) ────────────────────
  useEffect(() => {
    function stopViz() {
      cancelAnimationFrame(vizRafRef.current);
      if (vizAudioCtxRef.current) {
        vizAudioCtxRef.current.close().catch(() => {});
        vizAudioCtxRef.current = null;
      }
    }

    if (voiceState !== "listening" || !open || !micStreamRef.current) {
      stopViz();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const stream = micStreamRef.current!;

        const ACtx = (window.AudioContext ?? (window as any).webkitAudioContext) as typeof AudioContext;
        const actx = new ACtx();
        vizAudioCtxRef.current = actx;

        const src      = actx.createMediaStreamSource(stream);
        const analyser = actx.createAnalyser();
        analyser.fftSize               = 64;
        analyser.smoothingTimeConstant = 0.78;
        src.connect(analyser);

        const bufLen  = analyser.frequencyBinCount; // 32
        const data    = new Uint8Array(bufLen);
        const canvas = vizCanvasRef.current!;
        if (!canvas) return;
        const ctx2d  = canvas.getContext("2d")!;
        const cw     = canvas.width;
        const ch     = canvas.height;

        const BAR_N  = 26;
        const BAR_W  = 3;
        const GAP    = 2;
        const TOT_W  = BAR_N * (BAR_W + GAP) - GAP;

        function draw() {
          if (cancelled) return;
          vizRafRef.current = requestAnimationFrame(draw);
          analyser.getByteFrequencyData(data);

          ctx2d.clearRect(0, 0, cw, ch);
          const startX = (cw - TOT_W) / 2;
          const maxH   = ch;

          for (let i = 0; i < BAR_N; i++) {
            const bin = Math.floor((i / BAR_N) * bufLen * 0.55);
            const amp = data[bin] / 255;
            // Gentle idle ripple so bars aren't completely flat when quiet
            const idle = (Math.sin(Date.now() / 280 + i * 0.7) * 0.5 + 0.5) * 4;
            const h    = Math.max(2, amp * (maxH - 6) + idle);
            const x    = startX + i * (BAR_W + GAP);
            const y    = (maxH - h) / 2;

            // Interpolate #7C3AED → #FF2D78
            const t = i / (BAR_N - 1);
            const r = Math.round(124 + (255 - 124) * t);
            const g = Math.round(58  + (45  - 58)  * t);
            const b = Math.round(237 + (120 - 237)  * t);
            ctx2d.fillStyle = `rgba(${r},${g},${b},${0.45 + amp * 0.55})`;
            ctx2d.fillRect(x, y, BAR_W, h);
          }
        }
        draw();
      } catch {
        // getUserMedia denied or unavailable — visualizer skipped, voice still works
      }
    })();

    return () => {
      cancelled = true;
      stopViz();
    };
  }, [voiceState, open, streamReady]);

  // ── Live voice session hook ───────────────────────────────────────────────
  // Must be above any conditional return (React rules of hooks).
  // Callbacks use stable refs (coreSendRef, messagesRef, interruptedContextRef)
  // and abortAiResponse — a function declaration, so it's hoisted and always
  // in scope even though the explicit definition appears below.
  const liveVoice = useLiveVoice({
    onFinalTranscript: (text) => {
      coreSendRef.current(text);
    },
    onInterrupt: () => {
      const last = messagesRef.current[messagesRef.current.length - 1];
      if (last?.role === "assistant" && last.content) {
        interruptedContextRef.current = last.content;
      }
      abortAiResponse();
    },
    onError: (err) => {
      console.error("[AIDA Live]", err);
    },
  });
  liveSetAiSpeakingRef.current = liveVoice.setAiSpeaking;

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setVS(s: VoiceState) {
    voiceStateRef.current = s;
    setVoiceState(s);
  }

  function flashVoiceError(msg: string) {
    setVoiceError(msg);
    setTimeout(() => setVoiceError(null), 3500);
  }

  function stopMicStream() {
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    setStreamReady(false);
  }

  function clearAudioQueue() {
    for (const { audio, url } of audioQueueRef.current) {
      audio.pause();
      URL.revokeObjectURL(url);
    }
    audioQueueRef.current = [];
  }

  function cleanupVoice() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      cancelledRef.current = true;
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    stopMicStream();
    // Abort any in-flight requests so stale responses don't append messages later
    if (sttAbortRef.current) { sttAbortRef.current.abort(); sttAbortRef.current = null; }
    if (ttsAbortRef.current) { ttsAbortRef.current.abort(); ttsAbortRef.current = null; }
    ++sendIdRef.current; // invalidate any in-flight coreSend stream
    ++ttsGenRef.current;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    clearAudioQueue();
    setVS("idle");
  }

  // Live mode interruption: kill the AI's audio + LLM stream WITHOUT touching
  // the mic — the Live session owns the mic via its VAD/worklet. This is the
  // key difference vs cleanupVoice(), which fully tears voice down.
  function abortAiResponse() {
    if (ttsAbortRef.current) { ttsAbortRef.current.abort(); ttsAbortRef.current = null; }
    ++sendIdRef.current; // invalidate any in-flight coreSend stream reader
    ++ttsGenRef.current; // invalidate any in-flight playNext callbacks
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
    clearAudioQueue();
    setStreaming(false);
  }

  // ── Core send ─────────────────────────────────────────────────────────────

  async function coreSend(text: string) {
    if (!text.trim()) return;

    const myId = ++sendIdRef.current;

    // Drop inline thought-bubble nudges from the conversation history — they
    // are AIDA's observations to the kid, not turns in the back-and-forth, so
    // including them confuses the next reply.
    const history = messagesRef.current.filter(m => m.kind !== "nudge").slice(-6);
    const p   = profileRef.current;
    const pn  = pathnameRef.current;
    const ioP = isOnPGRef.current;
    const pm  = pmRef.current;
    const oid = objectiveIdRef.current;

    setMessages(prev => [...prev, { role: "user",      content: text }]);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);
    setStreaming(true);

    let full = "";

    try {
      const body: Record<string, unknown> = {
        message: text,
        history,
        pathname: pn,
        objectiveId: oid,
        isVoiceMode: modeRef.current === "voice",
        profile: {
          display_name:           p?.display_name           ?? "Student",
          age_group:              p?.age_group              ?? "11-13",
          interests:              p?.interests              ?? [],
          xp:                     p?.xp                     ?? 0,
          level:                  p?.level                  ?? 1,
          streak_days:            p?.streak_days            ?? 0,
          active_arena:           p?.active_arena           ?? 1,
          // Phase 3 personalisation — server reads these from buildAidaSystemPrompt
          reading_level:          p?.reading_level          ?? null,
          language_preference:    p?.language_preference    ?? null,
          learning_style:         p?.learning_style         ?? null,
          difficulty_preference:  p?.difficulty_preference  ?? null,
          current_grade:          p?.current_grade          ?? null,
          // Filler fields the server's Profile type expects
          id:            p?.id            ?? "",
          clerk_user_id: p?.clerk_user_id ?? "",
          avatar_emoji:  p?.avatar_emoji  ?? "",
          badges:        p?.badges        ?? [],
          created_at:    p?.created_at    ?? "",
          updated_at:    p?.updated_at    ?? "",
        },
      };

      if (ioP && pm.length > 0) {
        const { text: st, imageUrls } = serializePlaygroundSession(pm);
        if (st)              body.playgroundSession = st;
        if (imageUrls.length) body.playgroundImages = imageUrls;
      }

      // Validator + worksheet — only attach if the kid is on a graded objective.
      // Tiny payloads (kilobytes), always relevant when present.
      if (validatorState.lmsId) {
        body.validator_state = validatorState;
      }
      if (worksheetState.lmsId) {
        const compactData: Record<string, string | boolean> = {};
        for (const [k, v] of Object.entries(worksheetState.data)) {
          if (typeof v === "boolean") compactData[k] = v;
          else if (typeof v === "string" && v.trim().length > 0) compactData[k] = v;
        }
        if (Object.keys(compactData).length > 0) {
          body.worksheet_draft = {
            lmsId:      worksheetState.lmsId,
            data:       compactData,
            updated_at: worksheetState.updatedAt ?? new Date().toISOString(),
          };
        }
      }

      // Classroom snapshot — AIDA reads (one-way). Only send when there's
      // something to send; route gates further to lesson_ended-only injection.
      if (classroomState.status !== "idle") {
        body.classroom_state = {
          status:     classroomState.status,
          lastLesson: classroomState.lastLesson ?? null,
        };
      }

      // Live-mode barge-in: hand the LLM the partial response we cut off so it
      // can acknowledge naturally ("Sorry, you cut me off there — to answer…").
      // Consumed once, then cleared.
      if (interruptedContextRef.current) {
        body.interruptedContext = interruptedContextRef.current;
        interruptedContextRef.current = null;
      }

      const res = await fetch("/api/aida", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (sendIdRef.current !== myId) break; // superseded by barge-in
        full += decoder.decode(value, { stream: true });
        const captured = full;
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: captured };
          return copy;
        });
      }

      if (sendIdRef.current !== myId) return;

      if (modeRef.current === "voice" && full.trim()) {
        setVS("speaking");
        await speakTextRef.current(full);
      }
    } catch {
      if (sendIdRef.current !== myId) return;
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "Sorry, something went wrong. Please try again." };
        return copy;
      });
      if (modeRef.current === "voice") {
        setVS("idle");
      }
    } finally {
      if (sendIdRef.current === myId) {
        setStreaming(false);
        if (modeRef.current === "text") inputRef.current?.focus();
      }
    }
  }

  // ── TTS playback (chunked streaming — sentence-by-sentence for low latency) ─

  async function speakText(text: string) {
    const myGen = ++ttsGenRef.current;

    // Abort any prior TTS request
    if (ttsAbortRef.current) { ttsAbortRef.current.abort(); }
    ttsAbortRef.current = new AbortController();

    // Stop + clear any prior audio
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    clearAudioQueue();

    let streamDone  = false;
    let firstChunk  = true;

    // Plays the next queued chunk, then recurses via onended
    function playNext() {
      if (ttsGenRef.current !== myGen) return; // superseded by barge-in or cleanup

      const item = audioQueueRef.current.shift();
      if (!item) {
        audioRef.current = null;
        // Queue empty + stream done — go back to idle so user can tap mic again
        if (streamDone && voiceStateRef.current === "speaking") {
          setVS("idle");
          // Live session: tell the VAD AIDA stopped talking so a new
          // user-speech-start no longer fires interrupt.
          if (subModeRef.current === "live") liveSetAiSpeakingRef.current(false);
        }
        return;
      }

      const { audio, url } = item;
      audioRef.current = audio;
      // First chunk hitting playback = AIDA has started speaking. Tell the
      // Live session so it transitions to "ai-speaking" and any subsequent
      // VAD onSpeechStart fires interrupt instead of a normal turn.
      if (subModeRef.current === "live") liveSetAiSpeakingRef.current(true);
      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        URL.revokeObjectURL(url);
        audioRef.current = null;
        playNext();
      };
      audio.onended = advance;
      audio.onerror = advance;
      audio.play().catch(advance);
    }

    try {
      const res = await fetch("/api/aida/tts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text }),
        signal:  ttsAbortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("TTS failed");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (ttsGenRef.current !== myGen) break; // barge-in happened

        buf += decoder.decode(value, { stream: true });

        // Parse SSE frames
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") { streamDone = true; continue; }

          // base64 → Blob → Audio element, queued for playback
          const bin   = atob(data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob  = new Blob([bytes], { type: "audio/mpeg" });
          const url   = URL.createObjectURL(blob);
          const audio = new Audio(url);

          audioQueueRef.current.push({ audio, url });

          if (firstChunk) {
            firstChunk = false;
            playNext(); // start playing immediately — no waiting for full response
          }
        }
      }

      streamDone = true;

      if (ttsGenRef.current !== myGen) return;

      // Edge cases after stream ends:
      // 1) Queue has chunks but playback never started (e.g. [DONE] arrived before any chunk
      //    triggered firstChunk's playNext) — kick playback now
      if (!audioRef.current && audioQueueRef.current.length > 0) {
        playNext();
        return;
      }
      // 2) Nothing playing and queue empty — done speaking
      if (!audioRef.current && audioQueueRef.current.length === 0) {
        if (voiceStateRef.current === "speaking") setVS("idle");
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      if (ttsGenRef.current === myGen && voiceStateRef.current === "speaking") {
        setVS("idle");
        if (subModeRef.current === "live") liveSetAiSpeakingRef.current(false);
      }
    }
  }

  // ── MediaRecorder-based STT (audio → Deepgram via /api/aida/stt) ─────────
  // Tap mic to start recording, tap stop to send, tap cancel to discard.

  function pickMimeType(): string {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
    }
    return "audio/webm";
  }

  async function startListening() {
    cancelledRef.current = false;
    audioChunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl:  true,
        },
        video: false,
      });
    } catch (err) {
      console.error("[AIDA] mic permission denied or unavailable:", err);
      setVS("idle");
      return;
    }

    if (voiceStateRef.current !== "listening") {
      // User cancelled before stream came back
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    micStreamRef.current = stream;
    setStreamReady(true); // wakes the visualizer effect

    const mimeType = pickMimeType();
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream, { mimeType });
    } catch (err) {
      console.error("[AIDA] MediaRecorder failed:", err);
      stopMicStream();
      setVS("idle");
      return;
    }

    mr.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      const wasCancelled = cancelledRef.current;
      cancelledRef.current = false;
      const chunks = audioChunksRef.current;
      audioChunksRef.current = [];
      stopMicStream();

      if (wasCancelled) return; // user tapped cancel — discard

      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) {
        flashVoiceError("No audio captured — try again");
        setVS("idle");
        return;
      }

      // AbortController so cleanupVoice can cancel a pending STT request
      const controller = new AbortController();
      sttAbortRef.current = controller;

      try {
        const res = await fetch("/api/aida/stt", {
          method:  "POST",
          headers: { "Content-Type": mimeType },
          body:    blob,
          signal:  controller.signal,
        });
        if (sttAbortRef.current === controller) sttAbortRef.current = null;
        if (!res.ok) {
          console.error("[AIDA] STT HTTP error:", res.status);
          flashVoiceError("Voice recognition failed — try again");
          setVS("idle");
          return;
        }
        const data = await res.json();
        const transcript = (data?.transcript ?? "").trim();
        if (transcript) {
          coreSendRef.current(transcript);
        } else {
          flashVoiceError("Didn't catch that — try again");
          setVS("idle");
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return; // expected — cleanupVoice
        console.error("[AIDA] STT failed:", err);
        flashVoiceError("Voice recognition failed — try again");
        setVS("idle");
      }
    };

    mediaRecorderRef.current = mr;
    // timeslice ensures ondataavailable fires periodically so we always get
    // a non-empty blob even for very short recordings.
    mr.start(100);
  }

  function stopListeningAndSend() {
    setVS("processing"); // immediate UI feedback while we wait for STT
    cancelledRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    } else {
      setVS("idle");
    }
  }

  function cancelRecording() {
    cancelledRef.current = true;
    setVS("idle");
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    } else {
      stopMicStream();
    }
  }

  // ── Sync function refs after every render ─────────────────────────────────
  // This must stay below the function definitions.
  coreSendRef.current       = coreSend;
  startListeningRef.current = startListening;
  speakTextRef.current      = speakText;
  // liveSetAiSpeakingRef is synced near the useLiveVoice call above, but we
  // re-sync here too so it always reflects the current render's setAiSpeaking.
  liveSetAiSpeakingRef.current = liveVoice.setAiSpeaking;

  // ── UI handlers ───────────────────────────────────────────────────────────

  function toggleVoiceSession() {
    if (voiceState === "idle") {
      setVS("listening");
      startListening();
    } else if (voiceState === "listening") {
      stopListeningAndSend();
    } else {
      cleanupVoice();
    }
  }

  function switchMode(m: "text" | "voice") {
    if (m === mode) return;
    cleanupVoice();
    void liveVoice.stop();
    setMode(m);
  }

  function switchVoiceSubMode(s: VoiceSubMode) {
    if (s === voiceSubMode) return;
    // Switching sub-modes always returns voice to a clean idle state — kill
    // whichever engine was active.
    cleanupVoice();
    void liveVoice.stop();
    setVoiceSubMode(s);
  }

  async function toggleLiveCall() {
    if (liveVoice.state === "idle") {
      await liveVoice.start();
    } else {
      // Any other state = active session; tapping ends the call.
      abortAiResponse();
      await liveVoice.stop();
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const t = input.trim();
      if (t) { coreSend(t); setInput(""); }
    }
  };

  const voicePulse = voiceState === "listening" || voiceState === "speaking";

  // On the playground, the floating button uses the bespoke assistant.png
  // sprite instead of the gradient ✦ disc — matches the JRPG-style room
  // alongside the Validator Teacher. Behaviour (open/close, voice gate) is
  // unchanged.
  const onPlayground = isOnPlayground;

  // ── Render ────────────────────────────────────────────────────────────────

  // Steel-and-cyan METALLIC aesthetic — matches the bright cyan-blue rings
  // around the playground's central panels. Five-stop vertical gradient gives
  // a brushed-chrome feel (top rim catches light → drops to steel → deep
  // middle → steel → bottom rim). Top-edge inset white-1px makes it read as
  // a polished metal panel.
  const panelBaseStyle = {
    background:
      // top-left cyan highlight blur + bottom-right cyan secondary glow
      "radial-gradient(ellipse 90% 55% at 25% 0%, rgba(0,212,255,0.22) 0%, rgba(8,12,28,0) 60%), " +
      "radial-gradient(ellipse 70% 50% at 100% 100%, rgba(125,211,252,0.08) 0%, rgba(8,12,28,0) 60%), " +
      // steel column — top rim → steel → deep middle → steel → bottom rim
      "linear-gradient(180deg, " +
        "rgba(58,98,158,0.55) 0%, " +
        "rgba(20,38,72,0.95) 6%, " +
        "rgba(10,18,38,0.97) 50%, " +
        "rgba(18,32,62,0.96) 94%, " +
        "rgba(58,98,158,0.45) 100%" +
      ")",
    border: "1px solid rgba(0,212,255,0.55)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.22), " +                 // top-edge chrome rim
      "inset 0 -1px 0 rgba(255,255,255,0.06), " +                // bottom-edge subtle rim
      "0 0 0 1px rgba(125,211,252,0.10) inset, " +               // inner light wash
      "0 0 24px rgba(0,212,255,0.45), " +                        // cyan inner glow
      "0 0 72px rgba(0,212,255,0.22), " +                        // cyan outer rim
      "0 24px 60px rgba(0,0,0,0.7)",                             // depth shadow
    backdropFilter: "blur(24px)",
  };

  // Shared panel content — referenced by both playground and non-playground layouts.
  const panelInner = (
    <>
      {/* Header — brushed-chrome strip with cyan rim and Syne / JetBrains Mono
          typography. Matches the playground center-panel tool-tray pattern. */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{
          borderBottom: "1px solid rgba(0,212,255,0.28)",
          background:
            "linear-gradient(180deg, " +
              "rgba(58,98,158,0.42) 0%, " +
              "rgba(0,212,255,0.10) 50%, " +
              "rgba(8,16,38,0.20) 100%" +
            ")",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",   // top-rim chrome highlight
        }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background:
              "linear-gradient(135deg, #7DD3FC 0%, #00D4FF 45%, #0284C7 100%)",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.35) inset, " +     // chrome ring
              "0 1px 0 rgba(255,255,255,0.4) inset, " +        // top-rim shine
              "0 0 18px rgba(0,212,255,0.7), " +
              "0 0 32px rgba(125,211,252,0.35)",
          }}
        >
          <span className="text-base" style={{ color: "#031024", textShadow: "0 0 6px rgba(255,255,255,0.6)" }}>✦</span>
        </div>
        <div className="leading-tight">
          <p
            className="text-[9px] text-white/45"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            AI Assistant
          </p>
          <p className="text-sm font-display font-extrabold text-white tracking-tight">AIDA</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {voiceOK && (
            <div
              className="flex items-center gap-0.5 rounded-lg p-0.5"
              style={{
                background: "rgba(8,16,32,0.55)",
                border:     "1px solid rgba(0,212,255,0.22)",
                boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.08)",
              }}
            >
              <button
                onClick={() => switchMode("text")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-all duration-200"
                style={mode === "text"
                  ? {
                      background: "linear-gradient(180deg, #7DD3FC 0%, #00D4FF 50%, #0284C7 100%)",
                      color: "#031024",
                      fontWeight: 700,
                      boxShadow: "0 0 12px rgba(0,212,255,0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
                    }
                  : { color: "rgba(255,255,255,0.45)" }}
              >
                <MessageSquare size={9} />
                Text
              </button>
              <button
                onClick={() => switchMode("voice")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-all duration-200"
                style={mode === "voice"
                  ? {
                      background: "linear-gradient(180deg, #7DD3FC 0%, #00D4FF 50%, #0284C7 100%)",
                      color: "#031024",
                      fontWeight: 700,
                      boxShadow: "0 0 12px rgba(0,212,255,0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
                    }
                  : { color: "rgba(255,255,255,0.45)" }}
              >
                <Mic size={9} />
                Voice
              </button>
            </div>
          )}
          {/* Status pill — emerald dot + LIVE label in JetBrains Mono */}
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
            style={{
              background: "rgba(16,185,129,0.10)",
              border: "1px solid rgba(16,185,129,0.28)",
            }}
          >
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            <span
              className="text-[8px] text-emerald-300/85"
              style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.14em" }}
            >
              LIVE
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="ml-0.5 flex items-center justify-center rounded-md w-6 h-6 text-white/40 hover:text-white hover:bg-white/[0.06] transition-all duration-150"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: "none" }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50 pointer-events-none">
            <span className="text-3xl">✦</span>
            <p className="text-xs text-white/50 text-center font-medium leading-relaxed">
              Hi {profile?.display_name?.split(" ")[0] ?? "there"}!<br />
              {mode === "voice"
                ? "Tap the mic below to start talking."
                : "Ask me anything — about this page,\nyour creations, or anything at all."}
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          // Inline thought-bubble nudge — visually distinct: italic, dimmer,
          // dashed border, 💭 prefix. Tinted by nudgeKind: stray = amber,
          // progress = cyan, encourage = neutral.
          if (msg.kind === "nudge") {
            const tint =
              msg.nudgeKind === "stray"    ? "rgba(255,176,32,0.55)"  :
              msg.nudgeKind === "progress" ? "rgba(0,212,255,0.55)"   :
                                             "rgba(255,255,255,0.25)";
            return (
              <div key={i} className="flex gap-2 justify-start opacity-90">
                <div className="max-w-[85%] px-3 py-1.5 rounded-2xl text-[11px] leading-relaxed italic relative"
                  style={{
                    background:   "linear-gradient(180deg, rgba(20,34,60,0.35) 0%, rgba(8,16,32,0.30) 100%)",
                    border:       `1px dashed ${tint}`,
                    color:        "rgba(232,244,255,0.78)",
                    borderRadius: "14px 14px 14px 4px",
                    paddingRight: 28,
                  }}
                >
                  <span className="mr-1.5">💭</span>{msg.content}
                  {/* Audio toggle — switches future thought-bubble voicing
                      on/off. Persisted in localStorage. */}
                  <button
                    type="button"
                    onClick={toggleNudgeAudio}
                    aria-label={nudgeAudioEnabled ? "Mute thought-bubble audio" : "Enable thought-bubble audio"}
                    title={nudgeAudioEnabled ? "Mute thought-bubble audio" : "Enable thought-bubble audio"}
                    style={{
                      position: "absolute",
                      right: 6,
                      top: 6,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(8,16,32,0.6)",
                      border: `1px solid ${tint}`,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {nudgeAudioEnabled ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M3 10v4h4l5 4V6L7 10H3z" stroke="rgba(232,244,255,0.85)" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M16 8a5 5 0 010 8" stroke="rgba(232,244,255,0.85)" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M3 10v4h4l5 4V6L7 10H3z" stroke="rgba(232,244,255,0.6)" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M16 9l5 5M21 9l-5 5" stroke="rgba(255,120,120,0.95)" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            );
          }
          return (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: "linear-gradient(135deg, #7DD3FC 0%, #00D4FF 45%, #0284C7 100%)",
                  boxShadow:  "0 0 0 1px rgba(255,255,255,0.25) inset, 0 0 10px rgba(0,212,255,0.5)",
                }}
              >
                <span className="text-[10px]" style={{ color: "#031024" }}>✦</span>
              </div>
            )}
            <div
              className="max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed"
              style={msg.role === "user" ? {
                background:   "linear-gradient(180deg, #7DD3FC 0%, #00D4FF 55%, #0284C7 100%)",
                color:        "#031024",
                fontWeight:   600,
                borderRadius: "18px 18px 4px 18px",
                boxShadow:    "inset 0 1px 0 rgba(255,255,255,0.35), 0 0 12px rgba(0,212,255,0.35)",
              } : {
                background:   "linear-gradient(180deg, rgba(20,34,60,0.7) 0%, rgba(8,16,32,0.65) 100%)",
                border:       "1px solid rgba(0,212,255,0.18)",
                color:        "rgba(232,244,255,0.92)",
                borderRadius: "18px 18px 18px 4px",
                boxShadow:    "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              {msg.content ? (
                msg.role === "assistant" ? (
                  <ReactMarkdown
                    components={{
                      p:      ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-bold text-white/95">{children}</strong>,
                      em:     ({ children }) => <em className="italic text-white/80">{children}</em>,
                      ul:     ({ children }) => <ul className="list-disc pl-4 space-y-0.5 my-1">{children}</ul>,
                      ol:     ({ children }) => <ol className="list-decimal pl-4 space-y-0.5 my-1">{children}</ol>,
                      li:     ({ children }) => <li className="leading-relaxed">{children}</li>,
                      code:   ({ children }) => <code className="bg-white/10 rounded px-1 py-0.5 font-mono text-[10px]">{children}</code>,
                      h1:     ({ children }) => <p className="font-bold text-white/95 mb-1">{children}</p>,
                      h2:     ({ children }) => <p className="font-bold text-white/90 mb-1">{children}</p>,
                      h3:     ({ children }) => <p className="font-semibold text-white/85 mb-0.5">{children}</p>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.content
                )
              ) : (
                <span className="flex gap-1">
                  {[0, 1, 2].map(j => (
                    <span key={j} className="w-1 h-1 rounded-full bg-white/40 inline-block animate-bounce"
                      style={{ animationDelay: `${j * 0.15}s` }} />
                  ))}
                </span>
              )}
            </div>
          </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Text input ──────────────────────────────────────────────────── */}
      {mode === "text" && (
        <div
          className="px-3 py-3 flex-shrink-0"
          style={{
            borderTop: "1px solid rgba(0,212,255,0.18)",
            background: "linear-gradient(0deg, rgba(8,16,32,0.45) 0%, rgba(8,16,32,0) 100%)",
          }}
        >
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{
              background: "linear-gradient(180deg, rgba(20,34,60,0.7) 0%, rgba(8,16,32,0.7) 100%)",
              border: "1px solid rgba(0,212,255,0.32)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 14px rgba(0,212,255,0.10)",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                const t = e.target;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 80) + "px";
              }}
              onKeyDown={onKey}
              placeholder="Ask AIDA anything…"
              rows={1}
              disabled={streaming}
              style={{
                flex:       1,
                resize:     "none",
                border:     "none",
                outline:    "none",
                background: "transparent",
                fontSize:   12,
                color:      "rgba(255,255,255,0.9)",
                fontFamily: "inherit",
                lineHeight: 1.5,
                overflowY:  "hidden",
              }}
            />
            <button
              onClick={() => { const t = input.trim(); if (t) { coreSend(t); setInput(""); } }}
              disabled={!input.trim() || streaming}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-90"
              style={{
                background: input.trim() && !streaming
                  ? "linear-gradient(180deg, #7DD3FC 0%, #00D4FF 50%, #0284C7 100%)"
                  : "rgba(255,255,255,0.06)",
                boxShadow: input.trim() && !streaming
                  ? "0 0 14px rgba(0,212,255,0.55), inset 0 1px 0 rgba(255,255,255,0.4)"
                  : "none",
              }}
            >
              <Send size={12} style={{ color: input.trim() && !streaming ? "#031024" : "rgba(255,255,255,0.4)" }} />
            </button>
          </div>
        </div>
      )}

      {/* ── Voice panel ─────────────────────────────────────────────────── */}
      {mode === "voice" && (
        <div
          className="px-3 py-3 flex-shrink-0 flex flex-col items-center gap-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => switchVoiceSubMode("tap")}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] transition-all duration-200"
              style={voiceSubMode === "tap"
                ? { background: "rgba(124,58,237,0.45)", color: "#fff" }
                : { color: "rgba(255,255,255,0.38)" }}
            >
              <Mic size={9} />
              Tap
            </button>
            <button
              onClick={() => switchVoiceSubMode("live")}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] transition-all duration-200"
              style={voiceSubMode === "live"
                ? { background: "linear-gradient(135deg,#7C3AED,#FF2D78)", color: "#fff" }
                : { color: "rgba(255,255,255,0.38)" }}
            >
              <Radio size={9} />
              Live
            </button>
          </div>

          {voiceSubMode === "tap" && (
            <>
              <p className="text-[10px] h-3" style={{ color: voiceError ? "#FF6B6B" : "rgba(255,255,255,0.4)" }}>
                {voiceError ?? VOICE_LABEL[voiceState]}
              </p>

              <canvas
                ref={vizCanvasRef}
                width={160}
                height={32}
                style={{
                  opacity:    voiceState === "listening" ? 1 : 0,
                  transition: "opacity 0.4s ease",
                  display:    "block",
                }}
              />

              <div className="flex items-center gap-4">
                <div className="w-8 h-8" />

                <button
                  onClick={toggleVoiceSession}
                  disabled={voiceState === "processing"}
                  className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 disabled:opacity-50"
                  style={{
                    background: voiceState === "idle"
                      ? "rgba(255,255,255,0.08)"
                      : "linear-gradient(135deg, #7C3AED, #FF2D78)",
                    boxShadow: voiceState !== "idle"
                      ? "0 0 28px rgba(124,58,237,0.55)"
                      : "none",
                  }}
                >
                  {voicePulse && (
                    <>
                      <span className="absolute inset-0 rounded-full animate-ping"
                        style={{ background: "rgba(124,58,237,0.22)", animationDuration: "1.4s" }} />
                      <span className="absolute rounded-full animate-ping"
                        style={{ inset: -7, background: "rgba(124,58,237,0.10)", animationDuration: "2.1s", animationDelay: "0.3s" }} />
                    </>
                  )}
                  {voiceState === "speaking" ? (
                    <span className="text-xl select-none">✦</span>
                  ) : voiceState === "listening" ? (
                    <Square size={18} className="text-white" fill="white" />
                  ) : (
                    <Mic size={20} className={voiceState === "idle" ? "text-white/50" : "text-white"} />
                  )}
                </button>

                {voiceState === "listening" ? (
                  <button
                    onClick={e => { e.stopPropagation(); cancelRecording(); }}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                    title="Cancel recording"
                  >
                    <X size={13} className="text-white/50" />
                  </button>
                ) : (
                  <div className="w-8 h-8" />
                )}
              </div>

              {voiceState === "speaking" && (
                <p className="text-[9px] text-white/25">tap to stop</p>
              )}
            </>
          )}

          {voiceSubMode === "live" && (
            <>
              <p className="text-[10px] text-white/55 h-3">{LIVE_LABEL[liveVoice.state]}</p>

              <button
                onClick={toggleLiveCall}
                disabled={liveVoice.state === "arming"}
                className="relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 disabled:opacity-60"
                style={{
                  background: liveVoice.state === "idle"
                    ? "rgba(255,255,255,0.08)"
                    : `linear-gradient(135deg, ${LIVE_COLOR[liveVoice.state]}, ${LIVE_COLOR[liveVoice.state]}cc)`,
                  boxShadow: liveVoice.state !== "idle"
                    ? `0 0 32px ${LIVE_COLOR[liveVoice.state]}66`
                    : "none",
                }}
              >
                {liveVoice.state !== "idle" && (
                  <span
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{
                      background: `${LIVE_COLOR[liveVoice.state]}33`,
                      animationDuration: liveVoice.state === "user-speaking" ? "1s" : "1.6s",
                    }}
                  />
                )}
                {liveVoice.state === "idle" ? (
                  <Radio size={22} className="text-white/55" />
                ) : (
                  <PhoneOff size={20} className="text-white" />
                )}
              </button>

              <div className="h-4 max-w-full px-2">
                {liveVoice.interim && (
                  <p className="text-[10px] italic text-white/55 truncate" style={{ maxWidth: 320 }}>
                    "{liveVoice.interim}"
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* ── Playground: Duolingo hybrid — panel slides up above the character ──
           SIZE knob: change the wrapper width/height clamp below (doubled from
             original clamp(64px, 5.5vw, 96px)). The button is w-full/h-full so
             it scales with the wrapper. Keep width === height (square sprite).
           POSITION knobs: `right` (% from right edge of viewport — higher = more
             to the left), `bottom` (px from bottom edge). Swap `right` for `left`
             if you want to anchor from the left side instead. */}
      {!validatorPanelOpen && !worksheetPopupOpen && onPlayground && (
        <div
          className="fixed z-50"
          style={{
            right:  "62%",                          // ← horizontal position (% from right — higher = more LEFT)
            bottom: "0px",                         // ← vertical position (px from bottom)
            width:  "clamp(173px, 14.4vw, 269px)",    // ← SIZE: matched to SAGE (was clamp(128px, 11vw, 192px))
            height: "clamp(173px, 14.4vw, 269px)",    // ← SIZE: keep equal to width
          }}
        >
          {/* Panel — absolute above the button, centered horizontally */}
          {open && (
            <div
              style={{
                position:  "absolute",
                bottom:    "calc(100% + 10px)",
                left:      "50%",
                transform: "translateX(-50%)",
                width:     "clamp(320px, 28vw, 440px)",
              }}
            >
              <div
                className="flex flex-col rounded-2xl overflow-hidden"
                style={{
                  height:    "clamp(420px, 60vh, 600px)",
                  animation: "aida-slide-up 0.28s cubic-bezier(0.16,1,0.3,1) both",
                  ...panelBaseStyle,
                }}
              >
                {panelInner}
              </div>
            </div>
          )}

          {/* Character trigger — always shows sprite, glow intensifies when open */}
          <button
            onClick={() => { if (voiceState === "listening") return; setOpen(o => !o); }}
            className="w-full h-full flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95"
            style={{
              background: "transparent",
              border:     "none",
              padding:    0,
              cursor:     "pointer",
              filter:     `drop-shadow(0 0 22px rgba(124,58,237,${open ? 0.85 : 0.55}))`,
            }}
            title="Ask AIDA"
          >
            <img
              src="/assistant.png"
              alt=""
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </button>

          {/* Cartoon-style thought bubble — floats above AIDA's head with
              two trailing dots leading down to her, just like a comic-strip
              "she's thinking…" panel. Auto-dismisses after 9s. NOT shown
              inside the chat panel — this is the only place the nudge
              appears, so kids see it whether AIDA is open or not. */}
          {!open && floatingNudge && (() => {
            const isStray    = floatingNudge.kind === "stray";
            const isProgress = floatingNudge.kind === "progress";

            // Theme colours — light cloudy fill, kind-tinted accent outline + glow.
            const fillTop   = "#FFFFFF";
            const fillBot   = "#F0F4FF";
            const stroke    = isStray ? "#FFB020" : isProgress ? "#00D4FF" : "#7DD3FC";
            const text      = "#0B1A2F";              // dark for readability on cloud
            const glow      = isStray ? "rgba(255,176,32,0.55)"
                            : isProgress ? "rgba(0,212,255,0.55)"
                            : "rgba(125,211,252,0.45)";

            return (
              <div
                role="status"
                aria-live="polite"
                aria-label="AIDA is thinking"
                style={{
                  position:      "absolute",
                  bottom:        "calc(100% + 26px)",   // leave space for trailing dots
                  left:          "50%",
                  transform:     "translateX(-50%)",
                  width:         "clamp(220px, 24vw, 320px)",
                  pointerEvents: "auto",
                  animation:     "aida-slide-up 0.32s cubic-bezier(0.16,1,0.3,1) both",
                  filter:        `drop-shadow(0 0 18px ${glow}) drop-shadow(0 8px 18px rgba(0,0,0,0.35))`,
                }}
              >
                {/* The cloud — pseudo-elements via two stacked rounded rects
                    plus radial bumps at the bottom corners make a cartoon
                    cloud shape without needing SVG. */}
                <div
                  style={{
                    position:     "relative",
                    background:   `linear-gradient(180deg, ${fillTop} 0%, ${fillBot} 100%)`,
                    border:       `2.5px solid ${stroke}`,
                    borderRadius: "36px 36px 36px 36px / 30px 30px 28px 28px",
                    padding:      "14px 28px 14px 18px",
                    color:        text,
                    fontSize:     13,
                    lineHeight:   1.45,
                    fontFamily:   "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  {/* Two small "scallop" bumps left + right on the bottom give
                      the bubble its cloud silhouette. */}
                  <span
                    aria-hidden
                    style={{
                      position:   "absolute",
                      left:       18,
                      bottom:     -10,
                      width:      26,
                      height:     20,
                      borderRadius: "50%",
                      background: fillBot,
                      border:     `2.5px solid ${stroke}`,
                      zIndex:     -1,
                    }}
                  />
                  <span
                    aria-hidden
                    style={{
                      position:   "absolute",
                      right:      32,
                      bottom:     -8,
                      width:      22,
                      height:     16,
                      borderRadius: "50%",
                      background: fillBot,
                      border:     `2.5px solid ${stroke}`,
                      zIndex:     -1,
                    }}
                  />
                  {/* The thought text itself */}
                  <span style={{ fontStyle: "italic", fontWeight: 500 }}>
                    {floatingNudge.text}
                  </span>

                  {/* Dismiss button — small, on the cloud */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFloatingNudge(null); }}
                    aria-label="Dismiss"
                    style={{
                      position:    "absolute",
                      top:         -8,
                      right:       -8,
                      width:       22,
                      height:      22,
                      borderRadius: "50%",
                      background:  "#FFFFFF",
                      border:      `2px solid ${stroke}`,
                      color:       text,
                      fontSize:    13,
                      fontWeight:  700,
                      lineHeight:  1,
                      cursor:      "pointer",
                      padding:     0,
                      display:     "flex",
                      alignItems:  "center",
                      justifyContent: "center",
                      boxShadow:   "0 2px 6px rgba(0,0,0,0.25)",
                    }}
                  >×</button>
                </div>

                {/* Trailing thought-dots — two shrinking circles leading down
                    toward AIDA's head. Classic comic-strip "thinking" cue. */}
                <div
                  aria-hidden
                  style={{
                    position:  "absolute",
                    top:       "calc(100% + 4px)",
                    left:      "calc(50% - 16px)",
                    width:     14,
                    height:    14,
                    borderRadius: "50%",
                    background: fillBot,
                    border:    `2.5px solid ${stroke}`,
                    boxShadow: `0 0 10px ${glow}`,
                  }}
                />
                <div
                  aria-hidden
                  style={{
                    position:  "absolute",
                    top:       "calc(100% + 22px)",
                    left:      "calc(50% - 7px)",
                    width:     8,
                    height:    8,
                    borderRadius: "50%",
                    background: fillBot,
                    border:    `2px solid ${stroke}`,
                    boxShadow: `0 0 8px ${glow}`,
                  }}
                />
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Non-playground: fixed bottom-right corner ──────────────────────── */}
      {!validatorPanelOpen && !worksheetPopupOpen && !onPlayground && (
        <>
          <button
            onClick={() => { if (voiceState === "listening") return; setOpen(o => !o); }}
            className="fixed z-50 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95"
            style={{
              right:        "clamp(16px, 1.5vw, 32px)",
              bottom:       "clamp(16px, 2vh, 32px)",
              width:        "clamp(48px, 3.6vw, 64px)",
              height:       "clamp(48px, 3.6vw, 64px)",
              borderRadius: 9999,
              background:   "linear-gradient(135deg, #7C3AED, #FF2D78)",
              boxShadow:    "0 0 32px rgba(124,58,237,0.5), 0 4px 20px rgba(0,0,0,0.4)",
            }}
            title="Ask AIDA"
          >
            {open ? <X size={22} className="text-white" /> : <span className="text-2xl select-none">✦</span>}
          </button>

          {open && (
            <div
              className="fixed z-50 flex flex-col rounded-2xl overflow-hidden"
              style={{
                right:     "clamp(16px, 1.5vw, 32px)",
                bottom:    "clamp(96px, 12vh, 140px)",
                width:     "clamp(320px, 28vw, 460px)",
                height:    "clamp(440px, 62vh, 640px)",
                animation: "aida-slide-up 0.28s cubic-bezier(0.16,1,0.3,1) both",
                ...panelBaseStyle,
              }}
            >
              {panelInner}
            </div>
          )}
        </>
      )}
    </>
  );
}

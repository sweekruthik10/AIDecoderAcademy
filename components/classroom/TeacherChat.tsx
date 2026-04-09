"use client";

// Classroom Teacher chat panel — Ms. Bhavna.
// Text + Voice modes (tap-to-talk and live call).
// Lecture mode lives in LecturePanel — the "Lesson" button here opens it.
//
// Fixes applied:
//   • Toggle label = current state (Text/Voice pill; "Lesson" button always says Lesson)
//   • X button has generous spacing from the toggles (fat-finger safe)
//   • Voice panel includes "or type" textarea fallback
//   • Space bar triggers tap-to-talk when voice panel is focused
//   • abortStream clears the streaming flag on message bubbles too

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Send, Mic, Square, Volume2, VolumeX, X, BookOpen, MessageSquare } from "lucide-react";
import { buildClassroomGreeting } from "@/lib/teacherPanelGreeting";
import { useTeacherVoice } from "./useTeacherVoice";
import ReactMarkdown from "react-markdown";
import type { Profile } from "@/types";

interface Props {
  profile:            Profile | null;
  chapterTitle?:      string;
  onClose:            () => void;
  /** Lifts Bhavna's speaking state up so the standee can pulse while she talks. */
  onSpeakingChange?:  (speaking: boolean) => void;
  /** Called when the student taps the "Lesson" button. */
  onOpenLecture?:     () => void;
}

type Role = "user" | "assistant";

interface Msg {
  role:      Role;
  content:   string;
  streaming?: boolean;
}

// Compact markdown styling for Bhavna's chat bubbles — keeps headings/lists/code
// readable inside a narrow panel instead of dumping raw ## / ** / ``` symbols.
const TC_MD_CSS = `
.tc-md > :first-child { margin-top: 0; }
.tc-md > :last-child  { margin-bottom: 0; }
.tc-md p              { margin: 0 0 6px; }
.tc-md ul, .tc-md ol  { margin: 0 0 6px; padding-left: 18px; }
.tc-md li             { margin: 2px 0; }
.tc-md h1, .tc-md h2, .tc-md h3 { font-weight: 700; margin: 9px 0 4px; line-height: 1.3; font-family: inherit; letter-spacing: normal; }
.tc-md h1 { font-size: 14.5px; }
.tc-md h2 { font-size: 14px; }
.tc-md h3 { font-size: 13.5px; }
.tc-md strong { font-weight: 800; }
.tc-md code   { background: rgba(255,255,255,0.12); border-radius: 4px; padding: 1px 4px; font-size: 12px; }
.tc-md pre    { background: rgba(0,0,0,0.4); border-radius: 8px; padding: 8px 10px; overflow-x: auto; margin: 0 0 6px; }
.tc-md pre code { background: transparent; padding: 0; }
.tc-md a { color: #E0B14C; text-decoration: underline; }
`;

// Bullets sometimes arrive as the U+2212 minus sign / en-dash, which markdown
// won't parse as a list. Normalise them to real "- " bullets before rendering.
const normalizeMd = (s: string) => s.replace(/^[−–]\s/gm, "- ");

// ── Teacher palette ───────────────────────────────────────────────────────────
const NAVY_DEEP   = "#0A1230";
const NAVY_MID    = "#15224E";
const GOLD        = "#E0B14C";
const GOLD_GLOW   = "rgba(224,177,76,0.45)";
const VIOLET      = "#9D6BFF";
const VIOLET_DEEP = "#5B2BCC";
const TEXT_HI     = "#F4ECD7";
const TEXT_MID    = "rgba(244,236,215,0.78)";
const TEXT_LO     = "rgba(244,236,215,0.50)";

export function TeacherChat({ profile, chapterTitle, onClose, onSpeakingChange, onOpenLecture }: Props) {
  const [io,        setIo]        = useState<"text" | "voice">("text");
  const [messages,  setMessages]  = useState<Msg[]>([]);
  const [input,     setInput]     = useState("");
  const [streaming, setStreaming] = useState(false);

  const scrollRef     = useRef<HTMLDivElement>(null);
  const ioRef         = useRef<"text" | "voice">("text");
  const messagesRef   = useRef<Msg[]>([]);
  const streamingRef  = useRef(false);
  const streamGenRef  = useRef(0);
  const sendAbortRef  = useRef<AbortController | null>(null);
  const sendRef       = useRef<(t?: string) => void>(() => {});

  useEffect(() => { ioRef.current = io; }, [io]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── Greeting ─────────────────────────────────────────────────────────────
  const greeting = useMemo(() => {
    const lmRaw = (profile as (Profile & { learner_model?: Record<string, unknown> }) | null)
      ?.learner_model ?? null;
    return buildClassroomGreeting({
      displayName:     profile?.display_name ?? "Explorer",
      activeArena:     profile?.active_arena ?? null,
      isReturning:     ((profile as unknown as { reflection_count?: number })?.reflection_count ?? 0) > 0,
      learnerModelRaw: lmRaw,
    });
  }, [profile]);

  useEffect(() => {
    setMessages([{ role: "assistant", content: greeting.text }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // ── Voice ─────────────────────────────────────────────────────────────────
  const handleTranscript = useCallback((t: string) => {
    sendRef.current(t);
  }, []);

  const voice = useTeacherVoice({
    onTranscript: handleTranscript,
    onInterrupt: () => {
      streamGenRef.current++;
      sendAbortRef.current?.abort();
      setStreaming(false); streamingRef.current = false;
      setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
    },
  });

  // Stable speak ref — lets `send` drop `voice` from its deps
  const speakRef = useRef(voice.speak);
  speakRef.current = voice.speak;

  useEffect(() => {
    onSpeakingChange?.(voice.voiceState === "speaking");
  }, [voice.voiceState, onSpeakingChange]);

  // ── Stream abort ──────────────────────────────────────────────────────────
  const abortStream = useCallback(() => {
    streamGenRef.current++;
    sendAbortRef.current?.abort();
    setStreaming(false); streamingRef.current = false;
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
  }, []);

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || streamingRef.current) return;
    setInput("");

    const myGen  = ++streamGenRef.current;
    const history = messagesRef.current
      .filter(m => !m.streaming)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [
      ...prev,
      { role: "user",      content: text },
      { role: "assistant", content: "", streaming: true },
    ]);
    setStreaming(true); streamingRef.current = true;

    const ctrl = new AbortController();
    sendAbortRef.current = ctrl;
    try {
      const res = await fetch("/api/classroom/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  ctrl.signal,
        body: JSON.stringify({
          message:      text,
          chapterTitle: chapterTitle || "General Study",
          history,
          isVoiceMode:  ioRef.current === "voice",
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Chat ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", full = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (streamGenRef.current !== myGen) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.content) {
              full += parsed.content;
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: full, streaming: true };
                return copy;
              });
            }
          } catch { /* ignore malformed frame */ }
        }
      }
      if (streamGenRef.current !== myGen) return;
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: full, streaming: false };
        return copy;
      });
      if (ioRef.current === "voice" && full.trim()) void speakRef.current(full);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      if (streamGenRef.current !== myGen) return;
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `(Couldn't reach the teacher: ${(e as Error).message})`,
          streaming: false,
        };
        return copy;
      });
    } finally {
      if (streamGenRef.current === myGen) { setStreaming(false); streamingRef.current = false; }
    }
  }, [input, chapterTitle]);

  // Keep ref fresh every render
  sendRef.current = send;

  // ── Close + mode switch ───────────────────────────────────────────────────
  const fireReflection = useCallback(async () => {
    if (messages.length < 2) return;
    try {
      const pid = (profile as { id?: string } | null)?.id;
      if (!pid) return;
      await fetch("/api/learner-model/reflect", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id:         pid,
          session_id:         null,
          surface:            "classroom_teacher",
          messages:           messages.map(m => ({ role: m.role, content: m.content })),
          metrics:            { message_count: messages.length, user_message_count: messages.filter(m => m.role === "user").length },
          session_started_at: new Date(Date.now() - 60_000).toISOString(),
          session_ended_at:   new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch { /* non-blocking */ }
  }, [messages, profile]);

  const handleClose = useCallback(() => {
    abortStream();
    void fireReflection();
    voice.cleanup();
    onClose();
  }, [abortStream, fireReflection, voice, onClose]);

  const switchIo = useCallback((next: "text" | "voice") => {
    if (next === io) return;
    abortStream();
    voice.cleanup();
    setIo(next);
  }, [io, voice, abortStream]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="fixed z-50 flex flex-col"
      style={{
        left:   "calc(clamp(280px, 38vh, 460px) - 24px)",
        bottom: "20px",
        width:  "min(440px, calc(100vw - 32px))",
        height: "min(620px, calc(100vh - 40px))",
        fontFamily:   "var(--font-dm-sans,'DM Sans',sans-serif)",
        borderRadius: 20,
        overflow:     "hidden",
        background: `
          radial-gradient(120% 80% at 0% 0%, ${VIOLET_DEEP}22 0%, transparent 60%),
          radial-gradient(120% 80% at 100% 100%, ${GOLD}1a 0%, transparent 55%),
          linear-gradient(170deg, ${NAVY_MID} 0%, ${NAVY_DEEP} 100%)
        `,
        border:    `1px solid ${GOLD}55`,
        boxShadow: `
          0 1px 0 ${TEXT_HI}1a inset,
          0 24px 60px -20px rgba(2,4,14,0.6),
          0 0 36px -10px ${GOLD_GLOW}
        `,
      }}
    >
      {/* Top hairline */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${GOLD}cc 32%, ${VIOLET}aa 68%, transparent 100%)` }}
      />

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08] flex-shrink-0">
        {/* Avatar */}
        <div className="relative w-9 h-9 rounded-full overflow-hidden flex-shrink-0"
          style={{ border: `1.5px solid ${GOLD}aa`, boxShadow: `0 0 12px ${GOLD_GLOW}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/classroom/teacher-bhavna.png" alt="" className="w-full h-full"
            style={{ objectFit: "cover", objectPosition: "center 18%" }} />
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <div className="uppercase tracking-[0.18em] font-bold"
            style={{ color: GOLD, fontFamily: "var(--font-jetbrains-mono,'JetBrains Mono',monospace)", fontSize: 9 }}>
            Classroom · In Session
          </div>
          <div className="font-black leading-tight"
            style={{ color: TEXT_HI, fontFamily: "var(--font-syne,'Syne',sans-serif)", fontSize: 15 }}>
            Ms. Bhavna
          </div>
        </div>

        {/* Text / Voice toggle — shows current state highlighted */}
        {voice.voiceOK && (
          <div className="flex items-center gap-0.5 rounded-full p-0.5"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
            {(["text", "voice"] as const).map(opt => (
              <button key={opt}
                onClick={() => switchIo(opt)}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors"
                style={io === opt
                  ? { background: `linear-gradient(135deg, ${GOLD}, ${VIOLET})`, color: TEXT_HI }
                  : { color: TEXT_LO }}>
                {opt === "text" ? <MessageSquare size={11} /> : <Mic size={11} />}
                {opt === "text" ? "Text" : "Voice"}
              </button>
            ))}
          </div>
        )}

        {/* Lesson button — opens LecturePanel, not a mode toggle */}
        <button
          onClick={onOpenLecture}
          disabled={streaming}
          title="Start a guided lesson"
          className="px-2.5 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1 transition-colors flex-shrink-0"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: `1px solid rgba(255,255,255,0.12)`,
            color:   TEXT_HI,
            opacity: streaming ? 0.5 : 1,
          }}
        >
          <BookOpen size={12} /> Lesson
        </button>

        {/* Close — separated with extra left margin so it's not misclick-able */}
        <button
          onClick={handleClose}
          aria-label="Close"
          className="ml-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.04)", color: TEXT_MID }}
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: "thin" }}>
        <style>{TC_MD_CSS}</style>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="rounded-2xl px-3.5 py-2.5 max-w-[85%]"
              style={{
                background: m.role === "user"
                  ? `linear-gradient(135deg, ${VIOLET_DEEP}, ${VIOLET})`
                  : `linear-gradient(180deg, ${TEXT_HI}10, ${TEXT_HI}05)`,
                border:     `1px solid ${m.role === "user" ? `${VIOLET}aa` : `${TEXT_HI}1a`}`,
                color:      TEXT_HI,
                fontSize:   13.5,
                lineHeight: 1.55,
                whiteSpace: m.role === "user" ? "pre-wrap" : "normal",
                wordBreak:  "break-word",
              }}
            >
              {m.role === "assistant"
                ? <div className="tc-md"><ReactMarkdown>{normalizeMd(m.content || (m.streaming ? "…" : ""))}</ReactMarkdown></div>
                : (m.content || (m.streaming ? "…" : ""))}
              {m.streaming && m.content && (
                <span className="inline-block w-1 h-3 ml-0.5 align-middle"
                  style={{ background: GOLD, animation: "tcblink 1s steps(2) infinite" }} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Voice error chip */}
      {voice.voiceError && (
        <div className="mx-4 mb-2 text-[11px] rounded-lg px-3 py-1.5"
          style={{ color: "#FFC7CC", background: "rgba(255,87,108,0.12)", border: "1px solid rgba(255,87,108,0.35)" }}>
          {voice.voiceError}
        </div>
      )}

      {/* ── Text input row ── */}
      {io === "text" && (
        <div className="flex items-center gap-2 px-3 py-3 border-t border-white/[0.08] flex-shrink-0"
          style={{ background: "rgba(0,0,0,0.18)" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={streaming ? "Bhavna is typing…" : "Ask Ms. Bhavna anything…"}
            disabled={streaming}
            className="flex-1 bg-transparent outline-none text-[13.5px] px-2"
            style={{ color: TEXT_HI }}
          />
          <button
            onClick={() => void send()}
            disabled={streaming || !input.trim()}
            aria-label="Send"
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
            style={{
              background: input.trim() && !streaming
                ? `linear-gradient(135deg, ${GOLD}, ${VIOLET})`
                : "rgba(255,255,255,0.06)",
              border:  `1px solid ${input.trim() && !streaming ? GOLD : "rgba(255,255,255,0.12)"}`,
              color:   TEXT_HI,
              opacity: streaming || !input.trim() ? 0.5 : 1,
              cursor:  streaming || !input.trim() ? "not-allowed" : "pointer",
            }}
          >
            <Send size={15} />
          </button>
        </div>
      )}

      {/* ── Voice panel ── */}
      {io === "voice" && <VoicePanel voice={voice} streaming={streaming} onSend={send} />}

      <style jsx>{`
        @keyframes tcblink { from { opacity: 1; } to { opacity: 0; } }
      `}</style>
    </motion.div>
  );
}

// ── VoicePanel ────────────────────────────────────────────────────────────────
// tap + live sub-modes, mic visualizer, mute, and an "or type" fallback textarea.
function VoicePanel({
  voice,
  streaming,
  onSend,
}: {
  voice:    ReturnType<typeof useTeacherVoice>;
  streaming: boolean;
  onSend:   (text?: string) => void;
}) {
  const { voiceState, subMode, setSubMode, liveState, muted, toggleMute,
          toggleTap, toggleLive, micStream, cleanup } = voice;
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const [typeOpen,  setTypeOpen]  = useState(false);
  const [typeInput, setTypeInput] = useState("");

  // Space bar = tap-to-talk toggle (when focus is not in an input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      e.preventDefault();
      if (subMode === "tap") toggleTap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subMode, toggleTap]);

  // Mic visualizer — runs while recording
  useEffect(() => {
    if (voiceState !== "listening" || !micStream) return;
    let raf = 0, ctx: AudioContext | null = null;
    try {
      const ACtx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      ctx = new ACtx();
      const src      = ctx.createMediaStreamSource(micStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const cv   = canvasRef.current!;
      const c2   = cv.getContext("2d")!;
      const draw = () => {
        raf = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(data);
        c2.clearRect(0, 0, cv.width, cv.height);
        const BAR = 26, W = 3, GAP = 2;
        const startX = (cv.width - (BAR * (W + GAP) - GAP)) / 2;
        for (let i = 0; i < BAR; i++) {
          const amp = data[Math.floor((i / BAR) * data.length * 0.55)] / 255;
          const h   = Math.max(2, amp * cv.height);
          c2.fillStyle = `rgba(224,177,76,${0.45 + amp * 0.55})`;
          c2.fillRect(startX + i * (W + GAP), (cv.height - h) / 2, W, h);
        }
      };
      draw();
    } catch { /* visualizer is optional */ }
    return () => { cancelAnimationFrame(raf); ctx?.close().catch(() => {}); };
  }, [voiceState, micStream]);

  const tapLabel: Record<string, string> = {
    idle: "Tap mic to talk", listening: "Recording… tap to send",
    processing: "Processing…", speaking: "Speaking…",
  };
  const liveLabel: Record<string, string> = {
    idle: "Tap to start a live call", arming: "Connecting…",
    listening: "Listening… just talk", "user-speaking": "Heard you — keep going",
    "awaiting-end": "Catching the rest…", "llm-thinking": "Thinking…",
    "ai-speaking": "Speaking… (talk to interrupt)",
  };
  const label  = subMode === "live" ? (liveLabel[liveState] ?? "") : (tapLabel[voiceState] ?? "");
  const active = subMode === "tap"  ? voiceState !== "idle"         : liveState  !== "idle";

  const GOLD   = "#E0B14C";
  const GOLD_GLOW = "rgba(224,177,76,0.45)";
  const VIOLET = "#9D6BFF";
  const TEXT_HI = "#F4ECD7";
  const TEXT_MID = "rgba(244,236,215,0.78)";
  const TEXT_LO  = "rgba(244,236,215,0.50)";

  return (
    <div className="px-3 py-3 flex flex-col items-center gap-2 border-t border-white/[0.08] flex-shrink-0"
      style={{ background: "rgba(0,0,0,0.18)" }}>

      {/* Tap / Live sub-mode toggle */}
      <div className="flex gap-0.5 rounded-full p-0.5" style={{ background: "rgba(255,255,255,0.06)" }}>
        {(["tap", "live"] as const).map(s => (
          <button key={s}
            onClick={() => { if (s !== subMode) { cleanup(); setSubMode(s); } }}
            disabled={streaming}
            className="px-3 py-1 rounded-full text-[10px] font-bold transition-colors"
            style={subMode === s
              ? { background: `linear-gradient(135deg, ${GOLD}, ${VIOLET})`, color: TEXT_HI }
              : { color: TEXT_LO, opacity: streaming ? 0.5 : 1 }}>
            {s === "tap" ? "Tap to talk" : "Live call"}
          </button>
        ))}
      </div>

      <canvas ref={canvasRef} width={120} height={28} />
      <p className="text-[11px]" style={{ color: TEXT_MID }}>{label}</p>

      <div className="flex items-center gap-3">
        <button
          onClick={subMode === "tap" ? toggleTap : toggleLive}
          aria-label={active ? "Stop" : "Start"}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-95"
          style={{
            background: `linear-gradient(135deg, ${GOLD}, ${VIOLET})`,
            boxShadow:  `0 0 18px ${GOLD_GLOW}`,
          }}>
          {active ? <Square size={20} color="#fff" /> : <Mic size={22} color="#fff" />}
        </button>
        <button
          onClick={toggleMute}
          title={muted ? "Unmute Bhavna" : "Mute Bhavna"}
          aria-label={muted ? "Unmute Bhavna" : "Mute Bhavna"}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${muted ? GOLD : "rgba(255,255,255,0.12)"}` }}>
          {muted ? <VolumeX size={15} color={TEXT_HI} /> : <Volume2 size={15} color={TEXT_HI} />}
        </button>
      </div>

      {/* "or type" fallback — expands a textarea so STT failures don't brick input */}
      <button
        onClick={() => setTypeOpen(v => !v)}
        className="text-[10px] underline underline-offset-2 transition-colors"
        style={{ color: TEXT_LO }}>
        {typeOpen ? "hide keyboard" : "or type instead"}
      </button>
      {typeOpen && (
        <div className="w-full flex gap-2 items-center">
          <input
            value={typeInput}
            onChange={e => setTypeInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && typeInput.trim() && !streaming) {
                onSend(typeInput.trim());
                setTypeInput("");
              }
            }}
            placeholder="Type your message…"
            disabled={streaming}
            className="flex-1 bg-transparent outline-none text-[12.5px] px-3 py-1.5 rounded-lg"
            style={{ border: `1px solid rgba(255,255,255,0.12)`, color: TEXT_HI, background: "rgba(255,255,255,0.04)" }}
          />
          <button
            onClick={() => { if (typeInput.trim()) { onSend(typeInput.trim()); setTypeInput(""); } }}
            disabled={streaming || !typeInput.trim()}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: typeInput.trim() && !streaming ? `linear-gradient(135deg, ${GOLD}, ${VIOLET})` : "rgba(255,255,255,0.06)",
              opacity: (streaming || !typeInput.trim()) ? 0.5 : 1,
            }}>
            <Send size={13} color={TEXT_HI} />
          </button>
        </div>
      )}
    </div>
  );
}

export default TeacherChat;

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveVoice } from "@/components/aida/voice/useLiveVoice";
import type { LiveState } from "@/components/aida/voice/LiveVoiceSession";

export type VoiceState   = "idle" | "listening" | "processing" | "speaking";
export type VoiceSubMode = "tap" | "live";

const MUTE_KEY = "bhavna:voiceMute";

// ── Module-level TTS playback state ─────────────────────────────────────────
// Only one teacher ever speaks at a time, so playback state lives at module
// scope — NOT inside the hook. This guarantees that ANY cleanup (even from a
// freshly remounted hook instance — HMR, or TeacherCharacter remounting as the
// classroom switches views) reliably halts audio an earlier instance started.
// A per-instance ref could only ever see its own audio; an orphaned instance's
// playback would run on forever.
let ttsGen = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeQueue: { audio: HTMLAudioElement; url: string }[] = [];
let activeTtsAbort: AbortController | null = null;

/** Hard-stop all teacher TTS — current chunk, queued chunks, and the fetch. */
function haltTeacherTts() {
  ttsGen++;
  if (activeTtsAbort) { try { activeTtsAbort.abort(); } catch { /* noop */ } activeTtsAbort = null; }
  if (activeAudio) { try { activeAudio.pause(); } catch { /* noop */ } activeAudio = null; }
  for (const { audio, url } of activeQueue) {
    try { audio.pause(); } catch { /* noop */ }
    URL.revokeObjectURL(url);
  }
  activeQueue = [];
}

interface Options {
  /** Called with a final transcript (tap or live). Caller sends it to chat. */
  onTranscript: (text: string) => void;
  /** Called when the user barges in during live mode — caller aborts streams. */
  onInterrupt?: () => void;
}

export interface UseTeacherVoiceReturn {
  voiceState:   VoiceState;
  subMode:      VoiceSubMode;
  setSubMode:   (s: VoiceSubMode) => void;
  voiceOK:      boolean;
  voiceError:   string | null;
  muted:        boolean;
  toggleMute:   () => void;
  micStream:    MediaStream | null;
  liveState:    LiveState;
  toggleTap:    () => void;
  toggleLive:   () => void;
  speak:        (text: string) => Promise<void>;
  cleanup:      () => void;
}

export function useTeacherVoice(opts: Options): UseTeacherVoiceReturn {
  const [voiceState, setVoiceStateRaw] = useState<VoiceState>("idle");
  const [subMode,    setSubMode]       = useState<VoiceSubMode>("tap");
  const [voiceOK,    setVoiceOK]       = useState(false);
  const [voiceError, setVoiceError]    = useState<string | null>(null);
  const [muted,      setMuted]         = useState(false);
  const [micStream,  setMicStream]     = useState<MediaStream | null>(null);

  const voiceStateRef = useRef<VoiceState>("idle");
  const subModeRef    = useRef<VoiceSubMode>("tap");
  const mutedRef      = useRef(false);
  const mrRef         = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const micRef        = useRef<MediaStream | null>(null);
  const cancelledRef  = useRef(false);
  const sttAbortRef   = useRef<AbortController | null>(null);
  const liveSetSpeakingRef = useRef<(s: boolean) => void>(() => {});
  const onTranscriptRef = useRef(opts.onTranscript);
  const onInterruptRef  = useRef(opts.onInterrupt);
  useEffect(() => { onTranscriptRef.current = opts.onTranscript; }, [opts.onTranscript]);
  useEffect(() => { onInterruptRef.current  = opts.onInterrupt;  }, [opts.onInterrupt]);

  function setVoiceState(s: VoiceState) { voiceStateRef.current = s; setVoiceStateRaw(s); }
  useEffect(() => { subModeRef.current = subMode; }, [subMode]);

  // ── Capability detection + mute persistence ──────────────────────────────
  useEffect(() => {
    setVoiceOK(typeof window !== "undefined"
      && typeof window.MediaRecorder !== "undefined"
      && typeof navigator?.mediaDevices?.getUserMedia === "function");
    if (typeof window !== "undefined" && localStorage.getItem(MUTE_KEY) === "on") {
      setMuted(true); mutedRef.current = true;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(v => {
      const next = !v;
      mutedRef.current = next;
      if (typeof window !== "undefined") localStorage.setItem(MUTE_KEY, next ? "on" : "off");
      if (next) {
        // Muting now → kill any in-flight playback immediately.
        haltTeacherTts();
        if (voiceStateRef.current === "speaking") setVoiceState("idle");
      }
      return next;
    });
  }, []);

  const flashError = useCallback((m: string) => {
    setVoiceError(m);
    setTimeout(() => setVoiceError(null), 3500);
  }, []);

  function stopMic() {
    micRef.current?.getTracks().forEach(t => t.stop());
    micRef.current = null;
    setMicStream(null);
  }

  // ── TTS: chunked-SSE playback (Bhavna voice via role "classroom") ────────
  const speak = useCallback(async (text: string) => {
    if (mutedRef.current || !text.trim()) return;
    haltTeacherTts();                       // stop anything already playing
    const myGen = ttsGen;                   // haltTeacherTts already bumped it
    activeTtsAbort = new AbortController();
    const mySignal = activeTtsAbort.signal;

    let streamDone = false, firstChunk = true;

    function playNext() {
      if (ttsGen !== myGen) return;
      const item = activeQueue.shift();
      if (!item) {
        activeAudio = null;
        if (streamDone && voiceStateRef.current === "speaking") {
          setVoiceState("idle");
          if (subModeRef.current === "live") liveSetSpeakingRef.current(false);
        }
        return;
      }
      const { audio, url } = item;
      activeAudio = audio;
      if (subModeRef.current === "live") liveSetSpeakingRef.current(true);
      let advanced = false;
      const advance = () => {
        if (advanced) return; advanced = true;
        URL.revokeObjectURL(url);
        if (activeAudio === audio) activeAudio = null;
        playNext();
      };
      audio.onended = advance; audio.onerror = advance;
      audio.play().catch(advance);
    }

    try {
      setVoiceState("speaking");
      const res = await fetch("/api/aida/tts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text, role: "classroom" }),
        signal:  mySignal,
      });
      if (ttsGen !== myGen) return;
      if (!res.ok || !res.body) throw new Error("TTS failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (ttsGen !== myGen) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") { streamDone = true; continue; }
          const bin = atob(data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: "audio/mpeg" });
          const url  = URL.createObjectURL(blob);
          activeQueue.push({ audio: new Audio(url), url });
          if (firstChunk) { firstChunk = false; playNext(); }
        }
      }
      streamDone = true;
      if (ttsGen !== myGen) return;
      if (!activeAudio && activeQueue.length > 0) { playNext(); return; }
      if (!activeAudio && voiceStateRef.current === "speaking") setVoiceState("idle");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      if (ttsGen === myGen) {
        flashError("Voice playback failed.");
        if (voiceStateRef.current === "speaking") setVoiceState("idle");
        if (subModeRef.current === "live") liveSetSpeakingRef.current(false);
      }
    }
  }, [flashError]);

  // ── Tap STT ──────────────────────────────────────────────────────────────
  function pickMime(): string {
    const c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (const m of c) if (MediaRecorder.isTypeSupported(m)) return m;
    return "audio/webm";
  }

  const startTap = useCallback(async () => {
    cancelledRef.current = false;
    chunksRef.current = [];
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
      });
    } catch {
      flashError("Mic permission denied or unavailable.");
      setVoiceState("idle");
      return;
    }
    if (voiceStateRef.current !== "listening") { stream.getTracks().forEach(t => t.stop()); return; }
    micRef.current = stream;
    setMicStream(stream);
    const mime = pickMime();
    let mr: MediaRecorder;
    try { mr = new MediaRecorder(stream, { mimeType: mime }); }
    catch { stopMic(); setVoiceState("idle"); flashError("Recorder unavailable."); return; }

    mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      const cancelled = cancelledRef.current;
      cancelledRef.current = false;
      const chunks = chunksRef.current;
      chunksRef.current = [];
      stopMic();
      if (cancelled) return;
      const blob = new Blob(chunks, { type: mime });
      if (blob.size === 0) { flashError("No audio captured — try again."); setVoiceState("idle"); return; }
      const ctrl = new AbortController();
      sttAbortRef.current = ctrl;
      try {
        const res = await fetch("/api/aida/stt", {
          method: "POST", headers: { "Content-Type": mime }, body: blob, signal: ctrl.signal,
        });
        if (sttAbortRef.current === ctrl) sttAbortRef.current = null;
        if (!res.ok) { flashError("Voice recognition failed — try again."); setVoiceState("idle"); return; }
        const { transcript } = await res.json();
        const t = (transcript ?? "").trim();
        if (t) { setVoiceState("idle"); onTranscriptRef.current(t); }
        else { flashError("Didn't catch that — try again."); setVoiceState("idle"); }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        flashError("Voice recognition failed — try again.");
        setVoiceState("idle");
      }
    };
    mrRef.current = mr;
    mr.start(100);
  }, [flashError]);

  // ── Live call (reuses the persona-agnostic AIDA live engine) ─────────────
  const live = useLiveVoice({
    onFinalTranscript: t => onTranscriptRef.current(t),
    onInterrupt: () => {
      haltTeacherTts();
      onInterruptRef.current?.();
    },
    onError: err => flashError(err.message || "Live voice error."),
  });
  liveSetSpeakingRef.current = live.setAiSpeaking;

  // ── Teardown — defined after `live` because it calls live.stop() ─────────
  const cleanup = useCallback(() => {
    if (mrRef.current && mrRef.current.state !== "inactive") {
      cancelledRef.current = true;
      try { mrRef.current.stop(); } catch { /* noop */ }
    }
    mrRef.current = null;
    chunksRef.current = [];
    stopMic();
    sttAbortRef.current?.abort(); sttAbortRef.current = null;
    haltTeacherTts();
    void live.stop();
    setVoiceState("idle");
  }, [live]);

  const toggleTap = useCallback(() => {
    if (voiceStateRef.current === "idle") { setVoiceState("listening"); startTap(); }
    else if (voiceStateRef.current === "listening") {
      setVoiceState("processing");
      cancelledRef.current = false;
      if (mrRef.current && mrRef.current.state !== "inactive") mrRef.current.stop();
      else setVoiceState("idle");
    } else {
      cleanup();
    }
  }, [startTap, cleanup]);

  const toggleLive = useCallback(() => {
    if (live.state === "idle") void live.start();
    else void live.stop();
  }, [live]);

  // Tear down on unmount ONLY. `cleanup`'s identity changes every render (it
  // depends on `live`, whose return object is a fresh literal each render), so
  // depending on it directly would re-run this effect every render and fire
  // the teardown constantly — instantly killing a just-started recording.
  // Ref indirection keeps the deps empty while still calling the latest cleanup.
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  useEffect(() => () => cleanupRef.current(), []);

  return {
    voiceState, subMode, setSubMode, voiceOK, voiceError, muted, toggleMute,
    micStream, liveState: live.state, toggleTap, toggleLive, speak, cleanup,
  };
}

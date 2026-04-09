"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { LiveVoiceSession, type LiveState } from "./LiveVoiceSession";

export interface UseLiveVoiceOptions {
  // Called when Deepgram delivers a final transcript ready to send to the LLM.
  // The parent's coreSend handles the actual /api/aida call + TTS playback;
  // this hook just hands over the text.
  onFinalTranscript: (text: string) => void;

  // Called when the user starts speaking while AIDA is talking.
  // Parent should: pause audio queue, abort TTS fetch, abort LLM stream,
  // and (optionally) preserve the partial AI response as interruptedContext.
  onInterrupt: () => void;

  onError?: (err: Error) => void;
}

export interface UseLiveVoiceReturn {
  state:    LiveState;
  interim:  string;
  start:    () => Promise<void>;
  stop:     () => Promise<void>;
  // Parent calls this when TTS playback begins / ends so the state machine
  // can transition to/from "ai-speaking" — needed for interruption detection.
  setAiSpeaking: (speaking: boolean) => void;
}

export function useLiveVoice(opts: UseLiveVoiceOptions): UseLiveVoiceReturn {
  const sessionRef = useRef<LiveVoiceSession | null>(null);
  const [state,   setState]   = useState<LiveState>("idle");
  const [interim, setInterim] = useState("");

  // Stable refs so we don't tear down/remake the session on every callback change.
  const onFinalRef     = useRef(opts.onFinalTranscript);
  const onInterruptRef = useRef(opts.onInterrupt);
  const onErrorRef     = useRef(opts.onError);
  useEffect(() => { onFinalRef.current     = opts.onFinalTranscript; }, [opts.onFinalTranscript]);
  useEffect(() => { onInterruptRef.current = opts.onInterrupt; },      [opts.onInterrupt]);
  useEffect(() => { onErrorRef.current     = opts.onError; },          [opts.onError]);

  const start = useCallback(async () => {
    if (sessionRef.current) return;

    const session = new LiveVoiceSession();
    sessionRef.current = session;

    session.setListener(ev => {
      switch (ev.type) {
        case "state":
          setState(ev.state);
          if (ev.state === "user-speaking" || ev.state === "listening") {
            setInterim("");
          }
          break;
        case "interim":
          setInterim(ev.text);
          break;
        case "final-transcript":
          setInterim("");
          onFinalRef.current(ev.text);
          break;
        case "interrupt":
          onInterruptRef.current();
          break;
        case "error":
          onErrorRef.current?.(ev.error);
          break;
      }
    });

    await session.start();
  }, []);

  const stop = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    sessionRef.current = null;
    await s.stop();
    setState("idle");
    setInterim("");
  }, []);

  const setAiSpeaking = useCallback((speaking: boolean) => {
    sessionRef.current?.setAiSpeaking(speaking);
  }, []);

  // Tear down on unmount or page navigation.
  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  return { state, interim, start, stop, setAiSpeaking };
}

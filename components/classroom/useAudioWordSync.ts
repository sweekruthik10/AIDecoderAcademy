"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { WordTiming } from "@/lib/classroomAudio";

/** Returns index of the word currently being spoken, or -1.
 *  Drives a rAF loop only while the audio is actually playing. */
export function useAudioWordSync(
  audioRef: RefObject<HTMLAudioElement | null>,
  words: WordTiming[],
): number {
  const [idx, setIdx] = useState(-1);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || words.length === 0) return;

    const findIdx = (t: number) => {
      // linear scan is fine for ~250 words; words are time-sorted
      for (let i = 0; i < words.length; i++) {
        if (t >= words[i].start && t < words[i].end) return i;
      }
      // between words: highlight the last word whose start has passed
      let last = -1;
      for (let i = 0; i < words.length; i++) {
        if (words[i].start <= t) last = i; else break;
      }
      return last;
    };

    const tick = () => {
      setIdx(findIdx(el.currentTime));
      rafRef.current = requestAnimationFrame(tick);
    };
    const start = () => { if (rafRef.current == null) tick(); };
    const stop = () => {
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
    const reset = () => { stop(); setIdx(-1); };
    const onSeek = () => setIdx(findIdx(el.currentTime));

    el.addEventListener("play", start);
    el.addEventListener("playing", start);
    el.addEventListener("pause", stop);
    el.addEventListener("ended", reset);
    el.addEventListener("seeking", onSeek);

    return () => {
      stop();
      el.removeEventListener("play", start);
      el.removeEventListener("playing", start);
      el.removeEventListener("pause", stop);
      el.removeEventListener("ended", reset);
      el.removeEventListener("seeking", onSeek);
    };
  }, [audioRef, words]);

  return idx;
}

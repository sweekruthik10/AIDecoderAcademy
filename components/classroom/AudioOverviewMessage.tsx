"use client";
import { useRef, useState, useEffect } from "react";
import { Play, Pause } from "lucide-react";
import type { WordTiming } from "@/lib/classroomAudio";
import { useAudioWordSync } from "./useAudioWordSync";
import { InfographicCard } from "./InfographicCard";

export interface AudioOverviewPayload {
  audioUrl: string;
  title: string;
  script: string;
  words: WordTiming[];
  formulas: { latex: string; caption: string }[];
  table: { headers: string[]; rows: string[][] } | null;
  keyPoints: string[];
}

const NAVY = "#0f1c4d";
const GOLD = "#C8A84B";

function fmt(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function AudioOverviewMessage({ payload }: { payload: AudioOverviewPayload }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const active = useAudioWordSync(audioRef, payload.words);

  useEffect(() => {
    const el = audioRef.current; if (!el) return;
    const onTime = () => setCur(el.currentTime);
    const onMeta = () => setDur(el.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current; if (!el) return;
    if (el.paused) el.play(); else el.pause();
  };
  const seekTo = (t: number) => { const el = audioRef.current; if (el) el.currentTime = t; };

  return (
    <div className="rounded-2xl p-4 max-w-[92%]"
      style={{ background: "rgba(255,255,255,0.95)", border: `1px solid ${NAVY}1f`,
        boxShadow: "0 6px 22px rgba(15,28,77,0.14)" }}>
      <audio ref={audioRef} src={payload.audioUrl} preload="metadata" autoPlay />

      <p className="font-display font-black text-sm mb-2" style={{ color: NAVY }}>
        🎧 {payload.title}
      </p>

      {/* Player */}
      <div className="flex items-center gap-3">
        <button onClick={toggle}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: GOLD, color: "#fff" }} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" style={{ marginLeft: 1 }} />}
        </button>
        <input type="range" min={0} max={dur || 0} step={0.01} value={cur}
          onChange={(e) => seekTo(parseFloat(e.target.value))}
          className="flex-1 accent-[#C8A84B]" aria-label="Seek" />
        <span className="text-xs font-mono flex-shrink-0" style={{ color: `${NAVY}99` }}>
          {fmt(cur)} / {fmt(dur)}
        </span>
      </div>

      {/* Karaoke transcript */}
      {payload.words.length > 0 && (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: `${NAVY}cc` }}>
          {payload.words.map((w, i) => (
            <span key={i}
              onClick={() => seekTo(w.start)}
              className="cursor-pointer rounded px-0.5 transition-colors"
              style={i === active ? { background: GOLD, color: "#fff" } : undefined}>
              {w.text}{" "}
            </span>
          ))}
        </p>
      )}

      {/* Fallback: plain script if no word timings */}
      {payload.words.length === 0 && payload.script && (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: `${NAVY}cc` }}>{payload.script}</p>
      )}

      <InfographicCard formulas={payload.formulas} table={payload.table} keyPoints={payload.keyPoints} />
    </div>
  );
}

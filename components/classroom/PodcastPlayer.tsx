"use client";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export interface PodcastResult {
  audioUrl: string;
  title: string;
  persona: { name: string; archetype: string };
  transcript: { speaker: "host" | "guest"; text: string }[];
}

export function PodcastPlayer({ result, onClose }: { result: PodcastResult; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex flex-col gap-4 p-6 overflow-y-auto"
      style={{ background: "rgba(8,8,15,0.6)", backdropFilter: "blur(10px)" }}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white"><X /></button>
      <h2 className="font-display text-xl text-white">{result.title}</h2>
      <div className="text-sm text-white/70">
        Host <strong>Bhavna</strong> · Guest <strong>{result.persona.name}</strong> ({result.persona.archetype})
      </div>
      <audio src={result.audioUrl} controls autoPlay className="w-full" />
      <div className="flex flex-col gap-2 mt-2">
        {result.transcript.map((t, i) => (
          <div key={i} className="text-sm">
            <span className="font-bold" style={{ color: t.speaker === "host" ? "#2563eb" : "#7dd3fc" }}>
              {t.speaker === "host" ? "Bhavna" : result.persona.name}:
            </span>{" "}
            <span className="text-white/85">{t.text}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

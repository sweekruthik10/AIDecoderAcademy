"use client";
import { motion } from "framer-motion";

export interface LoadProgress {
  stage: "persona" | "script" | "tts" | "done" | "error";
  persona?: { name: string; archetype: string };
  done?: number; total?: number; message?: string;
}

const STAGES = [
  { key: "persona", label: "Finding the perfect expert guest…", icon: "🔎" },
  { key: "script",  label: "Writing the conversation…",          icon: "✍️" },
  { key: "tts",     label: "Recording the episode…",             icon: "🎙️" },
  { key: "done",    label: "Mixing your episode…",               icon: "🎚️" },
] as const;

export function PodcastLoading({ progress }: { progress: LoadProgress }) {
  const order = ["persona", "script", "tts", "done"];
  const curIdx = order.indexOf(progress.stage === "error" ? "persona" : progress.stage);
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 p-8"
         style={{ background: "rgba(8,8,15,0.6)", backdropFilter: "blur(10px)" }}>
      {/* EQ bars — echo SoundBoothWorld aesthetic */}
      <div className="flex items-end gap-1 h-16">
        {Array.from({ length: 24 }).map((_, i) => (
          <motion.span key={i} className="w-1.5 rounded-full" style={{ background: "#2563eb" }}
            animate={{ height: [8, 8 + ((i * 7) % 48), 8] }}
            transition={{ duration: 0.8 + (i % 5) * 0.1, repeat: Infinity, ease: "easeInOut" }} />
        ))}
      </div>
      {progress.persona && (
        <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="rounded-xl px-4 py-3 text-center" style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.4)" }}>
          <div className="text-xs uppercase tracking-wide text-[#7dd3fc]">Today's guest</div>
          <div className="font-display text-white text-lg">{progress.persona.name}</div>
          <div className="text-white/60 text-sm">the {progress.persona.archetype}</div>
        </motion.div>
      )}
      <div className="flex flex-col gap-1.5">
        {STAGES.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 text-sm"
               style={{ opacity: i < curIdx ? 0.5 : i === curIdx ? 1 : 0.3 }}>
            <span>{i < curIdx ? "✅" : s.icon}</span>
            <span className="text-white/90">
              {s.key === "tts" && progress.stage === "tts" && progress.total
                ? `Recording… (${progress.done}/${progress.total})` : s.label}
            </span>
          </div>
        ))}
      </div>
      {progress.stage === "error" && <div className="text-red-400 text-sm">{progress.message ?? "Something went wrong."}</div>}
    </div>
  );
}

"use client";
import { useState } from "react";
import {
  Copy, Check, ChevronLeft, ChevronRight,
  MessageSquare, Paperclip, Pencil, Sparkles,
} from "lucide-react";

export interface PromptPart {
  label:  string;
  prompt: string;
  why:    string;
}
export interface PromptPack {
  objectiveTitle?: string;
  prompts:         PromptPart[];
  attachment?:     string;
}

const CYAN = "#00D4FF";

/**
 * Renders an AIDA "Prompt Pack": the objective's prompt(s) as a stepper.
 * The COPY BOX holds only the clean prompt text (Copy copies exactly that);
 * the learning (why / recipe / tweak nudge) sits OUTSIDE the box so it never
 * pollutes what the student pastes. Next/Prev = fast path for "just give me
 * the prompts". Worked-example + one-line why = quick, evidence-based teaching.
 */
export function PromptPackCard({
  pack,
  onSendToWhiteboard,
}: {
  pack: PromptPack;
  onSendToWhiteboard?: (text: string) => void;
}) {
  const prompts = pack.prompts ?? [];
  const total   = prompts.length;
  const [idx, setIdx]       = useState(0);
  const [copied, setCopied] = useState<"one" | "all" | null>(null);

  if (total === 0) return null;
  const cur = prompts[Math.min(idx, total - 1)];

  const copy = async (text: string, which: "one" | "all") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    } catch { /* clipboard blocked — student can select manually */ }
  };

  return (
    <div
      className="rounded-2xl p-3.5"
      style={{
        background: "linear-gradient(180deg, rgba(13,22,38,0.96), rgba(8,14,26,0.96))",
        border: `1px solid ${CYAN}3d`,
        boxShadow: `0 0 24px -8px ${CYAN}55`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <Sparkles size={15} style={{ color: CYAN }} />
        <span className="text-[11px] font-mono uppercase tracking-[0.14em]" style={{ color: CYAN }}>
          {total > 1 ? `${total} prompts to copy` : "Your prompt"}
        </span>
        {pack.objectiveTitle && (
          <span className="text-white/45 text-[11px] truncate">· {pack.objectiveTitle}</span>
        )}
      </div>

      {/* Stepper (multi-prompt only) */}
      {total > 1 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/85 text-xs font-bold">{cur.label}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="w-6 h-6 grid place-items-center rounded-md disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.06)", color: "#cfe8ff" }}
              aria-label="Previous prompt"
            ><ChevronLeft size={14} /></button>
            <span className="text-[10px] font-mono text-white/50 w-9 text-center">{idx + 1}/{total}</span>
            <button
              onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
              disabled={idx === total - 1}
              className="w-6 h-6 grid place-items-center rounded-md disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.06)", color: "#cfe8ff" }}
              aria-label="Next prompt"
            ><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* Copy box — PURE prompt text, nothing else */}
      <div
        className="rounded-xl p-3 text-[12.5px] leading-relaxed font-mono whitespace-pre-wrap text-white/90"
        style={{
          background: "rgba(0,0,0,0.38)",
          border: "1px solid rgba(255,255,255,0.09)",
          maxHeight: 220, overflowY: "auto",
        }}
      >
        {cur.prompt}
      </div>

      {/* Actions */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => copy(cur.prompt, "one")}
          className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
          style={{ background: CYAN, color: "#031024" }}
        >
          {copied === "one" ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
        </button>
        {total > 1 && (
          <button
            onClick={() => copy(prompts.map((p, i) => `${i + 1}. ${p.label}\n${p.prompt}`).join("\n\n"), "all")}
            className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border"
            style={{ borderColor: `${CYAN}55`, color: CYAN, background: copied === "all" ? `${CYAN}1f` : "transparent" }}
          >
            {copied === "all" ? <><Check size={12} /> All copied</> : <><Copy size={12} /> Copy all</>}
          </button>
        )}
        {onSendToWhiteboard && (
          <button
            onClick={() => onSendToWhiteboard(cur.prompt)}
            className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border"
            style={{ borderColor: "rgba(255,255,255,0.16)", color: "#cfe8ff", background: "transparent" }}
          >
            <MessageSquare size={12} /> Send to Whiteboard
          </button>
        )}
        {total > 1 && idx < total - 1 && (
          <button
            onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ml-auto"
            style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
          >
            Next <ChevronRight size={13} />
          </button>
        )}
      </div>

      {/* Learning strip — OUTSIDE the copy box, never copied */}
      {cur.why && (
        <div className="mt-2.5 text-[11.5px] text-white/60 leading-relaxed">
          <span style={{ color: "#9bd0ff" }}>💡 </span>{cur.why}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {["Role", "What", "Details", "Style"].map((t) => (
          <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}>{t}</span>
        ))}
        <span className="text-[10px] text-white/35 flex items-center gap-1">
          <Pencil size={10} /> tweak one part to make it yours
        </span>
      </div>

      {/* Attachment chip */}
      {pack.attachment && (
        <div
          className="mt-2.5 rounded-lg px-2.5 py-1.5 text-[11.5px] flex items-start gap-1.5"
          style={{ background: "rgba(0,212,255,0.08)", border: `1px solid ${CYAN}33`, color: "#cfe8ff" }}
        >
          <Paperclip size={12} className="mt-0.5 flex-shrink-0" />
          <span>{pack.attachment}</span>
        </div>
      )}
    </div>
  );
}

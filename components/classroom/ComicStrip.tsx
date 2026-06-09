"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, Save, Check, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ComicPanel {
  scene:      string;   // visual description → fed to the image generator
  narration?: string;   // caption-box line (setup / comedic beat)
  speaker:    string;   // who is talking (speech-bubble label)
  dialogue:   string;   // the punchy line shown in the speech bubble
  concept:    string;   // 2-4 word learning tag chip
  fx?:        string;   // optional onomatopoeia sticker (BOOM / FIZZ / …)
  imageUrl?:  string;
  imageError?: boolean;
}

export interface ParsedComic {
  title:    string;        // manga-style comic title (banner)
  panels:   ComicPanel[];
  takeaway: string;        // final recap strip
  raw?:     string;        // original script markdown (for save → reopen re-parse)
}

// ─── Recurring teen cast (relatable students, NOT kiddie mascots) ───────────────
// Three distinct personalities chosen for comedy: dry sarcasm, smug know-it-all,
// and the unlucky goofball things go wrong on.
const CAST_ROSTER = [
  "Ravi — sarcastic teen boy, brown skin, dark undercut hair, grey hoodie; dry deadpan wit, unimpressed reactions",
  "Meera — sharp teen girl, glasses, curly dark hair, denim jacket; smug clever know-it-all who explains with attitude",
  "Jay — goofy lanky teen boy, messy black hair, yellow tee; loud, over-confident, the one things explode on",
];

// Compact look reference injected into every panel image prompt for consistency.
const CAST_LOOK =
  "Ravi: teen boy, brown skin, dark undercut hair, grey hoodie, deadpan face. " +
  "Meera: teen girl, glasses, curly dark hair, denim jacket, smirk. " +
  "Jay: tall lanky teen boy, messy black hair, yellow tee, expressive.";

// Mature modern graphic-novel / Webtoon look — deliberately NOT cute or childish.
// NOTE: must not contain the words comic/strip/panel/frame — the image route turns
// those into a multi-panel 16:9 layout.
const ART_STYLE =
  "modern graphic novel and Webtoon art style, bold confident ink linework, " +
  "cinematic dramatic camera angles, moody expressive lighting, rich gradient and cel shading, " +
  "mature realistic teen character proportions, expressive semi-realistic faces, " +
  "detailed gritty backgrounds, edgy and stylish, high detail — " +
  "NOT cute, NOT chibi, NOT childish, NOT kawaii, NOT a kids cartoon";

// ─── Prompt builder (script) ───────────────────────────────────────────────────
export function buildComicPrompt(topic: string, panels: number): string {
  return `You are a sharp comedy writer making a genuinely FUNNY educational comic about "${topic}" — CBSE Class 10 Science/Maths — for teens (11-16). It must make them actually laugh out loud AND understand the concept. This is NOT a kiddie cartoon — write smart, edgy teen humor, not baby jokes.

COMEDY STYLE — use all three:
- Witty sarcastic banter: dry comebacks, deadpan reactions, characters roasting each other.
- Visual slapstick: things explode/melt/rust, a character gets singed or dramatically over-reacts (put the chaos in the SCENE).
- Gen Z meme energy: relatable, self-aware, internet-flavoured lines (keep it school-appropriate).
End on a real PUNCHLINE in the last panel — a line that actually pays off.

CAST — use ONLY these recurring teens (pick 1-2 per panel, keep them in character):
- ${CAST_ROSTER.join("\n- ")}

Output EXACTLY this format and NOTHING else:

**TITLE:** <short witty title, max 6 words>
**PANEL 1**
NARRATION: <short caption-box line setting up the moment or comedic beat, max 12 words>
SCENE: <what we SEE — which teens are present, setting, facial expressions, any slapstick action/chaos. Visual only, no dialogue text>
SPEAKER: <one character name from the roster above>
DIALOGUE: <one short FUNNY line — sarcasm/meme/punchline, on-topic, max 14 words>
CONCEPT: <2-4 word tag of the idea this panel teaches>
FX: <optional sound effect like BOOM, FIZZ, POW, ZAP, WHOOSH — or "none">
${panels >= 3 ? "(…continue…)\n" : ""}**PANEL ${panels}**
NARRATION: …
SCENE: …
SPEAKER: …
DIALOGUE: …
CONCEPT: …
FX: …
**TAKEAWAY:** <one or two line recap of what was actually learned>

Rules: EXACTLY ${panels} panels. DIALOGUE must be genuinely funny AND short (speech-bubble sized). Build a comedic arc: setup → escalation → punchline on the last panel. Stay scientifically accurate underneath the jokes. Use only the ** labels shown — no other markdown.`;
}

// ─── Per-panel image prompt (graphic-novel, consistent cast, no baked text) ──────
export function buildPanelImagePrompt(scene: string): string {
  return `${ART_STYLE}. Consistent character designs (keep them identical every time) — ${CAST_LOOK}. Scene: ${scene}. Single illustration, dynamic and expressive, no speech bubbles, no captions, no text, no words, no letters, no numbers.`;
}

// ─── Parser ─────────────────────────────────────────────────────────────────────
export function parseComic(md: string): ParsedComic {
  let title = "", takeaway = "";
  const panels: ComicPanel[] = [];
  let cur: ComicPanel | null = null;

  const push = () => {
    if (cur && (cur.dialogue || cur.scene)) panels.push(cur);
    cur = null;
  };

  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;

    if ((m = line.match(/^\*\*TITLE:\*\*\s*(.+)/i)))    { title = m[1].trim();    continue; }
    if ((m = line.match(/^\*\*TAKEAWAY:\*\*\s*(.+)/i))) { push(); takeaway = m[1].trim(); continue; }
    if (line.match(/^\*\*PANEL\s*\d+\*\*/i))            { push(); cur = { scene:"", speaker:"", dialogue:"", concept:"" }; continue; }

    if ((m = line.match(/^NARRATION:\s*(.+)/i))) { if (cur) cur.narration = m[1].trim(); continue; }
    if ((m = line.match(/^SCENE:\s*(.+)/i)))    { if (cur) cur.scene    = m[1].trim(); continue; }
    if ((m = line.match(/^SPEAKER:\s*(.+)/i)))  { if (cur) cur.speaker  = m[1].trim(); continue; }
    if ((m = line.match(/^DIALOGUE:\s*(.+)/i))) { if (cur) cur.dialogue = m[1].trim(); continue; }
    if ((m = line.match(/^CONCEPT:\s*(.+)/i)))  { if (cur) cur.concept  = m[1].trim(); continue; }
    if ((m = line.match(/^FX:\s*(.+)/i)))       { if (cur) cur.fx       = m[1].trim(); continue; }

    // Loose continuation of a multi-line SCENE before any dialogue is set
    if (cur && !cur.dialogue && cur.scene) cur.scene += " " + line;
  }
  push();

  return { title, panels, takeaway };
}

// Normalize the FX value → null when the model wrote "none"/empty.
function fxLabel(fx?: string): string | null {
  if (!fx) return null;
  const t = fx.replace(/["'.!]/g, "").trim();
  if (!t || /^(none|n\/a|no|null)$/i.test(t)) return null;
  return fx.replace(/^["']|["']$/g, "").trim().toUpperCase();
}

// ─── Manga FX sticker ────────────────────────────────────────────────────────────
function FxSticker({ label, accent }: { label: string; accent: string }) {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -25 }}
      animate={{ scale: 1, rotate: -10 }}
      transition={{ type: "spring", stiffness: 320, damping: 12, delay: 0.25 }}
      style={{ position: "absolute", top: "34%", right: 6, pointerEvents: "none", zIndex: 3 }}
    >
      <span style={{
        display: "inline-block", padding: "2px 8px",
        background: accent, color: "#fff",
        border: "2.5px solid #000", borderRadius: 4,
        fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: 14,
        letterSpacing: "0.02em",
        WebkitTextStroke: "0.4px #000",
        boxShadow: "3px 3px 0 #000",
        transform: "skewX(-6deg)",
      }}>{label}</span>
    </motion.div>
  );
}

// ─── A single panel (shared by grid + zoom views) ───────────────────────────────
function PanelArt({ p, index, accent, big, onRetry, onZoom }: {
  p: ComicPanel; index: number; accent: string; big?: boolean;
  onRetry?: () => void; onZoom?: () => void;
}) {
  const loading = !p.imageUrl && !p.imageError;
  const fx = fxLabel(p.fx);
  return (
    <div
      onClick={onZoom}
      style={{
        position: "relative", aspectRatio: big ? "4 / 5" : "3 / 4",
        borderRadius: 8, overflow: "hidden", background: "#0f1c4d",
        border: "3px solid #000",
        boxShadow: big ? "8px 8px 0 #000" : "5px 5px 0 #000",
        cursor: onZoom ? "zoom-in" : "default",
      }}
    >
      {p.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <motion.img
          initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}
          src={p.imageUrl} alt={p.concept || `Panel ${index + 1}`}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : loading ? (
        <div style={{
          width: "100%", height: "100%",
          background: "linear-gradient(90deg,#e8edff 25%,#cdd8ff 50%,#e8edff 75%)",
          backgroundSize: "200% 100%", animation: "comicShimmer 1.5s infinite",
        }} />
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onRetry?.(); }}
          style={{
            width: "100%", height: "100%", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
            background: "linear-gradient(160deg,#1a2550,#0f1c4d)", color: "rgba(255,255,255,0.65)",
          }}
        >
          <RotateCcw className="w-4 h-4" />
          <span style={{ fontSize: 10, fontWeight: 700 }}>Tap to redraw</span>
        </button>
      )}

      {/* Narration caption box — classic comic setup line at the top */}
      {p.narration && (p.imageUrl || p.imageError) && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.08 }}
          style={{
            position: "absolute", top: 6, left: 6, right: 6, zIndex: 1,
            background: "#FFF4D6", border: "2px solid #000", borderRadius: 6,
            padding: big ? "6px 10px 6px 32px" : "4px 7px 4px 26px",
            boxShadow: "2px 2px 0 rgba(0,0,0,0.35)",
          }}
        >
          <span style={{
            fontSize: big ? 11.5 : 8.5, fontWeight: 700, fontStyle: "italic", color: "#3a2a08",
            fontFamily: "'DM Sans',sans-serif", lineHeight: 1.25,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{p.narration}</span>
        </motion.div>
      )}

      {/* Panel number — neubrutalist yellow tag */}
      <div style={{
        position: "absolute", top: 6, left: 6, zIndex: 2,
        minWidth: big ? 26 : 20, height: big ? 26 : 20, padding: "0 4px", borderRadius: 5,
        background: "#FFE14D", color: "#000", fontSize: big ? 14 : 11, fontWeight: 900,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Syne',sans-serif", border: "2px solid #000", boxShadow: "2px 2px 0 #000",
      }}>{index + 1}</div>

      {/* Concept tag */}
      {p.concept && (
        <div style={{
          position: "absolute", top: 6, right: 6, maxWidth: "64%", zIndex: 2,
          padding: "2px 7px", borderRadius: 4,
          background: accent, color: "#fff", fontSize: big ? 10 : 8.5, fontWeight: 800,
          letterSpacing: "0.03em", textTransform: "uppercase",
          fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          border: "2px solid #000", boxShadow: "2px 2px 0 #000",
        }}>{p.concept}</div>
      )}

      {/* Manga FX sticker */}
      {fx && (p.imageUrl || p.imageError) && <FxSticker label={fx} accent={accent} />}

      {/* Speech bubble */}
      {p.dialogue && (p.imageUrl || p.imageError) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.12 }}
          style={{
            position: "absolute", left: 7, right: 7, bottom: 7,
            background: "#fff", borderRadius: 10, border: "2.5px solid #000",
            padding: big ? "9px 12px" : "6px 9px", boxShadow: "3px 3px 0 #000",
          }}
        >
          {p.speaker && (
            <span style={{
              fontSize: big ? 10 : 8, fontWeight: 900, color: accent, textTransform: "uppercase",
              letterSpacing: "0.05em", fontFamily: "'Syne',sans-serif", display: "block", marginBottom: 1,
            }}>{p.speaker}</span>
          )}
          <span style={{
            fontSize: big ? 15 : 11.5, fontWeight: 700, color: "#0f1c4d", lineHeight: 1.3,
            fontFamily: "'DM Sans',sans-serif",
          }}>{p.dialogue}</span>
        </motion.div>
      )}
    </div>
  );
}

// ─── Inline renderer ─────────────────────────────────────────────────────────────
interface Props {
  data:          ParsedComic;
  accent:        string;
  saved?:        boolean;
  onSave?:       () => void;
  onRetryPanel?: (index: number) => void;
}

export function ComicStrip({ data, accent, saved, onSave, onRetryPanel }: Props) {
  const [didSave, setDidSave] = useState(false);
  const [zoom, setZoom]       = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const isSaved = saved || didSave;
  const { panels, takeaway, title } = data;
  const allLoaded = panels.every(p => p.imageUrl || p.imageError);
  const n = panels.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ width: "100%" }}
    >
      <style>{`
        @keyframes comicShimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* Manga title banner */}
      {title && (
        <motion.div
          initial={{ opacity: 0, y: -6, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: -1 }}
          transition={{ duration: 0.3 }}
          style={{
            display: "inline-block", marginBottom: 10, padding: "5px 16px",
            background: `linear-gradient(135deg, #FFE14D, ${accent})`,
            border: "3px solid #000", borderRadius: 10, boxShadow: "4px 4px 0 #000",
            transform: "rotate(-1deg)",
          }}
        >
          <span style={{
            fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: 17, color: "#0f1c4d",
            letterSpacing: "0.01em", textTransform: "uppercase",
            WebkitTextStroke: "0.3px rgba(0,0,0,0.25)",
          }}>{title}</span>
        </motion.div>
      )}

      {/* Panel row — single row so the whole comic fits with no scroll */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 8 }}>
        {panels.map((p, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.32, delay: Math.min(i * 0.12, 0.5), ease: [0.16, 1, 0.3, 1] }}
          >
            <PanelArt
              p={p} index={i} accent={accent}
              onRetry={() => onRetryPanel?.(i)}
              onZoom={p.imageUrl ? () => setZoom(i) : undefined}
            />
          </motion.div>
        ))}
      </div>

      {/* Takeaway strip — neubrutalist bar */}
      {takeaway && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          style={{
            marginTop: 10, display: "flex", alignItems: "center", gap: 9,
            padding: "8px 12px", borderRadius: 10,
            background: "#fff", border: "3px solid #000", boxShadow: "4px 4px 0 #000",
          }}
        >
          <span style={{ fontSize: 15, flexShrink: 0 }}>💡</span>
          <div style={{ minWidth: 0 }}>
            <span style={{
              fontSize: 8.5, fontWeight: 900, color: accent, textTransform: "uppercase",
              letterSpacing: "0.08em", fontFamily: "'JetBrains Mono',monospace", display: "block",
            }}>You learned</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0f1c4d", lineHeight: 1.4, fontFamily: "'DM Sans',sans-serif" }}>
              {takeaway}
            </span>
          </div>
        </motion.div>
      )}

      {/* Save */}
      {onSave && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          {isSaved ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8,
              background: "#22c55e", border: "2.5px solid #000", boxShadow: "3px 3px 0 #000",
              color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: "'DM Sans',sans-serif",
            }}>
              <Check className="w-3.5 h-3.5" /> Saved
            </div>
          ) : (
            <button
              onClick={() => { onSave(); setDidSave(true); }}
              disabled={!allLoaded}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8,
                background: allLoaded ? accent : "#9aa3c0",
                border: "2.5px solid #000", boxShadow: allLoaded ? "3px 3px 0 #000" : "none",
                cursor: allLoaded ? "pointer" : "not-allowed",
                color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: "'DM Sans',sans-serif",
                opacity: allLoaded ? 1 : 0.7,
              }}
            >
              <Save className="w-3.5 h-3.5" /> Save comic
            </button>
          )}
        </div>
      )}

      {/* Zoom overlay — tap a panel to enlarge. Rendered via portal to document.body
          so its fixed positioning covers the WHOLE viewport (escapes the transformed
          comic-viewer ancestor) and nothing else shows alongside the zoomed panel. */}
      {mounted && createPortal(
        <AnimatePresence>
          {zoom !== null && panels[zoom] && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setZoom(null)}
              style={{
                position: "fixed", inset: 0, zIndex: 2000, cursor: "zoom-out",
                background: "rgba(5,8,25,0.92)", backdropFilter: "blur(10px)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
              }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 10 }} transition={{ duration: 0.2 }}
                onClick={e => e.stopPropagation()}
                style={{ width: "min(440px,86vw)", position: "relative" }}
              >
                <button onClick={() => setZoom(null)}
                  style={{
                    position: "absolute", top: -14, right: -14, zIndex: 4, width: 32, height: 32, borderRadius: "50%",
                    background: "#fff", border: "2.5px solid #000", boxShadow: "3px 3px 0 #000",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                  }}>
                  <X className="w-4 h-4" style={{ color: "#000" }} />
                </button>
                <PanelArt p={panels[zoom]} index={zoom} accent={accent} big />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
}

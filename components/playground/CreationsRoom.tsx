"use client";

import { useState, useRef, useEffect } from "react";
import { Image as ImageIcon, FileText, X as XIcon } from "lucide-react";
import { MessageBubble } from "@/components/playground/MessageBubble";
import { ObjectiveCard } from "@/components/playground/ObjectiveCard";
import type { Message } from "@/components/playground/useChat";
import type { OutputType, Creation } from "@/types";

// ── Output-type colour registry ──────────────────────────────────────────────
const OUTPUT_META: Record<string, { glowColor: string; glowRgb: string }> = {
  slides: { glowColor: "#ffb400", glowRgb: "255,180,0"   },
  audio:  { glowColor: "#00aaff", glowRgb: "0,170,255"   },
  image:  { glowColor: "#ff4488", glowRgb: "255,68,136"  },
  video:  { glowColor: "#ff7800", glowRgb: "255,120,0"   },
  text:   { glowColor: "#c8a0ff", glowRgb: "200,160,255" },
  json:   { glowColor: "#00ff64", glowRgb: "0,255,100"   },
};

// ── Left-panel hotspot zones — visible for calibration, will be made invisible after ──
// Positioned over the hexagonal node cluster on the left wall of the new room background
const SHELF_HOTSPOTS: {
  id: OutputType; label: string;
  glowColor: string; glowRgb: string;
  top: string; height: string; left: string; width: string;
}[] = [
  { id:"audio",  label:"AUDIO",  glowColor:"#00aaff", glowRgb:"0,170,255",   top:"48%",  height:"7%", left:"2%", width:"3%" },
  { id:"image",  label:"IMAGE",  glowColor:"#ff4488", glowRgb:"255,68,136",  top:"25%",  height:"6%", left:"11%",  width:"3%" },
  { id:"video",  label:"VIDEO",  glowColor:"#ff7800", glowRgb:"255,120,0",   top:"47%", height:"6%", left:"11%", width:"3%" },
  { id:"json",   label:"SCRIPT", glowColor:"#00ff64", glowRgb:"0,255,100",   top:"24%", height:"7%", left:"2%",  width:"3%" },
  { id:"text",   label:"TEXT",   glowColor:"#c8a0ff", glowRgb:"200,160,255", top:"16%", height:"7%", left:"6.4%", width:"4%" },
  { id:"slides", label:"SLIDE",  glowColor:"#ffb400", glowRgb:"255,180,0",   top:"57%", height:"7%", left:"6%",  width:"4%" },
];

// ── Bottom tray hotspot zones — visible for calibration, will be made invisible after ──
// Positioned over the 6 tool icons in the bottom tray of the new room background
const BOTTOM_TRAY_HOTSPOTS: {
  id: OutputType; label: string;
  glowColor: string; glowRgb: string;
  top: string; height: string; left: string; width: string;
}[] = [
  { id:"audio",  label:"Audio",  glowColor:"#00aaff", glowRgb:"0,170,255",   top:"77%", height:"15%", left:"37%", width:"8%" },
  { id:"text",   label:"Text",   glowColor:"#c8a0ff", glowRgb:"200,160,255", top:"77%", height:"15%", left:"47%", width:"8%" },
  { id:"image",  label:"Image",  glowColor:"#ff4488", glowRgb:"255,68,136",  top:"77%", height:"15%", left:"57%", width:"8%" },
  { id:"json",   label:"JSON",   glowColor:"#00ff64", glowRgb:"0,255,100",   top:"77%", height:"15%", left:"66%", width:"8%" },
  { id:"video",  label:"Video",  glowColor:"#ff7800", glowRgb:"255,120,0",   top:"77%", height:"15%", left:"75%", width:"9%" },
  { id:"slides", label:"Slides", glowColor:"#ffb400", glowRgb:"255,180,0",   top:"77%", height:"15%", left:"86%", width:"9%" },
];

// ── Center shelf rows — empty shelves in the right column of the bookcase ────
// Creations from the selected hotspot type are displayed here (2 per row × 6 rows = 12 slots)
const CENTER_SHELF_ROWS: { top: string; height: string }[] = [
  { top: "8%", height: "13%" },
  { top: "20%", height: "13%" },
  { top: "32%", height: "13%" },
  { top: "44%", height: "13%" },
  { top: "56%", height: "13%" },
  
];

// ── Floor objects (left → right across the floor) ────────────────────────────
// Note: spilled_paint is decorative only (rendered alongside brush_stand, not here)
// `vw` — viewport-relative width for the floor button (no px caps, fully responsive)
const FLOOR_OBJECTS: {
  key: string; id: OutputType; label: string; src: string;
  blend: "screen" | "normal"; glowColor: string; glowRgb: string;
  vw: string; // responsive width, e.g. "9vw"
}[] = [
  { key:"phones", id:"audio",  label:"Audio",  src:"/arena1/headphones.png",   blend:"screen", glowColor:"#00aaff", glowRgb:"0,170,255",   vw:"10vw"  },
  { key:"slide",  id:"slides", label:"Slides", src:"/arena1/slide.png",         blend:"normal", glowColor:"#ffb400", glowRgb:"255,180,0",   vw:"15vw" },
  { key:"text",   id:"text",   label:"Text",   src:"/arena1/book.png",          blend:"normal", glowColor:"#c8a0ff", glowRgb:"200,160,255", vw:"8vw" },
  { key:"camera", id:"image",  label:"Image",  src:"/arena1/camera.png",        blend:"screen", glowColor:"#ff4488", glowRgb:"255,68,136",  vw:"8vw" },
  { key:"clap",   id:"video",  label:"Video",  src:"/arena1/clapperboard.png",  blend:"screen", glowColor:"#ff7800", glowRgb:"255,120,0",   vw:"10vw" },
  { key:"js",     id:"json",   label:"JSON",   src:"/arena1/jscube.png",        blend:"screen", glowColor:"#00ff64", glowRgb:"0,255,100",   vw:"10vw" },
];

// ── Shelf thumbnail — rich visual preview for each output type ───────────────
function ShelfThumbnail({ c, glowColor, glowRgb }: { c: Creation; glowColor: string; glowRgb: string }) {
  if (c.output_type === "image" && (c.file_url || /^https?:/.test(c.content))) {
    return (
      <img src={c.file_url ?? c.content.trim()} alt={c.title}
        draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    );
  }

  if (c.output_type === "audio") {
    let narratorSnippet = "";
    let charCount = 0;
    try {
      const p = JSON.parse(c.content);
      narratorSnippet = (p?.script?.narrator_text ?? "").slice(0, 38);
      charCount = (p?.script?.dialogues ?? []).length;
    } catch {}
    return (
      <div style={{
        width: "100%", height: "100%", padding: "5px 5px 4px",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        background: `linear-gradient(160deg, rgba(${glowRgb},0.18) 0%, rgba(0,0,0,0.4) 100%)`,
      }}>
        <span style={{ fontSize: 9, lineHeight: 1 }}>🎙️</span>
        {/* Animated EQ bars */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 16, padding: "0 1px" }}>
          {[60, 90, 45, 100, 70, 55, 80, 40, 95, 65].map((h, i) => (
            <div key={i} style={{
              flex: 1, borderRadius: 2,
              background: glowColor,
              animation: `eq-bar ${0.5 + (i % 4) * 0.15}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.07}s`,
              height: `${h}%`,
              opacity: 0.8,
            }} />
          ))}
        </div>
        <p style={{
          fontSize: 6, margin: 0, lineHeight: 1.3, color: "rgba(255,255,255,0.7)",
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
        }}>
          {narratorSnippet || "Audio scene"}
        </p>
        {charCount > 0 && (
          <span style={{ fontSize: 5.5, color: glowColor, fontWeight: 700 }}>{charCount} voice{charCount !== 1 ? "s" : ""}</span>
        )}
      </div>
    );
  }

  if (c.output_type === "slides") {
    let title = "";
    let sections: string[] = [];
    try {
      const p = JSON.parse(c.content);
      title = p?.title ?? "";
      sections = (p?.sections ?? []).map((s: { title: string }) => s.title).slice(0, 4);
    } catch {}
    return (
      <div style={{
        width: "100%", height: "100%", padding: "5px 5px 4px",
        display: "flex", flexDirection: "column", gap: 3,
        background: `linear-gradient(160deg, rgba(${glowRgb},0.18) 0%, rgba(0,0,0,0.4) 100%)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 8 }}>📊</span>
          <span style={{ fontSize: 5.5, fontWeight: 800, color: glowColor, textTransform: "uppercase", letterSpacing: "0.04em" }}>Slides</span>
        </div>
        {title && (
          <p style={{ fontSize: 6.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", margin: 0, lineHeight: 1.2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {sections.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: glowColor, flexShrink: 0 }} />
              <span style={{ fontSize: 5.5, color: "rgba(255,255,255,0.6)", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>{s}</span>
            </div>
          ))}
        </div>
        <span style={{ fontSize: 5.5, color: glowColor, fontWeight: 700 }}>{sections.length || "?"} sections</span>
      </div>
    );
  }

  if (c.output_type === "json") {
    let preview = "";
    try {
      const parsed = JSON.parse(c.content);
      const keys = Object.keys(parsed).slice(0, 3);
      preview = keys.map(k => {
        const v = parsed[k];
        const val = typeof v === "string" ? `"${v.slice(0, 10)}"` : typeof v === "object" ? "{…}" : String(v);
        return `${k}: ${val}`;
      }).join("\n");
    } catch { preview = c.content.slice(0, 60); }
    return (
      <div style={{
        width: "100%", height: "100%", padding: "5px 5px 4px",
        display: "flex", flexDirection: "column", gap: 3,
        background: "linear-gradient(160deg, rgba(0,20,8,0.9) 0%, rgba(0,0,0,0.7) 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 8 }}>{ }</span>
          <span style={{ fontSize: 5.5, fontWeight: 800, color: glowColor, fontFamily: "monospace" }}>JSON</span>
        </div>
        <pre style={{
          fontSize: 5.5, margin: 0, lineHeight: 1.4,
          color: "rgba(0,255,100,0.85)", fontFamily: "monospace",
          overflow: "hidden", flex: 1,
          whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>{preview}</pre>
      </div>
    );
  }

  // text / video / fallback — show a text snippet
  const snippet = c.content.replace(/__attach:[^_]+__/g, "").trim().slice(0, 90);
  const isVideo = c.output_type === "video";
  return (
    <div style={{
      width: "100%", height: "100%", padding: "5px 5px 4px",
      display: "flex", flexDirection: "column", gap: 2,
      background: `linear-gradient(160deg, rgba(${glowRgb},0.15) 0%, rgba(0,0,0,0.5) 100%)`,
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 8 }}>{isVideo ? "🎬" : "📝"}</span>
        <span style={{ fontSize: 5.5, fontWeight: 800, color: glowColor, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {isVideo ? "Video" : "Text"}
        </span>
      </div>
      {/* Simulated text lines */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, overflow: "hidden" }}>
        {[90, 75, 85, 60, 70].map((w, i) => (
          <div key={i} style={{
            height: 3, borderRadius: 2,
            width: `${w}%`,
            background: i === 0 ? `rgba(${glowRgb},0.7)` : "rgba(255,255,255,0.2)",
          }} />
        ))}
      </div>
      <p style={{
        fontSize: 5.5, margin: 0, lineHeight: 1.3,
        color: "rgba(255,255,255,0.55)",
        overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical" as const,
      }}>
        {snippet}
      </p>
      {/* Bottom fade */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "25%",
        background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
        pointerEvents: "none",
      }} />
    </div>
  );
}

// Simple list used for the output-type dot row and mobile pill selectors
const OUTPUT_TYPES: { id: OutputType; label: string }[] = [
  { id: "image",  label: "Image"  },
  { id: "audio",  label: "Audio"  },
  { id: "slides", label: "Slides" },
  { id: "text",   label: "Text"   },
  { id: "video",  label: "Video"  },
  { id: "json",   label: "JSON"   },
];

// ── Context formatter ────────────────────────────────────────────────────────
function buildCreationContext(c: Creation): string {
  if (c.output_type === "image") {
    // Prefer the server URL (file_url); fall back to local data-URL while still uploading
    return `[Image titled "${c.title}": ${c.file_url ?? c.content.trim()}]\n\n`;
  }
  if (c.output_type === "audio") {
    // Uploaded audio file — pass the URL directly
    if (c.file_url && !c.content.startsWith("{")) {
      return `[Audio titled "${c.title}": ${c.file_url}]\n\n`;
    }
    try {
      const p = JSON.parse(c.content);
      const narrator  = p?.script?.narrator_text ?? "";
      const dialogues = (p?.script?.dialogues ?? [])
        .map((d: { character: string; text: string }) => `${d.character}: ${d.text}`)
        .join(" | ");
      return `[Audio titled "${c.title}": Narrator: ${narrator}. Dialogues: ${dialogues || "none"}]\n\n`;
    } catch { return ""; }
  }
  if (c.output_type === "slides") {
    try {
      const p = JSON.parse(c.content);
      const sections = (p?.sections ?? [])
        .map((s: { title: string; concepts?: string[] }) => `${s.title}: ${s.concepts?.join(", ")}`)
        .join(" | ");
      return `[Slides titled "${c.title}": ${sections}]\n\n`;
    } catch { return ""; }
  }
  // "text" output_type — could be a saved text creation OR an uploaded document (PDF/DOC)
  // If a server URL exists, it's an uploaded document → send the URL so the API can fetch it
  if (c.output_type === "text" && c.file_url) {
    return `[Document titled "${c.title}": ${c.file_url}]\n\n`;
  }
  if (c.output_type === "video" && c.file_url) {
    return `[Video titled "${c.title}": ${c.file_url}]\n\n`;
  }
  return `[${c.output_type} titled "${c.title}": ${c.content.slice(0, 300)}]\n\n`;
}

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  profile:          { display_name: string; avatar_emoji: string; age_group: string; interests: string[] };
  sessionId:        string | null;
  messages:         Message[];
  isStreaming:      boolean;
  onSend:           (text: string, outputType: OutputType) => void;
  onNewChat:        () => void;
  onSave?:          (content: string, type: OutputType) => void;
  arenaId?:         number;
  arenaAccent?:     string;
  arenaAccentGlow?: string;
  objectiveId?:     string | null;
}

export function CreationsRoom({
  profile, messages, isStreaming, onSend, onSave,
  arenaId = 1, arenaAccent = "#7C3AED", arenaAccentGlow = "rgba(124,58,237,0.35)",
  objectiveId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sessionId: _sessionId, onNewChat: _onNewChat,
}: Props) {
  const [selected,         setSelected]         = useState<OutputType>("text");
  const [selectedShelfType, setSelectedShelfType] = useState<OutputType | null>(null);
  const [input,            setInput]            = useState("");
  const [creations,        setCreations]        = useState<Creation[]>([]);
  const [injected,         setInjected]         = useState<Creation[]>([]);
  const [plusOpen,         setPlusOpen]         = useState(false);
  const [isDragOver,       setIsDragOver]       = useState(false);
  const [binDragOver,      setBinDragOver]      = useState(false);
  const [deletingId,       setDeletingId]       = useState<string | null>(null);
  const [pasteWarning,     setPasteWarning]     = useState<string | null>(null);
  // Track which injected item IDs are still uploading to the server
  const [uploadingIds,     setUploadingIds]     = useState<Set<string>>(new Set());

  const scrollRefDesktop = useRef<HTMLDivElement>(null);   // desktop message list
  const scrollRefMobile  = useRef<HTMLDivElement>(null);   // mobile message list
  const taRef     = useRef<HTMLTextAreaElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  const activeMeta = OUTPUT_META[selected] ?? OUTPUT_META.text;

  // Worksheet → Whiteboard handoff. WorksheetPopup dispatches this event when
  // the student clicks "Send to Whiteboard" on a generated prompt; we prefill
  // the composer and focus it so the student can edit or hit Send themselves.
  useEffect(() => {
    function onSendFromWorksheet(e: Event) {
      const detail = (e as CustomEvent<{ text?: string }>).detail;
      const text   = (detail?.text ?? "").trim();
      if (!text) return;
      setInput(text);
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        ta.style.height = Math.min(ta.scrollHeight, 80) + "px";
        ta.focus({ preventScroll: true });
        // Cursor at the end so the student can append/edit naturally.
        const len = ta.value.length;
        try { ta.setSelectionRange(len, len); } catch { /* some browsers throw on detached nodes */ }
      });
    }
    window.addEventListener("worksheet-send-to-whiteboard", onSendFromWorksheet as EventListener);
    return () => window.removeEventListener("worksheet-send-to-whiteboard", onSendFromWorksheet as EventListener);
  }, []);

  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB — matches server limit

  // Upload a File object to Supabase temp storage via /api/upload-temp.
  // Returns the public URL on success, or null if the upload fails (in which
  // case we fall back to the local data-URL already stored in `content`).
  const uploadFileToServer = async (file: File, itemId: string): Promise<string | null> => {
    setUploadingIds(prev => new Set(prev).add(itemId));
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch("/api/upload-temp", { method: "POST", body: form });
      if (!res.ok) { console.warn("[upload-temp] failed:", await res.text()); return null; }
      const { url } = await res.json() as { url: string };
      // Swap local data-URL → server URL on the injected chip
      setInjected(prev => prev.map(item =>
        item.id === itemId ? { ...item, file_url: url } : item,
      ));
      return url;
    } catch (err) {
      console.error("[upload-temp]", err);
      return null;
    } finally {
      setUploadingIds(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  };

  const refreshCreations = () => {
    fetch("/api/creations")
      .then(r => r.ok ? r.json() : { creations: [] })
      .then(data => setCreations(data.creations ?? []))
      .catch(() => {});
  };

  // Load once on mount — no polling.
  useEffect(() => {
    refreshCreations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrap onSave to refresh the shelf after a save completes.
  const handleSave = onSave
    ? (content: string, type: OutputType) => {
        onSave(content, type);
        // Refresh after 1.5s to give the DB write time to complete
        setTimeout(refreshCreations, 1500);
      }
    : undefined;

  // Scroll both message containers (desktop + mobile) to the bottom after every update.
  // renderMessageList() is called twice in the JSX, so we need two separate refs.
  // requestAnimationFrame ensures the DOM has painted before we measure scrollHeight.
  useEffect(() => {
    requestAnimationFrame(() => {
      [scrollRefDesktop, scrollRefMobile].forEach(ref => {
        if (ref.current) {
          ref.current.scrollTop = ref.current.scrollHeight;
        }
      });
    });
  }, [messages, isStreaming]);

  const send = () => {
    const t = input.trim();
    const hasAttachments = injected.length > 0;
    // Allow attachment-only sends — kid can drop a file in and hit Enter
    // without typing anything. Block only when truly empty.
    if ((!t && !hasAttachments) || isStreaming) return;
    // Build context from all injected items (image, doc, saved creations etc.)
    const ctx     = injected.map(buildCreationContext).join("");
    // Output type is ALWAYS what the user selected — injected items are context only
    const outType = selected;
    // If no text but attachments are present, synthesise a short auto-prompt
    // so the API + bubble both have something to render.
    const effectiveText = t || (hasAttachments
      ? (injected.length === 1
          ? `Here's my ${injected[0].output_type ?? "file"} — take a look.`
          : `Here are ${injected.length} files I want you to look at.`)
      : "");
    onSend(ctx + effectiveText, outType);
    setInput("");
    setInjected([]);
    setPlusOpen(false);
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.focus({ preventScroll: true });
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const canSend = (input.trim().length > 0 || injected.length > 0) && !isStreaming;

  const injectCreation = (c: Creation) => {
    setInjected(prev => {
      // Replace any existing item with the same id; otherwise append
      const exists = prev.some(p => p.id === c.id);
      return exists ? prev.map(p => p.id === c.id ? c : p) : [...prev, c];
    });
    // Do NOT override the output type selector — the user's chosen output type
    // is always the intent. The injected item is context/reference material only.
    setPlusOpen(false);
    taRef.current?.focus({ preventScroll: true });
  };

  const deleteCreation = async (id: string) => {
    setDeletingId(id);
    setCreations(prev => prev.filter(c => c.id !== id));
    try {
      await fetch("/api/creations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {}
    setDeletingId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    files.forEach(file => {
      if (file.size > MAX_UPLOAD_BYTES) {
        showPasteWarning(`⚠️ "${file.name}" is too large — max 5 MB.`);
        return;
      }
      const outType: OutputType = getOutputTypeForFile(file) ?? "text";
      const itemId = `local-upload-${file.name}-${Date.now()}`;
      const reader = new FileReader();
      reader.onload = ev => {
        const fake: Creation = {
          id: itemId,
          profile_id: "",
          title: file.name.replace(/\.[^.]+$/, ""),
          type: "chat", output_type: outType,
          // Store data-URL as fallback while server upload is in progress
          content: ev.target?.result as string,
          tags: [], is_favourite: false, created_at: "", updated_at: "",
        };
        injectCreation(fake);
        // Kick off background upload — updates file_url on the chip when done
        uploadFileToServer(file, itemId);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // ── Clipboard paste (Ctrl+V / Cmd+V) ─────────────────────────────────────
  const showPasteWarning = (msg: string) => {
    setPasteWarning(msg);
    setTimeout(() => setPasteWarning(null), 3000);
  };

  const getOutputTypeForFile = (file: File): OutputType | null => {
    const t = file.type.toLowerCase();
    if (t.startsWith("image/")) return "image";
    if (t.startsWith("audio/")) return "audio";
    if (t.startsWith("video/")) return "video";
    if (
      t === "application/pdf" ||
      t === "application/msword" ||
      t === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) return "text";
    if (
      t === "application/vnd.ms-powerpoint" ||
      t === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ) return "slides";
    // Also check by extension for cases where MIME is generic
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (["png","jpg","jpeg","gif","webp","svg","bmp","avif"].includes(ext)) return "image";
    if (["mp3","wav","ogg","aac","m4a","flac"].includes(ext)) return "audio";
    if (["mp4","mov","webm","avi","mkv","m4v"].includes(ext)) return "video";
    if (["pdf","doc","docx"].includes(ext)) return "text";
    if (["ppt","pptx"].includes(ext)) return "slides";
    return null;
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Scan items (not files) — covers screenshots, browser-copied images,
    // and filesystem files. clipboardData.files is empty for screenshots/webpage images.
    const items = Array.from(e.clipboardData.items);
    const fileItem = items.find(item => item.kind === "file");

    if (!fileItem) return; // no file in clipboard — let default text paste proceed

    e.preventDefault();

    const file = fileItem.getAsFile();
    if (!file) return;

    const outType = getOutputTypeForFile(file);

    if (!outType) {
      const label = file.name || file.type || "this file";
      showPasteWarning(`⚠️ "${label}" can't be added — only images, audio, documents and slides are supported.`);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      showPasteWarning(`⚠️ File is too large — max 5 MB.`);
      return;
    }

    // For screenshots / browser-copied images the File has no name — generate one
    const rawName = file.name && file.name !== "image.png" ? file.name : null;
    const title   = rawName
      ? rawName.replace(/\.[^.]+$/, "")
      : outType === "image"
        ? `Screenshot ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : `Pasted ${outType} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const itemId = `local-paste-${Date.now()}`;
    const reader = new FileReader();
    reader.onload = ev => {
      const fake: Creation = {
        id:         itemId,
        profile_id: "",
        title,
        type:        "chat",
        output_type: outType,
        // Store data-URL as fallback while server upload is in progress
        content:     ev.target?.result as string,
        tags: [], is_favourite: false, created_at: "", updated_at: "",
      };
      injectCreation(fake);
      // Kick off background upload — updates file_url on the chip when done
      uploadFileToServer(file, itemId);
    };
    reader.readAsDataURL(file);
  };

  // ── Message list ─────────────────────────────────────────────────────────
  const renderMessageList = (ref: React.RefObject<HTMLDivElement | null>) => (
    <div ref={ref} className="select-text" style={{
      flex: 1, overflowY: "auto", padding: "12px 14px 8px",
      display: "flex", flexDirection: "column", gap: 8,
      scrollbarWidth: "none", minHeight: 0,
    }}>
      {messages.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, opacity: 0.5, pointerEvents: "none" }}>
          <span style={{ fontSize: 28 }}>✏️</span>
          <p style={{ fontSize: 11, color: arenaAccent, fontWeight: 600, textAlign: "center", margin: 0, lineHeight: 1.6 }}>
            Click a shelf type or floor object,<br/>then write below
          </p>
        </div>
      )}
      {messages.map(msg => (
        <MessageBubble
          key={msg.id} message={msg} avatarEmoji={profile.avatar_emoji}
          isStreaming={isStreaming && msg === messages[messages.length - 1]}
          arenaAccent={arenaAccent} arenaAccentGlow={arenaAccentGlow} arenaId={arenaId}
          onSave={handleSave}
        />
      ))}
      {isStreaming && (
        <div style={{ display: "flex", gap: 4, padding: "2px 0 2px 28px" }}>
          {[0,1,2].map(i => (
            <span key={i} className="dot" style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: arenaAccent, opacity: 0.7, animationDelay: `${i*0.15}s` }}/>
          ))}
        </div>
      )}
    </div>
  );

  // ── Input row ─────────────────────────────────────────────────────────────
  const renderInputRow = (mobile = false) => (
    <div style={{ flexShrink: 0 }}>
      {injected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6, padding: "0 4px" }}>
          {injected.map((item, i) => {
            const isUploading = uploadingIds.has(item.id);
            return (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "3px 8px 3px 7px", borderRadius: 20,
                background: isUploading
                  ? "rgba(255,255,255,0.07)"
                  : `rgba(${OUTPUT_META[item.output_type]?.glowRgb ?? "200,160,255"},0.2)`,
                border: `1px solid ${isUploading ? "rgba(255,255,255,0.2)" : `rgba(${OUTPUT_META[item.output_type]?.glowRgb ?? "200,160,255"},0.5)`}`,
                fontSize: 10, fontWeight: 600,
                color: isUploading ? "rgba(255,255,255,0.4)" : (OUTPUT_META[item.output_type]?.glowColor ?? "#c8a0ff"),
                maxWidth: 180,
                transition: "all 0.3s ease",
              }}>
                <span style={{ fontSize: 9, opacity: 0.7 }}>
                  {isUploading ? "⏳" : item.output_type === "image" ? "🖼️" : item.output_type === "audio" ? "🎵" : item.output_type === "slides" ? "📊" : "📄"}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isUploading ? `Uploading ${item.title}…` : item.title}
                </span>
              </div>
              <button onClick={() => setInjected(prev => prev.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 14, lineHeight: 1, padding: "0 1px" }}>
                ×
              </button>
            </div>
            );
          })}
        </div>
      )}

      <div style={{ position: "relative" }}>
        {plusOpen && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0,
            // Steel-and-cyan METALLIC — same panel signature as the AIDA chat.
            // Independent of arenaAccent so it always reads as the "white-blue"
            // chrome theme regardless of which arena the kid is in.
            background:
              "radial-gradient(ellipse 90% 55% at 25% 0%, rgba(0,212,255,0.22) 0%, rgba(8,12,28,0) 60%), " +
              "radial-gradient(ellipse 70% 50% at 100% 100%, rgba(125,211,252,0.08) 0%, rgba(8,12,28,0) 60%), " +
              "linear-gradient(180deg, " +
                "rgba(58,98,158,0.55) 0%, " +
                "rgba(20,38,72,0.95) 6%, " +
                "rgba(10,18,38,0.97) 50%, " +
                "rgba(18,32,62,0.96) 94%, " +
                "rgba(58,98,158,0.45) 100%" +
              ")",
            border:        "1px solid rgba(0,212,255,0.55)",
            borderRadius:  16,
            padding:       14,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.22), " +
              "inset 0 -1px 0 rgba(255,255,255,0.06), " +
              "0 0 24px rgba(0,212,255,0.45), " +
              "0 0 72px rgba(0,212,255,0.22), " +
              "0 18px 60px rgba(0,0,0,0.7)",
            backdropFilter: "blur(22px)",
            zIndex:        50,
            display:       "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 4, height: 4, borderRadius: 4,
                background: "#00D4FF",
                boxShadow: "0 0 8px #00D4FF",
              }}/>
              <span style={{
                fontSize:        10,
                fontWeight:      700,
                color:           "rgba(255,255,255,0.55)",
                textTransform:   "uppercase",
                letterSpacing:   "0.22em",
                fontFamily:      "'JetBrains Mono', monospace",
              }}>
                Upload Files
              </span>
              <button onClick={() => setPlusOpen(false)}
                style={{
                  marginLeft: "auto",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  width: 22, height: 22,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "rgba(255,255,255,0.5)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "white"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
              >
                <XIcon size={12} />
              </button>
            </div>

            {/* Screenshots — multiple */}
            <input ref={fileRef} type="file" multiple
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              style={{ display: "none" }} onChange={handleFileUpload}/>
            <button onClick={() => fileRef.current?.click()}
              style={{
                width: "100%", padding: "11px 12px", borderRadius: 10, cursor: "pointer",
                border:     "1px solid rgba(0,212,255,0.28)",
                background:
                  "linear-gradient(180deg, " +
                    "rgba(58,98,158,0.32) 0%, " +
                    "rgba(20,38,72,0.55) 50%, " +
                    "rgba(14,28,56,0.55) 100%" +
                  ")",
                color:      "rgba(232,244,255,0.92)",
                fontSize:   12, fontWeight: 600, transition: "all 0.2s",
                display:    "flex", flexDirection: "row", alignItems: "center", gap: 10,
                textAlign:  "left",
                boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 0 rgba(0,212,255,0)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(180deg, rgba(58,98,158,0.55) 0%, rgba(20,38,72,0.7) 50%, rgba(14,28,56,0.7) 100%)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,212,255,0.85)";
                (e.currentTarget as HTMLElement).style.boxShadow   = "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 22px rgba(0,212,255,0.45)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(180deg, rgba(58,98,158,0.32) 0%, rgba(20,38,72,0.55) 50%, rgba(14,28,56,0.55) 100%)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,212,255,0.28)";
                (e.currentTarget as HTMLElement).style.boxShadow   = "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 0 rgba(0,212,255,0)";
              }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(180deg, #7DD3FC 0%, #00D4FF 50%, #0284C7 100%)",
                border: "1px solid rgba(255,255,255,0.25)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 0 10px rgba(0,212,255,0.55)",
              }}>
                <ImageIcon size={16} style={{ color: "#031024" }} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: "var(--font-syne), system-ui, sans-serif", fontWeight: 800, fontSize: 12, color: "white", letterSpacing: "-0.01em" }}>
                  Upload screenshots
                </span>
                <span style={{ fontSize: 9, color: "rgba(125,211,252,0.7)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>
                  PNG · JPG · WEBP — multiple
                </span>
              </span>
            </button>

            {/* Audio file — MP4/MP3/M4A from Suno.ai, ElevenLabs, etc. */}
            <input type="file"
              accept="audio/*,.mp3,.mp4,.m4a,.wav,.ogg,.aac,.flac"
              style={{ display: "none" }}
              id="audio-upload-input"
              onChange={handleFileUpload}/>

            {/* Video file — non-MP4 video formats */}
            <input type="file"
              accept="video/mov,video/webm,video/avi,video/x-matroska,.mov,.webm,.avi,.mkv,.m4v"
              style={{ display: "none" }}
              id="video-upload-input"
              onChange={handleFileUpload}/>

            {/* Audio upload button */}
            <button onClick={() => (document.getElementById("audio-upload-input") as HTMLInputElement)?.click()}
              style={{
                width: "100%", padding: "11px 12px", borderRadius: 10, cursor: "pointer",
                border:     "1px solid rgba(0,170,255,0.28)",
                background:
                  "linear-gradient(180deg, " +
                    "rgba(0,60,100,0.32) 0%, " +
                    "rgba(0,30,60,0.55) 50%, " +
                    "rgba(0,20,45,0.55) 100%" +
                  ")",
                color:      "rgba(180,230,255,0.92)",
                fontSize:   12, fontWeight: 600, transition: "all 0.2s",
                display:    "flex", flexDirection: "row", alignItems: "center", gap: 10,
                textAlign:  "left",
                boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 0 rgba(0,170,255,0)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(180deg, rgba(0,60,100,0.55) 0%, rgba(0,30,60,0.7) 50%, rgba(0,20,45,0.7) 100%)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,170,255,0.85)";
                (e.currentTarget as HTMLElement).style.boxShadow   = "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 22px rgba(0,170,255,0.45)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(180deg, rgba(0,60,100,0.32) 0%, rgba(0,30,60,0.55) 50%, rgba(0,20,45,0.55) 100%)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,170,255,0.28)";
                (e.currentTarget as HTMLElement).style.boxShadow   = "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 0 rgba(0,170,255,0)";
              }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(180deg, #7DD3FC 0%, #00AAFF 50%, #0070CC 100%)",
                border: "1px solid rgba(255,255,255,0.25)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 0 10px rgba(0,170,255,0.55)",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18V5l12-2v13" stroke="#00162e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="6" cy="18" r="3" stroke="#00162e" strokeWidth="1.8"/>
                  <circle cx="18" cy="16" r="3" stroke="#00162e" strokeWidth="1.8"/>
                </svg>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: "var(--font-syne), system-ui, sans-serif", fontWeight: 800, fontSize: 12, color: "white", letterSpacing: "-0.01em" }}>
                  Upload audio
                </span>
                <span style={{ fontSize: 9, color: "rgba(125,211,252,0.7)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>
                  MP4 · MP3 · M4A · WAV · OGG
                </span>
              </span>
            </button>

            {/* Video upload button */}
            <button onClick={() => (document.getElementById("video-upload-input") as HTMLInputElement)?.click()}
              style={{
                width: "100%", padding: "11px 12px", borderRadius: 10, cursor: "pointer",
                border:     "1px solid rgba(255,120,0,0.28)",
                background:
                  "linear-gradient(180deg, " +
                    "rgba(120,60,20,0.32) 0%, " +
                    "rgba(60,28,10,0.55) 50%, " +
                    "rgba(40,18,8,0.55) 100%" +
                  ")",
                color:      "rgba(255,220,180,0.92)",
                fontSize:   12, fontWeight: 600, transition: "all 0.2s",
                display:    "flex", flexDirection: "row", alignItems: "center", gap: 10,
                textAlign:  "left",
                boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 0 rgba(255,120,0,0)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(180deg, rgba(120,60,20,0.55) 0%, rgba(60,28,10,0.7) 50%, rgba(40,18,8,0.7) 100%)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,120,0,0.85)";
                (e.currentTarget as HTMLElement).style.boxShadow   = "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 22px rgba(255,120,0,0.45)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(180deg, rgba(120,60,20,0.32) 0%, rgba(60,28,10,0.55) 50%, rgba(40,18,8,0.55) 100%)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,120,0,0.28)";
                (e.currentTarget as HTMLElement).style.boxShadow   = "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 0 rgba(255,120,0,0)";
              }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(180deg, #FCA47D 0%, #FF7800 50%, #C24E00 100%)",
                border: "1px solid rgba(255,255,255,0.25)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 0 10px rgba(255,120,0,0.55)",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="5" width="14" height="14" rx="2" stroke="#1a0800" strokeWidth="1.8"/>
                  <path d="M16 9l6-3v12l-6-3V9z" fill="#1a0800"/>
                </svg>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: "var(--font-syne), system-ui, sans-serif", fontWeight: 800, fontSize: 12, color: "white", letterSpacing: "-0.01em" }}>
                  Upload video
                </span>
                <span style={{ fontSize: 9, color: "rgba(252,164,125,0.7)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>
                  MOV · WEBM · AVI · MKV
                </span>
              </span>
            </button>

            {/* Worksheet document */}
            <input type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: "none" }}
              id="doc-upload-input"
              onChange={handleFileUpload}/>
            <button onClick={() => (document.getElementById("doc-upload-input") as HTMLInputElement)?.click()}
              style={{
                width: "100%", padding: "11px 12px", borderRadius: 10, cursor: "pointer",
                border:     "1px solid rgba(0,212,255,0.28)",
                background:
                  "linear-gradient(180deg, " +
                    "rgba(58,98,158,0.32) 0%, " +
                    "rgba(20,38,72,0.55) 50%, " +
                    "rgba(14,28,56,0.55) 100%" +
                  ")",
                color:      "rgba(232,244,255,0.92)",
                fontSize:   12, fontWeight: 600, transition: "all 0.2s",
                display:    "flex", flexDirection: "row", alignItems: "center", gap: 10,
                textAlign:  "left",
                boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 0 rgba(0,212,255,0)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(180deg, rgba(58,98,158,0.55) 0%, rgba(20,38,72,0.7) 50%, rgba(14,28,56,0.7) 100%)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,212,255,0.85)";
                (e.currentTarget as HTMLElement).style.boxShadow   = "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 22px rgba(0,212,255,0.45)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(180deg, rgba(58,98,158,0.32) 0%, rgba(20,38,72,0.55) 50%, rgba(14,28,56,0.55) 100%)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,212,255,0.28)";
                (e.currentTarget as HTMLElement).style.boxShadow   = "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 0 rgba(0,212,255,0)";
              }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(180deg, #7DD3FC 0%, #00D4FF 50%, #0284C7 100%)",
                border: "1px solid rgba(255,255,255,0.25)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 0 10px rgba(0,212,255,0.55)",
              }}>
                <FileText size={16} style={{ color: "#031024" }} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: "var(--font-syne), system-ui, sans-serif", fontWeight: 800, fontSize: 12, color: "white", letterSpacing: "-0.01em" }}>
                  Upload worksheet
                </span>
                <span style={{ fontSize: 9, color: "rgba(125,211,252,0.7)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>
                  PDF · DOC · DOCX
                </span>
              </span>
            </button>
          </div>
        )}

        {/* Input bar */}
        <div
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setIsDragOver(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
          onDrop={e => {
            e.preventDefault();
            setIsDragOver(false);
            try {
              const c = JSON.parse(e.dataTransfer.getData("application/creation")) as Creation;
              if (c?.id) injectCreation(c);
            } catch {}
          }}
          style={{
          display: "flex", alignItems: "center", gap: 6,
          background: isDragOver ? `rgba(${activeMeta.glowRgb},0.12)` : "rgba(10,5,50,0.65)",
          border: `2px solid ${isDragOver ? activeMeta.glowColor : `rgba(${activeMeta.glowRgb},0.8)`}`,
          borderRadius: 40,
          padding: mobile ? "6px 8px 6px 10px" : "7px 8px 7px 12px",
          boxShadow: isDragOver
            ? `0 0 32px rgba(${activeMeta.glowRgb},0.7), inset 0 0 16px rgba(${activeMeta.glowRgb},0.1)`
            : `0 0 24px rgba(${activeMeta.glowRgb},0.45)`,
          backdropFilter: "blur(16px)",
          transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
          position: "relative",
        }}>
          {isDragOver && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: 40,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none", zIndex: 2,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: activeMeta.glowColor, letterSpacing: "0.04em" }}>
                Drop to add to prompt ✦
              </span>
            </div>
          )}
          <button onClick={() => setPlusOpen(v => !v)} title="Add context or upload"
            style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              background: plusOpen ? `${arenaAccent}40` : "rgba(255,255,255,0.08)",
              border: `1.5px solid ${plusOpen ? arenaAccent : "rgba(255,255,255,0.15)"}`,
              color: plusOpen ? arenaAccent : "rgba(255,255,255,0.5)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, lineHeight: 1, transition: "all 0.2s",
            }}>
            {plusOpen ? "×" : "+"}
          </button>

          <textarea ref={taRef} value={input}
            onChange={e => {
              setInput(e.target.value);
              const t = e.target;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 80) + "px";
            }}
            onKeyDown={onKey}
            onPaste={handlePaste}
            placeholder="What do you want to create today?"
            rows={1}
            style={{
              flex: 1, resize: "none", border: "none", outline: "none",
              background: "transparent", fontSize: mobile ? 14 : 13, fontWeight: 500,
              color: "rgba(255,255,255,0.92)", fontFamily: "inherit",
              lineHeight: 1.5, overflowY: "hidden",
              caretColor: activeMeta.glowColor, userSelect: "text",
            }}
          />

          <button onClick={send} disabled={!canSend}
            style={{
              width: mobile ? 38 : 36, height: mobile ? 38 : 36,
              borderRadius: "50%", flexShrink: 0,
              background: canSend ? `rgba(${activeMeta.glowRgb},0.9)` : "rgba(255,255,255,0.1)",
              border: "none", cursor: canSend ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
              boxShadow: canSend ? `0 0 18px rgba(${activeMeta.glowRgb},0.7)` : "none",
            }}>
            <svg width="13" height="13" viewBox="0 0 18 18" fill="none">
              <path d="M2 9h14M9 2l7 7-7 7"
                stroke={canSend ? "#fff" : "rgba(255,255,255,0.25)"}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#080814" }}>
      <style>{`
        @keyframes eq-bar {
          0%   { transform: scaleY(0.3); opacity: 0.5; }
          100% { transform: scaleY(1);   opacity: 1;   }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0);   }
        }
      `}</style>

      {/* Background room */}
      <img src="/arena1/empty_room.png" alt="" aria-hidden draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }}
      />

      {/* ── Left panel hotspot zones (desktop only) ── */}
      <div className="hidden lg:block" style={{ position: "absolute", inset: 0, zIndex: 12, pointerEvents: "none" }}>
        {SHELF_HOTSPOTS.map(hz => (
          <button
            key={hz.id}
            onClick={() => setSelectedShelfType(prev => prev === hz.id ? null : hz.id)}
            title={`Browse ${hz.label}`}
            style={{
              position: "absolute",
              top: hz.top, left: hz.left, width: hz.width, height: hz.height,
              background: "transparent",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              pointerEvents: "auto",
            }}
          />
        ))}
      </div>

      {/* ── Bottom tray hotspot zones — traffic light indicator ── */}
      <div className="hidden lg:block" style={{ position: "absolute", inset: 0, zIndex: 12, pointerEvents: "none" }}>
        {BOTTOM_TRAY_HOTSPOTS.map(hz => {
          const isActive = selected === hz.id;
          return (
            <button
              key={`tray-${hz.id}`}
              onClick={() => setSelected(hz.id)}
              title={hz.label}
              style={{
                position: "absolute",
                top: hz.top, left: hz.left, width: hz.width, height: hz.height,
                background: "transparent",
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
                pointerEvents: "auto",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: "0%",
              }}
            >
              {/* Traffic light dot */}
              <span style={{
                display: "block",
                width: 10, height: 10,
                borderRadius: "50%",
                background: isActive ? "#22c55e" : "#ef4444",
                boxShadow: isActive
                  ? "0 0 6px rgba(34,197,94,0.9), 0 0 14px rgba(34,197,94,0.5)"
                  : "0 0 4px rgba(239,68,68,0.7), 0 0 10px rgba(239,68,68,0.3)",
                transition: "background 0.2s, box-shadow 0.2s",
              }} />
            </button>
          );
        })}
      </div>

      {/* ── Center shelf creations (desktop only) ────────────────────────── */}
      {/*   Shows 2 creations per shelf row for the selected hotspot type.   */}
      {/*   Positioned on the empty-shelf column of the bookcase (~22-37%).  */}
      {selectedShelfType && (() => {
        const meta = OUTPUT_META[selectedShelfType];
        const filtered = creations.filter(c => c.output_type === selectedShelfType);
        return (
          <div
            className="hidden lg:block"
            style={{ position: "absolute", left: "16.5%", top: "9%", width: "17%", height: "72%", zIndex: 13 }}
          >
            {CENTER_SHELF_ROWS.map((row, rowIdx) => {
              const pair = filtered.slice(rowIdx * 2, rowIdx * 2 + 2);
              return (
                <div key={rowIdx} style={{
                  position: "absolute",
                  top: row.top, height: row.height, left: "5%", right: "5%",
                  display: "flex", alignItems: "center", gap: "6%",
                }}>
                  {[0, 1].map(slot => {
                    const c = pair[slot];
                    if (!c) {
                      // Empty slot — subtle placeholder
                      return (
                        <div key={slot} style={{
                          flex: 1, height: "75%",
                          borderRadius: 6,
                          border: `1px dashed rgba(${meta.glowRgb},0.18)`,
                        }} />
                      );
                    }
                    return (
                      <button
                        key={c.id}
                        draggable
                        onClick={() => injectCreation(c)}
                        onDragStart={e => {
                          e.dataTransfer.setData("application/creation", JSON.stringify(c));
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        title={`Use "${c.title}" — click or drag to prompt`}
                        style={{
                          flex: 1, height: "75%",
                          background: "none", border: "none", padding: 0, cursor: "grab",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                          transition: "transform 0.2s ease",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1) translateY(-4px)")}
                        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                      >
                        {/* Thumbnail card */}
                        <div style={{
                          width: "100%", flex: 1,
                          borderRadius: 6, overflow: "hidden",
                          background: `rgba(${meta.glowRgb},0.15)`,
                          border: `1.5px solid rgba(${meta.glowRgb},0.5)`,
                          boxShadow: `0 0 10px rgba(${meta.glowRgb},0.3)`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          position: "relative",
                        }}>
                          <ShelfThumbnail c={c} glowColor={meta.glowColor} glowRgb={meta.glowRgb} />
                          {/* Drag hint overlay */}
                          <div style={{
                            position: "absolute", inset: 0,
                            background: `rgba(${meta.glowRgb},0.0)`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            opacity: 0, transition: "opacity 0.2s",
                          }}
                            className="drag-hint"
                          />
                        </div>
                        {/* Title */}
                        <p style={{
                          fontSize: 7, fontWeight: 700, margin: 0,
                          color: meta.glowColor, maxWidth: "100%",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          textShadow: `0 0 8px rgba(${meta.glowRgb},0.8)`,
                        }}>
                          {c.title.slice(0, 10)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}


      {/* ── Trash bin — drop a shelf card here to delete the creation ────── */}
      <div
        className="hidden lg:flex"
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setBinDragOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setBinDragOver(false); }}
        onDrop={async e => {
          e.preventDefault();
          setBinDragOver(false);
          try {
            const c = JSON.parse(e.dataTransfer.getData("application/creation")) as Creation;
            if (c?.id && c.id !== "local-upload") await deleteCreation(c.id);
          } catch {}
        }}
        // SIZE knob: `width` below (doubled from 14vw). Use vw for fluid sizing.
        // POSITION knobs: `bottom` (% from bottom), `left` (% from left edge of the room).
        style={{
          position: "absolute",
          bottom: "7%",            // ← vertical position (% from bottom of the room)
          left:   "2%",           // ← horizontal position (% from left of the room)
          width:  "28vw",          // ← SIZE: doubled from 14vw
          zIndex: 15,
          alignItems: "flex-end", justifyContent: "center",
          cursor: "copy",
          transition: "transform 0.2s ease",
          transform: binDragOver ? "scale(1.18) translateY(-6px)" : "scale(1)",
        }}
      >
        <img
          src="/arena1/bin.png"
          alt="Delete"
          draggable={false}
          style={{
            width: "100%", height: "auto", objectFit: "contain",
            filter: binDragOver
              ? "brightness(1.6) drop-shadow(0 0 14px rgba(255,80,80,0.9)) drop-shadow(0 0 32px rgba(255,80,80,0.5))"
              : "brightness(0.75) saturate(0.7)",
            transition: "filter 0.2s ease",
          }}
        />
        {binDragOver && (
          <div style={{
            position: "absolute", bottom: "50%", left: "50%", transform: "translateX(-50%)",
            background: "rgba(8,4,22,0.92)", border: "1px solid rgba(255,80,80,0.5)",
            borderRadius: 10, padding: "4px 10px", whiteSpace: "nowrap",
            fontSize: 10, fontWeight: 700, color: "rgba(255,120,120,1)",
            boxShadow: "0 0 16px rgba(255,80,80,0.4)", backdropFilter: "blur(8px)",
            pointerEvents: "none",
          }}>
            Drop to delete
          </div>
        )}
        {deletingId && (
          <div style={{
            position: "absolute", bottom: "110%", left: "50%", transform: "translateX(-50%)",
            background: "rgba(8,4,22,0.92)", border: "1px solid rgba(255,80,80,0.3)",
            borderRadius: 10, padding: "4px 10px", whiteSpace: "nowrap",
            fontSize: 10, fontWeight: 700, color: "rgba(255,120,120,0.7)",
            pointerEvents: "none",
          }}>
            Deleting…
          </div>
        )}
      </div>

      {/* ── Desktop chat panel — overlaid on the large blue screen ───────── */}
      <div className="hidden lg:flex flex-col"
        style={{
          position: "absolute",
          left: "37%", top: "9%", right: "5%", bottom: "27%",
          zIndex: 20,
          background: "transparent",
        }}
      >
        {objectiveId && (
          <div style={{ padding: "8px 12px 0", flexShrink: 0 }}>
            <ObjectiveCard objectiveId={objectiveId} arenaAccent={arenaAccent} arenaAccentGlow={arenaAccentGlow} />
          </div>
        )}
        {renderMessageList(scrollRefDesktop)}
        <div style={{ padding: "8px 12px 12px", flexShrink: 0 }}>
          {/* Output-type dot row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 6 }}>
            {OUTPUT_TYPES.map(t => (
              <button key={t.id} onClick={() => setSelected(t.id)} title={t.label}
                style={{
                  width: 8, height: 8, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer",
                  background: selected === t.id ? (OUTPUT_META[t.id]?.glowColor ?? "#fff") : "rgba(0,0,0,0.2)",
                  transition: "all 0.2s",
                  boxShadow: selected === t.id ? `0 0 6px ${OUTPUT_META[t.id]?.glowColor}` : "none",
                }}
              />
            ))}
          </div>
          {renderInputRow()}
        </div>
      </div>

      {/* ── Mobile + tablet overlay ──────────────────────────────────────── */}
      <div className="lg:hidden absolute inset-0 z-30 flex flex-col"
        style={{ background: "rgba(8,8,20,0.97)", padding: "16px 14px 14px", gap: 10 }}>
        <div style={{ height: 2, flexShrink: 0, borderRadius: 2, marginBottom: 2, background: `linear-gradient(90deg, transparent, ${arenaAccent}80, ${arenaAccent}, ${arenaAccent}80, transparent)` }}/>
        {objectiveId && (
          <ObjectiveCard objectiveId={objectiveId} arenaAccent={arenaAccent} arenaAccentGlow={arenaAccentGlow} />
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
          {OUTPUT_TYPES.map(t => (
            <button key={t.id} onClick={() => setSelected(t.id)}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                border: `1.5px solid ${selected === t.id ? (OUTPUT_META[t.id]?.glowColor ?? "#fff") : "rgba(255,255,255,0.15)"}`,
                background: selected === t.id ? `rgba(${OUTPUT_META[t.id]?.glowRgb ?? "200,160,255"},0.25)` : "transparent",
                color: selected === t.id ? (OUTPUT_META[t.id]?.glowColor ?? "#fff") : "rgba(255,255,255,0.4)",
                textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s",
              }}>
              {t.label}
            </button>
          ))}
        </div>
        {renderMessageList(scrollRefMobile)}
        {renderInputRow(true)}
      </div>

      {/* ── Paste warning toast ──────────────────────────────────────────────── */}
      {pasteWarning && (
        <div style={{
          position: "absolute", bottom: 90, left: "50%", transform: "translateX(-50%)",
          background: "rgba(20,10,40,0.97)", border: "1px solid rgba(255,80,80,0.4)",
          borderRadius: 12, padding: "10px 18px",
          color: "rgba(255,180,180,0.95)", fontSize: 12, fontWeight: 600,
          boxShadow: "0 4px 24px rgba(255,50,50,0.2)",
          backdropFilter: "blur(16px)", zIndex: 200,
          whiteSpace: "nowrap", pointerEvents: "none",
          animation: "fadeInUp 0.2s ease",
        }}>
          {pasteWarning}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FlashcardDeck, parseFlashcards } from "./FlashcardDeck";
import type { FlashCard } from "./FlashcardDeck";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Play, X, FileText } from "lucide-react";
import { MessageBubble } from "@/components/playground/MessageBubble";
import type { Message }  from "@/components/playground/useChat";
import ReactMarkdown from "react-markdown";
import type { Chapter, Profile, OutputType } from "@/types";

interface Props {
  chapter: Chapter;
  onBack:  () => void;
}

interface SavedItem  { id: string; title: string; preview: string; content: string; createdAt: number; tags: string[]; }
interface VideoItem  {
  title:     string;
  embedUrl:  string;   // iframe src (Google Drive preview URL)
  thumbUrl:  string;   // thumbnail image src
}

function driveEmbed(fileId: string)  { return `https://drive.google.com/file/d/${fileId}/preview`; }
function driveThumb(fileId: string)  { return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`; }

const MATHS_VIDEO_ID = "1tTJkw13HqGbkTUoxypgtBGlAXkdoiE1Y";

// Map subject → available explainer videos
function getVideos(subject: string): VideoItem[] {
  if (subject === "Mathematics") {
    return [{
      title:    "Mathematics Explainer",
      embedUrl: driveEmbed(MATHS_VIDEO_ID),
      thumbUrl: driveThumb(MATHS_VIDEO_ID),
    }];
  }
  return [{
    title:    "Physics Explainer",
    embedUrl: "/explainer_videos/physics/physics.mp4",
    thumbUrl: "",
  }];
}

// Left toolbar tile positions — evenly fills the clean sidebar panel
const TILES = [
  { key:"notes",       label:"Notes",            top:"2%",  width:"13%" },
  { key:"flashcards",  label:"Flashcards",        top:"13%", width:"13%" },
  { key:"mindmap",     label:"Mind Map",          top:"24%", width:"13%" },
  { key:"comic",       label:"Comic Creations",   top:"35%", width:"13%" },
  { key:"explainer",   label:"Explainer Videos",  top:"46%", width:"13%" },
  { key:"audio",       label:"Audio Overview",    top:"57%", width:"13%" },
  { key:"podcast",     label:"Audio Podcast",     top:"68%", width:"13%" },
  { key:"infographic", label:"Infographic",       top:"79%", width:"13%" },
];

// PNG overlay for each tile — placed on top of the baked-in background tiles
const TILE_PNGS: Record<string, string> = {
  notes:       "/classroom/Tiles/notes.png",
  flashcards:  "/classroom/Tiles/flashcards.png",
  mindmap:     "/classroom/Tiles/mindmap.png",
  comic:       "/classroom/Tiles/comic creations.png",
  explainer:   "/classroom/Tiles/explainer videos.png",
  audio:       "/classroom/Tiles/audio overview.png",
  podcast:     "/classroom/Tiles/audio podcast .png",
  infographic: "/classroom/Tiles/infographic.png",
};

const TILE_PROMPTS: Record<string, (t: string) => string> = {
  notes:       (t) => `Generate comprehensive study notes for "${t}" — CBSE Class 10 Science. Use clear headings, bullet points, key definitions, important equations, and a quick-revision summary. For equations, use plain text format only — no LaTeX. Write fractions as a/b or a ÷ b, use characters like θ, π, °, ±.`,
  flashcards:  (t) => `Generate 10 flashcards for "${t}" — CBSE Class 10 Science. Format EXACTLY as:\n\n**Q:** [question]\n**A:** [concise answer — key facts, definitions, equations]\n**IMG:** [image description tailored to the concept — adapt style: use diagram-style for molecules/structures/circuits, realistic-style for organisms/phenomena, illustrated-style for processes/reactions]\n\nRepeat for all 10 cards. Plain text only — no LaTeX.`,
  mindmap:     (t) => `Create a detailed text-based mind map for "${t}" — CBSE Class 10 Science. Use indented bullet points to show the hierarchy: main topic → subtopics → key facts/equations. Keep it visual and easy to follow.`,
  comic:       (t) => `Write a short comic strip script (5–6 panels) that teaches the key concepts of "${t}" — CBSE Class 10 Science. Each panel: [Scene description] + [Character dialogue]. Make it fun, accurate, and student-friendly.`,
  audio:       (t) => `Write a 2-minute audio overview script for "${t}" — CBSE Class 10 Science. Use a friendly, conversational tone. Cover the most important concepts, one key equation, and end with a memorable takeaway.`,
  podcast:     (t) => `Write a short podcast dialogue (host + expert guest) about "${t}" — CBSE Class 10 Science. 4–5 exchanges, covering key concepts, a real-world example, and a quick quiz question at the end. Keep it engaging for Class 10 students.`,
  infographic: (t) => `Create a structured infographic outline for "${t}" — CBSE Class 10 Science. Use numbered sections with emoji labels: key facts, important numbers/equations, a real-world connection, and a did-you-know fact. Format it so it reads like an infographic in plain text.`,
};

const ACCENT     = "#2563eb";
const ACCENT_GLO = "rgba(37,99,235,0.35)";

const TILE_ACCENTS: Record<string, string> = {
  notes:       "#7C3AED",
  flashcards:  "#3B82F6",
  mindmap:     "#22C55E",
  comic:       "#EC4899",
  explainer:   "#3B82F6",
  audio:       "#06B6D4",
  podcast:     "#F97316",
  infographic: "#8B5CF6",
};

export function ClassroomArena({ chapter, onBack }: Props) {
  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [input,      setInput]      = useState("");
  const [savedItems,   setSavedItems]   = useState<SavedItem[]>([]);
  const [viewingItem,  setViewingItem]  = useState<SavedItem | null>(null);
  const [binDragOver,  setBinDragOver]  = useState(false);
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [isStreaming,  setIsStreaming]  = useState(false);
  const [mode,           setMode]           = useState("notes");
  const [playingVideo,   setPlayingVideo]   = useState<VideoItem | null>(null);
  const [flashcardCards, setFlashcardCards] = useState<FlashCard[] | null>(null);
  const [flashcardRaw,   setFlashcardRaw]   = useState("");
  const [flashcardsLoading, setFlashcardsLoading] = useState(false);
  const [hoveredTile,    setHoveredTile]    = useState<string | null>(null);
  const bottomRef           = useRef<HTMLDivElement>(null);
  const taRef               = useRef<HTMLTextAreaElement>(null);
  const pendingFlashcardRef = useRef(false);
  const wasStreamingRef     = useRef(false);
  const messagesRef         = useRef<Message[]>([]);

  const generateFlashcardImages = useCallback(async (cards: FlashCard[]): Promise<FlashCard[]> => {
    const results = await Promise.allSettled(
      cards.map(async (card) => {
        if (!card.imagePrompt) return card;
        try {
          const res = await fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: card.imagePrompt }),
          });
          const data = await res.json();
          return { ...card, imageUrl: data.url ?? undefined, imageError: !data.url };
        } catch {
          return { ...card, imageError: true };
        }
      })
    );
    return results.map((r, i) =>
      r.status === "fulfilled" ? r.value : { ...cards[i], imageError: true }
    );
  }, []);

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : { profile: null })
      .then(({ profile: p }) => setProfile(p))
      .catch(() => {});
  }, []);

  // Load persisted classroom creations for this chapter on mount
  useEffect(() => {
    fetch("/api/creations?type=chat&limit=10")
      .then(r => r.ok ? r.json() : { creations: [] })
      .then(({ creations }: { creations: any[] }) => {
        const filtered = creations.filter(
          (c: any) => Array.isArray(c.tags) && c.tags.includes("classroom") && c.tags.includes(chapter.chapter_title)
        ).slice(0, 10);
        setSavedItems(
          filtered.map((c: any) => ({
            id:        c.id,
            title:     c.title,
            preview:   (c.content as string).replace(/^#{1,3}\s+.+$/m, "").replace(/[#*`_]/g, "").trim().slice(0, 60),
            content:   c.content,
            tags:      Array.isArray(c.tags) ? c.tags : [],
            createdAt: new Date(c.created_at).getTime(),
          }))
        );
      })
      .catch(() => {});
  }, [chapter.chapter_title]);

  // Sends to the dedicated classroom chat route (NOT /api/chat)
  // displayText = what to show in the bubble. Pass null to hide the user bubble entirely (tile actions).
  const sendMessage = useCallback(async (text: string, displayText?: string | null) => {
    if (!profile || isStreaming || !text.trim()) return;

    const asstId = crypto.randomUUID();
    const asstMsg: Message = { id: asstId, role: "assistant", content: "", outputType: "text", isLoading: true, createdAt: new Date() };

    if (displayText !== null) {
      const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: displayText ?? text, outputType: "text", createdAt: new Date() };
      setMessages(prev => [...prev, userMsg, asstMsg]);
    } else {
      setMessages(prev => [...prev, asstMsg]);
    }
    setIsStreaming(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/classroom/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text, chapterTitle: chapter.chapter_title, history }),
      });

      if (!res.ok || !res.body) throw new Error(await res.text());

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") break;
          try {
            const { content } = JSON.parse(data);
            if (content) {
              setMessages(prev => prev.map(m =>
                m.id === asstId ? { ...m, content: m.content + content, isLoading: false } : m
              ));
            }
          } catch { /* partial chunk */ }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[classroom/chat]", msg);
      setMessages(prev => prev.map(m =>
        m.id === asstId ? { ...m, content: `Sorry, something went wrong. Please try again.\n\n_Error: ${msg}_`, isLoading: false } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  }, [profile, isStreaming, messages, chapter.chapter_title]);

  // Keep messagesRef in sync for streaming completion detection
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // When flashcard stream finishes, auto-open the deck overlay and generate images
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming && pendingFlashcardRef.current) {
      pendingFlashcardRef.current = false;
      const lastAssistant = [...messagesRef.current].reverse().find(m => m.role === "assistant");
      if (lastAssistant?.content) {
        const parsed = parseFlashcards(lastAssistant.content);
        if (parsed.length > 0) {
          setFlashcardCards(parsed);
          setFlashcardRaw(lastAssistant.content);
          setFlashcardsLoading(true);
          generateFlashcardImages(parsed).then(enriched => {
            setFlashcardCards(enriched);
            setFlashcardsLoading(false);
          });
        }
      }
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, generateFlashcardImages]);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || !profile || isStreaming) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    const buildPrompt = TILE_PROMPTS[mode];
    if (buildPrompt) {
      if (mode === "flashcards") pendingFlashcardRef.current = true;
      // Show user's typed text in the bubble; send the structured prompt to the API
      await sendMessage(buildPrompt(t), t);
    } else {
      await sendMessage(t);
    }
  }, [profile, isStreaming, sendMessage, mode]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const handleTileClick = useCallback((key: string) => {
    if (isStreaming) return;
    if (!TILE_PROMPTS[key] && key !== "explainer") return;
    setMode(key);
    // Focus the input so user can type their topic immediately
    setTimeout(() => taRef.current?.focus(), 50);
  }, [isStreaming]);

  // Called by MessageBubble's save button → adds thumbnail + persists to creations
  const handleSave = useCallback((content: string, outputType: OutputType) => {
    const headingMatch = content.match(/^#{1,3}\s+(.+)$/m);
    const title = headingMatch
      ? headingMatch[1].trim()
      : content.replace(/[#*`_]/g, "").slice(0, 50).trim() || chapter.chapter_title;
    const preview = content.replace(/^#{1,3}\s+.+$/m, "").replace(/[#*`_]/g, "").trim().slice(0, 60);
    const tempId = crypto.randomUUID();
    const saveTags = ["classroom", chapter.chapter_title, mode];
    setSavedItems(prev => [{ id: tempId, title, preview, content, tags: saveTags, createdAt: Date.now() }, ...prev].slice(0, 10));
    fetch("/api/creations", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        title, type:"chat", output_type: outputType, content,
        tags: saveTags,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        // Replace temp id with real DB id so refreshing doesn't duplicate
        if (data?.creation?.id) {
          setSavedItems(prev => prev.map(item =>
            item.id === tempId ? { ...item, id: data.creation.id } : item
          ));
        }
      })
      .catch(() => {});
  }, [chapter.chapter_title, mode]);

  const handleFlashcardSave = useCallback((content: string) => {
    const count = flashcardCards?.length ?? 10;
    const title = `Flashcards: ${chapter.chapter_title}`;
    const preview = `${count} flashcard${count !== 1 ? "s" : ""}`;
    const contentWithImages = flashcardCards
      ? content + "\n\n__images__:" + JSON.stringify(flashcardCards.map(c => c.imageUrl ?? null))
      : content;
    const tempId = crypto.randomUUID();
    setSavedItems(prev => [
      { id: tempId, title, preview, content: contentWithImages, tags: ["classroom", chapter.chapter_title, "flashcards"], createdAt: Date.now() },
      ...prev,
    ].slice(0, 10));
    fetch("/api/creations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, type: "chat", output_type: "text", content: contentWithImages,
        tags: ["classroom", chapter.chapter_title, "flashcards"],
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.creation?.id) {
          setSavedItems(prev => prev.map(item => item.id === tempId ? { ...item, id: data.creation.id } : item));
        }
      })
      .catch(() => {});
  }, [chapter.chapter_title, flashcardCards]);

  const handleRetryImages = useCallback(async (indices: number[]) => {
    if (!flashcardCards) return;
    const updated = [...flashcardCards];
    indices.forEach(i => { updated[i] = { ...updated[i], imageUrl: undefined, imageError: false }; });
    setFlashcardCards([...updated]);
    const enriched = await generateFlashcardImages(indices.map(i => updated[i]));
    const final = [...updated];
    indices.forEach((cardIdx, i) => { final[cardIdx] = enriched[i]; });
    setFlashcardCards([...final]);
  }, [flashcardCards, generateFlashcardImages]);

  const canSend    = input.trim().length > 0 && !isStreaming && !!profile;
  const tileAccent = TILE_ACCENTS[mode] ?? ACCENT;
  const tileLabel  = TILES.find(t => t.key === mode)?.label ?? "this chapter";

  if (!profile) {
    return (
      <div className="relative flex items-center justify-center" style={{ height:"100dvh" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/classroom/classroom/background.png" alt="" aria-hidden
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"fill" }} />
        <div className="relative z-10 flex items-center gap-2" style={{ color:"rgba(255,255,255,0.55)" }}>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden" style={{ height:"100dvh" }}>

      {/* Background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/classroom/classroom/background.png" alt="" aria-hidden draggable={false}
        style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"fill", zIndex:0 }} />

      {/* Back */}
      <button onClick={onBack}
        className="absolute flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl hover:opacity-80 transition-opacity"
        style={{ top:12, left:14, zIndex:30,
          background:"rgba(0,0,0,0.5)", backdropFilter:"blur(10px)",
          color:"rgba(255,255,255,0.8)", border:"1px solid rgba(255,255,255,0.15)" }}>
        <ChevronLeft className="w-3.5 h-3.5" /> Back
      </button>


      {/* ── All toolbar hotspots — invisible clickable zones over background tiles ── */}
      {TILES.map(tile => (
        <div key={tile.key}
          onClick={() => {
            setMode(tile.key);
            if (tile.key !== "explainer") handleTileClick(tile.key);
          }}
          className="absolute"
          style={{ left:0, top:tile.top, width:tile.width, height:"10.5%",
            zIndex:25, cursor:"pointer" }}
        />
      ))}

      {/* ── My Creations / Videos panel — overlaid on left wall panel ─────────── */}
      <div className="absolute overflow-y-auto"
        style={{ left:"15.5%", top:"15.5%", width:"17%", height:"72%",
          zIndex:18, scrollbarWidth:"none" }}>

        <AnimatePresence mode="wait">

          {/* ── All content modes (notes, flashcards, mindmap, comic, audio, podcast) ── */}
          {mode !== "explainer" && (
            <motion.div key="notes-panel"
              initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              transition={{ duration:0.18 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                <AnimatePresence>
                  {savedItems.filter(item => item.tags.includes(mode)).map((item, idx) => {
                    const isFC = item.tags.includes("flashcards");
                    return (
                      <div key={item.id} draggable
                        onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                          e.dataTransfer.setData("application/classroom-item", item.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}>
                        <motion.div
                          initial={{ opacity:0, y:-8, scale:0.95 }}
                          animate={{ opacity:1, y:0,  scale:1 }}
                          transition={{ duration:0.25, delay: Math.min(idx * 0.04, 0.2) }}
                          onClick={() => {
                            if (isFC) {
                              const parsed = parseFlashcards(item.content);
                              const imgMatch = item.content.match(/__images__:(\[.*?\])/s);
                              if (imgMatch) {
                                try {
                                  const urls: (string|null)[] = JSON.parse(imgMatch[1]);
                                  urls.forEach((url, i) => { if (url && parsed[i]) parsed[i].imageUrl = url; });
                                } catch { /* ignore json parse errors */ }
                              }
                              if (parsed.length > 0) { setFlashcardCards(parsed); setFlashcardRaw(item.content); }
                            } else {
                              setViewingItem(item);
                            }
                          }}
                          className="cursor-grab"
                          whileHover={{ scale:1.04, boxShadow: isFC ? "0 6px 20px rgba(124,58,237,0.28)" : "0 6px 20px rgba(37,99,235,0.28)" }}
                          style={{ borderRadius:10,
                            background:"rgba(255,255,255,0.95)",
                            border:`1px solid ${isFC ? "rgba(124,58,237,0.2)" : "rgba(37,99,235,0.15)"}`,
                            boxShadow:"0 2px 8px rgba(15,28,77,0.09)",
                            overflow:"hidden",
                            display:"flex", flexDirection:"column",
                            alignItems:"center", padding:"10px 7px 9px",
                            textAlign:"center", gap:0 }}>
                          <FileText
                            style={{ color: isFC ? "#7C3AED" : "#2563eb", marginBottom:6, flexShrink:0 }}
                            size={26}
                            strokeWidth={1.6}
                          />
                          <div style={{ width:"72%", height:2, borderRadius:2,
                            background: isFC ? "#7C3AED" : "linear-gradient(90deg,#2563eb,#7c3aed)",
                            marginBottom:6, flexShrink:0 }} />
                          {isFC && (
                            <p style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase",
                              letterSpacing:"0.08em", color:"rgba(124,58,237,0.7)", marginBottom:3 }}>
                              ⚡ {item.preview}
                            </p>
                          )}
                          <p style={{ fontSize:10, fontWeight:700, color:"#0f1c4d",
                            lineHeight:1.3, display:"-webkit-box", WebkitLineClamp: isFC ? 2 : 3,
                            WebkitBoxOrient:"vertical", overflow:"hidden",
                            wordBreak:"break-word" }}>
                            {item.title}
                          </p>
                        </motion.div>
                      </div>
                    );
                  })}
                </AnimatePresence>
              </div>
              {savedItems.filter(item => item.tags.includes(mode)).length === 0 && (
                <p className="text-[10px] text-center pt-3 opacity-30" style={{ color:"#0f1c4d" }}>
                  Saved {tileLabel.toLowerCase()}<br/>appear here
                </p>
              )}
            </motion.div>
          )}

          {/* ── EXPLAINER VIDEOS mode ── */}
          {mode === "explainer" && (
            <motion.div key="videos-panel"
              initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              transition={{ duration:0.18 }}>
              {getVideos(chapter.subject).map((vid) => (
                <motion.div key={vid.embedUrl}
                  initial={{ opacity:0, y:-8, scale:0.95 }}
                  animate={{ opacity:1, y:0,  scale:1 }}
                  transition={{ duration:0.25 }}
                  onClick={() => setPlayingVideo(vid)}
                  className="rounded-xl mb-2 overflow-hidden cursor-pointer"
                  whileHover={{ scale:1.03, boxShadow:"0 6px 20px rgba(37,99,235,0.28)" }}
                  style={{ background:"rgba(255,255,255,0.92)",
                    border:"1px solid rgba(37,99,235,0.2)",
                    boxShadow:"0 2px 12px rgba(15,28,77,0.1)" }}>
                  {/* Video thumbnail */}
                  <div className="relative w-full" style={{ aspectRatio:"16/9", background:"#0a0f1e", maxHeight:72, overflow:"hidden" }}>
                    {vid.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={vid.thumbUrl} alt={vid.title}
                        style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                    ) : (
                      <div style={{ width:"100%", height:"100%", background:"#1a2540" }} />
                    )}
                    {/* Play button overlay */}
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{ background:"rgba(10,15,40,0.38)" }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ background:"rgba(37,99,235,0.9)",
                          boxShadow:"0 0 16px rgba(37,99,235,0.7)" }}>
                        <Play className="w-4 h-4 text-white" style={{ marginLeft:2 }} />
                      </div>
                    </div>
                  </div>
                  {/* Title */}
                  <div className="px-2.5 py-2">
                    <div className="w-full h-0.5 rounded-full mb-1.5"
                      style={{ background:"linear-gradient(90deg,#2563eb,#7c3aed)" }} />
                    <p className="text-[11px] font-bold leading-snug" style={{ color:"#0f1c4d" }}>
                      {vid.title}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Dustbin — drop a note card here to delete it ──────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setBinDragOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setBinDragOver(false); }}
        onDrop={e => {
          e.preventDefault();
          setBinDragOver(false);
          const id = e.dataTransfer.getData("application/classroom-item");
          if (!id) return;
          setSavedItems(prev => prev.filter(item => item.id !== id));
          fetch("/api/creations", {
            method:  "DELETE",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ id }),
          }).catch(() => {});
        }}
        style={{
          position: "absolute",
          bottom: "2%",
          left:   "9%",
          width:  "18%",
          zIndex: 18,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          cursor: "copy",
          transition: "transform 0.2s ease",
          transform: binDragOver ? "scale(1.18) translateY(-6px)" : "scale(1)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
      </div>

      {/* ── Dustbin — drop a note card here to delete it ──────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setBinDragOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setBinDragOver(false); }}
        onDrop={e => {
          e.preventDefault();
          setBinDragOver(false);
          const id = e.dataTransfer.getData("application/classroom-item");
          if (!id) return;
          setSavedItems(prev => prev.filter(item => item.id !== id));
          fetch("/api/creations", {
            method:  "DELETE",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ id }),
          }).catch(() => {});
        }}
        style={{
          position: "absolute",
          bottom: "2%",
          left:   "9%",
          width:  "18%",
          zIndex: 18,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          cursor: "copy",
          transition: "transform 0.2s ease",
          transform: binDragOver ? "scale(1.18) translateY(-6px)" : "scale(1)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
      </div>

      {/* ── Chat overlay — transparent bg, floats on whiteboard ────────────── */}
      {/* Override Syne display font on all markdown headings inside this pane */}
      <style>{`
        .classroom-chat h1,.classroom-chat h2,.classroom-chat h3,
        .classroom-chat h4,.classroom-chat h5,.classroom-chat h6 {
          font-family: 'DM Sans', sans-serif !important;
          font-weight: 700;
        }
      `}</style>
      {/* ── Chat overlay — transparent bg, floats on whiteboard ────────────── */}
      <div className="absolute flex flex-col classroom-chat"
        style={{ left:"36%", top:"7%", width:"60%", height:"70%", zIndex:15 }}>

        {/* Chapter pill — full width with rounded ends */}
        <div className="flex-shrink-0" style={{ padding: "10px 0 2px" }}>
          <div style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            padding: "6px 16px",
            borderRadius: 40,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(37,99,235,0.22)",
            boxShadow: "0 2px 12px rgba(37,99,235,0.10)",
            backdropFilter: "blur(20px)",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: "#2563eb", boxShadow: "0 0 6px #2563eb",
            }}/>
            <span style={{
              fontSize: 8, fontWeight: 800, letterSpacing: "0.12em",
              color: "#2563eb", textTransform: "uppercase",
              fontFamily: "'Syne', sans-serif", flexShrink: 0,
            }}>CHAPTER</span>
            <div style={{ width: 1, height: 12, background: "rgba(0,0,0,0.12)", flexShrink: 0 }}/>
            <span style={{
              flex: 1, fontSize: 11, fontWeight: 700,
              color: "#0a0a2e",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              fontFamily: "'DM Sans', sans-serif",
            }}>{chapter.chapter_title}</span>
            {TILES.some(t => t.key === mode) && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                color: tileAccent, textTransform: "uppercase",
                fontFamily: "'Syne', sans-serif",
                background: `${tileAccent}18`,
                border: `1px solid ${tileAccent}40`,
                borderRadius: 20, padding: "2px 8px", flexShrink: 0,
              }}>{tileLabel}</span>
            )}
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 min-h-0 overflow-y-auto"
          style={{ padding:"12px 14px 6px", display:"flex", flexDirection:"column",
            gap:8, scrollbarWidth:"none" }}>

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 opacity-35 pointer-events-none">
              <span style={{ fontSize:32 }}>✏️</span>
              <p className="text-sm text-center font-medium" style={{ color:"#1e3a8a", lineHeight:1.7 }}>
                Click <strong>Notes</strong> or <strong>Flashcards</strong> on the left,<br/>
                or type a question below
              </p>
            </div>
          )}

          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              avatarEmoji={profile.avatar_emoji}
              isStreaming={isStreaming && msg === messages[messages.length - 1]}
              arenaAccent={ACCENT}
              arenaAccentGlow={ACCENT_GLO}
              arenaId={1}
              onSave={handleSave}
            />
          ))}

          {isStreaming && (
            <div style={{ display:"flex", gap:4, padding:"2px 0 2px 28px" }}>
              {[0,1,2].map(i => (
                <span key={i} className="dot"
                  style={{ width:6, height:6, borderRadius:"50%", display:"inline-block",
                    background:ACCENT, opacity:0.7, animationDelay:`${i*0.15}s` }} />
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Prompt bar */}
        <div style={{ flexShrink:0, padding:"0 4px 8px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8,
            background:"linear-gradient(180deg, rgba(18,28,72,0.92) 0%, rgba(10,16,52,0.95) 100%)",
            backdropFilter:"blur(24px)",
            borderRadius:16, padding:"10px 12px",
            border:`2px solid ${tileAccent}`,
            transition:"border-color 0.3s ease, box-shadow 0.3s ease",
            boxShadow:`0 0 0 1px ${tileAccent}30, 0 4px 24px rgba(0,0,50,0.4), 0 0 20px ${tileAccent}25, inset 0 1px 0 rgba(255,255,255,0.1)` }}>
            <textarea
              ref={taRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                const t = e.target;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 80) + "px";
              }}
              onKeyDown={handleKey}
              placeholder={mode !== "notes" && TILE_PROMPTS[mode] ? `Type a topic for ${TILES.find(t => t.key === mode)?.label ?? mode}…` : "Ask anything about this chapter…"}
              rows={1}
              disabled={!profile}
              style={{ flex:1, resize:"none", border:"none", outline:"none",
                background:"transparent", fontSize:15, fontWeight:500,
                color:"rgba(255,255,255,0.92)", fontFamily:"inherit",
                lineHeight:1.5, overflowY:"hidden",
                caretColor:tileAccent, userSelect:"text" }}
            />
            <button onClick={() => send(input)} disabled={!canSend}
              style={{ width:34, height:34, borderRadius:"50%", flexShrink:0,
                background: canSend ? tileAccent : "rgba(255,255,255,0.08)",
                border:"none", cursor: canSend ? "pointer" : "not-allowed",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all 0.3s ease",
                boxShadow: canSend ? `0 0 16px ${tileAccent}99` : "none" }}>
              <svg width="13" height="13" viewBox="0 0 18 18" fill="none">
                <path d="M2 9h14M9 2l7 7-7 7"
                  stroke={canSend ? "#fff" : "rgba(255,255,255,0.2)"}
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Video player modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {playingVideo && (
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ zIndex:60, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(8px)" }}
            onClick={() => setPlayingVideo(null)}
          >
            <motion.div
              initial={{ opacity:0, scale:0.93, y:16 }}
              animate={{ opacity:1, scale:1,    y:0 }}
              exit={{    opacity:0, scale:0.93, y:16 }}
              transition={{ duration:0.22 }}
              onClick={e => e.stopPropagation()}
              style={{ width:"72%", borderRadius:16, overflow:"hidden",
                boxShadow:"0 32px 80px rgba(0,0,0,0.7)",
                border:"1px solid rgba(255,255,255,0.1)" }}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ background:"rgba(10,15,40,0.95)", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-sm font-semibold" style={{ color:"rgba(255,255,255,0.88)",
                  fontFamily:"'DM Sans',sans-serif" }}>
                  {playingVideo.title}
                </p>
                <button onClick={() => setPlayingVideo(null)}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
                  style={{ color:"rgba(255,255,255,0.5)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Video — iframe for Drive links, native video for local files */}
              {playingVideo.embedUrl.startsWith("https://drive.google.com") ? (
                <iframe
                  key={playingVideo.embedUrl}
                  src={playingVideo.embedUrl}
                  allow="autoplay"
                  allowFullScreen
                  style={{ width:"100%", border:"none", background:"#000",
                    height:"min(70vh, 480px)", display:"block" }}
                />
              ) : (
                <video
                  key={playingVideo.embedUrl}
                  src={playingVideo.embedUrl}
                  controls
                  autoPlay
                  style={{ width:"100%", display:"block", background:"#000",
                    maxHeight:"70vh", objectFit:"contain" }}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Flashcard deck overlay ──────────────────────────────────────────── */}
      <AnimatePresence>
        {flashcardCards && (
          <FlashcardDeck
            cards={flashcardCards}
            rawContent={flashcardRaw}
            chapterTitle={chapter.chapter_title}
            isLoadingImages={flashcardsLoading}
            onClose={() => setFlashcardCards(null)}
            onSave={handleFlashcardSave}
            onRetryImages={handleRetryImages}
          />
        )}
      </AnimatePresence>

      {/* ── Saved item viewer modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {viewingItem && (
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ zIndex:50, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(6px)" }}
            onClick={() => setViewingItem(null)}
          >
            <motion.div
              initial={{ opacity:0, scale:0.95, y:12 }}
              animate={{ opacity:1, scale:1,    y:0 }}
              exit={{    opacity:0, scale:0.95, y:12 }}
              transition={{ duration:0.22 }}
              onClick={e => e.stopPropagation()}
              className="flex flex-col"
              style={{ width:"56%", maxHeight:"78vh",
                background:"rgba(255,255,255,0.97)", backdropFilter:"blur(20px)",
                borderRadius:20, overflow:"hidden",
                boxShadow:"0 24px 64px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.9)" }}
            >
              {/* Modal header */}
              <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3.5"
                style={{ borderBottom:"1px solid rgba(15,28,77,0.08)" }}>
                <span className="text-base">📝</span>
                <p className="flex-1 font-display font-bold text-sm truncate" style={{ color:"#0f1c4d" }}>
                  {viewingItem.title}
                </p>
                <button
                  onClick={() => setViewingItem(null)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-lg transition-colors hover:bg-gray-100"
                  style={{ color:"rgba(15,28,77,0.4)", lineHeight:1 }}
                >
                  ×
                </button>
              </div>

              {/* Modal content */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4"
                style={{ scrollbarWidth:"thin", fontFamily:"'DM Sans', sans-serif", fontSize:15, color:"#0f1c4d", lineHeight:1.7 }}>
                <ReactMarkdown
                  components={{
                    h1: ({children}) => <h1 style={{ fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:20, margin:"16px 0 6px", color:"#0f1c4d" }}>{children}</h1>,
                    h2: ({children}) => <h2 style={{ fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:18, margin:"14px 0 5px", color:"#0f1c4d" }}>{children}</h2>,
                    h3: ({children}) => <h3 style={{ fontFamily:"'DM Sans',sans-serif", fontWeight:600, fontSize:16, margin:"12px 0 4px", color:"#0f1c4d" }}>{children}</h3>,
                    p:  ({children}) => <p  style={{ margin:"6px 0" }}>{children}</p>,
                    li: ({children}) => <li style={{ marginBottom:4 }}>{children}</li>,
                    code: ({children}) => <code style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, background:"rgba(37,99,235,0.08)", color:"#1d4ed8", padding:"1px 5px", borderRadius:4 }}>{children}</code>,
                    pre: ({children}) => <pre style={{ background:"rgba(15,28,77,0.05)", borderRadius:8, padding:"10px 14px", overflowX:"auto", margin:"10px 0" }}>{children}</pre>,
                    strong: ({children}) => <strong style={{ fontWeight:700, color:"#0f1c4d" }}>{children}</strong>,
                  }}
                >{viewingItem.content}</ReactMarkdown>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

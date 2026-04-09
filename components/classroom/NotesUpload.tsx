"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Upload, X, Loader2, ImagePlus, CheckCircle2 } from "lucide-react";
import type { Chapter, CorrectionResult } from "@/types";

interface Props {
  chapter:    Chapter;
  onComplete: (result: CorrectionResult) => void;
  onBack:     () => void;
}

const MAX_IMAGES = 5;
const TEAL       = "#06B6D4";
const NAVY       = "#0f1c4d";
const GOLD       = "#C8A84B";

interface ImageEntry {
  file:    File;
  preview: string;
  url?:    string;   // Supabase URL after upload
}

type Phase = "upload" | "uploading" | "correcting";

export function NotesUpload({ chapter, onComplete, onBack }: Props) {
  const [images,      setImages]    = useState<ImageEntry[]>([]);
  const [phase,       setPhase]     = useState<Phase>("upload");
  const [statusMsg,   setStatusMsg] = useState("");
  const [error,       setError]     = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Add images from file picker ────────────────────────────────────────────
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files)
      .filter(f => f.type.startsWith("image/"))
      .slice(0, MAX_IMAGES - images.length);

    const newEntries: ImageEntry[] = incoming.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setImages(prev => [...prev, ...newEntries].slice(0, MAX_IMAGES));
    setError(null);
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[index]!.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // ── Upload one image to Supabase via existing route ────────────────────────
  async function uploadImage(entry: ImageEntry): Promise<string> {
    const form = new FormData();
    form.append("file", entry.file);
    const res = await fetch("/api/classroom/upload-answers", { method: "POST", body: form });
    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    const { url } = await res.json();
    return url as string;
  }

  // ── Main submit pipeline ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (images.length === 0) { setError("Please upload at least one photo of your notes."); return; }
    setError(null);

    try {
      // Phase 1 — upload each image to Supabase
      setPhase("uploading");
      const uploadedUrls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        setStatusMsg(`Uploading page ${i + 1} of ${images.length}…`);
        const url = await uploadImage(images[i]!);
        uploadedUrls.push(url);
      }

      // Phase 2 — send to Claude for correction
      setPhase("correcting");
      setStatusMsg("Ms. Bhavna is reviewing your notes…");

      const res = await fetch("/api/classroom/correct-notes", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ chapter_id: chapter.id, image_urls: uploadedUrls }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Correction failed");
      }

      const result: CorrectionResult = await res.json();
      onComplete(result);

    } catch (e: any) {
      setError(e.message ?? "Something went wrong. Please try again.");
      setPhase("upload");
    }
  };

  const busy = phase !== "upload";

  return (
    <div className="flex flex-col h-full"
      style={{ fontFamily: "var(--font-dm-sans,'DM Sans',sans-serif)" }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: `1px solid ${TEAL}22` }}>
        <button onClick={onBack} disabled={busy}
          className="flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ color: NAVY }}>
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest"
            style={{ color: TEAL }}>Correct My Notes</p>
          <p className="text-sm font-bold truncate" style={{ color: NAVY }}>
            {chapter.chapter_title}
          </p>
        </div>
        <div className="text-xs px-2 py-1 rounded-lg font-semibold flex-shrink-0"
          style={{ background: `${TEAL}15`, color: TEAL }}>
          {chapter.subject}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "none" }}>

        {/* Instruction card */}
        <div className="rounded-2xl p-4 mb-4 flex items-start gap-3"
          style={{ background: `${TEAL}0D`, border: `1px solid ${TEAL}30` }}>
          <span className="text-xl flex-shrink-0">✏️</span>
          <div>
            <p className="text-sm font-bold mb-1" style={{ color: NAVY }}>
              Upload your classwork notes
            </p>
            <p className="text-xs leading-relaxed" style={{ color: `${NAVY}80` }}>
              Take clear, well-lit photos of your handwritten notes for this chapter.
              Our AI teacher will check for wrong formulas, spelling mistakes, and missing content.
              Up to {MAX_IMAGES} pages.
            </p>
          </div>
        </div>

        {/* Image grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <AnimatePresence>
              {images.map((entry, i) => (
                <motion.div key={entry.preview}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.18 }}
                  className="relative rounded-xl overflow-hidden aspect-[3/4]"
                  style={{ border: `1.5px solid ${TEAL}40`, background: "#f0f0f0" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={entry.preview} alt={`Page ${i + 1}`}
                    className="w-full h-full object-cover" />
                  {/* Page label */}
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1"
                    style={{ background: "rgba(15,28,77,0.55)", backdropFilter: "blur(4px)" }}>
                    <span className="text-[10px] font-bold text-white">Page {i + 1}</span>
                  </div>
                  {/* Remove button */}
                  {!busy && (
                    <button onClick={() => removeImage(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-opacity hover:opacity-90"
                      style={{ background: "rgba(220,38,38,0.85)" }}>
                      <X className="w-3 h-3 text-white" />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Upload zone / Add more button */}
        {images.length < MAX_IMAGES && !busy && (
          <motion.button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-2xl flex flex-col items-center justify-center gap-2 py-8 transition-colors"
            style={{
              border: `2px dashed ${TEAL}50`,
              background: `${TEAL}06`,
              color: TEAL,
            }}
            whileHover={{ background: `${TEAL}12`, borderColor: TEAL }}
            transition={{ duration: 0.15 }}>
            <ImagePlus className="w-6 h-6" />
            <span className="text-sm font-semibold">
              {images.length === 0 ? "Tap to add photos" : `Add more (${images.length}/${MAX_IMAGES})`}
            </span>
            <span className="text-xs opacity-60">JPG or PNG, max 10 MB each</span>
          </motion.button>
        )}

        {/* Hidden file input */}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} />

        {/* Error */}
        {error && (
          <div className="mt-3 rounded-xl px-4 py-3 text-xs font-medium"
            style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.2)" }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Loading state ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {busy && (
          <motion.div
            key="loading-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-3xl"
            style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", zIndex: 20 }}>
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${TEAL}22, ${TEAL}0A)`,
                  border: `1px solid ${TEAL}50`, boxShadow: `0 0 32px ${TEAL}30` }}>
                {phase === "correcting"
                  ? <span className="text-3xl">📝</span>
                  : <Upload className="w-7 h-7 animate-bounce" style={{ color: TEAL }} />
                }
              </div>
              <div className="absolute -inset-3 rounded-[28px] opacity-20 animate-pulse"
                style={{ background: `radial-gradient(circle, ${TEAL}60, transparent 70%)` }} />
            </div>
            <div className="text-center">
              <p className="font-bold text-sm" style={{ color: NAVY }}>
                {phase === "correcting" ? "Reviewing notes…" : "Uploading pages…"}
              </p>
              <p className="text-xs mt-1 font-mono" style={{ color: `${NAVY}55` }}>
                {statusMsg}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 py-4"
        style={{ borderTop: `1px solid ${TEAL}22` }}>
        <motion.button
          onClick={handleSubmit}
          disabled={busy || images.length === 0}
          className="w-full py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-opacity"
          style={{
            background: images.length === 0 || busy
              ? "rgba(0,0,0,0.08)"
              : `linear-gradient(135deg, ${TEAL}, #0891B2)`,
            color:   images.length === 0 || busy ? "rgba(0,0,0,0.3)" : "#fff",
            boxShadow: images.length > 0 && !busy ? `0 4px 24px ${TEAL}50` : "none",
          }}
          whileHover={images.length > 0 && !busy ? { scale: 1.01 } : {}}
          whileTap={images.length > 0 && !busy ? { scale: 0.98 } : {}}
          transition={{ duration: 0.12 }}>
          {busy
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Working…</>
            : <><CheckCircle2 className="w-4 h-4" /> Submit for Correction ({images.length} {images.length === 1 ? "page" : "pages"})</>
          }
        </motion.button>
        {images.length === 0 && (
          <p className="text-center text-[10px] mt-2" style={{ color: `${NAVY}50` }}>
            Add at least one photo to continue
          </p>
        )}
      </div>
    </div>
  );
}

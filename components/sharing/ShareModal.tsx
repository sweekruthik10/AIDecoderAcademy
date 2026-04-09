"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Creation } from "@/types";

type IGStatus = "idle" | "loading" | "downloaded" | "error";

interface Props {
  open:      boolean;
  onClose:   () => void;
  creation:  Creation;
  shareUrl:  string;
  accent?:   string;
}

export function ShareModal({ open, onClose, creation, shareUrl, accent = "#7C3AED" }: Props) {
  const [copied,    setCopied]    = useState(false);
  const [toggling,  setToggling]  = useState(false);
  const [isPublic,  setIsPublic]  = useState(creation.is_public ?? false);
  const [localToken, setLocalToken] = useState(creation.share_token);
  const [igStatus,  setIgStatus]  = useState<IGStatus>("idle");
  const prefetchedFile = useRef<File | null>(null);

  // Pre-fetch the share image as soon as the modal is open and public,
  // so the Instagram tap fires the share sheet instantly with no loading delay.
  useEffect(() => {
    if (!open || !isPublic || !localToken) return;
    prefetchedFile.current = null; // reset on re-open

    const isImageCreation =
      creation.output_type === "image" && /^https?:\/\//i.test((creation.content ?? "").trim());
    const imgUrl = isImageCreation
      ? creation.content.trim()
      : `/api/share/${localToken}/og`;

    fetch(imgUrl)
      .then(r => r.blob())
      .then(blob => {
        const ext  = blob.type.includes("png") ? "png" : "jpg";
        prefetchedFile.current = new File([blob], `${creation.title}.${ext}`, { type: blob.type });
      })
      .catch(() => {});
  }, [open, isPublic, localToken, creation.output_type, creation.content, creation.title]);

  const liveShareUrl = localToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${localToken}`
    : shareUrl;

  const togglePublic = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      const next = !isPublic;
      const res  = await fetch("/api/creations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: creation.id, is_public: next }),
      });
      const data = await res.json();
      if (data.creation) {
        setIsPublic(data.creation.is_public);
        if (data.creation.share_token) setLocalToken(data.creation.share_token);
      }
    } finally {
      setToggling(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(liveShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* blocked */ }
  };

  const shareViaWebApi = async () => {
    if (!navigator.share) { copyLink(); return; }
    try {
      await navigator.share({
        title: creation.title,
        text:  `Check out what I made with AI Decoder Academy: ${creation.title}`,
        url:   liveShareUrl,
      });
    } catch { /* cancelled */ }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Check out "${creation.title}" I made with AI! ${liveShareUrl}`)}`;
  const twitterUrl  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just created "${creation.title}" using AI Decoder Academy! 🚀`)}&url=${encodeURIComponent(liveShareUrl)}`;

  // Instagram Stories: use pre-fetched blob (instant) or fetch now (fallback)
  const shareToInstagramStory = async () => {
    let file = prefetchedFile.current;

    // If pre-fetch hasn't finished yet, fetch now (shows brief spinner)
    if (!file) {
      setIgStatus("loading");
      try {
        const isImageCreation =
          creation.output_type === "image" && /^https?:\/\//i.test((creation.content ?? "").trim());
        const imgUrl = isImageCreation
          ? creation.content.trim()
          : `/api/share/${localToken}/og`;
        const res  = await fetch(imgUrl);
        const blob = await res.blob();
        const ext  = blob.type.includes("png") ? "png" : "jpg";
        file = new File([blob], `${creation.title}.${ext}`, { type: blob.type });
        prefetchedFile.current = file;
      } catch {
        setIgStatus("error");
        return;
      }
    }

    try {
      // Mobile: native share sheet → user picks "Add to Story"
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: creation.title });
        setIgStatus("idle");
        return;
      }
      // Desktop fallback: download + instructions
      const url = URL.createObjectURL(file);
      const a   = document.createElement("a");
      a.href     = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      setIgStatus("downloaded");
      setTimeout(() => setIgStatus("idle"), 5000);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setIgStatus("error");
      else setIgStatus("idle");
    }
  };

  const canShare = isPublic && !!localToken;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="relative z-10 w-full sm:max-w-md rounded-t-[28px] sm:rounded-[24px] overflow-hidden"
            style={{ background: "#12121E", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            {/* Handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-white/20"/>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-4 pb-4">
              <div>
                <h2 className="font-display font-black text-white text-lg">Share this creation</h2>
                <p className="text-xs text-white/40 mt-0.5 truncate max-w-[220px]">{creation.title}</p>
              </div>
              <button onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] text-white/40 hover:bg-white/10 hover:text-white transition-all">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="px-6 pb-8 space-y-5">

              {/* Make public toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <p className="text-sm font-bold text-white">Make public</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {isPublic ? "Anyone with the link can view this" : "Only you can see this right now"}
                  </p>
                </div>
                <button
                  onClick={togglePublic}
                  disabled={toggling}
                  className="relative w-12 h-6 rounded-full transition-colors flex-shrink-0"
                  style={{ background: isPublic ? accent : "rgba(255,255,255,0.12)" }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: isPublic ? "calc(100% - 22px)" : "2px" }}
                  />
                </button>
              </div>

              {/* Link + Copy */}
              {canShare && (
                <div>
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 block">
                    Shareable link
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 px-3 py-2.5 rounded-xl border border-white/[0.08] text-xs text-white/50 font-mono truncate"
                      style={{ background: "rgba(255,255,255,0.04)" }}>
                      {liveShareUrl}
                    </div>
                    <button onClick={copyLink}
                      className="flex-shrink-0 px-4 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95"
                      style={{ background: copied ? "#22c55e" : accent, color: "#fff" }}>
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              )}

              {!isPublic && (
                <p className="text-center text-xs text-white/30 py-2">
                  Turn on <span className="text-white/60 font-semibold">Make public</span> to get a shareable link.
                </p>
              )}

              {/* Platform buttons */}
              {canShare && (
                <div>
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3 block">
                    Share on
                  </label>
                  <div className="grid grid-cols-4 gap-3">

                    {/* WhatsApp */}
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all hover:scale-[1.04] active:scale-95"
                      style={{ background: "rgba(37,211,102,0.12)", border: "1.5px solid rgba(37,211,102,0.25)" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        <path d="M11.995 0C5.372 0 0 5.373 0 11.998c0 2.117.554 4.1 1.521 5.822L.047 23.997l6.304-1.651A11.955 11.955 0 0011.995 24C18.622 24 24 18.627 24 12.002 24 5.374 18.622 0 11.995 0zm0 21.981a9.96 9.96 0 01-5.075-1.382l-.364-.216-3.764.986 1.004-3.673-.237-.378a9.985 9.985 0 01-1.529-5.318c0-5.506 4.474-9.981 9.965-9.981 5.49 0 9.965 4.475 9.965 9.981 0 5.507-4.474 9.981-9.965 9.981z"/>
                      </svg>
                      <span className="text-[10px] font-bold text-white/50">WhatsApp</span>
                    </a>

                    {/* Twitter / X */}
                    <a href={twitterUrl} target="_blank" rel="noopener noreferrer"
                      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all hover:scale-[1.04] active:scale-95"
                      style={{ background: "rgba(29,161,242,0.1)", border: "1.5px solid rgba(29,161,242,0.22)" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.736l7.737-8.857L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                      <span className="text-[10px] font-bold text-white/50">Twitter / X</span>
                    </a>

                    {/* Instagram Stories */}
                    <button
                      onClick={shareToInstagramStory}
                      disabled={igStatus === "loading"}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all hover:scale-[1.04] active:scale-95 disabled:opacity-60 disabled:scale-100"
                      style={{ background: "rgba(225,48,108,0.1)", border: "1.5px solid rgba(225,48,108,0.22)" }}>
                      {igStatus === "loading" ? (
                        <div className="w-[22px] h-[22px] rounded-full border-2 border-pink-400 border-t-transparent animate-spin"/>
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <defs>
                            <linearGradient id="ig" x1="0" y1="1" x2="1" y2="0">
                              <stop offset="0%" stopColor="#f09433"/>
                              <stop offset="25%" stopColor="#e6683c"/>
                              <stop offset="50%" stopColor="#dc2743"/>
                              <stop offset="75%" stopColor="#cc2366"/>
                              <stop offset="100%" stopColor="#bc1888"/>
                            </linearGradient>
                          </defs>
                          <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig)" strokeWidth="1.8"/>
                          <circle cx="12" cy="12" r="4" stroke="url(#ig)" strokeWidth="1.8"/>
                          <circle cx="17.5" cy="6.5" r="1" fill="url(#ig)"/>
                        </svg>
                      )}
                      <span className="text-[10px] font-bold text-white/50">
                        {igStatus === "loading" ? "Preparing…" : "Story"}
                      </span>
                    </button>

                    {/* Native share / More */}
                    <button onClick={shareViaWebApi}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all hover:scale-[1.04] active:scale-95"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <circle cx="18" cy="5" r="2.5" stroke="white" strokeWidth="1.6"/>
                        <circle cx="6"  cy="12" r="2.5" stroke="white" strokeWidth="1.6"/>
                        <circle cx="18" cy="19" r="2.5" stroke="white" strokeWidth="1.6"/>
                        <path d="M8.5 10.5L15.5 7M8.5 13.5L15.5 17" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                      <span className="text-[10px] font-bold text-white/50">More</span>
                    </button>
                  </div>

                  {/* Instagram status hint */}
                  {igStatus === "downloaded" && (
                    <div className="flex items-start gap-2 mt-1 px-1">
                      <span className="text-lg">📸</span>
                      <p className="text-xs text-white/50 leading-relaxed">
                        Image saved! Open <span className="text-white/80 font-semibold">Instagram</span>, tap the{" "}
                        <span className="text-white/80 font-semibold">+ Story</span> button, and select this image from your gallery.
                      </p>
                    </div>
                  )}
                  {igStatus === "error" && (
                    <p className="text-xs text-red-400/70 mt-1 px-1">
                      Couldn't prepare the image. Try again or download it manually.
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

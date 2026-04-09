"use client";

import { useEffect } from "react";

interface Props {
  reducedMotion?: boolean;
  videoRef:       React.RefObject<HTMLVideoElement | null>;
  muted:          boolean;
}

export function ArenaVideoWorld({ reducedMotion = false, videoRef, muted }: Props) {
  useEffect(() => {
    if (reducedMotion || !videoRef.current) return;
    videoRef.current.play().catch(() => {});
  }, [reducedMotion]);

  return (
    <div
      aria-hidden
      style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 0 }}
    >
      {!reducedMotion && (
        <video
          ref={videoRef}
          muted={muted}
          loop
          playsInline
          autoPlay
          style={{
            position:  "absolute",
            inset:     0,
            width:     "100%",
            height:    "100%",
            objectFit: "cover",
          }}
        >
          <source src="/video-arena.mp4" type="video/mp4" />
        </video>
      )}

      {/* Fallback for reduced motion */}
      {reducedMotion && (
        <div style={{
          position:   "absolute",
          inset:      0,
          background: "linear-gradient(180deg, #020308 0%, #060b1c 50%, #0a0618 100%)",
        }} />
      )}

      {/* Dark overlay — keeps chat readable */}
      <div style={{
        position:   "absolute",
        inset:      0,
        background: "rgba(0,0,0,0.45)",
      }} />

      {/* Vignette */}
      <div style={{
        position:   "absolute",
        inset:      0,
        background: "radial-gradient(ellipse 80% 70% at 50% 50%, transparent 0%, rgba(0,0,0,0.3) 65%, rgba(0,0,0,0.7) 100%)",
      }} />
    </div>
  );
}
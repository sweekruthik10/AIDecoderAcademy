"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AlertTriangle, Maximize } from "lucide-react";

interface Props {
  active:       boolean;          // true only during actual test (not intro/result)
  onDisqualify: () => void;
  children:     React.ReactNode;
}

const MAX_WARNINGS = 2;           // warn twice, disqualify on 3rd violation

export function ProctoringGuard({ active, onDisqualify, children }: Props) {
  const [violations,  setViolations]  = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [fsSupported, setFsSupported] = useState(true);

  // Refs so event listeners always see latest values without re-registering
  const violationsRef    = useRef(0);
  const cooldownRef      = useRef(false);   // debounce — ignore bursts
  const activeRef        = useRef(active);
  const onDisqualifyRef  = useRef(onDisqualify);

  useEffect(() => { activeRef.current = active; },       [active]);
  useEffect(() => { onDisqualifyRef.current = onDisqualify; }, [onDisqualify]);

  // ── Record a violation ──────────────────────────────────────────────────────
  const handleViolation = useCallback(() => {
    if (!activeRef.current || cooldownRef.current) return;

    // 2-second debounce prevents double-counting a single leave event
    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, 2000);

    violationsRef.current += 1;
    const count = violationsRef.current;
    setViolations(count);

    if (count > MAX_WARNINGS) {
      // 3rd violation — disqualify immediately
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      onDisqualifyRef.current();
    } else {
      setShowWarning(true);
    }
  }, []);

  // ── Request fullscreen when test goes active ────────────────────────────────
  useEffect(() => {
    if (!active) return;

    const el = document.documentElement;
    if (!el.requestFullscreen) { setFsSupported(false); return; }

    el.requestFullscreen({ navigationUI: "hide" }).catch(() => {
      // User denied or browser blocked — monitor tabs only, no fullscreen
      setFsSupported(false);
    });
  }, [active]);

  // ── Exit fullscreen when test ends ─────────────────────────────────────────
  useEffect(() => {
    if (!active && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [active]);

  // ── Attach violation listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;

    const onFullscreenChange = () => {
      // Violation only when leaving fullscreen (not when entering)
      if (!document.fullscreenElement) handleViolation();
    };

    const onVisibilityChange = () => {
      if (document.hidden) handleViolation();
    };

    document.addEventListener("fullscreenchange",  onFullscreenChange);
    document.addEventListener("visibilitychange",  onVisibilityChange);

    return () => {
      document.removeEventListener("fullscreenchange",  onFullscreenChange);
      document.removeEventListener("visibilitychange",  onVisibilityChange);
    };
  }, [active, handleViolation]);

  // ── Re-enter fullscreen on "Return" button click ────────────────────────────
  const returnToFullscreen = () => {
    document.documentElement
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => setShowWarning(false))
      .catch(() => setShowWarning(false)); // allow them back even if fs fails
  };

  const isLastWarning = violations >= MAX_WARNINGS;
  const accent        = isLastWarning ? "#FF2D78" : "#FFB800";
  const accentDim     = isLastWarning ? "rgba(255,45,120,0.15)" : "rgba(255,184,0,0.12)";
  const accentBorder  = isLastWarning ? "rgba(255,45,120,0.4)"  : "rgba(255,184,0,0.35)";

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {children}

      {/* ── Warning overlay ─────────────────────────────────────────────────── */}
      {showWarning && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 9999, background: "rgba(240,244,255,0.92)", backdropFilter: "blur(24px)" }}
        >
          <div className="flex flex-col items-center gap-6 max-w-xs text-center px-6">

            {/* Icon */}
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: accentDim, border: `2px solid ${accentBorder}`, boxShadow: `0 0 40px ${accentDim}` }}
            >
              <AlertTriangle className="w-10 h-10" style={{ color: accent }} />
            </div>

            {/* Title */}
            <div>
              <p className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: accent }}>
                Proctoring Violation · {violations} / {MAX_WARNINGS + 1}
              </p>
              <h2 className="font-display font-black text-2xl mb-3" style={{ color: "#0f1c4d" }}>
                {isLastWarning ? "Final Warning!" : "Warning!"}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(15,28,77,0.55)" }}>
                {isLastWarning
                  ? "One more violation will immediately end your test and you will receive 0 marks. Please stay in fullscreen."
                  : "You left fullscreen or switched tabs. This test must be completed in fullscreen mode without switching away."}
              </p>
            </div>

            {/* Violation dots */}
            <div className="flex items-center gap-2.5">
              {Array.from({ length: MAX_WARNINGS + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full transition-all duration-300"
                  style={{ background: i < violations ? accent : "rgba(15,28,77,0.12)" }}
                />
              ))}
            </div>

            {/* Return button */}
            <button
              onClick={returnToFullscreen}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-display font-bold text-sm"
              style={{
                background: `linear-gradient(135deg, ${accent}, ${isLastWarning ? "#C4005E" : "#E07000"})`,
                color:      "#08080F",
                boxShadow:  `0 0 28px ${accentDim}`,
              }}
            >
              <Maximize className="w-4 h-4" />
              Return to Fullscreen
            </button>

            {/* Fullscreen not supported notice */}
            {!fsSupported && (
              <p className="text-xs" style={{ color: "rgba(15,28,77,0.4)" }}>
                Fullscreen was blocked. Tab switching is still monitored.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

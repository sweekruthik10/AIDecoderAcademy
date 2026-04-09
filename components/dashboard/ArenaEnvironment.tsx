"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { ArenaEnvironmentPreset } from "@/lib/arenas";

type Props = {
  preset: ArenaEnvironmentPreset;
  /** Arena radial wash from `ArenaConfig.gradient` */
  gradient: string;
};

const PARALLAX_LERP = 0.085;

/**
 * Full-viewport atmospheric layer for the whole dashboard.
 * P1: CSS terrain motion. P2: depth parallax (pointer), particle field per preset, reduced-motion safe.
 */
export function ArenaEnvironment({ preset, gradient }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onMq = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (reducedMotion) {
      el.style.setProperty("--arena-px", "0");
      el.style.setProperty("--arena-py", "0");
      return;
    }

    const tick = () => {
      const cur = currentRef.current;
      const tgt = targetRef.current;
      cur.x += (tgt.x - cur.x) * PARALLAX_LERP;
      cur.y += (tgt.y - cur.y) * PARALLAX_LERP;
      el.style.setProperty("--arena-px", cur.x.toFixed(4));
      el.style.setProperty("--arena-py", cur.y.toFixed(4));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      targetRef.current = {
        x: Math.max(-1, Math.min(1, nx)),
        y: Math.max(-1, Math.min(1, ny)),
      };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reducedMotion]);

  return (
    <div
      ref={rootRef}
      className="arena-env pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={
        {
          "--arena-px": "0",
          "--arena-py": "0",
        } as CSSProperties
      }
      aria-hidden
    >
      <div className="arena-env__void" />
      <div className="arena-env__layer arena-env__layer--back">
        <div
          className="arena-env__glow"
          style={{ background: gradient }}
        />
      </div>
      <div className="arena-env__layer arena-env__layer--mid">
        <div className={cn("arena-env__terrain", `arena-env__terrain--${preset}`)} />
      </div>
      <div className="arena-env__layer arena-env__layer--front">
        <div className={cn("arena-env__particles", `arena-env__particles--${preset}`)} />
      </div>
    </div>
  );
}

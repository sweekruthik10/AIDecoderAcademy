"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  onClick:         () => void;
  arenaAccent:     string;
  arenaAccentGlow: string;
  hasDraft:        boolean;
}

// Floating worksheet launcher — uses /worksheet-on-floor.png as a JRPG-style
// floor sprite, sitting just to the LEFT of the AIDA character.
//
// ───────────────────────────────────────────────────────────────────────────
// MANUAL SIZE KNOB
//   Edit the two `clamp(...)` values on the SAME line (width + height). They
//   must stay equal — the sprite is a square. Format is clamp(MIN, IDEAL, MAX):
//     MIN  = smallest size on tiny screens, in pixels
//     IDEAL = preferred size, in vw (% of viewport width)
//     MAX  = largest size on huge screens, in pixels
//   Current values are HALF of AIDA's size. Bigger = bump all three numbers.
//   Examples:
//     clamp(87px, 7.2vw, 135px)  ← current (half of AIDA)
//     clamp(110px, 9vw, 170px)   ← ~30% bigger
//     clamp(140px, 11vw, 210px)  ← ~60% bigger
//
// MANUAL POSITION KNOBS
//   `right`  — keeps it anchored to AIDA's left edge. The 16px at the end is
//              the GAP between the worksheet and AIDA. Bump that for more space.
//   `bottom` — vertical position from the floor; matches AIDA's bottom.
// ───────────────────────────────────────────────────────────────────────────
//
// VISIBILITY
//   Auto-hides whenever the SAGE validator panel OR the worksheet popup is
//   open — so the floor sprite never bleeds through the modal text.
export function WorksheetIcon({ onClick, arenaAccent, arenaAccentGlow, hasDraft }: Props) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onValidatorOpen  = () => setHidden(true);
    const onValidatorClose = () => setHidden(false);
    const onWorksheetOpen  = () => setHidden(true);
    const onWorksheetClose = () => setHidden(false);
    window.addEventListener("validator-panel-open",  onValidatorOpen);
    window.addEventListener("validator-panel-close", onValidatorClose);
    window.addEventListener("worksheet-popup-open",  onWorksheetOpen);
    window.addEventListener("worksheet-popup-close", onWorksheetClose);
    return () => {
      window.removeEventListener("validator-panel-open",  onValidatorOpen);
      window.removeEventListener("validator-panel-close", onValidatorClose);
      window.removeEventListener("worksheet-popup-open",  onWorksheetOpen);
      window.removeEventListener("worksheet-popup-close", onWorksheetClose);
    };
  }, []);

  if (hidden) return null;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="fixed z-[100] flex items-end justify-center"
      style={{
        // ↓ horizontal: right of viewport, plus AIDA's width, plus tight gap = sits left of AIDA
        //   Keep the FIRST percentage in this calc identical to AIDA's `right`
        //   in AidaAssistant.tsx (currently 62%). Change the final `+ Xpx` to
        //   tune the gap between worksheet and AIDA.
        right:  "calc(53% + clamp(173px, 14.4vw, 269px) + 4px)",
        bottom: "20px",                                    // ← matches AIDA's bottom
        width:  "clamp(260px, 21.6vw, 404px)",             // ← SIZE knob: width  (2× original)
        height: "clamp(260px, 21.6vw, 404px)",             // ← SIZE knob: height (keep equal to width)
        background: "transparent",
        border:     "none",
        padding:    0,
        cursor:     "pointer",
        filter:     `drop-shadow(0 0 18px ${arenaAccentGlow})`,
      }}
      whileHover={{ y: -3, scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      aria-label="Open worksheet"
    >
      <img
        src="/worksheet-on-floor.png"
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
      {hasDraft && (
        <span
          className="absolute top-2 right-2 w-3 h-3 rounded-full"
          style={{ background: arenaAccent, boxShadow: `0 0 10px ${arenaAccentGlow}` }}
        />
      )}
    </motion.button>
  );
}

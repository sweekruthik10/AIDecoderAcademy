"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  amount:  number;
  visible: boolean;
  streak?: boolean;
}

export function XPFlash({ amount, visible, streak }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 0, scale: 0.8 }}
          animate={{ opacity: 1, y: -20, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.9 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none fixed bottom-28 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full font-display font-black text-sm"
          style={{
            background:  "rgba(200,255,0,0.15)",
            border:      "1px solid rgba(200,255,0,0.4)",
            color:       "#C8FF00",
            boxShadow:   "0 0 20px rgba(200,255,0,0.3)",
          }}
        >
          <span>⚡</span>
          <span>+{amount} XP</span>
          {streak && <span className="text-orange-400">🔥</span>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
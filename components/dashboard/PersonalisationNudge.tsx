"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "aida-personalisation-nudge-dismissed";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// One-time gentle nudge for existing users (created before personalisation
// fields existed) to fill in the new fields. Dismissible and remembered.
// Not shown to brand-new users (profile < 3 days old) — they're still onboarding.
export function PersonalisationNudge({ profile }: { profile: { learning_style?: string | null; created_at?: string | null } | null }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!profile) return;
    if (profile.learning_style) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
    if (profile.created_at && Date.now() - new Date(profile.created_at).getTime() < THREE_DAYS_MS) return;
    setShow(true);
  }, [profile]);

  if (!show) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[55] max-w-sm rounded-xl bg-[#161625] border border-[#7C3AED]/40 p-4 shadow-xl">
      <h4 className="font-display font-bold text-white mb-1">AIDA learned a few new tricks 🌟</h4>
      <p className="text-sm text-white/70 mb-3">
        Want to teach her how you like to learn? Takes about 30 seconds.
      </p>
      <div className="flex gap-2">
        <Link
          href="/dashboard/profile"
          className="px-3 py-1.5 rounded-lg bg-[#7C3AED] text-white text-sm font-bold"
        >
          Show me
        </Link>
        <button
          type="button"
          onClick={() => { localStorage.setItem(STORAGE_KEY, "1"); setShow(false); }}
          className="px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-sm hover:bg-white/10"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

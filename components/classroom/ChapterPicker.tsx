"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft, Loader2, BookOpen, FlaskConical, Leaf } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Chapter } from "@/types";

interface Props {
  onSelect: (chapter: Chapter) => void;
}

const NAVY = "#0f1c4d";
const GOLD = "#C8A84B";

const SUBJECT_ICONS: Record<string, React.ReactNode> = {
  Science:  <FlaskConical className="w-4 h-4" />,
  Maths:    <span className="text-sm font-black">∑</span>,
  Biology:  <Leaf className="w-4 h-4" />,
  Default:  <BookOpen className="w-4 h-4" />,
};

export function ChapterPicker({ onSelect }: Props) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [grouped,  setGrouped]  = useState<Record<string, Chapter[]>>({});
  const [loading,  setLoading]  = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/classroom/chapters")
      .then(r => r.json())
      .then(({ chapters: ch, grouped: gr }) => {
        setChapters(ch);
        setGrouped(gr);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} />
        <p className="text-xs font-mono" style={{ color: `${NAVY}60` }}>Loading chapters…</p>
      </div>
    );
  }

  if (chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <BookOpen className="w-8 h-8 opacity-30" style={{ color: NAVY }} />
        <p className="text-sm" style={{ color: `${NAVY}60` }}>No chapters available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Back to hub */}
      <button
        onClick={() => router.push("/dashboard")}
        className="flex items-center gap-1.5 text-xs font-mono mb-1 transition-opacity hover:opacity-100 opacity-50"
        style={{ color: NAVY }}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to Hub
      </button>

      {Object.entries(grouped).map(([subject, chs]) => {
        const SubjectIcon = SUBJECT_ICONS[subject] ?? SUBJECT_ICONS.Default;
        return (
          <div key={subject}>
            {/* Subject label */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: `rgba(200,168,75,0.15)`, color: GOLD }}>
                {SubjectIcon}
              </div>
              <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                {subject}
              </span>
              <div className="h-px flex-1" style={{ background: `rgba(200,168,75,0.2)` }} />
              <span className="text-[10px] font-mono" style={{ color: `${NAVY}40` }}>
                {chs.length} chapter{chs.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Chapter cards */}
            <div className="space-y-2">
              {chs.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => onSelect(ch)}
                  className="w-full text-left"
                >
                  <div
                    className="flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-200"
                    style={{
                      background: "rgba(255,255,255,0.88)",
                      border:     "1px solid rgba(255,255,255,0.7)",
                      boxShadow:  "0 2px 12px rgba(15,28,77,0.06)",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(15,28,77,0.12)";
                      (e.currentTarget as HTMLElement).style.transform  = "translateY(-1px)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(15,28,77,0.06)";
                      (e.currentTarget as HTMLElement).style.transform  = "translateY(0)";
                    }}
                  >
                    {/* Chapter number badge */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-mono font-black flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, #2563eb, #1a4db5)", color: "#fff", boxShadow: "0 2px 10px rgba(37,99,235,0.3)" }}
                    >
                      {ch.chapter_number}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-bold text-sm truncate" style={{ color: NAVY }}>
                        {ch.chapter_title}
                      </p>
                      <p className="text-[11px] mt-0.5 font-mono" style={{ color: `${NAVY}50` }}>
                        {ch.board} · Grade {ch.grade}
                      </p>
                    </div>

                    {/* Badges + chevron */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="hidden sm:flex items-center gap-1.5">
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.15)" }}>
                          MCQ
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                          style={{ background: `rgba(200,168,75,0.1)`, color: GOLD, border: `1px solid rgba(200,168,75,0.2)` }}>
                          Written
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4" style={{ color: `${NAVY}25` }} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

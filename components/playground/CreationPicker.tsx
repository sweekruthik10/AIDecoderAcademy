"use client";
import { useState, useEffect, useRef } from "react";
import { Search, X, Image, Mic, FileText, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Creation, OutputType } from "@/types";

interface Props {
  onSelect: (creation: Creation) => void;
  onClose:  () => void;
}

const TYPE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  text:   { icon: <FileText size={11}/>,    color: "text-blue-500 bg-blue-50",    label: "Text"   },
  json:   { icon: <FileText size={11}/>,    color: "text-amber-500 bg-amber-50",  label: "JSON"   },
  image:  { icon: <Image size={11}/>,       color: "text-green-500 bg-green-50",  label: "Image"  },
  audio:  { icon: <Mic size={11}/>,         color: "text-pink-500 bg-pink-50",    label: "Audio"  },
  slides: { icon: <LayoutTemplate size={11}/>, color: "text-purple-500 bg-purple-50", label: "Slides" },
};

export function CreationPicker({ onSelect, onClose }: Props) {
  const [creations, setCreations] = useState<Creation[]>([]);
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/creations")
      .then(r => r.json())
      .then(({ creations }) => {
        setCreations(creations ?? []);
        setLoading(false);
      });
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filtered = creations.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.prompt_used ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const getPreview = (c: Creation): string => {
    if (c.output_type === "image") return "Image attachment";
    if (c.output_type === "audio") {
      try { return JSON.parse(c.content)?.script?.narrator_text?.slice(0, 60) ?? "Audio scene"; } catch { return "Audio scene"; }
    }
    if (c.output_type === "slides") {
      try { return `${JSON.parse(c.content)?.sections?.length ?? 0} slide sections`; } catch { return "Slide deck"; }
    }
    return c.content.replace(/[#*`]/g, "").slice(0, 60);
  };

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-2xl shadow-xl border border-purple-100 z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-purple-100">
        <h3 className="text-sm font-black text-[#1a1a2e]">Add from My Creations</h3>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 transition-all">
          <X size={13}/>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-purple-50">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search your creations..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#6C47FF] focus:ring-2 focus:ring-purple-100 placeholder:text-slate-300"
          />
        </div>
      </div>

      {/* List */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2 p-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse"/>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">🎨</p>
            <p className="text-xs text-slate-400">
              {search ? "No creations match your search" : "No creations saved yet"}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map(c => {
              const meta = TYPE_META[c.output_type] ?? TYPE_META.text;
              return (
                <button
                  key={c.id}
                  onClick={() => { onSelect(c); onClose(); }}
                  className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-[#EEF0FF] transition-all text-left group"
                >
                  {/* Type icon */}
                  <span className={cn("flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5", meta.color)}>
                    {meta.icon}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-bold text-[#1a1a2e] truncate">{c.title}</span>
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0", meta.color)}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">{getPreview(c)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-purple-50 bg-slate-50">
        <p className="text-[10px] text-slate-400 text-center">
          Select a creation to add it to your prompt
        </p>
      </div>
    </div>
  );
}
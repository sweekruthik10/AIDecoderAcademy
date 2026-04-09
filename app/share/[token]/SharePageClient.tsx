"use client";
import { AudioPlayer, type AudioData } from "@/components/playground/AudioPlayer";
import { SlideCarousel, type SlideData } from "@/components/playground/SlideCarousel";
import type { Creation } from "@/types";

interface Creator {
  first_name:   string;
  avatar_emoji: string;
  active_arena: number;
}

interface Props {
  creation: Creation;
  creator:  Creator;
  token?:   string;
}

const ARENA_ACCENT: Record<number, string> = {
  1: "#7C3AED", 2: "#00D4FF", 3: "#FF6B2B",
  4: "#00FF94", 5: "#FF2D78", 6: "#C8FF00",
};

export function SharePageClient({ creation, creator }: Props) {
  const accent = ARENA_ACCENT[creator.active_arena] ?? "#7C3AED";

  // Render creation content
  function Preview() {
    const { output_type, content } = creation;
    if (output_type === "image" && /^https?:\/\//i.test(content.trim())) {
      return (
        <div className="rounded-2xl overflow-hidden border border-white/[0.1] w-full"
          style={{ boxShadow: `0 0 40px ${accent}30` }}>
          <img src={content.trim()} alt={creation.title} className="w-full object-cover max-h-[480px]"/>
        </div>
      );
    }
    if (output_type === "audio") {
      try {
        const data = JSON.parse(content) as AudioData;
        if (data?.url) return <div className="w-full"><AudioPlayer data={data}/></div>;
      } catch { /* fall through */ }
    }
    if (output_type === "slides") {
      try {
        const data = JSON.parse(content) as SlideData;
        if (data?.sections) return <div className="w-full"><SlideCarousel data={data}/></div>;
      } catch { /* fall through */ }
    }
    return (
      <div className="w-full rounded-2xl p-6 border border-white/[0.08]"
        style={{ background: "rgba(255,255,255,0.03)" }}>
        <p className="text-white/75 leading-relaxed whitespace-pre-wrap text-sm">{content}</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display font-black text-2xl sm:text-3xl text-white leading-tight">
          {creation.title}
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xl">{creator.avatar_emoji}</span>
          <span className="text-sm text-white/50">
            Created by <span className="font-bold" style={{ color: accent }}>{creator.first_name}</span>
          </span>
        </div>
      </div>

      {/* Tags */}
      {creation.tags && creation.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {creation.tags.map(tag => (
            <span key={tag} className="px-3 py-1 rounded-full text-xs font-bold border border-white/[0.1] text-white/40"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Creation content */}
      <Preview />

      {/* CTA */}
      <div className="rounded-2xl p-6 border text-center mt-2"
        style={{
          background: `linear-gradient(135deg, ${accent}18, rgba(15,15,26,0.9))`,
          borderColor: `${accent}30`,
        }}>
        <p className="text-white/60 text-sm mb-3">
          Want to create your own AI stories, images and more?
        </p>
        <a href="/auth/sign-up"
          className="inline-flex items-center gap-2 font-display font-black text-sm px-6 py-3 rounded-xl text-white transition-all hover:scale-[1.03] active:scale-95"
          style={{ background: accent, boxShadow: `0 0 24px ${accent}50` }}>
          Join AI Decoder Academy 🚀
        </a>
      </div>

    </div>
  );
}

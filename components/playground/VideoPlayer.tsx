"use client";

import { useState } from "react";
import { Download, Play } from "lucide-react";

interface VideoPayload {
  videoUrl:        string;
  title?:          string;
  durationSeconds?: number;
  shotCount?:      number;
  modelUsed?:      string;
  jobId?:          string;
}

interface Props {
  payload:         VideoPayload;
  arenaAccent?:    string;
  arenaAccentGlow?: string;
}

export default function VideoPlayer({ payload, arenaAccent = "#7C3AED", arenaAccentGlow = "rgba(124,58,237,0.4)" }: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(payload.videoUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(payload.title ?? "aida-video").replace(/[^a-z0-9-_]+/gi, "_")}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(payload.videoUrl, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  const durationStr = payload.durationSeconds
    ? `${Math.round(payload.durationSeconds)}s`
    : null;

  return (
    <div className="w-full max-w-md">
      {payload.title && (
        <div className="mb-2 flex items-center gap-2">
          <Play size={14} style={{ color: arenaAccent }} />
          <span className="text-[13px] font-semibold text-white/90 truncate">{payload.title}</span>
        </div>
      )}

      <div
        className="relative rounded-xl overflow-hidden bg-black/40 border border-white/10"
        style={{ boxShadow: `0 0 40px ${arenaAccentGlow}` }}
      >
        <video
          src={payload.videoUrl}
          controls
          playsInline
          preload="metadata"
          className="w-full block"
          style={{ maxHeight: 320 }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-white/55">
        <div className="flex items-center gap-2">
          {durationStr && <span>{durationStr}</span>}
          {payload.shotCount ? <span>· {payload.shotCount} scenes</span> : null}
          {payload.modelUsed ? <span className="truncate max-w-[140px]">· {payload.modelUsed}</span> : null}
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
          style={{ color: arenaAccent }}
          title="Download MP4"
        >
          <Download size={13} />
          <span>{downloading ? "Downloading…" : "Download"}</span>
        </button>
      </div>
    </div>
  );
}

import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Node runtime: lets us read the watermark from disk reliably.
// edgeSupabase() below does NOT import next/headers, so Node runtime is fine.
export const runtime = "nodejs";

// Lightweight Supabase client (no next/headers dependency)
function edgeSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

// Read watermark once from disk and cache it as a base64 data URI
let _watermarkDataUri: string | null = null;
function getWatermarkDataUri(): string | null {
  if (_watermarkDataUri !== undefined && _watermarkDataUri !== null) return _watermarkDataUri;
  try {
    const filePath = path.join(process.cwd(), "public", "creations", "watermark.png");
    const buf = fs.readFileSync(filePath);
    _watermarkDataUri = `data:image/png;base64,${buf.toString("base64")}`;
    console.log("[og] watermark loaded, bytes:", buf.length);
    return _watermarkDataUri;
  } catch (err) {
    console.error("[og] watermark load failed:", err);
    _watermarkDataUri = null;
    return null;
  }
}

const ARENA_COLORS: Record<number, { accent: string; dim: string }> = {
  1: { accent: "#7C3AED", dim: "#1a0b3b" },
  2: { accent: "#00D4FF", dim: "#011f2e" },
  3: { accent: "#FF6B2B", dim: "#2e1100" },
  4: { accent: "#00FF94", dim: "#002b1a" },
  5: { accent: "#FF2D78", dim: "#2b0017" },
  6: { accent: "#C8FF00", dim: "#1e2800" },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const supabase = edgeSupabase();
  const { data: creation } = await supabase
    .from("creations")
    .select("title, output_type, content, tags, profile_id")
    .eq("share_token", token)
    .eq("is_public", true)
    .single();

  if (!creation) {
    return new Response("Not found", { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_emoji, active_arena")
    .eq("id", creation.profile_id)
    .single();

  const firstName   = (profile?.display_name ?? "A student").split(" ")[0];
  const avatarEmoji = profile?.avatar_emoji ?? "🎓";
  const arenaId     = profile?.active_arena ?? 1;
  const colors      = ARENA_COLORS[arenaId] ?? ARENA_COLORS[1];

  // Get a preview image URL for image-type creations
  const isImage   = creation.output_type === "image" && /^https?:\/\//i.test(creation.content.trim());
  const imageUrl  = isImage ? creation.content.trim() : null;

  // Preview text for non-image types
  let previewText = "";
  if (!isImage) {
    try {
      if (creation.output_type === "audio") {
        const d = JSON.parse(creation.content);
        previewText = d?.script?.narrator_text ?? "";
      } else if (creation.output_type === "slides") {
        const d = JSON.parse(creation.content);
        previewText = (d?.sections ?? []).map((s: { title: string }) => s.title).join("  ·  ");
      } else {
        previewText = creation.content.replace(/[#*`_~]/g, "").slice(0, 160);
      }
    } catch {
      previewText = creation.content.slice(0, 160);
    }
  }

  const outputLabel: Record<string, string> = {
    image:  "🖼 Image",
    audio:  "🎙 Audio",
    slides: "📊 Slides",
    text:   "✍️ Story",
    json:   "{ } Data",
    video:  "🎬 Video",
  };
  const typeLabel = outputLabel[creation.output_type] ?? "AI Creation";

  // Watermark — read directly from disk (Node runtime)
  const watermarkDataUri = getWatermarkDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex", flexDirection: "column",
          width: "100%", height: "100%",
          background: `linear-gradient(160deg, ${colors.dim} 0%, #0a0a14 50%, #06060f 100%)`,
          position: "relative", fontFamily: "sans-serif", overflow: "hidden",
        }}
      >
        {/* Accent corner glow — top-left */}
        <div style={{
          position: "absolute", top: -120, left: -120,
          width: 500, height: 500, borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.accent}30 0%, ${colors.accent}08 45%, transparent 70%)`,
        }}/>

        {/* Subtle dot grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `radial-gradient(circle, ${colors.accent}22 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          opacity: 0.5,
        }}/>

        {/* ── TOP BAR ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "36px 52px 0",
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: colors.accent,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                width: 20, height: 20,
                background: "#08080F",
                borderRadius: 4,
                display: "flex",
              }}/>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: "#ffffff", letterSpacing: -0.5 }}>AI</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: colors.accent, letterSpacing: -0.5 }}>Decoder</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: "#ffffff", letterSpacing: -0.5, marginLeft: 6 }}>Academy</span>
            </div>
          </div>

          {/* Type pill */}
          <div style={{
            display: "flex", alignItems: "center",
            padding: "8px 20px", borderRadius: 24,
            background: `${colors.accent}20`,
            border: `1.5px solid ${colors.accent}60`,
            fontSize: 15, fontWeight: 700, color: colors.accent,
          }}>
            {typeLabel}
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{
          display: "flex", flex: 1,
          padding: "28px 52px 28px",
          gap: 40,
        }}>
          {isImage && imageUrl ? (
            /* Image fills the content area */
            <div style={{
              display: "flex", flex: 1,
              borderRadius: 20, overflow: "hidden",
              border: `2px solid ${colors.accent}30`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={creation.title}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
            </div>
          ) : (
            /* Text / audio / slides — show title + preview */
            <div style={{
              display: "flex", flex: 1, flexDirection: "column", justifyContent: "center",
              borderRadius: 20, padding: "36px 44px",
              background: `${colors.accent}0d`,
              border: `1.5px solid ${colors.accent}25`,
            }}>
              <div style={{
                fontSize: 52, fontWeight: 900, color: "#ffffff",
                lineHeight: 1.1, letterSpacing: -2, marginBottom: 20,
              }}>
                {creation.title}
              </div>
              {previewText && (
                <div style={{
                  fontSize: 22, color: "rgba(255,255,255,0.5)",
                  lineHeight: 1.55, fontWeight: 400,
                }}>
                  {previewText.length > 140 ? previewText.slice(0, 137) + "…" : previewText}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── BOTTOM BAR ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 52px 36px",
        }}>
          {/* Left: title (image only) + creator */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {isImage && (
              <div style={{
                fontSize: 28, fontWeight: 900, color: "#ffffff", letterSpacing: -0.8,
              }}>
                {creation.title}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Avatar dot */}
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: `${colors.accent}25`,
                border: `2px solid ${colors.accent}60`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
              }}>
                {avatarEmoji}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>Made by</span>
                <span style={{ fontSize: 16, color: "#ffffff", fontWeight: 800 }}>{firstName}</span>
              </div>
            </div>
          </div>

          {/* Right: domain + watermark */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.25)", fontWeight: 600 }}>
              ai-decoder.academy
            </span>
            {watermarkDataUri && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={watermarkDataUri} alt="" style={{ width: 48, height: 48, opacity: 0.55 }}/>
            )}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

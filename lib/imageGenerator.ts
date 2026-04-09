const STYLE_SUFFIX = `

GLOBAL STYLE LOCK:
- Art style: vibrant 2D animation — Pixar and Studio Ghibli inspired, expressive cartoon characters, clean bold ink outlines, warm saturated colors
- Lighting: warm golden-hour light, soft shadows, bright and inviting atmosphere
- Color palette: warm amber and soft teal, rich but cheerful
- Backgrounds: detailed painted backgrounds in Ghibli style
- DO NOT use photorealism or 3D rendering — strictly 2D illustration style`;

const NEGATIVE_PROMPT = "photorealistic, 3D render, blurry, low quality, distorted faces, extra limbs, watermark, text overlay, wide-angle shot where characters appear tiny";

// ─── Comic / panel intent ─────────────────────────────────────────────────────
//
// When the prompt mentions a comic strip / panels / frames, we must explicitly
// instruct flux-pro on (a) the panel layout and (b) character consistency
// across panels — otherwise the model often produces a single illustration or
// drops the character between panels. This is the OBJ 10 deliverable.
//
// We detect "comic", "panel", "panels", "strip", "frames", or an explicit
// integer like "3-panel" / "three panels". If detected we also try to read the
// panel count (default: 3) so we can name it in the layout instruction.

const COMIC_KEYWORDS_RE = /\b(comic\s+strip|comic|panels?|frames?|comic\s+book)\b/i;

function detectPanelCount(prompt: string): number | null {
  // "3-panel", "3 panel", "three-panel", "three panels"
  const digit = prompt.match(/\b(\d+)\s*[-\s]?\s*panels?\b/i);
  if (digit) return Math.min(6, Math.max(2, parseInt(digit[1], 10)));
  const word  = prompt.match(/\b(two|three|four|five|six)\s*[-\s]?\s*panels?\b/i);
  if (word) {
    const map: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6 };
    return map[word[1].toLowerCase()] ?? null;
  }
  return null;
}

function isComicPrompt(prompt: string): boolean {
  return COMIC_KEYWORDS_RE.test(prompt);
}

// Layout PREFIX — diffusion models read the first ~40 words most strongly,
// so the panel structure goes at the FRONT. Tested 2026-05-11: flux-pro/v1.1
// reliably produces 3 separated panels with this opener and ignores it when
// placed as a suffix.
function buildComicPrefix(prompt: string): string {
  const n = detectPanelCount(prompt) ?? 3;
  return `A horizontal comic strip divided into exactly ${n} equal panels arranged left to right, separated by thick black vertical gutters, panels labelled "PANEL 1"${n >= 2 ? `, "PANEL 2"` : ""}${n >= 3 ? `, "PANEL 3"` : ""}${n >= 4 ? `, … through "PANEL ${n}"` : ""} in small yellow boxes in the top-left of each panel. The same main character appears VISUALLY IDENTICAL in every panel — same face, hairstyle, clothing, and colour palette throughout. `;
}

function buildComicSuffix(prompt: string): string {
  const n = detectPanelCount(prompt) ?? 3;
  return `

COMIC STRIP DELIVERY NOTES:
- ${n}-panel horizontal layout, equal widths, ~6px thick black gutters
- Each panel shows ONE clear moment: panel 1 setup, ${n === 3 ? "panel 2 twist, panel 3 punchline" : `middle panels build, panel ${n} is the punchline / reveal`}
- Dialogue / captions in clean speech bubbles or panel captions — keep text short and legible
- Wide landscape composition (16:9) — fill the WHOLE frame, NOT a single centred illustration`;
}

// ─── Intent detection — keywords that should NOT get animation style ──────────

const NO_STYLE_KEYWORDS = [
  // Logos & brands
  "logo", "brand", "icon", "emblem", "badge", "symbol",
  // Flags & maps
  "flag", "map", "geography", "country", "nation",
  // Diagrams & charts
  "diagram", "chart", "graph", "flowchart", "infographic", "timeline",
  "table", "schedule", "blueprint", "schematic", "wireframe",
  // Real objects & places
  "photograph", "photo", "realistic", "real", "actual",
  // UI / tech
  "screenshot", "interface", "ui", "ux", "app screen",
  // Specific real-world things kids might ask for
  "periodic table", "solar system", "anatomy", "skeleton", "cell diagram",
];

function shouldApplyStyle(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return !NO_STYLE_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── Build the final prompt ───────────────────────────────────────────────────

function buildPrompt(prompt: string, forceStyle?: boolean): string {
  const apply = forceStyle !== undefined ? forceStyle : shouldApplyStyle(prompt);
  const comic = isComicPrompt(prompt);
  let out = prompt.trim();
  if (comic) out = buildComicPrefix(out) + out;     // layout PREFIX wins attention
  if (apply) out += STYLE_SUFFIX;
  if (comic) out += buildComicSuffix(out);
  return out;
}

// ─── fal.ai configs ───────────────────────────────────────────────────────────

const FAL_CONFIGS: Record<string, { endpoint: string; fallback?: string; payload: Record<string, unknown> }> = {
  "fal-flux2pro": {
    endpoint: "fal-ai/flux-pro/v1.1",
    payload: {
      image_size: "landscape_16_9",
      output_format: "png",
      num_inference_steps: 28,
    },
  },
  "fal-img2img": {
    endpoint: "fal-ai/flux-pro/v1.1/redux",
    payload: {
      image_size: "landscape_16_9",
      output_format: "png",
      num_inference_steps: 28,
    },
  },
  "fal-juggernaut": {
    endpoint: "rundiffusion-fal/juggernaut-flux/pro",
    fallback: "fal-ai/flux-pro/v1.1",
    payload: {
      image_size: "landscape_16_9",
      num_inference_steps: 28,
      guidance_scale: 3.5,
      output_format: "png",
      negative_prompt: NEGATIVE_PROMPT,
    },
  },
  // Imagen 4 — best in-class for text rendering inside generated images.
  // Used automatically when comic intent is detected so dialogue lands.
  "imagen4": {
    endpoint: "fal-ai/imagen4/preview",
    fallback: "fal-ai/flux-pro/v1.1",
    payload: {
      aspect_ratio: "16:9",
      num_images:   1,
    },
  },
};

export type ImageModel = "fal-flux2pro" | "fal-juggernaut" | "imagen4" | "gpt-image-1";

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function generateFal(prompt: string, model: ImageModel, imageUrl?: string): Promise<Buffer> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error("FAL_KEY not set");

  const cfg     = FAL_CONFIGS[model] ?? FAL_CONFIGS["fal-flux2pro"];
  const headers = { "Authorization": `Key ${falKey}`, "Content-Type": "application/json" };
  const clean   = prompt.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();

  let resp: Response | null = null;
  // Use dedicated img2img endpoint when a source image is provided
  const img2imgCfg = FAL_CONFIGS["fal-img2img"];
  let endpoint = imageUrl ? img2imgCfg.endpoint : cfg.endpoint;
  const activePayload = imageUrl ? img2imgCfg.payload : cfg.payload;

  for (let i = 0; i < 3; i++) {
    try {
      const body: Record<string, unknown> = { prompt: clean, ...activePayload };
      if (imageUrl) {
        // flux-pro/v1.1/redux uses image_url for the reference image
        body.image_url = imageUrl;
        body.strength  = 0.8; // how much to follow the prompt vs preserve original
      }
      resp = await fetch(`https://queue.fal.run/${endpoint}`, {
        method: "POST", headers,
        body: JSON.stringify(body),
      });
      if (resp.status < 500) break;
      await sleep(2 ** i * 1000);
    } catch { await sleep(2 ** i * 1000); }
  }

  if ((!resp || resp.status >= 500) && cfg.fallback) {
    endpoint = cfg.fallback;
    const fallbackBody: Record<string, unknown> = { prompt: clean, ...FAL_CONFIGS["fal-flux2pro"].payload };
    if (imageUrl) { fallbackBody.image_url = imageUrl; fallbackBody.strength = 0.75; }
    resp = await fetch(`https://queue.fal.run/${endpoint}`, {
      method: "POST", headers,
      body: JSON.stringify(fallbackBody),
    });
  }

  if (!resp || !resp.ok) throw new Error(`fal.ai submit failed: ${resp?.status}`);

  const result = await resp.json();

  if (result.images?.[0]?.url) return downloadBuffer(result.images[0].url);

  const { status_url, response_url } = result;
  if (!status_url) throw new Error("No status_url from fal.ai");

  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const s = await (await fetch(status_url, { headers })).json();
    if (s.status === "COMPLETED") {
      const final = await (await fetch(response_url, { headers })).json();
      if (final.error) throw new Error(`fal.ai model error: ${final.error}`);
      const url = final.images?.[0]?.url;
      if (url) return downloadBuffer(url);
      throw new Error("No image URL in completed response");
    }
    if (s.status === "FAILED") throw new Error(`fal.ai job failed: ${s.error ?? "unknown"}`);
  }
  throw new Error("fal.ai timed out");
}

async function generateOpenAI(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", quality: "low", n: 1 }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message ?? "OpenAI image failed");

  const img = data.data?.[0];
  if (img?.url)      return downloadBuffer(img.url);
  if (img?.b64_json) return Buffer.from(img.b64_json, "base64");
  throw new Error("No image data from OpenAI");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateImage(
  prompt: string,
  model: ImageModel = "fal-flux2pro",
  applyStyle = true,
  imageUrl?: string,         // if provided, do image-to-image refinement
): Promise<Buffer> {
  // Intent detection always wins over the caller's applyStyle flag
  // Exception: if caller explicitly passes false, always skip style
  const finalPrompt = applyStyle
    ? buildPrompt(prompt)     // smart detection
    : prompt.trim();          // caller said no style

  // Comic intent → auto-upgrade to Imagen 4 for the dialogue text rendering.
  // flux-pro/v1.1 produces good panels but garbles small text in speech
  // bubbles; Imagen 4 nails spelling. Only do this when img2img isn't active
  // (Imagen 4 doesn't support a reference image).
  let routedModel = model;
  if (model === "fal-flux2pro" && !imageUrl && isComicPrompt(prompt)) {
    routedModel = "imagen4";
  }

  console.log(`[imageGenerator] style=${applyStyle && shouldApplyStyle(prompt)} model=${routedModel}${routedModel !== model ? ` (routed from ${model})` : ""}`);
  console.log(`[imageGenerator] prompt: ${finalPrompt.slice(0, 120)}...`);

  if (routedModel === "gpt-image-1") return generateOpenAI(finalPrompt);
  return generateFal(finalPrompt, routedModel, imageUrl);
}
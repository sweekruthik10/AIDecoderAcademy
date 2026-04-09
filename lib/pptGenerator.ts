// TypeScript port of colleague's ppt_generator.py using pptxgenjs
// Maintains identical slide structure: title → section overview → scene slides

import PptxGenJS from "pptxgenjs";

// ─── Types (mirrors colleague's Python dicts) ──────────────────────────────

export interface Scene {
  scene_id:     string;
  scene_goal:   string;
  image_prompt?: string; // used by generate-ppt route to build the fal.ai prompt
  imageBase64?:  string; // base64 PNG — embedded into slide
}

export interface Section {
  id?:      string;
  title:    string;
  concepts: string[];
  scenes:   Scene[];
}

export interface PPTInput {
  title:       string;
  subject?:    string;
  class_level?: string;
  sections:    Section[];
}

// ─── Colors (matches colleague's defaults) ─────────────────────────────────

const HEADER_COLOR    = "1a1a2e"; // dark navy (replaces black)
const HEADER_TEXT     = "FFFFFF";
const TITLE_COLOR     = "6C47FF"; // our purple brand
const ACCENT_COLOR    = "EEF0FF";
const BODY_TEXT       = "334155";
const SLIDE_BG        = "F5F6FF";

// ─── Main generator ────────────────────────────────────────────────────────

export async function generatePPT(input: PPTInput): Promise<Buffer> {
  const pptx = new PptxGenJS();

  // Slide dimensions — widescreen 10×5.625 inches (16:9)
  pptx.layout = "LAYOUT_16x9";
  pptx.title  = input.title;

  // 1. Title slide
  addTitleSlide(pptx, input);

  // 2. Section slides + scene slides
  for (const section of input.sections) {
    addSectionSlide(pptx, section);
    const sorted = [...section.scenes].sort(
      (a, b) => parseSceneNum(a.scene_id) - parseSceneNum(b.scene_id)
    );
    for (let i = 0; i < sorted.length; i++) {
      addSceneSlide(pptx, sorted[i], i);
    }
  }

  // Return as Buffer
  const result = await (pptx.write as (t: string) => Promise<unknown>)("nodebuffer");
  return Buffer.from(result as ArrayBuffer);
}

// ─── Slide builders ────────────────────────────────────────────────────────

function addTitleSlide(pptx: PptxGenJS, input: PPTInput) {
  const slide = pptx.addSlide();
  slide.background = { color: SLIDE_BG };

  // Purple accent bar at top
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: 0.08,
    fill: { color: TITLE_COLOR },
    line: { color: TITLE_COLOR },
  });

  // Purple accent bar at bottom
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 5.545, w: "100%", h: 0.08,
    fill: { color: TITLE_COLOR },
    line: { color: TITLE_COLOR },
  });

  // Main title
  slide.addText(input.title, {
    x: 0.8, y: 1.6, w: 8.4, h: 1.4,
    fontSize: 40,
    bold: true,
    color: HEADER_COLOR,
    align: "center",
    fontFace: "Arial",
  });

  // Subject + class badges
  const meta = [input.subject, input.class_level].filter(Boolean).join("  ·  ");
  if (meta) {
    slide.addText(meta, {
      x: 0.8, y: 3.2, w: 8.4, h: 0.5,
      fontSize: 20,
      color: TITLE_COLOR,
      align: "center",
      fontFace: "Arial",
    });
  }

  // Powered by badge
  slide.addText("Created with AI Decoder Academy", {
    x: 0.8, y: 4.8, w: 8.4, h: 0.4,
    fontSize: 12,
    color: "94A3B8",
    align: "center",
    fontFace: "Arial",
  });
}

function addSectionSlide(pptx: PptxGenJS, section: Section) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  // Left purple accent strip
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.12, h: "100%",
    fill: { color: TITLE_COLOR },
    line: { color: TITLE_COLOR },
  });

  // Light purple background panel
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.12, y: 0, w: "100%", h: "100%",
    fill: { color: ACCENT_COLOR },
    line: { color: ACCENT_COLOR },
  });

  // Section title
  slide.addText(section.title, {
    x: 0.6, y: 1.0, w: 8.8, h: 1.2,
    fontSize: 34,
    bold: true,
    color: HEADER_COLOR,
    fontFace: "Arial",
  });

  // Divider line
  slide.addShape(pptx.ShapeType.line, {
    x: 0.6, y: 2.4, w: 8.0, h: 0,
    line: { color: TITLE_COLOR, width: 2 },
  });

  // Concept bullets
  if (section.concepts.length > 0) {
    slide.addText("Key concepts", {
      x: 0.6, y: 2.7, w: 8.0, h: 0.4,
      fontSize: 14,
      bold: true,
      color: TITLE_COLOR,
      fontFace: "Arial",
    });

    const bullets = section.concepts.slice(0, 6).map(c => ({
      text: c,
      options: { bullet: { type: "bullet" as const }, fontSize: 18, color: BODY_TEXT, fontFace: "Arial" },
    }));
    slide.addText(bullets, {
      x: 0.6, y: 3.2, w: 8.8, h: 2.0,
    });
  }
}

function addSceneSlide(pptx: PptxGenJS, scene: Scene, index: number) {
  const slide = pptx.addSlide();
  slide.background = { color: "000000" };

  const HEADER_H = 0.85; // inches — matches colleague's 14% of 7.5in height

  // Dark header bar (full width)
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: HEADER_H,
    fill: { color: HEADER_COLOR },
    line: { color: HEADER_COLOR },
  });

  // Header text — "Scene goal: ..."
  slide.addText(`Scene goal: ${scene.scene_goal}`, {
    x: 0.2, y: 0.1, w: 9.2, h: HEADER_H - 0.15,
    fontSize: 18,
    bold: true,
    color: HEADER_TEXT,
    fontFace: "Arial",
    valign: "middle",
  });

  // Scene image — full bleed below header
  if (scene.imageBase64) {
    slide.addImage({
      data: `image/png;base64,${scene.imageBase64}`,
      x: 0,
      y: HEADER_H,
      w: "100%",
      h: 5.625 - HEADER_H,
    });
  } else {
    // Placeholder if no image
    slide.addText(`Scene ${index + 1} — image not available`, {
      x: 0, y: HEADER_H, w: "100%", h: 5.625 - HEADER_H,
      fontSize: 16,
      color: "666666",
      align: "center",
      valign: "middle",
      fontFace: "Arial",
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseSceneNum(id: string): number {
  const m = id.match(/S(\d+)/i);
  return m ? parseInt(m[1]) : 0;
}
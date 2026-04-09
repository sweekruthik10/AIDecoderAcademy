// Worksheet extraction for staged objectives (currently OBJ 10).
//
// We accept two upload formats from students:
//   - .docx → mammoth.extractRawText → plain text string
//   - .pdf  → fetched as ArrayBuffer → passed to OpenAI as a file_id input
//             (OpenAI's models read PDF text + visuals natively).
//
// We deliberately do NOT support legacy .doc — modern Word, Google Docs,
// Pages, LibreOffice all save .docx by default since 2007. Adding a
// LibreOffice runtime to support .doc would balloon the deploy.

import mammoth from "mammoth";
import OpenAI from "openai";
import type { CanvasFields, StoryItFields } from "@/lib/obj10Rubric";

export type WorksheetFormat = "docx" | "pdf";

export interface WorksheetExtractInput {
  url:    string;            // public Supabase URL of the uploaded file
  format: WorksheetFormat;
}

// What the validate route gets back. Either:
//   - kind: "text"     — raw extracted text (for .docx)
//   - kind: "openaiFile" — OpenAI file_id you can attach to a chat message
//                          (for .pdf, since that gets visuals + text)
export type WorksheetExtractResult =
  | { kind: "text";       text: string }
  | { kind: "openaiFile"; fileId: string; filename: string };

export function detectWorksheetFormat(filename: string): WorksheetFormat | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "docx") return "docx";
  if (ext === "pdf")  return "pdf";
  return null;
}

// ─── DOCX → plain text (server-side, mammoth) ───────────────────────────────

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch worksheet: ${res.status}`);
  const ab  = await res.arrayBuffer();
  return Buffer.from(ab);
}

export async function extractDocxText(url: string): Promise<string> {
  const buffer = await fetchAsBuffer(url);
  const { value } = await mammoth.extractRawText({ buffer });
  // mammoth occasionally returns trailing whitespace / weird newlines;
  // tighten without losing paragraph structure.
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── PDF → upload to OpenAI Files API (multimodal-ready) ────────────────────

export async function uploadPdfToOpenAI(
  url:      string,
  filename: string,
  openai:   OpenAI,
): Promise<{ fileId: string; filename: string }> {
  const buffer = await fetchAsBuffer(url);
  // OpenAI SDK's `openai.files.create()` takes a File-like or a stream.
  // In Node runtime we wrap the buffer in a File polyfill that the SDK
  // understands. The Node 20+ global File constructor works.
  const file = new File([new Uint8Array(buffer)], filename, { type: "application/pdf" });
  const created = await openai.files.create({
    file,
    purpose: "user_data",   // intended for model inputs (vision/text reading)
  });
  return { fileId: created.id, filename };
}

// ─── Top-level dispatch ─────────────────────────────────────────────────────

export async function extractWorksheet(
  input:  WorksheetExtractInput,
  openai: OpenAI,
  filename: string,
): Promise<WorksheetExtractResult> {
  if (input.format === "docx") {
    const text = await extractDocxText(input.url);
    return { kind: "text", text };
  }
  if (input.format === "pdf") {
    const { fileId } = await uploadPdfToOpenAI(input.url, filename, openai);
    return { kind: "openaiFile", fileId, filename };
  }
  throw new Error(`Unsupported worksheet format: ${input.format}`);
}

// ─── Inline-form path (WorksheetPopup → typed answers) ──────────────────────
// The kid's typed answers arrive as a flat key/value map. The worksheet
// schema in lib/worksheetSchemas.ts lays out the expected ids; we project
// them straight into the OBJ 10 shape the validator already grades. No LLM
// extraction needed.

export interface InlineExtractResult {
  canvas:     CanvasFields;
  storyIt:    StoryItFields;
  confidence: "high";        // by definition — student typed these directly
  missing:    string[];      // dotted-names of any blank required fields
}

export function extractFromInlineForm(data: Record<string, string | boolean>): InlineExtractResult {
  const s = (id: string): string  => (typeof data[id] === "string" ? (data[id] as string).trim() : "");
  const b = (id: string): boolean => data[id] === true;

  const canvas: CanvasFields = {
    intent:      s("intent"),
    assumptions: s("assumptions"),
    audience:    s("audience"),
    success:     s("success"),
  };
  const storyIt: StoryItFields = {
    oneSentenceStory: s("oneSentenceStory"),
    panels: [
      { imagePrompt: s("panel1Image"), dialogue: s("panel1Dialogue") },
      { imagePrompt: s("panel2Image"), dialogue: s("panel2Dialogue") },
      { imagePrompt: s("panel3Image"), dialogue: s("panel3Dialogue") },
    ],
    funnyTestPassed: b("funnyTestPassed"),
  };

  const missing: string[] = [];
  if (!canvas.intent)              missing.push("canvas.intent");
  if (!canvas.assumptions)         missing.push("canvas.assumptions");
  if (!canvas.audience)            missing.push("canvas.audience");
  if (!canvas.success)             missing.push("canvas.success");
  if (!storyIt.oneSentenceStory)   missing.push("storyIt.oneSentenceStory");
  storyIt.panels.forEach((p, i) => {
    if (!p.imagePrompt) missing.push(`storyIt.panel${i + 1}.imagePrompt`);
  });

  return { canvas, storyIt, confidence: "high", missing };
}

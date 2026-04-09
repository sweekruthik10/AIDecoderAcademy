/**
 * annotateAnswerSheet.ts
 *
 * Teacher-style annotation for CBSE written answer sheets using AWS Textract:
 *   1. Textract DetectDocumentText → locates question number markers (1), 2), Q1 etc.)
 *      with pixel-perfect bounding boxes
 *   2. Column auto-detected from marker x-position (left <45% = left col, else right col)
 *   3. sharp + SVG draws:
 *      - Asymmetric ✓ tick (short first leg, long sweeping second leg) for correct/partial
 *      - Red ✗ cross for zero-score answers
 *      - Circled score at right edge of the column
 *      - Correct answer hint written above wrong/partial answers in red
 *      - Red underline under the student's answer block for wrong/partial answers
 *      - Total score circle top-right of first page
 */

import sharp  from "sharp";
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import type { Block } from "@aws-sdk/client-textract";
import { createAdminClient } from "./supabase";

const RED = "#cc0000";

// ── Singleton Textract client ─────────────────────────────────────────────────
let _textract: TextractClient | null = null;
function getTextract(): TextractClient {
  if (!_textract) {
    _textract = new TextractClient({
      region:      process.env.AWS_REGION ?? "us-east-1",
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _textract;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type AnswerColumn = "left" | "right" | "full";

interface BBox { left: number; top: number; width: number; height: number; }

interface AnnotationData {
  q:          number;
  markerBbox: BBox;        // Textract bounding box of the question number marker
  column:     AnswerColumn;
  score:      number;
  max:        number;
}

// ── Check if a Textract word text is a question number marker ─────────────────
function isQuestionMarker(wordText: string, qNum: number): boolean {
  const t = wordText.trim();
  const n = String(qNum);
  return (
    t === `${n})`  ||
    t === `${n}.`  ||
    t === `Q${n}`  ||
    t === `q${n}`  ||
    t === `(${n})` ||
    t === n
  );
}

// ── Step 1: Textract → locate question markers with exact bounding boxes ───────
async function textractLocateQuestions(
  imgBuffer:       Buffer,
  questionNumbers: Array<{ number: number; marks: number }>,
): Promise<Map<number, { bbox: BBox; column: AnswerColumn }>> {
  const result = await getTextract().send(new DetectDocumentTextCommand({
    Document: { Bytes: imgBuffer },
  }));

  const wordBlocks = (result.Blocks ?? []).filter(b => b.BlockType === "WORD");
  console.log(`[annotate] Textract: ${wordBlocks.length} words`);

  const found = new Map<number, { bbox: BBox; column: AnswerColumn }>();

  for (const { number: qNum } of questionNumbers) {
    const match = wordBlocks.find(w => isQuestionMarker(w.Text ?? "", qNum));
    if (!match?.Geometry?.BoundingBox) {
      console.warn(`[annotate] Q${qNum} marker not found in Textract`);
      continue;
    }

    const bb  = match.Geometry.BoundingBox;
    const bbox: BBox = {
      left:   bb.Left!,
      top:    bb.Top!,
      width:  bb.Width!,
      height: bb.Height!,
    };

    // Determine column from marker's horizontal position
    const markerMidX = bb.Left! + bb.Width! / 2;
    const column: AnswerColumn = markerMidX < 0.45 ? "left" : "right";

    console.log(`[annotate] Q${qNum} marker → bbox: left=${bbox.left.toFixed(3)} top=${bbox.top.toFixed(3)} col=${column}`);
    found.set(qNum, { bbox, column });
  }

  return found;
}

// ── Step 2: Build SVG overlay ─────────────────────────────────────────────────
function buildSvgOverlay(
  width:       number,
  height:      number,
  annotations: AnnotationData[],
  totalScore:  number,
  totalMax:    number,
  isFirstPage: boolean,
): string {
  const elements: string[] = [];

  // ── Total score circle — top-right of first page ──────────────────────────
  if (isFirstPage) {
    const tx = width - 95;
    const ty = 85;
    elements.push(`
      <ellipse cx="${tx}" cy="${ty}" rx="65" ry="52"
        stroke="${RED}" stroke-width="4" fill="none"/>
      <text x="${tx}" y="${ty + 14}"
        font-family="sans-serif" font-size="38" font-weight="bold"
        fill="${RED}" text-anchor="middle">${totalScore}</text>`);
  }

  // ── Column geometry (score circle x-position per column) ─────────────────
  const scoreX: Record<AnswerColumn, number> = {
    left:  Math.round(width * 0.47) - 40,
    right: Math.round(width * 0.95) - 40,
    full:  Math.round(width * 0.95) - 40,
  };
  const tickStartX: Record<AnswerColumn, number> = {
    left:  Math.round(width * 0.03),
    right: Math.round(width * 0.52),
    full:  Math.round(width * 0.03),
  };
  const tickEndX: Record<AnswerColumn, number> = {
    left:  Math.round(width * 0.19),
    right: Math.round(width * 0.68),
    full:  Math.round(width * 0.19),
  };

  for (const ann of annotations) {
    const { markerBbox, column, score, max } = ann;

    // Convert marker bbox fractions → pixels
    const yMarker = Math.round((markerBbox.top + markerBbox.height / 2) * height);
    const correct = score >= max;

    const sx = scoreX[column];
    const t0 = tickStartX[column];
    const t2 = tickEndX[column];

    // ── Asymmetric teacher tick ✓ (short first leg, long sweeping second) ──
    if (score > 0) {
      const vx = Math.round(t0 + (t2 - t0) * 0.18);  // vertex very close to start
      const vy = yMarker + 28;
      elements.push(`
        <polyline
          points="${t0},${yMarker - 6} ${vx},${vy} ${t2},${yMarker - 85}"
          stroke="${RED}" stroke-width="7.5" fill="none"
          stroke-linecap="round" stroke-linejoin="round"/>`);
    } else {
      // ✗ cross for zero-score
      const cx = Math.round(t0 + (t2 - t0) * 0.5);
      elements.push(`
        <line x1="${cx - 28}" y1="${yMarker - 28}" x2="${cx + 28}" y2="${yMarker + 28}"
          stroke="${RED}" stroke-width="7.5" stroke-linecap="round"/>
        <line x1="${cx + 28}" y1="${yMarker - 28}" x2="${cx - 28}" y2="${yMarker + 28}"
          stroke="${RED}" stroke-width="7.5" stroke-linecap="round"/>`);
    }

    // ── Circled score at right edge of the column ─────────────────────────
    const scoreLabel = `${score}`;
    const rx         = scoreLabel.length > 1 ? 42 : 34;
    elements.push(`
      <ellipse cx="${sx}" cy="${yMarker}" rx="${rx}" ry="30"
        stroke="${RED}" stroke-width="3.5" fill="none"/>
      <text x="${sx}" y="${yMarker + 12}"
        font-family="sans-serif" font-size="32" font-weight="bold"
        fill="${RED}" text-anchor="middle">${scoreLabel}</text>`);

    // Mistakes are shown in the written summary only — no underlines or hints on the image.
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${elements.join("\n")}
</svg>`;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function annotateAnswerSheets(
  imageUrls: string[],
  feedback:  Record<string, { score: number; max: number; feedback: string }>,
  questions: any[],
  profileId: string,
): Promise<string[]> {
  const supabase = createAdminClient();

  // Build question map: number (1-indexed) → details
  const qByNum: Record<number, { id: string; marks: number; score: number; max: number }> = {};
  questions.forEach((q: any, i: number) => {
    const fb = feedback[q.id];
    qByNum[i + 1] = {
      id:    q.id,
      marks: q.marks,
      score: fb?.score ?? 0,
      max:   fb?.max   ?? q.marks,
    };
  });

  const allQNums = Object.entries(qByNum).map(([num, info]) => ({
    number: Number(num),
    marks:  info.marks,
  }));

  const totalScore = Object.values(qByNum).reduce((s, q) => s + q.score, 0);
  const totalMax   = Object.values(qByNum).reduce((s, q) => s + q.max,   0);

  const annotatedUrls: string[] = [];

  for (let pageIdx = 0; pageIdx < imageUrls.length; pageIdx++) {
    const url = imageUrls[pageIdx]!;
    console.log(`[annotate] page ${pageIdx + 1}/${imageUrls.length}`);

    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error(`Fetch failed (${imgRes.status})`);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

      const meta   = await sharp(imgBuffer).metadata();
      const width  = meta.width  ?? 1240;
      const height = meta.height ?? 1754;
      console.log(`[annotate] page ${pageIdx + 1} dims: ${width}×${height}`);

      // ── Textract: locate question markers ─────────────────────────────────
      const located = await textractLocateQuestions(imgBuffer, allQNums);

      if (located.size === 0) {
        console.warn(`[annotate] page ${pageIdx + 1}: no question markers found — using original`);
        annotatedUrls.push(url);
        continue;
      }

      // ── Build annotation data ─────────────────────────────────────────────
      const annotations: AnnotationData[] = [];
      for (const [qNum, { bbox, column }] of located) {
        const info = qByNum[qNum];
        if (!info) continue;
        annotations.push({
          q:          qNum,
          markerBbox: bbox,
          column,
          score:      info.score,
          max:        info.max,
        });
      }

      if (annotations.length === 0) {
        annotatedUrls.push(url);
        continue;
      }

      console.log(`[annotate] page ${pageIdx + 1}: drawing ${annotations.length} annotations`);

      // ── Draw SVG + composite ──────────────────────────────────────────────
      const svg = buildSvgOverlay(width, height, annotations, totalScore, totalMax, pageIdx === 0);
      const annotatedBuffer = await sharp(imgBuffer)
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .jpeg({ quality: 93 })
        .toBuffer();

      // ── Upload ────────────────────────────────────────────────────────────
      const path = `answer-sheets/${profileId}/annotated-p${pageIdx}-${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("creations-media")
        .upload(path, annotatedBuffer, { contentType: "image/jpeg", upsert: true });

      if (uploadErr) {
        console.error(`[annotate] upload error:`, uploadErr.message);
        annotatedUrls.push(url);
        continue;
      }

      const { data: pub } = supabase.storage.from("creations-media").getPublicUrl(path);
      annotatedUrls.push(pub.publicUrl);
      console.log(`[annotate] page ${pageIdx + 1} annotated ✓`);

    } catch (err: any) {
      console.error(`[annotate] page ${pageIdx + 1} fatal error:`, err.message);
      annotatedUrls.push(url);
    }
  }

  return annotatedUrls;
}

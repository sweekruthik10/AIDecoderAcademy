/**
 * annotateNotesSheet.ts
 *
 * Pixel-perfect teacher-style annotation for classwork notes using AWS Textract:
 *   1. Textract DetectDocumentText → word-level bounding boxes for every word on page
 *   2. Match each issue's student_wrote fragment against Textract words,
 *      using description context to pick the right occurrence
 *   3. sharp + SVG draws annotations at exact pixel coordinates:
 *      - Single red underline for spelling mistakes
 *      - Double red underline for wrong formulas / conceptual errors
 *      - One red V-tick in left margin for a correct section
 */

import sharp  from "sharp";
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import type { Block } from "@aws-sdk/client-textract";
import { createAdminClient } from "./supabase";
import type { CorrectionIssue, CorrectionIssueType } from "@/types";

const RED = "#cc0000";

// ── Singleton Textract client (same pattern as Polly) ─────────────────────────
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
interface BBox { left: number; top: number; width: number; height: number; }

interface LocatedIssue {
  id:    number;
  found: boolean;
  bbox:  BBox;   // fractions of image (0–1)
}

// ── Normalise text for comparison ─────────────────────────────────────────────
// Converts Unicode subscript digits (₀-₉) to ASCII first, then strips non-alphanumeric.
// This ensures "H₂SO" (from LLM) matches "H2SO" (from Textract OCR).
const SUBSCRIPT_MAP: Record<string, string> = {
  "₀":"0","₁":"1","₂":"2","₃":"3","₄":"4",
  "₅":"5","₆":"6","₇":"7","₈":"8","₉":"9",
};
function norm(s: string): string {
  return s
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, c => SUBSCRIPT_MAP[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ── Score how well a Textract LINE matches an issue's context ─────────────────
function lineScore(lineText: string, studentWrote: string, description: string): number {
  const line   = norm(lineText);
  const target = norm(studentWrote);
  let score    = 0;

  // Exact fragment found in line text
  if (line.includes(target)) {
    score += 10;
  } else if (target.length >= 3) {
    // Partial: leading chars match (handles OCR subscript variations e.g. H₂SO → H2SO)
    if (line.includes(target.slice(0, 3))) score += 5;
    // Or trailing chars match
    if (line.includes(target.slice(-3)))   score += 3;
  } else if (target.length >= 2 && line.includes(target.slice(0, 2))) {
    score += 4;
  }

  // Context keywords from description (chemical tokens)
  const tokens = description.match(/[A-Z][a-z0-9]*\d*|[A-Z]{2,}\d*/g) ?? [];
  for (const token of tokens) {
    if (line.includes(token.toLowerCase())) score += 2;
  }

  return score;
}

// ── Merge bounding boxes of multiple word blocks into one ─────────────────────
function mergeBBoxes(words: Block[]): BBox | null {
  const bbs = words.map(w => w.Geometry?.BoundingBox).filter(Boolean) as NonNullable<Block["Geometry"]>["BoundingBox"][];
  if (!bbs.length) return null;
  const left   = Math.min(...bbs.map(b => b!.Left!));
  const top    = Math.min(...bbs.map(b => b!.Top!));
  const right  = Math.max(...bbs.map(b => b!.Left! + b!.Width!));
  const bottom = Math.max(...bbs.map(b => b!.Top!  + b!.Height!));
  return { left, top, width: right - left, height: bottom - top };
}

// Chemical equation separators — never concatenate across these
const SEPARATORS = new Set(["+", "→", "->", "=", "−", "➜", "⟶"]);

// ── Find fragment in a LINE — tries single word then consecutive combos ────────
function findFragmentInLine(
  lineBlock:    Block,
  wordBlocks:   Block[],
  studentWrote: string,
): Block[] | null {
  const childIds = new Set(
    (lineBlock.Relationships ?? [])
      .filter(r => r.Type === "CHILD")
      .flatMap(r => r.Ids ?? [])
  );
  const words  = wordBlocks.filter(w => w.Id && childIds.has(w.Id));
  const target = norm(studentWrote);
  if (!target) return null;

  // ── Single-character fragments ─────────────────────────────────────────────
  // Strict: only match words that ARE this character (or its OCR variant).
  // "O" may OCR as "0" (zero), so we also try that swap.
  if (target.length === 1) {
    const ocrAlts: Record<string, string[]> = { o: ["0"], "0": ["o"] };
    const alts = [target, ...(ocrAlts[target] ?? [])];

    // 1. Word whose entire normalised text is exactly the target (or an OCR alt)
    const exact = words.find(w => alts.includes(norm(w.Text ?? "")));
    if (exact) return [exact];

    // 2. Short word (1–2 chars after norm) that fully contains the target
    const short = words.find(w => {
      const wn = norm(w.Text ?? "");
      return wn.length <= 2 && alts.some(a => wn.includes(a));
    });
    return short ? [short] : null;
  }

  // ── Single-word exact match ───────────────────────────────────────────────
  const exact = words.find(w => norm(w.Text ?? "") === target);
  if (exact) return [exact];

  // ── Single-word startsWith — only if fragment is ≥60% of the word length ──
  // Prevents "2Pb" matching "2Pb(NO₃)₂" (fragment 3 chars, word 8 chars → 37% < 60%)
  const starts = words.find(w => {
    const wt = norm(w.Text ?? "");
    return wt.startsWith(target) && target.length >= Math.ceil(wt.length * 0.6);
  });
  if (starts) return [starts];

  // ── Single-word substring (≥3 chars only) ────────────────────────────────
  if (target.length >= 3) {
    const sub = words.find(w => norm(w.Text ?? "").includes(target));
    if (sub) return [sub];
  }

  // ── Multi-word concatenation — stops at equation separators (+, →, =) ────
  // Also skips matches where the next word starts with "(" meaning a larger compound
  for (let i = 0; i < words.length; i++) {
    const startText = (words[i]?.Text ?? "").trim();
    if (SEPARATORS.has(startText)) continue;  // never start on a separator

    let combined = "";
    for (let j = i; j < Math.min(i + 4, words.length); j++) {
      const wordText = (words[j]?.Text ?? "").trim();

      // Stop concatenating if we hit a separator (except at the first word)
      if (j > i && SEPARATORS.has(wordText)) break;

      combined += norm(wordText);

      if (combined === target || combined.startsWith(target)) {
        const matchGroup = words.slice(i, j + 1) as Block[];

        // Reject if the very next word starts with "(" — means this is the
        // start of a larger compound like 2Pb(NO₃)₂ rather than standalone 2Pb
        const nextNorm = norm((words[j + 1]?.Text ?? "").trim());
        if (nextNorm.startsWith("(")) break; // skip, keep searching

        return matchGroup;
      }
    }
  }

  return null;
}

// ── Step 1: Textract → locate each issue with pixel-perfect bounding boxes ────
// Returns both located issues AND raw blocks (so caller avoids a second API call)
async function textractLocate(
  imgBuffer: Buffer,
  issues: Array<{ id: number; type: CorrectionIssueType; student_wrote: string; description: string; approx_line_pct?: number; approx_x_pct?: number }>,
): Promise<{ located: LocatedIssue[]; lineBlocks: Block[] }> {
  const result = await getTextract().send(new DetectDocumentTextCommand({
    Document: { Bytes: imgBuffer },
  }));

  const blocks     = result.Blocks ?? [];
  const lineBlocks = blocks.filter(b => b.BlockType === "LINE");
  const wordBlocks = blocks.filter(b => b.BlockType === "WORD");

  console.log(`[annotateNotes] Textract: ${lineBlocks.length} lines, ${wordBlocks.length} words`);

  const located: LocatedIssue[] = [];

  for (const issue of issues) {
    // ── If LLM provided position hints, narrow word search to that region ──
    const Y_TOL  = 0.06;  // ±6% of image height  (~1-2 lines tolerance)
    const X_TOL  = 0.20;  // ±20% of image width  (generous for x)

    const yTarget = issue.approx_line_pct != null ? issue.approx_line_pct / 100 : null;
    const xTarget = issue.approx_x_pct    != null ? issue.approx_x_pct    / 100 : null;

    // Filter LINE blocks to those near the LLM-estimated position
    const candidateLines = yTarget != null
      ? lineBlocks.filter(lb => {
          const bb = lb.Geometry?.BoundingBox;
          if (!bb) return false;
          const lineMid = bb.Top! + bb.Height! / 2;
          return Math.abs(lineMid - yTarget) < Y_TOL;
        })
      : lineBlocks;   // no hint — search all lines

    // Filter word blocks to those near the LLM-estimated x AND y position
    const nearbyWords = (yTarget != null || xTarget != null)
      ? wordBlocks.filter(w => {
          const bb = w.Geometry?.BoundingBox;
          if (!bb) return false;
          const wordMidY = bb.Top!  + bb.Height! / 2;
          const wordMidX = bb.Left! + bb.Width!  / 2;
          const yOk = yTarget == null || Math.abs(wordMidY - yTarget) < Y_TOL;
          const xOk = xTarget == null || Math.abs(wordMidX - xTarget) < X_TOL;
          return yOk && xOk;
        })
      : wordBlocks;   // no hint — search all words

    console.log(`[annotateNotes] Issue ${issue.id} "${issue.student_wrote}" — searching ${candidateLines.length} lines, ${nearbyWords.length} words (hint: y=${yTarget?.toFixed(2) ?? "none"} x=${xTarget?.toFixed(2) ?? "none"})`);

    // Score candidate lines and search for the fragment
    const scored = candidateLines
      .map(lb => ({ lb, score: lineScore(lb.Text ?? "", issue.student_wrote, issue.description) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    // If no scored candidates, fall back to position-filtered lines regardless of score
    const searchLines = scored.length > 0 ? scored.map(s => s.lb) : candidateLines;

    let foundBBox: BBox | null = null;

    for (const lb of searchLines) {
      const matchedWords = findFragmentInLine(lb, nearbyWords, issue.student_wrote);
      if (matchedWords?.length) {
        foundBBox = mergeBBoxes(matchedWords);
        break;
      }
    }

    if (!foundBBox) {
      console.warn(`[annotateNotes] Issue ${issue.id} "${issue.student_wrote}" — not found in Textract output`);
      located.push({ id: issue.id, found: false, bbox: { left:0, top:0, width:0, height:0 } });
      continue;
    }

    console.log(`[annotateNotes] Issue ${issue.id} "${issue.student_wrote}" → bbox:`, JSON.stringify(foundBBox));
    located.push({ id: issue.id, found: true, bbox: foundBBox });
  }

  return { located, lineBlocks };
}

// ── Step 2: Pick tick position — last two lines, not overlapping any issue ────
function pickTickBbox(
  lineBlocks: Block[],
  locatedIssues: LocatedIssue[],
): BBox | null {
  const errorTops = locatedIssues.filter(l => l.found).map(l => l.bbox.top);

  // Sort lines by vertical position (top → bottom) and take the last few
  const sorted = [...lineBlocks]
    .filter(lb => (lb.Text ?? "").trim().length > 2)
    .sort((a, b) => (a.Geometry?.BoundingBox?.Top ?? 0) - (b.Geometry?.BoundingBox?.Top ?? 0));

  // Search from the bottom upward for a line that doesn't overlap an error
  for (const lb of [...sorted].reverse()) {
    const bb = lb.Geometry?.BoundingBox;
    if (!bb) continue;
    const nearError = errorTops.some(et => Math.abs(bb.Top! - et) < 0.04);
    if (!nearError) {
      return { left: bb.Left!, top: bb.Top!, width: bb.Width!, height: bb.Height! };
    }
  }
  return null;
}

// ── Step 3: Build SVG overlay ─────────────────────────────────────────────────
function buildSvgOverlay(
  width:           number,
  height:          number,
  located:         LocatedIssue[],
  issueTypes:      Record<number, CorrectionIssueType>,
  correctVersions: Record<number, string>,
  tickBbox:        BBox | null,
): string {
  const elements: string[] = [];

  for (const loc of located) {
    if (!loc.found) continue;
    const { left, top, width: bw, height: bh } = loc.bbox;

    const x1       = Math.round(left * width);
    const x2       = Math.round((left + bw) * width);
    const yBase    = Math.round((top + bh) * height) + 4;   // just below word baseline
    const yAbove   = Math.round(top * height) - 6;           // just above the word
    const type     = issueTypes[loc.id] ?? "conceptual_error";
    const correct  = correctVersions[loc.id] ?? "";

    // Underline under the wrong fragment
    elements.push(`
      <line x1="${x1}" y1="${yBase}" x2="${x2}" y2="${yBase}"
        stroke="${RED}" stroke-width="5" stroke-linecap="round"/>`);

    // Double underline for formula/conceptual errors
    if (type !== "spelling") {
      elements.push(`
        <line x1="${x1}" y1="${yBase + 8}" x2="${x2}" y2="${yBase + 8}"
          stroke="${RED}" stroke-width="4" stroke-linecap="round"/>`);
    }

    // Write the correct version above the underlined word in red
    if (correct) {
      // Escape XML special chars
      const safeCorrect = correct
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      elements.push(`
        <text x="${x1}" y="${yAbove}"
          font-family="sans-serif" font-size="22" font-weight="bold"
          fill="${RED}" dominant-baseline="auto">${safeCorrect}</text>`);
    }
  }

  // Teacher-style tick: short first stroke, long sweeping second stroke
  // (asymmetric — like a real handwritten ✓, not a V)
  if (tickBbox) {
    const ty   = Math.round((tickBbox.top + tickBbox.height / 2) * height);
    // First stroke: short, goes slightly down-right
    const ax   = Math.round(width * 0.02);
    const ay   = ty - 4;
    const bx   = Math.round(width * 0.045);   // vertex — close to start
    const by_  = ty + 14;                       // short drop (18 px)
    // Second stroke: long, sweeps up-right
    const cx   = Math.round(width * 0.13);
    const cy   = ty - 65;                       // long rise (~79 px) — big sweep

    elements.push(`
      <polyline
        points="${ax},${ay} ${bx},${by_} ${cx},${cy}"
        stroke="${RED}" stroke-width="7" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${elements.join("\n")}
</svg>`;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function annotateNotesSheets(
  imageUrls: string[],
  issues:    CorrectionIssue[],
  profileId: string,
): Promise<string[]> {
  const supabase = createAdminClient();

  // Only annotate issues that have a student_wrote fragment
  const annotatableIssues = issues
    .map((iss, i) => ({
      id:               i,
      type:             iss.type,
      student_wrote:    iss.student_wrote,
      description:      iss.description,
      approx_line_pct:  iss.approx_line_pct,
      approx_x_pct:     iss.approx_x_pct,
    }))
    .filter((iss): iss is { id: number; type: CorrectionIssueType; student_wrote: string; description: string; approx_line_pct: number | undefined; approx_x_pct: number | undefined } =>
      !!iss.student_wrote
    );

  const issueTypes:      Record<number, CorrectionIssueType> = {};
  const correctVersions: Record<number, string>              = {};
  for (const iss of annotatableIssues) {
    issueTypes[iss.id]      = iss.type;
    correctVersions[iss.id] = issues[iss.id]?.correct_version ?? "";
  }

  const annotatedUrls: string[] = [];

  for (let pageIdx = 0; pageIdx < imageUrls.length; pageIdx++) {
    const url = imageUrls[pageIdx]!;
    console.log(`[annotateNotes] page ${pageIdx + 1}/${imageUrls.length}`);

    try {
      // Fetch image
      const imgRes    = await fetch(url);
      if (!imgRes.ok) throw new Error(`Fetch failed (${imgRes.status})`);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

      // Dimensions
      const meta   = await sharp(imgBuffer).metadata();
      const width  = meta.width  ?? 1080;
      const height = meta.height ?? 1440;

      if (annotatableIssues.length === 0) {
        annotatedUrls.push(url);
        continue;
      }

      // ── Textract: single API call → word bounding boxes + line blocks ──────
      const { located, lineBlocks } = await textractLocate(imgBuffer, annotatableIssues);
      const tickBbox = pickTickBbox(lineBlocks, located);

      const hasAnnotations = located.some(l => l.found) || tickBbox !== null;
      if (!hasAnnotations) {
        console.log(`[annotateNotes] page ${pageIdx + 1}: nothing to annotate — using original`);
        annotatedUrls.push(url);
        continue;
      }

      // ── Draw SVG + composite ────────────────────────────────────────────────
      const svg = buildSvgOverlay(width, height, located, issueTypes, correctVersions, tickBbox);
      const annotatedBuffer = await sharp(imgBuffer)
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .jpeg({ quality: 93 })
        .toBuffer();

      // ── Upload ──────────────────────────────────────────────────────────────
      const path = `answer-sheets/${profileId}/notes-annotated-p${pageIdx}-${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("creations-media")
        .upload(path, annotatedBuffer, { contentType: "image/jpeg", upsert: true });

      if (uploadErr) {
        console.error(`[annotateNotes] upload error:`, uploadErr.message);
        annotatedUrls.push(url);
        continue;
      }

      const { data: pub } = supabase.storage.from("creations-media").getPublicUrl(path);
      annotatedUrls.push(pub.publicUrl);
      console.log(`[annotateNotes] page ${pageIdx + 1} annotated ✓`);

    } catch (err: any) {
      console.error(`[annotateNotes] page ${pageIdx + 1} error:`, err.message);
      annotatedUrls.push(url);
    }
  }

  return annotatedUrls;
}

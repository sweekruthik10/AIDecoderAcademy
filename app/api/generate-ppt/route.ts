import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { generateImage } from "@/lib/imageGenerator";
import { generatePPT, type PPTInput } from "@/lib/pptGenerator";
import { createAdminClient } from "@/lib/supabase";

export const runtime     = "nodejs";
export const maxDuration = 180;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Extract a named context block like [Image titled "X": url] or [Document titled "X": url]
function extractContextBlock(prompt: string, label: string): { ref: string | null; promptWithout: string } {
  const marker = `[${label} titled "`;
  const start  = prompt.indexOf(marker);
  if (start === -1) return { ref: null, promptWithout: prompt };
  const afterTitle = prompt.indexOf('": ', start);
  if (afterTitle === -1) return { ref: null, promptWithout: prompt };
  const urlStart = afterTitle + 3;
  const closingBracket = prompt.indexOf(']', urlStart);
  if (closingBracket === -1) return { ref: null, promptWithout: prompt };
  const ref       = prompt.slice(urlStart, closingBracket).trim();
  const fullMatch = prompt.slice(start, closingBracket + 1);
  const promptWithout = prompt.replace(fullMatch, "").trim();
  return { ref, promptWithout };
}

// Extract ALL [Image titled "X": url] blocks from the prompt.
// Returns every image URL found and the prompt with all image markers stripped.
function extractAllImageRefs(prompt: string): { imageRefs: string[]; promptWithoutImages: string } {
  const imageRefs: string[] = [];
  let remaining = prompt;
  // Keep peeling off image blocks until none are left
  while (true) {
    const { ref, promptWithout } = extractContextBlock(remaining, "Image");
    if (!ref) break;
    imageRefs.push(ref);
    remaining = promptWithout;
  }
  return { imageRefs, promptWithoutImages: remaining };
}

async function describeImageForContext(imageRef: string): Promise<string> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageRef, detail: "low" } as { url: string; detail: "low" } },
          { type: "text", text: "Describe what is in this image in 2-3 sentences. Focus on the subject matter, key concepts, and any text visible. Be concise." },
        ],
      }],
      max_tokens: 150,
    });
    return res.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    console.error("[generate-ppt] image describe failed:", err);
    return "";
  }
}

// Extract existing slide structure from creation context if present
function extractExistingSlides(prompt: string): {
  existingSlides: PPTInput | null;
  cleanPrompt: string;
} {
  const slideStart = prompt.indexOf('[Slides titled "');
  const slideEnd   = slideStart > -1 ? prompt.indexOf(']', slideStart) : -1;
  const match      = slideStart > -1 && slideEnd > -1
    ? prompt.slice(slideStart, slideEnd + 1).match(/\[Slides titled "[^"]*": ([\s\S]*?)\]/)
    : null;
  if (match) {
    const cleanPrompt = prompt.replace(match[0], "").trim();
    // We only have section summaries in the context string — flag as "has existing"
    // The full structure needs to come from a re-parse, so we signal modification mode
    return { existingSlides: { title: "existing", sections: [] }, cleanPrompt };
  }
  return { existingSlides: null, cleanPrompt: prompt };
}

async function generateSlideStructure(
  prompt: string,
  ageGroup: string,
  isModification: boolean,
  existingSummary?: string,
  conversationHistory?: string,
): Promise<PPTInput> {

  const baseRules = `STRUCTURE RULES:
- 2 to 3 sections
- 1 scene per section
- concepts: 3 to 5 bullet points per section, each under 8 words
- scene_goal: what the student should understand, max 15 words

IMAGE PROMPT RULES:
- 40 to 60 words, Pixar/Ghibli 2D animation style
- Include: subject, setting, mood, and what is being shown
- Characters: energetic teens in a bright colourful world
- BAD: "students in a classroom"
- GOOD: "A teenage girl holds a glowing leaf to sunlight in a lush garden, tiny arrows showing water rising through roots, Ghibli style"`;

  const historySection = !isModification && conversationHistory?.trim()
    ? `\n\nCONVERSATION HISTORY (what was created before this request — use it to understand what the student is referring to):\n${conversationHistory}`
    : "";

  const systemPrompt = isModification
    ? `You are an educational content creator for students aged ${ageGroup}.
The student has EXISTING slides they want to modify.
Apply their requested changes while keeping the overall topic and structure.

EXISTING SLIDE SUMMARY: ${existingSummary ?? ""}

The student's modification request will follow. Apply it — change specific sections, 
add content, adjust concepts, update image prompts — but keep what they didn't ask to change.

Return ONLY valid JSON:
{
  "title": "...", "subject": "...", "class_level": "...",
  "sections": [{
    "title": "...", "concepts": ["..."],
    "scenes": [{ "scene_id": "S1", "scene_goal": "...", "image_prompt": "..." }]
  }]
}

${baseRules}`
    : `You are an educational content creator for students aged ${ageGroup}.
Generate a PowerPoint presentation. Return ONLY valid JSON:
{
  "title": "...", "subject": "...", "class_level": "...",
  "sections": [{
    "title": "...", "concepts": ["..."],
    "scenes": [{ "scene_id": "S1", "scene_goal": "...", "image_prompt": "..." }]
  }]
}

${baseRules}${historySection}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: isModification ? `Modification: ${prompt}` : `Create a presentation about: ${prompt}` },
    ],
    temperature: 0.7, max_tokens: 2048,
    response_format: { type: "json_object" },
  });

  return JSON.parse(res.choices[0]?.message?.content ?? "{}") as PPTInput;
}

// Fetch an uploaded image from its URL (Supabase temp storage or any https URL)
// and return it as a Buffer ready to embed in the PPT.
async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Copy an uploaded image from temp/ to permanent slide-images/ storage.
// Returns the new permanent public URL, or null on failure.
async function moveUploadedImageToPermanent(
  imageUrl: string,
  userId:   string,
): Promise<{ buffer: Buffer; permanentUrl: string | null }> {
  const buffer = await fetchImageBuffer(imageUrl);

  try {
    const supabase  = createAdminClient();
    // Derive a short filename from the source URL (last path segment)
    const srcSegment = imageUrl.split("/").pop()?.split("?")[0] ?? `upload_${Date.now()}.jpg`;
    const destPath   = `slide-images/${userId}/${Date.now()}_${srcSegment.slice(0, 80)}`;

    // Detect MIME from buffer magic bytes (JPEG / PNG / WEBP / GIF)
    let contentType = "image/jpeg";
    if (buffer[0] === 0x89 && buffer[1] === 0x50) contentType = "image/png";
    else if (buffer[0] === 0x52 && buffer[1] === 0x49) contentType = "image/webp";
    else if (buffer[0] === 0x47 && buffer[1] === 0x49) contentType = "image/gif";

    const { error } = await supabase.storage
      .from("creations-media")
      .upload(destPath, buffer, { contentType, upsert: false });

    if (error) { console.warn("[generate-ppt] permanent copy failed:", error.message); return { buffer, permanentUrl: null }; }

    const { data } = supabase.storage.from("creations-media").getPublicUrl(destPath);
    console.log("[generate-ppt] uploaded image moved to permanent storage:", destPath);
    return { buffer, permanentUrl: data.publicUrl };
  } catch (err) {
    console.warn("[generate-ppt] permanent copy error:", err);
    return { buffer, permanentUrl: null };
  }
}

// Skip fal.ai generation for scenes that already have imageBase64 set
// (e.g. the first scene pre-filled from a user-uploaded image).
async function generateSceneImages(structure: PPTInput): Promise<PPTInput> {
  const enriched = JSON.parse(JSON.stringify(structure)) as PPTInput;
  for (let si = 0; si < enriched.sections.length; si++) {
    for (let sci = 0; sci < enriched.sections[si].scenes.length; sci++) {
      const scene = enriched.sections[si].scenes[sci];
      // Already has an image (from user upload) — skip AI generation
      if (scene.imageBase64) {
        console.log(`[generate-ppt] ${scene.scene_id}: using uploaded image, skipping fal.ai`);
        continue;
      }
      try {
        const rawPrompt = scene.image_prompt?.trim() || `${scene.scene_goal} — ${enriched.sections[si].title}`;
        console.log(`[generate-ppt] Image for ${scene.scene_id}: "${rawPrompt.slice(0, 60)}..."`);
        const buffer = await generateImage(rawPrompt, "fal-flux2pro", true);
        enriched.sections[si].scenes[sci].imageBase64 = buffer.toString("base64");
      } catch (err) {
        console.error(`[generate-ppt] Image failed for ${scene.scene_id}:`, err);
      }
    }
  }
  return enriched;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { prompt, ageGroup = "11-13", conversationHistory } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    // ── 1. Detect ALL injected images ──────────────────────────────────────
    // Each uploaded image maps 1:1 to a slide scene (scene 0 → image 0, etc.)
    // so we skip fal.ai generation for exactly as many scenes as images uploaded.
    const { imageRefs, promptWithoutImages } = extractAllImageRefs(prompt);
    let promptForSlides      = promptWithoutImages;
    // base64 buffers in order — index i will be pinned to scene i
    const uploadedImageB64s: string[] = [];

    if (imageRefs.length > 0) {
      console.log(`[generate-ppt] ${imageRefs.length} uploaded image(s) detected — describing + moving to permanent storage`);

      // Describe all images (for GPT slide content) + copy to permanent storage — all in parallel
      const results = await Promise.all(
        imageRefs.map(ref => Promise.all([
          describeImageForContext(ref),
          moveUploadedImageToPermanent(ref, userId),
        ]))
      );

      const descriptions: string[] = [];
      for (const [desc, { buffer }] of results) {
        if (desc) descriptions.push(desc);
        uploadedImageB64s.push(buffer.toString("base64"));
      }

      if (descriptions.length > 0) {
        const descBlock = descriptions.map((d, i) => `Image ${i + 1}: ${d}`).join(" | ");
        promptForSlides = `[Context from ${imageRefs.length} uploaded image(s): ${descBlock}]\n\n${promptForSlides}`;
        console.log("[generate-ppt] image descriptions injected:", descBlock.slice(0, 120));
      }
    }

    // ── 2. Detect injected document (PDF/DOC) ──────────────────────────────
    const { ref: docRef, promptWithout: promptAfterDoc } = extractContextBlock(promptForSlides, "Document");
    if (docRef) {
      const docTitleMatch = prompt.match(/\[Document titled "([^"]+)":/);
      const docTitle = docTitleMatch ? docTitleMatch[1] : "Uploaded document";
      promptForSlides = `[Context: the student has uploaded a document titled "${docTitle}" — base the presentation on this document's topic]\n\n${promptAfterDoc}`;
      console.log("[generate-ppt] document context injected:", docTitle);
    }

    // ── 3. Generate slide structure via GPT ────────────────────────────────
    const { existingSlides, cleanPrompt } = extractExistingSlides(promptForSlides);
    const isModification = !!existingSlides;

    const slideSummaryStart = promptForSlides.indexOf('[Slides titled "');
    const slideSummaryEnd   = slideSummaryStart > -1 ? promptForSlides.indexOf(']', slideSummaryStart) : -1;
    const slideSummaryMatch = slideSummaryStart > -1 && slideSummaryEnd > -1
      ? promptForSlides.slice(slideSummaryStart, slideSummaryEnd + 1).match(/\[Slides titled "[^"]*": ([\s\S]*?)\]/)
      : null;
    const existingSummary = slideSummaryMatch ? slideSummaryMatch[1] : undefined;

    console.log(`[generate-ppt] mode=${isModification ? "modify" : "fresh"}`);

    const structure = await generateSlideStructure(cleanPrompt, ageGroup, isModification, existingSummary, conversationHistory);
    console.log(`[generate-ppt] ${structure.sections.length} sections`);

    // ── 4. Pin each uploaded image to a scene in order ────────────────────
    // Scenes are collected across all sections in order: s0c0, s1c0, s2c0…
    // Image 0 → first scene, image 1 → second scene, etc.
    // Remaining scenes (beyond uploaded count) get AI-generated images.
    if (uploadedImageB64s.length > 0) {
      let imgIdx = 0;
      outer: for (const section of structure.sections) {
        for (const scene of section.scenes) {
          if (imgIdx >= uploadedImageB64s.length) break outer;
          scene.imageBase64 = uploadedImageB64s[imgIdx];
          console.log(`[generate-ppt] uploaded image ${imgIdx + 1} pinned to scene ${scene.scene_id}`);
          imgIdx++;
        }
      }
    }

    // ── 5. Generate AI images for remaining scenes ─────────────────────────
    const enriched  = await generateSceneImages(structure);  // skips scenes with imageBase64
    const pptBuffer = await generatePPT(enriched);
    const pptBase64 = Buffer.from(pptBuffer).toString("base64");

    return NextResponse.json({
      title: structure.title, subject: structure.subject,
      sections: enriched.sections, pptBase64,
    });
  } catch (err) {
    console.error("[generate-ppt]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "PPT generation failed" }, { status: 500 });
  }
}
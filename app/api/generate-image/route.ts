import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase";
import { generateImage } from "@/lib/imageGenerator";
import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const runtime     = "nodejs";
export const maxDuration = 120;

// Extract existing image context (title + URL) from a creation context marker
function extractImageContext(prompt: string): {
  imageUrl:   string | null;
  imageTitle: string | null;
  cleanPrompt: string;
} {
  const imgStart = prompt.indexOf('[Image titled "');
  const imgEnd   = imgStart > -1 ? prompt.indexOf(']', imgStart) : -1;
  const match    = imgStart > -1 && imgEnd > -1
    ? prompt.slice(imgStart, imgEnd + 1).match(/\[Image titled "([^"]+)": (https?:\/\/[^\]]+)\]/)
    : null;
  if (match) {
    const imageTitle  = match[1].trim();
    const imageUrl    = match[2].trim();
    const cleanPrompt = prompt.replace(match[0], "").trim();
    return { imageUrl, imageTitle, cleanPrompt };
  }
  return { imageUrl: null, imageTitle: null, cleanPrompt: prompt };
}

// Converts a modification request + original image title into a complete new image prompt.
// Text-only fallback when vision is unavailable. Used to be the primary edit path,
// but we now prefer buildEditPromptWithVision so GPT actually sees the original image.
async function buildEditPrompt(originalTitle: string, modificationRequest: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model:    "gpt-4o-mini",
    messages: [
      {
        role:    "system",
        content:
          "You are a visual description writer for an AI image generator. " +
          "The user has an existing image and wants to modify it. " +
          "Write a complete, detailed image prompt for the NEW image — incorporate the original image's setting and style, but apply the requested changes. " +
          "Output ONLY the image prompt — no explanation, no quotes, no extra text. Max 100 words.",
      },
      {
        role:    "user",
        content: `Original image title: "${originalTitle}"\n\nModification request: "${modificationRequest}"\n\nWrite a complete visual image prompt for the modified image.`,
      },
    ],
    temperature: 0.7,
    max_tokens:  180,
  });
  return res.choices[0]?.message?.content?.trim() ?? modificationRequest;
}

// Vision-augmented edit prompt — the previous title-only path could not preserve
// face/clothing/colour identity (Linear: avatar regen pulled forest aesthetics).
// Here we hand gpt-4o-mini the ACTUAL image and let it describe what it sees
// before applying the modification. Identity carries through far better.
async function buildEditPromptWithVision(
  imageUrl:            string,
  originalTitle:       string,
  modificationRequest: string,
): Promise<string> {
  const res = await openai.chat.completions.create({
    model:    "gpt-4o-mini",
    messages: [
      {
        role:    "system",
        content:
          "You are a visual description writer for an AI image generator. " +
          "You will see an existing image and a modification request. " +
          "Write a complete image prompt for the NEW image that:\n" +
          " 1. Preserves the SUBJECT IDENTITY of the original (face shape, hair, clothing, palette, composition).\n" +
          " 2. Applies the modification request precisely.\n" +
          " 3. Restates concrete visual details you can see in the source image — colours, lighting, framing.\n" +
          "Output ONLY the image prompt — no preamble, no quotes, no commentary. Max 130 words.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Original image (titled "${originalTitle}") is attached.\n\nModification request: "${modificationRequest}"\n\nWrite the complete visual prompt for the modified image.`,
          },
          {
            type: "image_url",
            image_url: { url: imageUrl },
          },
        ],
      },
    ],
    temperature: 0.6,
    max_tokens:  220,
  });
  return res.choices[0]?.message?.content?.trim() ?? modificationRequest;
}

// Converts conversation history + user request into a vivid image prompt.
// Only used for short/ambiguous prompts like "another one".
async function buildImagePrompt(conversationHistory: string, userPrompt: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model:    "gpt-4o-mini",
    messages: [
      {
        role:    "system",
        content: "You are a visual description writer for an AI image generator. Read the conversation history and the user's request, then write a detailed, vivid image prompt. Output ONLY the image prompt — no explanation, no quotes, no extra text. Max 80 words.",
      },
      {
        role:    "user",
        content: `Conversation history:\n${conversationHistory}\n\nUser's request: ${userPrompt || "generate an image based on this context"}\n\nWrite a visual image prompt.`,
      },
    ],
    temperature: 0.7,
    max_tokens:  150,
  });
  return res.choices[0]?.message?.content?.trim() ?? userPrompt;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { prompt, conversationHistory } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    const { imageUrl, imageTitle, cleanPrompt } = extractImageContext(prompt);
    let finalPrompt = cleanPrompt;

    // Carry the "comic / panels" intent through any GPT prompt rewrite below
    // so the layout suffix in lib/imageGenerator.ts still fires after rewrite.
    const COMIC_RE      = /\b(comic\s+strip|comic|panels?|frames?|comic\s+book)\b/i;
    const wasComicIntent = COMIC_RE.test(cleanPrompt);

    if (imageUrl && imageTitle) {
      // User has an existing image and wants to edit it.
      // Strategy (May 2026, post-avatar-bug fix):
      //   1. Vision-augmented prompt rewrite — gpt-4o-mini LOOKS at the source image
      //      so it can preserve identity (face, clothing, palette, composition) while
      //      applying the modification. Pure title-text rewriting drifted badly.
      //   2. fal redux img2img — pass the original URL as `image_url` so visual
      //      continuity carries through at the diffusion step too. lib/imageGenerator.ts
      //      already handles the redux endpoint when imageUrl is provided (line ~150).
      console.log("[generate-image] vision-edit mode — original:", imageTitle, "| instruction:", cleanPrompt.slice(0, 80));
      try {
        finalPrompt = await buildEditPromptWithVision(imageUrl, imageTitle, cleanPrompt);
      } catch (visionErr) {
        // Fall back to the text-only edit prompt if the vision call fails
        // (network glitch, image fetch denied, etc.) so the student still gets
        // an image instead of an error.
        console.warn("[generate-image] vision call failed — falling back to text-only edit prompt:", (visionErr as Error).message);
        finalPrompt = await buildEditPrompt(imageTitle, cleanPrompt);
      }
      console.log("[generate-image] resolved edit prompt:", finalPrompt.slice(0, 100));
    } else if (conversationHistory?.trim() && cleanPrompt.trim().split(/\s+/).length <= 6) {
      // History-aware mode only for short/ambiguous prompts (≤6 words) like "another one" or "similar".
      // For clear prompts the user's words are used directly — no GPT rewrite that could
      // silently blend unrelated conversation context into the image subject.
      console.log("[generate-image] history-aware mode (short prompt)");
      finalPrompt = await buildImagePrompt(conversationHistory, cleanPrompt);
      console.log("[generate-image] resolved prompt:", finalPrompt.slice(0, 80));
    } else {
      console.log("[generate-image] direct mode:", cleanPrompt.slice(0, 80));
    }

    // If the original prompt clearly asked for a comic strip but the GPT
    // rewrite stripped that out, re-inject the marker so the layout suffix
    // still fires inside generateImage().
    if (wasComicIntent && !COMIC_RE.test(finalPrompt)) {
      finalPrompt = `${finalPrompt} — render as a comic strip with multiple panels`;
    }

    // When we have a source image, route through fal redux (img2img) so the
    // generated image inherits visual identity from the original. The redux
    // endpoint blends prompt fidelity with source preservation via `strength`
    // (lib/imageGenerator.ts sets strength=0.8 by default — biased toward the
    // new prompt, which is what we want for "recreate my avatar but smiling").
    // No source image → standard text-to-image.
    const buffer = await generateImage(finalPrompt, "fal-flux2pro", true, imageUrl ?? undefined);

    const supabase  = createAdminClient();
    const filename  = `images/${userId}/${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("creations-media")
      .upload(filename, buffer, { contentType: "image/png", upsert: false });

    if (uploadError) {
      console.error("[generate-image] Upload error:", uploadError.message);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabase.storage.from("creations-media").getPublicUrl(filename);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    console.error("[generate-image]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Image generation failed" }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase";
import { generateScene, type SceneInput } from "@/lib/audioGenerator";
import { classifyAudioRequest, generatePodcastEpisode } from "@/lib/podcastGenerator";
import { moderateContent } from "@/lib/aidaSafety";
import type { Profile, AgeGroup } from "@/types";

export const runtime     = "nodejs";
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const MULTI_CHARACTER_KEYWORDS = [
  "dialogue", "dialog", "conversation", "debate", "interview",
  "two people", "two characters", "between", "discuss", "arguing",
  "roleplay", "role play", "characters talking", "scene",
  "maya", "leo", "mr chen", "joey",
];

function needsMultipleCharacters(prompt: string): boolean {
  return MULTI_CHARACTER_KEYWORDS.some(kw => prompt.toLowerCase().includes(kw));
}

const SINGLE_CHARACTER_KEYWORDS = [
  "only one", "one person", "one voice", "solo", "single person",
  "just narrator", "only narrator", "just one", "one character",
  "only maya", "only leo", "just maya", "just leo",
];

function requestsSingleCharacter(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return SINGLE_CHARACTER_KEYWORDS.some(kw => lower.includes(kw));
}

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

function extractImageContext(prompt: string): { imageRef: string | null; promptWithoutImage: string } {
  const { ref, promptWithout } = extractContextBlock(prompt, "Image");
  return { imageRef: ref, promptWithoutImage: promptWithout };
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
    console.error("[generate-audio] image describe failed:", err);
    return "";
  }
}

// Extract existing audio script from creation context if present
function extractExistingScript(prompt: string): {
  existingScript: SceneInput | null;
  cleanPrompt: string;
} {
  const audioStart = prompt.indexOf('[Audio titled "');
  const audioEnd   = audioStart > -1 ? prompt.indexOf(']', audioStart) : -1;
  const match      = audioStart > -1 && audioEnd > -1
    ? prompt.slice(audioStart, audioEnd + 1).match(/\[Audio titled "[^"]*": Narrator: ([\s\S]*?)\. Dialogues: ([\s\S]*?)\]/)
    : null;
  if (match) {
    const narratorText = match[1].trim();
    const dialogueStr  = match[2].trim();
    const cleanPrompt  = prompt.replace(match[0], "").trim();

    const dialogues = dialogueStr === "none" || !dialogueStr ? [] :
      dialogueStr.split(" | ").map(d => {
        const colonIdx = d.indexOf(": ");
        return colonIdx > -1
          ? { character: d.slice(0, colonIdx).toLowerCase().replace(/\s/g, "_"), text: d.slice(colonIdx + 2), emotion: "neutral" as const }
          : null;
      }).filter(Boolean) as SceneInput["dialogues"];

    return {
      existingScript: { scene_id: "scene_01", narrator_text: narratorText, dialogues },
      cleanPrompt,
    };
  }
  return { existingScript: null, cleanPrompt: prompt };
}

async function generateScriptWithModification(
  prompt: string,
  ageGroup: string,
  existingScript: SceneInput | null,
  isMultiChar: boolean,
  conversationHistory?: string,
): Promise<SceneInput> {

  const VALID_EMOTIONS = new Set([
    "happy","sad","curious","excited","frustrated",
    "neutral","confident","realization","awestruck","proud",
  ]);
  const FALLBACK_ARC = ["curious","excited","realization","confident","frustrated","awestruck","happy","proud"];

  if (existingScript) {
    // Modification mode — analyse request first, then apply changes
    const systemPrompt = `You are a creative audio editor for students aged ${ageGroup}.
The student has an EXISTING audio script they want to modify.
Read their request carefully and apply ALL changes they ask for.
Return ONLY valid JSON, no markdown.

EXISTING SCRIPT:
${JSON.stringify(existingScript, null, 2)}

CRITICAL RULES — READ EVERY REQUEST CAREFULLY:

CHARACTER COUNT CHANGES (highest priority):
- If the student says "only one person", "solo", "just narrator", "one voice", "single person"
  → set dialogues to [] and put everything in narrator_text as a single narrator monologue
- If the student says "only maya" or "only leo" or names one character
  → keep only that character in dialogues, remove all others
- If the student says "add another person" or "two people" or "add [name]"
  → add the requested character to dialogues
- NEVER keep two characters when the student asked for one

CONTENT CHANGES:
- If the student asks to add a topic → weave it into the existing story naturally
- If the student asks to change tone → rewrite lines to match (spooky, funny, dramatic, etc.)
- If the student asks to make it longer/shorter → adjust narrator_text and dialogue count

EMOTION RULES:
- Every dialogue entry MUST have an emotion field
- Use varied emotions — never repeat the same emotion more than twice in a row
- Available: happy, sad, curious, excited, frustrated, neutral, confident, realization, awestruck, proud

Return the MODIFIED script:
{
  "scene_id": "scene_01",
  "narrator_text": "...",
  "dialogues": [
    { "character": "...", "text": "...", "emotion": "..." }
  ]
}`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: `Modification requested: ${prompt}` },
      ],
      temperature: 0.85, max_tokens: 1024,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as SceneInput;
    parsed.dialogues = parsed.dialogues.map((d, i) => ({
      ...d,
      emotion: d.emotion && VALID_EMOTIONS.has(d.emotion) ? d.emotion : FALLBACK_ARC[i % FALLBACK_ARC.length],
    }));
    return parsed;
  }

  // Fresh generation
  const historySection = conversationHistory?.trim()
    ? `\n\nCONVERSATION HISTORY (what was created before this request — use it to understand what the student is referring to):\n${conversationHistory}`
    : "";

  const systemPrompt = isMultiChar
    ? `You are a creative audio producer for students aged ${ageGroup}.
Create a multi-character audio scene. Return ONLY valid JSON.

{
  "scene_id": "scene_01",
  "narrator_text": "Optional short scene-setter (1 sentence max, or empty string)",
  "dialogues": [
    { "character": "maya", "text": "What maya says", "emotion": "curious" }
  ]
}

Characters: maya (Ivy), leo (Kevin), mr_chen (Matthew), joey (Kevin)
Use 2 characters. Max 15 words per line. Build emotional arc.
Emotions: happy, sad, curious, excited, frustrated, neutral, confident, realization, awestruck, proud
NEVER repeat same emotion more than twice in a row.${historySection}`
    : `You are a creative audio producer for students aged ${ageGroup}.
Create exactly what the student asks — rap, poem, story, narration.
Return ONLY valid JSON.

{
  "scene_id": "scene_01",
  "narrator_text": "The full content here",
  "dialogues": []
}

60–120 words. Match the tone. Do NOT add educational explanations.${historySection}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: prompt },
    ],
    temperature: 0.9, max_tokens: 1024,
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as SceneInput;
  // Ensure narrator_text is always a string
  parsed.narrator_text = parsed.narrator_text ?? "";
  // Drop any dialogue entries missing a character name, then normalise emotion
  parsed.dialogues = (parsed.dialogues ?? [])
    .filter(d => d.character && typeof d.character === "string" && d.text?.trim())
    .map((d, i) => ({
      ...d,
      emotion: d.emotion && VALID_EMOTIONS.has(d.emotion) ? d.emotion : FALLBACK_ARC[i % FALLBACK_ARC.length],
    }));
  return parsed;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { prompt, ageGroup = "11-13", conversationHistory } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    // Detect injected image and enrich prompt with a vision description
    const { imageRef, promptWithoutImage } = extractImageContext(prompt);
    let promptForAudio = promptWithoutImage;
    if (imageRef) {
      console.log("[generate-audio] image context detected — describing via vision");
      const imageDesc = await describeImageForContext(imageRef);
      if (imageDesc) {
        promptForAudio = `[Context from uploaded image: ${imageDesc}]\n\n${promptForAudio}`;
        console.log("[generate-audio] image description injected:", imageDesc.slice(0, 80));
      }
    }

    // Detect injected document (PDF/DOC) and note it as context
    const { ref: docRef, promptWithout: promptAfterDoc } = extractContextBlock(promptForAudio, "Document");
    if (docRef) {
      const docTitleMatch = prompt.match(/\[Document titled "([^"]+)":/);
      const docTitle = docTitleMatch ? docTitleMatch[1] : "Uploaded document";
      promptForAudio = `[Context: the student has uploaded a document titled "${docTitle}" — base the audio on this document's topic]\n\n${promptAfterDoc}`;
      console.log("[generate-audio] document context injected:", docTitle);
    }

    // Pre-flight safety
    const verdict = await moderateContent(promptForAudio);
    if (!verdict.allow) {
      return NextResponse.json({ error: verdict.suggestedReply }, { status: 200 });
    }

    // New podcast routing path — only when no existing script
    // (modification mode keeps using legacy path).
    if (!promptForAudio.includes('[Audio titled "')) {
      const intent = await classifyAudioRequest(prompt);
      if (intent === "multi_character") {
        try {
          // Synthesise a minimal Profile from the route's ageGroup parameter.
          const minimalProfile = {
            id:           "",
            clerk_user_id: userId,
            display_name: "Student",
            avatar_emoji: "🎙",
            age_group:    ageGroup as AgeGroup,
            interests:    [],
            xp:           0,
            level:        1,
            active_arena: 1,
            streak_days:  0,
            badges:       [],
            created_at:   "",
            updated_at:   "",
          } as Profile;
          const episode = await generatePodcastEpisode({ topic: promptForAudio, profile: minimalProfile });
          console.log(`[generate-audio] podcast episode generated, voices=${episode.voiceCast.length}`);
          return NextResponse.json({
            url:        episode.mp3Url,
            script:     {
              scene_id:      "podcast_01",
              narrator_text: episode.scriptText,
              dialogues:     [],
            },
            voiceCast:  episode.voiceCast,
            multiChar:  true,
          });
        } catch (err) {
          console.error("[generate-audio] podcast path failed, falling back to monologue:", err);
          // fall through to legacy path
        }
      }
    }

    const { existingScript, cleanPrompt } = extractExistingScript(promptForAudio);
    // If student explicitly asks for one person, override multi-char detection
    const isMultiChar = requestsSingleCharacter(cleanPrompt)
      ? false
      : needsMultipleCharacters(cleanPrompt);

    console.log(`[generate-audio] mode=${existingScript ? "modify" : "fresh"} multiChar=${isMultiChar}`);

    const script = await generateScriptWithModification(cleanPrompt, ageGroup, existingScript, isMultiChar, conversationHistory);
    console.log(`[generate-audio] narrator=${!!script.narrator_text} dialogues=${script.dialogues.length}`);

    const { combined_mp3, parts } = await generateScene(script);
    console.log(`[generate-audio] Merged ${parts} parts → ${combined_mp3.length} bytes`);

    const supabase  = createAdminClient();
    const filename  = `audio/${userId}/${Date.now()}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from("creations-media")
      .upload(filename, combined_mp3, { contentType: "audio/mpeg", upsert: false });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data } = supabase.storage.from("creations-media").getPublicUrl(filename);
    return NextResponse.json({ url: data.publicUrl, script });
  } catch (err) {
    console.error("[generate-audio]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Audio generation failed" }, { status: 500 });
  }
}
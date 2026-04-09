// Server-side podcast generator — multi-character episode synthesis.
// Lifted core logic from scripts/generate-podcast.mjs and exposed for the
// /api/generate-audio route to call when classification says multi_character.

import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase";
import type { Profile } from "@/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

// ─── Voice library (mirrors scripts/generate-podcast.mjs) ───────────────────

interface ElevenLabsVoice {
  name:        string;
  id:          string;
  description: string;
}

const VOICES: Record<string, ElevenLabsVoice> = {
  narrator:   { name: "Brian",    id: "nPczCjzI2devNBz1zQrb", description: "deep, comforting middle-aged American male — host vibe" },
  aida:       { name: "Jessica",  id: "cgSgspJ2msm6clMCkdW9", description: "playful, bright, warm young American female" },
  laura:      { name: "Laura",    id: "FGY2WhTYpPnrIDTdsKH5", description: "enthusiastic, quirky young American female" },
  liam:       { name: "Liam",     id: "TX3LPaxmHKxFdv7VOQHJ", description: "energetic young American male" },
  george:     { name: "George",   id: "JBFqnCBsd6RMkjVDRZzb", description: "warm British storyteller, middle-aged male" },
  alice:      { name: "Alice",    id: "Xb7hH8MSUJpSbSDYk0k2", description: "clear engaging educator, British female" },
  charlie:    { name: "Charlie",  id: "IKne3meq5aSn9XLyUdCD", description: "confident, energetic young Australian male" },
};

// ─── Classification ─────────────────────────────────────────────────────────

export type AudioIntent = "monologue" | "multi_character";

export async function classifyAudioRequest(prompt: string): Promise<AudioIntent> {
  if (!prompt?.trim()) return "monologue";

  try {
    const completion = await openai.chat.completions.create({
      model:       "gpt-4o-mini",
      temperature: 0,
      max_tokens:  10,
      messages: [
        {
          role:    "system",
          content: `You classify audio generation requests into one of two intents:
- "multi_character" — when the request implies multiple speakers (podcast, interview, conversation, debate, two characters, scene with named characters).
- "monologue" — single narrator, voiceover, story read aloud, instructional clip with one voice.

Respond with EXACTLY one word: multi_character OR monologue. No quotes, no punctuation.`,
        },
        { role: "user", content: prompt },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? "";
    return raw === "multi_character" ? "multi_character" : "monologue";
  } catch (err) {
    console.warn("[podcastGenerator] classification failed, defaulting to monologue:", err);
    return "monologue";
  }
}

// ─── Episode script generation ──────────────────────────────────────────────

interface PodcastScript {
  title: string;
  characters: { id: string; description: string; trait: "narrator" | "young_female" | "young_male" | "warm_male" | "warm_female" }[];
  lines: { speaker: string; text: string }[];
}

async function writePodcastScript(topic: string, profile: Profile, durationMin: number): Promise<PodcastScript> {
  const targetWords = Math.round(durationMin * 150); // ~150 wpm narration

  const completion = await openai.chat.completions.create({
    model:           "gpt-4o-mini",
    temperature:     0.8,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You write multi-character educational podcast scripts for AI Decoder Academy — a learning platform for kids aged 6-16.

Output strict JSON:
{
  "title":  "<episode title>",
  "characters": [
    { "id": "narrator", "description": "host", "trait": "narrator" },
    { "id": "<character_name>", "description": "<one-line about them>", "trait": "young_female" | "young_male" | "warm_male" | "warm_female" }
  ],
  "lines": [
    { "speaker": "<character_id from above>", "text": "<line of dialogue>" }
  ]
}

Constraints:
- Exactly one narrator. 2-3 additional characters.
- Total dialogue ~${targetWords} words.
- Cold open hook → exploration → wrap.
- No bracketed stage directions in lines (keep just spoken text).
- Age-appropriate for ${profile.age_group}.
- ${profile.display_name} may be referenced indirectly but is not a character.`,
      },
      { role: "user", content: `Topic: ${topic}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as PodcastScript;
}

function assignVoices(script: PodcastScript): Map<string, ElevenLabsVoice> {
  const map = new Map<string, ElevenLabsVoice>();
  map.set("narrator", VOICES.narrator);

  const used = new Set<string>([VOICES.narrator.id]);
  const trait_pool: Record<string, ElevenLabsVoice[]> = {
    young_female: [VOICES.laura, VOICES.aida, VOICES.alice],
    young_male:   [VOICES.liam, VOICES.charlie],
    warm_male:    [VOICES.george, VOICES.narrator],
    warm_female:  [VOICES.alice, VOICES.aida],
  };
  for (const ch of script.characters) {
    if (ch.id === "narrator") continue;
    const pool = trait_pool[ch.trait] ?? trait_pool.young_female;
    const pick = pool.find(v => !used.has(v.id)) ?? pool[0];
    map.set(ch.id, pick);
    used.add(pick.id);
  }
  return map;
}

// ─── ElevenLabs synthesis ───────────────────────────────────────────────────

async function synthLine(text: string, voice: ElevenLabsVoice): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`,
    {
      method: "POST",
      headers: {
        "xi-api-key":   apiKey,
        "Content-Type": "application/json",
        "Accept":       "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability:         0.5,
          similarity_boost:  0.75,
          style:             0.15,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface GenerateEpisodeOptions {
  topic:              string;
  profile:            Profile;
  durationTargetMin?: number;
}

export interface GeneratedEpisode {
  mp3Url:     string;
  scriptText: string;
  voiceCast:  { character: string; voice: string }[];
}

export async function generatePodcastEpisode(opts: GenerateEpisodeOptions): Promise<GeneratedEpisode> {
  const duration = opts.durationTargetMin ?? 4;
  const script = await writePodcastScript(opts.topic, opts.profile, duration);
  const voiceMap = assignVoices(script);

  const buffers: Buffer[] = [];
  for (const line of script.lines) {
    const voice = voiceMap.get(line.speaker) ?? VOICES.narrator;
    try {
      const buf = await synthLine(line.text, voice);
      buffers.push(buf);
    } catch (err) {
      console.warn(`[podcastGenerator] synth failed for "${line.speaker}":`, err);
    }
  }

  if (buffers.length === 0) {
    throw new Error("Podcast generation produced no audio");
  }

  const merged = Buffer.concat(buffers);

  const supabase = createAdminClient();
  const fileName = `podcast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
  const { error: uploadErr } = await supabase.storage
    .from("creations-media")
    .upload(`podcasts/${fileName}`, merged, { contentType: "audio/mpeg", upsert: false });
  if (uploadErr) throw uploadErr;

  const { data: urlData } = supabase.storage
    .from("creations-media")
    .getPublicUrl(`podcasts/${fileName}`);

  const scriptText = script.lines.map(l => `${l.speaker}: ${l.text}`).join("\n\n");

  return {
    mp3Url:     urlData.publicUrl,
    scriptText,
    voiceCast:  Array.from(voiceMap.entries()).map(([character, voice]) => ({
      character,
      voice: voice.name,
    })),
  };
}

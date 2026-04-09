import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime  = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function buildSystemPrompt(ageGroup: string): string {
  return `You are a structured JSON generator for an educational AI platform for students aged ${ageGroup}.

Detect what the user is asking for and return the most appropriate JSON structure from the schema library below.
If the user asks to add fields or extend an existing JSON, do so — always return the complete updated object.

━━━ SCHEMA LIBRARY ━━━

1. CONCEPT EXTRACTION — when asked to extract, list, or identify concepts/topics
{
  "concepts": ["Concept 1", "Concept 2", "Concept 3"]
}

2. CONCEPT GAP DETECTION — when asked to find missing or overlooked concepts
{
  "concept_titles": ["Missing Concept 1", "Missing Concept 2"]
}

3. STORY BACKBONE — when asked to create a story, narrative, or character-driven premise
{
  "title": "...",
  "core_premise": "...",
  "characters": [
    {
      "name": "...",
      "role": "...",
      "personality": "...",
      "visual_description": "...",
      "gender": "male|female",
      "voice_id": "Joey|Matthew|Joanna|Ivy"
    }
  ]
}

4. LEARNING STEPS — when asked to break down learning, curriculum, or educational steps
{
  "learning_steps": [
    {
      "learning_step_id": "LS1",
      "title": "...",
      "concepts_introduced": ["concept1", "concept2"],
      "narrative_moment": "Detailed narrative description..."
    }
  ],
  "total_learning_steps": 1
}

5. SCENE PLAN — when asked to plan scenes, phases, or a scene outline
{
  "learning_step_id": "LS1",
  "scene_plan": [
    {
      "scene_id": "S1",
      "phase": "HOOK|OBSERVATION|INVESTIGATION|DISCOVERY|EXPLANATION|REINFORCEMENT|TRANSITION",
      "summary": "...",
      "concept_focus": "..."
    }
  ]
}

6. SCENE GENERATION — when asked to generate a full scene with dialogue, audio, or student interaction
{
  "scene_id": "S1",
  "phase": "HOOK",
  "setting": "...",
  "characters": ["..."],
  "action": "...",
  "dialogue": ["...", "..."],
  "learning_moment": "...",
  "transition_hint": "...",
  "narrator_audio_text": "2-4 sentence cinematic narration written as clean prose for TTS",
  "character_dialogues": [
    {
      "character_id": "...",
      "voice_id": "Joey|Matthew|Joanna|Ivy",
      "dialogue": "Exact dialogue line",
      "audio_text": "Clean text for TTS, no special punctuation",
      "emotion": "happy|sad|curious|excited|frustrated|neutral"
    }
  ],
  "student_interaction": {
    "type": "none|think_prompt|prediction|mini_quiz",
    "prompt_text": "...",
    "pause_seconds": 5,
    "reveal_text": "..."
  }
}

7. IMAGE PROMPT — when asked to generate a visual description or image prompt
{
  "visual_prompt": "clean visual description for image generation"
}

8. STORY RANKING — when asked to compare, evaluate, or rank story options
{
  "stories": [
    {
      "rank": 1,
      "title": "...",
      "core_narrative_premise": "...",
      "overall_coverage": 95,
      "pedagogical_strength": 96
    }
  ],
  "selected_story": {
    "rank": 1,
    "title": "...",
    "core_narrative_premise": "...",
    "overall_coverage": 95,
    "pedagogical_strength": 96
  }
}

━━━ EXTENSION RULES ━━━
- If EXISTING JSON is provided, extend or modify it — do NOT recreate from scratch
- If the user says "add [field]", "include [field]", or "also give me [field]" → add that field to the most relevant part of the schema
- Always return the COMPLETE JSON (not a partial update or diff)
- If the request doesn't match any schema above, use the most logical structure for the content

━━━ SAFETY RULES ━━━
- Never include violent, sexual, scary, or inappropriate content
- Keep all content educational, creative, and positive

Return ONLY valid JSON — no markdown, no explanation, no backticks, no wrapping text.`;
}

function extractExistingJson(prompt: string): { existing: object | null; cleanPrompt: string } {
  const marker = '[JSON titled "previous output": ';
  const start  = prompt.indexOf(marker);
  if (start === -1) return { existing: null, cleanPrompt: prompt };

  const jsonStart = start + marker.length;
  const end       = prompt.indexOf("]\n\n", jsonStart);
  if (end === -1) return { existing: null, cleanPrompt: prompt };

  try {
    const existing    = JSON.parse(prompt.slice(jsonStart, end)) as object;
    const cleanPrompt = prompt.slice(end + 3).trim();
    return { existing, cleanPrompt };
  } catch {
    return { existing: null, cleanPrompt: prompt };
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { prompt, ageGroup = "11-13" } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    const { existing, cleanPrompt } = extractExistingJson(prompt);

    const userMessage = existing
      ? `EXISTING JSON:\n${JSON.stringify(existing, null, 2)}\n\nREQUEST: ${cleanPrompt}`
      : prompt;

    const res = await openai.chat.completions.create({
      model:           "gpt-4o-mini",
      messages:        [
        { role: "system", content: buildSystemPrompt(ageGroup) },
        { role: "user",   content: userMessage },
      ],
      temperature:     0.4,
      max_tokens:      4096,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(res.choices[0]?.message?.content ?? "{}") as object;
    return NextResponse.json({ result });
  } catch (err) {
    console.error("[generate-json]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "JSON generation failed" }, { status: 500 });
  }
}

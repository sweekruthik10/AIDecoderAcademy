import { auth } from "@clerk/nextjs/server";

export const runtime     = "nodejs";
export const maxDuration = 60;

// Domi (Supportive) — Strong, confident, warm female. Reads as a slightly
// older peer / supportive mentor — pairs with the AIDA "Curious Friend"
// persona (see lib/aidaPersona.ts → AIDA_VOICE_AND_MANNER).
const AIDA_VOICE_ID    = process.env.ELEVENLABS_AIDA_VOICE_ID    ?? "AZnzlk1XvdvUeBnXmlld";
// George (Supportive) — Warm, captivating storyteller. British male,
// middle-aged. Professorial without being harsh — pairs with the Validator
// Teacher "Skeptical Mentor" persona (see lib/teacherPersona.ts →
// TEACHER_VOICE_AND_MANNER).
const TEACHER_VOICE_ID = process.env.ELEVENLABS_TEACHER_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
// Monika Sogam — Calm and Natural, clear Indian-English female voice.
// Used by the Classroom Teacher persona.
const CLASSROOM_VOICE_ID = process.env.ELEVENLABS_CLASSROOM_VOICE_ID ?? "1qEiC6qsybMkmnNdVMbK";

const ELEVENLABS_MODEL = "eleven_flash_v2_5"; // ~75ms first-byte latency

// Per-role voice tuning. Lower stability + higher style = more emotional
// range (good for AIDA's friend energy). Higher stability + lower style =
// more measured (good for the Teacher's mentor weight).
const VOICE_SETTINGS = {
  aida: {
    stability:        0.4,
    similarity_boost: 0.7,
    style:            0.3,
    use_speaker_boost: true,
  },
  teacher: {
    stability:        0.65,
    similarity_boost: 0.8,
    style:            0.15,
    use_speaker_boost: true,
  },
  classroom: {
    // Bhavna — warm, storytelling. Slightly looser stability than the
    // skeptical-mentor validator voice to let warmth come through.
    stability:        0.55,
    similarity_boost: 0.85,
    style:            0.25,
    use_speaker_boost: true,
  },
} as const;

// Split text into sentence-sized chunks so the first sentence's audio starts
// playing while later sentences are still generating.
function splitIntoChunks(text: string): string[] {
  const parts = text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(p => p.trim().length > 0);
  return parts.length > 0 ? parts : [text.trim()].filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const { text, role } = (await req.json()) as { text: string; role?: "aida" | "teacher" | "classroom" };
    if (!text?.trim()) return new Response("Bad request", { status: 400 });

    if (!process.env.ELEVENLABS_API_KEY) {
      console.error("[AIDA TTS] ELEVENLABS_API_KEY is not set in environment");
      return new Response("TTS not configured", { status: 503 });
    }

    const voiceId =
      role === "teacher"   ? TEACHER_VOICE_ID :
      role === "classroom" ? CLASSROOM_VOICE_ID :
                             AIDA_VOICE_ID;
    const voiceSettings =
      role === "teacher"   ? VOICE_SETTINGS.teacher :
      role === "classroom" ? VOICE_SETTINGS.classroom :
                             VOICE_SETTINGS.aida;
    const chunks  = splitIntoChunks(text.slice(0, 4096));
    const encoder = new TextEncoder();

    let cancelled = false;
    const readable = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          if (cancelled || req.signal.aborted) break;
          try {
            const res = await fetch(
              `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
              {
                method:  "POST",
                signal:  req.signal,
                headers: {
                  "xi-api-key":   process.env.ELEVENLABS_API_KEY ?? "",
                  "Content-Type": "application/json",
                  "Accept":       "audio/mpeg",
                },
                body: JSON.stringify({
                  text:           chunk,
                  model_id:       ELEVENLABS_MODEL,
                  voice_settings: voiceSettings,
                  speed:          0.78,
                }),
              }
            );

            if (!res.ok) {
              const errBody = await res.text().catch(() => "");
              console.error(`[AIDA TTS] ElevenLabs ${res.status}:`, errBody.slice(0, 200));
              continue;
            }

            if (cancelled || req.signal.aborted) break;
            const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
            controller.enqueue(encoder.encode(`data: ${b64}\n\n`));
          } catch (err: unknown) {
            if ((err as { name?: string }).name === "AbortError") break;
            console.error("[AIDA TTS] chunk fetch failed:", err);
          }
        }
        if (!cancelled) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
      cancel() { cancelled = true; },
    });

    return new Response(readable, {
      headers: {
        "Content-Type":  "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection":    "keep-alive",
      },
    });
  } catch (err) {
    console.error("[AIDA TTS]", err);
    return new Response("Internal server error", { status: 500 });
  }
}

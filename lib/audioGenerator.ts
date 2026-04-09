// TypeScript port of colleague's audio_generator.py
// Uses AWS Polly neural TTS — same character voices, emotions, SSML

import { PollyClient, SynthesizeSpeechCommand, Engine, OutputFormat, TextType, VoiceId } from "@aws-sdk/client-polly";

// ─── Character → Polly voice map (mirrors colleague's code) ──────────────────

const CHARACTER_VOICE_MAP: Record<string, { voice: VoiceId; engine: Engine }> = {
  leo:            { voice: "Kevin",   engine: "neural" },
  maya:           { voice: "Ivy",     engine: "neural" },
  mr_chen:        { voice: "Matthew", engine: "neural" },
  mrchen:         { voice: "Matthew", engine: "neural" },
  mr_aris:        { voice: "Matthew", engine: "neural" },
  mraris:         { voice: "Matthew", engine: "neural" },
  professor_aris: { voice: "Matthew", engine: "neural" },
  joey:           { voice: "Kevin",   engine: "neural" },
  narrator:       { voice: "Gregory", engine: "neural" },
  doraemon:       { voice: "Matthew", engine: "neural" },
  nobita:         { voice: "Kevin",   engine: "neural" },
  shizuka:        { voice: "Ivy",     engine: "neural" },
};

const DEFAULT_NARRATOR_VOICE: VoiceId = "Gregory";
const DEFAULT_MALE_VOICE:     VoiceId = "Kevin";
const DEFAULT_FEMALE_VOICE:   VoiceId = "Ivy";

const KID_VOICES    = new Set(["Kevin", "Ivy", "Justin"]);
const NEURAL_VOICES = new Set(["Matthew", "Joanna", "Kevin", "Ivy", "Gregory", "Ruth", "Stephen", "Amy", "Justin"]);

// ─── Emotion → SSML (mirrors colleague's EMOTION_SSML dict) ──────────────────

const EMOTION_SSML: Record<string, Record<string, string>> = {
  happy:       { matthew: '<amazon:emotion name="excited" intensity="high">{text}</amazon:emotion>',       kids: '<prosody rate="fast">{text}</prosody>',   default: '<prosody rate="fast">{text}</prosody>'   },
  sad:         { matthew: '<amazon:emotion name="disappointed" intensity="high">{text}</amazon:emotion>',  kids: '<prosody rate="slow">{text}</prosody>',   default: '<prosody rate="slow">{text}</prosody>'   },
  curious:     { matthew: '<prosody rate="slow">{text}</prosody>',                                          kids: '<prosody rate="slow">{text}</prosody>',   default: '<prosody rate="slow">{text}</prosody>'   },
  excited:     { matthew: '<amazon:emotion name="excited" intensity="medium">{text}</amazon:emotion>',     kids: '<prosody rate="fast">{text}</prosody>',   default: '<prosody rate="fast">{text}</prosody>'   },
  frustrated:  { matthew: '<amazon:emotion name="disappointed" intensity="medium">{text}</amazon:emotion>', kids: '<prosody rate="medium">{text}</prosody>', default: '<prosody rate="medium">{text}</prosody>' },
  neutral:     { matthew: "{text}", kids: "{text}", default: "{text}" },
  confident:   { matthew: '<amazon:emotion name="excited" intensity="low">{text}</amazon:emotion>',        kids: '<prosody rate="medium">{text}</prosody>', default: '<prosody rate="medium">{text}</prosody>' },
  realization: { matthew: '<amazon:emotion name="excited" intensity="medium">{text}</amazon:emotion>',     kids: '<prosody rate="fast">{text}</prosody>',   default: '<prosody rate="fast">{text}</prosody>'   },
  awestruck:   { matthew: '<prosody rate="slow">{text}</prosody>',                                          kids: '<prosody rate="slow">{text}</prosody>',   default: '<prosody rate="slow">{text}</prosody>'   },
  proud:       { matthew: '<amazon:emotion name="excited" intensity="medium">{text}</amazon:emotion>',     kids: '<prosody rate="medium">{text}</prosody>', default: '<prosody rate="medium">{text}</prosody>' },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Dialogue {
  character: string;
  text:      string;
  emotion?:  string;
  voice?:    string;
}

export interface SceneInput {
  scene_id:      string;
  narrator_text: string;
  dialogues:     Dialogue[];
}

export interface SceneResult {
  combined_mp3: Buffer;   // merged MP3 of all parts
  parts:        number;   // how many audio parts were merged
}

// ─── Polly client (lazy singleton) ───────────────────────────────────────────

let _polly: PollyClient | null = null;

function getPolly(): PollyClient {
  if (!_polly) {
    const accessKeyId     = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region          = process.env.AWS_REGION ?? "us-east-1";

    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in .env.local");
    }
    _polly = new PollyClient({ region, credentials: { accessKeyId, secretAccessKey } });
  }
  return _polly;
}

// ─── SSML builder (mirrors colleague's _build_ssml) ──────────────────────────

function buildSSML(text: string, voiceId: string, emotion?: string): string {
  const clean = text.trim();
  let inner   = clean;

  if (emotion && EMOTION_SSML[emotion.toLowerCase()]) {
    const templates = EMOTION_SSML[emotion.toLowerCase()];
    const key = voiceId === "Matthew" ? "matthew" : KID_VOICES.has(voiceId) ? "kids" : "default";
    inner = templates[key].replace("{text}", clean);
  } else if (KID_VOICES.has(voiceId)) {
    inner = `<prosody rate="95%">${clean}</prosody>`;
  }

  if (inner === clean) return clean;
  return `<speak>${inner}</speak>`;
}

// ─── Single synthesize call ───────────────────────────────────────────────────

async function synthesize(
  text: string,
  voiceId: VoiceId,
  engine: Engine,
  emotion?: string,
): Promise<Buffer | null> {
  if (!text.trim()) return null;

  const ssmlOrText = buildSSML(text, voiceId, emotion);
  const isSSML     = ssmlOrText.startsWith("<speak>");

  const polly = getPolly();
  try {
    const cmd = new SynthesizeSpeechCommand({
      Text:         ssmlOrText,
      TextType:     isSSML ? TextType.SSML : TextType.TEXT,
      OutputFormat: OutputFormat.MP3,
      VoiceId:      voiceId,
      Engine:       engine,
    });

    const res = await polly.send(cmd);
    if (!res.AudioStream) return null;

    const chunks: Uint8Array[] = [];
    for await (const chunk of res.AudioStream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    console.error(`[Polly] Error voice=${voiceId}:`, err);
    return null;
  }
}

// ─── Resolve character → voice ────────────────────────────────────────────────

function resolveVoice(character: string | undefined | null, overrideVoice?: string): { voice: VoiceId; engine: Engine } {
  if (!character) return { voice: DEFAULT_MALE_VOICE, engine: "neural" };
  const key = character.toLowerCase().replace(/\s+/g, "_");
  if (CHARACTER_VOICE_MAP[key]) return CHARACTER_VOICE_MAP[key];
  if (overrideVoice && NEURAL_VOICES.has(overrideVoice)) {
    return { voice: overrideVoice as VoiceId, engine: "neural" };
  }
  return { voice: DEFAULT_MALE_VOICE, engine: "neural" };
}

// ─── Merge MP3 buffers (raw byte concat — works for CBR MP3 from Polly) ───────

function mergeMP3Buffers(buffers: Buffer[]): Buffer {
  return Buffer.concat(buffers.filter(b => b.length > 0));
}

// ─── Public: generate full scene ─────────────────────────────────────────────

export async function generateScene(input: SceneInput): Promise<SceneResult> {
  const parts: Buffer[] = [];

  // 1. Narrator
  if (input.narrator_text.trim()) {
    const engine = NEURAL_VOICES.has(DEFAULT_NARRATOR_VOICE) ? "neural" : "standard";
    const buf = await synthesize(input.narrator_text, DEFAULT_NARRATOR_VOICE, engine as Engine);
    if (buf) {
      parts.push(buf);
      console.log(`[Polly] narrator → ${buf.length} bytes`);
    }
  }

  // 2. Dialogues
  for (const dlg of input.dialogues) {
    if (!dlg.character || !dlg.text?.trim()) continue;
    const { voice, engine } = resolveVoice(dlg.character, dlg.voice);
    const buf = await synthesize(dlg.text, voice, engine, dlg.emotion);
    if (buf) {
      parts.push(buf);
      console.log(`[Polly] ${dlg.character} (${voice}) → ${buf.length} bytes`);
    }
  }

  if (parts.length === 0) {
    throw new Error("Polly returned no audio for any part of the scene");
  }

  return {
    combined_mp3: mergeMP3Buffers(parts),
    parts:        parts.length,
  };
}
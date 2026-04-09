// Whiteboard-context router for AIDA.
//
// AIDA (the floating side assistant) is shown a serialised transcript of what
// the student is doing in the whiteboard chat. We DO NOT want to inject that
// transcript on every AIDA message — it (a) bloats the prompt with irrelevant
// content and (b) confuses the LLM into thinking the whiteboard activity is
// AIDA's own conversation (the "I see you asked the AI for a dragon story"
// identity-bleed regression).
//
// Strategy (3 layers, cheapest first):
//   1. Regex pre-filter on the student's message. Catches the common cases
//      cheaply: "the dragon story", "playground", "what did the AI say", etc.
//      Three verdicts: MUST_ATTACH / MUST_NOT_ATTACH / AMBIGUOUS.
//   2. Cheap gpt-4o-mini router (only on AMBIGUOUS). Asks one yes/no question:
//      does the student's message refer to the whiteboard transcript?
//   3. read_whiteboard() tool, always available to the main LLM, as a final
//      safety net for cases the first two layers missed.
//
// This file is the first two layers. The tool lives in /api/aida/route.ts.

import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
  return _openai;
}

export type WhiteboardRouterVerdict = "attach" | "skip";

// ─── Layer 1: regex pre-filter ──────────────────────────────────────────────

// MUST_ATTACH — message clearly references the whiteboard / its content.
// We attach the transcript without paying for an LLM call.
const MUST_ATTACH_PATTERNS: RegExp[] = [
  // Explicit names for the whiteboard / playground.
  /\bwhiteboard\b/i,
  /\bplayground\b/i,
  /\bcreators?\s*room\b/i,
  /\bthe\s+canvas\b/i,
  /\bthe\s+other\s+(ai|chat)\b/i,
  /\bthe\s+main\s+chat\b/i,

  // References to creations the whiteboard makes.
  /\bmy\s+(last|previous|recent|latest)\s+(prompt|message|generation|image|story|audio|slide|deck|reply|response|output|creation)\b/i,
  // "the [optional adjective] story / image / etc. the AI/I/that wrote/made/..."
  // Allows up to 2 adjectives between "the" and the noun (e.g. "the dragon story").
  /\bthe\s+(?:\w+\s+){0,2}(image|audio|story|slide|deck|prompt|response|output|creation|reply|answer)\s+(i|the\s+ai|that)/i,

  // "What/why did the AI [optional adverb] say/give/make/..."
  // Adverb slot accepts "just", "really", "even", etc.
  /\bwhat\s+did\s+(the\s+ai|it|the\s+chat)\s+(?:\w+\s+)?(say|reply|tell|give|make|do|generate)\b/i,
  /\bwhy\s+did\s+(the\s+ai|it)\s+(?:\w+\s+)?(say|do|reply|generate|make)\b/i,

  // Continuation / modification cues that only make sense w/ context.
  /\b(continue|keep\s+going|extend|finish|more\s+of)\s+(the|that|this|my)\s+(story|image|audio|slide|deck|prompt)\b/i,

  // "the dragon story" / "the cat poem" — content hooks. Hard to express
  // cleanly in regex; covered by the LLM router for the trickier paraphrases.
];

// MUST_NOT_ATTACH — clearly not about the whiteboard. Fast path.
// We skip both the transcript and the LLM router.
const MUST_NOT_ATTACH_PATTERNS: RegExp[] = [
  // Greetings / smalltalk
  /^\s*(hi|hello|hey|yo|sup|hola|namaste|good\s+(morning|afternoon|evening))\b\s*[!.?]*\s*$/i,
  /^\s*how\s+are\s+you\b/i,
  /^\s*(thanks|thank\s+you|ty|thx)\b/i,

  // Pure factual / definitional questions that don't reference user state.
  // (Heuristic: starts with "what is/are" / "who is/are" / "when" / "where" /
  // "why is" / "define" / "explain" + no demonstrative pronoun.)
  /^\s*(what|whats?|what's)\s+(is|are|does|do)\s+(?!(this|that|it|my|the\s+ai)\b)/i,
  /^\s*(who|whose|when|where|how\s+do\s+you|how\s+does)\s+(?!(this|that|it|my|the\s+ai)\b)/i,
  /^\s*define\s+/i,
  /^\s*explain\s+(?!(this|that|it|my|the\s+ai)\b)/i,
];

export function regexPrefilter(message: string): "must_attach" | "must_not_attach" | "ambiguous" {
  if (!message?.trim()) return "must_not_attach";

  for (const re of MUST_ATTACH_PATTERNS) {
    if (re.test(message)) return "must_attach";
  }
  for (const re of MUST_NOT_ATTACH_PATTERNS) {
    if (re.test(message)) return "must_not_attach";
  }
  return "ambiguous";
}

// ─── Layer 2: cheap LLM router (only fires on AMBIGUOUS) ────────────────────

const ROUTER_SYSTEM_PROMPT = `You decide whether a student's message refers to a separate whiteboard chat they have open in another panel.

The whiteboard is a creative AI tool the student uses to generate images, audio, slides, stories, code, etc. The message you're judging was sent to a different AI assistant (called AIDA) that helps with explanations.

Reply with EXACTLY one word — no punctuation, no explanation:
- "attach"  if the student's message references their work in the whiteboard, or is a follow-up that requires seeing it (pronouns like "this/that", references to "the story", "the AI", "my last prompt", "continue", "improve it", etc.)
- "skip"    if the message is a standalone question, greeting, factual query, or otherwise doesn't depend on whiteboard state.

When unsure, prefer "skip" — better to ask follow-up than to confuse AIDA with irrelevant context.`;

export async function llmRouter(message: string): Promise<WhiteboardRouterVerdict> {
  if (!message?.trim()) return "skip";

  try {
    const res = await getOpenAI().chat.completions.create({
      model:       "gpt-4o-mini",
      temperature: 0,
      max_tokens:  4,
      messages: [
        { role: "system", content: ROUTER_SYSTEM_PROMPT },
        { role: "user",   content: message },
      ],
    });
    const raw = res.choices[0]?.message?.content?.trim().toLowerCase() ?? "";
    return raw.startsWith("attach") ? "attach" : "skip";
  } catch (err) {
    console.warn("[aidaWhiteboardRouter] LLM router failed, defaulting to skip:", err);
    return "skip";
  }
}

// ─── Combined entry point ───────────────────────────────────────────────────

// Returns a single verdict per message. Saves the LLM call when the regex
// is decisive.
export async function shouldAttachWhiteboard(message: string): Promise<WhiteboardRouterVerdict> {
  const pre = regexPrefilter(message);
  if (pre === "must_attach")     return "attach";
  if (pre === "must_not_attach") return "skip";
  return llmRouter(message);
}

// ─── Framing block ──────────────────────────────────────────────────────────
// Wraps the serialised transcript with explicit "this is observed activity,
// not your conversation" instructions. Used by the AIDA route only — never
// in the whiteboard's own prompt (which would be nonsensical).
export function wrapWhiteboardTranscript(serialisedTranscript: string): string {
  return `
========================================================
WHITEBOARD ACTIVITY (READ-ONLY — NOT YOUR CONVERSATION)
This is what the student is doing right now with the OTHER
AI on the playground whiteboard. It is shown to you so you
can help them with what they're working on. You did not say
any of these lines. You are NOT the "whiteboard AI" speaker.
Reference this in the third person — "I see you asked the
AI for X", "looks like the AI offered you a hint" — never
in the first person, never continue or complete what the
whiteboard AI was offering, never speak as if these lines
are part of your chat with the student.
========================================================
${serialisedTranscript}
========================================================
END WHITEBOARD ACTIVITY
========================================================`.trim();
}

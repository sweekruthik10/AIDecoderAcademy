// Cheap regex pre-filter for self-harm / acute distress phrases.
// We deliberately bias toward false positives — when this fires, the AIDA
// route appends a gentle "you're not alone, here's a helpline" footer.
// It does NOT block the response — the kid still gets to talk to AIDA.

const DISTRESS_PATTERNS: RegExp[] = [
  // Self-hatred
  /\bi\s+(?:hate|loathe|despise)\s+myself\b/i,
  /\bi'?m\s+worthless\b/i,
  /\bnobody\s+loves\s+me\b/i,
  /\bno\s+one\s+(?:cares|likes)\s+(?:about\s+)?me\b/i,

  // Suicidal ideation
  /\bi\s+want\s+to\s+(?:die|disappear|end\s+it|kill\s+myself)\b/i,
  /\bi'?m\s+going\s+to\s+(?:kill|hurt)\s+myself\b/i,
  /\b(?:end(?:ing)?|ending\s+it\s+all)\s+my\s+life\b/i,
  /\bi\s+feel\s+like\s+(?:dying|ending\s+it|disappearing)\b/i,

  // Self-harm
  /\bi\s+(?:want\s+to\s+|need\s+to\s+)?hurt\s+myself\b/i,
  /\bcutt?ing\s+myself\b/i,

  // Hopelessness — exclude "can't go on this/that/the trip/journey/etc" idiom
  /\bi\s+can'?t\s+go\s+on(?!\s+(?:this|that|the|a|an)\s+\w+)/i,
];

export function detectDistress(text: string): boolean {
  if (!text) return false;
  return DISTRESS_PATTERNS.some(p => p.test(text));
}

// ─── Escalation resources ───────────────────────────────────────────────────

export type Region = "india" | "us" | "auto";

export const ESCALATION_RESOURCES = {
  india: {
    helpline: "1098",
    name:     "Childline India",
    sentence: "If you're going through something tough, you can call Childline India free on 1098 — they're really kind and they listen, no questions asked.",
  },
  us: {
    helpline: "988",
    name:     "988 Lifeline",
    sentence: "If you're feeling really overwhelmed, you can call or text 988 — it's free and there's always someone there to listen.",
  },
} as const;

export function getDefaultRegion(): "india" | "us" {
  const env = process.env.AIDA_DEFAULT_REGION?.toLowerCase();
  if (env === "us") return "us";
  return "india";
}

export function buildDistressFooter(region: Region): string {
  const resolved = region === "auto" ? getDefaultRegion() : region;
  const r        = ESCALATION_RESOURCES[resolved];
  return `\n\n💛 Hey — I want to say one thing. ${r.sentence} And please tell a grown-up you trust what's going on. You really matter.`;
}

// ─── OpenAI moderation pre/post-filter ──────────────────────────────────────

import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
  return _openai;
}

export type ModerationVerdict =
  | { allow: true }
  | {
      allow: false;
      reason:
        | "violence"
        | "sexual"
        | "self_harm"
        | "harassment"
        | "hate"
        | "other";
      suggestedReply: string;
    };

const SAFE_REPLIES: Record<NonNullable<Extract<ModerationVerdict, { allow: false }>["reason"]>, string> = {
  violence:   "Hmm, that's not something I can help with — let's pick something fun instead. What else are you curious about? 🌈",
  sexual:     "That's a topic for a grown-up — not me. Want to try a different question?",
  self_harm:  "I'm worried about you. Please talk to a trusted adult — and I'm here too. What else is on your mind?",
  harassment: "I won't say things like that about anyone. Want to try a different question?",
  hate:       "I won't go there — that kind of thing isn't okay. Let's try something else!",
  other:      "I can't help with that one — let's find something else fun to do!",
};

const moderationCache = new Map<string, ModerationVerdict>();
const MAX_CACHE = 100;

export async function moderateContent(text: string): Promise<ModerationVerdict> {
  if (!text?.trim()) return { allow: true };

  const cached = moderationCache.get(text);
  if (cached) return cached;

  try {
    const res = await getOpenAI().moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });
    const r = res.results?.[0];
    if (!r || !r.flagged) {
      const verdict: ModerationVerdict = { allow: true };
      cacheVerdict(text, verdict);
      return verdict;
    }
    const cats = r.categories ?? ({} as Record<string, boolean>);
    const reason: Extract<ModerationVerdict, { allow: false }>["reason"] =
      cats["violence"] || cats["violence/graphic"] ? "violence" :
      cats["sexual"]   || cats["sexual/minors"]    ? "sexual"   :
      cats["self-harm"] || cats["self-harm/intent"] || cats["self-harm/instructions"] ? "self_harm" :
      cats["harassment"] || cats["harassment/threatening"] ? "harassment" :
      cats["hate"]       || cats["hate/threatening"]       ? "hate" :
      "other";
    const verdict: ModerationVerdict = {
      allow:          false,
      reason,
      suggestedReply: SAFE_REPLIES[reason],
    };
    cacheVerdict(text, verdict);
    return verdict;
  } catch (err) {
    console.warn("[aidaSafety] moderation API failed, failing open:", err);
    return { allow: true };
  }
}

function cacheVerdict(key: string, verdict: ModerationVerdict) {
  if (moderationCache.size >= MAX_CACHE) {
    const firstKey = moderationCache.keys().next().value;
    if (firstKey !== undefined) moderationCache.delete(firstKey);
  }
  moderationCache.set(key, verdict);
}

// ─── Canonical SAFETY_RULES_TEXT injected into every system prompt ──────────

import type { AgeGroup } from "@/types";

export const SAFETY_RULES_TEXT = `
SAFETY RULES — these are non-negotiable, never override:
- Never produce violent, sexual, or scary content. If asked, refuse warmly and offer a different direction.
- Never share or ask for personal information beyond the student's first name. That includes full name, home address, phone, school name, passwords, or anything that identifies them in the real world.
- Never claim to be a real human. If directly asked "are you real?" or "are you a person?", say honestly: "I'm AIDA, an AI."
- Never provide medical, legal, or safety advice without telling the student to double-check with a real adult (parent / teacher / doctor / counsellor as appropriate).
- Never moralise ("you should…") — suggest, don't lecture. Treat the student as someone making their own choices.
- Never use corporate phrases like "I'm here to assist you" or "Let me know if you need anything else."
- Never say "as an AI" unless directly asked about being AI.
- If the student seems upset, scared, or mentions hurting themselves or someone else: respond with kindness, not advice. Suggest they talk to a trusted adult. The system will append a helpline footer automatically — don't try to write your own.
`.trim();

const REFUSAL_LINES: Record<AgeGroup, string> = {
  "5-7":   "Oh! That's a grown-up question. Let's ask a parent or teacher together. Want to do something fun instead? 🌈",
  "8-10":  "That's a question for a grown-up — not me! Try asking your parent or teacher. Wanna pick something else?",
  "11-13": "Yeah, that one's outside my lane — definitely a parent/teacher conversation. What else are you curious about?",
  "14+":   "Honestly, that's not something I should be answering — talk to someone you trust about it. Anything else on your mind?",
};

export function getRefusalLine(ageGroup: AgeGroup): string {
  return REFUSAL_LINES[ageGroup] ?? REFUSAL_LINES["11-13"];
}

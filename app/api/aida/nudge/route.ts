import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import { OBJECTIVES, toLmsId } from "@/lib/objectives";
import { getStagedRubric } from "@/lib/objectiveRubrics";

// Lightweight micro-endpoint for AIDA's "thought bubble" nudges.
//
// Trigger: every time the kid sends a new whiteboard prompt, the AidaAssistant
// hits this with the prompt text + active objective. It returns ONE short
// reaction line ("oh, you're trying intent — nice"), classified by `kind`:
//
//   "progress"    — kid is clearly working on a known step of the objective
//   "encourage"   — generic warm acknowledgement (no specific step matched)
//   "stray"       — prompt has nothing to do with the active objective
//
// Kept deliberately tiny: gpt-4o-mini, 80 tokens, json mode, ~400ms typical.

export const runtime     = "nodejs";
export const maxDuration = 15;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface NudgeRequest {
  userPrompt:   string;
  objectiveId?: string | null;
  ageGroup?:    string;
  displayName?: string;
  recentHistory?: string[];   // last few user prompts for stray-detection context
  attemptCount?: number;      // # of validator attempts for this objective so far
  lastTier?: "distinction" | "merit" | "pass" | "fail" | null;
}

interface NudgeResponse {
  text: string;
  kind: "progress" | "encourage" | "stray";
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", maxLength: 140 },
    kind: { type: "string", enum: ["progress", "encourage", "stray"] },
  },
  required: ["text", "kind"],
} as const;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const body = (await req.json()) as NudgeRequest;
    const prompt = (body.userPrompt ?? "").slice(0, 1000).trim();
    if (!prompt) return Response.json({ text: "", kind: "encourage" } satisfies NudgeResponse);

    const ageGroup = body.ageGroup ?? "11-13";
    const name     = body.displayName ?? "you";

    // Resolve objective + (optional) staged rubric for richer step awareness.
    let objectiveSummary = "(no active objective — free play)";
    let stepHints        = "";
    if (body.objectiveId) {
      const objective = OBJECTIVES.find(o => o.id === body.objectiveId);
      if (objective) {
        objectiveSummary =
          `${objective.title}: ${objective.description}`;
      }
      const lmsId = body.objectiveId.startsWith("l") ? body.objectiveId : toLmsId(body.objectiveId);
      const staged = getStagedRubric(lmsId);
      if (staged) {
        // OBJ 10 uses Think It (intent / assumptions / audience / success) +
        // Story It (one-sentence story / 3 panels) + Create It (final image).
        // OBJ 6 has a similar Think It Canvas + Avatar Identity Card.
        stepHints = `
Known steps for this objective (use these step names when relevant):
- "Think It" canvas: intent, assumptions, audience, success
- "Story It": one-sentence story, panel 1, panel 2, panel 3 (punchline), funny test
- "Create It": generate / upload the final comic`.trim();
      }
    }

    const history = (body.recentHistory ?? [])
      .slice(-3)
      .map((h, i) => `(prev ${i + 1}) ${h.slice(0, 180)}`)
      .join("\n");

    // Attempt-aware tone shaping. Research on learning loops (Wiliam 2018,
    // Hattie 2012): corrective feedback works on attempts 1-2, but by attempt
    // 3+ kids stop hearing "try again" — they need metacognitive prompts
    // ("what was different this time?") and small concrete wins surfaced.
    const attemptCount = Math.max(0, body.attemptCount ?? 0);
    const lastTier     = body.lastTier ?? null;
    let toneGuidance = "";
    if (attemptCount === 0) {
      toneGuidance = "Tone: warm and curious. This is their FIRST attempt — no validator history yet. React to the prompt itself, not their journey.";
    } else if (attemptCount === 1) {
      toneGuidance = `Tone: encouraging, specific. They've validated once${lastTier ? ` (got "${lastTier}")` : ""}. If they're refining the same step, acknowledge the iteration without praising effort generically.`;
    } else if (attemptCount === 2) {
      toneGuidance = `Tone: practical. They've tried ${attemptCount} times${lastTier ? ` (last: "${lastTier}")` : ""}. Skip "you've got this" — instead name what's DIFFERENT about this prompt versus the last try. If you can't see a difference, gently flag it.`;
    } else {
      toneGuidance = `Tone: metacognitive coach. They've tried ${attemptCount} times${lastTier ? ` (last: "${lastTier}")` : ""}. Ask ONE pointed reflection (e.g. "what's the new bet this time?") instead of pep talk. Never use "wrong"; use "still vague" or "still generic". Treat them like a colleague, not a learner.`;
    }

    const system = `
You are AIDA — a curious-friend AI tutor for a ${ageGroup}-year-old student named ${name}.

You are NOT replying to the student. You are producing a SHORT inner-thought line
that appears as a thought bubble in the corner of the screen — like a kind friend
watching them work and reacting under their breath.

Rules:
- 1 sentence. Max 18 words. No greeting. No "you can do it!" platitudes.
- Reference what they're DOING, by step name when obvious. Be specific.
- If their prompt clearly fits a step of the objective → kind="progress".
  Example outputs:
    "Oh — you're working the audience step. Specific person beats 'my friends'."
    "Nice, panel 3 punchline coming together."
- If the prompt is fine but step is unclear → kind="encourage". Keep it warm
  but specific to what they typed. NEVER generic.
  Example: "Three colour ideas in one prompt — bold. Let's see."
- If the prompt is OFF-TOPIC vs the objective → kind="stray". Gently redirect.
  Example: "Cool but… that's a different game. Worksheet's still on the intent step."
- No emoji. No exclamation marks unless natural. Speak like a teenage older cousin.

Current objective: ${objectiveSummary}
${stepHints}

${toneGuidance}
${history ? "\nRecent prompts:\n" + history : ""}
`.trim();

    const completion = await openai.chat.completions.create({
      model:           "gpt-4o-mini",
      response_format: {
        type:        "json_schema",
        json_schema: { name: "aida_nudge", schema: SCHEMA, strict: true },
      },
      temperature: 0.7,
      max_tokens:  120,
      messages: [
        { role: "system", content: system },
        { role: "user",   content: `Student just typed in the whiteboard: ${prompt}` },
      ],
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as NudgeResponse;
    return Response.json(parsed);
  } catch (err) {
    console.error("[api/aida/nudge]", err);
    return Response.json({ text: "", kind: "encourage" } satisfies NudgeResponse);
  }
}

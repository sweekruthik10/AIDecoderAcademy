// Reflection engine — runs the LLM, persists to session_reflections,
// merges into profiles.learner_model under an advisory lock.
//
// Server-only. Do not import from client components.

import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase";
import {
  hydrateLearnerModel,
  mergeReflection,
  type LearnerModel,
  type ReflectionSurface,
  type SessionMetrics,
  type SessionReflectionResult,
} from "@/lib/learnerModel";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const REFLECTION_SYSTEM_PROMPT = `
You are an educational analyst. Given a short transcript between a student and an AI tutor (or playground / classroom), extract structured signals about the student.

Return ONLY JSON with this exact shape:
{
  "concepts_demonstrated": [{ "concept": string, "confidence": number (0..1), "evidence": string }],
  "concepts_struggled":   [{ "concept": string, "confidence": number (0..1), "evidence": string }],
  "communication_style":  { "vocabulary_level": string, "thinking_style": string, "curiosity_level": string, "help_seeking": string },
  "effective_strategies": { "what_worked": string, "what_didnt": string },
  "engagement":           { "level": "low"|"moderate"|"high", "frustration_moments": string[], "delight_moments": string[] },
  "domain_interests":     string[],
  "adaptation_suggestions": { "analogy_domain": string, "humor_level": "none"|"light"|"playful", "explanation_depth": "simple"|"moderate"|"deep", "pacing": "fast"|"moderate"|"careful" },
  "confidence_assessment": string
}

Rules:
- Be CONSERVATIVE: if you cannot clearly justify a signal from the transcript, omit it. Use [] not made-up entries.
- Confidence < 0.6 means "tentative". Use 0.9+ only when the transcript is unambiguous.
- Concept names should be short snake_case nouns: "prompt_crafting", "visual_description", "narrative_design", "audio_direction", "color_theory", etc.
- Evidence must quote or paraphrase the actual transcript — no hallucinations.
- Empty arrays are fine. Missing fields are NOT fine — always emit the full shape.
`.trim();

// Tunables
export const MAX_MESSAGES = 50;           // trailing window sent to the LLM
export const RATE_LIMIT_WINDOW_MS = 60_000; // per-student debounce
export const DAILY_REFLECTION_CAP = 50;
const TOKENS_IN_COST_PER_M  = 0.15;        // gpt-4o-mini ($/M tokens)
const TOKENS_OUT_COST_PER_M = 0.60;

export interface ReflectInput {
  profile_id: string;
  session_id: string | null;
  surface: ReflectionSurface;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  metrics?: SessionMetrics;
  session_started_at: string;
  session_ended_at?: string;
}

export type ReflectStatus =
  | "reflected"
  | "metrics_only"
  | "rate_limited"
  | "daily_cap"
  | "no_substance"
  | "llm_failed";

export interface ReflectOutcome {
  status: ReflectStatus;
  reflection_id?: string;
  concepts?: number;
  cost?: number;
}

function truncate(text: string, limit: number) {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + " …[truncated]";
}

function formatTranscript(messages: ReflectInput["messages"]): string {
  // Use a sliding window — earliest summarised, last MAX_MESSAGES kept verbatim.
  const trimmed = messages.length > MAX_MESSAGES
    ? [
        { role: "system" as const, content: `[Earlier ${messages.length - MAX_MESSAGES} messages omitted for brevity.]` },
        ...messages.slice(-MAX_MESSAGES),
      ]
    : messages;
  return trimmed
    .map(m => `${m.role.toUpperCase()}: ${truncate(String(m.content ?? ""), 1500)}`)
    .join("\n\n");
}

function hasSubstance(messages: ReflectInput["messages"]): boolean {
  const userMsgs = messages.filter(m => m.role === "user");
  if (userMsgs.length === 0) return false;
  return userMsgs.some(m => (m.content ?? "").trim().length > 20 || (m.content ?? "").includes("?"));
}

async function callReflectionLLM(transcript: string): Promise<{
  result: SessionReflectionResult;
  tokens_in: number;
  tokens_out: number;
}> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: REFLECTION_SYSTEM_PROMPT },
          { role: "user",   content: transcript },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as SessionReflectionResult;
      return {
        result: parsed,
        tokens_in:  completion.usage?.prompt_tokens     ?? 0,
        tokens_out: completion.usage?.completion_tokens ?? 0,
      };
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

function estimateCost(tokens_in: number, tokens_out: number): number {
  return (tokens_in / 1_000_000) * TOKENS_IN_COST_PER_M
       + (tokens_out / 1_000_000) * TOKENS_OUT_COST_PER_M;
}

/** Server-side reflection runner. Safe to call from any API route or cron. */
export async function reflectAndMerge(input: ReflectInput): Promise<ReflectOutcome> {
  const sb = createAdminClient();
  const now = new Date();

  if (!hasSubstance(input.messages)) {
    return { status: "no_substance" };
  }

  // 1) Per-student 60s debounce.
  const { data: recent } = await sb
    .from("session_reflections")
    .select("reflected_at")
    .eq("profile_id", input.profile_id)
    .order("reflected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent && (now.getTime() - new Date(recent.reflected_at).getTime()) < RATE_LIMIT_WINDOW_MS) {
    return { status: "rate_limited" };
  }

  // 2) Daily cap.
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await sb
    .from("session_reflections")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", input.profile_id)
    .gte("reflected_at", dayStart.toISOString());
  if ((count ?? 0) >= DAILY_REFLECTION_CAP) {
    return { status: "daily_cap" };
  }

  // 3) LLM call (1 retry inside).
  let reflectionData: SessionReflectionResult;
  let tokens_in = 0, tokens_out = 0;
  try {
    const r = await callReflectionLLM(formatTranscript(input.messages));
    reflectionData = r.result;
    tokens_in = r.tokens_in;
    tokens_out = r.tokens_out;
  } catch (e) {
    console.error("[reflect] LLM failed", e);
    return { status: "llm_failed" };
  }

  const llm_cost = estimateCost(tokens_in, tokens_out);

  // 4) Persist reflection row.
  const sessionEndedAt = input.session_ended_at ?? now.toISOString();
  const { data: inserted, error: insErr } = await sb
    .from("session_reflections")
    .insert({
      profile_id:         input.profile_id,
      session_id:         input.session_id,
      surface:            input.surface,
      reflection_data:    reflectionData,
      metrics:            input.metrics ?? {},
      session_started_at: input.session_started_at,
      session_ended_at:   sessionEndedAt,
      llm_cost,
      llm_tokens_in:      tokens_in,
      llm_tokens_out:     tokens_out,
    })
    .select("id")
    .single();
  if (insErr) {
    console.error("[reflect] failed to persist reflection", insErr);
    return { status: "llm_failed" };
  }

  // 5) Read current learner_model, merge, write back under advisory lock.
  const { data: profileRow } = await sb
    .from("profiles")
    .select("learner_model")
    .eq("id", input.profile_id)
    .single();

  const existing = hydrateLearnerModel(profileRow?.learner_model);
  const merged: LearnerModel = mergeReflection(existing, reflectionData, input.surface, input.metrics);

  const { error: lockErr } = await sb.rpc("lock_and_update_learner_model", {
    p_profile_id: input.profile_id,
    p_learner_model: merged as unknown as Record<string, unknown>,
  });
  if (lockErr) {
    console.warn("[reflect] RPC lock failed, falling back to direct update", lockErr.message);
    await sb.from("profiles")
      .update({ learner_model: merged })
      .eq("id", input.profile_id);
  }

  // 6) Stamp reflection as merged.
  await sb.from("session_reflections")
    .update({ merged_into_model_at: new Date().toISOString() })
    .eq("id", inserted.id);

  return {
    status: "reflected",
    reflection_id: inserted.id,
    concepts: reflectionData.concepts_demonstrated?.length ?? 0,
    cost: llm_cost,
  };
}

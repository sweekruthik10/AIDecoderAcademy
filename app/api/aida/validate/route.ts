import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import { getRubric, genericRubric, type ObjectiveRubric } from "@/lib/objectiveRubrics";
import { buildTeacherSystemPrompt } from "@/lib/teacherPersona";
import { moderateContent } from "@/lib/aidaSafety";
import { applyCopyMode } from "@/lib/validatorCopyMode";
import { createAdminClient } from "@/lib/supabase";
import type { AgeGroup } from "@/types";

export const runtime     = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// One-shot JSON validation. The Validator Teacher reads the rubric for the
// active objective and scores the student's work in the playground chat.
//
// Inputs:
//   lmsId       — canonical curriculum id ('l1-03'). Falls back to a generic
//                  rubric if the rubric file doesn't have an entry yet.
//   fallbackTitle / fallbackTask — used only when no rubric exists, so the
//                  validator still has *something* to grade against.
//   messages    — playground chat (role + content + outputType + url for
//                  media). Already serialised on the client.
//   profile     — name + age_group, so the validator can adapt vocabulary.
//
// Returns strict JSON. The teacher dialogue UI consumes `summary` for TTS,
// the result panel renders the rest.

interface ValidateRequest {
  lmsId:          string;
  fallbackTitle?: string;
  fallbackTask?:  string;
  messages:       { role: "user" | "assistant"; content: string; outputType?: string }[];
  profile: {
    display_name: string;
    age_group:    string;
  };
}

interface ValidatorJSON {
  score:        number;
  tier:         "distinction" | "merit" | "pass" | "fail";
  passed:       boolean;
  summary:      string;
  strengths:    string[];
  improvements: string[];
  hintForRetry: string | null;
}

function serializeMessages(messages: ValidateRequest["messages"]): string {
  if (!messages.length) return "(student has not yet produced any work)";
  return messages.map((m, i) => {
    const ot = m.outputType ? ` [${m.outputType}]` : "";
    if (m.role === "user") return `[${i}] STUDENT${ot}: ${m.content}`;
    // assistant content for image/audio/slides may be a URL or JSON; keep as-is
    return `[${i}] AI${ot}: ${m.content}`;
  }).join("\n");
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const body = (await req.json()) as ValidateRequest;
    if (!body?.lmsId)    return new Response("Missing lmsId", { status: 400 });
    if (!body?.messages) return new Response("Missing messages", { status: 400 });

    const rubric = getRubric(body.lmsId)
      ?? genericRubric(body.fallbackTitle ?? body.lmsId, body.fallbackTask ?? "Complete the assigned task and submit your output to the chat.");

    const profile = body.profile ?? { display_name: "Student", age_group: "11-13" as AgeGroup };

    // Attempts-aware copy mode: at attempt 3+ the validator switches from
    // corrective to metacognitive prompts. Cheap row count, non-blocking.
    let attemptCount = 0;
    try {
      const supabase = createAdminClient();
      const { data: prof } = await supabase
        .from("profiles").select("id").eq("clerk_user_id", userId).single();
      if (prof?.id) {
        const { count } = await supabase
          .from("objective_attempts")
          .select("*", { count: "exact", head: true })
          .eq("profile_id", prof.id)
          .eq("lms_id", body.lmsId);
        attemptCount = count ?? 0;
      }
    } catch (err) {
      console.warn("[validate] attempts count failed, defaulting to 0:", err);
    }

    const baseSystemPrompt = buildTeacherSystemPrompt({
        rubric,
        profile: { display_name: profile.display_name, age_group: profile.age_group as AgeGroup },
      })

    const systemPrompt = applyCopyMode(baseSystemPrompt, attemptCount, profile.display_name);

    const serialised = serializeMessages(body.messages);

    // Defensive moderation on the submitted student work
    const verdict = await moderateContent(serialised);
    if (!verdict.allow) {
      console.warn("[validate] flagged submission, refusing to grade:", verdict.reason);
      return new Response(
        JSON.stringify({
          score:        0,
          tier:         "fail",
          passed:       false,
          summary:      "I can't grade this — let's pick a different submission. Talk to a grown-up if something's bothering you.",
          strengths:    [],
          improvements: [],
          hintForRetry: null,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const userPrompt = `STUDENT'S WORK IN THE PLAYGROUND:\n${serialised}\n\nGrade the work now. Return only the JSON object.`;

    const completion = await openai.chat.completions.create({
      model:           "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature:     0.3,
      max_tokens:      600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: ValidatorJSON;
    try {
      parsed = JSON.parse(raw) as ValidatorJSON;
    } catch (err) {
      console.error("[AIDA validate] JSON parse failed:", raw, err);
      return new Response("Validator returned invalid JSON", { status: 502 });
    }

    // Defensive: clamp score, derive passed from score, normalise tier.
    const score = Math.max(0, Math.min(100, Math.round(parsed.score ?? 0)));
    const passed = score >= 80;
    const tier: ValidatorJSON["tier"] =
      score >= 100 ? "distinction" :
      score >= 90  ? "merit"        :
      score >= 80  ? "pass"         :
      "fail";

    const result: ValidatorJSON = {
      score,
      tier,
      passed,
      summary:      String(parsed.summary ?? "").trim() || "I've finished reviewing your work.",
      strengths:    Array.isArray(parsed.strengths)    ? parsed.strengths.slice(0, 4)    : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.slice(0, 4) : [],
      hintForRetry: passed ? null : (typeof parsed.hintForRetry === "string" ? parsed.hintForRetry : null),
    };

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[AIDA validate]", err);
    return new Response("Internal server error", { status: 500 });
  }
}

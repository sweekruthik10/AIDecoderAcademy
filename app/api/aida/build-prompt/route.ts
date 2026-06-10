import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getObjectiveById } from "@/lib/objectives";
import { getRubric } from "@/lib/objectiveRubrics";
import { getWorksheetSchema } from "@/lib/worksheetSchemas";

export const runtime     = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface BuildPromptBody {
  lmsId?:              string;
  activeObjectiveId?:  string | null;
  worksheetData?:      Record<string, string | boolean>;
}

// Render the student's worksheet into a `LABEL: value` block keyed by section,
// so the model can reason about Think It vs Story It separately.
function renderWorksheetForLLM(
  lmsId: string,
  data: Record<string, string | boolean>,
): string {
  const schema = getWorksheetSchema(lmsId);
  if (!schema) {
    // Fallback — emit field-id keys raw.
    return Object.entries(data)
      .filter(([, v]) => v !== "" && v !== undefined && v !== null)
      .map(([k, v]) => `- ${k}: ${typeof v === "boolean" ? (v ? "yes" : "no") : v}`)
      .join("\n");
  }

  const blocks: string[] = [];
  for (const section of schema.sections) {
    const lines: string[] = [];
    for (const field of section.fields) {
      const value = data[field.id];
      const isEmpty = value === undefined || value === null
        || (typeof value === "string" && !value.trim());
      if (isEmpty) continue;
      const label  = field.label.replace(/\s+/g, " ").trim();
      const rendered = typeof value === "boolean" ? (value ? "yes" : "no") : value;
      lines.push(`  - ${label}: ${rendered}`);
    }
    if (lines.length > 0) blocks.push(`### ${section.title.replace(/\s+/g, " ").trim()}\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n") || "(student left the worksheet empty)";
}

const SYSTEM_PROMPT = `You are a Prompt Engineer Coach for students aged 11-16 learning to use AI creative tools.

Given a student's planning worksheet plus an optional learning objective with a rubric, produce the SET of copy-paste-ready prompts the student needs to COMPLETE that objective.

FIRST decide HOW MANY prompts the objective needs — read the objective's goal:
- If it asks for several variations or steps (e.g. "three image prompts", "all four outputs", "three versions"), return ONE prompt PER variation/step.
- If it's a single creation, return EXACTLY ONE prompt.
- Never pad — only the prompts genuinely required (usually 1, at most 4).

For EACH prompt apply prompt-engineering best practice: ROLE (act as…), TASK (exact verb + what to produce), AUDIENCE & CONTEXT (from the Think It answers), CONSTRAINTS (length/format/tone/success), ANCHOR EXAMPLE (if the student gave one). When a rubric is provided, design each prompt so following it reaches MERIT at minimum and stretches toward DISTINCTION.

Return STRICT JSON in this exact shape:
{
  "prompts": [
    {
      "label": "<3-5 word name for this prompt, e.g. 'Photorealistic version'>",
      "prompt": "<the CLEAN prompt text the student copies — 40-160 words, no quotes, no headings, no commentary, never mentions the worksheet/rubric/teacher>",
      "why": "<ONE short sentence, max 15 words, on what makes this prompt work, tied to the goal>"
    }
  ],
  "attachment": "<ONE short line telling the student what to attach or do for THIS objective — e.g. 'Upload a clear front-facing photo to restyle' or 'When done, drop your finished comic image in the chat for SAGE to grade'. Use an EMPTY string if nothing needs attaching.>"
}

Rules:
- The "prompt" field is the ONLY thing the student copies — keep it clean and self-contained (no labels, no 'why' mixed in).
- Keep "why" to one short line; keep "attachment" to one short line.
- Use the student's own words/phrases where natural — do NOT erase their voice.`;

function buildObjectiveContext(objectiveLegacyId?: string | null): string {
  if (!objectiveLegacyId) return "";
  const obj = getObjectiveById(objectiveLegacyId);
  if (!obj) return "";
  const lines: string[] = [];
  lines.push(`OBJECTIVE — ${obj.emoji} ${obj.title}`);
  lines.push(`Goal: ${obj.description}`);
  lines.push(`Output type: ${obj.outputType}`);

  // The schema's legacyId is the arena-room id like "a1-10". Rubric lookup
  // uses lmsId like "l1-10" — derive it the same way the schema does.
  const schemaLmsMatch = obj.id.match(/^a(\d+)-(\d+)$/);
  const lmsId = schemaLmsMatch
    ? `l${schemaLmsMatch[1]}-${schemaLmsMatch[2].padStart(2, "0")}`
    : "";
  const rubric = lmsId ? getRubric(lmsId) : undefined;
  if (rubric) {
    lines.push(`Tier: ${rubric.tier}  ·  Tools: ${rubric.tools.join(", ")}`);
    lines.push(`Pass: ${rubric.passCriteria}`);
    lines.push(`Merit: ${rubric.meritCriteria}`);
    lines.push(`Distinction: ${rubric.distinctionCriteria}`);
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as BuildPromptBody;
    const lmsId             = (body.lmsId ?? "").trim();
    const activeObjectiveId = body.activeObjectiveId ?? null;
    const worksheetData     = body.worksheetData ?? {};

    const filledCount = Object.values(worksheetData).filter(v =>
      typeof v === "string" ? v.trim().length > 0 : typeof v === "boolean",
    ).length;

    if (!lmsId && !activeObjectiveId && filledCount === 0) {
      return NextResponse.json(
        { error: "Fill in at least one worksheet field first." },
        { status: 400 },
      );
    }

    const worksheetBlock = lmsId
      ? renderWorksheetForLLM(lmsId, worksheetData)
      : "(no worksheet schema; raw data below)";
    const objectiveBlock = buildObjectiveContext(activeObjectiveId);

    const userMessage = [
      objectiveBlock ? objectiveBlock : "(no active objective — produce a strong general prompt from the worksheet)",
      "",
      "STUDENT'S WORKSHEET",
      worksheetBlock,
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userMessage },
      ],
      temperature: 0.6,
      max_tokens:  900,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json({ error: "Empty response from prompt builder." }, { status: 502 });
    }

    let parsed: { prompts?: unknown; attachment?: unknown };
    try { parsed = JSON.parse(raw); }
    catch { return NextResponse.json({ error: "Prompt builder returned malformed output." }, { status: 502 }); }

    // Normalize + guard the shape so the client always gets a clean array.
    const prompts = Array.isArray(parsed.prompts)
      ? parsed.prompts
          .map((p) => {
            const o = (p ?? {}) as Record<string, unknown>;
            const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
            const label  = typeof o.label  === "string" && o.label.trim() ? o.label.trim() : "Your prompt";
            const why    = typeof o.why    === "string" ? o.why.trim() : "";
            return prompt ? { label, prompt, why } : null;
          })
          .filter((p): p is { label: string; prompt: string; why: string } => p !== null)
          .slice(0, 4)
      : [];

    if (prompts.length === 0) {
      return NextResponse.json({ error: "Prompt builder produced no usable prompts." }, { status: 502 });
    }

    const attachment = typeof parsed.attachment === "string" ? parsed.attachment.trim() : "";

    // Back-compat: keep `prompt` (first one) for any existing caller.
    return NextResponse.json({ prompts, attachment, prompt: prompts[0].prompt });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[build-prompt]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Extracts a student's filled-in worksheet DOCX (downloaded template, completed
// offline, then re-uploaded via the whiteboard plus icon) into a flat
// key/value map matching the WorksheetSchema field IDs.
//
// Called by ObjectiveSubmissionPanel when it detects a document in the
// whiteboard chat. On success the panel writes the data to localStorage,
// making the WorksheetPopup show the pre-filled answers and allowing the
// validator to use the reliable inline-form path instead of the fragile
// file-extraction path.

import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import mammoth from "mammoth";
import { getWorksheetSchema } from "@/lib/worksheetSchemas";
import type { WorksheetField } from "@/lib/worksheetSchemas";

export const runtime  = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface Body {
  url:    string;
  format: "docx" | "pdf";
  lmsId:  string;
}

function buildFieldMappings(lmsId: string): string {
  const schema = getWorksheetSchema(lmsId);
  if (!schema) return "";
  const lines: string[] = [];
  for (const section of schema.sections) {
    for (const field of section.fields as WorksheetField[]) {
      if (field.kind === "yesno") {
        lines.push(
          `- "${field.id}": bold label "${field.label}" → answer below it is YES, NO, or ___ → true for YES, false otherwise`,
        );
      } else {
        lines.push(
          `- "${field.id}": bold label "${field.label}" → extract the text below it as a string; "" if blank / only underscores`,
        );
      }
    }
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const body = (await req.json()) as Body;
    if (!body?.url || !body?.format || !body?.lmsId) {
      return new Response("url, format, and lmsId are required", { status: 400 });
    }

    if (!getWorksheetSchema(body.lmsId)) {
      return new Response("Unknown lmsId", { status: 400 });
    }

    if (body.format !== "docx") {
      return jsonOk({});
    }

    let docText: string;
    try {
      const res = await fetch(body.url);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const ab     = await res.arrayBuffer();
      const buffer = Buffer.from(ab);
      const { value } = await mammoth.extractRawText({ buffer });
      docText = value
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } catch (err) {
      console.error("[parse-worksheet] extraction error:", err);
      return jsonOk({});
    }

    const fieldMappings = buildFieldMappings(body.lmsId);
    const sys = `You are extracting a student-completed worksheet from plain text that was extracted from a DOCX.

The DOCX was generated from a template. Each field has:
  - A BOLD LABEL line (the field heading)
  - Followed immediately by the student's answer, OR a line of underscores "___…___" if left blank.

FIELD IDs AND THEIR LABELS IN THE DOCUMENT:
${fieldMappings}

Rules:
- Return a single flat JSON object keyed by the field IDs above.
- For text fields: return the student's written text as a string. Empty string "" for blank/underscore lines.
- For boolean fields: return true if the answer is "YES" (case-insensitive), false if "NO" or blank.
- Trim leading/trailing whitespace from text answers.
- Do NOT include any key not listed above.
- JSON only — no explanation, no markdown.`;

    const completion = await openai.chat.completions.create({
      model:           "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature:     0.0,
      max_tokens:      3000,
      messages: [
        { role: "system", content: sys },
        { role: "user",   content: `WORKSHEET CONTENT:\n${docText.slice(0, 12000)}` },
      ],
    });

    let parsed: Record<string, string | boolean> = {};
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      parsed = {};
    }

    return jsonOk(parsed);
  } catch (err) {
    console.error("[parse-worksheet] error:", err);
    return jsonOk({});
  }
}

function jsonOk(data: Record<string, string | boolean>) {
  return new Response(JSON.stringify({ data }), {
    status:  200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

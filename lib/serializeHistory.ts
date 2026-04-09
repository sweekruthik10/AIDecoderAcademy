export interface HistoryMsg {
  role:        "user" | "assistant";
  content:     string;
  outputType?: string;
  isLoading?:  boolean;
}

const LOADING_TEXTS = new Set([
  "Generating your image...",
  "Writing the scene script and generating voices...",
  "Building your slides...",
]);

function isUsable(m: HistoryMsg): boolean {
  return (
    !m.isLoading &&
    !!m.content?.trim() &&
    m.content !== "__init__" &&
    !LOADING_TEXTS.has(m.content) &&
    m.content.length > 5
  );
}

function serializeAssistant(m: HistoryMsg): string {
  const type = m.outputType ?? "text";

  if (type === "image") {
    return "Assistant [image]: An image was generated";
  }

  if (type === "audio") {
    try {
      const p = JSON.parse(m.content);
      const narrator  = (p?.script?.narrator_text ?? "").slice(0, 200);
      const dialogues = (p?.script?.dialogues ?? [])
        .slice(0, 4)
        .map((d: { character: string; text: string }) => `${d.character}: ${d.text}`)
        .join(" | ");
      const body = [narrator, dialogues ? `Dialogues — ${dialogues}` : ""].filter(Boolean).join(". ");
      return `Assistant [audio]: ${body || "Audio was generated"}`.slice(0, 400);
    } catch {
      return "Assistant [audio]: Audio was generated";
    }
  }

  if (type === "slides") {
    try {
      const p = JSON.parse(m.content);
      const sections = (p?.sections ?? [])
        .map((s: { title: string; concepts: string[] }) =>
          `${s.title}: ${(s.concepts ?? []).slice(0, 2).join(", ")}`)
        .join(" | ");
      return `Assistant [slides]: "${p?.title ?? ""}" — ${sections}`.slice(0, 400);
    } catch {
      return "Assistant [slides]: Slides were generated";
    }
  }

  return `Assistant [${type}]: ${m.content.slice(0, 400)}`;
}

// Returns a plain-text transcript of the last N messages — used by image / audio / slides routes.
export function serializeHistory(messages: HistoryMsg[], n = 6): string {
  const relevant = messages.filter(isUsable).slice(-n);
  if (relevant.length === 0) return "";

  return relevant
    .map(m =>
      m.role === "user"
        ? `User: ${m.content.slice(0, 300)}`
        : serializeAssistant(m)
    )
    .join("\n");
}

// Returns an OpenAI-compatible messages array — used by the /api/chat route.
export function serializeForChat(
  messages: HistoryMsg[],
  n = 10,
): Array<{ role: "user" | "assistant"; content: string }> {
  const relevant = messages.filter(isUsable).slice(-n);

  return relevant.map(m => {
    if (m.role === "user") {
      return { role: "user" as const, content: m.content.slice(0, 500) };
    }
    const type = m.outputType ?? "text";
    if (type === "image") {
      return { role: "assistant" as const, content: "[An image was generated]" };
    }
    if (type === "audio") {
      try {
        const p = JSON.parse(m.content);
        const narrator  = (p?.script?.narrator_text ?? "").slice(0, 200);
        const dialogues = (p?.script?.dialogues ?? []).slice(0, 4)
          .map((d: { character: string; text: string }) => `${d.character}: ${d.text}`)
          .join(" | ");
        return { role: "assistant" as const, content: `[Audio: ${narrator}${dialogues ? ` | ${dialogues}` : ""}]`.slice(0, 400) };
      } catch {
        return { role: "assistant" as const, content: "[Audio was generated]" };
      }
    }
    if (type === "slides") {
      try {
        const p = JSON.parse(m.content);
        const sections = (p?.sections ?? []).map((s: { title: string }) => s.title).join(", ");
        return { role: "assistant" as const, content: `[Slides: "${p?.title}" covering ${sections}]`.slice(0, 300) };
      } catch {
        return { role: "assistant" as const, content: "[Slides were generated]" };
      }
    }
    return { role: m.role as "user" | "assistant", content: m.content.slice(0, 500) };
  });
}

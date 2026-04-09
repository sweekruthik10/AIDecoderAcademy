import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB cap on uploaded audio

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      console.error("[AIDA STT] DEEPGRAM_API_KEY is not set");
      return new Response("STT not configured", { status: 503 });
    }

    // Reject obviously oversized uploads before reading the body
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) {
      return new Response("Payload too large", { status: 413 });
    }

    const audioBuf = Buffer.from(await req.arrayBuffer());
    if (audioBuf.length > MAX_BODY_BYTES) {
      return new Response("Payload too large", { status: 413 });
    }
    if (audioBuf.length === 0) {
      return new Response(JSON.stringify({ transcript: "" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Strip codec parameter — Deepgram REST only wants the base MIME type.
    // Browser may send "audio/webm;codecs=opus" which Deepgram doesn't recognise.
    const rawCt      = req.headers.get("content-type") || "audio/webm";
    const deepgramCt = rawCt.split(";")[0].trim() || "audio/webm";

    const res = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en",
      {
        method:  "POST",
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Content-Type":  deepgramCt,
        },
        body: audioBuf,
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("[AIDA STT] Deepgram error:", res.status, errText);
      return new Response("STT failed", { status: 502 });
    }

    const data = await res.json();
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return new Response(JSON.stringify({ transcript }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[AIDA STT]", err);
    return new Response("Internal server error", { status: 500 });
  }
}

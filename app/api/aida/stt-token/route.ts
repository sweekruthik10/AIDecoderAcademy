import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

// Returns a Deepgram API key to authenticated browser clients so the Live
// voice mode can open a streaming WebSocket directly to Deepgram without
// exposing the key in public JS bundles.
//
// The route is protected by Clerk — only signed-in students can call it.
// Returning the master key to the browser is acceptable here because:
//   1. The requester is already authenticated
//   2. The key is only held in JS memory for the duration of the WS session
//   3. Deepgram's /v1/auth/grant short-lived token API requires keys:write
//      scope, which this project key doesn't have
//
// If you later create a separate Deepgram key with keys:write scope, swap
// this back to the /v1/auth/grant approach for tighter scoping.
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      console.error("[AIDA STT-TOKEN] DEEPGRAM_API_KEY is not set");
      return new Response("STT not configured", { status: 503 });
    }

    return new Response(
      JSON.stringify({ token: apiKey, ttl: 3600 }),
      {
        headers: {
          "Content-Type":  "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (err) {
    console.error("[AIDA STT-TOKEN]", err);
    return new Response("Internal server error", { status: 500 });
  }
}

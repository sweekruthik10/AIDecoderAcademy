// Pinecone client — integrated embedding (llama-text-embed-v2, 768 dims, cosine)
// Uses REST API directly for all operations — the SDK does not support
// integrated embedding upsert/search via its TypeScript methods yet.

import { Pinecone } from "@pinecone-database/pinecone";

let _client:    Pinecone | null = null;
let _indexHost: string  | null = null;

function getClient(): Pinecone {
  if (!_client) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) throw new Error("PINECONE_API_KEY not set in .env.local");
    _client = new Pinecone({ apiKey });
  }
  return _client;
}

async function getHost(): Promise<string> {
  if (_indexHost) return _indexHost;
  const name = process.env.PINECONE_INDEX ?? "ai-decoder-academy";
  const idx  = await getClient().describeIndex(name);
  _indexHost = idx.host;
  return _indexHost;
}

function apiKey(): string {
  return process.env.PINECONE_API_KEY!;
}

// ─── Upsert a creation ────────────────────────────────────────────────────────

export async function upsertCreation(params: {
  id:          string;
  profileId:   string;
  title:       string;
  content:     string;
  outputType:  string;
  tags:        string[];
  promptUsed?: string;
}): Promise<void> {
  const host = await getHost();
  const ns   = encodeURIComponent(params.profileId);

  const text = [
    params.title,
    params.promptUsed ?? "",
    params.content.slice(0, 1000),
    params.tags.join(" "),
    params.outputType,
  ].filter(Boolean).join("\n");

  // NDJSON body — one record per line
  const body = JSON.stringify({
    _id:        params.id,
    text,                    // field Pinecone embeds automatically
    title:      params.title,
    outputType: params.outputType,
    tags:       params.tags.join(","),
    promptUsed: params.promptUsed ?? "",
    createdAt:  new Date().toISOString(),
  });

  const res = await fetch(
    `https://${host}/records/namespaces/${ns}/upsert`,
    {
      method: "POST",
      headers: {
        "Api-Key":      apiKey(),
        "Content-Type": "application/x-ndjson",
      },
      body,
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Pinecone upsert ${res.status}: ${err}`);
  }

  console.log(`[Pinecone] Upserted ${params.id} → ns:${params.profileId}`);
}

// ─── Delete a creation ────────────────────────────────────────────────────────

export async function deleteCreation(id: string, profileId: string): Promise<void> {
  const host = await getHost();
  const ns   = encodeURIComponent(profileId);

  await fetch(`https://${host}/records/namespaces/${ns}/delete`, {
    method: "POST",
    headers: { "Api-Key": apiKey(), "Content-Type": "application/json" },
    body:    JSON.stringify({ ids: [id] }),
  });
}

// ─── Query top-K relevant past creations ─────────────────────────────────────

export interface ContextResult {
  id:         string;
  title:      string;
  outputType: string;
  tags:       string;
  promptUsed: string;
  score:      number;
}

export async function queryContext(params: {
  profileId: string;
  query:     string;
  topK?:     number;
}): Promise<ContextResult[]> {
  const host = await getHost();
  const ns   = encodeURIComponent(params.profileId);
  const topK = params.topK ?? 5;

  const res = await fetch(
    `https://${host}/records/namespaces/${ns}/search`,
    {
      method: "POST",
      headers: { "Api-Key": apiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        query:  { inputs: { text: params.query }, top_k: topK },
        fields: ["title", "outputType", "tags", "promptUsed"],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Pinecone search ${res.status}: ${err}`);
  }

  const data = await res.json();

  return (data?.result?.hits ?? []).map((hit: {
    _id:     string;
    _score?: number;
    fields?: Record<string, unknown>;
  }) => ({
    id:         hit._id,
    title:      String(hit.fields?.title      ?? ""),
    outputType: String(hit.fields?.outputType ?? "text"),
    tags:       String(hit.fields?.tags       ?? ""),
    promptUsed: String(hit.fields?.promptUsed ?? ""),
    score:      hit._score ?? 0,
  }));
}
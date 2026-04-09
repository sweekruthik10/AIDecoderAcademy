// Tiny helper that picks the correct upload endpoint per objective.
// Used by WorksheetPopup so it doesn't need to know per-objective routes.

export type UploadKind = "worksheet" | "image" | "video";

export interface UploadResult {
  url:      string;
  filename: string;
  format?:  "pdf" | "docx";
}

const ENDPOINT: Record<string, string> = {
  "l1-10": "/api/aida/obj10-upload",
  "l1-06": "/api/aida/obj6-upload",
};

export function getUploadEndpoint(lmsId: string, kind: UploadKind): string | null {
  const base = ENDPOINT[lmsId];
  if (!base) return null;
  return `${base}?kind=${kind}`;
}

export async function uploadFile(
  lmsId: string,
  kind:  UploadKind,
  file:  File,
): Promise<UploadResult> {
  const url = getUploadEndpoint(lmsId, kind);
  if (!url) throw new Error(`No upload endpoint for ${lmsId}/${kind}`);
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Upload failed (${res.status}): ${msg.slice(0, 160)}`);
  }
  return res.json() as Promise<UploadResult>;
}

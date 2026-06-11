// Tiny helper that picks the correct upload endpoint per objective.
// Used by WorksheetPopup so it doesn't need to know per-objective routes.

export type UploadKind = "worksheet" | "image" | "video" | "audio";

export interface UploadResult {
  url:      string;
  filename: string;
  format?:  "pdf" | "docx";
}

const ENDPOINT: Record<string, string> = {
  "l1-01": "/api/aida/obj1-upload",
  "l1-02": "/api/aida/obj2-upload",
  "l1-03": "/api/aida/obj3-upload",
  "l1-04": "/api/aida/obj4-upload",
  "l1-05": "/api/aida/obj5-upload",
  "l1-06": "/api/aida/obj6-upload",
  "l1-07": "/api/aida/obj7-upload",
  "l1-08": "/api/aida/obj8-upload",
  "l1-09": "/api/aida/obj9-upload",
  "l1-10": "/api/aida/obj10-upload",
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

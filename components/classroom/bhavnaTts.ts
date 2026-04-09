"use client";

// Shared, lightweight Bhavna-voice TTS player.
//
// Streams /api/aida/tts (role: "classroom") and plays the audio chunks in
// order. Deliberately minimal — unlike useTeacherVoice it does NOT touch the
// mic or the live-call engine, so passive surfaces (the hint bubble, the
// welcome panel) can speak a short line without that machinery.
//
// Pass an AbortSignal to cut playback (toggle off, panel close, unmount).

export async function speakBhavna(text: string, signal: AbortSignal): Promise<void> {
  if (!text.trim() || signal.aborted) return;

  const res = await fetch("/api/aida/tts", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ text, role: "classroom" }),
    signal,
  });
  if (!res.ok || !res.body) return;

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let   buf     = "";
  const queue: { audio: HTMLAudioElement; url: string }[] = [];
  let   playing = false;

  const playNext = () => {
    const item = queue.shift();
    if (!item) { playing = false; return; }
    playing = true;
    const { audio, url } = item;
    const done = () => { URL.revokeObjectURL(url); playNext(); };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);   // autoplay block / abort — fail quietly
  };

  signal.addEventListener("abort", () => {
    queue.forEach(({ audio, url }) => {
      try { audio.pause(); } catch { /* noop */ }
      URL.revokeObjectURL(url);
    });
    queue.length = 0;
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done || signal.aborted) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
      queue.push({ audio: new Audio(url), url });
      if (!playing) playNext();
    }
  }
}

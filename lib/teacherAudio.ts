// Streaming TTS helper for the Validator Teacher.
// Calls /api/aida/tts and plays back the SSE-streamed MP3 chunks in order.
//
// Exposes a `progress01()` callback so the UI can sync a typewriter to the
// actual audio progress instead of running on a fixed timer.

export interface SpeakHandle {
  cancel:     () => void;
  progress01: () => number; // 0 → 1, based on audio currentTime across queued chunks
}

export async function speakAsTeacher(text: string): Promise<SpeakHandle> {
  return speak(text, "teacher");
}

export async function speakAsAida(text: string): Promise<SpeakHandle> {
  return speak(text, "aida");
}

async function speak(text: string, role: "teacher" | "aida"): Promise<SpeakHandle> {
  const controller = new AbortController();

  // Each queue item carries its audio + estimated weight (we use chunk byte
  // size as a proxy for duration before metadata loads, then swap to real
  // duration once we know it).
  type Item = {
    audio:     HTMLAudioElement;
    url:       string;
    bytes:     number;
    duration:  number; // seconds; 0 until metadata loads
    finished:  boolean;
    isPlaying: boolean;
  };

  const queue: Item[] = [];
  let cancelled = false;
  let started   = false;
  let streamDone = false; // server sent [DONE]

  const cancel = () => {
    cancelled = true;
    controller.abort();
    for (const it of queue) {
      try { it.audio.pause(); } catch { /* ok */ }
      try { URL.revokeObjectURL(it.url); } catch { /* ok */ }
    }
    queue.length = 0;
  };

  // Progress: weight by duration (or bytes as fallback before metadata loads).
  // For the currently-playing item, use its currentTime fraction.
  const progress01 = (): number => {
    if (queue.length === 0) return streamDone ? 1 : 0;

    // Total weight across known items. If stream isn't done we don't know
    // the final total — assume the queue we have is a lower bound and cap
    // progress at 0.95 so the typewriter doesn't run past audio.
    let totalWeight   = 0;
    let elapsedWeight = 0;
    for (const it of queue) {
      const w = it.duration > 0 ? it.duration : it.bytes / 16000; // ~128kbps fallback
      totalWeight += w;
      if (it.finished) {
        elapsedWeight += w;
      } else if (it.isPlaying) {
        const t = it.audio.currentTime || 0;
        const d = it.audio.duration && isFinite(it.audio.duration) ? it.audio.duration : w;
        elapsedWeight += Math.min(t, d);
      }
    }
    if (totalWeight === 0) return 0;
    const ratio = elapsedWeight / totalWeight;
    return streamDone ? Math.min(1, ratio) : Math.min(0.95, ratio);
  };

  const playFrom = (idx: number) => {
    if (cancelled) return;
    const it = queue[idx];
    if (!it) return;

    it.isPlaying = true;
    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      it.finished  = true;
      it.isPlaying = false;
      try { URL.revokeObjectURL(it.url); } catch { /* ok */ }
      playFrom(idx + 1);
    };

    it.audio.onloadedmetadata = () => {
      if (it.audio.duration && isFinite(it.audio.duration)) it.duration = it.audio.duration;
    };
    it.audio.onended = advance;
    it.audio.onerror = advance;
    it.audio.play().catch(advance);
  };

  // Kick off fetch — runs in parallel with the returned handle.
  (async () => {
    try {
      const res = await fetch("/api/aida/tts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text, role }),
        signal:  controller.signal,
      });
      if (!res.ok || !res.body) {
        console.warn("[teacherAudio] tts route returned", res.status);
        streamDone = true;
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done || cancelled) break;
        buf += decoder.decode(value, { stream: true });

        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") { streamDone = true; continue; }

          const bin = atob(data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob  = new Blob([bytes], { type: "audio/mpeg" });
          const url   = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.preload = "auto";
          const item: Item = {
            audio,
            url,
            bytes:     bin.length,
            duration:  0,
            finished:  false,
            isPlaying: false,
          };
          const idx = queue.length;
          queue.push(item);
          if (!started) { started = true; playFrom(idx); }
        }
      }
      streamDone = true;
    } catch (err) {
      streamDone = true;
      if ((err as Error)?.name === "AbortError") return;
      console.error("[teacherAudio]", err);
    }
  })();

  return { cancel, progress01 };
}

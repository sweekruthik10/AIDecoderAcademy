// LiveVoiceSession — the engine behind AIDA's "Live" voice sub-mode.
//
// Owns: mic stream, Silero VAD, Deepgram streaming WebSocket, and a small
// state machine. Pure TypeScript — no React. The React surface lives in
// useLiveVoice.ts.
//
// Flow:
//   start() → request mic + STT token → connect WS → mount VAD → "listening"
//   VAD.onSpeechStart → "user-speaking"  (clear interim, cancel debounce)
//   VAD.onSpeechEnd   → "awaiting-end"   (1.5s debounce; if Deepgram delivers
//                                          a final transcript, fire LLM)
//   external setSpeaking(true)  → state "ai-speaking"  (TTS playing)
//   VAD.onSpeechStart while ai-speaking → fires onInterrupt() (UI tears down
//                                          TTS) and transitions to user-speaking
//   stop()   → close WS, destroy VAD, stop tracks
//
// Direct browser → Deepgram with a short-lived token (issued by
// /api/aida/stt-token) is the standard pattern; Next.js App Router doesn't
// support raw WebSocket route handlers and a server proxy adds latency.

import { createVad, type Vad } from "./createVad";

export type LiveState =
  | "idle"
  | "arming"
  | "listening"
  | "user-speaking"
  | "awaiting-end"
  | "llm-thinking"
  | "ai-speaking";

export type LiveEvent =
  | { type: "state";            state: LiveState }
  | { type: "interim";          text: string }
  | { type: "final-transcript"; text: string }
  | { type: "interrupt" }
  | { type: "error";            error: Error };

type Listener = (e: LiveEvent) => void;

// How long after VAD declares end-of-speech we wait for Deepgram's final
// transcript to land. If a new speech-start arrives during this window, we
// cancel and stay in user-speaking.
const FINAL_DEBOUNCE_MS = 1500;

// Reconnect backoff for Deepgram WS drops.
const RECONNECT_DELAYS_MS = [500, 1500, 4000];

export class LiveVoiceSession {
  private state:    LiveState = "idle";
  private listener: Listener | null = null;

  private stream:    MediaStream | null = null;
  private vad:       Vad | null = null;
  private ws:        WebSocket | null = null;
  private audioCtx:  AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletScriptUrl: string | null = null;

  private interimText = "";
  private pendingFinal = "";
  private finalTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private destroyed = false;

  setListener(l: Listener | null) { this.listener = l; }

  getState() { return this.state; }

  // Called from the React layer when TTS playback begins / ends.
  setAiSpeaking(speaking: boolean) {
    if (this.destroyed) return;
    if (speaking) {
      this.transition("ai-speaking");
    } else if (this.state === "ai-speaking") {
      // TTS finished naturally; back to listening.
      this.transition("listening");
    }
  }

  async start(): Promise<void> {
    if (this.state !== "idle") return;
    this.destroyed = false;
    this.transition("arming");

    try {
      // 1. Mic
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl:  true,
          channelCount:     1,
        },
        video: false,
      });

      // 2. STT token (60s TTL, short-lived)
      const tokenRes = await fetch("/api/aida/stt-token");
      if (!tokenRes.ok) throw new Error(`stt-token failed: ${tokenRes.status}`);
      const { token } = await tokenRes.json() as { token: string };

      // 3. WebSocket → Deepgram. We send mic PCM frames; Deepgram pushes
      //    interim + final transcript JSON.
      await this.connectWebSocket(token);

      // 4. AudioWorklet → 16kHz PCM frames forwarded to the WS.
      await this.attachAudioWorklet();

      // 5. Silero VAD on the same stream — detects start/end of speech.
      this.vad = await createVad({
        stream:        this.stream,
        onSpeechStart: () => this.handleSpeechStart(),
        onSpeechEnd:   () => this.handleSpeechEnd(),
        onMisfire:     () => { /* below minSpeechFrames — ignore */ },
      });
      this.vad.start();

      this.transition("listening");
    } catch (err) {
      this.emit({ type: "error", error: err as Error });
      await this.stop();
    }
  }

  async stop(): Promise<void> {
    this.destroyed = true;
    this.clearFinalTimer();

    if (this.vad)         { try { this.vad.destroy(); }       catch { /* */ } this.vad = null; }
    if (this.workletNode) { try { this.workletNode.disconnect(); } catch { /* */ } this.workletNode = null; }
    if (this.audioCtx)    { try { await this.audioCtx.close(); } catch { /* */ } this.audioCtx = null; }
    if (this.ws) {
      try { this.ws.send(JSON.stringify({ type: "CloseStream" })); } catch { /* */ }
      try { this.ws.close(); } catch { /* */ }
      this.ws = null;
    }
    if (this.stream)      { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.workletScriptUrl) { URL.revokeObjectURL(this.workletScriptUrl); this.workletScriptUrl = null; }

    this.interimText = "";
    this.pendingFinal = "";
    this.reconnectAttempt = 0;
    this.transition("idle");
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private transition(next: LiveState) {
    if (this.state === next) return;
    this.state = next;
    this.emit({ type: "state", state: next });
  }

  private emit(e: LiveEvent) {
    try { this.listener?.(e); } catch { /* */ }
  }

  private clearFinalTimer() {
    if (this.finalTimer) { clearTimeout(this.finalTimer); this.finalTimer = null; }
  }

  private handleSpeechStart() {
    if (this.destroyed) return;

    // Interruption: user starts speaking while AIDA is talking.
    if (this.state === "ai-speaking") {
      this.emit({ type: "interrupt" });
    }

    this.clearFinalTimer();
    this.interimText = "";
    this.pendingFinal = "";
    this.transition("user-speaking");
  }

  private handleSpeechEnd() {
    if (this.destroyed) return;
    if (this.state !== "user-speaking") return;

    this.transition("awaiting-end");

    // If Deepgram has already delivered a final, fire immediately.
    // Otherwise wait briefly for the final to arrive over WS.
    this.finalTimer = setTimeout(() => {
      this.flushFinalTranscript();
    }, FINAL_DEBOUNCE_MS);
  }

  private flushFinalTranscript() {
    this.clearFinalTimer();
    const text = (this.pendingFinal || this.interimText).trim();
    this.pendingFinal = "";
    this.interimText = "";

    if (!text) {
      // Nothing was heard — go back to listening.
      this.transition("listening");
      return;
    }

    this.transition("llm-thinking");
    this.emit({ type: "final-transcript", text });
  }

  // ── Deepgram WebSocket ─────────────────────────────────────────────────

  private async connectWebSocket(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Linear16 PCM @ 16kHz mono — matches what our AudioWorklet emits.
      // endpointing=300 is Deepgram's silence detector (we don't fully rely
      // on it — VAD does the primary cue). interim_results=true gives us
      // live transcript text to show under the indicator.
      const url = new URL("wss://api.deepgram.com/v1/listen");
      url.searchParams.set("model",            "nova-2");
      url.searchParams.set("encoding",         "linear16");
      url.searchParams.set("sample_rate",      "16000");
      url.searchParams.set("channels",         "1");
      url.searchParams.set("interim_results",  "true");
      url.searchParams.set("smart_format",     "true");
      url.searchParams.set("language",         "en");

      // Deepgram supports passing the token via WS subprotocols.
      const ws = new WebSocket(url.toString(), ["token", token]);

      const onOpen = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        this.ws = ws;
        this.reconnectAttempt = 0;
        this.attachWebSocketHandlers(ws, token);
        resolve();
      };
      const onError = (e: Event) => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        reject(new Error("WebSocket failed to open"));
      };

      ws.addEventListener("open",  onOpen);
      ws.addEventListener("error", onError);
    });
  }

  private attachWebSocketHandlers(ws: WebSocket, token: string) {
    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data) as DeepgramMessage;
        if (msg.type === "Results") {
          const alt = msg.channel?.alternatives?.[0];
          const txt = alt?.transcript ?? "";
          if (!txt) return;

          if (msg.is_final) {
            // Accumulate finals — Deepgram can split utterances.
            this.pendingFinal = (this.pendingFinal + " " + txt).trim();
          } else {
            this.interimText = txt;
            this.emit({ type: "interim", text: this.interimText });
          }
        }
      } catch {
        // Not JSON or unknown shape — skip.
      }
    });

    ws.addEventListener("close", () => {
      if (this.destroyed) return;
      // Auto-reconnect with backoff, only while the session is supposed to
      // be live. Don't reconnect if we're idle (stop() was called).
      const idx = this.reconnectAttempt;
      if (idx >= RECONNECT_DELAYS_MS.length) {
        this.emit({ type: "error", error: new Error("Deepgram WS lost (gave up)") });
        return;
      }
      this.reconnectAttempt = idx + 1;
      setTimeout(() => {
        if (this.destroyed) return;
        // Re-issue token for safety; current one may have expired.
        fetch("/api/aida/stt-token")
          .then(r => r.ok ? r.json() : Promise.reject(new Error("token-refresh failed")))
          .then((d: { token: string }) => this.connectWebSocket(d.token))
          .catch(err => this.emit({ type: "error", error: err as Error }));
      }, RECONNECT_DELAYS_MS[idx]);
    });
  }

  // ── PCM extraction via AudioWorklet ────────────────────────────────────
  // Inline worklet: mic → 16kHz mono Float32 → Int16 → WS.

  private async attachAudioWorklet(): Promise<void> {
    if (!this.stream) throw new Error("No mic stream");

    // Some older Safari/iOS lack AudioWorklet — caller falls back to Tap.
    if (typeof AudioContext === "undefined" || !("audioWorklet" in AudioContext.prototype)) {
      throw new Error("AudioWorklet not supported in this browser");
    }

    const ACtx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx  = new ACtx({ sampleRate: 16000 });
    this.audioCtx = ctx;

    const workletSrc = `
      class PCMTap extends AudioWorkletProcessor {
        process(inputs) {
          const ch = inputs[0]?.[0];
          if (ch && ch.length) {
            // Float32 (-1..1) → Int16 LE
            const out = new Int16Array(ch.length);
            for (let i = 0; i < ch.length; i++) {
              const s = Math.max(-1, Math.min(1, ch[i]));
              out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            this.port.postMessage(out.buffer, [out.buffer]);
          }
          return true;
        }
      }
      registerProcessor("pcm-tap", PCMTap);
    `;
    const blob = new Blob([workletSrc], { type: "application/javascript" });
    const url  = URL.createObjectURL(blob);
    this.workletScriptUrl = url;
    await ctx.audioWorklet.addModule(url);

    const src  = ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(ctx, "pcm-tap");
    src.connect(node);
    // Don't connect to ctx.destination — that would echo the mic into the speaker.

    node.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      const ws = this.ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(ev.data);
      }
    };

    this.workletNode = node;
  }
}

// ── Deepgram message shape (subset we care about) ────────────────────────
interface DeepgramMessage {
  type:    string;
  is_final?: boolean;
  channel?: {
    alternatives?: { transcript?: string }[];
  };
}

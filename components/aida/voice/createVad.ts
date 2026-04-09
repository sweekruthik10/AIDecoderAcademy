// Thin wrapper around @ricky0123/vad-web. Lazy-imports the package so its ~3MB
// WASM blob isn't pulled into the initial bundle — only Live voice mode loads
// it, and only when the user actually engages.
//
// The VAD's worklet, ONNX model, and onnxruntime-web wasm files are served
// from /public/vad/ (copied at install time). We pass explicit asset paths so
// the package doesn't try to resolve them from `currentScript.src`, which
// breaks in Next.js bundling.

import type { MicVAD as MicVADType } from "@ricky0123/vad-web";

export type Vad = MicVADType;

export interface CreateVadOptions {
  stream:         MediaStream;
  onSpeechStart:  () => void;
  onSpeechEnd:    (audio: Float32Array) => void;
  onMisfire?:     () => void;
}

export async function createVad(opts: CreateVadOptions): Promise<Vad> {
  const { MicVAD } = await import("@ricky0123/vad-web");

  return MicVAD.new({
    stream:                  opts.stream,
    model:                   "legacy",
    baseAssetPath:           "/vad/",
    onnxWASMBasePath:        "/vad/",
    // VAD sensitivity tuned for kids: harder to trigger (less false-fire),
    // patient end-of-speech (kids pause to think mid-sentence).
    positiveSpeechThreshold: 0.6,
    negativeSpeechThreshold: 0.35,
    minSpeechFrames:         4,    // ~96ms — must be true speech, not a click
    redemptionFrames:        24,   // ~576ms of silence before declaring end
    preSpeechPadFrames:      10,
    onSpeechStart:           opts.onSpeechStart,
    onSpeechEnd:             opts.onSpeechEnd,
    onVADMisfire:            opts.onMisfire ?? (() => {}),
  });
}

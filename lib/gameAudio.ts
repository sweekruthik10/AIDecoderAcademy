import type { ArenaEnvironmentPreset } from "@/lib/arenas";

/**
 * Opt-in game feedback: arena transitions + level-up fanfare (Web Audio).
 * Brighter, teen-friendly tones when enabled; respects `prefers-reduced-motion`.
 */
export const GAME_SFX_STORAGE_KEY = "ada-arena-sfx";

function isBrowser(): boolean {
  return typeof window !== "undefined"
    && typeof window.localStorage !== "undefined"
    && typeof window.localStorage.getItem === "function";
}

export function isGameSfxEnabled(): boolean {
  if (!isBrowser()) return false;
  try {
    return window.localStorage.getItem(GAME_SFX_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setGameSfxEnabled(on: boolean): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(GAME_SFX_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** @deprecated use isGameSfxEnabled */
export const isArenaSfxEnabled = isGameSfxEnabled;
/** @deprecated use setGameSfxEnabled */
export const setArenaSfxEnabled = setGameSfxEnabled;
export const ARENA_SFX_STORAGE_KEY = GAME_SFX_STORAGE_KEY;

function motionOk(): boolean {
  return typeof window !== "undefined"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function createCtx(): AudioContext | null {
  const Ctx = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctx ? new Ctx() : null;
}

function scheduleClose(ctx: AudioContext, ms: number) {
  window.setTimeout(() => {
    try {
      void ctx.close();
    } catch {
      /* ignore */
    }
  }, ms);
}

/** Root (Hz) per arena — used for a short major arpeggio. */
const PRESET_ROOT: Record<ArenaEnvironmentPreset, number> = {
  nebula:    392,
  circuit:   440,
  ember:     349.23,
  canvas:    415.3,
  soundwave: 493.88,
  cinema:    369.99,
  video:     392,
};

/**
 * Cheerful 3-note “enter the zone” sting when switching arenas (still short, not harsh).
 */
export function playArenaEnterSound(preset: ArenaEnvironmentPreset): void {
  if (typeof window === "undefined" || !isGameSfxEnabled() || !motionOk()) return;

  const ctx = createCtx();
  if (!ctx) return;

  const t0 = ctx.currentTime;
  const root = PRESET_ROOT[preset];
  const intervals = [0, 4, 7]; // major arpeggio in semitones from root
  const freqs = intervals.map((n) => root * 2 ** (n / 12));

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.14, t0 + 0.04);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.52);
  master.connect(ctx.destination);

  freqs.forEach((freq, i) => {
    const t = t0 + i * 0.1;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.02, t + 0.06);

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(3200, t);
    filt.Q.setValueAtTime(0.7, t);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.028);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    osc.connect(filt);
    filt.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.24);
  });

  const shine = ctx.createOscillator();
  shine.type = "sine";
  shine.frequency.setValueAtTime(freqs[2] * 2.02, t0 + 0.18);
  const gs = ctx.createGain();
  gs.gain.setValueAtTime(0.0001, t0 + 0.18);
  gs.gain.exponentialRampToValueAtTime(0.045, t0 + 0.22);
  gs.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
  shine.connect(gs);
  gs.connect(master);
  shine.start(t0 + 0.18);
  shine.stop(t0 + 0.45);

  void ctx.resume().catch(() => {});
  scheduleClose(ctx, 700);
}

let lastLevelUpFanfareKey = "";

/**
 * Big celebratory fanfare when the player levels up (pentatonic run + final chord).
 * Deduped by level + total XP so React Strict Mode does not double-play.
 */
export function playLevelUpFanfare(level: number, totalXp: number): void {
  if (typeof window === "undefined" || !isGameSfxEnabled() || !motionOk()) return;

  const dedupeKey = `${level}:${totalXp}`;
  if (lastLevelUpFanfareKey === dedupeKey) return;
  lastLevelUpFanfareKey = dedupeKey;

  const ctx = createCtx();
  if (!ctx) return;

  const t0 = ctx.currentTime;
  const lift = Math.min(level - 1, 5) * 0.5; // slight pitch lift at higher levels
  const base = 261.63 * 2 ** (lift / 12); // C4-ish + nudge

  // Pentatonic sweep: root, +2, +4, +7, +9, +12, +14 semitones (approx)
  const steps = [0, 2, 4, 7, 9, 12, 16];
  const times = [0, 0.09, 0.18, 0.28, 0.38, 0.5, 0.64];

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.32, t0);
  master.connect(ctx.destination);

  steps.forEach((semi, i) => {
    const t = t0 + times[i];
    const freq = base * 2 ** (semi / 12);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(i >= 5 ? 5200 : 3400, t);
    filt.Q.setValueAtTime(0.55, t);

    const g = ctx.createGain();
    const peak = i >= 5 ? 0.12 : 0.095;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);

    osc.frequency.setValueAtTime(freq, t);
    osc.connect(filt);
    filt.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.3);
  });

  // Final “sparkle” cluster (soft high sine stack)
  const chordT = t0 + 0.72;
  const chordFreqs = [base * 2 ** (16 / 12), base * 2 ** (19 / 12), base * 2 ** (24 / 12)];
  chordFreqs.forEach((f, j) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f, chordT);
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0.0001, chordT);
    gg.gain.exponentialRampToValueAtTime(0.07 - j * 0.012, chordT + 0.05);
    gg.gain.exponentialRampToValueAtTime(0.0001, chordT + 0.55);
    o.connect(gg);
    gg.connect(master);
    o.start(chordT);
    o.stop(chordT + 0.6);
  });

  // Sub punch
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(base * 0.5, t0 + 0.68);
  const gSub = ctx.createGain();
  gSub.gain.setValueAtTime(0.0001, t0 + 0.68);
  gSub.gain.exponentialRampToValueAtTime(0.14, t0 + 0.74);
  gSub.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.05);
  sub.connect(gSub);
  gSub.connect(master);
  sub.start(t0 + 0.68);
  sub.stop(t0 + 1.1);

  void ctx.resume().catch(() => {});
  scheduleClose(ctx, 2000);
}

let lastBadgeSound: { id: string; t: number } | null = null;

/** Short bright “achievement” blip when a badge toast appears (dedupes React Strict double-invoke). */
export function playBadgeUnlockSound(badgeId: string): void {
  if (typeof window === "undefined" || !isGameSfxEnabled() || !motionOk()) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (lastBadgeSound && lastBadgeSound.id === badgeId && now - lastBadgeSound.t < 500) return;
  lastBadgeSound = { id: badgeId, t: now };

  const ctx = createCtx();
  if (!ctx) return;

  const t0 = ctx.currentTime;
  const freqs = [784, 988, 1175];
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.22, t0);
  master.connect(ctx.destination);

  freqs.forEach((freq, i) => {
    const t = t0 + i * 0.07;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3800, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(f);
    f.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.22);
  });

  void ctx.resume().catch(() => {});
  scheduleClose(ctx, 550);
}
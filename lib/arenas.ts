// ═══════════════════════════════════════════════════════
// AI Decoder Academy — Arena Config
// The single source of truth for all 7 arenas.
// The playground reads this to skin itself per arena.
// ═══════════════════════════════════════════════════════

/** P1 dashboard "terrain" — one CSS motion layer per arena (`ArenaEnvironment`). */
export type ArenaEnvironmentPreset =
  | "nebula"     // AI Explorer
  | "circuit"    // Prompt Lab
  | "ember"      // Script Lab
  | "canvas"     // Image Module
  | "soundwave"  // Audio Fusion
  | "cinema"     // Slide Skate
  | "video";     // Video Fusion

export const ACTIVE_ARENA_CHANGED_EVENT = "ada-active-arena-changed";

export function dispatchActiveArenaChanged(arenaId: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ACTIVE_ARENA_CHANGED_EVENT, { detail: { arenaId } }),
  );
}

export interface ArenaConfig {
  id:            number;
  name:          string;         // "AI Explorer Arena"
  role:          string;         // "AI Explorer"
  weekLabel:     string;         // "Week 1"
  unlockXP:      number;         // XP needed to unlock
  unlockLevel:   number;         // Level this arena unlocks at
  emoji:         string;         // Arena icon
  accent:        string;         // Primary accent color (hex)
  accentDim:     string;         // Dimmer version for backgrounds
  accentGlow:    string;         // rgba for glow effects
  surface:       string;         // Card/panel background
  gradient:      string;         // CSS gradient for hero backgrounds
  /** Full-dashboard environment motion (CSS class suffix). */
  environmentPreset: ArenaEnvironmentPreset;
  bgPattern:     string;         // Description of bg pattern (used by Cursor for visuals)
  tutorPersona:  string;         // How the AI tutor sounds in this arena
  welcomeMsg:    (name: string) => string;
  toolEmphasis:  ("text" | "json" | "image" | "audio" | "slides")[];
  description:   string;         // Shown on arena unlock screen
  tagline:       string;         // Short tagline
}

export const ARENAS: ArenaConfig[] = [
  {
    id:          1,
    name:        "AI Explorer Arena",
    role:        "AI Explorer",
    weekLabel:   "Week 1",
    unlockXP:    0,
    unlockLevel: 1,
    emoji:       "🚀",
    accent:      "#7C3AED",
    accentDim:   "rgba(124,58,237,0.15)",
    accentGlow:  "rgba(124,58,237,0.35)",
    surface:     "rgba(124,58,237,0.08)",
    gradient:    "radial-gradient(ellipse at top, rgba(124,58,237,0.2) 0%, transparent 70%)",
    environmentPreset: "nebula",
    bgPattern:   "deep space with subtle star particles and a distant galaxy glow",
    tutorPersona:"curious and encouraging — like a friendly scientist showing you something amazing for the first time",
    welcomeMsg:  (name) => `Welcome to your launchpad, ${name}! 🚀 You're now an AI Explorer. Ask me anything — let's discover what AI can do together!`,
    toolEmphasis: ["text", "json"],
    description: "Your first step into the AI universe. Chat freely, ask questions, and discover how AI thinks.",
    tagline:     "Explore the AI universe",
  },
  {
    id:          2,
    name:        "Prompt Lab",
    role:        "Prompt Strategist",
    weekLabel:   "Week 2",
    unlockXP:    100,
    unlockLevel: 2,
    emoji:       "⚡",
    accent:      "#00D4FF",
    accentDim:   "rgba(0,212,255,0.12)",
    accentGlow:  "rgba(0,212,255,0.3)",
    surface:     "rgba(0,212,255,0.06)",
    gradient:    "radial-gradient(ellipse at top right, rgba(0,212,255,0.15) 0%, transparent 60%)",
    environmentPreset: "circuit",
    bgPattern:   "dark terminal with faint circuit board grid lines in deep cyan",
    tutorPersona:"sharp and technical — like a senior engineer who loves helping you write the perfect prompt",
    welcomeMsg:  (name) => `The lab is open, ${name}! ⚡ You're now a Prompt Strategist. Let's craft prompts that get exactly what you want from AI.`,
    toolEmphasis: ["text", "json"],
    description: "Master the art of prompting. Learn to control AI output with precision and creativity.",
    tagline:     "Engineer the perfect prompt",
  },
  {
    id:          3,
    name:        "Script Lab",
    role:        "Narrative Engineer",
    weekLabel:   "Week 3",
    unlockXP:    300,
    unlockLevel: 3,
    emoji:       "📝",
    accent:      "#FF6B2B",
    accentDim:   "rgba(255,107,43,0.12)",
    accentGlow:  "rgba(255,107,43,0.3)",
    surface:     "rgba(255,107,43,0.06)",
    gradient:    "radial-gradient(ellipse at bottom left, rgba(255,107,43,0.18) 0%, transparent 65%)",
    environmentPreset: "ember",
    bgPattern:   "dark warm background with faint ember particles and a firelit parchment texture",
    tutorPersona:"dramatic and inspiring — like a storyteller who sees narrative potential in everything",
    welcomeMsg:  (name) => `The lab is open, ${name}! 📝 You're now a Narrative Engineer. Every idea becomes a script here. What will you write?`,
    toolEmphasis: ["text", "slides"],
    description: "Write scripts, stories, and dialogue with AI. Turn any idea into a full narrative.",
    tagline:     "Write the story only you can tell",
  },
  {
    id:          4,
    name:        "Image Module",
    role:        "Visual Architect",
    weekLabel:   "Week 4",
    unlockXP:    600,
    unlockLevel: 4,
    emoji:       "🖼️",
    accent:      "#00FF94",
    accentDim:   "rgba(0,255,148,0.1)",
    accentGlow:  "rgba(0,255,148,0.28)",
    surface:     "rgba(0,255,148,0.05)",
    gradient:    "radial-gradient(ellipse at top left, rgba(0,255,148,0.12) 0%, transparent 60%)",
    environmentPreset: "canvas",
    bgPattern:   "dark canvas with faint paint splash texture and subtle grid lines",
    tutorPersona:"visual and enthusiastic — like an art director who thinks in images and composition",
    welcomeMsg:  (name) => `Canvas unlocked, ${name}! 🖼️ You're now a Visual Architect. Describe it — and watch it appear. What do you see in your mind?`,
    toolEmphasis: ["image", "slides"],
    description: "Generate AI images, design scenes, and build visual concepts with AI-powered tools.",
    tagline:     "See your ideas come to life",
  },
  {
    id:          5,
    name:        "Audio Fusion",
    role:        "Voice Designer",
    weekLabel:   "Week 5",
    unlockXP:    1000,
    unlockLevel: 5,
    emoji:       "🎵",
    accent:      "#FF2D78",
    accentDim:   "rgba(255,45,120,0.12)",
    accentGlow:  "rgba(255,45,120,0.3)",
    surface:     "rgba(255,45,120,0.06)",
    gradient:    "radial-gradient(ellipse at center right, rgba(255,45,120,0.15) 0%, transparent 60%)",
    environmentPreset: "soundwave",
    bgPattern:   "dark studio with horizontal soundwave lines and acoustic panel texture",
    tutorPersona:"rhythmic and expressive — like a music producer who hears the audio in every word",
    welcomeMsg:  (name) => `The booth is yours, ${name}! 🎵 You're now a Voice Designer. Fuse voices, music, and narration into something unforgettable. What do you hear?`,
    toolEmphasis: ["audio", "text"],
    description: "Fuse voices, narration, and AI audio to craft immersive sound experiences.",
    tagline:     "Give your words a voice",
  },
  {
    id:          6,
    name:        "Slide Skate",
    role:        "Presentation Architect",
    weekLabel:   "Week 6",
    unlockXP:    1500,
    unlockLevel: 6,
    emoji:       "🛹",
    accent:      "#C8FF00",
    accentDim:   "rgba(200,255,0,0.1)",
    accentGlow:  "rgba(200,255,0,0.3)",
    surface:     "rgba(200,255,0,0.05)",
    gradient:    "radial-gradient(ellipse at top, rgba(200,255,0,0.12) 0%, transparent 60%)",
    environmentPreset: "cinema",
    bgPattern:   "dark cinematic background with film grain texture and subtle clapperboard motif",
    tutorPersona:"energetic and slick — like a creative director who makes every slide land perfectly",
    welcomeMsg:  (name) => `Skate to the stage, ${name}! 🛹 You're now a Presentation Architect. Build decks that move people. What story will your slides tell?`,
    toolEmphasis: ["slides", "image", "text"],
    description: "Build stunning AI-generated slide decks. Turn ideas into presentations that skate.",
    tagline:     "Slide into the spotlight",
  },
  {
    id:          7,
    name:        "Video Fusion",
    role:        "Video Director",
    weekLabel:   "Week 7",
    unlockXP:    2200,
    unlockLevel: 7,
    emoji:       "🎬",
    accent:      "#FF6D00",
    accentDim:   "rgba(255,109,0,0.12)",
    accentGlow:  "rgba(255,109,0,0.3)",
    surface:     "rgba(255,109,0,0.06)",
    gradient:    "radial-gradient(ellipse at top right, rgba(255,109,0,0.18) 0%, transparent 65%)",
    environmentPreset: "video",
    bgPattern:   "dark film set with clapperboard motifs, camera light trails, and cinematic grain",
    tutorPersona:"visionary and commanding — like a film director who sees every frame as art",
    welcomeMsg:  (name) => `Lights. Camera. Action, ${name}! 🎬 You're now a Video Director. Every tool is yours. This is your final cut — make it legendary.`,
    toolEmphasis: ["image", "audio", "slides", "text"],
    description: "The final arena. Combine every skill — script, image, audio, slides — into a video masterpiece.",
    tagline:     "Direct your masterpiece",
  },
];

// XP thresholds per level
export const XP_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200];

// XP rewards per action
export const XP_REWARDS: Record<string, number> = {
  generate_text:        5,
  generate_image:       10,
  generate_audio:       15,
  generate_slides:      20,
  save_creation:        8,
  first_creation:       25,   // bonus for very first save
  daily_streak:         20,
  new_output_type:      25,   // first time using each output type
  session_start:        3,
  // Objective_complete uses meta.xp from the objective definition (variable
  // per objective). The xp route reads meta.xp when the constant is 0.
  objective_complete:   0,
};

// Badge definitions
export interface Badge {
  id:          string;
  name:        string;
  emoji:       string;
  description: string;
  condition:   string;  // human readable
}

export const BADGES: Badge[] = [
  { id: "first_creation",   name: "First Creation",    emoji: "⭐", description: "Saved your very first creation",          condition: "Save 1 creation" },
  { id: "image_maker",      name: "Image Maker",       emoji: "🖼️", description: "Generated your first image",              condition: "Generate 1 image" },
  { id: "voice_actor",      name: "Voice Actor",       emoji: "🎙️", description: "Generated your first audio scene",        condition: "Generate 1 audio" },
  { id: "slide_master",     name: "Slide Master",      emoji: "📊", description: "Built your first slide deck",             condition: "Generate 1 slide deck" },
  { id: "streak_3",         name: "3-Day Streak",      emoji: "🔥", description: "Created something 3 days in a row",       condition: "3-day streak" },
  { id: "streak_7",         name: "Week Warrior",      emoji: "⚡", description: "Created something 7 days in a row",       condition: "7-day streak" },
  { id: "librarian",        name: "Librarian",         emoji: "📚", description: "Saved 10 creations to your library",      condition: "Save 10 creations" },
  { id: "prolific",         name: "Prolific Creator",  emoji: "🚀", description: "Saved 25 creations",                      condition: "Save 25 creations" },
  { id: "all_tools",        name: "Full Toolkit",      emoji: "🛠️", description: "Used every single output type",           condition: "Use all 5 output types" },
  { id: "prompt_lab",       name: "Prompt Lab",        emoji: "⚡", description: "Unlocked the Prompt Lab",                 condition: "Reach Level 2" },
  { id: "story_forge",      name: "Story Forge",       emoji: "📖", description: "Unlocked the Story Forge",               condition: "Reach Level 3" },
  { id: "visual_studio",    name: "Visual Studio",     emoji: "🎨", description: "Unlocked the Visual Studio",             condition: "Reach Level 4" },
  { id: "sound_booth",      name: "Sound Booth",       emoji: "🎙️", description: "Unlocked the Sound Booth",               condition: "Reach Level 5" },
  { id: "directors_suite",  name: "Director's Suite",  emoji: "🎬", description: "Unlocked the Director's Suite",          condition: "Reach Level 6" },
];

// Helpers
export function getArena(id: number): ArenaConfig {
  return ARENAS.find(a => a.id === id) ?? ARENAS[0];
}

export function getUnlockedArenas(level: number): ArenaConfig[] {
  return ARENAS.filter(a => a.unlockLevel <= level);
}

export function getLevelFromXP(xp: number): number {
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= XP_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function getXPForNextLevel(level: number): number {
  return XP_THRESHOLDS[level] ?? 99999;
}

export function getXPProgress(xp: number, level: number): number {
  const current = XP_THRESHOLDS[level - 1] ?? 0;
  const next    = XP_THRESHOLDS[level]     ?? 99999;
  return Math.round(((xp - current) / (next - current)) * 100);
}
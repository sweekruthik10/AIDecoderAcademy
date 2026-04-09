import type { OutputType } from "@/types";

export interface Objective {
  id:            string;
  arenaId:       number;
  order:         number;
  emoji:         string;
  title:         string;
  description:   string;
  outputType:    OutputType;
  starterPrompt: string;
  xpReward:      number;
}

export const OBJECTIVES: Objective[] = [
  // ─── Arena 1 — AI Explorer ─────────────────────────────────────────────────
  // 15 Objectives from AI Decoder Academy Level 1 Spec (Think It → Story It → Create It)
  // 5 In-Class + 10 Home | AI Explorer Badge

  {
    id: "a1-1", arenaId: 1, order: 1,
    emoji: "🎬",
    title: "Netflix Documentary Intro + Avatar Name",
    description: "Answer 4 Think It questions about yourself in the Creators Room. The AI generates your Netflix-style 2-line introduction. Choose your Avatar Name — your identity for all 6 levels. Share it in the group chat!",
    outputType: "text",
    starterPrompt: "I need a Netflix documentary-style introduction about myself. Ask me 4 questions about my personality, passions, biggest dream, and one word that describes me. Then write a dramatic 2-line Netflix intro based on my answers. Also suggest 3 cool Avatar Names that match my personality.",
    xpReward: 15,
  },
  {
    id: "a1-2", arenaId: 1, order: 2,
    emoji: "🧠",
    title: "Three AI Brains, One Question",
    description: "Ask a genuine personal question to ChatGPT, Gemini, and Claude simultaneously. Apply CT Skill 2 — write one observation sentence and one interpretation sentence for each response. What differences do you notice?",
    outputType: "text",
    starterPrompt: "I'm comparing how ChatGPT, Gemini, and Claude answer the same question. Please answer my question clearly so I can compare your response with the other two AI tools. Apply your own perspective and voice. My question is: [write your genuine personal question here]",
    xpReward: 20,
  },
  {
    id: "a1-3", arenaId: 1, order: 3,
    emoji: "🌍",
    title: "Your Impossible World",
    description: "Imagine a scene that cannot exist in reality. Generate it in Canva AI. Then add 5 more descriptive words to your prompt and regenerate. Submit both versions with a before-after comparison — what changed?",
    outputType: "image",
    starterPrompt: "Help me imagine a scene that literally cannot exist in reality — something surreal, impossible, and visually stunning. Generate a vivid image description I can paste into Canva AI. Then give me 5 powerful descriptive words I can add to make the second version even more striking.",
    xpReward: 20,
  },
  {
    id: "a1-4", arenaId: 1, order: 4,
    emoji: "🎨",
    title: "Style Switcher: One Subject, Three Worlds",
    description: "Generate the same subject in photorealistic, anime, and one self-chosen art style using Adobe Firefly. Three panels — same subject, three completely different creative worlds.",
    outputType: "image",
    starterPrompt: "I'm doing a style-switching experiment in Adobe Firefly. Give me three image prompts for the EXACT same subject — version 1 in photorealistic style, version 2 in anime style, and version 3 in a creative art style of my choice. Each prompt should be detailed enough to generate a striking image. My subject is: [choose your subject]",
    xpReward: 25,
  },
  {
    id: "a1-5", arenaId: 1, order: 5,
    emoji: "🎵",
    title: "AI Writes and Sings Your Theme Song",
    description: "Describe yourself in 5 personality words. Suno.ai generates a full music track that is uniquely yours. This track will play during your Avatar reveal in Class 2!",
    outputType: "audio",
    starterPrompt: "I need a theme song that represents ME. Help me write a Suno.ai music prompt based on my 5 personality words. Include genre, mood, tempo, instruments, and a short lyric hook that captures my energy. My 5 personality words are: [write them here]",
    xpReward: 25,
  },
  {
    id: "a1-6", arenaId: 1, order: 6,
    emoji: "🎭",
    title: "Build Your AI Academy Avatar",
    description: "Design your AI Academy avatar — appearance, vibe, personality, signature element. Identity persists for 6 levels. Fill the Avatar Identity Card, then generate the avatar IMAGE in Visual Studio — or drop a photo of yourself in chat to be restyled.",
    outputType: "image",
    starterPrompt: "Open your worksheet and complete the Think It Canvas + Avatar Identity Card. Then generate the avatar image from your Identity Card description — or upload a photo and ask AIDA to restyle it.",
    xpReward: 80,
  },
  {
    id: "a1-7", arenaId: 1, order: 7,
    emoji: "🎬",
    title: "Your Film Poster: Coming Soon",
    description: "Write one sentence about a topic you find genuinely interesting. Firefly generates a cinematic movie poster for it — your Avatar name appears as Director. This is your first capstone seed!",
    outputType: "image",
    starterPrompt: "I need a cinematic movie poster prompt for Adobe Firefly. My topic is: [write one sentence about something you find genuinely interesting]. Create a dramatic poster description with: genre, colour palette, mood, lighting style, and a tagline. My Avatar name [your name] should appear as Director in the poster.",
    xpReward: 25,
  },
  {
    id: "a1-8", arenaId: 1, order: 8,
    emoji: "🎙️",
    title: "AI Speaks Your Words: Voice Direction Lab",
    description: "Write 3 sentences about something you genuinely care about. Generate it in 3 different ElevenLabs voices. Blind evaluation — no voice names visible — then identify the personality of each speaker from what you literally hear.",
    outputType: "audio",
    starterPrompt: "I'm doing a voice direction lab in ElevenLabs. Write my 3-sentence script about something I care about, then suggest 3 contrasting voice styles (e.g. calm narrator, energetic teen, wise elder) I should test. After I listen, help me do a blind evaluation — what personality does each voice communicate based only on what I hear?",
    xpReward: 25,
  },
  {
    id: "a1-9", arenaId: 1, order: 9,
    emoji: "🔬",
    title: "The Negative Prompt Lab: Editing Reality",
    description: "Generate one image in Adobe Firefly. Then add progressively detailed negative prompts — excluding elements one layer at a time. Three versions. Which excluded words had the most visual impact?",
    outputType: "image",
    starterPrompt: "I'm doing the Negative Prompt Lab in Adobe Firefly. Help me: 1) Write an initial image prompt. 2) Version 2: same prompt with negative prompts removing one type of element. 3) Version 3: add more negative prompts removing another layer. Then help me analyse — which excluded words changed the image the most and why?",
    xpReward: 25,
  },
  {
    id: "a1-10", arenaId: 1, order: 10,
    emoji: "💥",
    title: "Your First AI Comic Strip",
    description: "Create a 3-panel funny comic right here in the whiteboard. Plan it (Think It → Story It) before generating. Drop the final comic image in chat. The validator grades your worksheet + your comic image.",
    outputType: "image",
    starterPrompt: "I'm planning a 3-panel comic. Help me brainstorm a funny scenario with a setup, a twist, and a punchline. Audience: someone my age. The punchline must land in panel 3.",
    xpReward: 35,
  },
  {
    id: "a1-11", arenaId: 1, order: 11,
    emoji: "🎥",
    title: "Eight Seconds of AI Cinema",
    description: "Write a 3-sentence story. Generate a scene image in Firefly. Narrate it in ElevenLabs. Combine image + narration into an 8–10 second video in Canva Video. Your first complete AI video clip!",
    outputType: "video",
    starterPrompt: "Help me create my first AI video clip — 8 to 10 seconds. Step 1: Write a powerful 3-sentence story (vivid, visual, emotional). Step 2: Write an Adobe Firefly image prompt for the key scene. Step 3: Write an ElevenLabs narration script (same 3 sentences, dramatic delivery). I'll combine them in Canva Video.",
    xpReward: 35,
  },
  {
    id: "a1-12", arenaId: 1, order: 12,
    emoji: "🔍",
    title: "Catch AI Getting It Wrong",
    description: "Select 3 AI outputs from your previous objectives that surprised or disappointed you. Apply the CT Skill 1 three-question check to diagnose the root cause of each failure. Report your findings.",
    outputType: "text",
    starterPrompt: "I'm auditing 3 AI outputs from my previous objectives that disappointed or surprised me. For each one, apply CT Skill 1 — the three-question check: 1) Was the failure caused by my prompt quality? 2) Did I make an unchecked assumption? 3) Was my intent clearly defined? Help me diagnose the root cause of each failure, not just describe it.",
    xpReward: 25,
  },
  {
    id: "a1-13", arenaId: 1, order: 13,
    emoji: "📊",
    title: "Your AI Slide Deck — But Make It Yours",
    description: "Generate a 5-slide educational deck on any topic using Gamma.app. Identify the weakest slide — where AI was most generic. Rewrite it to be genuinely better. Submit both the AI version and your improved version.",
    outputType: "slides",
    starterPrompt: "Help me create a 5-slide educational deck on [choose any topic you find interesting]. Write the content for all 5 slides: title, 3 content slides with specific key insights, and a conclusion. Then identify which slide is the weakest — where the content is most generic — and rewrite that slide to be genuinely more interesting and specific.",
    xpReward: 30,
  },
  {
    id: "a1-14", arenaId: 1, order: 14,
    emoji: "🎭",
    title: "The Multimodal Creative Set",
    description: "Pick one topic. Generate a text explanation (ChatGPT), an AI image (Canva AI), a music track (Suno.ai), and a voice narration (ElevenLabs) — all on the same topic. Evaluate coherence: do all four outputs tell the same story?",
    outputType: "text",
    starterPrompt: "I'm building a Multimodal Creative Set on one topic. Help me create all four outputs: 1) A clear 5-sentence text explanation (ChatGPT). 2) A Canva AI image prompt that visually represents the topic. 3) A Suno.ai music prompt that captures the mood of the topic. 4) An ElevenLabs narration of the same 5 sentences. My topic is: [choose your topic]. Then help me evaluate — do all four outputs communicate the same thing coherently?",
    xpReward: 35,
  },
  {
    id: "a1-15", arenaId: 1, order: 15,
    emoji: "🏆",
    title: "Level 1 Creator Card",
    description: "Compile your 5 best outputs from Level 1 into a branded Creator Card template. Write a 3-sentence Director's Statement: what you built, what surprised you, and what you intend to do differently in Level 2.",
    outputType: "slides",
    starterPrompt: "Help me create my Level 1 Creator Card — my final submission for AI Explorer. I need: 1) Help choosing my 5 best outputs from Level 1 (ask me what I made). 2) A branded layout description for a Creator Card template. 3) My 3-sentence Director's Statement: what I built this level, what surprised me most, and one specific thing I will do differently in Level 2.",
    xpReward: 50,
  },
  // ── Arena 2 — Prompt Lab ────────────────────────────────
  {
    id: "a2-1", arenaId: 2, order: 1,
    emoji: "🔬",
    title: "The Comparison Test",
    description: "Ask the same question two different ways. See how the answer changes.",
    outputType: "text",
    starterPrompt: "Explain machine learning simply, then explain it again using only a cooking recipe analogy",
    xpReward: 15,
  },
  {
    id: "a2-2", arenaId: 2, order: 2,
    emoji: "🖼️",
    title: "Paint With Words",
    description: "Craft a 40+ word image prompt with style, lighting, mood and detail.",
    outputType: "image",
    starterPrompt: "Generate: A futuristic anime-style library floating in deep space, bookshelves glowing with cyan neon, stars visible through floor-to-ceiling windows, a lone student reading, dramatic rim lighting, ultra-detailed illustration",
    xpReward: 20,
  },
  {
    id: "a2-3", arenaId: 2, order: 3,
    emoji: "🗂️",
    title: "Data Blueprint",
    description: "Design a complete JSON schema for an app idea of your choice.",
    outputType: "json",
    starterPrompt: "Design a JSON structure for a school of the future — AI teachers, futuristic subjects, student profiles, and XP scores",
    xpReward: 25,
  },

  // ── Arena 3 — Story Forge ───────────────────────────────
  {
    id: "a3-1", arenaId: 3, order: 1,
    emoji: "📖",
    title: "First Words",
    description: "Write the opening of an original story. Set the scene, introduce a character.",
    outputType: "text",
    starterPrompt: "Write the gripping opening paragraph of a story: a 14-year-old discovers their city is secretly run by an AI called ATLAS",
    xpReward: 15,
  },
  {
    id: "a3-2", arenaId: 3, order: 2,
    emoji: "🖼️",
    title: "Face of a Hero",
    description: "Generate a visual portrait of your story's main character.",
    outputType: "image",
    starterPrompt: "Create a character portrait: a teenage AI hacker, messy dark hair, glowing cyan eyes, wearing a hoodie with circuit patterns, dark city background, dramatic lighting, anime style",
    xpReward: 20,
  },
  {
    id: "a3-3", arenaId: 3, order: 3,
    emoji: "🎙️",
    title: "Hear the Scene",
    description: "Bring your story to life with AI voices and sound.",
    outputType: "audio",
    starterPrompt: "Create a dramatic audio scene: a teen named Zara discovers her phone has become sentient. Include Zara (surprised) and the phone (calm, curious) as characters with a narrator setting the scene",
    xpReward: 30,
  },

  // ── Arena 4 — Visual Studio ─────────────────────────────
  {
    id: "a4-1", arenaId: 4, order: 1,
    emoji: "🎨",
    title: "Original Artwork",
    description: "Create a completely original piece of AI art — your style, your vision.",
    outputType: "image",
    starterPrompt: "Generate an original digital artwork: a neon-lit Tokyo street reflected in a rain puddle, cyberpunk aesthetic, vivid colours, ultra-detailed, cinematic",
    xpReward: 20,
  },
  {
    id: "a4-2", arenaId: 4, order: 2,
    emoji: "🔄",
    title: "The Remix",
    description: "Take your last image and transform it into something completely new.",
    outputType: "image",
    starterPrompt: "Take my previous image and reimagine it as underwater — bioluminescent creatures swimming through, deep blue tones, bubbles rising",
    xpReward: 25,
  },
  {
    id: "a4-3", arenaId: 4, order: 3,
    emoji: "📊",
    title: "Visual Deck",
    description: "Turn your art into a compelling slide presentation.",
    outputType: "slides",
    starterPrompt: "Create a 3-section presentation about AI art: What is AI art, How AI generates images, The future of AI creativity",
    xpReward: 35,
  },

  // ── Arena 5 — Sound Booth ───────────────────────────────
  {
    id: "a5-1", arenaId: 5, order: 1,
    emoji: "🎙️",
    title: "Solo Performance",
    description: "Create a powerful single-voice narration on any topic you're passionate about.",
    outputType: "audio",
    starterPrompt: "Create a narrator-only audio piece: a 30-second documentary intro about young people using AI to solve real problems around the world",
    xpReward: 20,
  },
  {
    id: "a5-2", arenaId: 5, order: 2,
    emoji: "🎭",
    title: "The Big Scene",
    description: "Direct a multi-character audio drama with distinct voices and emotions.",
    outputType: "audio",
    starterPrompt: "Create a funny but real debate scene: Maya and Leo argue about whether AI should write school essays. Maya is against it, Leo is for it, narrator introduces and closes the scene",
    xpReward: 30,
  },
  {
    id: "a5-3", arenaId: 5, order: 3,
    emoji: "📜",
    title: "From Page to Stage",
    description: "Write a script first — then turn it into audio.",
    outputType: "text",
    starterPrompt: "Write a 2-minute podcast script: two AI characters (one logical, one creative) interview a human student about what they love and fear about AI. Make it entertaining",
    xpReward: 25,
  },

  // ── Arena 6 — Slide Skate ───────────────────────────────
  {
    id: "a6-1", arenaId: 6, order: 1,
    emoji: "📽️",
    title: "The Grand Pitch",
    description: "Create a full presentation for your most ambitious AI idea.",
    outputType: "slides",
    starterPrompt: "Create a professional 4-section pitch deck for an AI app for schools: Problem, Solution, Key Features, Real-world Impact",
    xpReward: 40,
  },
  {
    id: "a6-2", arenaId: 6, order: 2,
    emoji: "🎬",
    title: "Cinematic Shots",
    description: "Generate a series of epic, movie-quality visuals.",
    outputType: "image",
    starterPrompt: "Create a cinematic movie poster: 'AI Academy' — a group of teen heroes with glowing AI gadgets standing on a rooftop at sunset, IMAX quality, epic scale",
    xpReward: 30,
  },
  {
    id: "a6-3", arenaId: 6, order: 3,
    emoji: "🏆",
    title: "The Grand Finale Deck",
    description: "Build your ultimate slide deck — the masterpiece presentation.",
    outputType: "slides",
    starterPrompt: "Create the ultimate AI Academy pitch deck: 5 sections — Vision, The Problem, Our Solution, Key Features, Call to Action. Each section should have a bold headline, 3 key points, and a vivid visual description.",
    xpReward: 50,
  },

  // ── Arena 7 — Video Fusion ───────────────────────────────
  {
    id: "a7-1", arenaId: 7, order: 1,
    emoji: "🎥",
    title: "Storyboard to Screen",
    description: "Generate a series of cinematic scenes that tell a visual story.",
    outputType: "image",
    starterPrompt: "Generate a storyboard of 4 sequential cinematic shots for a short film: 'A student discovers AI for the first time.' Shot 1: wide establishing shot of a futuristic school. Shot 2: close-up of curious eyes reflected in a glowing screen. Shot 3: hands reaching toward a holographic AI interface. Shot 4: triumphant wide shot of the student standing in a beam of light.",
    xpReward: 35,
  },
  {
    id: "a7-2", arenaId: 7, order: 2,
    emoji: "🎙️",
    title: "Director's Voiceover",
    description: "Write and produce a dramatic movie-quality narration.",
    outputType: "audio",
    starterPrompt: "Create a cinematic 90-second documentary narration about AI changing education. Maya narrates the opening dramatically, Leo describes the technology with excitement, Mr Chen closes with wisdom about the future. Make it feel like a Hollywood documentary trailer.",
    xpReward: 40,
  },
  {
    id: "a7-3", arenaId: 7, order: 3,
    emoji: "🏆",
    title: "The Final Cut",
    description: "Produce your ultimate creation — combine every skill into one legendary piece.",
    outputType: "slides",
    starterPrompt: "Create the ultimate 'AI Decoder Academy' showcase deck: 6 sections — My Journey (what I've learned), Best Image I Made, Best Audio I Created, My Favourite Script, What's Next For Me, and a final Thank You slide. Include vivid visual descriptions for each section. Make it a celebration of everything you've built.",
    xpReward: 60,
  },
];

// ── LMS rubric ID derivation ──────────────────────────────────────────────
// The objectives in this file use playful arena-prefixed IDs (a1-3, a2-15).
// The validator rubric file (lib/objectiveRubrics.ts) is keyed by the
// LMS curriculum's canonical IDs (l1-03, l2-15). This helper converts
// between them deterministically — no migration of localStorage or URLs
// is required.
export function toLmsId(id: string): string {
  const m = id.match(/^a(\d+)-(\d+)$/);
  if (!m) return id;
  return `l${m[1]}-${m[2].padStart(2, "0")}`;
}

export function getObjectiveById(id: string): Objective | undefined {
  return OBJECTIVES.find(o => o.id === id);
}

export function getArenaObjectives(arenaId: number): Objective[] {
  return OBJECTIVES
    .filter(o => o.arenaId === arenaId)
    .sort((a, b) => a.order - b.order);
}

// ── localStorage completion tracking ──────────────────────
const STORAGE_KEY = "ada-completed-objectives";

export function getCompletedObjectives(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

export function markObjectiveComplete(id: string): void {
  if (typeof window === "undefined") return;
  const current = getCompletedObjectives();
  current.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
}

export function isArenaComplete(arenaId: number): boolean {
  const done = getCompletedObjectives();
  return getArenaObjectives(arenaId).every(o => done.has(o.id));
}

// Arena 1 is always open; every other arena requires the previous one to be fully complete.
export function isArenaUnlocked(arenaId: number): boolean {
  if (arenaId <= 1) return true;
  return isArenaComplete(arenaId - 1);
}

// Curriculum gating — which mission tiles are playable RIGHT NOW.
//
// We only have full worksheet specs + validator rubrics for OBJ 6 and OBJ 10
// at the moment, so the other tiles in Arena 1 are visually present but
// non-interactive. As specs land for OBJ 1, 2, … just add their ids here.
const ENABLED_OBJECTIVE_IDS = new Set(["a1-6", "a1-10"]);

export function isObjectiveEnabled(objectiveId: string): boolean {
  return ENABLED_OBJECTIVE_IDS.has(objectiveId);
}

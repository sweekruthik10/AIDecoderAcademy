// Validator rubrics for the Validator Teacher in the playground.
// Each entry is keyed by lmsId (e.g. "l1-03") and is loaded by
// /api/aida/validate to grade a student's submitted work against the
// 4-tier rubric from AI_Decoder_LMS_LabSpec_v2.docx.
//
// Tier scale:
//   FAIL        — <80%   missing outputs / wrong tool / task not followed
//   PASS        —  80%   required outputs present, correct tool, task done
//   MERIT       —  90%   strong quality + intentional creative decisions
//   DISTINCTION — 100%   professional + mastery + self-direction

export type ComplexityTier =
  | "T1 — EXPLORE"
  | "T2 — COMPARE"
  | "T3 — CONSTRUCT"
  | "T4 — EXPERIMENT"
  | "T5 — COMBINE"
  | "T6 — CREATE";

// Single-pass rubrics are graded in one LLM call against the playground chat.
// Staged rubrics (currently only OBJ 10 — l1-10) use a 3-stage gated pipeline
// with structured form input + image upload — see lib/obj10Rubric.ts and
// /api/aida/validate/obj10.
//
// We keep the original interface name `ObjectiveRubric` for the single-pass
// shape so the existing 17 rubrics + every consumer (validate route, teacher
// dialogue, etc.) compile unchanged. The discriminated union `AnyRubric`
// is the new lookup type that callers should use when they want to handle
// both kinds.

export interface ObjectiveRubric {
  kind?:               "single";       // optional — defaults to single-pass
  lmsId:               string;
  title:               string;
  tier:                ComplexityTier;
  difficulty:          1 | 2 | 3 | 4 | 5 | 6; // ★ count
  tools:               string[];
  labTask:             string;
  submitRequirements:  string;
  passCriteria:        string;
  meritCriteria:       string;
  distinctionCriteria: string;
  teacherChecklist:    string[];
  correctiveHints:     string[];
}

// ─── LEVEL 1 ─ AI EXPLORER (Arena 1) ─────────────────────────────────────────

export const RUBRICS_L1: ObjectiveRubric[] = [
  {
    lmsId:      "l1-01",
    title:      "Netflix Documentary Intro + Avatar Name",
    tier:       "T1 — EXPLORE",
    difficulty: 1,
    tools:      ["ChatGPT"],
    labTask: "Answer 4 Think It questions about yourself (who you are, what you care about, what drives you, where you're going). Use ChatGPT to generate a 2-sentence Netflix-style documentary introduction from your answers. Choose your Avatar Name — your identity for all 6 levels.",
    submitRequirements:  "Completed Canvas + Story It worksheet (4 answers, 2-3 sentences each). Netflix-style intro pasted into the finalIntro field. Avatar Name chosen with reason.",
    passCriteria:        "Worksheet complete — all 4 Canvas fields + all 4 Story It answers + ChatGPT intro pasted + Avatar Name chosen.",
    meritCriteria:       "Intro is specific and personal — contains details only this student could have given. Reflection identifies one assumption that proved correct AND one that surprised them.",
    distinctionCriteria: "Student submits a refined version — explains which Story It answer they made more specific and how the regenerated intro changed as a result.",
    teacherChecklist: [
      "All 4 Canvas fields filled (intent, assumptions, audience, success)?",
      "All 4 Story It answers present and specific (not generic)?",
      "Netflix intro pasted into finalIntro field?",
      "Avatar Name chosen with reasoning?",
    ],
    correctiveHints: [
      "If Story It answers are vague: 'Be specific — name actual things you do, actual problems you think about. Vague answers produce generic intros.'",
      "If intro is not pasted: 'Build your ChatGPT prompt from the four Story It answers and paste the output back into the finalIntro field.'",
    ],
  },
  {
    lmsId:      "l1-02",
    title:      "Meet the Three LLMs — Same Question, Three Answers",
    tier:       "T1 — EXPLORE",
    difficulty: 2,
    tools:      ["ChatGPT", "Google Gemini", "Claude.ai"],
    labTask: "Open all three LLM tools. Ask each one the EXACT same question (something the student genuinely wants to know). Screenshot all three responses.",
    submitRequirements:  "3 screenshots — same question, three different LLMs — each labelled with the question.",
    passCriteria:        "All 3 tools used (not 3 screenshots from the same tool). Same question in all 3.",
    meritCriteria:       "Same question, all 3 tools, plus a one-line note under each screenshot describing one thing different about that LLM's response.",
    distinctionCriteria: "Strong notes that compare specific differences (tone, structure, depth) across the three LLMs.",
    teacherChecklist: [
      "Are all 3 tools used (different LLMs)?",
      "Is the question identical in all 3?",
      "Are differences noted?",
    ],
    correctiveHints: [
      "If the same tool was used 3 times: 'Each screenshot must be from a different tool — ChatGPT at chat.openai.com, Gemini at gemini.google.com, and Claude at claude.ai. Open a new tab for each one.'",
      "If question is trivial: 'Your question works — for Merit, add a short label under each screenshot noting one thing that was different about how that LLM responded.'",
    ],
  },
  {
    lmsId:      "l1-03",
    title:      "First AI Image — Canva AI Generator",
    tier:       "T1 — EXPLORE",
    difficulty: 2,
    tools:      ["Canva AI Image Generator"],
    labTask: "Generate two AI images of imaginary/fantastical scenes (things that could not exist in real life). Download both. Include the text prompt used for each.",
    submitRequirements:  "2 AI-generated images plus the prompt used for each.",
    passCriteria:        "Both images present. Both genuinely imaginary. Prompts included.",
    meritCriteria:       "Both images creative and clearly fantastical. Prompts are descriptive and intentional.",
    distinctionCriteria: "Both images professional-looking and visually striking with rich, detailed prompts.",
    teacherChecklist: [
      "Are both images present?",
      "Are they imaginary (not real-world photos)?",
      "Are the prompts included?",
    ],
    correctiveHints: [
      "If images are real-world photos: 'Push your imagination further — describe something that could not exist in real life. Try: a city floating on clouds, a library inside a whale, a forest where trees grow upside down.'",
      "If prompts are missing: 'Add the text you typed below each image — we need to see the prompt that created it.'",
    ],
  },
  {
    lmsId:      "l1-04",
    title:      "Image Style Switch — Same Subject, Two Styles",
    tier:       "T2 — COMPARE",
    difficulty: 3,
    tools:      ["Adobe Firefly"],
    labTask: "Choose ONE subject. Generate that subject in REALISTIC photo style, then in ANIME style. Download both, side by side.",
    submitRequirements:  "2 Firefly images of the same subject in 2 distinct styles, with both prompts.",
    passCriteria:        "Both images from Firefly. Same subject. Visible style difference.",
    meritCriteria:       "Strong style contrast — the realistic and anime versions look clearly different.",
    distinctionCriteria: "Style contrast is dramatic and intentional. Prompts use specific style words.",
    teacherChecklist: [
      "Are both images from Firefly?",
      "Same subject in both?",
      "Visible style difference?",
    ],
    correctiveHints: [
      "If both images look similar in style: 'To get a clear style difference, add the style word at the START of your prompt and in CAPITALS. Try: \"ANIME STYLE: [your subject]\" vs \"PHOTOREALISTIC: [your subject]\".'",
      "If wrong tool used: 'This objective requires Adobe Firefly specifically — not Canva.'",
    ],
  },
  {
    lmsId:      "l1-05",
    title:      "AI Speaks — First ElevenLabs Voice Generation",
    tier:       "T2 — COMPARE",
    difficulty: 3,
    tools:      ["ElevenLabs"],
    labTask: "Type 3 sentences about a hobby. Generate audio with voice 'Rachel'. Then regenerate the SAME 3 sentences with a completely different voice. Download both.",
    submitRequirements:  "2 audio files (same text, 2 different ElevenLabs voices) plus the 3-sentence text.",
    passCriteria:        "Both audio files playable. Same text in both. Different voices.",
    meritCriteria:       "Voices are clearly contrasting (e.g. one warm, one dramatic). Audio quality is clean.",
    distinctionCriteria: "Strong, intentional voice choice for both. Student articulates what they liked about each.",
    teacherChecklist: [
      "Are both audio files playable?",
      "Same text in both?",
      "Are voices clearly different?",
    ],
    correctiveHints: [
      "If files will not upload: 'Download the MP3 from ElevenLabs History tab, then upload directly.'",
      "If student used the same voice twice: 'Click the voice name — you will see a full library. Choose one that sounds very different from Rachel.'",
    ],
  },
  {
    lmsId:      "l1-06",
    title:      "Build Your AI Academy Avatar",
    tier:       "T3 — CONSTRUCT",
    difficulty: 3,
    tools:      ["Whiteboard (image)"],
    labTask: "Open the worksheet — that's where you design who your avatar is. Write down what they look like, how they sound, and three things about their personality. Then switch the whiteboard to Image, type your avatar description, and hit send. (Or drop in a photo of you and ask AIDA to turn it into your avatar.) Once your avatar is in chat, tap SAGE to check your work.",
    submitRequirements:  "Filled-in worksheet + your avatar image in chat.",
    passCriteria:        "Your avatar matches what you wrote in the worksheet.",
    meritCriteria:       "Your avatar shows the personality you described — you can see the vibe.",
    distinctionCriteria: "Your avatar nails exactly what you set out to build.",
    teacherChecklist: [
      "Is the worksheet submitted with all Think It + Identity Card fields filled?",
      "Is an avatar image in the chat history?",
      "Does the rendered avatar match the appearance brief?",
      "Are at least one personality trait visible (posture / expression / signature element)?",
    ],
    correctiveHints: [
      "If the image doesn't match the Identity Card: 'The brief said \"sleek black hoodie + futuristic studio\" and I'm seeing a basic portrait. Rewrite your prompt from the Identity Card and regenerate.'",
      "If appearance description is under 40 words: 'Describe age, clothing, expression, posture, and the setting. At least 40 words — this is your build brief AND your image prompt.'",
      "If style looks glitched: 'Generate once more, tightening the style words. \"Anime\" or \"3D Pixar render\" are stronger anchors than \"cool\".'",
    ],
  },
  {
    lmsId:      "l1-07",
    title:      "Build a Multimodal Set — One Topic, Three Tools",
    tier:       "T3 — CONSTRUCT",
    difficulty: 4,
    tools:      ["ChatGPT", "Canva AI", "Suno.ai"],
    labTask: "Pick one topic. (1) ChatGPT: 5-sentence explanation. (2) Canva AI: an image representing the topic. (3) Suno.ai: a 30-second mood track. All three must share the same topic.",
    submitRequirements:  "Text + image + music — all on the same topic.",
    passCriteria:        "All 3 tools used correctly. All 3 outputs share the topic.",
    meritCriteria:       "Outputs show clear thematic coherence. Topic is interesting/specific.",
    distinctionCriteria: "Strong creative coherence — text, image, and music feel like one unified piece.",
    teacherChecklist: [
      "Are all 3 tools used?",
      "Do all 3 outputs match the same topic?",
    ],
    correctiveHints: [
      "If one output is off-topic: 'Your [X] output doesn't match. Regenerate it using the same topic as the others.'",
      "If wrong tools used: 'Text from ChatGPT, image from Canva AI, music from Suno.ai specifically.'",
    ],
  },
  {
    lmsId:      "l1-08",
    title:      "Create Your AI Academy Avatar",
    tier:       "T3 — CONSTRUCT",
    difficulty: 4,
    tools:      ["HeyGen", "D-ID"],
    labTask: "Choose an avatar. Pick a voice. Generate the avatar speaking the introduction script: 'Hi, I am [your avatar name]. I am an AI Creator at AI Decoder Academy. In 6 weeks, I will build my own educational film using artificial intelligence.' Download the clip.",
    submitRequirements:  "Avatar video clip with avatar speaking the script + avatar name.",
    passCriteria:        "Video plays. Avatar visible and speaking. Contains the script.",
    meritCriteria:       "Avatar customised to reflect the student's personality. Voice fits the avatar.",
    distinctionCriteria: "Polished avatar with intentional customisation. Performance feels confident.",
    teacherChecklist: [
      "Is the video playable?",
      "Is the avatar visible and speaking?",
      "Does it contain the script?",
    ],
    correctiveHints: [
      "If video will not download: 'In HeyGen, click the three-dot menu on your finished video and select Download. Wait 2 minutes if still processing.'",
      "If default avatar (no customisation): 'For Merit — change at least the avatar appearance and voice to feel like YOU.'",
    ],
  },
  {
    lmsId:      "l1-09",
    title:      "Image Detail Escalation — 5-Step Build",
    tier:       "T4 — EXPERIMENT",
    difficulty: 5,
    tools:      ["Adobe Firefly", "Canva AI"],
    labTask: "Start with a 2-word prompt. Generate. Add 3 more descriptive words and regenerate. Repeat for 5 total versions. Each version adds detail to the previous.",
    submitRequirements:  "5 images as a sequence (V1 through V5) with the exact prompt used for each.",
    passCriteria:        "All 5 versions present. Each prompt builds on the previous.",
    meritCriteria:       "Visible quality improvement V1 → V5. Prompts add meaningful detail (style, lighting, mood).",
    distinctionCriteria: "Dramatic visual evolution. Final image is professional-quality.",
    teacherChecklist: [
      "Are all 5 versions present?",
      "Does each prompt build on the previous?",
      "Is there visible improvement?",
    ],
    correctiveHints: [
      "If all prompts are the same length: 'Each version must be longer than the one before — add words, don't replace them.'",
      "If images don't visually improve: 'Focus on adding DESCRIPTIVE words: lighting, colour palette, artistic style, camera angle.'",
    ],
  },
  // l1-10 ("Your First AI Comic Strip") is a STAGED rubric (lib/obj10Rubric.ts).
  // This single-pass mirror entry is for ObjectiveCard display only — the
  // actual validation always routes through the staged pipeline.
  {
    lmsId:      "l1-10",
    title:      "Your First AI Comic Strip",
    tier:       "T4 — EXPERIMENT",
    difficulty: 4,
    tools:      ["Whiteboard (image)"],
    labTask: "Open the worksheet — that's where you plan your comic. Pick one funny idea, break it into three moments (setup, twist, punchline), and write what each panel will say. Read it back: does panel 3 make YOU laugh? If yes, switch the whiteboard to Image, paste your panel prompts, and generate your comic. Drop the final image in chat, then tap SAGE to check it.",
    submitRequirements:  "Filled-in worksheet + 3-panel comic image in chat.",
    passCriteria:        "Three panels, each with dialogue, and a punchline in panel 3.",
    meritCriteria:       "The punchline clearly lands. Panels feel different from each other.",
    distinctionCriteria: "Your comic actually gets the reaction you said it would.",
    teacherChecklist: [
      "Is the worksheet submitted with Think It + Story It complete?",
      "Are all 3 panels present in the generated image?",
      "Does each panel have dialogue?",
      "Is the Funny Test confirmed?",
    ],
    correctiveHints: [
      "If panel 3 doesn't land: 'The punchline must make YOU react before you submit. If it doesn't land for you, your audience won't feel it either — rethink panel 3.'",
      "If panels all look the same: 'Each panel is a different moment in time. Panel 1 = setup, Panel 2 = twist, Panel 3 = punchline. Tighten your prompts so each panel reads as a separate beat.'",
      "If character looks different across panels: 'Use the EXACT same character description in all three panel prompts — verbatim. That keeps the character consistent.'",
    ],
  },
  {
    lmsId:      "l1-11",
    title:      "AI Slide Deck — Auto-Generated Presentation",
    tier:       "T4 — EXPERIMENT",
    difficulty: 5,
    tools:      ["Gamma.app", "Beautiful.ai"],
    labTask: "Use Gamma's 'Generate a Deck'. Prompt: 'Create a 5-slide educational presentation about [topic from school] for students aged 13–15. Title slide + 3 content slides + conclusion.'",
    submitRequirements:  "5 slides + the generating prompt.",
    passCriteria:        "All 5 slides present. Generated by Gamma. Prompt included.",
    meritCriteria:       "Topic is genuinely educational. Slides have meaningful content.",
    distinctionCriteria: "Polished deck with strong visuals. Content is well-structured.",
    teacherChecklist: [
      "Are all 5 slides present?",
      "Was Gamma.app used?",
      "Is the generating prompt included?",
    ],
    correctiveHints: [
      "If student manually built slides in Canva: 'This requires Gamma.app's AI generation feature — open gamma.app, click Generate.'",
      "If only 3-4 slides: 'Specify \"exactly 5 slides\" in your prompt. You can also add manually in Gamma.'",
    ],
  },
  {
    lmsId:      "l1-12",
    title:      "Avatar + Voice = My First Talking Explainer Clip",
    tier:       "T5 — COMBINE",
    difficulty: 6,
    tools:      ["HeyGen", "ElevenLabs"],
    labTask: "Step 1: ElevenLabs narration of a 3-sentence educational script using the capstone voice. Step 2: HeyGen video of YOUR avatar presenting the SAME 3 sentences.",
    submitRequirements:  "ElevenLabs audio + HeyGen avatar video + script (must match in both).",
    passCriteria:        "Both files present. Same script in both. Avatar visible.",
    meritCriteria:       "Audio is clear, avatar is well-styled. Script is genuinely educational.",
    distinctionCriteria: "Feels like a polished short explainer clip — professional quality.",
    teacherChecklist: [
      "Are both files present?",
      "Same script in both?",
      "Avatar visible in HeyGen?",
    ],
    correctiveHints: [
      "If HeyGen shows text only (no avatar): 'Make sure you selected an Avatar in HeyGen before generating.'",
      "If audio and video scripts differ: 'The script must be identical in both tools — regenerate whichever differs.'",
    ],
  },
  {
    lmsId:      "l1-13",
    title:      "My Capstone Topic — First Full Multimodal Draft",
    tier:       "T5 — COMBINE",
    difficulty: 6,
    tools:      ["ChatGPT", "Canva AI", "Suno.ai", "ElevenLabs"],
    labTask: "Choose your capstone topic. (1) ChatGPT: 5-sentence explanation. (2) Canva AI: image of the most important concept. (3) Suno.ai: 30-second mood track. (4) ElevenLabs: narration of the explanation in your chosen voice.",
    submitRequirements:  "All 4 outputs (text + image + music + audio) + capstone topic name.",
    passCriteria:        "All 4 tools used correctly. All outputs share the capstone topic.",
    meritCriteria:       "Outputs are coherent and intentional. Capstone topic is well-defined.",
    distinctionCriteria: "Feels like a real first asset set for a film. Professional polish.",
    teacherChecklist: [
      "Are all 4 tools used?",
      "Do all outputs share the capstone topic?",
    ],
    correctiveHints: [
      "If capstone topic not chosen: 'Decide your capstone topic — one concept from school you want to teach others. Write it at the top.'",
      "If one tool's output missing: 'Just the [missing tool] is needed. Open [tool], create the [output type], add it.'",
    ],
  },
  {
    lmsId:      "l1-14",
    title:      "Capstone Film Blueprint — Complete Concept Document",
    tier:       "T6 — CREATE",
    difficulty: 6,
    tools:      ["ChatGPT", "Canva AI", "Gamma.app"],
    labTask: "Build a 5-element Blueprint Document: (1) Film title (5 ChatGPT options, choose one). (2) Target audience description. (3) 3-act outline (intro, 3 key points, conclusion). (4) Canva AI title card. (5) 3-slide Gamma storyboard (opening, key concept, closing).",
    submitRequirements:  "Title + ChatGPT title options screenshot + audience + 3-act outline + Canva title card + 3-slide Gamma storyboard.",
    passCriteria:        "All 5 elements present. Title card from Canva (not web). Storyboard has 3 distinct scenes.",
    meritCriteria:       "Blueprint is cohesive and well-thought-through. Strong visual identity.",
    distinctionCriteria: "Feels like a real pre-production document — professional and ready to film.",
    teacherChecklist: [
      "Are all 5 blueprint elements present?",
      "Is the title card from Canva AI?",
      "Does the storyboard show 3 distinct scenes?",
    ],
    correctiveHints: [
      "If title options missing: 'Show the ChatGPT conversation where you asked for 5 title options — screenshot that exchange.'",
      "If storyboard has only 1 slide: 'Add the prompt \"Create exactly 3 slides: opening scene, key concept, closing scene\" and regenerate.'",
    ],
  },

  // ─── Supplementary L1-15..L1-18 (from user-provided extension) ─────────────
  {
    lmsId:      "l1-15",
    title:      "Prompt Upgrade — From Simple to Specific",
    tier:       "T2 — COMPARE",
    difficulty: 3,
    tools:      ["ChatGPT"],
    labTask: "Type a VERY simple prompt such as 'Explain space.' and screenshot. Then rewrite it with a ROLE (e.g. teacher), AUDIENCE (e.g. 10-year-old), and FORMAT (e.g. 4 bullets). Run improved prompt and screenshot.",
    submitRequirements:  "2 screenshots — simple prompt output, improved prompt output — side by side.",
    passCriteria:        "Both screenshots present. The second prompt is clearly more detailed than the first. Outputs are different.",
    meritCriteria:       "Improved prompt includes at least role + audience + format. Output is more structured.",
    distinctionCriteria: "Both outputs strong. Student adds 1-2 sentences explaining which addition (role, audience, or format) made the biggest difference.",
    teacherChecklist: [
      "Are both outputs present?",
      "Is the second prompt more detailed?",
      "Does the improved output show structure?",
    ],
    correctiveHints: [
      "If outputs look similar: 'Your improved prompt may not be specific enough. Add a clear FORMAT instruction like \"in 4 bullet points\" or \"in steps\".'",
    ],
  },
  {
    lmsId:      "l1-16",
    title:      "Image Variation Lab — Same Prompt, 3 Results",
    tier:       "T2 — COMPARE",
    difficulty: 3,
    tools:      ["Adobe Firefly"],
    labTask: "Write ONE image prompt (e.g. 'a futuristic city at night'). Generate 3 times with the SAME prompt. Download all three.",
    submitRequirements:  "3 images from the SAME prompt, side by side, plus the prompt.",
    passCriteria:        "All 3 images present. Same prompt used each time.",
    meritCriteria:       "Student adds a 1-sentence note describing one visible difference between the images.",
    distinctionCriteria: "Student explains in 2 sentences how AI can produce different results from the same prompt.",
    teacherChecklist: [
      "Is the same prompt used?",
      "Are all 3 images present?",
    ],
    correctiveHints: [
      "If images look identical: 'Click generate again — AI image tools create slight variations each time.'",
    ],
  },
  {
    lmsId:      "l1-17",
    title:      "Text to Voice Story — Short Story Narration",
    tier:       "T3 — CONSTRUCT",
    difficulty: 4,
    tools:      ["ChatGPT", "ElevenLabs"],
    labTask: "ChatGPT: generate a short 3-4 sentence story. Copy the story. ElevenLabs: generate audio narration of the SAME story.",
    submitRequirements:  "Story text + audio narration file.",
    passCriteria:        "Story text and audio file are present. Audio matches the text.",
    meritCriteria:       "Story is creative and complete. Audio is clear and understandable.",
    distinctionCriteria: "Student generates a second version with a different voice and submits both.",
    teacherChecklist: [
      "Is the audio the same as the text?",
      "Is the story creative?",
    ],
    correctiveHints: [
      "If audio mismatches text: 'Copy the exact story text into ElevenLabs before generating audio.'",
    ],
  },
  {
    lmsId:      "l1-18",
    title:      "Audio + Image Pair — Match the Mood",
    tier:       "T5 — COMBINE",
    difficulty: 6,
    tools:      ["Suno.ai", "Adobe Firefly"],
    labTask: "Suno.ai: create a music track with a clear mood (happy, scary, epic, etc.). Firefly: generate an image that visually matches the SAME mood.",
    submitRequirements:  "1 music track + 1 image — both representing the same mood. Mood written in submission.",
    passCriteria:        "Both outputs present. Mood is clearly stated.",
    meritCriteria:       "Image and music clearly match the same mood.",
    distinctionCriteria: "Strong coherence between image and music. Student adds 1-2 sentences explaining how they match.",
    teacherChecklist: [
      "Do both outputs match the same mood?",
      "Is the mood clearly stated?",
    ],
    correctiveHints: [
      "If mismatch: 'Decide the mood first (e.g. \"dark and scary\") and use that SAME word in both tools.'",
    ],
  },
];

// ─── LEVEL 2 ─ PROMPT STRATEGIST (Arena 2) — stubbed for Week 2 ──────────────
// TODO: Fill rubric details for L2-01..L2-18 when Week 2 work begins.
// The validator will fall back to a generic rubric until these are completed.

export const RUBRICS_L2: ObjectiveRubric[] = [];

// ─── Combined index ──────────────────────────────────────────────────────────
// Static imports for staged rubrics (currently only OBJ 10). Adding more
// staged rubrics later → import them here and extend STAGED_RUBRICS.

import { OBJ10_RUBRIC, type StagedRubric } from "@/lib/obj10Rubric";
import { OBJ6_STAGED_RUBRIC } from "@/lib/obj6Rubric";

export type AnyRubric = ObjectiveRubric | StagedRubric;

const SINGLE_RUBRICS: ObjectiveRubric[] = [...RUBRICS_L1, ...RUBRICS_L2];
const STAGED_RUBRICS: StagedRubric[]    = [OBJ10_RUBRIC, OBJ6_STAGED_RUBRIC];

const singleRubricMap: Record<string, ObjectiveRubric> = Object.fromEntries(
  SINGLE_RUBRICS.map(r => [r.lmsId, r]),
);
const stagedRubricMap: Record<string, StagedRubric> = Object.fromEntries(
  STAGED_RUBRICS.map(r => [r.lmsId, r]),
);

// Single-pass-only lookup (preserved for the existing /api/aida/validate
// route — it only knows how to grade ObjectiveRubric and would crash on a
// StagedRubric shape).
export function getRubric(lmsId: string): ObjectiveRubric | undefined {
  return singleRubricMap[lmsId];
}

// Generic lookup that returns either kind. Use this from places that need
// to branch on rubric.kind (e.g. TeacherCharacter dispatcher).
export function getAnyRubric(lmsId: string): AnyRubric | undefined {
  return stagedRubricMap[lmsId] ?? singleRubricMap[lmsId];
}

export function getStagedRubric(lmsId: string): StagedRubric | undefined {
  return stagedRubricMap[lmsId];
}

// Generic fallback for arenas/objectives without a fully-specified rubric yet.
// Validator uses the existing Objective.description as the loose "task".
export function genericRubric(title: string, taskDescription: string): ObjectiveRubric {
  return {
    lmsId:      "generic",
    title,
    tier:       "T1 — EXPLORE",
    difficulty: 3,
    tools:      [],
    labTask:             taskDescription,
    submitRequirements:  "Submit the output described in the task.",
    passCriteria:        "Required output is present and matches the task description.",
    meritCriteria:       "Output shows quality and intentional creative decisions.",
    distinctionCriteria: "Output is professional-quality with mastery and self-direction.",
    teacherChecklist: [
      "Is the required output present?",
      "Does it match what the task asked for?",
    ],
    correctiveHints: [
      "If output is missing: 'Make sure you've actually generated the asked-for output and shared it in the chat.'",
      "If output doesn't match task: 'Re-read the task carefully — what specifically did it ask you to create?'",
    ],
  };
}

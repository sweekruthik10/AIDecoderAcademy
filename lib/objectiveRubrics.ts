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
  // l1-01 ("Netflix Documentary Intro + Avatar Name") — single-pass mirror.
  // The staged validator at /api/aida/validate/obj1 is the source of truth.
  {
    lmsId:      "l1-01",
    title:      "Netflix Documentary Intro + Avatar Name",
    tier:       "T1 — EXPLORE",
    difficulty: 1,
    tools:      ["ChatGPT"],
    labTask: "Open the worksheet — answer four Think It Canvas questions about yourself (who you are, what you care about, what drives you, where you are going). Build your ChatGPT prompt from those answers. Generate a Netflix-style 2-line documentary introduction. Then choose your Avatar Name — the identity you'll carry through all 6 levels. Drop the ChatGPT output and Avatar Name in chat, then tap SAGE.",
    submitRequirements:  "Filled-in worksheet + ChatGPT-generated Netflix-style 2-line intro + Avatar Name (in chat).",
    passCriteria:        "Worksheet complete with all four self-questions answered specifically. ChatGPT intro generated and pasted in chat. Avatar Name chosen.",
    meritCriteria:       "Intro genuinely sounds like the student — not generic. At least one specific personal detail comes through. Avatar Name is intentional, not random.",
    distinctionCriteria: "Intro is dramatic and Netflix-worthy. Student identifies which of their answers had the most impact on the AI output. Avatar Name has personal meaning the student can explain.",
    teacherChecklist: [
      "Are all four Think It self-questions answered specifically?",
      "Was the ChatGPT intro built from those answers (not generic)?",
      "Is the Avatar Name chosen and stated in chat?",
      "Does the intro sound like THIS student (not a template)?",
    ],
    correctiveHints: [
      "If the intro is generic: 'Your answers were too vague — go back, name one specific thing about each. \"I love music\" is generic. \"I learn songs by ear from old Bollywood movies\" lands.'",
      "If Avatar Name is missing: 'Pick your Avatar Name now — this is your identity for the next 6 levels. Make it intentional.'",
    ],
  },
  // l1-02 ("Three AI Brains, One Question") — single-pass mirror.
  {
    lmsId:      "l1-02",
    title:      "Three AI Brains, One Question",
    tier:       "T1 — EXPLORE",
    difficulty: 2,
    tools:      ["ChatGPT", "Google Gemini", "Claude.ai"],
    labTask: "Open the worksheet — write one genuine question you actually want answered (something open, requires reasoning, matters to you personally). Ask the exact same question to ChatGPT, Gemini, and Claude. Screenshot each response. Apply CT Skill 2: for each response write one OBSERVATION sentence (literally there) and one INTERPRETATION sentence (what you conclude). Drop all three screenshots in chat with your comparison.",
    submitRequirements:  "Filled-in worksheet + 3 screenshots (ChatGPT, Gemini, Claude responses to the same question) + Observation vs Interpretation notes for each.",
    passCriteria:        "All 3 tools used (different LLMs, not same one 3×). Identical question in all 3. Worksheet has observation + interpretation for each.",
    meritCriteria:       "Question is genuinely open and reasoning-based (not a factual lookup). Observations are LITERAL — they describe what's on screen. Interpretations are clearly separated from observations.",
    distinctionCriteria: "Student identifies a specific structural difference (tone, depth, format) across the three LLMs that they did NOT predict in advance. CT Skill 2 visibly applied.",
    teacherChecklist: [
      "Are all 3 different LLMs used (not the same one 3×)?",
      "Is the question identical in all 3 screenshots?",
      "Does the worksheet separate observation from interpretation for each response?",
      "Is the question open / reasoning-based, not factual?",
    ],
    correctiveHints: [
      "If the same tool was used 3×: 'Each screenshot must be from a different tool — chat.openai.com, gemini.google.com, claude.ai. Open three tabs.'",
      "If question is trivial: 'A factual question like \"What year did India gain independence\" produces three identical answers. Ask something that requires reasoning — \"What's the best way to study for a maths exam in 3 days?\" The disagreement is the lesson.'",
      "If observation and interpretation are mixed: 'Observation is what's literally there: \"Three bullet points.\" Interpretation is what you conclude: \"It seems to prefer structured answers.\" Don't mix them.'",
    ],
  },
  // l1-03 ("Your Impossible World") is a STAGED rubric (lib/obj3Rubric.ts).
  // This single-pass mirror entry is for ObjectiveCard display only — the
  // actual validation always routes through /api/aida/validate/obj3.
  {
    lmsId:      "l1-03",
    title:      "Your Impossible World",
    tier:       "T2 — COMPARE",
    difficulty: 2,
    tools:      ["Canva AI"],
    labTask: "Imagine a scene that cannot exist in reality and bring it to life in Canva AI. Open the worksheet — write Prompt 1 (10+ words describing an impossible scene). Choose 5 additional descriptive words for Prompt 2 BEFORE generating. Generate Version 1, then Version 2 with the 5 added words. Drop both images in chat. Complete the Before-After Comparison and CT-Skill-1 reflection in the worksheet, then tap SAGE to check it.",
    submitRequirements:  "Filled-in worksheet + Version 1 image + Version 2 image (both dropped in chat).",
    passCriteria:        "Worksheet complete with all Think It fields. Prompt 1 ≥ 10 words. Both images submitted, both genuinely impossible. Before-after comparison written.",
    meritCriteria:       "Version 2 is meaningfully different from Version 1. Student identifies which of the 5 added words had the most visual impact — and explains why.",
    distinctionCriteria: "Student identifies a word in Prompt 1 that Canva AI interpreted differently from what they intended — explains the assumption that proved wrong. CT Skill 1 applied with precision.",
    teacherChecklist: [
      "Are both images submitted in chat (Version 1 first, Version 2 second)?",
      "Is Prompt 1 at least 10 words and describing a genuinely impossible scene?",
      "Are the 5 added words visual descriptors (not 'very', 'more', 'bigger')?",
      "Has the student written the Before-After comparison?",
      "Has the student identified a word the AI misinterpreted (for Distinction)?",
    ],
    correctiveHints: [
      "If only one image is in chat: 'I need BOTH versions — Version 1 from Prompt 1, then Version 2 from Prompt 1 + 5 words. Generate the second and drop it in.'",
      "If the scene is just unusual: 'Unusual is not impossible. Floating buildings made of lightning — that's impossible. A futuristic city — that's unusual. Push it further.'",
      "If the 5 added words are intensifiers: 'Words like very, more, bigger don't change what Canva AI draws. Try descriptors: cinematic, golden hour, photorealistic, aerial view, hyperdetailed.'",
    ],
  },
  // l1-04 ("Style Switcher: One Subject, Three Worlds") — single-pass mirror.
  {
    lmsId:      "l1-04",
    title:      "Style Switcher: One Subject, Three Worlds",
    tier:       "T2 — COMPARE",
    difficulty: 3,
    tools:      ["Adobe Firefly"],
    labTask: "Open the worksheet — choose ONE subject (person, animal, object, or place). Choose Style 3 deliberately (not randomly). Write all three Firefly prompts BEFORE generating: same subject, three different style descriptors (photorealistic, anime, your choice). Generate all three in Firefly. Drop the three images in chat in order: Style 1 (photorealistic), Style 2 (anime), Style 3 (your choice). Then complete the CT Skill 2 comparison.",
    submitRequirements:  "Filled-in worksheet + 3 Firefly images (same subject, 3 different styles) dropped in chat in order.",
    passCriteria:        "Worksheet complete with three intentional prompts. All 3 images present in chat. Same subject visible in all 3. Style differences clearly visible.",
    meritCriteria:       "Style differences are dramatic (not subtle). Student picks a Style 3 that's genuinely distinctive — not a near-duplicate of 1 or 2. CT Skill 2 comparison notes are specific, not vague.",
    distinctionCriteria: "Student names ONE specific element (lighting, expression, framing) that changed the FEELING of the subject most across styles. Articulates why style choices shape audience interpretation.",
    teacherChecklist: [
      "Are all 3 images from Firefly (not other tools)?",
      "Is the same subject visible in all 3?",
      "Are the style differences clearly visible (not subtle)?",
      "Is Style 3 a deliberate, distinctive choice?",
    ],
    correctiveHints: [
      "If styles look too similar: 'Put the style word at the START of your prompt in CAPITALS. \"PHOTOREALISTIC PORTRAIT OF\" vs \"ANIME STYLE\" vs \"OIL PAINTING\". Strong style anchors = strong contrast.'",
      "If wrong tool used: 'This objective requires Adobe Firefly specifically — not Canva, not DALL·E.'",
      "If Style 3 is generic: 'Pick a distinctive Style 3 — claymation, pixel art, watercolour, ukiyo-e woodblock. Random doesn't teach you anything. Deliberate does.'",
    ],
  },
  // l1-05 ("AI Writes and Sings Your Theme Song") — single-pass mirror.
  {
    lmsId:      "l1-05",
    title:      "AI Writes and Sings Your Theme Song",
    tier:       "T2 — COMPARE",
    difficulty: 3,
    tools:      ["Suno.ai"],
    labTask: "Open the worksheet — describe yourself in 5 personality words (your energy, your vibe, who you are). Write a Suno.ai style brief: genre, energy, mood, instruments. Open Suno.ai and paste your brief. Generate. If it doesn't capture your personality, adjust ONE element and regenerate. Download the MP3 and drop the audio in chat — this becomes your Level 1 Theme Song (plays during your Avatar reveal in OBJ 6).",
    submitRequirements:  "Filled-in worksheet + final Suno.ai MP3 in chat (your personal Level 1 Theme Song).",
    passCriteria:        "Worksheet complete with 5 personality words + full style brief. MP3 generated in Suno.ai and dropped in chat. Track is original (not just a copy of an existing song).",
    meritCriteria:       "Track genuinely reflects the 5 personality words. Student can point to one specific element (genre / instruments / tempo) that nails their vibe. Style brief is specific, not generic.",
    distinctionCriteria: "Track is something the student would actually put on a personal playlist. Student articulates ONE thing Suno did that they did NOT explicitly request — and whether they keep it or override it.",
    teacherChecklist: [
      "Are the 5 personality words specific (not generic like 'cool' or 'fun')?",
      "Is the style brief detailed (genre + energy + mood + instruments)?",
      "Is the MP3 in chat?",
      "Does the track match the personality words?",
    ],
    correctiveHints: [
      "If words are generic: 'Cool / fun / happy describe everyone. Be specific — \"quietly observant\", \"chaotic-creative\", \"warm but sceptical\". Suno can't translate vague words.'",
      "If track doesn't match: 'Suno reads your style brief literally. If the track feels off, the brief was off. Adjust the energy or genre word and regenerate.'",
      "If track is a cover/copy: 'This must be ORIGINAL. Suno generates new music from your brief — it doesn't copy songs.'",
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
  // l1-07 ("Your Film Poster: Coming Soon") — single-pass mirror.
  {
    lmsId:      "l1-07",
    title:      "Your Film Poster: Coming Soon",
    tier:       "T2 — COMPARE",
    difficulty: 2,
    tools:      ["Adobe Firefly"],
    labTask: "Open the worksheet — write ONE sentence about a topic you find genuinely interesting (something you'd actually watch a film about). Add a tone word and a visual atmosphere word. These three elements become your Firefly prompt. Generate a cinematic movie poster. Your Avatar Name appears as Director on the poster. If it doesn't feel cinematic, adjust ONE word and regenerate. Drop the final poster in chat.",
    submitRequirements:  "Filled-in worksheet + Firefly poster image in chat with Avatar Name visible as Director credit.",
    passCriteria:        "Worksheet complete with a genuine topic sentence + tone word + atmosphere word. Cinematic poster generated in Firefly. Avatar Name visible as Director credit on the poster.",
    meritCriteria:       "Topic feels personal and specific — not generic. Poster has clear cinematic atmosphere (lighting, composition, mood). Student can name which word in the prompt drove the visual mood most.",
    distinctionCriteria: "Poster could plausibly be a real coming-soon film poster. Student articulates ONE creative choice (tone word, atmosphere word, or framing) that turned a generic image into a cinematic one.",
    teacherChecklist: [
      "Is the topic sentence specific (not generic)?",
      "Are the tone + atmosphere words present in the prompt?",
      "Is the Firefly poster in chat?",
      "Is the Avatar Name visible as Director on the poster?",
    ],
    correctiveHints: [
      "If topic is generic: 'A film about \"friendship\" is generic. A film about \"two cousins growing apart after they move to different countries\" is specific. Specific = cinematic.'",
      "If Avatar Name isn't visible: 'Add \"Directed by [Avatar Name]\" to your prompt OR write it on the poster after downloading.'",
      "If poster feels flat: 'Add a stronger atmosphere word. \"Moody\", \"sun-drenched\", \"neon-lit\", \"foggy\" — these change everything visually.'",
    ],
  },
  // l1-08 ("AI Speaks Your Words: Voice Direction Lab") — single-pass mirror.
  {
    lmsId:      "l1-08",
    title:      "AI Speaks Your Words: Voice Direction Lab",
    tier:       "T3 — CONSTRUCT",
    difficulty: 3,
    tools:      ["ElevenLabs"],
    labTask: "Open the worksheet — write exactly 3 sentences about something you genuinely care about. Each sentence complete and emotionally clear on its own. Choose 3 ElevenLabs voices BY NAME ONLY — do not preview them first. Generate your 3 sentences in each voice. Label the audio files Voice A, B, C (NOT the voice names). Listen blind in your worksheet — identify the personality of each speaker from what you literally HEAR. Then reveal the names and reflect. Drop all 3 audio files in chat.",
    submitRequirements:  "Filled-in worksheet + 3 ElevenLabs MP3 audio files in chat (labelled Voice A, B, C).",
    passCriteria:        "Worksheet complete with 3 emotionally clear sentences + blind evaluation completed BEFORE revealing voice names. All 3 audio files in chat. Each voice labelled A / B / C, not by ElevenLabs name.",
    meritCriteria:       "Blind evaluation is specific — student names a personality (warm, urgent, sceptical) for each voice from purely auditory cues. Post-reveal reflection notes ONE thing the voice name implied that the actual voice did not match.",
    distinctionCriteria: "Student identifies a divergence between voice name and voice reality with precision (e.g. \"the voice called 'Energetic' actually felt sarcastic, not energetic\"). CT Skill 2 applied at maximum rigour.",
    teacherChecklist: [
      "Are exactly 3 sentences present?",
      "Were the 3 voices chosen BY NAME without previewing first?",
      "Are the audio files labelled Voice A / B / C (not voice names)?",
      "Did the student do the blind evaluation BEFORE revealing names?",
    ],
    correctiveHints: [
      "If voices were previewed first: 'The blind evaluation only works if you didn't hear them in advance. Pick 3 different voices NEXT time without previewing — that's the lesson.'",
      "If labels reveal the name: 'Re-label as Voice A, B, C. The blind evaluation depends on not knowing.'",
      "If sentences are fragments: 'Three COMPLETE sentences. Each one should stand alone and carry emotion when spoken.'",
    ],
  },
  // l1-09 ("The Negative Prompt Lab: Editing Reality") — single-pass mirror.
  {
    lmsId:      "l1-09",
    title:      "The Negative Prompt Lab: Editing Reality",
    tier:       "T3 — CONSTRUCT",
    difficulty: 4,
    tools:      ["Adobe Firefly"],
    labTask: "Open the worksheet — write your base prompt. Generate Version 1 in Firefly (base prompt only). Examine V1 carefully — list at least 5 elements that appeared that you did NOT explicitly request. Generate Version 2 with first layer of negative prompts (exclude 2-3 elements). Generate Version 3 with extended negative prompts (exclude more). Drop all 3 versions in chat in order (V1, V2, V3). Complete the impact analysis in your worksheet.",
    submitRequirements:  "Filled-in worksheet + 3 Firefly images in chat (V1 base, V2 first exclusions, V3 extended exclusions).",
    passCriteria:        "Worksheet complete with element audit (5+ items) + 3 versions with progressively layered negative prompts. All 3 images in chat in correct order. Visible changes between V1, V2, V3.",
    meritCriteria:       "Student identifies which negative prompt words had the MOST visual impact (not all words remove what you'd expect). Element audit is specific — names what the AI added that wasn't requested. CT Skill 1 visibly applied.",
    distinctionCriteria: "Student articulates WHY Firefly included specific unrequested elements (training data bias, cultural defaults, style assumptions). Demonstrates understanding that AI images carry hidden assumptions.",
    teacherChecklist: [
      "Is the base prompt the same across all 3 versions?",
      "Are at least 5 unrequested elements identified in the audit?",
      "Do V2 and V3 add negative prompt layers (not just regenerate)?",
      "Are visible differences between V1 → V2 → V3?",
    ],
    correctiveHints: [
      "If base prompt changes between versions: 'Keep the BASE prompt identical. Only add negative prompt words at each step. That's what makes the comparison fair.'",
      "If element audit is generic: 'Be specific — \"a man\" isn't an audit. \"A man in a suit standing in front of a car at sunset\" — name the unrequested elements: the suit, the car, the sunset, the way he's standing.'",
      "If V2 and V3 don't change: 'Your negative prompts may be too soft. Try stronger exclusions: \"no people\", \"no text\", \"no background\", \"empty room\".'",
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
import { OBJ3_STAGED_RUBRIC } from "@/lib/obj3Rubric";
import { OBJ4_STAGED_RUBRIC } from "@/lib/obj4Rubric";
import { OBJ7_STAGED_RUBRIC } from "@/lib/obj7Rubric";
import { OBJ9_STAGED_RUBRIC } from "@/lib/obj9Rubric";
import { OBJ1_STAGED_RUBRIC } from "@/lib/obj1Rubric";
import { OBJ2_STAGED_RUBRIC } from "@/lib/obj2Rubric";
import { OBJ5_STAGED_RUBRIC } from "@/lib/obj5Rubric";
import { OBJ8_STAGED_RUBRIC } from "@/lib/obj8Rubric";

export type AnyRubric = ObjectiveRubric | StagedRubric;

const SINGLE_RUBRICS: ObjectiveRubric[] = [...RUBRICS_L1, ...RUBRICS_L2];
const STAGED_RUBRICS: StagedRubric[]    = [
  OBJ10_RUBRIC, OBJ6_STAGED_RUBRIC, OBJ3_STAGED_RUBRIC, OBJ4_STAGED_RUBRIC,
  OBJ7_STAGED_RUBRIC, OBJ9_STAGED_RUBRIC, OBJ1_STAGED_RUBRIC, OBJ2_STAGED_RUBRIC,
  OBJ5_STAGED_RUBRIC, OBJ8_STAGED_RUBRIC,
];

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

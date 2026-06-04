// Declarative form schema for staged-rubric worksheets (OBJ 10, OBJ 6).
//
// The WorksheetPopup component renders these schemas straight to UI. The
// validator routes (api/aida/validate/obj10, api/aida/validate/obj6) read
// the same field ids when extracting an inline-form payload.
//
// IMPORTANT — field id stability:
//   The validator extractors (lib/worksheetExtract.ts → extractFromInlineForm,
//   app/api/aida/validate/obj6/route.ts → fromInline) read SPECIFIC ids:
//     OBJ 10 — intent, assumptions, audience, success, oneSentenceStory,
//              panel1Image/Dialogue, panel2Image/Dialogue, panel3Image/Dialogue,
//              funnyTestPassed.
//     OBJ 6  — intent, assumptions, audience, success, appearance,
//              voiceCharacter, personalityTraits, presentationStyle,
//              scriptConfirmed, successTest.
//   These ids are also persisted in localStorage drafts. Renaming = breaking
//   change for any kid mid-objective. Add new ids freely; never rename old.

export type WorksheetField =
  | { kind: "text";     id: string; label: string; description?: string; placeholder?: string; weakEx?: string; strongEx?: string; minWords?: number }
  | { kind: "longtext"; id: string; label: string; description?: string; placeholder?: string; weakEx?: string; strongEx?: string; minWords?: number; rows?: number }
  | { kind: "yesno";    id: string; label: string; description?: string };

export interface WorksheetSection {
  id:        string;
  title:     string;
  subtitle?: string;
  // Optional longer body paragraph rendered above the fields — used for the
  // "Read each question carefully…" framing text from the docx specs.
  body?:     string;
  // Optional preface bullets — used for the "HOW TO USE THIS WORKSHEET"
  // checklist that appears at the top of both docx specs.
  bullets?:  string[];
  // Sections marked as "info" render no fields, just the body/bullets.
  fields:    WorksheetField[];
}

export interface WorksheetSchema {
  lmsId:    string;       // canonical, e.g. "l1-10"
  legacyId: string;       // arena-room id, e.g. "a1-10"
  title:    string;
  intro:    string;       // short instructions
  sections: WorksheetSection[];
}

// ─── OBJ 10 — Your First AI Comic Strip ─────────────────────────────────────
// All longform copy taken verbatim from
// /saves/objectives/OBJ10_StudentWorksheet.docx.

export const OBJ10_SCHEMA: WorksheetSchema = {
  lmsId:    "l1-10",
  legacyId: "a1-10",
  title:    "Objective 10 — Your First AI Comic Strip",
  intro:    "Document 2 of 2 — Download → Fill in → Upload to LMS. Plan the comic before you generate. The AI Teacher reads this directly.",
  sections: [
    {
      id: "header",
      title: "Header",
      fields: [
        { kind: "text", id: "avatarName", label: "Avatar Name", placeholder: "Your Avatar Name" },
      ],
    },

    {
      id: "howToUse",
      title: "📋  How to use this worksheet",
      body:
        "This worksheet is your planning document for Objective 10. You must complete it BEFORE you generate anything. There is a reason for this — students who plan their comic properly produce something they are genuinely proud of. Students who skip the planning produce three random images.",
      bullets: [
        "Complete THINK IT first — all four fields. Be specific. The AI Teacher will check your thinking.",
        "Complete STORY IT second — all five parts including the Funny Test. Read your plan out loud before you generate anything.",
        "Then switch the whiteboard output to IMAGE and generate your comic right here. Drop the final image in chat — that's how SAGE picks it up.",
        "Upload this completed worksheet AND your comic PNG to the LMS. Both are required.",
      ],
      fields: [],
    },

    {
      id: "thinkIt",
      title: "💡  Think It",
      subtitle: "Complete all four fields before you plan your story or open any tool. These questions change what you build.",
      body:
        "Read each question carefully. Write your genuine answer — not the first thing that comes to mind. The AI Teacher reads these fields and will send you back if your answers are too generic. The weak and strong examples below each question show you the difference between placeholder thinking and genuine thinking.",
      fields: [
        {
          kind: "longtext", id: "intent",
          label: "🎯  Field 1 — Intent",
          description:
            "What should someone FEEL in the 10 seconds it takes to read your three panels? You are engineering a specific reaction — not just making a comic. What is that reaction?",
          weakEx:
            "To make a funny comic.",
          strongEx:
            "To make someone laugh so hard at panel 3 that they screenshot it and send it to their group chat without thinking.",
          rows: 4, minWords: 10,
        },
        {
          kind: "longtext", id: "assumptions",
          label: "🔍  Field 2 — Assumptions",
          description:
            "What are you taking for granted about this comic before you start? Name at least TWO things you are assuming will work. Think about: your humour, your audience's taste, whether AI will understand your idea, whether three panels is enough.",
          weakEx:
            "I assume it will be funny.",
          strongEx:
            "I assume the joke lands in panel 3 — but I have not checked whether panels 1 and 2 build enough tension for it to land. That might be wrong.",
          rows: 4, minWords: 10,
        },
        {
          kind: "longtext", id: "audience",
          label: "👥  Field 3 — Audience",
          description:
            "Who is this comic for — specifically? Name one real type of person. What kind of humour makes them react? What would make them scroll past without stopping?",
          weakEx:
            "My friends.",
          strongEx:
            "My 14-year-old classmate who laughs hardest when something completely ordinary goes catastrophically wrong for no reason — like a vending machine starting a war.",
          rows: 4, minWords: 10,
        },
        {
          kind: "longtext", id: "success",
          label: "✅  Field 4 — Success Definition",
          description:
            "How will you know this comic worked? Name the specific action a specific person takes if it genuinely succeeded. Not 'if people like it' — what do they DO?",
          weakEx:
            "If people like it.",
          strongEx:
            "If someone who does not know me sees this on Instagram and tags a friend in the comments without being asked — that is success.",
          rows: 4, minWords: 10,
        },
      ],
    },

    {
      id: "storyIt",
      title: "📖  Story It",
      subtitle: "Plan your entire comic before you generate anything. Complete all five parts in order. Do not skip ahead.",
      body:
        "A comic with no plan gives you three random images. A comic with a plan gives you something people want to share. These five parts take 10 minutes. They save you 30 minutes of frustrated regenerating.",
      fields: [
        {
          kind: "longtext", id: "oneSentenceStory",
          label: "Part 1 — The one-sentence story",
          description:
            "Write your entire comic in ONE sentence before anything else. Your sentence must include: a character, something that goes wrong or changes, and the result. If you cannot say it in one sentence — your idea is too complicated for three panels. Simplify until it fits.",
          strongEx:
            "A cat gets hired as a professional napper, falls asleep on day one, and misses the entire apocalypse while everyone panics around them.",
          rows: 3, minWords: 8,
        },

        // Part 2 — three sentence panel breakdown (new fields, not validator-gated)
        {
          kind: "longtext", id: "panel1Setup",
          label: "Part 2 — Panel 1 — THE SETUP",
          description: "The normal situation. One sentence describing what is visible, what is happening, and what the character is doing.",
          rows: 2,
        },
        {
          kind: "longtext", id: "panel2Twist",
          label: "Part 2 — Panel 2 — THE TWIST",
          description: "Something goes wrong or escalates. One sentence.",
          rows: 2,
        },
        {
          kind: "longtext", id: "panel3Punchline",
          label: "Part 2 — Panel 3 — THE PUNCHLINE",
          description: "The payoff — the moment people screenshot. One sentence. If panel 3 is not the funniest moment, rearrange until it is.",
          rows: 2,
        },

        // Part 3 — image prompts (validator-gated ids retained)
        {
          kind: "longtext", id: "panel1Image",
          label: "Part 3 — Panel 1 image prompt",
          description:
            "The exact text you will type into the whiteboard's IMAGE generator. Include: (1) the character with a specific appearance description, (2) the setting, (3) the action happening, (4) the art style.",
          placeholder: "[character appearance — be specific] + [setting] + [action] + [art style]",
          rows: 3, minWords: 8,
        },
        {
          kind: "longtext", id: "panel2Image",
          label: "Part 3 — Panel 2 image prompt",
          description:
            "Use the EXACT SAME character description as Panel 1 — this is what keeps your character consistent.",
          placeholder: "[SAME character appearance] + [new setting] + [escalated action] + [same art style]",
          rows: 3, minWords: 8,
        },
        {
          kind: "longtext", id: "panel3Image",
          label: "Part 3 — Panel 3 image prompt (PUNCHLINE)",
          description:
            "Use the EXACT SAME character description. This is the punchline panel.",
          placeholder: "[SAME character appearance] + [punchline setting] + [punchline moment] + [same art style]",
          rows: 3, minWords: 8,
        },

        // Part 4 — dialogue (validator-gated ids retained)
        {
          kind: "text", id: "panel1Dialogue",
          label: "Part 4 — Panel 1 text (setup line)",
          description: "Speech bubble, caption, or narration box. MAXIMUM one line per panel.",
        },
        {
          kind: "text", id: "panel2Dialogue",
          label: "Part 4 — Panel 2 text (escalation line)",
        },
        {
          kind: "text", id: "panel3Dialogue",
          label: "Part 4 — Panel 3 text (PUNCHLINE — your most important line)",
          description: "Your Panel 3 line is the most important sentence in this entire objective. It is the punchline. Make it count.",
        },

        // Part 5 — the funny test (validator-gated id retained)
        {
          kind: "yesno", id: "funnyTestPassed",
          label: "Part 5 — Funny Test",
          description:
            "Read your complete Story It plan out loud — all panels, all dialogue. Does Panel 3 make you react, even slightly? If YES, you are ready to generate. If NO, change panel 3 before you generate anything. This is non-negotiable.",
        },
        {
          kind: "longtext", id: "funnyTestNotes",
          label: "If NO — what did you change?",
          description: "Only fill this if you flipped your Funny Test answer to YES after editing panel 3. Tell us what you changed.",
          rows: 2,
        },
      ],
    },

    {
      id: "reflection",
      title: "💡  Assumption Reflection",
      subtitle: "Complete AFTER creating your comic.",
      body:
        "Go back to Field 2 — Assumptions. Now that you have created your comic, answer both questions honestly.",
      fields: [
        {
          kind: "longtext", id: "heldAssumption",
          label: "✅  Which assumption turned out to be CORRECT?",
          description: "Write the assumption that held true.",
          rows: 3,
        },
        {
          kind: "longtext", id: "brokenAssumption",
          label: "❌  Which assumption turned out to be WRONG — and what actually happened?",
          description: "Be honest. The whole point of writing assumptions is being able to spot when one was off.",
          rows: 3,
        },
      ],
    },
  ],
};

// ─── OBJ 6 — Build Your AI Academy Avatar ────────────────────────────────────
// All longform copy taken verbatim from
// /saves/objectives/OBJ6_Doc2_StudentWorksheet.docx.

export const OBJ6_SCHEMA: WorksheetSchema = {
  lmsId:    "l1-06",
  legacyId: "a1-6",
  title:    "Objective 6 — Build Your AI Academy Avatar",
  intro:    "Document 2 of 2 — Download → Fill in → Upload to LMS. ⚠️ Complete Objective 5 (Your Theme Song) before starting this worksheet. Your final deliverable is an AVATAR IMAGE — generate it in Visual Studio (Image output) or drop your own photo into chat to be restyled.",
  sections: [
    {
      id: "header",
      title: "Header",
      fields: [
        { kind: "text",  id: "avatarName",   label: "Avatar Name", placeholder: "Your Avatar Name — from Class 1" },
        { kind: "yesno", id: "obj5Complete", label: "Objective 5 (Theme Song) submitted?" },
      ],
    },

    {
      id: "howToUse",
      title: "📋  How to use this worksheet",
      body:
        "Your avatar is your creative identity for all 6 levels of this programme — and for your Capstone Showcase. This is not a quick exercise. A student who thinks carefully about their avatar design before generating produces something that feels like a real character. A student who clicks randomly produces a forgettable template.",
      bullets: [
        "Complete THINK IT first — all four Canvas fields.",
        "Complete the AVATAR IDENTITY CARD — all six sections. This card is your image prompt.",
        "THEN switch the whiteboard to IMAGE output and generate your avatar from the Identity Card — OR drop a photo of yourself in chat and ask AIDA to restyle it.",
        "Complete the REFLECTION after creating your avatar image.",
        "Upload this worksheet AND your avatar image to the LMS. Both are required.",
        "IMPORTANT — your theme song from Objective 5 will play when your avatar is revealed in class. Build your avatar with that moment in mind.",
      ],
      fields: [],
    },

    {
      id: "thinkIt",
      title: "💡  Think It",
      subtitle: "Answer all four fields before designing your avatar or generating anything. Your avatar represents you for 6 levels.",
      body:
        "Objective 6 has the highest Think It Canvas threshold of Level 1 — 70%. The AI Teacher is specifically calibrated to detect generic answers here because shallow thinking at this stage produces an avatar you will not be proud of by Level 6.",
      fields: [
        {
          kind: "longtext", id: "intent",
          label: "🎯  Field 1 — Intent",
          description:
            "Your avatar walks into a room before it speaks. What do you want the people in that room to feel in the first 5 seconds of seeing your avatar — before it says a single word?",
          weakEx:
            "To create my avatar.",
          strongEx:
            "To design a presenter that my classmates — who mostly trust informal, energetic communicators over formal ones — will immediately want to listen to before a word is spoken.",
          rows: 4, minWords: 10,
        },
        {
          kind: "longtext", id: "assumptions",
          label: "🔍  Field 2 — Assumptions",
          description:
            "What are you assuming about what makes a presenter trustworthy and engaging for a 13–14 year old audience? Name at least two assumptions. These are the bets you are making in every design decision.",
          weakEx:
            "I assume it will look good.",
          strongEx:
            "I assume looking professional equals trustworthy — but for my audience, someone who looks relatable might create more trust than someone who looks like a news anchor. This could be wrong.",
          rows: 4, minWords: 10,
        },
        {
          kind: "longtext", id: "audience",
          label: "👥  Field 3 — Audience",
          description:
            "Who specifically will watch your avatar — in class and when you post it? What do they respond to in a presenter? What would make them immediately disengage?",
          weakEx:
            "Students.",
          strongEx:
            "Students aged 13–14 who scroll past content that feels too formal or too adult. They respond to personality and authenticity over polish and professionalism.",
          rows: 4, minWords: 10,
        },
        {
          kind: "longtext", id: "success",
          label: "✅  Field 4 — Success Definition",
          description:
            "If a student your age watched your avatar for 10 seconds with no sound — what would they think about this presenter? Write that thought. That thought is your success definition.",
          weakEx:
            "If it looks good.",
          strongEx:
            "If a student my age watched for 10 seconds with no sound and thought — I want to hear what this person has to say — that is success.",
          rows: 4, minWords: 10,
        },
      ],
    },

    {
      id: "identityCard",
      title: "📖  Avatar Identity Card",
      subtitle: "Complete all six sections before generating. This card IS your image prompt — every detail in it ends up in the final avatar.",
      body:
        "Six sections. Each one tells the image generator something different about who your avatar is. The more specific you are here, the more intentional your final avatar will be.",
      fields: [
        // Section 1 — name + role (new "avatarRole" field, name reuses header id)
        {
          kind: "text", id: "avatarRole",
          label: "Section 1 — Role in your film",
          description:
            "Are they a presenter, a guide, a narrator, an expert, a character? What function do they serve in your film?",
        },

        // Section 2 — appearance (validator-gated id retained)
        {
          kind: "longtext", id: "appearance",
          label: "Section 2 — Appearance (minimum 40 words)",
          description:
            "Describe your avatar's appearance in enough detail that someone who has never seen them could recreate them visually. Include: age range, clothing style, expression, setting they are typically seen in, and one distinctive visual element that makes them instantly recognisable.",
          rows: 5, minWords: 40,
        },

        // Section 3 — personality traits (validator-gated id retained, expanded)
        {
          kind: "longtext", id: "personalityTraits",
          label: "Section 3 — Personality traits (3 traits + behavioural descriptions)",
          description:
            "Write 3 personality traits. For each trait, write one sentence explaining HOW it shows up in the way your avatar speaks or moves. A list of adjectives is not enough — the behaviour description is what makes the avatar real.\n\n" +
            "Examples (don't copy — adapt):\n" +
            "  • Trait 1: Curious — leans in slightly before speaking, as if hearing something for the first time.\n" +
            "  • Trait 2: Confident — speaks with pace and certainty, never trailing off or hedging.\n" +
            "  • Trait 3: Warm — makes eye contact with the camera, speaks as if addressing one specific person.",
          rows: 5, minWords: 30,
        },

        // Section 4 — voice character (validator-gated id retained)
        {
          kind: "longtext", id: "voiceCharacter",
          label: "Section 4 — Voice character",
          description:
            "What does your avatar's voice communicate BEFORE the words start? Not the quality — the CHARACTER. Not 'clear' or 'professional' — what is the ONE quality that makes their voice distinctly theirs? Examples: quiet intensity, warm authority, energetic curiosity, calm certainty, playful sharpness.",
          rows: 3, minWords: 6,
        },

        // Section 5 — signature style (NEW)
        {
          kind: "longtext", id: "presentationStyle",
          label: "Section 5 — Signature style",
          description:
            "What is ONE thing about this avatar that makes them instantly recognisable? Something visual, verbal, or behavioural that people will remember. It should be specific enough that if someone described it, you would know immediately which avatar they meant.",
          rows: 3, minWords: 8,
        },

        // Section 6 — required script
        {
          kind: "yesno", id: "scriptConfirmed",
          label: "Section 6 — Required script: I will deliver the three required lines verbatim",
          description:
            "Your avatar must deliver these three lines in this order:\n" +
            "1. \"Hi. I am [YOUR AVATAR NAME HERE]. I am an AI Creator at AI Decoder Academy.\"\n" +
            "2. \"I believe that the most powerful thing a person can be in the AI era is someone who thinks clearly before they create.\"\n" +
            "3. \"By Level 6 — I will have built something the world has never seen.\"\n" +
            "Practise these lines before you record. Your avatar should deliver them with the personality traits from Section 3 — not in a monotone.",
        },

        // Success test — kept for validator extractor parity
        {
          kind: "longtext", id: "successTest",
          label: "Success test — what would your audience say or do?",
          description:
            "What is the observable behaviour from your target audience that would tell you this avatar worked? Reuse the bar you set in Field 4.",
          rows: 2, minWords: 8,
        },
      ],
    },

    {
      id: "reflection",
      title: "💡  Reflection",
      subtitle: "Complete AFTER creating your avatar video.",
      body:
        "Watch your finished avatar video back and answer both questions honestly.",
      fields: [
        {
          kind: "longtext", id: "intentionalOutcome",
          label: "✅  Does your avatar achieve your Success Definition from Field 4? What evidence do you have?",
          rows: 3,
        },
        {
          kind: "longtext", id: "unintentionalOutcome",
          label: "❌  What does your avatar communicate that you did NOT explicitly plan?",
          description:
            "Look carefully — something is always unintentional. This is Observation vs Interpretation applied to your own creation.",
          rows: 3,
        },
      ],
    },
  ],
};

// ─── OBJ 3 — Your Impossible World ──────────────────────────────────────────
// All longform copy taken verbatim from OBJ3_Doc2_StudentWorksheet.docx.
// Field ids that the validator reads (lib/worksheetExtract.ts / route.ts):
//   intent, assumptions, audience, success,
//   prompt1, additionalWord1..5, additionalWordsWhy,
//   version1Reflection, version2Reflection, ctSkill1Reflection.

export const OBJ3_SCHEMA: WorksheetSchema = {
  lmsId:    "l1-03",
  legacyId: "a1-3",
  title:    "Objective 3 — Your Impossible World",
  intro:    "Document 2 of 2 — Plan your scene before Canva AI opens. Students who plan produce more striking images.",
  sections: [
    {
      id: "header",
      title: "Header",
      fields: [
        { kind: "text", id: "avatarName", label: "Avatar Name", placeholder: "Your Avatar Name (from OBJ 1)" },
      ],
    },

    {
      id: "howToUse",
      title: "📋  How to use this worksheet",
      body:
        "This worksheet guides you through creating your Impossible World using Canva AI. Complete Think It and Story It BEFORE you open Canva AI. Students who plan their scene produce more striking images — because they give Canva AI more to work with.",
      bullets: [
        "Complete THINK IT first — all four Canvas fields.",
        "Write PROMPT 1 in Story It — at least 10 words, all describing the scene.",
        "Plan your 5 additional words for Prompt 2 BEFORE generating Prompt 1.",
        "Generate Prompt 1 in Canva AI. Drop the image in chat.",
        "Generate Prompt 2 (Prompt 1 + 5 words). Drop the image in chat.",
        "Complete the Before-After Comparison and Reflection AFTER generating both images.",
        "Upload this worksheet AND both images to the LMS. Both uploads are required.",
      ],
      fields: [],
    },

    {
      id: "thinkIt",
      title: "💡  Think It",
      subtitle: "Answer all four fields before you imagine your world or open Canva AI.",
      body:
        "The AI Teacher reads these fields before your images are validated. Generic answers like 'to make a cool image' will send you back to this step. Be specific about what reaction you want from your audience.",
      fields: [
        {
          kind: "longtext", id: "intent",
          label: "🎯  Field 1 — Intent",
          description:
            "When someone sees this image, what do you want them to feel or say in the first 2 seconds? What is the specific reaction you are building this for?",
          weakEx:   "To make an impossible image.",
          strongEx: "To create an image that stops someone mid-scroll — something so strange and real-looking that they stare and ask: how is that possible?",
          rows: 4, minWords: 10,
        },
        {
          kind: "longtext", id: "assumptions",
          label: "🔍  Field 2 — Assumptions",
          description:
            "You are about to describe something impossible using words — and trust Canva AI to visualise exactly what you imagined. What are you assuming about how it will interpret your description? What might it get wrong?",
          weakEx:   "I assume it will understand what I mean.",
          strongEx: "I assume Canva AI will interpret 'floating city' as buildings in the sky — but it might show a city floating on water instead. That is a genuine risk. I should add atmospheric words to guide the visual.",
          rows: 4, minWords: 15,
        },
        {
          kind: "longtext", id: "audience",
          label: "👥  Field 3 — Audience",
          description:
            "Who will see this image? What makes something visually striking to them — what would make them stop scrolling versus swipe past?",
          weakEx:   "My friends.",
          strongEx: "My classmates and Instagram followers aged 13–17 who scroll fast. I need something that makes no sense but looks completely real — surreal, not cartoon.",
          rows: 4, minWords: 12,
        },
        {
          kind: "longtext", id: "success",
          label: "✅  Field 4 — Success Definition",
          description:
            "Name one specific reaction from one specific person that would tell you this image worked. Not 'if it looks cool' — what do they literally say or do?",
          weakEx:   "If it looks cool.",
          strongEx: "If someone sees Version 2 and says — wait, what am I looking at? — before I explain anything. That confusion is my success.",
          rows: 4, minWords: 12,
        },
      ],
    },

    {
      id: "storyIt",
      title: "📖  Story It",
      subtitle: "Build your prompts deliberately. Both prompts must describe a genuinely impossible scene.",
      fields: [
        {
          kind: "longtext", id: "prompt1",
          label: "Prompt 1 — Your first Canva AI prompt",
          description:
            "Describe your impossible scene in at least 10 words. Include: the main subject, the environment, the scale, and the atmosphere. Every word should add visual information. RULE: The scene must be physically impossible — it cannot exist in reality.",
          weakEx:   "A floating city in the sky.",
          strongEx: "A city built entirely inside a thundercloud, with buildings made of lightning, glowing edges, photorealistic, aerial view.",
          rows: 4, minWords: 10,
        },
        {
          kind: "text", id: "additionalWord1",
          label: "Additional Word 1",
          description: "Word that adds NEW visual info (lighting, texture, time of day, perspective, colour, style).",
          placeholder: "e.g. cinematic",
        },
        {
          kind: "text", id: "additionalWord2",
          label: "Additional Word 2",
          placeholder: "e.g. golden hour",
        },
        {
          kind: "text", id: "additionalWord3",
          label: "Additional Word 3",
          placeholder: "e.g. photorealistic",
        },
        {
          kind: "text", id: "additionalWord4",
          label: "Additional Word 4",
          placeholder: "e.g. aerial view",
        },
        {
          kind: "text", id: "additionalWord5",
          label: "Additional Word 5",
          placeholder: "e.g. hyperdetailed",
        },
        {
          kind: "longtext", id: "additionalWordsWhy",
          label: "Why these 5 words",
          description:
            "What visual change do you expect each one to create? Avoid words like 'very', 'more', 'bigger', 'nice', 'cool' — they don't add visual information.",
          weakEx:   "They will make it look better.",
          strongEx: "'Cinematic' should give it film-like framing; 'golden hour' adds warm directional light; 'photorealistic' pushes it away from cartoon style; 'aerial view' changes the camera angle; 'hyperdetailed' adds texture across surfaces.",
          rows: 4, minWords: 20,
        },
      ],
    },

    {
      id: "beforeAfter",
      title: "🔍  Before-After Comparison",
      subtitle: "Complete AFTER generating both images.",
      fields: [
        {
          kind: "longtext", id: "version1Reflection",
          label: "Version 1 — What did Canva AI produce?",
          description:
            "What did you expect versus what did you get? Did any word get interpreted differently from what you imagined?",
          rows: 4, minWords: 15,
        },
        {
          kind: "longtext", id: "version2Reflection",
          label: "Version 2 — What changed after adding 5 words?",
          description:
            "Which of the 5 words had the most visual impact? Did the AI interpret those words as you expected?",
          rows: 4, minWords: 15,
        },
        {
          kind: "longtext", id: "ctSkill1Reflection",
          label: "CT Skill 1 — Which assumption from Field 2 proved wrong?",
          description:
            "Name one word or phrase in your prompt that Canva AI interpreted differently from what you intended — and what you thought it would produce instead.",
          weakEx:   "It got everything right.",
          strongEx: "I wrote 'floating city' expecting buildings suspended in the sky — but the AI placed the city on a lake. My assumption was that 'floating' would default to airborne, but the AI defaulted to water.",
          rows: 4, minWords: 20,
        },
      ],
    },
  ],
};

// ─── OBJ 4 — Style Switcher: One Subject, Three Worlds ─────────────────────
// Verbatim copy from OBJ4_Doc2_StudentWorksheet.docx.
// Fields read by /api/aida/validate/obj4:
//   intent, assumptions, audience, success,
//   subject, subjectWhy, style3, style3Why,
//   prompt1, prompt2, prompt3,
//   style1Observation, style1Interpretation,
//   style2Observation, style2Interpretation,
//   style3Observation, style3Interpretation,
//   mostSurprisingStyle, realCharacterArt, personalityDifferent.

export const OBJ4_SCHEMA: WorksheetSchema = {
  lmsId:    "l1-04",
  legacyId: "a1-4",
  title:    "Objective 4 — Style Switcher: One Subject, Three Worlds",
  intro:    "Document 2 of 2 — Choose subject + Style 3 deliberately. Write all three prompts BEFORE generating.",
  sections: [
    {
      id: "header",
      title: "Header",
      fields: [
        { kind: "text", id: "avatarName", label: "Avatar Name", placeholder: "Your Avatar Name (from OBJ 1)" },
      ],
    },

    {
      id: "howToUse",
      title: "📋  How to use this worksheet",
      body:
        "This worksheet guides you through creating your three-panel Style Switcher using Adobe Firefly. Complete Think It and Story It BEFORE you open Firefly. Students who plan all three prompts in advance produce more coherent comparisons — because the subject stays consistent and only the style changes.",
      bullets: [
        "Complete THINK IT first — all four Canvas fields.",
        "Choose your subject and Style 3 in Story It — deliberately, not randomly.",
        "Write all three prompts BEFORE generating any of them.",
        "Generate all three in Firefly. Drop each image in chat in order.",
        "Complete the CT Skill 2 analysis AFTER generating all three.",
        "Upload this worksheet AND all three images. Both uploads are required.",
      ],
      fields: [],
    },

    {
      id: "thinkIt",
      title: "💡  Think It",
      subtitle: "Answer all four fields before choosing your subject or opening Firefly.",
      body:
        "The AI Teacher reads these fields before your images are validated. Be specific about the comparative effect you are trying to create — not just that you are making three versions.",
      fields: [
        {
          kind: "longtext", id: "intent",
          label: "🎯  Field 1 — Intent",
          description:
            "When someone sees your three panels side by side, what do you want them to feel about how the same subject looks different in each world?",
          weakEx:   "To make three versions of an image.",
          strongEx: "To prove to myself — and anyone who sees the panels — that changing the style changes how the subject feels, even when nothing about the subject itself changed.",
          rows: 4, minWords: 12,
        },
        {
          kind: "longtext", id: "assumptions",
          label: "🔍  Field 2 — Assumptions",
          description:
            "What do you predict about how each of the three styles will change the feeling of your subject? Which style do you think will be most different from what you expect — and why?",
          weakEx:   "I assume they will look different.",
          strongEx: "I assume photorealistic will feel the most serious and anime will feel the most energetic. But I am not sure what my Style 3 choice will produce — that is what I am genuinely testing.",
          rows: 4, minWords: 15,
        },
        {
          kind: "longtext", id: "audience",
          label: "👥  Field 3 — Audience",
          description:
            "Who will see these three panels? What would make them feel that the same subject is a different character in each style — rather than just looking different?",
          weakEx:   "My friends.",
          strongEx: "My classmates who will see all three panels side by side — they should immediately feel that the subject has a different personality in each style, not just a different visual appearance.",
          rows: 4, minWords: 15,
        },
        {
          kind: "longtext", id: "success",
          label: "✅  Field 4 — Success Definition",
          description:
            "Name one specific reaction from one specific person that would tell you this comparison worked. Not 'if they all look good' — what do they say or do?",
          weakEx:   "If all three look good.",
          strongEx: "If someone sees all three panels and says the subject feels like a different character in each one — without me explaining anything.",
          rows: 4, minWords: 12,
        },
      ],
    },

    {
      id: "storyIt",
      title: "📖  Story It",
      subtitle: "Choose your subject and Style 3 deliberately. Write all three prompts BEFORE generating.",
      fields: [
        {
          kind: "text", id: "subject",
          label: "My Subject",
          description: "Any person, creature, object, or place. Must stay exactly the same across all three prompts.",
          placeholder: "e.g. a samurai standing in a bamboo forest",
        },
        {
          kind: "longtext", id: "subjectWhy",
          label: "Why this subject?",
          description: "Why will it look interesting across three very different styles?",
          rows: 3, minWords: 10,
        },
        {
          kind: "text", id: "style3",
          label: "My Style 3",
          description: "A named, distinct artistic style — NOT photorealistic or anime. e.g. watercolour, ukiyo-e, cyberpunk neon, claymation, pixel art.",
          placeholder: "e.g. ukiyo-e woodblock print",
        },
        {
          kind: "longtext", id: "style3Why",
          label: "Why this Style 3?",
          description: "What feeling do you expect it to create that photorealistic and anime do not?",
          rows: 3, minWords: 12,
        },
        {
          kind: "longtext", id: "prompt1",
          label: "Prompt 1 — PHOTOREALISTIC",
          description:
            "Include your subject AND style-reinforcing descriptors. Don't just write '[subject], photorealistic' — add visual words like 'natural lighting, hyperdetailed, cinematic composition'.",
          strongEx: "A samurai standing in a bamboo forest, photorealistic, natural morning light, hyperdetailed armour, cinematic composition.",
          rows: 3, minWords: 12,
        },
        {
          kind: "longtext", id: "prompt2",
          label: "Prompt 2 — ANIME",
          description:
            "Include your subject AND anime-reinforcing descriptors. e.g. 'expressive eyes, dynamic pose, vibrant colour palette'.",
          strongEx: "A samurai standing in a bamboo forest, anime art style, expressive eyes, dynamic pose, vibrant colour palette, dramatic light.",
          rows: 3, minWords: 12,
        },
        {
          kind: "longtext", id: "prompt3",
          label: "Prompt 3 — YOUR STYLE CHOICE",
          description:
            "Include your subject AND descriptors that reinforce your chosen Style 3. The style word alone isn't enough.",
          strongEx: "A samurai standing in a bamboo forest, ukiyo-e woodblock print style, flat perspective, bold outlines, limited colour palette, traditional Japanese art.",
          rows: 3, minWords: 12,
        },
      ],
    },

    {
      id: "ctSkill2",
      title: "🧠  CT Skill 2 Analysis — Observation vs Interpretation",
      subtitle: "Complete AFTER generating all three images.",
      body:
        "OBSERVATION = what literally changed visually. Facts only. Describe what you see — not what it means. INTERPRETATION = what you conclude about how Firefly reads style words, based on what you observed.",
      fields: [
        {
          kind: "longtext", id: "style1Observation",
          label: "Style 1 (Photorealistic) — OBSERVATION",
          description: "What is literally different visually? Colour, line style, texture, light, proportion — facts only.",
          rows: 3, minWords: 12,
        },
        {
          kind: "longtext", id: "style1Interpretation",
          label: "Style 1 (Photorealistic) — INTERPRETATION",
          description: "What did Firefly prioritise in this style? Did it interpret the word as you expected?",
          rows: 3, minWords: 12,
        },
        {
          kind: "longtext", id: "style2Observation",
          label: "Style 2 (Anime) — OBSERVATION",
          description: "What is literally different visually? Facts only.",
          rows: 3, minWords: 12,
        },
        {
          kind: "longtext", id: "style2Interpretation",
          label: "Style 2 (Anime) — INTERPRETATION",
          description: "What did Firefly prioritise in this style?",
          rows: 3, minWords: 12,
        },
        {
          kind: "longtext", id: "style3Observation",
          label: "Style 3 (Your choice) — OBSERVATION",
          description: "What is literally different visually? Facts only.",
          rows: 3, minWords: 12,
        },
        {
          kind: "longtext", id: "style3Interpretation",
          label: "Style 3 (Your choice) — INTERPRETATION",
          description: "What did Firefly prioritise in this style?",
          rows: 3, minWords: 12,
        },
      ],
    },

    {
      id: "overall",
      title: "🔍  Overall Comparison",
      subtitle: "After completing all three analyses.",
      fields: [
        {
          kind: "longtext", id: "mostSurprisingStyle",
          label: "1. Which style was most different from what you predicted?",
          description: "What did you predict that proved wrong?",
          rows: 3, minWords: 15,
        },
        {
          kind: "longtext", id: "realCharacterArt",
          label: "2. If a person saw all three with no labels — which is 'real', which 'a character', which 'art'?",
          rows: 3, minWords: 12,
        },
        {
          kind: "longtext", id: "personalityDifferent",
          label: "3. Does the subject feel like a different personality in each style — or just a different visual version of the same character?",
          rows: 3, minWords: 15,
        },
      ],
    },
  ],
};

// ─── OBJ 7 — Your Film Poster: Coming Soon ─────────────────────────────────
export const OBJ7_SCHEMA: WorksheetSchema = {
  lmsId: "l1-07", legacyId: "a1-7",
  title: "Objective 7 — Your Film Poster: Coming Soon",
  intro: "Document 2 of 2 — One sentence + one tone word + one atmosphere word = your Firefly prompt.",
  sections: [
    {
      id: "header", title: "Header",
      fields: [{ kind: "text", id: "avatarName", label: "Avatar Name", placeholder: "Your Avatar Name (from OBJ 1)" }],
    },
    {
      id: "howToUse", title: "📋  How to use this worksheet",
      body: "Complete Think It before writing your topic sentence. Story It before opening Firefly. Reflection after generating. Order matters.",
      bullets: [
        "Think It first — all four Canvas fields.",
        "Story It — topic sentence, tone word, atmosphere word.",
        "Build your full Firefly prompt from all three elements.",
        "Generate in Firefly, add Avatar Name as Director credit, drop poster in chat.",
        "Complete Observation + Interpretation reflection.",
      ],
      fields: [],
    },
    {
      id: "thinkIt", title: "💡  Think It",
      subtitle: "Complete all four before writing your topic sentence.",
      fields: [
        { kind: "longtext", id: "intent", label: "🎯  Intent",
          description: "A stranger looks at your poster for 3 seconds. What should they be able to say about your film world?",
          weakEx: "To make a cool poster.",
          strongEx: "A stranger should see the poster and immediately know it's a sci-fi mystery — even before reading the tagline.",
          rows: 4, minWords: 10 },
        { kind: "longtext", id: "assumptions", label: "🔍  Assumptions",
          description: "What are you betting on about how Firefly will interpret your sentence? Name your biggest uncertainty.",
          weakEx: "I assume it'll understand what I mean.",
          strongEx: "I'm betting Firefly reads 'neon-lit' as cyberpunk colour palette. It might read it as decoration on top of a daytime scene.",
          rows: 4, minWords: 12 },
        { kind: "longtext", id: "audience", label: "👥  Audience",
          description: "Name a specific person or group. What would they say if the poster successfully communicated your film world?",
          weakEx: "My friends.",
          strongEx: "My classmate Ravi who watches a lot of sci-fi — he'll tell me immediately if the poster reads as sci-fi or as something else.",
          rows: 4, minWords: 12 },
        { kind: "longtext", id: "success", label: "✅  Success Definition",
          description: "What can a stranger SAY about your film's genre, mood, or world — without explanation? Observable.",
          weakEx: "If it looks good.",
          strongEx: "If a stranger glances at the poster and says 'looks like a thriller set in a city at night' — that means the tone word and atmosphere word landed.",
          rows: 4, minWords: 12 },
      ],
    },
    {
      id: "storyIt", title: "📖  Story It — Build your Firefly prompt",
      subtitle: "Three elements. Topic sentence + tone word + atmosphere word.",
      fields: [
        { kind: "longtext", id: "topicSentence", label: "🌍  Topic Sentence — describe the WORLD of your film",
          description: "Not a character name or genre title. A WORLD. e.g. 'A city where human memories can be extracted and sold as entertainment.'",
          rows: 3, minWords: 10 },
        { kind: "text", id: "toneWord", label: "🎨  Tone Word",
          description: "ONE word — emotional mood. e.g. haunting, triumphant, melancholic, urgent, dreamlike, ominous.",
          placeholder: "e.g. haunting" },
        { kind: "text", id: "atmosphereWord", label: "🌅  Visual Atmosphere Word",
          description: "ONE word — how the poster should look. e.g. golden hour, stormy, neon-lit, misty, noir.",
          placeholder: "e.g. neon-lit" },
        { kind: "longtext", id: "fireflyPrompt", label: "Your Firefly Prompt",
          description: "Combine all three elements. e.g. '[topic sentence], [tone word], [atmosphere word], cinematic movie poster'.",
          rows: 3, minWords: 12 },
      ],
    },
    {
      id: "reflection", title: "🪞  Reflection — CT Skill 2: Observation vs Interpretation",
      subtitle: "After generating your poster.",
      fields: [
        { kind: "longtext", id: "observation", label: "👁  Observation",
          description: "What do you LITERALLY see? Colours, objects, lighting, composition. Facts only — no interpretation.",
          rows: 4, minWords: 15 },
        { kind: "longtext", id: "interpretation", label: "💭  Interpretation",
          description: "What does your poster COMMUNICATE? What feeling or story does it suggest based on what you observed?",
          rows: 4, minWords: 15 },
        { kind: "longtext", id: "didItWork", label: "🎯  Did it work?",
          description: "Compare your Interpretation to your Intent. Does it match? If not — which specific word in your prompt would you change, and what visual change do you expect?",
          rows: 4, minWords: 15 },
      ],
    },
  ],
};

// ─── OBJ 9 — The Negative Prompt Lab: Editing Reality ─────────────────────
export const OBJ9_SCHEMA: WorksheetSchema = {
  lmsId: "l1-09", legacyId: "a1-9",
  title: "Objective 9 — The Negative Prompt Lab: Editing Reality",
  intro: "Document 2 of 2 — Same base prompt across 3 versions. Only the negative prompts change.",
  sections: [
    { id: "header", title: "Header", fields: [{ kind: "text", id: "avatarName", label: "Avatar Name", placeholder: "Your Avatar Name" }] },
    {
      id: "howToUse", title: "📋  How this works",
      body: "V1 is your base image — no negative prompts. Audit what appeared that you did not ask for. V2 adds first negatives. V3 extends V2. Same base prompt throughout.",
      bullets: [
        "Think It Canvas first.",
        "Write your base prompt — keep it focused.",
        "Generate V1 → audit ≥5 uninvited elements.",
        "Choose negatives for V2 from your audit list.",
        "Extend negatives for V3.",
        "Drop V1, V2, V3 in chat in order.",
        "Complete Impact Analysis + CT Skill 1 reflection.",
      ],
      fields: [],
    },
    {
      id: "thinkIt", title: "💡  Think It",
      subtitle: "Complete all four before generating Version 1.",
      fields: [
        { kind: "longtext", id: "intent", label: "🎯  Intent", description: "What specific Firefly assumption are you investigating?", weakEx: "To see what negative prompts do.", strongEx: "To reveal what Firefly assumes belongs in an image when I don't specify it — and test whether I can predict those assumptions.", rows: 4, minWords: 12 },
        { kind: "longtext", id: "assumptions", label: "🔍  Assumptions", description: "Name 3 specific elements you predict Firefly will add that your prompt does NOT mention.", weakEx: "I assume things will appear.", strongEx: "I predict Firefly will add a blue sky, shadows beneath the subject, and a horizon line — even though I didn't mention any.", rows: 4, minWords: 15 },
        { kind: "longtext", id: "audience", label: "👥  Audience", description: "Someone who has never seen your prompt — they should describe what changed V1→V3 without you explaining.", weakEx: "My friends.", strongEx: "A classmate who has never seen my prompt — they should describe what changed between Version 1 and Version 3 without me explaining.", rows: 4, minWords: 12 },
        { kind: "longtext", id: "success", label: "✅  Success Definition", description: "What specific discovery about Firefly's assumptions would be a meaningful finding?", weakEx: "If the images look different.", strongEx: "If I can name ONE specific Firefly assumption AND trace why it appeared based on a training-data pattern.", rows: 4, minWords: 15 },
      ],
    },
    {
      id: "storyIt", title: "📖  Story It — Base prompt + element audit",
      fields: [
        { kind: "longtext", id: "basePrompt", label: "✍️  Base Prompt (same for all 3 versions)", description: "Describe a scene/object/subject. Keep it focused — see what Firefly adds.", rows: 3, minWords: 8 },
        { kind: "text", id: "auditItem1", label: "Uninvited element 1", description: "Be specific: 'blue sky with scattered clouds', not 'background'.", placeholder: "e.g. blue sky with scattered clouds" },
        { kind: "text", id: "auditItem2", label: "Uninvited element 2", placeholder: "e.g. shadow beneath subject" },
        { kind: "text", id: "auditItem3", label: "Uninvited element 3", placeholder: "e.g. depth-of-field blur" },
        { kind: "text", id: "auditItem4", label: "Uninvited element 4", placeholder: "e.g. golden-hour lighting" },
        { kind: "text", id: "auditItem5", label: "Uninvited element 5", placeholder: "e.g. distant mountains" },
        { kind: "text", id: "auditItem6", label: "Uninvited element 6 (optional)", placeholder: "optional" },
        { kind: "text", id: "auditItem7", label: "Uninvited element 7 (optional)", placeholder: "optional" },
        { kind: "longtext", id: "predictionVsActual", label: "Predictions vs actual", description: "Which Think-It predictions were correct? Which were wrong? What surprised you?", rows: 3, minWords: 15 },
        { kind: "longtext", id: "v2NegativePrompt", label: "Version 2 negative prompt", description: "Choose 2-4 most prominent uninvited elements. e.g. 'no sky, no people, no shadows'.", rows: 2, minWords: 4 },
        { kind: "longtext", id: "v3NegativePrompt", label: "Version 3 negative prompt (extends V2)", description: "Include EVERYTHING from V2 + 2-3 more excluded elements.", rows: 2, minWords: 6 },
      ],
    },
    {
      id: "impact", title: "🔬  Impact Analysis + CT Skill 1",
      fields: [
        { kind: "longtext", id: "mostImpactfulExclusion", label: "💥  Most impactful excluded word + why Firefly included it", description: "Identify the single negative prompt word whose removal created the biggest change. Why did Firefly assume that element belonged?", rows: 4, minWords: 20 },
        { kind: "longtext", id: "ctSkill1Assumption", label: "🔍  CT Skill 1 — What did Firefly assume + where did the assumption come from?", description: "What assumption did Firefly make? What in your base prompt might have implied it (or what training-data pattern?).", rows: 4, minWords: 20 },
        { kind: "longtext", id: "v4Revision", label: "💡  V4 Revised Base Prompt (optional — counts for Distinction)", description: "How would you rewrite the base prompt to signal more clearly what you do and do not want — BEFORE adding negative prompts?", rows: 3, minWords: 10 },
      ],
    },
  ],
};

// ─── OBJ 1 — Netflix Documentary Intro + Avatar Name ──────────────────────
export const OBJ1_SCHEMA: WorksheetSchema = {
  lmsId: "l1-01", legacyId: "a1-1",
  title: "Objective 1 — Netflix Documentary Intro + Avatar Name",
  intro: "Document 2 of 2 — Plan the four self-questions. Then ChatGPT writes your Netflix intro.",
  sections: [
    { id: "header", title: "Header", fields: [{ kind: "text", id: "avatarName", label: "Avatar Name", placeholder: "Your Avatar Name (chosen below)" }] },
    {
      id: "howToUse", title: "📋  How to use this worksheet",
      body: "Complete Think It first. Then Story It (four answers about yourself). Then build your ChatGPT prompt and generate. Paste the final intro into the worksheet. Choose your Avatar Name.",
      bullets: [
        "Think It — four Canvas fields.",
        "Story It — four self-questions, each at least 2-3 sentences.",
        "Open ChatGPT, paste your prompt + four answers, generate.",
        "Paste the final intro into the 'Final Intro' field below.",
        "Choose your Avatar Name + reason.",
        "Reflection — assumptions + observation/interpretation.",
      ],
      fields: [],
    },
    {
      id: "thinkIt", title: "💡  Think It",
      subtitle: "All four before opening ChatGPT.",
      fields: [
        { kind: "longtext", id: "intent", label: "🎯  Intent", description: "Reaction in the room when it's read aloud. What impression do you want to make?", weakEx: "To write a good intro.", strongEx: "To make my classmates feel like they are about to watch a documentary about someone genuinely interesting — not just a student answering questions.", rows: 4, minWords: 12 },
        { kind: "longtext", id: "assumptions", label: "🔍  Assumptions", description: "What might ChatGPT get wrong? Name at least two assumptions.", weakEx: "I assume ChatGPT will make it sound cool.", strongEx: "I assume more specific answers will produce a more personal intro — but ChatGPT might still make it generic. I also assume 'Netflix style' means the same thing to ChatGPT as it does to me.", rows: 4, minWords: 15 },
        { kind: "longtext", id: "audience", label: "👥  Audience", description: "Specific people in the room who'll hear this read aloud.", weakEx: "My class.", strongEx: "The 15-20 people in this room, including my trainer, who'll hear this read aloud and form their first impression of who I am.", rows: 4, minWords: 12 },
        { kind: "longtext", id: "success", label: "✅  Success Definition", description: "Observable reaction from one specific person — not 'if it sounds nice'.", weakEx: "If it sounds nice.", strongEx: "If at least one person in the room reacts after it is read — even a sound or a comment — rather than silence.", rows: 4, minWords: 12 },
      ],
    },
    {
      id: "storyIt", title: "📖  Story It — Four self-questions",
      subtitle: "Each answer at least 2-3 sentences. Shallow answers = generic intro.",
      fields: [
        { kind: "longtext", id: "q1WhoAreYou", label: "Q1 — Who are you?", description: "Not your name — what you're like as a person. How would someone who knows you describe you to a stranger?", rows: 4, minWords: 20 },
        { kind: "longtext", id: "q2WhatYouCare", label: "Q2 — What do you care about?", description: "What genuinely keeps you thinking? What problems/topics do you return to without being asked?", rows: 4, minWords: 20 },
        { kind: "longtext", id: "q3WhatDrives", label: "Q3 — What drives you?", description: "What pushes you forward? What do you want to get better at or achieve?", rows: 4, minWords: 20 },
        { kind: "longtext", id: "q4WhereGoing", label: "Q4 — Where are you going?", description: "5 years out. What kind of person do you want to become? What are you building — even now?", rows: 4, minWords: 20 },
      ],
    },
    {
      id: "createIt", title: "🛠  Create It — Final Intro + Avatar Name",
      fields: [
        { kind: "longtext", id: "finalIntro", label: "Final Netflix Intro (paste from ChatGPT)", description: "Exactly 2 sentences in the voice of a Netflix narrator. Paste the output you generated.", rows: 4, minWords: 15 },
        { kind: "text", id: "avatarName", label: "Avatar Name", description: "More than just your first name. Add a creative modifier — word, number, suffix. Identity for 6 levels.", placeholder: "e.g. Maya Decoder" },
        { kind: "longtext", id: "avatarNameReason", label: "Why this Avatar Name?", description: "What does it represent about who you want to be as an AI creator?", rows: 3, minWords: 12 },
      ],
    },
    {
      id: "reflection", title: "💡  Reflection — After generating",
      fields: [
        { kind: "longtext", id: "correctAssumption", label: "✅  Which Field-2 assumption was CORRECT?", description: "What did ChatGPT do exactly as you predicted?", rows: 3, minWords: 12 },
        { kind: "longtext", id: "wrongAssumption", label: "❌  Which assumption was WRONG / surprising?", description: "What did ChatGPT do that surprised you — good or bad?", rows: 3, minWords: 12 },
        { kind: "longtext", id: "observation", label: "🧠  Observation (literal)", description: "What does the intro LITERALLY say? Facts only.", rows: 3, minWords: 12 },
        { kind: "longtext", id: "interpretation", label: "🧠  Interpretation (implied)", description: "What does it communicate about you that you did not explicitly plan?", rows: 3, minWords: 12 },
      ],
    },
  ],
};

// ─── OBJ 2 — Three AI Brains, One Question ─────────────────────────────────
export const OBJ2_SCHEMA: WorksheetSchema = {
  lmsId: "l1-02", legacyId: "a1-2",
  title: "Objective 2 — Three AI Brains, One Question",
  intro: "Document 2 of 2 — One genuine question, asked to ChatGPT, Gemini, and Claude. Same wording. Then observe vs interpret.",
  sections: [
    { id: "header", title: "Header",
      fields: [{ kind: "text", id: "avatarName", label: "Avatar Name", placeholder: "Your Avatar Name (from OBJ 1)" }] },
    {
      id: "howToUse", title: "📋  How to use this worksheet",
      body: "Think It first. Then choose your question deliberately — open, personal, reasoning-required. Then ask all 3 AIs the SAME question. Screenshot each response. Drop them in chat in order: ChatGPT, Gemini, Claude.",
      bullets: [
        "Think It — four Canvas fields BEFORE you write your question.",
        "Story It — choose ONE question that is open-ended, personal, and requires reasoning.",
        "Ask ChatGPT, Gemini, Claude — paste the exact same question into each.",
        "Screenshot each response. Drop them in chat: ChatGPT first, Gemini second, Claude third.",
        "Complete observation + interpretation for each AI.",
        "Complete comparison synthesis — agreement, divergence, which AI for this question type.",
      ],
      fields: [],
    },
    {
      id: "thinkIt", title: "💡  Think It",
      subtitle: "Complete all four before writing your question.",
      fields: [
        { kind: "longtext", id: "intent", label: "🎯  Intent",
          description: "What do you want to LEARN from comparing 3 AIs on the same question? Not 'to see what they say' — what specific thing about them are you testing?",
          weakEx: "To see what they say.",
          strongEx: "To test whether the three AIs genuinely disagree on a question that requires real reasoning — not just produce three versions of the same answer.",
          rows: 4, minWords: 12 },
        { kind: "longtext", id: "assumptions", label: "🔍  Assumptions",
          description: "Predict how each AI will respond differently. What do you THINK each one will do?",
          weakEx: "They'll all be different.",
          strongEx: "I assume ChatGPT will give the longest, most structured answer. I'm not sure what Gemini or Claude will do differently — that's what I'm testing.",
          rows: 4, minWords: 15 },
        { kind: "longtext", id: "audience", label: "👥  Audience",
          description: "Who's reading this comparison? What would convince them the test worked?",
          weakEx: "Everyone.",
          strongEx: "Me. I need to be able to spot a real difference in how each AI reasons, not just style.",
          rows: 4, minWords: 10 },
        { kind: "longtext", id: "success", label: "✅  Success Definition",
          description: "What concrete difference would prove the test worked?",
          weakEx: "If they're different.",
          strongEx: "If I can point to ONE concrete thing each AI did that the other two did NOT — beyond formatting or tone.",
          rows: 4, minWords: 10 },
      ],
    },
    {
      id: "storyIt", title: "📖  Story It — Choose your question deliberately",
      subtitle: "ONE question. Open-ended. Personal. Reasoning-required.",
      fields: [
        { kind: "longtext", id: "question", label: "Your question (asked verbatim to all 3 AIs)",
          description: "Must be OPEN-ENDED (no single fact answer), PERSONAL (you actually want to know), and REASONING-REQUIRED (Why / How / What if). 'When was the internet invented' fails. 'Why do people believe things that confirm what they already think' passes.",
          rows: 3, minWords: 8 },
        { kind: "yesno", id: "isOpenEnded",     label: "Is it open-ended (no single-fact answer)?" },
        { kind: "yesno", id: "isPersonal",      label: "Is it personal (you actually want to know)?" },
        { kind: "yesno", id: "requiresReasoning",label: "Does it require reasoning (Why / How / What if)?" },
      ],
    },
    {
      id: "createIt", title: "🔬  Create It — Three responses, observed and interpreted",
      subtitle: "Complete after dropping all 3 screenshots in chat.",
      body: "OBSERVATION = what the AI literally said. Facts only. INTERPRETATION = what you conclude about HOW that AI reasoned, based on what you observed.",
      fields: [
        { kind: "longtext", id: "chatGptObservation",    label: "ChatGPT — OBSERVATION", description: "What did it literally say? Facts only.", rows: 3, minWords: 15 },
        { kind: "longtext", id: "chatGptInterpretation", label: "ChatGPT — INTERPRETATION", description: "What does this tell you about how ChatGPT reasoned?", rows: 3, minWords: 12 },
        { kind: "longtext", id: "geminiObservation",     label: "Gemini — OBSERVATION", description: "What did it literally say? Facts only.", rows: 3, minWords: 15 },
        { kind: "longtext", id: "geminiInterpretation",  label: "Gemini — INTERPRETATION", description: "What does this tell you about how Gemini reasoned?", rows: 3, minWords: 12 },
        { kind: "longtext", id: "claudeObservation",     label: "Claude — OBSERVATION", description: "What did it literally say? Facts only.", rows: 3, minWords: 15 },
        { kind: "longtext", id: "claudeInterpretation",  label: "Claude — INTERPRETATION", description: "What does this tell you about how Claude reasoned?", rows: 3, minWords: 12 },
      ],
    },
    {
      id: "synthesis", title: "🧠  Comparison Synthesis",
      fields: [
        { kind: "longtext", id: "agreement", label: "Where did all 3 agree?", description: "One specific point all three made — even if worded differently.", rows: 3, minWords: 12 },
        { kind: "longtext", id: "surprisingDifference", label: "Most surprising divergence", description: "What did one AI do that the other two did NOT — beyond style?", rows: 3, minWords: 15 },
        { kind: "longtext", id: "whichAiForType", label: "Which AI would you use for THIS type of question + why?",
          description: "Name one. Be specific about the reasoning style that fits the question type.", rows: 3, minWords: 15 },
        { kind: "longtext", id: "correctAssumption", label: "Which Field-2 assumption was CORRECT?", rows: 3, minWords: 10 },
        { kind: "longtext", id: "wrongAssumption",   label: "Which assumption was WRONG / surprising?", rows: 3, minWords: 10 },
      ],
    },
  ],
};

// ─── OBJ 5 — AI Writes and Sings Your Theme Song ──────────────────────────────

export const OBJ5_SCHEMA: WorksheetSchema = {
  lmsId: "l1-05", legacyId: "a1-5",
  title: "Objective 5 — AI Writes and Sings Your Theme Song",
  intro: "Document 2 of 2 — Describe yourself in 5 personality words. Build a Suno.ai style brief. Generate your personal Level 1 Theme Song.",
  sections: [
    { id: "header", title: "Header",
      fields: [
        { kind: "text", id: "avatarName", label: "Avatar Name", placeholder: "Your Avatar Name (from OBJ 1)" },
      ] },
    {
      id: "howToUse", title: "📋  How to use this worksheet",
      body: "Your theme song plays under your OBJ 6 avatar reveal in class. This is not just an exercise — this track represents you.",
      bullets: [
        "Complete THINK IT first — all four Canvas fields.",
        "Write 5 personality words — no genres or instrument names.",
        "Build your complete Suno.ai style brief: genre + energy + mood + instrument.",
        "Open Suno.ai, paste your brief, and generate your theme song.",
        "Adjust ONE element if needed and regenerate.",
        "Drop the final MP3 in chat. Complete the reflection.",
      ],
      fields: [],
    },
    {
      id: "thinkIt", title: "💡  Think It",
      subtitle: "Complete all four before choosing your words or opening Suno.ai.",
      fields: [
        {
          kind: "longtext", id: "intent", label: "🎯  Intent",
          description: "What should listeners FEEL in the first 5 seconds of your theme song? You are engineering a specific emotional reaction.",
          weakEx: "To make a song.",
          strongEx: "To create a track that sounds so much like me that anyone who knows me immediately says — that is exactly your vibe — before I tell them it is mine.",
          rows: 4, minWords: 10,
        },
        {
          kind: "longtext", id: "assumptions", label: "🔍  Assumptions",
          description: "What are you betting on about how Suno.ai will interpret your words? What might it get wrong?",
          weakEx: "It'll sound good.",
          strongEx: "I assume 5 personality words will be enough — but Suno.ai might need genre and mood words too, or interpret 'fierce' as aggressive rather than confident.",
          rows: 4, minWords: 12,
        },
        {
          kind: "longtext", id: "audience", label: "👥  Audience",
          description: "Who hears this first — and what music do they normally listen to? Name a specific person or group.",
          weakEx: "My friends.",
          strongEx: "My classmates who mostly listen to hip-hop and Afrobeats — they will know immediately whether this track feels authentic or like generic AI music.",
          rows: 4, minWords: 10,
        },
        {
          kind: "longtext", id: "success", label: "✅  Success Definition",
          description: "What does one specific person SAY or DO if this track captures who you are? Be specific.",
          weakEx: "If it sounds nice.",
          strongEx: "If my best friend hears it without knowing I made it and says — this sounds like something you would listen to.",
          rows: 4, minWords: 10,
        },
      ],
    },
    {
      id: "storyIt", title: "📖  Story It — 5 Words + Your Suno Style Brief",
      subtitle: "No genres or instrument names in your 5 words. Save those for the style brief.",
      fields: [
        { kind: "text", id: "word1", label: "Personality Word 1", placeholder: "e.g. curious" },
        { kind: "text", id: "word2", label: "Personality Word 2", placeholder: "e.g. chaotic" },
        { kind: "text", id: "word3", label: "Personality Word 3", placeholder: "e.g. dreamer" },
        { kind: "text", id: "word4", label: "Personality Word 4", placeholder: "e.g. intense" },
        { kind: "text", id: "word5", label: "Personality Word 5", placeholder: "e.g. warm" },
        {
          kind: "longtext", id: "styleBrief", label: "Suno.ai Style Brief (genre + energy + mood + instrument)",
          description: "Write a complete brief. Include: GENRE (e.g. hip-hop, Afrobeats, lo-fi), ENERGY level (high/medium/low), MOOD (confident, melancholic, triumphant), and at least one specific INSTRUMENT or sound (808 bass, piano, acoustic guitar, synth pad).",
          rows: 4, minWords: 15,
        },
        {
          kind: "longtext", id: "obj6Energy", label: "OBJ 6 Connection — energy for avatar reveal",
          description: "Your avatar reveal in OBJ 6 will use this track. What ENERGY should the audience feel during that reveal? Triumphant? Mysterious? Warm?",
          rows: 2, minWords: 8,
        },
        {
          kind: "longtext", id: "iterationElement", label: "Iteration Plan — what element would you change if you regenerated?",
          description: "If the track doesn't feel exactly right, what ONE element would you adjust? Genre? Tempo? Instrument?",
          rows: 2, minWords: 8,
        },
      ],
    },
    {
      id: "reflection", title: "💡  Reflection — After generating your theme song",
      fields: [
        { kind: "longtext", id: "correctAssumption", label: "Which Field-2 assumption was CORRECT?", rows: 3, minWords: 10 },
        { kind: "longtext", id: "mostImpactfulElement", label: "Which element of your style brief had the most impact on the track's character?", description: "Name something specific.", rows: 3, minWords: 10 },
      ],
    },
  ],
};

// ─── OBJ 8 — AI Speaks Your Words: Voice Direction Lab ───────────────────────

export const OBJ8_SCHEMA: WorksheetSchema = {
  lmsId: "l1-08", legacyId: "a1-8",
  title: "Objective 8 — AI Speaks Your Words: Voice Direction Lab",
  intro: "Document 2 of 2 — Write 3 sentences. Pick 3 ElevenLabs voices BY NAME ONLY. Generate. Listen BLIND. Then reveal the names.",
  sections: [
    { id: "header", title: "Header",
      fields: [
        { kind: "text", id: "avatarName", label: "Avatar Name", placeholder: "Your Avatar Name (from OBJ 1)" },
      ] },
    {
      id: "howToUse", title: "📋  How to use this worksheet",
      body: "This is a blind listening experiment. The entire lesson depends on you NOT previewing the voices before your blind evaluation.",
      bullets: [
        "Complete THINK IT first — all four Canvas fields.",
        "Write 3 emotionally clear sentences about something you care about.",
        "Choose 3 ElevenLabs voices BY NAME ONLY — do NOT preview them.",
        "Generate your 3 sentences in each voice. Label the files Voice A, B, C (NOT the voice names).",
        "Listen BLIND — complete the blind evaluation BEFORE revealing the voice names.",
        "Then reveal the names and complete the reflection.",
        "Drop all 3 audio files in chat as Voice A, B, C.",
      ],
      fields: [],
    },
    {
      id: "thinkIt", title: "💡  Think It",
      subtitle: "Complete all four before writing your sentences or opening ElevenLabs.",
      fields: [
        {
          kind: "longtext", id: "intent", label: "🎯  Intent",
          description: "What analytical question does this blind evaluation answer? What are you trying to discover about your own listening?",
          weakEx: "To hear AI voices.",
          strongEx: "To test whether I can distinguish a voice's actual personality from just its surface qualities — by listening before I see the voice name.",
          rows: 4, minWords: 10,
        },
        {
          kind: "longtext", id: "assumptions", label: "🔍  Assumptions",
          description: "What are you betting about your ability to identify voice personality by ear? What assumptions do you bring?",
          weakEx: "I'll get it right.",
          strongEx: "I assume I'll be able to spot a 'warm' voice immediately — but I'm betting I'll confuse 'calm' with 'distant' until I hear all three back-to-back.",
          rows: 4, minWords: 12,
        },
        {
          kind: "longtext", id: "audience", label: "👥  Audience",
          description: "Whose listening perspective are you borrowing for this evaluation? Who cares about voice personality?",
          weakEx: "Everyone.",
          strongEx: "A podcast editor — someone who picks voices for tone, not just clarity.",
          rows: 4, minWords: 10,
        },
        {
          kind: "longtext", id: "success", label: "✅  Success Definition",
          description: "What does accurate auditory observation look like? How will you know you listened well?",
          weakEx: "If I get it right.",
          strongEx: "If my observations describe specific pace/tone/warmth (facts) rather than personality conclusions — that means I actually listened analytically.",
          rows: 4, minWords: 10,
        },
      ],
    },
    {
      id: "storyIt", title: "📖  Story It — 3 Sentences + 3 Voices",
      subtitle: "Choose voices BY NAME ONLY — no previewing.",
      fields: [
        {
          kind: "longtext", id: "topic", label: "Your chosen topic",
          description: "What is your 3-sentence script about? Something you genuinely care about — each sentence should be emotionally clear on its own.",
          rows: 2, minWords: 5,
        },
        { kind: "longtext", id: "sentence1", label: "Sentence 1", description: "Complete sentence. Emotionally clear.", rows: 2, minWords: 5 },
        { kind: "longtext", id: "sentence2", label: "Sentence 2", description: "Complete sentence. Emotionally clear.", rows: 2, minWords: 5 },
        { kind: "longtext", id: "sentence3", label: "Sentence 3", description: "Complete sentence. Emotionally clear.", rows: 2, minWords: 5 },
        { kind: "text", id: "voice1Name", label: "Voice 1 — ElevenLabs voice name (no preview!)", placeholder: "e.g. Rachel" },
        { kind: "text", id: "voice2Name", label: "Voice 2 — ElevenLabs voice name (no preview!)", placeholder: "e.g. Adam" },
        { kind: "text", id: "voice3Name", label: "Voice 3 — ElevenLabs voice name (no preview!)", placeholder: "e.g. Bella" },
      ],
    },
    {
      id: "blindEval", title: "🔇  Blind Evaluation — Complete BEFORE revealing voice names",
      subtitle: "Listen to each file without knowing which voice is which. OBSERVATION = what you literally hear (pace, tone, warmth). INTERPRETATION = what personality you infer.",
      body: "Label your files Voice A, B, C before listening. Do NOT check the voice names until all three evaluations are complete.",
      fields: [
        { kind: "longtext", id: "voiceAObservation", label: "Voice A — OBSERVATION", description: "Literal auditory facts. Pace? Tone? Warmth? Pitch?", rows: 3, minWords: 10 },
        { kind: "longtext", id: "voiceAInterpretation", label: "Voice A — INTERPRETATION", description: "What personality does this voice communicate?", rows: 3, minWords: 8 },
        { kind: "longtext", id: "voiceBObservation", label: "Voice B — OBSERVATION", description: "Literal auditory facts.", rows: 3, minWords: 10 },
        { kind: "longtext", id: "voiceBInterpretation", label: "Voice B — INTERPRETATION", description: "What personality does this voice communicate?", rows: 3, minWords: 8 },
        { kind: "longtext", id: "voiceCObservation", label: "Voice C — OBSERVATION", description: "Literal auditory facts.", rows: 3, minWords: 10 },
        { kind: "longtext", id: "voiceCInterpretation", label: "Voice C — INTERPRETATION", description: "What personality does this voice communicate?", rows: 3, minWords: 8 },
      ],
    },
    {
      id: "reflection", title: "💡  Reflection — After revealing the voice names",
      fields: [
        { kind: "text", id: "voiceAReveal", label: "Which ElevenLabs voice was Voice A?", placeholder: "e.g. Rachel" },
        { kind: "text", id: "voiceBReveal", label: "Which ElevenLabs voice was Voice B?", placeholder: "e.g. Adam" },
        { kind: "text", id: "voiceCReveal", label: "Which ElevenLabs voice was Voice C?", placeholder: "e.g. Bella" },
        { kind: "longtext", id: "whereWrong", label: "Where were you wrong?", description: "Which voice did you misread and what auditory cue misled you?", rows: 3, minWords: 10 },
        { kind: "longtext", id: "mostInterestingMismatch", label: "Most interesting mismatch", description: "What did a voice name imply that the actual voice did not match?", rows: 3, minWords: 10 },
      ],
    },
  ],
};

export function getWorksheetSchema(lmsIdOrLegacy: string): WorksheetSchema | null {
  const id = lmsIdOrLegacy.toLowerCase();
  if (id === "l1-10" || id === "a1-10") return OBJ10_SCHEMA;
  if (id === "l1-06" || id === "a1-6")  return OBJ6_SCHEMA;
  if (id === "l1-03" || id === "a1-3")  return OBJ3_SCHEMA;
  if (id === "l1-04" || id === "a1-4")  return OBJ4_SCHEMA;
  if (id === "l1-07" || id === "a1-7")  return OBJ7_SCHEMA;
  if (id === "l1-09" || id === "a1-9")  return OBJ9_SCHEMA;
  if (id === "l1-01" || id === "a1-1")  return OBJ1_SCHEMA;
  if (id === "l1-02" || id === "a1-2")  return OBJ2_SCHEMA;
  if (id === "l1-05" || id === "a1-5")  return OBJ5_SCHEMA;
  if (id === "l1-08" || id === "a1-8")  return OBJ8_SCHEMA;
  return null;
}

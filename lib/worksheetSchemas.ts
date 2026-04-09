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

export function getWorksheetSchema(lmsIdOrLegacy: string): WorksheetSchema | null {
  const id = lmsIdOrLegacy.toLowerCase();
  if (id === "l1-10" || id === "a1-10") return OBJ10_SCHEMA;
  if (id === "l1-06" || id === "a1-6")  return OBJ6_SCHEMA;
  return null;
}

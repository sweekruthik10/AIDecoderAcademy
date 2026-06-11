// Validator intro copy — fired once per session when the kid arrives at a
// staged objective. Voice = "Sage" — warm coach with weight. Punchy short
// beats, motivating, no emojis, no "wrong". Confident but human.
//
// The intro is now a SEQUENCE OF BEATS rather than one block of text. The
// panel reveals one beat at a time with a 600ms pause between beats so each
// line lands separately. This is the JRPG dialogue rhythm — short, paced,
// memorable. Designed for an 11–16 year old's 8-second relevance filter:
// beat 1 must hook in 5 words or fewer, beat 2 introduces a paradox or
// insight, beat 3 is the invitation (not an instruction).
//
// The structure also enables prompt-steerable TTS providers (OpenAI
// gpt-4o-mini-tts, Cartesia Sonic, Hume Octave) to deliver each beat with
// the right tone — see the `tone` field. Providers that don't support
// per-utterance steering will simply ignore it.

export interface ObjectiveIntroBeat {
  /** Spoken line. Keep under 12 words when possible. Ellipsis (…) creates a breath. */
  text: string;
  /**
   * Optional tone hint for steerable TTS providers. Plain English — not an
   * audio tag. Examples: "curious and warm", "softly amused", "dry, knowing".
   * Falls through unused for non-steerable providers.
   */
  tone?: string;
}

export interface ObjectiveIntro {
  /** Sequence of short beats spoken with brief pauses between each. */
  beats: ObjectiveIntroBeat[];
}

// Voice/rhythm notes for kid audiences (11–16, Gen Z + Alpha):
//   - 8-second hook: beat 1 names WHO + WHAT in under 8 words.
//   - No try-hard slang ("lit", "fire", etc) — that reads as cringe at this age.
//     Adults who quote Gen Z dictionaries are the joke, not the messenger.
//   - No exclamation marks unless natural. Calm beats loud.
//   - Direct, specific, no platitudes. They have heard "you can do it" too
//     many times for it to land.
//   - SAGE introduces themselves explicitly (kid wants to know who's talking).
//   - End with a concrete first action, not a vague encouragement.
const INTROS: Record<string, ObjectiveIntro> = {
  // OBJ 1 — Netflix Documentary Intro + Avatar Name (text, ChatGPT)
  "l1-01": {
    beats: [
      { text: "I'm Sage. I'll grade this one.",                                  tone: "calm hello, no theatre" },
      { text: "Objective 1. Four self-questions, then ChatGPT writes your Netflix intro.", tone: "matter-of-fact, naming the task" },
      { text: "Worksheet first. Answer the four with specific detail — vague answers get a vague intro.", tone: "dry, knowing" },
      { text: "Pick your Avatar Name. That's your identity for six levels.",     tone: "weight, no rush" },
      { text: "Drop the ChatGPT output and your Avatar Name in chat, then come back.", tone: "warm and brief" },
    ],
  },

  // OBJ 2 — Three AI Brains, One Question (text, ChatGPT + Gemini + Claude)
  "l1-02": {
    beats: [
      { text: "Sage. I'll grade this one.",                                      tone: "calm hello" },
      { text: "Objective 2. Same question. Three AI brains. Find the disagreement.", tone: "matter-of-fact" },
      { text: "Worksheet first. Write a question that REQUIRES reasoning — not just facts.", tone: "instructive" },
      { text: "Ask ChatGPT, Gemini, and Claude. Screenshot all three.",          tone: "practical, like a recipe" },
      { text: "Then separate what you OBSERVE from what you INTERPRET. That's the skill.", tone: "patient" },
    ],
  },

  // OBJ 3 — Your Impossible World (2 Canva AI images: V1 + V2 with 5 added words)
  "l1-03": {
    beats: [
      { text: "I'm Sage. I'll check this one.",                                  tone: "calm hello, no theatre" },
      { text: "Objective 3. Imagine something that cannot exist — then build it.", tone: "matter-of-fact, naming the task" },
      { text: "Worksheet first. Write Prompt 1, then pick five words to add for Prompt 2.", tone: "practical, like reading a recipe" },
      { text: "Generate both versions in Canva AI. Drop them in chat — Version 1 first, then Version 2.", tone: "even, presenting the order plainly" },
      { text: "Then come back and hit Validate. I'm here.",                      tone: "warm and brief, an open door" },
    ],
  },

  // OBJ 4 — Style Switcher: One Subject, Three Worlds (3 Firefly images)
  "l1-04": {
    beats: [
      { text: "Sage. I'll grade this.",                                          tone: "calm hello" },
      { text: "Objective 4. One subject. Three style universes.",                tone: "matter-of-fact" },
      { text: "Photorealistic, anime, and a third style YOU choose deliberately.", tone: "specific, naming the rules" },
      { text: "Worksheet first. Write all three Firefly prompts before generating.", tone: "instructive" },
      { text: "Drop the three images in chat in order. Then we compare.",        tone: "open door" },
    ],
  },

  // OBJ 5 — AI Writes and Sings Your Theme Song (Suno.ai audio)
  "l1-05": {
    beats: [
      { text: "I'm Sage. I'll check this one.",                                  tone: "calm hello" },
      { text: "Objective 5. Five words about who you are. Suno turns them into a song.", tone: "matter-of-fact, naming the task" },
      { text: "Worksheet first. The five words need to be specific — vague words make a vague track.", tone: "instructive" },
      { text: "Write your style brief: genre, energy, mood, instruments. Then generate in Suno.", tone: "practical" },
      { text: "Drop the MP3 in chat. This becomes your Avatar reveal song in Objective 6.", tone: "weight, no rush" },
    ],
  },

  // OBJ 6 — Build Your AI Academy Avatar (image deliverable)
  "l1-06": {
    beats: [
      { text: "I'm Sage. I'll grade this one.",                                tone: "calm hello, no theatre" },
      { text: "Objective 6. Design your avatar — the face you're using for the next six levels.", tone: "matter-of-fact, naming the stakes once and moving on" },
      { text: "Fill the Identity Card on the worksheet first. That's your image prompt.",  tone: "practical, like reading the recipe out loud" },
      { text: "Then generate the avatar in Visual Studio — or drop your photo in chat to restyle it.", tone: "even, presenting both routes" },
      { text: "Bring me the worksheet and the image when they're ready.",      tone: "patient, almost waiting" },
    ],
  },

  // OBJ 10 — Your First AI Comic Strip
  "l1-10": {
    beats: [
      { text: "Hey. I'm Sage — I check your work.",                            tone: "casual hello, like a tutor pulling up a chair" },
      { text: "Objective 10. Three panels, one punchline. That's the whole job.", tone: "matter-of-fact, naming the task without selling it" },
      { text: "Start with the worksheet. That's where the comic actually gets made.", tone: "dry, knowing — letting them in on the real game" },
      { text: "When you're ready, hit Validate.",                              tone: "warm and brief, an open door not a push" },
    ],
  },

  // OBJ 7 — Your Film Poster: Coming Soon (Firefly image)
  "l1-07": {
    beats: [
      { text: "Sage. I'll grade this.",                                          tone: "calm hello" },
      { text: "Objective 7. One sentence about something you'd actually watch a film about.", tone: "matter-of-fact" },
      { text: "Worksheet first. Add a tone word and an atmosphere word. Three elements, one prompt.", tone: "instructive" },
      { text: "Generate the poster in Firefly. Your Avatar Name is the Director.", tone: "practical" },
      { text: "Drop the poster in chat. Then we look at it together.",           tone: "warm and brief" },
    ],
  },

  // OBJ 8 — AI Speaks Your Words: Voice Direction Lab (3 ElevenLabs voices)
  "l1-08": {
    beats: [
      { text: "I'm Sage. I'll check this one.",                                  tone: "calm hello" },
      { text: "Objective 8. Three sentences. Three voices. Blind evaluation.",   tone: "matter-of-fact" },
      { text: "Worksheet first. Pick three ElevenLabs voices by NAME — don't preview them.", tone: "specific, naming the rule" },
      { text: "Generate. Label the audio Voice A, B, C — not the voice names.",  tone: "instructive" },
      { text: "Listen blind. Identify each personality from what you actually hear.", tone: "patient" },
    ],
  },

  // OBJ 9 — The Negative Prompt Lab: Editing Reality (3 Firefly images)
  "l1-09": {
    beats: [
      { text: "Sage. I'll grade this.",                                          tone: "calm hello" },
      { text: "Objective 9. Same prompt. Three versions. Each one removes more.", tone: "matter-of-fact" },
      { text: "Worksheet first. After Version 1, list at least five things Firefly added that you didn't ask for.", tone: "instructive" },
      { text: "Then exclude them — layer by layer. Version 2 cuts some. Version 3 cuts more.", tone: "practical" },
      { text: "Drop all three in chat in order. Then we see what the AI assumed.", tone: "patient" },
    ],
  },
};

export function getObjectiveIntro(lmsId: string): ObjectiveIntro | null {
  return INTROS[lmsId] ?? null;
}

/**
 * Convenience helper: legacy callsites that still expect a single
 * concatenated greeting line can use this. Returns the joined beats with
 * normal spacing. New callsites should use `intro.beats` directly so each
 * line gets its own typewriter reveal + pause.
 */
export function joinIntroBeats(intro: ObjectiveIntro): string {
  return intro.beats.map(b => b.text).join(" ");
}

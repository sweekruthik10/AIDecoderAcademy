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
  // OBJ 1 — Netflix Documentary Intro + Avatar Name
  "l1-01": {
    beats: [
      { text: "Hey. I'm Sage — I grade this.",                                  tone: "casual hello, like a tutor pulling up a chair" },
      { text: "Objective 1. ChatGPT writes a two-sentence intro about you. You choose your Avatar Name.", tone: "matter-of-fact, naming the task once" },
      { text: "Open the worksheet. Four Canvas fields, four self-questions, then paste the final intro.", tone: "practical, like reading the recipe out loud" },
      { text: "When it's in, hit Validate.",                                    tone: "warm and brief, an open door not a push" },
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

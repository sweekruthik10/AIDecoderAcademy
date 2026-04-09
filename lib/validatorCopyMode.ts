// Attempts-aware copy mode for the validator.
//
// Pedagogical research (Tucker 2025; ScienceDirect 2025 SDT review) shows
// that after multiple failed attempts on the same task, students benefit from
// switching from corrective prompts to metacognitive ones — "what feels
// weakest?" rather than "rewrite Field 2 because…". This module exposes a
// pure helper the validator routes call to wrap the system prompt.

export type CopyMode = "standard" | "metacognitive";

export function pickCopyMode(attemptCount: number): CopyMode {
  return attemptCount >= 3 ? "metacognitive" : "standard";
}

export function metacognitivePreamble(attemptCount: number, displayName: string): string {
  const name = displayName?.trim() || "Student";
  if (attemptCount === 3) return `${name}, you're working at this. Let's go field-by-field.`;
  if (attemptCount >= 4)  return `${name}, three goes in. Pick one field — the one that feels weakest — and rewrite only that one.`;
  return "";
}

export function applyCopyMode(systemPrompt: string, attemptCount: number, displayName: string): string {
  if (pickCopyMode(attemptCount) === "standard") return systemPrompt;
  const preamble = metacognitivePreamble(attemptCount, displayName);
  if (!preamble) return systemPrompt;
  return `${systemPrompt}\n\nPRE-AMBLE — say this exact sentence first, no rephrasing, then continue with the rubric:\n"${preamble}"`;
}

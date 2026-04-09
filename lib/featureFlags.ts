// Feature flags read from process.env. All default to false.
// Set in .env.local for local dev, in Vercel env vars for production.

export const FEATURE_FLAGS = {
  // When true, AIDA + Teacher + Playground routes use the new unified
  // safety/persona modules. When false, they use the legacy inline prompts.
  USE_NEW_AIDA_PROMPTS: process.env.USE_NEW_AIDA_PROMPTS === "true",
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}

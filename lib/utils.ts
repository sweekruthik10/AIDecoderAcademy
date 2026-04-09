import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  }).format(new Date(dateStr));
}

export function truncate(str: string, max = 80): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export const MODE_META = {
  story: { label: "Story Builder", emoji: "📖", color: "bg-pink-100 text-pink-700" },
  code:  { label: "Code Lab",      emoji: "💻", color: "bg-blue-100 text-blue-700" },
  art:   { label: "Art Studio",    emoji: "🎨", color: "bg-yellow-100 text-yellow-700" },
  quiz:  { label: "Quiz Zone",     emoji: "🧠", color: "bg-purple-100 text-purple-700" },
  free:  { label: "Free Explore",  emoji: "🚀", color: "bg-green-100 text-green-700" },
} as const;

export const AVATAR_OPTIONS = [
  "🚀","🌟","🦁","🐉","🦊","🐳","🦋","🌈",
  "⚡","🎮","🎨","🔭","🦄","🐸","🌙","🎯",
];

export const INTEREST_OPTIONS = [
  "Space","Animals","Art","Music","Gaming","Science",
  "Sports","Cooking","Math","Stories","Nature","Robots",
  "Movies","Magic","History","Coding",
];

export const AGE_GROUP_LABELS: Record<string, string> = {
  "5-7":  "5–7 years",
  "8-10": "8–10 years",
  "11-13":"11–13 years",
  "14+":  "14+ years",
};

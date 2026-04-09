"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn, INTEREST_OPTIONS } from "@/lib/utils";
import {
  getArena, getUnlockedArenas, getXPProgress, getXPForNextLevel,
  BADGES, ARENAS,
} from "@/lib/arenas";
import { isGameSfxEnabled, setGameSfxEnabled } from "@/lib/gameAudio";
import LearnerStats from "@/components/profile/LearnerStats";
import TeacherViewCard from "@/components/profile/TeacherViewCard";
import type { AgeGroup, Profile } from "@/types";

// ─── Onboarding helpers ───────────────────────────────────────────────────────
const BOARDS = ["CBSE", "ICSE", "State Board"];
const GRADES = ["6", "7", "8", "9", "10", "11", "12"];

function getDefaultAvatar(name: string): string {
  const initials: Record<string, string> = {
    a:"🦁",b:"🐻",c:"🐱",d:"🐶",e:"🦅",f:"🦊",g:"🦍",h:"🐹",i:"🦔",j:"🐯",
    k:"🦘",l:"🦁",m:"🐭",n:"🦎",o:"🦉",p:"🐼",q:"🦆",r:"🐰",s:"🐍",t:"🐯",
    u:"🦄",v:"🦅",w:"🐺",x:"🦖",y:"🦚",z:"🦓",
  };
  return initials[name?.charAt(0).toLowerCase() ?? "s"] ?? "🚀";
}

function gradeToAgeGroup(grade: string): AgeGroup {
  const g = parseInt(grade);
  if (g <= 5)  return "5-7";
  if (g <= 7)  return "8-10";
  if (g <= 10) return "11-13";
  return "14+";
}

function isProfileComplete(p: Record<string, unknown>): boolean {
  return !!(p.display_name && p.age_group);
}

// ─── Onboarding flow ──────────────────────────────────────────────────────────
function OnboardingFlow() {
  const router   = useRouter();
  const [saving,       setSaving]       = useState(false);
  const [step,         setStep]         = useState(0);
  const [board,        setBoard]        = useState("CBSE");
  const [grade,        setGrade]        = useState("8");
  const [interests,    setInterests]    = useState<string[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile,    setPhotoFile]    = useState<File | null>(null);

  const [authName, setAuthName] = useState("Explorer");
  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : { profile: null })
      .then(({ profile }) => {
        if (profile?.display_name) setAuthName(profile.display_name);
      })
      .catch(() => {});
  }, []);
  const displayName = authName;
  const defaultAvatar = getDefaultAvatar(displayName);
  const displayPhoto = photoPreview ?? null;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleInterest = (i: string) =>
    setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : prev.length < 8 ? [...prev, i] : prev);

  const [saveError, setSaveError] = useState<string | null>(null);
  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    console.log("[Onboarding] handleSave fired", { displayName, board, grade, interests });
    try {
      let avatarUrl: string | null = null;
      if (photoFile) {
        const fd = new FormData();
        fd.append("file", photoFile);
        const r = await fetch("/api/profile/photo", { method: "POST", body: fd });
        if (r.ok) {
          ({ url: avatarUrl } = await r.json());
        } else {
          console.warn("[Onboarding] photo upload failed", r.status, await r.text().catch(() => ""));
        }
      }
      const payload = {
        display_name: displayName,
        avatar_emoji: defaultAvatar,
        avatar_url:   avatarUrl ?? null,
        age_group:    gradeToAgeGroup(grade),
        interests,
      };
      console.log("[Onboarding] POST /api/profile", payload);
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("[Onboarding] /api/profile response", res.status);
      if (res.ok) {
        router.replace("/dashboard");
        return;
      }
      const errText = await res.text().catch(() => "");
      console.error("[Onboarding] save failed:", res.status, errText);
      setSaveError(`Save failed (${res.status}). ${errText.slice(0, 200) || "Check the network tab."}`);
      setSaving(false);
    } catch (err) {
      console.error("[Onboarding] save threw:", err);
      setSaveError(`Network error: ${(err as Error)?.message ?? "unknown"}`);
      setSaving(false);
    }
  };

  return (
    <div className="studio-bg min-h-full flex items-center justify-center p-8 text-white">
      <div className="w-full max-w-lg">
        <div className="flex gap-2 justify-center mb-8">
          {[0,1].map(i => (
            <div key={i} className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === step ? "w-8 bg-[#C8FF00]" : i < step ? "w-2 bg-[#C8FF00]/40" : "w-2 bg-white/10"
            )}/>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.25 }}
            className="rounded-3xl overflow-hidden"
            style={{ background: "rgba(15,15,26,0.95)", border: "1px solid rgba(255,255,255,0.08)" }}>

            <div className="px-8 pt-7 pb-5 border-b border-white/[0.07]">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#C8FF00]">
                Step {step + 1} of 2
              </span>
              <h1 className="text-2xl font-display font-black text-white mb-1 mt-3">
                {step === 0 ? `Welcome, ${displayName}! 👋` : "Your learning profile"}
              </h1>
              <p className="text-sm text-white/50">
                {step === 0 ? "Add a profile photo, or we'll pick one for you." : "Help us personalise your AI experience."}
              </p>
            </div>

            <div className="px-8 py-6">
              {step === 0 && (
                <div className="flex flex-col items-center gap-6">
                  <div className="relative">
                    <div className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center"
                      style={{ background: "rgba(200,255,0,0.1)", border: "3px solid rgba(200,255,0,0.3)" }}>
                      {displayPhoto
                        ? <img src={displayPhoto} alt="Profile" className="w-full h-full object-cover"/>
                        : <span className="text-5xl">{defaultAvatar}</span>}
                    </div>
                    <label className="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-110"
                      style={{ background: "#C8FF00" }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 3v10M3 8l5-5 5 5" stroke="#08080F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange}/>
                    </label>
                  </div>
                  <p className="text-sm text-white/60 text-center">
                    {displayPhoto ? "Looking great! 🎉" : `We'll use ${defaultAvatar} for now`}
                  </p>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">Education Board</label>
                    <div className="flex gap-2 flex-wrap">
                      {BOARDS.map(b => (
                        <button key={b} onClick={() => setBoard(b)}
                          className={cn("px-4 py-2 rounded-xl text-sm font-bold border transition-all",
                            board === b ? "text-[#08080F] border-transparent" : "border-white/10 text-white/50 hover:border-white/20")}
                          style={board === b ? { background: "#C8FF00", boxShadow: "0 0 20px rgba(200,255,0,0.3)" } : {}}>
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">Grade / Class</label>
                    <div className="flex gap-2 flex-wrap">
                      {GRADES.map(g => (
                        <button key={g} onClick={() => setGrade(g)}
                          className={cn("w-12 h-12 rounded-xl text-sm font-bold border transition-all",
                            grade === g ? "text-[#08080F] border-transparent" : "border-white/10 text-white/50 hover:border-white/20")}
                          style={grade === g ? { background: "#C8FF00" } : {}}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                      Interests <span className="normal-case font-normal text-white/25">(pick up to 8)</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {INTEREST_OPTIONS.map(interest => (
                        <button key={interest} onClick={() => toggleInterest(interest)}
                          className={cn("px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
                            interests.includes(interest) ? "text-[#08080F] border-transparent" : "border-white/10 text-white/40 hover:border-white/20")}
                          style={interests.includes(interest) ? { background: "#C8FF00" } : {}}>
                          {interest}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-white/30 mt-2">{interests.length}/8 selected</p>
                  </div>
                </div>
              )}

              {saveError && (
                <div className="mt-4 px-3 py-2 rounded-lg text-xs relative"
                     style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.35)", color: "#FF9999" }}>
                  <button
                    onClick={() => setSaveError(null)}
                    className="absolute top-1.5 right-2 text-[#FF9999] hover:text-white transition-colors leading-none"
                    aria-label="Dismiss error"
                    style={{ fontSize: 16, fontWeight: 700 }}
                  >
                    ×
                  </button>
                  <span className="pr-5 block">{saveError}</span>
                  <button
                    onClick={() => router.push("/dashboard/playground")}
                    className="mt-2 text-[10px] font-bold underline underline-offset-2 hover:text-white transition-colors"
                  >
                    Continue to playground anyway →
                  </button>
                </div>
              )}
              <div className="flex gap-3 mt-8">
                {step > 0 && (
                  <button onClick={() => setStep(s => s - 1)}
                    className="flex-1 py-3.5 rounded-xl font-display font-bold text-sm border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-all">
                    ← Back
                  </button>
                )}
                {step === 0 ? (
                  <button onClick={() => setStep(1)}
                    className="flex-1 py-3.5 rounded-xl font-display font-black text-sm transition-all hover:scale-[1.02] active:scale-95"
                    style={{ background: "#C8FF00", color: "#08080F", boxShadow: "0 0 24px rgba(200,255,0,0.35)" }}>
                    Next →
                  </button>
                ) : (
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 py-3.5 rounded-xl font-display font-black text-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                    style={{ background: "#C8FF00", color: "#08080F", boxShadow: "0 0 24px rgba(200,255,0,0.35)" }}>
                    {saving ? "Setting up…" : "Let's go! 🚀"}
                  </button>
                )}
              </div>
              {step === 0 && (
                <button onClick={() => setStep(1)} className="w-full text-center text-xs text-white/30 hover:text-white/50 mt-4 transition-colors">
                  Skip photo →
                </button>
              )}
              {step === 1 && (
                <button onClick={() => router.push("/dashboard/playground")} className="w-full text-center text-xs text-white/30 hover:text-white/50 mt-4 transition-colors">
                  Skip for now →
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Arena objectives — per-arena mission lists ──────────────────────────────
type ObjectiveCtx = {
  xp: number; level: number; streak: number; creationCount: number; badges: Set<string>;
  textCount: number; jsonCount: number; imageCount: number; audioCount: number; slidesCount: number;
};
type Objective = { id: string; label: string; check: (c: ObjectiveCtx) => boolean };

// Each arena defines 18 missions — a 6-week curriculum-style progression.
// Trackable goals tie to real signals (badges, counts, level, streak); the rest are
// forward-looking learning prompts that appear as unchecked until manually surfaced.
const ARENA_OBJECTIVES: Record<number, Objective[]> = {
  1: [
    { id: "send_first",     label: "Send your first message to AI",       check: c => c.xp > 0 },
    { id: "first_creation", label: "Save your first creation",            check: c => c.badges.has("first_creation") },
    { id: "ask_concept",    label: "Ask AI to explain a concept",         check: c => c.textCount >= 1 },
    { id: "what_if",        label: "Try a 'what if' question",            check: c => c.textCount >= 2 },
    { id: "text_5",         label: "Generate text 5 times",               check: c => c.textCount >= 5 },
    { id: "ask_hobby",      label: "Ask AI about your favourite hobby",   check: c => c.textCount >= 3 },
    { id: "ask_science",    label: "Ask a science question",              check: c => c.textCount >= 4 },
    { id: "compare",        label: "Ask AI to compare two things",        check: c => c.textCount >= 6 },
    { id: "text_10",        label: "Generate text 10 times",              check: c => c.textCount >= 10 },
    { id: "save_3",         label: "Save 3 creations to your library",    check: c => c.creationCount >= 3 },
    { id: "save_5",         label: "Save 5 creations",                    check: c => c.creationCount >= 5 },
    { id: "streak_3",       label: "Build a 3-day creation streak",       check: c => c.badges.has("streak_3") },
    { id: "summarize",      label: "Ask AI to summarise a topic",         check: c => c.textCount >= 8 },
    { id: "first_json",     label: "Generate your first JSON output",     check: c => c.jsonCount >= 1 },
    { id: "librarian",      label: "Save 10 creations (Librarian badge)", check: c => c.badges.has("librarian") },
    { id: "try_other",      label: "Try image, audio, or slides once",    check: c => c.imageCount + c.audioCount + c.slidesCount >= 1 },
    { id: "use_picker",     label: "Use the creation picker to add context", check: c => c.creationCount >= 4 },
    { id: "level_2",        label: "Reach Level 2 to unlock Prompt Lab",  check: c => c.level >= 2 },
  ],
  2: [
    { id: "unlock",         label: "Reach Level 2 to enter the lab",      check: c => c.level >= 2 },
    { id: "badge",          label: "Earn the Prompt Lab badge",           check: c => c.badges.has("prompt_lab") },
    { id: "long_prompt",    label: "Write a detailed 50+ word prompt",    check: c => c.textCount >= 12 },
    { id: "step_by_step",   label: "Use a 'step by step' prompt",         check: c => c.textCount >= 14 },
    { id: "role_prompt",    label: "Try role-based prompting (act as…)",  check: c => c.textCount >= 16 },
    { id: "json_3",         label: "Generate JSON output 3 times",        check: c => c.jsonCount >= 3 },
    { id: "json_5",         label: "Generate JSON output 5 times",        check: c => c.jsonCount >= 5 },
    { id: "constraints",    label: "Try a prompt with constraints",       check: c => c.jsonCount >= 2 },
    { id: "persona",        label: "Use a persona-driven prompt",         check: c => c.textCount >= 18 },
    { id: "chain_thought",  label: "Use a chain-of-thought prompt",       check: c => c.textCount >= 20 },
    { id: "compare_2",      label: "Compare two different prompts",       check: c => c.textCount >= 22 },
    { id: "system_inst",    label: "Use clear system instructions",       check: c => c.jsonCount >= 4 },
    { id: "save_3_prompts", label: "Save 3 prompt experiments",           check: c => c.creationCount >= 8 },
    { id: "text_20",        label: "Generate text 20 times overall",      check: c => c.textCount >= 20 },
    { id: "json_save",      label: "Save 5 JSON creations",               check: c => c.jsonCount >= 5 },
    { id: "streak_5",       label: "Build a 5-day streak",                check: c => c.streak >= 5 },
    { id: "lib_10",         label: "Save 10 prompt-lab creations",        check: c => c.creationCount >= 12 },
    { id: "level_3",        label: "Reach Level 3 to unlock Story Forge", check: c => c.level >= 3 },
  ],
  3: [
    { id: "unlock",         label: "Reach Level 3 to enter the forge",    check: c => c.level >= 3 },
    { id: "badge",          label: "Earn the Story Forge badge",          check: c => c.badges.has("story_forge") },
    { id: "first_story",    label: "Write your first story prompt",       check: c => c.textCount >= 24 },
    { id: "character",      label: "Create a character description",      check: c => c.textCount >= 26 },
    { id: "twist",          label: "Build a story with a twist ending",   check: c => c.textCount >= 28 },
    { id: "three_act",      label: "Write a 3-act story structure",       check: c => c.textCount >= 30 },
    { id: "dialogue",       label: "Write dialogue between characters",   check: c => c.textCount >= 32 },
    { id: "fantasy",        label: "Build a fantasy world",               check: c => c.textCount >= 34 },
    { id: "scifi",          label: "Write a sci-fi scene",                check: c => c.textCount >= 36 },
    { id: "save_3_stories", label: "Save 3 stories to your library",      check: c => c.creationCount >= 15 },
    { id: "save_5_stories", label: "Save 5 stories",                      check: c => c.creationCount >= 17 },
    { id: "story_slides",   label: "Build a story slide deck",            check: c => c.slidesCount >= 1 },
    { id: "streak_7",       label: "Earn the 7-day Week Warrior streak",  check: c => c.badges.has("streak_7") },
    { id: "genres_3",       label: "Try 3 different genres",              check: c => c.textCount >= 38 },
    { id: "continue",       label: "Continue a story across sessions",    check: c => c.textCount >= 40 },
    { id: "cliffhanger",    label: "End a chapter on a cliffhanger",      check: c => c.textCount >= 42 },
    { id: "save_10_stories",label: "Save 10 stories",                     check: c => c.creationCount >= 20 },
    { id: "level_4",        label: "Reach Level 4 to unlock Visual Studio", check: c => c.level >= 4 },
  ],
  4: [
    { id: "unlock",         label: "Reach Level 4 to enter the studio",   check: c => c.level >= 4 },
    { id: "badge",          label: "Earn the Visual Studio badge",        check: c => c.badges.has("visual_studio") },
    { id: "first_image",    label: "Generate your first image",           check: c => c.badges.has("image_maker") },
    { id: "image_3",        label: "Generate 3 images",                   check: c => c.imageCount >= 3 },
    { id: "image_5",        label: "Generate 5 images",                   check: c => c.imageCount >= 5 },
    { id: "portrait",       label: "Try a portrait prompt",               check: c => c.imageCount >= 6 },
    { id: "landscape",      label: "Try a landscape prompt",              check: c => c.imageCount >= 7 },
    { id: "scifi_scene",    label: "Generate a sci-fi scene",             check: c => c.imageCount >= 8 },
    { id: "img2img",        label: "Modify an image with img-to-img",     check: c => c.imageCount >= 9 },
    { id: "abstract",       label: "Try an abstract art prompt",          check: c => c.imageCount >= 10 },
    { id: "image_10",       label: "Generate 10 images",                  check: c => c.imageCount >= 10 },
    { id: "character_des",  label: "Design a character",                  check: c => c.imageCount >= 12 },
    { id: "logo",           label: "Generate a logo concept",             check: c => c.imageCount >= 14 },
    { id: "save_5_images",  label: "Save 5 images to library",            check: c => c.imageCount >= 5 && c.creationCount >= 22 },
    { id: "save_10_images", label: "Save 10 images",                      check: c => c.imageCount >= 10 && c.creationCount >= 26 },
    { id: "deck_w_image",   label: "Build a slide deck with images",      check: c => c.slidesCount >= 2 },
    { id: "image_15",       label: "Generate 15 images total",            check: c => c.imageCount >= 15 },
    { id: "level_5",        label: "Reach Level 5 to unlock Sound Booth", check: c => c.level >= 5 },
  ],
  5: [
    { id: "unlock",         label: "Reach Level 5 to enter the booth",    check: c => c.level >= 5 },
    { id: "badge",          label: "Earn the Sound Booth badge",          check: c => c.badges.has("sound_booth") },
    { id: "first_audio",    label: "Generate your first audio (Voice Actor)", check: c => c.badges.has("voice_actor") },
    { id: "audio_3",        label: "Generate 3 audio clips",              check: c => c.audioCount >= 3 },
    { id: "narrator",       label: "Try a single-narrator audio",         check: c => c.audioCount >= 4 },
    { id: "multi_char",     label: "Try multi-character dialogue",        check: c => c.audioCount >= 5 },
    { id: "ssml_emotion",   label: "Use emotion / SSML in a script",      check: c => c.audioCount >= 6 },
    { id: "rap",            label: "Create a rap or rhyme audio",         check: c => c.audioCount >= 7 },
    { id: "narration",      label: "Create a narration",                  check: c => c.audioCount >= 8 },
    { id: "audio_5",        label: "Generate 5 audio clips total",        check: c => c.audioCount >= 5 },
    { id: "voices_3",       label: "Try 3 different voices",              check: c => c.audioCount >= 9 },
    { id: "modify_audio",   label: "Modify an existing audio",            check: c => c.audioCount >= 10 },
    { id: "save_5_audio",   label: "Save 5 audio clips",                  check: c => c.audioCount >= 5 && c.creationCount >= 28 },
    { id: "audio_scene",    label: "Build an audio scene",                check: c => c.audioCount >= 11 },
    { id: "podcast",        label: "Create a podcast intro",              check: c => c.audioCount >= 12 },
    { id: "save_10_audio",  label: "Save 10 audio creations",             check: c => c.audioCount >= 10 && c.creationCount >= 32 },
    { id: "audio_15",       label: "Generate 15 audio clips total",       check: c => c.audioCount >= 15 },
    { id: "level_6",        label: "Reach Level 6 to unlock Director's Suite", check: c => c.level >= 6 },
  ],
  6: [
    { id: "unlock",         label: "Reach Level 6 to enter the suite",    check: c => c.level >= 6 },
    { id: "badge",          label: "Earn the Director's Suite badge",     check: c => c.badges.has("directors_suite") },
    { id: "first_deck",     label: "Build your first slide deck",         check: c => c.badges.has("slide_master") },
    { id: "all_tools",      label: "Use every output type (Full Toolkit)", check: c => c.badges.has("all_tools") },
    { id: "deck_3",         label: "Build 3 slide decks",                 check: c => c.slidesCount >= 3 },
    { id: "deck_5",         label: "Build 5 slide decks",                 check: c => c.slidesCount >= 5 },
    { id: "prolific",       label: "Save 25 creations (Prolific badge)",  check: c => c.badges.has("prolific") },
    { id: "film_outline",   label: "Write a film script outline",         check: c => c.textCount >= 50 },
    { id: "combine",        label: "Combine image + audio + slides in one project", check: c => c.imageCount >= 5 && c.audioCount >= 3 && c.slidesCount >= 2 },
    { id: "multi_scene",    label: "Create a multi-scene story",          check: c => c.textCount >= 55 && c.imageCount >= 5 },
    { id: "module",         label: "Build a complete learning module",    check: c => c.slidesCount >= 6 },
    { id: "direct_arc",     label: "Direct a complete narrative arc",     check: c => c.textCount >= 60 },
    { id: "save_30",        label: "Save 30 creations to library",        check: c => c.creationCount >= 30 },
    { id: "save_50",        label: "Save 50 creations",                   check: c => c.creationCount >= 50 },
    { id: "deck_10",        label: "Build 10 slide decks",                check: c => c.slidesCount >= 10 },
    { id: "film_concept",   label: "Build a complete film concept",       check: c => c.slidesCount >= 8 && c.audioCount >= 6 },
    { id: "all_badges",     label: "Earn all 13 trophies",                check: c => c.badges.size >= 13 },
    { id: "architect",      label: "Become an AI Learning Architect",     check: c => c.level >= 6 && c.badges.size >= 13 },
  ],
};

// Badge category map — for the Trophy Hall grouping
const BADGE_CATEGORIES: { id: string; label: string; icon: string; ids: string[] }[] = [
  { id: "creation", label: "Creation",     icon: "✨", ids: ["first_creation", "image_maker", "voice_actor", "slide_master"] },
  { id: "mastery",  label: "Mastery",      icon: "🏆", ids: ["librarian", "prolific", "all_tools"] },
  { id: "streak",   label: "Streaks",      icon: "🔥", ids: ["streak_3", "streak_7"] },
  { id: "arena",    label: "Arena Unlocks", icon: "🌌", ids: ["prompt_lab", "story_forge", "visual_studio", "sound_booth", "directors_suite"] },
];

// ─── Trophy Room (profile dashboard) ─────────────────────────────────────────
function TrophyRoom({ profile }: { profile: Profile }) {
  const [arenaSfx, setArenaSfx] = useState(false);
  const [creationCount, setCreationCount] = useState<number | null>(null);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  useEffect(() => { setArenaSfx(isGameSfxEnabled()); }, []);
  useEffect(() => {
    fetch("/api/creations")
      .then(r => (r.ok ? r.json() : { creations: [] }))
      .then(({ creations }) => {
        const list = creations ?? [];
        setCreationCount(list.length);
        const counts: Record<string, number> = {};
        for (const c of list) counts[c.output_type] = (counts[c.output_type] ?? 0) + 1;
        setTypeCounts(counts);
      })
      .catch(() => setCreationCount(null));
  }, []);

  const arena        = getArena(profile.active_arena ?? 1);
  const xp           = profile.xp ?? 0;
  const level        = profile.level ?? 1;
  const streak       = profile.streak_days ?? 0;
  const earnedBadges = new Set((profile.badges ?? []).map((b: { id: string }) => b.id));
  const progress     = getXPProgress(xp, level);
  const nextXPThreshold    = getXPForNextLevel(level);
  const isMaxLevel   = level >= 6;

  const objectiveCtx: ObjectiveCtx = {
    xp, level, streak, creationCount: creationCount ?? 0, badges: earnedBadges,
    textCount:   typeCounts.text   ?? 0,
    jsonCount:   typeCounts.json   ?? 0,
    imageCount:  typeCounts.image  ?? 0,
    audioCount:  typeCounts.audio  ?? 0,
    slidesCount: typeCounts.slides ?? 0,
  };

  return (
    <div className="relative overflow-y-auto text-white" style={{ height: "100%", background: "#08080F" }}>

      {/* ─── Arena ambient background — mirrors playground immersion ─── */}
      <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div className="absolute inset-0" style={{ background: arena.gradient }}/>
        <motion.div
          className="absolute rounded-full"
          style={{
            top: "-15%", left: "-10%", width: "60vw", height: "60vw",
            background: `radial-gradient(circle, ${arena.accent}15 0%, transparent 60%)`,
            filter: "blur(60px)",
          }}
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute rounded-full"
          style={{
            bottom: "-20%", right: "-15%", width: "55vw", height: "55vw",
            background: `radial-gradient(circle, ${arena.accent}10 0%, transparent 60%)`,
            filter: "blur(80px)",
          }}
          animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl space-y-7 px-6 py-10">

        {/* ─── Hero ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl overflow-hidden border backdrop-blur-xl"
          style={{
            borderColor: `${arena.accent}30`,
            background: `linear-gradient(135deg, ${arena.accentDim} 0%, rgba(15,15,26,0.85) 60%)`,
            boxShadow: `0 30px 80px -20px ${arena.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
          }}
        >
          {/* Decorative accent stripe */}
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${arena.accent}, transparent)` }}/>

          <div className="relative p-7 md:p-9 flex flex-col md:flex-row items-start gap-6">
            {/* Avatar with animated arena ring */}
            <div className="relative flex-shrink-0 mx-auto md:mx-0">
              <motion.div
                className="absolute inset-0 rounded-3xl"
                style={{ border: `2px solid ${arena.accent}80`, boxShadow: `0 0 30px ${arena.accentGlow}` }}
                animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative w-24 h-24 rounded-3xl flex items-center justify-center text-5xl"
                style={{ background: `linear-gradient(135deg, ${arena.accentDim}, rgba(15,15,26,0.9))`, border: `2px solid ${arena.accent}50` }}>
                {(profile as { avatar_url?: string | null }).avatar_url ? (
                  <img src={(profile as { avatar_url?: string | null }).avatar_url ?? ""} alt="" className="w-full h-full object-cover rounded-3xl"/>
                ) : (
                  <span>{profile.avatar_emoji}</span>
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-2xl flex items-center justify-center font-display font-black text-sm"
                style={{ background: arena.accent, color: "#08080F", boxShadow: `0 4px 16px ${arena.accentGlow}` }}>
                {level}
              </div>
            </div>

            {/* Identity + XP */}
            <div className="flex-1 min-w-0 w-full text-center md:text-left">
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-white/35 mb-1">
                {arena.weekLabel} · Active Arena
              </div>
              <h1 className="font-display font-black text-3xl md:text-4xl leading-[1.05] text-white">
                {profile.display_name}
              </h1>
              <div className="flex items-center justify-center md:justify-start gap-2 mt-2">
                <span className="text-xl">{arena.emoji}</span>
                <span className="font-display font-bold text-base" style={{ color: arena.accent }}>
                  {arena.role}
                </span>
              </div>

              <div className="mt-5">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/45">
                    {isMaxLevel ? "★ Max Level Reached ★" : `Level ${level} → ${level + 1}`}
                  </span>
                  <span className="text-[11px] font-mono font-bold" style={{ color: arena.accent }}>
                    {xp} XP {!isMaxLevel && <span className="text-white/30">/ {nextXPThreshold}</span>}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden border border-white/[0.04]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${isMaxLevel ? 100 : progress}%` }}
                    transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full relative overflow-hidden"
                    style={{
                      background: `linear-gradient(90deg, ${arena.accent}, ${arena.accent}cc)`,
                      boxShadow: `0 0 16px ${arena.accentGlow}`,
                    }}>
                    <motion.div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)" }}
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                    />
                  </motion.div>
                </div>
                {!isMaxLevel && (
                  <p className="text-[10px] text-white/35 mt-2">
                    <span className="font-mono font-bold" style={{ color: arena.accent }}>{nextXPThreshold - xp} XP</span>
                    {" "}until you unlock <span className="text-white/65 font-bold">{ARENAS[level]?.name}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Streak medallion */}
            <div className="flex-shrink-0 text-center px-5 py-4 rounded-2xl border self-stretch md:self-auto flex flex-col justify-center"
              style={{
                background: streak > 0 ? "linear-gradient(135deg, rgba(255,107,43,0.18), rgba(255,107,43,0.05))" : "rgba(255,255,255,0.03)",
                borderColor: streak > 0 ? "rgba(255,107,43,0.35)" : "rgba(255,255,255,0.08)",
                boxShadow: streak >= 3 ? "0 0 30px rgba(255,107,43,0.2)" : "none",
              }}>
              <div className="text-3xl mb-0.5">{streak >= 7 ? "🌟" : streak >= 3 ? "🔥" : "⚡"}</div>
              <div className="font-display font-black text-2xl text-white leading-none">{streak}</div>
              <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider mt-1">Day Streak</div>
            </div>
          </div>
        </motion.div>

        {/* ─── Stat strip ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total XP",   value: xp,                              sub: "earned",      icon: "⚡", color: arena.accent },
            { label: "Creations",  value: creationCount ?? "—",            sub: "saved",       icon: "💎", color: "#00D4FF" },
            { label: "Badges",     value: `${earnedBadges.size}/${BADGES.length}`, sub: "collected", icon: "🏅", color: "#FFB400" },
            { label: "Arenas",     value: `${getUnlockedArenas(level).length}/6`,    sub: "unlocked",  icon: "🌌", color: "#C8FF00" },
          ].map((s, i) => (
            <motion.div key={s.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              className="rounded-2xl p-4 border backdrop-blur-xl relative overflow-hidden group"
              style={{
                background: "rgba(255,255,255,0.03)",
                borderColor: "rgba(255,255,255,0.08)",
              }}>
              <div className="absolute -top-8 -right-8 w-20 h-20 rounded-full opacity-20 group-hover:opacity-40 transition-opacity"
                style={{ background: s.color, filter: "blur(30px)" }}/>
              <div className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">{s.label}</span>
                  <span className="text-base">{s.icon}</span>
                </div>
                <div className="font-display font-black text-2xl text-white leading-none">{s.value}</div>
                <div className="text-[10px] text-white/35 mt-1">{s.sub}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ─── Learner Stats — RPG-style adaptive profile ─── */}
        <LearnerStats profile={profile} outputCounts={typeCounts} />

        {/* ─── Teacher View — how each AI teacher sees the student ─── */}
        <TeacherViewCard
          profile={profile}
          learner_model={(profile as Profile & { learner_model?: Record<string, unknown> | null }).learner_model ?? null}
        />

        {/* ─── Trophy Hall — categorized badges ─── */}
        <div>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display font-black text-xl text-white flex items-center gap-2">
              <span className="text-2xl">🏆</span> Trophy Hall
            </h2>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/30">
              {earnedBadges.size} of {BADGES.length} earned
            </span>
          </div>

          <div className="space-y-5">
            {BADGE_CATEGORIES.map(cat => {
              const catBadges = BADGES.filter(b => cat.ids.includes(b.id));
              const catEarned = catBadges.filter(b => earnedBadges.has(b.id)).length;
              return (
                <div key={cat.id}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-base">{cat.icon}</span>
                    <span className="font-display font-bold text-[11px] uppercase tracking-[0.15em] text-white/55">
                      {cat.label}
                    </span>
                    <span className="text-[10px] font-mono text-white/30">
                      {catEarned}/{catBadges.length}
                    </span>
                    <div className="flex-1 h-px bg-white/[0.06] ml-2"/>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {catBadges.map((badge, i) => {
                      const earned = earnedBadges.has(badge.id);
                      return (
                        <motion.div key={badge.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.05 * i }}
                          whileHover={earned ? { y: -3, scale: 1.02 } : {}}
                          className="relative rounded-2xl p-4 border overflow-hidden text-center group cursor-default"
                          style={{
                            background: earned
                              ? "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)"
                              : "rgba(255,255,255,0.015)",
                            borderColor: earned ? `${arena.accent}45` : "rgba(255,255,255,0.05)",
                            boxShadow: earned ? `0 8px 28px -8px ${arena.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.06)` : "none",
                          }}>

                          {/* Pedestal glow for earned */}
                          {earned && (
                            <div className="absolute inset-x-0 -bottom-4 h-12 pointer-events-none"
                              style={{ background: `radial-gradient(ellipse at center, ${arena.accent}30 0%, transparent 70%)` }}/>
                          )}

                          {/* Trophy emoji on pedestal */}
                          <div className="relative mx-auto mb-2 w-14 h-14 rounded-2xl flex items-center justify-center"
                            style={{
                              background: earned
                                ? `linear-gradient(135deg, ${arena.accent}30, ${arena.accent}10)`
                                : "rgba(255,255,255,0.03)",
                              border: `1.5px solid ${earned ? `${arena.accent}55` : "rgba(255,255,255,0.06)"}`,
                              boxShadow: earned ? `inset 0 0 20px ${arena.accent}20` : "none",
                            }}>
                            {earned && (
                              <motion.div
                                className="absolute inset-0 rounded-2xl"
                                style={{ border: `1px solid ${arena.accent}` }}
                                animate={{ opacity: [0.3, 0.8, 0.3] }}
                                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                              />
                            )}
                            <span className={cn("text-3xl relative", !earned && "grayscale opacity-40")}>
                              {badge.emoji}
                            </span>
                          </div>

                          <div className={cn("font-display font-black text-[11px] leading-tight mb-1",
                            earned ? "text-white" : "text-white/40")}>
                            {badge.name}
                          </div>
                          <div className={cn("text-[9px] leading-snug",
                            earned ? "text-white/50" : "text-white/25")}>
                            {badge.condition}
                          </div>

                          {earned && (
                            <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                              style={{ background: arena.accent }}>
                              <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="#08080F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Footer: Interests + audio settings ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile.interests?.length > 0 && (
            <div className="rounded-2xl p-5 border backdrop-blur-xl"
              style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.07)" }}>
              <h3 className="font-display font-bold text-[11px] uppercase tracking-[0.15em] text-white/55 mb-3 flex items-center gap-2">
                <span>✨</span> Your Interests
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {profile.interests.map(interest => (
                  <span key={interest}
                    className="px-2.5 py-1 rounded-full text-[11px] font-bold border"
                    style={{
                      background: arena.accentDim,
                      borderColor: `${arena.accent}40`,
                      color: arena.accent,
                    }}>
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl p-5 border backdrop-blur-xl"
            style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.07)" }}>
            <h3 className="font-display font-bold text-[11px] uppercase tracking-[0.15em] text-white/55 mb-3 flex items-center gap-2">
              <span>🎛️</span> Sound Effects
            </h3>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display font-bold text-[13px] text-white leading-tight">Arena & level-up audio</p>
                <p className="text-[10px] text-white/40 mt-1 leading-snug">
                  Stings, fanfare, and badge sounds. Off by default.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={arenaSfx}
                aria-label="Arena and level-up sounds"
                onClick={() => {
                  const next = !arenaSfx;
                  setGameSfxEnabled(next);
                  setArenaSfx(next);
                }}
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
                  arenaSfx ? "border-white/25" : "border-white/10 bg-white/[0.06]",
                )}
                style={arenaSfx ? { background: arena.accentDim, borderColor: `${arena.accent}55` } : undefined}>
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200",
                    arenaSfx ? "translate-x-[1.5rem]" : "translate-x-0.5",
                  )}
                  style={arenaSfx ? { boxShadow: `0 0 10px ${arena.accentGlow}` } : undefined}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="h-8"/>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : { profile: null })
      .then(({ profile }) => {
        setProfile(profile);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="studio-bg flex items-center justify-center" style={{ height: "100vh" }}>
      <div className="flex gap-2">
        {[0,1,2].map(i => (
          <div key={i} className="dot w-3 h-3 rounded-full bg-[#C8FF00] shadow-[0_0_12px_rgba(200,255,0,0.45)]"/>
        ))}
      </div>
    </div>
  );

  // Not set up yet — show onboarding
  if (!profile || !isProfileComplete(profile as unknown as Record<string, unknown>)) {
    return <OnboardingFlow />;
  }

  // Set up — show trophy room
  return <TrophyRoom profile={profile} />;
}
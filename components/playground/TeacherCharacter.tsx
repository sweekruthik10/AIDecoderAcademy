"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TeacherDialogue, type ValidationResult } from "./TeacherDialogue";
import { ObjectiveSubmissionPanel } from "./ObjectiveSubmissionPanel";
import { getRubric, genericRubric, getStagedRubric, type ObjectiveRubric } from "@/lib/objectiveRubrics";
import { OBJECTIVES, toLmsId, normalizeObjectiveId, type Objective } from "@/lib/objectives";
import { useValidatorWriter } from "@/lib/chatChannels";

interface Props {
  // Legacy id from URL ?objective=  (e.g. "a1-3"). May also be a doc-style
  // id like "l1-03" if anyone links to one — we accept both.
  objectiveId: string;

  // Live playground messages. The validator scores these against the rubric.
  // We accept the same `Message` shape useChat.ts produces — only role,
  // content, outputType, and attachmentMeta matter to the validator.
  messages: { role: "user" | "assistant"; content: string; outputType?: string; isLoading?: boolean; attachmentMeta?: string[] }[];

  // For age-adapted feedback.
  profile: { display_name?: string; age_group?: string } | null;

  // Awards XP and updates UI on the parent. Called only when the student
  // clicks "Mark Complete" on a passing attempt.
  onObjectiveCompleted?: (objectiveId: string, lmsId: string) => void;
}

// Tracks which staged objectives have already auto-opened the validator panel
// during this JS session. Resets on full page reload (module re-evaluation),
// which is the desired behaviour — every fresh page load re-greets the student.
const _autoOpenedObjectives = new Set<string>();

export function TeacherCharacter({ objectiveId, messages, profile, onObjectiveCompleted }: Props) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(true); // "💬 Talk to teacher" badge fades after first interaction
  const { setLast: publishValidator } = useValidatorWriter();
  const messagesRef = useRef(messages);

  // Resolve rubric + the underlying Objective (for fallback title/task).
  const normalizedObjectiveId = normalizeObjectiveId(objectiveId);
  const lmsId  = objectiveId.startsWith("l") ? objectiveId : toLmsId(objectiveId);
  const objective: Objective | undefined = OBJECTIVES.find(o => o.id === normalizedObjectiveId);

  // Staged rubrics (currently only OBJ 10 / l1-10) take a different path:
  // they get the multi-step ObjectiveSubmissionPanel instead of the
  // single-pass TeacherDialogue. We resolve both up-front and pick at render.
  const stagedRubric  = getStagedRubric(lmsId);
  const isStaged      = !!stagedRubric;

  const rubric: ObjectiveRubric = isStaged
    ? genericRubric(
        // Staged rubric is rendered by ObjectiveSubmissionPanel; this stub is
        // never read by TeacherDialogue but satisfies the type contract.
        stagedRubric.title,
        "Staged validation — see ObjectiveSubmissionPanel.",
      )
    : (getRubric(lmsId)
        ?? genericRubric(
          objective?.title       ?? `Objective ${objectiveId}`,
          objective?.description ?? "Complete the assigned task.",
        ));

  // Keep messagesRef in sync with the messages prop so handleValidate always
  // reads the latest messages, even if called from a stale closure.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Hide the floating hint after the dialogue has been opened once.
  useEffect(() => { if (open) setHint(false); }, [open]);

  // Tell AidaAssistant to hide itself while the validator panel is open.
  // We BOTH dispatch an event (live updates) AND set a window flag (so an
  // AidaAssistant that mounts *after* this fires — e.g. the panel auto-opens
  // during page load — can still read the current state on init).
  useEffect(() => {
    (window as Window & { __validatorPanelOpen?: boolean }).__validatorPanelOpen = open;
    window.dispatchEvent(new CustomEvent(open ? "validator-panel-open" : "validator-panel-close"));
  }, [open]);

  // Auto-open the validator panel on every fresh page load for staged objectives.
  // We use a module-level Set (JS memory) instead of sessionStorage — this way
  // a full page reload (F5) clears the gate and re-opens the panel, which is
  // exactly what the student needs when they come back to continue working.
  // Client-side navigation between objectives within the same tab also works
  // correctly because the Set key is per objectiveId.
  useEffect(() => {
    if (!isStaged || typeof window === "undefined") return;
    if (_autoOpenedObjectives.has(objectiveId)) return;
    // IMPORTANT: add to Set INSIDE the callback, not before. React Strict Mode
    // (dev) runs effects twice: mount → cleanup → mount. If we add to the Set
    // before starting the timer, cleanup cancels the timer but the Set already
    // has the key, so the second mount returns early and the panel never opens.
    // Adding inside the callback means a cancelled timer never marks the key.
    const t = setTimeout(() => {
      _autoOpenedObjectives.add(objectiveId);
      setOpen(true);
    }, 700);
    return () => clearTimeout(t);
  }, [isStaged, objectiveId]);

  // Whiteboard fallback — for staged rubrics, the validator can fall back to
  // recent whiteboard outputs of the matching type if the student didn't
  // upload anything. Two image sources qualify:
  //   1. AI-generated images: assistant messages with outputType="image"
  //      whose content is a URL.
  //   2. User-attached/uploaded images: user messages whose content contains
  //      one or more `[Image titled "...": <https URL>]` markers — these come
  //      from the kid dropping a screenshot into chat. attachmentMeta items
  //      shaped `img:URL` are a second signal for the same thing.
  // Order: oldest → newest, so the validator can grab whiteboardImages.at(-1)
  // for "most recent."
  const wantedOutputType = objective?.outputType ?? "image";
  // For worksheet-only objectives (OBJ 1, outputType="text"), still collect
  // whiteboard images so ReadyView can show the tick when the student generates one.
  const wantsImages      = wantedOutputType === "image" || lmsId === "l1-01";
  const wantsAudio       = wantedOutputType === "audio";

  const IMG_MARKER_RE   = /\[Image titled "[^"]*":\s*(https?:\/\/[^\s\]]+)\s*\]/g;
  const DOC_MARKER_RE   = /\[Document titled "([^"]*)":\s*(https?:\/\/[^\s\]]+)\s*\]/g;
  const VID_MARKER_RE   = /\[Video titled "([^"]*)":\s*(https?:\/\/[^\s\]]+)\s*\]/g;
  const AUDIO_MARKER_RE = /\[Audio titled "([^"]*)":\s*(https?:\/\/[^\s\]]+)\s*\]/g;
  const whiteboardImages: { url: string }[] = [];
  // Chat-uploaded worksheet docs — fallback for the validator when the popup
  // is empty. Same `[Document titled "X": URL]` marker the chat uses.
  const whiteboardDocs: { url: string; filename: string; format: "pdf" | "docx" }[] = [];
  // Chat-uploaded videos — kept for forward-compat; the active OBJ 6 path
  // now grades an avatar IMAGE (not video) per the GenAlpha spec rewrite.
  const whiteboardVideos: { url: string; filename: string }[] = [];
  // Audio files from chat — used by OBJ 5 (Suno theme song) and OBJ 8
  // (ElevenLabs voice lab). Collected from:
  //   1. AI-generated audio messages (assistant, outputType=audio, JSON content)
  //   2. User messages containing [Audio titled "...": URL] markers
  const whiteboardAudios: { url: string; filename: string }[] = [];

  for (const m of messages) {
    if (m.isLoading || m.role !== "user" || typeof m.content !== "string") continue;
    for (const match of m.content.matchAll(DOC_MARKER_RE)) {
      const url = match[2];
      const filename = match[1] || url.split("/").pop() || "worksheet";
      const lower = (url + " " + filename).toLowerCase();
      const format: "pdf" | "docx" = lower.includes(".pdf") ? "pdf" : "docx";
      whiteboardDocs.push({ url, filename, format });
    }
    for (const match of m.content.matchAll(VID_MARKER_RE)) {
      const url = match[2];
      const filename = match[1] || url.split("/").pop() || "video";
      whiteboardVideos.push({ url, filename });
    }
    for (const match of m.content.matchAll(AUDIO_MARKER_RE)) {
      const url = match[2];
      const filename = match[1] || url.split("/").pop() || "audio.mp3";
      whiteboardAudios.push({ url, filename });
    }
  }
  if (wantsImages) {
    for (const m of messages) {
      if (m.isLoading) continue;
      // AI-generated image messages
      if (m.role === "assistant"
          && m.outputType === "image"
          && typeof m.content === "string"
          && m.content.startsWith("http")) {
        whiteboardImages.push({ url: m.content });
        continue;
      }
      // User-attached images — parse content markers + attachmentMeta tags
      if (m.role === "user" && typeof m.content === "string") {
        const matches = m.content.matchAll(IMG_MARKER_RE);
        for (const match of matches) whiteboardImages.push({ url: match[1] });
        if (Array.isArray(m.attachmentMeta)) {
          for (const tag of m.attachmentMeta) {
            if (typeof tag === "string" && tag.startsWith("img:")) {
              whiteboardImages.push({ url: tag.slice(4) });
            }
          }
        }
      }
    }
  }
  if (wantsAudio) {
    for (const m of messages) {
      if (m.isLoading) continue;
      // AI-generated audio from the whiteboard (outputType=audio, content is JSON)
      if (m.role === "assistant" && m.outputType === "audio" && typeof m.content === "string") {
        try {
          const parsed = JSON.parse(m.content) as Record<string, unknown>;
          const url = (parsed.audioUrl ?? parsed.file_url ?? parsed.url) as string | undefined;
          if (typeof url === "string" && url.startsWith("http")) {
            whiteboardAudios.push({ url, filename: "audio.mp3" });
          }
        } catch { /* non-fatal */ }
      }
    }
  }

  async function handleValidate(): Promise<{ result: ValidationResult; attemptId: string } | null> {
    // Read from ref so we always get the latest messages, even if this
    // function was created during an earlier render with a stale snapshot.
    const cleanMessages = messagesRef.current
      .filter(m => !m.isLoading && m.content)
      .map(m => ({
        role:       m.role,
        content:    m.content,
        outputType: m.outputType,
      }));

    // 1. Run the validator
    const vRes = await fetch("/api/aida/validate", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lmsId,
        fallbackTitle: objective?.title,
        fallbackTask:  objective?.description,
        messages:      cleanMessages,
        profile: {
          display_name: profile?.display_name ?? "Student",
          age_group:    profile?.age_group    ?? "11-13",
        },
      }),
    });
    if (!vRes.ok) {
      console.error("[TeacherCharacter] validate http error:", vRes.status);
      return null;
    }
    const result = await vRes.json() as ValidationResult;

    // 2. Log the attempt
    const aRes = await fetch("/api/objective-attempts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objective_id: objectiveId,
        lms_id:       lmsId,
        score:        result.score,
        tier:         result.tier,
        passed:       result.passed,
        feedback: {
          summary:      result.summary,
          strengths:    result.strengths,
          improvements: result.improvements,
          hintForRetry: result.hintForRetry,
        },
      }),
    });
    if (!aRes.ok) {
      console.error("[TeacherCharacter] log attempt http error:", aRes.status);
      // Don't block the UI — we still have the result, just no DB row.
      return { result, attemptId: "" };
    }
    const { attempt_id } = await aRes.json() as { attempt_id: string };

    // 3. Publish validator state to the channel so AIDA can ground its replies.
    // We fetch the running attempt count for attempts-aware copy + UI hints.
    let attemptCount = 0;
    try {
      const cRes = await fetch(`/api/objective-attempts?objective_id=${encodeURIComponent(objectiveId)}`);
      if (cRes.ok) {
        const j = await cRes.json() as { count?: number };
        attemptCount = j.count ?? 0;
      }
    } catch { /* non-fatal */ }
    publishValidator({
      lmsId,
      lastTier:    result.tier,
      lastMode:    null,                                // generic validator has no canvas mode
      lastSummary: result.summary,
      attempts:    { count: attemptCount, lastAt: new Date().toISOString() },
    });

    return { result, attemptId: attempt_id };
  }

  async function handleComplete(attemptId: string) {
    if (!attemptId) return;
    // Mark complete in DB
    const res = await fetch("/api/objective-attempts", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ attempt_id: attemptId }),
    });
    if (!res.ok) throw new Error("Failed to mark complete");

    // Award XP via existing engine. event_type "save_creation" = 8 XP, but
    // for objective completion we use the objective's own xpReward value
    // by sending a custom event type the xp route already supports.
    if (objective?.xpReward) {
      try {
        await fetch("/api/xp", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            event_type: "objective_complete",
            meta: { objective_id: objectiveId, lms_id: lmsId, xp: objective.xpReward },
          }),
        });
      } catch (err) {
        // Don't block the UX — XP is best-effort for now
        console.warn("[TeacherCharacter] XP award failed:", err);
      }
    }

    onObjectiveCompleted?.(objectiveId, lmsId);
  }

  return (
    <>
      {/* Bottom-left character sprite — clickable, idle bob.
          Hidden while the dialogue/submission panel is open — that panel
          renders its own portrait, so two would overlap.
          Size knob: change the `clamp(...)` width/height below (currently 2× original).
          Position knobs: `left` and `bottom` below (lower px = closer to that edge). */}
      {!open && (
      <button
        onClick={() => setOpen(true)}
        aria-label="Talk to the validator teacher"
        className="fixed z-[55]"
        style={{
          left:        "clamp(16px, 1.5vw, 32px)",  // ← horizontal position from left edge
          bottom:      "clamp(0px, 0vh, 0px)",    // ← vertical position from bottom edge
          padding:     0,
          background:  "transparent",
          border:      "none",
          cursor:      "pointer",
        }}
      >
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="relative"
        >
          <img
            src="/teacher.png"
            alt=""
            draggable={false}
            style={{
              width:     "clamp(173px, 14.4vw, 269px)",  // ← SIZE: 2× original + 20% (was clamp(144px, 12vw, 224px))
              height:    "clamp(173px, 14.4vw, 269px)",  // ← SIZE: keep equal to width
              objectFit: "contain",
              filter:    "drop-shadow(0 0 18px rgba(124,58,237,0.55))",
            }}
          />
          {hint && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md whitespace-nowrap"
              style={{
                background: "rgba(8,8,15,0.92)",
                border:     "1px solid rgba(124,58,237,0.5)",
                color:      "rgba(255,255,255,0.9)",
                fontSize:   10,
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow:  "0 4px 14px rgba(0,0,0,0.5)",
              }}
            >
              💬 Talk to teacher
            </motion.div>
          )}
        </motion.div>
      </button>
      )}

      {isStaged && stagedRubric ? (
        <ObjectiveSubmissionPanel
          open={open}
          rubric={stagedRubric}
          profile={profile}
          whiteboardImages={whiteboardImages}
          whiteboardDocs={whiteboardDocs}
          whiteboardVideos={whiteboardVideos}
          whiteboardAudios={whiteboardAudios}
          onClose={() => setOpen(false)}
          onComplete={async () => {
            // Award XP via the existing engine, same as TeacherDialogue's path.
            if (objective?.xpReward) {
              try {
                await fetch("/api/xp", {
                  method:  "POST",
                  headers: { "Content-Type": "application/json" },
                  body:    JSON.stringify({
                    event_type: "objective_complete",
                    meta: { objective_id: objectiveId, lms_id: lmsId, xp: objective.xpReward },
                  }),
                });
              } catch (err) {
                console.warn("[TeacherCharacter] XP award failed:", err);
              }
            }
            onObjectiveCompleted?.(objectiveId, lmsId);
          }}
        />
      ) : (
        <TeacherDialogue
          open={open}
          rubric={rubric}
          onClose={() => setOpen(false)}
          onValidate={handleValidate}
          onComplete={handleComplete}
        />
      )}
    </>
  );
}

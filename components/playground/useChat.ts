"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import type { Profile, PlaygroundMode, OutputType } from "@/types";
import { serializeHistory } from "@/lib/serializeHistory";
import { useWhiteboardWriter } from "@/lib/chatChannels";

export interface Attachment {
  name: string; mimeType: string; data: string; size: number;
}

export interface Message {
  id:             string;
  role:           "user" | "assistant";
  content:        string;
  outputType?:    OutputType;
  attachments?:   Attachment[];
  isLoading?:     boolean;
  attachmentMeta?: string[]; // ["image","audio","pdf"] — survives DB reload
  createdAt:      Date;
}

// ─── Attachment meta encoding ─────────────────────────────────────────────────
// Appended to user message content before saving to DB so it survives reload.
// Format: "user text\n__attach:image,audio__"

const ATTACH_SEP = "\n__attach:";

function getAttachTypes(attachments: Attachment[]): string[] {
  return [...new Set(attachments.map(a =>
    a.mimeType.startsWith("image/")            ? "image"
    : a.mimeType.startsWith("audio/")          ? "audio"
    : a.mimeType.startsWith("application/pdf") ? "pdf"
    : "file"
  ))];
}

function encodeForDB(text: string, types: string[]): string {
  return types.length > 0 ? `${text}${ATTACH_SEP}${types.join(",")}__` : text;
}

function decodeFromDB(raw: string): { content: string; attachmentMeta?: string[] } {
  const idx = raw.indexOf(ATTACH_SEP);
  if (idx === -1) return { content: raw };
  const content = raw.slice(0, idx);
  const tail    = raw.slice(idx + ATTACH_SEP.length);
  const match   = tail.match(/^([^_]+)__/);
  return {
    content,
    attachmentMeta: match ? match[1].split(",") : undefined,
  };
}

export function useChat(profile: Profile | null, mode: PlaygroundMode, objectiveId: string | null = null) {
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId,   setSessionId]  = useState<string | null>(null);
  const abortRef          = useRef<AbortController | null>(null);
  const pendingSessionRef = useRef<Promise<string> | null>(null);

  // Mirror messages into the whiteboard channel so AIDA + Validator can read them.
  // Whiteboard owns this channel; nothing else writes to it.
  const wbWriter = useWhiteboardWriter();
  useEffect(() => { wbWriter.setAll(messages); }, [messages, wbWriter]);

  const createSession = useCallback(async (m: PlaygroundMode): Promise<string> => {
    if (pendingSessionRef.current) return pendingSessionRef.current;
    const promise = fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: m }),
    })
      .then(r => r.json())
      .then(({ session }) => {
        const id = session?.id as string;
        if (!id) throw new Error("Session create failed: no id returned");
        setSessionId(id);
        pendingSessionRef.current = null;
        return id;
      });
    pendingSessionRef.current = promise;
    return promise;
  }, []);

  const startSession = useCallback(async (_m: PlaygroundMode) => {
    setMessages([]);
    setSessionId(null);
    pendingSessionRef.current = null;
    return null as unknown as string;
  }, []);

  const loadSession = useCallback(async (sid: string) => {
    setSessionId(sid);
    setMessages([]);
    const res = await fetch(`/api/sessions/${sid}/messages`);
    if (!res.ok) return;
    const { messages: dbMessages } = await res.json();
    const loaded: Message[] = (dbMessages ?? []).map((m: {
      id: string; role: "user" | "assistant"; content: string;
      created_at: string; output_type?: string;
    }) => {
      const decoded = decodeFromDB(m.content);
      return {
        id:             m.id,
        role:           m.role,
        content:        decoded.content,
        createdAt:      new Date(m.created_at),
        outputType:     (m.output_type ?? "text") as OutputType,
        isLoading:      false,
        attachmentMeta: decoded.attachmentMeta,
      };
    });
    setMessages(loaded);
  }, []);

  // ─── Text / JSON streaming ────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (
      text:          string,
      outputType:    OutputType   = "text",
      attachments:   Attachment[] = [],
      forceSid?:     string,
      bubbleMeta?:   string[],
      displayPrompt?: string,       // clean text shown in bubble (no context markers)
    ) => {
      if (!profile || isStreaming) return;
      const isInit = text === "__init__";

      // Send the recent turns (last 12) and INCLUDE outputType so the API
      // route can wire image messages back as multimodal vision parts —
      // otherwise GPT loses sight of every image/audio/slide the kid has
      // already generated this session.
      const historySnapshot = messages
        .filter(m => m.content.trim() !== "" && m.content !== "__init__")
        .filter(m => !m.isLoading)
        .slice(-12)
        .map(m => ({
          role:       m.role,
          content:    m.content,
          outputType: m.outputType ?? "text",
        }));

      if (!isInit) {
        const attTypes = bubbleMeta ?? getAttachTypes(attachments);
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(), role: "user",
          // Show the clean text in the bubble; keep full text for the API call below
          content: displayPrompt ?? text,
          outputType, attachments,
          attachmentMeta: attTypes.length > 0 ? attTypes : undefined,
          createdAt: new Date(),
        }]);
      }

      setIsStreaming(true);
      const assistantId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: assistantId, role: "assistant", content: "", outputType, createdAt: new Date(),
      }]);

      let activeSid = forceSid ?? sessionId;
      if (!activeSid && !isInit) activeSid = await createSession(mode);
      else if (!activeSid && isInit) {
        setIsStreaming(false);
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: text, sessionId: activeSid, mode, outputType,
            profile: {
              display_name: profile.display_name,
              age_group:    profile.age_group,
              interests:    profile.interests,
              active_arena: profile.active_arena,
            },
            history:     historySnapshot,
            attachments: attachments.map(a => ({ data: a.data, mimeType: a.mimeType, name: a.name })),
            objectiveId,
          }),
        });

        if (!res.ok || !res.body) throw new Error("Stream failed");
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const lines = decoder.decode(value).split("\n").filter(l => l.startsWith("data: "));
          for (const line of lines) {
            const raw = line.slice(6);
            if (raw === "[DONE]") break;
            try {
              const { text: chunk } = JSON.parse(raw);
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content: m.content + chunk } : m)
              );
            } catch { /* partial */ }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, content: "Oops! Something went wrong. Try again? 🙈" }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [profile, isStreaming, sessionId, messages, mode, createSession, objectiveId]
  );

  // ─── Image generation ─────────────────────────────────────────────────────

  const sendImage = useCallback(async (prompt: string, displayPrompt?: string, bubbleMeta?: string[]) => {
    if (!profile || isStreaming) return;
    const cleanUserText = displayPrompt ?? prompt;
    const conversationHistory = serializeHistory(messages, 6);

    setMessages(prev => [...prev, {
      id: crypto.randomUUID(), role: "user", content: cleanUserText,
      outputType: "image",
      attachmentMeta: bubbleMeta && bubbleMeta.length > 0 ? bubbleMeta : undefined,
      createdAt: new Date(),
    }]);

    const asstId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: asstId, role: "assistant",
      content: "Generating your image...",
      outputType: "image", isLoading: true, createdAt: new Date(),
    }]);
    setIsStreaming(true);

    let activeSid = sessionId;
    if (!activeSid) activeSid = await createSession(mode);

    try {
      const res  = await fetch("/api/generate-image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, conversationHistory }),
      });
      const data = await res.json();

      if (data.url) {
        setMessages(prev => prev.map(m =>
          m.id === asstId ? { ...m, content: data.url, isLoading: false } : m
        ));
        fetch("/api/sessions/messages-save", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: activeSid, user_content: cleanUserText,
            assistant_content: data.url, output_type: "image",
          }),
        }).catch(() => {});
      } else {
        setMessages(prev => prev.map(m =>
          m.id === asstId
            ? { ...m, content: `Oops! ${data?.error ?? "Could not generate image"} — try a different prompt? 🙈`, isLoading: false }
            : m
        ));
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === asstId
          ? { ...m, content: "Oops! Could not generate image. Try again? 🙈", isLoading: false }
          : m
      ));
    } finally {
      setIsStreaming(false);
    }
  }, [profile, isStreaming, sessionId, mode, createSession, messages]);

  // ─── Audio generation ─────────────────────────────────────────────────────

  const sendAudio = useCallback(async (prompt: string, ageGroup: string, displayPrompt?: string, bubbleMeta?: string[]) => {
    if (!profile || isStreaming) return;
    const cleanUserText = displayPrompt ?? prompt;
    const conversationHistory = serializeHistory(messages, 6);

    setMessages(prev => [...prev, {
      id: crypto.randomUUID(), role: "user", content: cleanUserText,
      outputType: "audio",
      attachmentMeta: bubbleMeta && bubbleMeta.length > 0 ? bubbleMeta : undefined,
      createdAt: new Date(),
    }]);

    const asstId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: asstId, role: "assistant",
      content: "Writing the scene script and generating voices...",
      outputType: "audio", isLoading: true, createdAt: new Date(),
    }]);
    setIsStreaming(true);

    let activeSid = sessionId;
    if (!activeSid) activeSid = await createSession(mode);

    try {
      const res  = await fetch("/api/generate-audio", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, ageGroup, conversationHistory }),
      });
      const data = await res.json();

      if (data.url) {
        const audioPayload = JSON.stringify({ url: data.url, script: data.script });
        setMessages(prev => prev.map(m =>
          m.id === asstId ? { ...m, content: audioPayload, isLoading: false } : m
        ));
        fetch("/api/sessions/messages-save", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: activeSid, user_content: cleanUserText,
            assistant_content: audioPayload, output_type: "audio",
          }),
        }).catch(() => {});
      } else {
        setMessages(prev => prev.map(m =>
          m.id === asstId
            ? { ...m, content: `Oops! ${data?.error ?? "Could not generate audio"} — try again? 🙈`, isLoading: false }
            : m
        ));
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === asstId
          ? { ...m, content: "Oops! Could not generate audio. Try again? 🙈", isLoading: false }
          : m
      ));
    } finally {
      setIsStreaming(false);
    }
  }, [profile, isStreaming, sessionId, mode, createSession, messages]);

  // ─── Slides generation ────────────────────────────────────────────────────

  const sendSlides = useCallback(async (prompt: string, ageGroup: string, displayPrompt?: string, bubbleMeta?: string[]) => {
    if (!profile || isStreaming) return;
    const cleanUserText = displayPrompt ?? prompt;
    const conversationHistory = serializeHistory(messages, 6);

    setMessages(prev => [...prev, {
      id: crypto.randomUUID(), role: "user", content: cleanUserText,
      outputType: "slides",
      attachmentMeta: bubbleMeta && bubbleMeta.length > 0 ? bubbleMeta : undefined,
      createdAt: new Date(),
    }]);

    const asstId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: asstId, role: "assistant",
      content: "Building your slides...",
      outputType: "slides", isLoading: true, createdAt: new Date(),
    }]);
    setIsStreaming(true);

    let activeSid = sessionId;
    if (!activeSid) activeSid = await createSession(mode);

    try {
      const res  = await fetch("/api/generate-ppt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, ageGroup, conversationHistory }),
      });
      const data = await res.json();

      if (data.pptBase64) {
        const slidesPayload = JSON.stringify(data);
        setMessages(prev => prev.map(m =>
          m.id === asstId ? { ...m, content: slidesPayload, isLoading: false } : m
        ));
        fetch("/api/sessions/messages-save", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: activeSid, user_content: cleanUserText,
            assistant_content: slidesPayload, output_type: "slides",
          }),
        }).catch(() => {});
      } else {
        setMessages(prev => prev.map(m =>
          m.id === asstId
            ? { ...m, content: `Oops! ${data?.error ?? "Could not build slides"} — try again? 🙈`, isLoading: false }
            : m
        ));
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === asstId
          ? { ...m, content: "Oops! Could not build slides. Try again? 🙈", isLoading: false }
          : m
      ));
    } finally {
      setIsStreaming(false);
    }
  }, [profile, isStreaming, sessionId, mode, createSession, messages]);

  // ─── Video (async via Modal worker + polling) ────────────────────────────

  const sendVideo = useCallback(async (
    prompt: string,
    displayPrompt?: string,
    bubbleMeta?: string[],
    targetSeconds: number = 20,
  ) => {
    if (!profile || isStreaming) return;
    const cleanUserText = displayPrompt ?? prompt;

    setMessages(prev => [...prev, {
      id: crypto.randomUUID(), role: "user", content: cleanUserText,
      outputType: "video",
      attachmentMeta: bubbleMeta && bubbleMeta.length > 0 ? bubbleMeta : undefined,
      createdAt: new Date(),
    }]);

    const asstId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: asstId, role: "assistant",
      // VideoLoadingBubble component handles its own animated copy.
      // Any non-empty content keeps the bubble visible; the loader replaces it.
      content: " ",
      outputType: "video", isLoading: true, createdAt: new Date(),
    }]);
    setIsStreaming(true);

    let activeSid = sessionId;
    if (!activeSid) activeSid = await createSession(mode);

    const fail = (msg: string) => {
      setMessages(prev => prev.map(m =>
        m.id === asstId ? { ...m, content: msg, isLoading: false } : m
      ));
    };

    try {
      // 1. Submit — returns callId in <10s (Vercel-free safe).
      const submitRes = await fetch("/api/generate-video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, sessionId: activeSid, targetSeconds }),
      });
      const submit = await submitRes.json();
      if (!submitRes.ok || !submit.callId) {
        const errText = submit.quotaExceeded
          ? submit.error
          : `Oops! ${submit?.error ?? "Could not start your video"} — try again? 🎬`;
        fail(errText);
        return;
      }

      // 2. Poll Modal status every 5s, up to ~8 min, each poll <10s.
      const callId = submit.callId as string;
      const POLL_MS = 5000;
      const MAX_POLLS = 100;
      let poll = 0;
      let final: { videoUrl?: string; title?: string; durationSeconds?: number; shotCount?: number; modelUsed?: string } | null = null;

      while (poll < MAX_POLLS) {
        await new Promise(r => setTimeout(r, POLL_MS));
        poll += 1;

        let s;
        try {
          const r = await fetch(`/api/video-status?callId=${encodeURIComponent(callId)}`);
          s = await r.json();
        } catch { continue; }

        if (s.status === "failed") {
          fail(`Oops! ${s.error ?? "Video generation failed"} — try again? 🎬`);
          return;
        }
        if (s.status === "done" && s.videoUrl) {
          final = {
            videoUrl: s.videoUrl, title: s.title, durationSeconds: s.durationSeconds,
            shotCount: s.shotCount, modelUsed: s.modelUsed,
          };
          break;
        }
      }

      if (!final) {
        fail("Your video is taking longer than expected. Check 'My Creations' in a minute.");
        return;
      }

      const videoPayload = JSON.stringify(final);
      setMessages(prev => prev.map(m =>
        m.id === asstId ? { ...m, content: videoPayload, isLoading: false } : m
      ));
      fetch("/api/sessions/messages-save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: activeSid, user_content: cleanUserText,
          assistant_content: videoPayload, output_type: "video",
        }),
      }).catch(() => {});
    } catch (e) {
      fail("Oops! Could not build your video. Try again? 🎬");
    } finally {
      setIsStreaming(false);
    }
  }, [profile, isStreaming, sessionId, mode, createSession]);

  // ─── Static message ───────────────────────────────────────────────────────

  const sendStaticMessage = useCallback((
    text:       string,
    role:       "user" | "assistant" = "assistant",
    outputType: OutputType           = "text"
  ) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(), role, content: text,
      outputType, createdAt: new Date(),
    }]);
  }, []);

  // ─── Encode attachment types when saving text messages to DB ─────────────
  // This is done in chat/route.ts for text messages.
  // For sendMessage with attachments, we need to store the marker.
  // We expose encodeForDB so chat/route.ts can use it.
  // Actually we handle it fully here: after the stream completes, the chat route
  // saves the message. We patch the saved content via the route.

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(null);
    setIsStreaming(false);
    pendingSessionRef.current = null;
  }, []);

  return {
    messages, isStreaming, sessionId,
    startSession, loadSession,
    sendMessage, sendImage, sendAudio, sendSlides, sendVideo, sendStaticMessage,
    reset,
    // Expose for use in playground page
    encodeForDB, getAttachTypes,
  };
}
import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase";
import { queryContext } from "@/lib/pinecone";
import { getPageDoc } from "@/lib/aidaDocs";
import { buildAidaSystemPrompt } from "@/lib/aidaPersona";
import { OBJECTIVES, toLmsId, normalizeObjectiveId } from "@/lib/objectives";
import { getRubric, getStagedRubric } from "@/lib/objectiveRubrics";
import { moderateContent, detectDistress, buildDistressFooter, getRefusalLine } from "@/lib/aidaSafety";
import { shouldAttachWhiteboard, wrapWhiteboardTranscript } from "@/lib/aidaWhiteboardRouter";
import type { Profile, AgeGroup } from "@/types";

export const runtime     = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const body = await req.json();
    const {
      message,
      history = [],
      pathname = "/dashboard",
      playgroundSession,
      playgroundImages = [],
      interruptedContext,
      isVoiceMode = false,
      profile,
      objectiveId,
      validator_state,
      worksheet_draft,
      classroom_state,
    }: {
      message:              string;
      history:              { role: "user" | "assistant"; content: string }[];
      pathname:             string;
      playgroundSession?:   string;
      playgroundImages?:    string[];
      interruptedContext?:  string;
      isVoiceMode?:         boolean;
      profile: Profile;
      // Set by the AIDA client when the playground URL has ?objective=<id>.
      // Triggers the hint-or-answer scaffolding in the system prompt.
      objectiveId?:         string | null;
      // Validator + worksheet channel snapshots from chatChannels — small,
      // optional, attached only on graded objectives.
      validator_state?: {
        lmsId:       string | null;
        lastTier:    "distinction" | "merit" | "pass" | "fail" | null;
        lastMode:    "challenge" | "nudge" | "celebrate" | null;
        lastSummary: string | null;
        attempts:    { count: number; lastAt: string | null };
      };
      worksheet_draft?: {
        lmsId:      string;
        data:       Record<string, string | boolean>;
        updated_at: string;
      };
      // Classroom-teacher channel snapshot. AIDA can read it (one-way mirror
      // of whiteboard ↔ AIDA). Only attached when lesson_ended — see Phase 5.
      classroom_state?: {
        status:    "idle" | "in_lesson" | "lesson_ended";
        lastLesson?: {
          topic:       string;
          summary:     string;
          keyConcepts: string[];
          studentResponses: Array<{ question: string; answer: string }>;
        } | null;
      };
    } = body;

    const isObjectiveMode = !!objectiveId;

    if (!message?.trim()) return new Response("Bad request", { status: 400 });

    // ── Pre-flight safety check ──────────────────────────────────────────────
    let distressFlag = false;
    const inputVerdict = await moderateContent(message);
    if (!inputVerdict.allow) {
      const refusal = getRefusalLine(profile.age_group as AgeGroup);
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(refusal));
          controller.close();
        },
      });
      return new Response(readable, {
        headers: {
          "Content-Type":      "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "Cache-Control":     "no-cache",
        },
      });
    }
    distressFlag = detectDistress(message);

    // ── Fetch student's profile ID + learner model from Supabase ────────────
    const supabase = createAdminClient();
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id, learner_model")
      .eq("clerk_user_id", userId)
      .single();

    const profileId = profileRow?.id as string | undefined;
    const learnerModel = (profileRow?.learner_model as Record<string, unknown> | null) ?? null;

    // ── Search relevant creations from Pinecone ───────────────────────────────
    let creationsContext = "";
    if (profileId) {
      try {
        const results = await queryContext({ profileId, query: message, topK: 5 });
        if (results.length > 0) {
          creationsContext = "\n\nStudent's relevant creations:\n" +
            results.map(r =>
              `- "${r.title}" (${r.outputType})${r.tags ? ` [tags: ${r.tags}]` : ""}${r.promptUsed ? ` — made with prompt: "${r.promptUsed}"` : ""}`
            ).join("\n");
        }
      } catch {
        // Pinecone failure is non-fatal
      }
    }

    // ── Resolve the raw whiteboard transcript (live > DB fallback) ──────────
    // We always RESOLVE the transcript so the read_whiteboard tool can serve
    // it on demand. Whether we INJECT it into the system prompt up-front is
    // a separate decision (see router below).
    let rawWhiteboardTranscript = "";
    if (playgroundSession && playgroundSession.trim()) {
      rawWhiteboardTranscript = playgroundSession.trim();
    } else if (profileId) {
      try {
        const { data: session } = await supabase
          .from("sessions")
          .select("id")
          .eq("profile_id", profileId)
          .order("started_at", { ascending: false })
          .limit(1)
          .single();

        if (session?.id) {
          const { data: msgs } = await supabase
            .from("chat_messages")
            .select("role, content")
            .eq("session_id", session.id)
            .order("created_at", { ascending: false })
            .limit(6);

          if (msgs && msgs.length > 0) {
            const recent = [...msgs].reverse();
            rawWhiteboardTranscript = recent
              .map(m => `${m.role === "user" ? "Student" : "AI"}: ${String(m.content).slice(0, 300)}`)
              .join("\n");
          }
        }
      } catch {
        // Non-fatal
      }
    }

    // ── Decide whether to inject the transcript at start (router) ───────────
    // - Regex pre-filter handles obvious cases for free.
    // - LLM router (cheap gpt-4o-mini, 4-token reply) handles ambiguous cases.
    // - read_whiteboard tool below handles whatever both layers missed.
    let sessionContext = "";
    let preAttachedWhiteboard = false;
    if (rawWhiteboardTranscript) {
      const verdict = await shouldAttachWhiteboard(message);
      if (verdict === "attach") {
        sessionContext = "\n\n" + wrapWhiteboardTranscript(rawWhiteboardTranscript);
        preAttachedWhiteboard = true;
      }
    }

    // ── Build system prompt ───────────────────────────────────────────────────
    const arenaNames: Record<number, string> = {
      1: "AI Explorer Arena", 2: "Prompt Lab", 3: "Story Forge",
      4: "Visual Studio",     5: "Sound Booth", 6: "Director's Suite",
    };

    const isOnPlayground = pathname.startsWith("/dashboard/playground");

    // ── Validator + worksheet extras (always rendered when present) ────────
    const channelExtras: string[] = [];
    if (validator_state?.lmsId) {
      const v = validator_state;
      channelExtras.push(
        `[Validator Teacher last verdict — objective ${v.lmsId}]\n` +
        `tier: ${v.lastTier ?? "n/a"} | mode: ${v.lastMode ?? "n/a"} | attempts: ${v.attempts.count}\n` +
        `summary: ${v.lastSummary ?? "(none yet)"}\n` +
        `If the kid asks what the teacher meant, paraphrase the summary in your own words. Never speak as the teacher.`
      );
    }
    if (worksheet_draft?.lmsId) {
      const w = worksheet_draft;
      const compact = Object.entries(w.data)
        .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v.slice(0, 200) : v}`)
        .join("\n");
      if (compact) {
        channelExtras.push(
          `[Kid's current worksheet draft — objective ${w.lmsId}]\n${compact}\n` +
          `Read for context. Do not invent answers for them. Do not paste their draft back at them.`
        );
      }
    }

    // ── Resolve active objective + curriculum digest ────────────────────────
    // When the kid clicks into a mission, the URL carries ?objective=<id>
    // (e.g. "a1-6"). AIDA needs the full objective metadata + rubric criteria
    // injected into her system prompt, otherwise she hallucinates "I can't
    // see the current objective". Look up both the Objective record and the
    // (staged or single-pass) rubric so she can coach on tier/pass criteria.
    let activeObjective: Parameters<typeof buildAidaSystemPrompt>[0]["activeObjective"];
    if (objectiveId) {
      const normalizedObjectiveId = normalizeObjectiveId(objectiveId);
      const obj = OBJECTIVES.find(o => o.id === normalizedObjectiveId);
      const lmsId = obj ? toLmsId(obj.id) : objectiveId;
      const staged = getStagedRubric(lmsId);
      const single = !staged ? getRubric(lmsId) : null;
      activeObjective = {
        id:    objectiveId,
        lmsId,
        title: obj?.title ?? staged?.title ?? single?.title ?? objectiveId,
        description: obj?.description ?? "",
        emoji: obj?.emoji,
        tier:  single?.tier,
        tools: single?.tools,
        labTask: single?.labTask,
        passCriteria:        single?.passCriteria,
        meritCriteria:       single?.meritCriteria,
        distinctionCriteria: single?.distinctionCriteria,
      };
    }

    // Curriculum digest — short, one-line-per-objective summary so AIDA can
    // answer "what's next?" / "what's in this arena?" without hallucinating.
    // Only includes objectives at or below the student's current level (no
    // spoilers for locked arenas).
    const currentArena = profile?.active_arena ?? 1;
    const curriculumDigest = OBJECTIVES
      .filter(o => o.arenaId <= currentArena)
      .sort((a, b) => a.arenaId - b.arenaId || a.order - b.order)
      .map(o => `- ${o.id} · Arena ${o.arenaId} #${o.order} · ${o.emoji} ${o.title} (${o.outputType}, ${o.xpReward} XP)`)
      .join("\n");

    // Classroom context: only attach when lesson is ENDED (edge case 10).
    let classroomContext: string | undefined;
    if (classroom_state?.status === "lesson_ended" && classroom_state.lastLesson) {
      const l = classroom_state.lastLesson;
      const responses = l.studentResponses?.length
        ? l.studentResponses.slice(0, 6).map(r => `  Q: ${r.question}\n  A: ${r.answer}`).join("\n")
        : "  (no student responses recorded)";
      classroomContext =
        `Topic: ${l.topic}\nSummary: ${l.summary}\nKey concepts: ${(l.keyConcepts ?? []).join(", ") || "—"}\nStudent responses:\n${responses}`;
    } else if (classroom_state?.status === "in_lesson") {
      classroomContext = "[The student's classroom lesson is still in progress — full transcript unavailable. Answer their question without assuming what the teacher just covered.]";
    }

    const baseSystemPrompt = buildAidaSystemPrompt({
        profile:           profile as Profile,
        pageContext:       getPageDoc(pathname),
        sessionContext:    sessionContext || undefined,
        creationsContext:  creationsContext || undefined,
        classroomContext,
        learnerModel,
        isVoiceMode,
        interruptedContext,
        isObjectiveMode,
        activeObjective,
        curriculumDigest,
      })

    const systemPrompt = channelExtras.length > 0
      ? `${baseSystemPrompt}\n\n${channelExtras.join("\n\n")}`
      : baseSystemPrompt;

    // ── Stream response ───────────────────────────────────────────────────────
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: "text", text: message },
      ...(playgroundImages.slice(0, 4).map(url => ({
        type: "image_url" as const,
        image_url: { url, detail: "low" as const },
      }))),
    ];

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6).map(m => ({
        role:    m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role:    "user",
        content: playgroundImages.length > 0 ? userContent : message,
      },
    ];

    // ── read_whiteboard tool ────────────────────────────────────────────────
    // Always offered (even when the transcript is pre-attached) so AIDA can
    // refresh mid-reasoning if it concludes it needs the whiteboard after
    // the router said skip. The tool returns the same wrapped transcript we
    // would have injected up front. If there's no transcript (student hasn't
    // typed in the whiteboard yet) we still expose the tool so the LLM has a
    // canonical way to discover that fact.
    const tools: OpenAI.Chat.ChatCompletionTool[] = [{
      type: "function",
      function: {
        name:        "read_whiteboard",
        description: "Returns the current transcript of the student's separate whiteboard chat (the in-app creation tool they use to make images, audio, slides, stories, etc.). Call this when the student references their whiteboard work or it's needed to answer their question, AND the transcript isn't already shown in your system prompt.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    }];

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        let fullText = "";
        // Walking conversation buffer for the multi-turn (tool-call) loop.
        const convo: OpenAI.Chat.ChatCompletionMessageParam[] = [...messages];
        const MAX_TOOL_HOPS = 2;

        try {
          for (let hop = 0; hop <= MAX_TOOL_HOPS; hop++) {
            const stream = await openai.chat.completions.create({
              model:       "gpt-4o-mini",
              messages:    convo,
              stream:      true,
              temperature: 0.7,
              max_tokens:  isVoiceMode ? 300 : 800,
              tools,
              tool_choice: "auto",
            });

            // Per-stream accumulators. Tool-calls arrive in deltas.
            type ToolCallAcc = { id: string; name: string; args: string };
            const toolCallAccs: ToolCallAcc[] = [];
            let assistantText  = "";
            let finishedReason: string | null = null;

            for await (const chunk of stream) {
              const choice = chunk.choices[0];
              if (!choice) continue;

              const delta = choice.delta;

              // Stream regular content tokens to the client immediately.
              const text = delta?.content ?? "";
              if (text) {
                assistantText += text;
                fullText      += text;
                controller.enqueue(encoder.encode(text));
              }

              // Accumulate tool-call deltas (don't stream them to client).
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCallAccs[idx]) {
                    toolCallAccs[idx] = { id: tc.id ?? "", name: "", args: "" };
                  }
                  if (tc.id)               toolCallAccs[idx].id    = tc.id;
                  if (tc.function?.name)   toolCallAccs[idx].name += tc.function.name;
                  if (tc.function?.arguments) toolCallAccs[idx].args += tc.function.arguments;
                }
              }

              if (choice.finish_reason) finishedReason = choice.finish_reason;
            }

            // No tool calls → conversation done.
            if (finishedReason !== "tool_calls" || toolCallAccs.length === 0) {
              break;
            }

            // Append the assistant's tool-call turn to the conversation.
            convo.push({
              role:       "assistant",
              content:    assistantText || null,
              tool_calls: toolCallAccs.map(t => ({
                id:       t.id,
                type:     "function" as const,
                function: { name: t.name, arguments: t.args || "{}" },
              })),
            });

            // Resolve each tool call. Right now we only have read_whiteboard.
            for (const t of toolCallAccs) {
              let toolResult: string;
              if (t.name === "read_whiteboard") {
                toolResult = rawWhiteboardTranscript
                  ? wrapWhiteboardTranscript(rawWhiteboardTranscript)
                  : "(The student's whiteboard is currently empty — they haven't generated anything there yet.)";
              } else {
                toolResult = `Unknown tool: ${t.name}`;
              }
              convo.push({
                role:         "tool",
                tool_call_id: t.id,
                content:      toolResult,
              });
            }

            // On the next loop iteration we re-call the model with the tool
            // results in context; it'll continue generating the user-facing
            // reply that streams back through the same controller.
          }

          // Append distress footer if the user message triggered detection
          if (distressFlag) {
            const footer = buildDistressFooter("auto");
            controller.enqueue(encoder.encode(footer));
          }
          // Defensive post-hoc moderation on the assistant response (fire-and-forget)
          if (fullText) {
            moderateContent(fullText).then(v => {
              if (!v.allow) {
                console.warn("[aida] post-hoc moderation flagged assistant output:", v.reason);
              }
            }).catch(() => { /* logged inside moderateContent */ });
          }
          // Visibility into router/tool decisions for live debugging.
          console.log(`[AIDA] preAttached=${preAttachedWhiteboard} hops=${convo.length - messages.length}`);
        } catch (err) {
          console.error("[AIDA stream]", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type":      "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control":     "no-cache",
      },
    });
  } catch (err) {
    console.error("[AIDA]", err);
    return new Response("Internal server error", { status: 500 });
  }
}

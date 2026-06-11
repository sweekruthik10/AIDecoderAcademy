# AI Decoder Academy

A creative AI learning platform for students aged 11–16 (Gen Z / Gen Alpha). Students work through a 6-week curriculum, earning XP to unlock themed **arenas** — fully immersive animated environments where they create with AI. Everything they make is saved to a personal library, and the AI remembers past creations across sessions.

> **For deep context (architecture, every API route, every component, gotchas):** see [`CLAUDE.md`](./CLAUDE.md). This README is the one-screen overview.

---

## What's in the app

| Surface | URL | What it does |
|---|---|---|
| Playground | `/dashboard/playground` | Whiteboard chat + 4 generation outputs (text, image, audio, slides). 6 immersive arena worlds. AIDA (curious-friend) + SAGE (skeptical mentor) overlay assistants. |
| Classroom | `/dashboard/classroom` | Bhavna teacher. Chapter map → lesson + flashcards + MCQ/Written tests. Handwritten notes upload with OCR + correction overlay. |
| Profile | `/dashboard/profile` | Onboarding wizard for new students, trophy room (XP bar, level, streak, badges, leaderboard) for returning ones. |
| My Creations | `/dashboard/progress` | Saved creations grouped by type with per-type hover glow. |
| Arena rooms | `/dashboard/world/[id]` | Standalone arena experience for objective missions. |
| Public share | `/share/[token]` | Read-only public view of a shared creation, with OG preview. |

---

## Tech stack

- **Framework:** Next.js 15.2 (App Router) + TypeScript + Tailwind + Framer Motion
- **Auth:** Clerk (email + Google OAuth)
- **DB + Storage:** Supabase (PostgreSQL + public `creations-media` bucket)
- **AI — text/structure:** OpenAI `gpt-4o-mini` (SSE streaming, JSON modes)
- **AI — image:** fal.ai `flux-pro/v1.1` (text→img) + `flux-pro/v1.1/redux` (img→img modification)
- **AI — audio:** OpenAI script + AWS Polly neural TTS (multi-voice character map + SSML emotions)
- **AI — slides:** OpenAI structure + fal.ai scene images + `pptxgenjs`
- **AI — classroom OCR:** AWS Textract handwriting OCR + Google Gemini correction overlay
- **AI — AIDA voice:** ElevenLabs TTS + STT + realtime WebRTC
- **Vector memory:** Pinecone (integrated embedding, per-student namespace)

Video output is intentionally disabled — see [`CLAUDE.md`](./CLAUDE.md#common-gotchas).

---

## Quick start

### 1. Install
```bash
npm install
```

### 2. Configure `.env.local`
See [`CLAUDE.md`](./CLAUDE.md#environment-variables-envlocal) for the full list. Minimum to boot:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
FAL_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
PINECONE_API_KEY=
PINECONE_INDEX=ai-decoder-academy
GEMINI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
```

### 3. Set up the database
In the Supabase SQL editor, run in order:
1. `supabase/migrations/001_phase1_schema.sql`
2. `supabase/gamification_migration.sql`
3. `supabase/classroom_migration.sql`
4. `supabase/learner_model_migration.sql`
5. `supabase/objective_attempts_migration.sql`

Or use the all-in-one: `supabase/migrations/000_consolidated_fresh_setup.sql`.

Then create a **public** Supabase Storage bucket named `creations-media`.

### 4. Run
```bash
npm run dev
# → http://localhost:3000
```

### 5. Build
```bash
npm run build
```

---

## Project layout (high level)

```
app/                       Next.js App Router (routes + API)
  dashboard/               playground · classroom · profile · progress · world/[id]
  api/                     chat · aida · classroom · share · learner-model · xp · …
  share/[token]/           public share pages
components/
  playground/              whiteboard chat, message bubble, arena worlds, save modal
  aida/                    AIDA assistant + ElevenLabs live-voice
  classroom/               Bhavna shell, lessons, flashcards, tests, correction reports
  gamification/            XP bar, level-up, badges, streak, arena selector
  sharing/                 public share modal
  profile/                 leaderboard + stats card
lib/                       arenas, personas, objectives, rubrics, generators, learnerModel/
supabase/migrations/       SQL schema (5 migrations + a consolidated bootstrap)
public/                    static assets (arena PNGs, classroom imagery, no-video-for-you.svg)
```

Full structure with file-by-file annotations is in [`CLAUDE.md`](./CLAUDE.md#project-structure).

---

## Three-chat architecture (Playground)

| Surface | API | Persona | Voice |
|---|---|---|---|
| Whiteboard (main chat) | `/api/chat` | Creation AI, age-tier register | — |
| AIDA (overlay) | `/api/aida` | Curious Friend / older cousin | ElevenLabs Domi |
| SAGE (validator) | `/api/aida/validate` | Skeptical Mentor; never says "wrong" | ElevenLabs George |

Strict read/write boundaries — see [`CLAUDE.md`](./CLAUDE.md#three-chat-architecture-aida--sage--whiteboard).

---

## Gamification

- **6 arenas** unlocked at levels 1/2/3/4/5/6 (XP thresholds: 0 / 100 / 300 / 600 / 1000 / 1500). Each is a fully immersive canvas world.
- **XP rewards:** text 5, image 10, audio 15, slides 20, save 8, daily streak 20, objective complete = variable per mission.
- **13 badges** for first creation, output-type variety, streaks, librarian/prolific milestones, and per-arena mastery.
- **Leaderboard** scoped to grade/board, shown in the trophy room.

---

## Deployment

Built for **Vercel**. Free tier 10s function timeout is enough for chat/image; audio/slides need Pro (30–60s). See the Deployment section in [`CLAUDE.md`](./CLAUDE.md#deployment) for the full pre-deploy checklist.

---

## Status

| Phase | Status |
|---|---|
| 1 — Auth, profiles, playground, all output types, library, Pinecone | ✅ |
| 2 — Context injection, creation picker, auto-inject previous output, attachment meta | ✅ |
| 3 — XP, 6 arenas, badges, streaks, trophy room, immersive arena worlds | ✅ |
| 3.5 — AIDA/SAGE, objectives + worksheets, learner model, sharing | ✅ |
| 3.6 — Classroom (Bhavna, chapters, lessons, MCQ + written tests with OCR correction) | ✅ |
| 4 — Teacher/admin dashboard | 🔲 |
| 5 — Weekly curriculum challenges, guided prompts per week | 🔲 |
| 6 — Film assembly, parent dashboard, multi-child, time limits | 🔲 |

---

## License

Proprietary. Internal project.

# AI Decoder Academy — Claude Context File

A creative AI learning platform for students aged 11–16 (Gen Z / Gen Alpha). Students work through a 6-week curriculum, earning XP to unlock themed "arenas". Each arena is a fully immersive animated environment — a living world the student works inside while creating with AI. Everything created is saved to a personal library, and the AI remembers past creations across sessions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.2.4 — App Router |
| Language | TypeScript |
| Styling | Tailwind CSS + Framer Motion |
| Auth | Clerk `^6.0.0` (email + Google OAuth) |
| Database | Supabase (PostgreSQL + Storage) |
| AI — Chat | OpenAI `gpt-4o-mini` (SSE streaming) |
| AI — Image | fal.ai `flux-pro/v1.1` (text→img) + `flux-pro/v1.1/redux` (img→img) |
| AI — Audio | OpenAI `gpt-4o-mini` (script) + AWS Polly neural TTS |
| AI — Slides | OpenAI `gpt-4o-mini` (structure) + fal.ai (scene images) + pptxgenjs |
| Vector DB | Pinecone (integrated embedding, cosine, per-child namespace) |
| Icons | Lucide React |
| Markdown | react-markdown |
| PPTX | pptxgenjs |

---

## Environment Variables (`.env.local`)

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/auth/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/auth/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard/profile
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard/profile

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
```

---

## Project Structure

```
app/
  auth/
    sign-in/[[...sign-in]]/page.tsx
    sign-up/[[...sign-up]]/page.tsx
    sso-callback/page.tsx
  dashboard/
    layout.tsx                        — dark nav: logo + nav links + XP bar + level badge + streak
    playground/page.tsx               — main AI studio: arena world, chat, output selector, gamification
    profile/page.tsx                  — dual mode: onboarding wizard OR trophy room
    progress/page.tsx                 — My Creations: dark cards with per-type hover glow
  api/
    chat/route.ts                     — OpenAI SSE streaming + Pinecone context + attachment meta encoding
    context/route.ts                  — GET top-K relevant creations from Pinecone
    creations/route.ts                — CRUD + Pinecone upsert/delete
    generate-image/route.ts           — fal.ai (text→img or img→img via redux)
    generate-audio/route.ts           — OpenAI script + AWS Polly + modification mode
    generate-ppt/route.ts             — OpenAI structure + fal.ai images + pptxgenjs + modification mode
    sessions/route.ts                 — session CRUD (lazy creation, 10-chat sidebar limit)
    sessions/[id]/messages/route.ts   — load messages for session restore
    sessions/messages-save/route.ts   — save media messages (image/audio/slides)
    profile/route.ts                  — profile CRUD
    profile/photo/route.ts            — photo upload to Supabase Storage
    projects/route.ts                 — project folder CRUD
    xp/route.ts                       — award XP, level-up detection, badge checks, streak
    arena/route.ts                    — PATCH active_arena on profile

components/
  playground/
    useChat.ts                        — chat hook: sendMessage/Image/Audio/Slides, attachment meta encode/decode
    MessageBubble.tsx                 — arena-themed bubbles: user bubble uses arena accent gradient,
                                        AI bubble is glass, save footer uses arena accent on hover
    SaveCreationModal.tsx             — save dialog: title, project, tags, output type badge
    AudioPlayer.tsx                   — MP3 player with waveform + script toggle
    SlideCarousel.tsx                 — slide preview with nav + PPTX download
    CreationPicker.tsx                — popover to inject saved creations as context
    ArenaCanvas.tsx                   — canvas particle engine (arenas 1,3 + ambient for 2,4,5)
    CinemaWorld.tsx                   — Arena 6: full canvas cinema (screen, beam, seats, grain)
    PromptLabWorld.tsx                — Arena 2: perspective grid + data packets + scanline + code fragments
    VisualStudioWorld.tsx             — Arena 4: aurora ribbons + paint blobs + brush strokes + particles
    SoundBoothWorld.tsx               — Arena 5: EQ bars + soundwaves + freq rings + acoustic panels
    PlaygroundWorld.tsx               — CSS-layer worlds for arenas 1 & 3 (parallax, CSS animations)
    PlaygroundFlyers.tsx              — ambient animated SVG elements (rockets, particles)
  gamification/
    LevelUpModal.tsx                  — 2-step: "Level Up!" celebrate → arena unlock reveal + CTA
    ArenaSelector.tsx                 — grid of all 6 arenas (locked ones dimmed), switch modal
    XPFlash.tsx                       — "+N XP ⚡" micro-animation fixed bottom-right
    XPBar.tsx                         — animated XP progress bar (compact or full)
    CelebrationOverlay.tsx            — confetti burst on level-up
    BadgeUnlockToast.tsx              — auto-dismissing toast for badge earned
    StreakMeter.tsx                   — streak count with milestone ticks
  dashboard/
    ArenaEnvironment.tsx              — full-viewport atmospheric CSS layer + pointer parallax

lib/
  arenas.ts                           — MASTER arena config: 6 arenas, XP thresholds, badges, helpers
  useXP.ts                            — client hook: awardXP(), onLevelUp callback, onBadge callback
  prompts.ts                          — age-adaptive system prompts (4 tiers × 5 modes)
  supabase.ts                         — Supabase client helpers (browser + server + admin)
  utils.ts                            — cn(), formatDate(), truncate(), INTEREST_OPTIONS
  imageGenerator.ts                   — fal.ai flux with img2img support, intent detection (no style on logos)
  audioGenerator.ts                   — AWS Polly, character→voice map, SSML emotions, MP3 merge
  pptGenerator.ts                     — pptxgenjs slide builder
  pinecone.ts                         — upsertCreation(), deleteCreation(), queryContext()
  gameAudio.ts                        — optional Web Audio SFX for arena transitions + level-up

types/index.ts                        — all shared TypeScript types (Profile includes gamification fields)
supabase/migrations/001_phase1_schema.sql
supabase/gamification_migration.sql   — run this second in Supabase SQL editor
```

---

## Database Schema

```sql
profiles      — id, clerk_user_id, display_name, avatar_emoji, avatar_url, age_group, interests,
                xp, level, active_arena, streak_days, last_active_date, badges (jsonb)
sessions      — id, profile_id, mode, title, message_count, started_at, ended_at
chat_messages — id, session_id, profile_id, role, content, output_type, created_at
creations     — id, profile_id, project_id, title, type, output_type, content,
                prompt_used, file_url, tags, is_favourite, session_id
projects      — id, profile_id, name, creation_count
xp_events     — id, profile_id, event_type, xp_earned, meta (jsonb), created_at
```

**Run order:** `001_phase1_schema.sql` first, then `gamification_migration.sql`.  
**Supabase Storage bucket:** `creations-media` (public) — images, audio MP3s, profile avatars.

---

## Gamification System

### XP Rewards
| Action | XP |
|---|---|
| Generate text | 5 |
| Generate image | 10 |
| Generate audio | 15 |
| Generate slides | 20 |
| Save creation | 8 |
| Daily streak | 20 |

### Level → Arena Mapping
| Level | XP | Arena | Accent | Canvas World |
|---|---|---|---|---|
| 1 | 0 | AI Explorer Arena | `#7C3AED` purple | `PlaygroundWorld` + `ArenaCanvas` (star field + shooting stars) |
| 2 | 100 | Prompt Lab | `#00D4FF` cyan | `PromptLabWorld` (perspective grid + data packets) |
| 3 | 300 | Story Forge | `#FF6B2B` orange | `PlaygroundWorld` + `ArenaCanvas` (ember particles + gold motes) |
| 4 | 600 | Visual Studio | `#00FF94` green | `VisualStudioWorld` (aurora + paint blobs + brush strokes) |
| 5 | 1000 | Sound Booth | `#FF2D78` pink | `SoundBoothWorld` (EQ bars + soundwaves + freq rings) |
| 6 | 1500 | Director's Suite | `#C8FF00` volt | `CinemaWorld` (screen, projector beam, seats, film grain) |

### Badges (13 total)
`first_creation`, `image_maker`, `voice_actor`, `slide_master`, `streak_3`, `streak_7`, `librarian` (10 saves), `prolific` (25 saves), `all_tools`, `prompt_lab`, `story_forge`, `visual_studio`, `sound_booth`, `directors_suite`

---

## Arena World Architecture

Each arena renders as a fully immersive animated environment behind the chat interface. Built as self-contained canvas components — no CSS layer dependencies.

### Canvas worlds (self-contained)
- **`CinemaWorld`** (arena 6): draws everything itself — background, screen glow, projector booth window, 3-layer beam cone, audience silhouettes (two rows, velvet red seats), wall sconces, aisle guide lights, EXIT signs, film grain, vignette
- **`PromptLabWorld`** (arena 2): perspective vanishing-point grid with scroll animation, data packets travelling along lanes, bidirectional scanline, circuit traces with node pulses, floating monospace code fragments
- **`VisualStudioWorld`** (arena 4): artist canvas grid, 4 undulating aurora ribbon waves, drifting paint blobs with wobble physics, static brush stroke ellipses, rising paint particles, spectrum band at bottom
- **`SoundBoothWorld`** (arena 5): 48 live EQ bars with spring physics, 9 multi-harmonic soundwave lines, expanding frequency rings, acoustic panel side walls, microphone silhouette, stage monitor glow

### CSS + canvas hybrid (arenas 1 & 3)
- `PlaygroundWorld` — CSS parallax layers (base, planet, stars, nebula, embers, etc.)
- `ArenaCanvas` — canvas particle layer on top (stars + shooting stars for arena 1, embers + gold motes for arena 3, ambient accent particles for others)

### Arena switching
- `PATCH /api/arena` updates `profiles.active_arena`
- `ArenaSelector` modal shows all 6, locked ones dimmed
- `LevelUpModal` fires on XP level-up: 2s celebration → arena reveal with "Enter Arena" CTA
- Playground page renders the correct world component based on `activeArenaId`

---

## MessageBubble — Arena Theme Integration

`MessageBubble` accepts `arenaAccent`, `arenaAccentGlow`, `arenaId` props from the playground page.

- **User bubble**: `linear-gradient(135deg, arenaAccent, arenaAccent+cc)` background — changes colour per arena
- **Text colour**: dark `#08080F` for bright arenas (cyan/2, green/4, volt/6), white for dark arenas (purple/1, orange/3, pink/5)
- **User avatar**: border and background tinted with arena accent
- **AI bubble**: always neutral glass (`bg-white/[0.05] border border-white/[0.09]`)
- **Inline code**: arena accent colour
- **Save button hover**: fills with arena accent
- **Loading bar**: arena-matched colour key
- **Image glow**: `box-shadow` in arena accent glow colour

---

## Key Architecture

### Output Type Routing
```
User sends message
  ├── outputType === "image"  → sendImage()  → /api/generate-image → fal.ai
  ├── outputType === "audio"  → sendAudio()  → /api/generate-audio → OpenAI + Polly
  ├── outputType === "slides" → sendSlides() → /api/generate-ppt   → OpenAI + fal.ai + pptxgenjs
  └── default (text/json)    → sendMessage() → /api/chat          → OpenAI SSE stream
```

### Creation Context Injection
Students click `+` → `CreationPicker` → injects saved creation as context:
- Output type auto-switches to match the injected creation type
- `buildCreationContext()` formats as `[Image titled "X": url]`, `[Audio titled "X": Narrator: ...]` etc.
- Enriched prompt goes to API; student sees only their original text in the bubble
- `bubbleMeta` shows creation titles as chips on the user's message

### Auto-Inject Previous Output
When `outputType === "image"/"audio"/"slides"` and no manual creation injected, `buildPreviousOutputContext()` auto-injects the last assistant message of that type — enabling "make it darker" without manual selection.

### Modification Mode
All three generation routes detect existing content in context and switch mode:
- **Image**: detects `[Image titled "...": https://...]` → passes as `image_url` to `fal-ai/flux-pro/v1.1/redux` with `strength: 0.8`
- **Audio**: detects `[Audio titled "...": Narrator: ...]` → sends existing script JSON to GPT with modification instructions, `requestsSingleCharacter()` overrides multi-char detection
- **Slides**: detects `[Slides titled "...": sections]` → targeted modification preserving structure

### Attachment Meta
User messages with file attachments encode types as `"\n__attach:image,audio__"` suffix before DB save. `decodeFromDB()` strips it on reload and sets `attachmentMeta` on the Message — rendered as small icon badges inside the user bubble. File input accepts `image/*,.pdf,audio/*`.

### Sessions
- Lazy DB creation (only on first real message)
- `message_count = 0` filtered from sidebar
- Grouped Today/Yesterday/Earlier
- `__init__` is static welcome text — zero API calls

---

## Three-Chat Architecture (AIDA · SAGE · Whiteboard)

Three independent chat surfaces share a single React context (`lib/chatChannels.tsx`) that publishes three read-only snapshots: `whiteboard.messages`, `validator` (last verdict), `worksheet` (current draft). Each chat owns its own route + persona and only reads what it's allowed to.

```
┌──────────────────────────────────────────────────────────────────────┐
│                       chatChannels Provider                          │
│   ┌──────────────┐   ┌──────────────┐   ┌─────────────────────┐      │
│   │ whiteboard   │   │ validator    │   │ worksheet           │      │
│   │ snapshot     │   │ last verdict │   │ current draft       │      │
│   └──────┬───────┘   └──────┬───────┘   └──────────┬──────────┘      │
└──────────┼──────────────────┼─────────────────────┼──────────────────┘
           │                  │                     │
   writes ▼ reads ◄──┐  writes ▼               reads ▼
┌─────────────────┐  │  ┌─────────────────┐    ┌─────────────────┐
│ WHITEBOARD chat │  │  │ VALIDATOR (SAGE)│    │ WorksheetPopup  │
│ useChat.ts      │  │  │ TeacherCharacter│    │  + WorksheetIcon│
│ /api/chat       │  │  │ /api/aida/      │    │                 │
│                 │  │  │  validate       │    │                 │
└─────────────────┘  │  └────────┬────────┘    └────────┬────────┘
                     │           │                       │
                     │           │ reads ◄───────────────┘
                     │           ▼
                     │   ┌────────────────────────────────────────┐
                     │   │ AIDA assistant                          │
                     └───┤ AidaAssistant.tsx                       │
                         │ /api/aida                               │
                         │ reads: whiteboard + validator + worksh. │
                         │        + active objective + curriculum  │
                         └─────────────────────────────────────────┘
```

### What each chat sees (system-prompt level)

| Surface | API | Sees | Persona | Voice (TTS) |
|---|---|---|---|---|
| **Whiteboard** | `/api/chat` | profile, own history, attachments | `playgroundPersona.ts` — creation AI, age-tier register | n/a (text-only output for chat; image/audio/slides go to their own routes) |
| **AIDA** | `/api/aida` | whiteboard transcript (via router) · validator state · worksheet draft · **active objective metadata** · **curriculum digest** · creations (Pinecone) · page doc | `aidaPersona.ts` — Curious Friend / older cousin | ElevenLabs **Domi (supportive)** |
| **SAGE** (validator) | `/api/aida/validate` | whiteboard messages[] only · rubric · attempt count | `teacherPersona.ts` — Skeptical Mentor; never says "wrong"; no emoji | ElevenLabs **George (supportive)** |

### Boundary rules — must not break

1. **Whiteboard chat sees no other chats.** Don't feed AIDA replies or validator verdicts into `/api/chat` history.
2. **AIDA never writes** to whiteboard or validator channels — read-only.
3. **Validator only sees whiteboard messages** — never AIDA chat, never worksheet draft. If you need to add context, add a new channel; don't leak across.
4. **Worksheet** is owned by `WorksheetPopup` (writer) → `useWorksheetReader` (AIDA reads). SAGE never reads it; SAGE works off the rendered whiteboard images.

### AIDA's objective awareness (Nov 2026)

When the playground URL has `?objective=<id>`, `app/api/aida/route.ts` looks up the objective from `lib/objectives.ts` + rubric from `lib/objectiveRubrics.ts` and passes them as `activeObjective` into `buildAidaSystemPrompt`. AIDA's prompt then includes the title, lab task, tier, tools, and pass/merit/distinction criteria — so she can answer "what am I doing?" / "what does the teacher want?" / "how do I hit merit?" without hallucinating.

She also receives a `curriculumDigest` — a one-line-per-objective summary of every mission in arenas at-or-below the student's current level (no spoilers for locked arenas) — so she can answer "what's next?" / "what's in this arena?".

### Cross-component visibility events

Three window `CustomEvent`s coordinate which floating sprites/panels are visible:

| Event | Fired by | Listened by | Effect |
|---|---|---|---|
| `validator-panel-open` / `-close` | `TeacherCharacter.tsx` useEffect on `open` | `AidaAssistant.tsx`, `WorksheetIcon.tsx` | Hides AIDA + worksheet sprite while SAGE panel is up |
| `worksheet-popup-open` / `-close` | `WorksheetPopup.tsx` useEffect on `open` | `AidaAssistant.tsx`, `WorksheetIcon.tsx` | Hides AIDA + worksheet sprite while worksheet modal is up |

Use this same pattern if you add a future overlay that should hide the floating characters.

### Metallic-cyan theme (Nov 2026)

AIDA chat panel, SAGE panel, and the Upload Files modal share a **steel-and-cyan metallic** signature, independent of arena accent:

- 5-stop vertical gradient: top-rim chrome highlight → steel → deep middle → steel → bottom rim
- `inset 0 1px 0 rgba(255,255,255,0.22)` on top edge for polished-metal look
- Twin cyan glow: tight `0 0 24px rgba(0,212,255,0.45)` + wide `0 0 72px rgba(0,212,255,0.22)`
- Active accents use sky→cyan→deep-cyan vertical gradient `#7DD3FC → #00D4FF → #0284C7` with dark-blue text (`#031024`) for readability
- Typography: `JetBrains Mono` uppercase for eyebrow/tag labels, `Syne` for display titles, `DM Sans` for body

---

## Design System

### Colour Tokens
```
--background:  #08080F   near-black base
--surface-1:   #0F0F1A   nav, sidebar
--surface-2:   #161625   cards, dropdowns
--surface-3:   #1E1E30   inputs
--border:      rgba(255,255,255,0.08)
```

### Arena Accents (applied dynamically)
Each arena drives: nav active link, sidebar active item, New Chat button, send button, output pills, user bubble gradient, avatar border, save button, XP bar, arena switcher chip.

### Typography
- Display: `Syne` weight 800–900
- Body: `DM Sans` weight 400–600
- Mono: `JetBrains Mono`

### Layout
- All dashboard pages: `height: calc(100vh - 57px)` (nav is 57px)
- Sidebar: `w-56 bg-[#0F0F1A]`
- Glass cards: `bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl`
- Button easing: `cubic-bezier(0.16,1,0.3,1)`

### My Creations — Per-type Card Glow
- Image → cyan `rgba(0,212,255,0.28)` shadow on hover
- Audio → pink `rgba(255,45,120,0.22)` shadow on hover
- Slides → purple `rgba(124,58,237,0.28)` shadow on hover
- Text → muted purple shadow on hover

---

## Profile Page — Dual Mode

1. **Onboarding** (`OnboardingFlow`) — incomplete profile → 2-step wizard (photo + board/grade/interests) → redirects to playground
2. **Trophy Room** (`TrophyRoom`) — returning student → hero card (XP bar, level, streak), stats row, 6-arena panel, XP journey bar chart, 13-badge grid, interests tags. Arena-aware: background glow + accent colours adapt to active arena.

---

## Navigation Bar

`app/dashboard/layout.tsx` — fetches profile on mount, shows:
- Logo: "AI" + "Decoder" in arena accent
- Nav links: active uses arena accent background + glow
- Right: level badge (`emoji + Lv N`), XP progress bar, streak fire + count
- All fully arena-reactive

---

## Deployment

**Recommended: Vercel**
- Zero-config for Next.js
- Free tier: 100GB bandwidth, serverless functions
- ⚠️ 10s timeout on free tier — audio/slides routes take 30-60s → upgrade to Pro ($20/mo) or restructure as streaming

**Pre-deploy checklist:**
1. `npm run build` locally — catches TypeScript errors
2. `.env.local` in `.gitignore`
3. `next.config.mjs` has `remotePatterns` for `**.supabase.co`, `img.clerk.com`, `**.fal.media`
4. Both Supabase migration SQLs run
5. Pinecone index created
6. Clerk allowed origins updated with Vercel URL
7. Supabase CORS updated with Vercel URL

---

## Phases

| Phase | Status | Summary |
|---|---|---|
| 1 | ✅ | Auth, profiles, AI playground, all 5 output types, My Creations, projects, sessions, Pinecone |
| 2 | ✅ | Context injection, creation picker, auto-inject previous output, modification mode, attachment meta badges |
| 3 | ✅ | XP engine, 6 arenas, badges, streaks, gamification UI, arena skin throughout, trophy room profile, 6 immersive canvas arena worlds, arena-themed MessageBubble |
| 4 | 🔲 | Teacher/admin dashboard — view all students' levels, XP, creations, streak, last active |
| 5 | 🔲 | Weekly curriculum challenges per arena, guided prompts per week |
| 6 | 🔲 | Film assembly (Week 6 Director's Suite), parent dashboard, multi-child, time limits |

---

## Common Gotchas

- **fal.ai img2img**: use `fal-ai/flux-pro/v1.1/redux` — standard endpoint ignores `image_url`
- **`welcomeMsg` is a function**: cannot JSON-serialize. XP route returns `unlocked_arena_id` (int only); `LevelUpModal` looks up full arena client-side from `lib/arenas.ts`
- **Arena canvas worlds**: arenas 2, 4, 5, 6 use self-contained canvas components (`PromptLabWorld`, `VisualStudioWorld`, `SoundBoothWorld`, `CinemaWorld`). Arenas 1 & 3 use `PlaygroundWorld` (CSS) + `ArenaCanvas` (canvas particles). The playground page switches between them via `activeArenaId` conditionals.
- **Canvas performance**: all worlds run at ~30fps via RAF throttle, pause on `visibilitychange`, respect `prefers-reduced-motion` (20% particles)
- **MessageBubble arena props**: `arenaAccent`, `arenaAccentGlow`, `arenaId` must be passed from playground page. Dark-text arenas (2 cyan, 4 green, 6 volt) use `#08080F` text on user bubble; others use white.
- **Pinecone SDK**: use `as any` on `.upsertRecords()` / `.searchRecordsByText()` — SDK lags behind integrated embedding API
- **Supabase Storage**: must be set to **public** for image/audio URLs to work
- **`next.config.mjs`**: needs `remotePatterns` for `**.supabase.co`, `img.clerk.com`, `**.fal.media`, `fal.media`
- **Dashboard height**: all pages use `style={{ height: "calc(100vh - 57px)" }}`
- **pptxgenjs**: `pptx.write("nodebuffer" as "nodebuffer")` or cast via `as any`
- **AWS Polly voices**: Gregory (narrator), Ivy (Maya), Kevin (Leo/Joey), Matthew (Mr Chen)
- **`overflow-hidden` on parent clips dropdowns** — remove from card wrappers when menus need to escape
- **`active_arena`** defaults to `1` if null — always use `profile.active_arena ?? 1`
- **XP events are non-blocking** — call `awardXP().then(...)` never `await awardXP()` before response
- **Vercel timeout**: free tier = 10s. Audio/slides need 30-60s. Use Pro or restructure as streaming routes.
- **Regex `/s` flag**: not supported in all Node environments — use `indexOf` to slice the target string before running regex on it
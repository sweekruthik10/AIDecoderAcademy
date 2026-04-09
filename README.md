# 🧠 AI Decoder Academy — Phase 1

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.local.example .env.local
```
Then fill in `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY`.

> All other keys (Clerk + Supabase URL + anon key) are already pre-filled in `.env.local.example`.

**Where to get the missing keys:**
- `SUPABASE_SERVICE_ROLE_KEY` → Supabase dashboard → Project Settings → API → `service_role`
- `GEMINI_API_KEY` → https://aistudio.google.com/app/apikey (free)

### 3. Set up Supabase database
1. Go to your Supabase project → **SQL Editor**
2. Paste and run everything in `supabase/migrations/001_phase1_schema.sql`
   (the `increment_message_count` function is included at the bottom)

### 4. Run
```bash
npm run dev
# → http://localhost:3000
```

---

## Project Structure

```
ai-decoder-academy/
├── app/                          ← ALL Next.js routes live here
│   ├── layout.tsx                ← root layout (Clerk + fonts)
│   ├── globals.css
│   ├── page.tsx                  ← landing page (/)
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx            ← sidebar nav
│   │   ├── playground/page.tsx   ← main AI chat
│   │   ├── profile/page.tsx      ← onboarding wizard
│   │   └── progress/page.tsx     ← creations portfolio
│   └── api/
│       ├── chat/route.ts         ← Gemini streaming
│       ├── profile/route.ts
│       ├── creations/route.ts
│       └── sessions/route.ts
├── components/playground/
│   ├── useChat.ts
│   ├── MessageBubble.tsx
│   └── SaveCreationModal.tsx
├── lib/
│   ├── prompts.ts                ← age-adaptive system prompts
│   ├── supabase.ts
│   └── utils.ts
├── types/index.ts
├── middleware.ts                 ← Clerk route protection
└── supabase/migrations/
    └── 001_phase1_schema.sql
```

---

## User Flow

```
/ → /sign-up → /dashboard/profile (wizard) → /dashboard/playground → /dashboard/progress
```

## Playground Modes

| Mode | Description |
|------|-------------|
| 📖 Story Builder | AI guides child to write stories |
| 💻 Code Lab | Teaches coding by building things |
| 🎨 Art Studio | Helps plan and describe visual art |
| 🧠 Quiz Zone | Adaptive multiple-choice quizzes |
| 🚀 Free Explore | Open-ended learning companion |

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15.2.4 |
| Auth | Clerk |
| Database + Storage | Supabase |
| AI | Gemini 2.5 Flash (`@google/genai`) |
| Styling | Tailwind CSS + Framer Motion |
# AIDecoderAcademy

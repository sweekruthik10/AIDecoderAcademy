-- Classroom feature: chapters, question papers, student attempts
-- Run this after gamification_migration.sql

-- ── chapters ─────────────────────────────────────────────────────────────────
-- Admin-seeded rows; one row per chapter. Not student-owned.
create table if not exists public.chapters (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null,
  chapter_number  int  not null,
  chapter_title   text not null,
  grade           int  not null default 10,
  board           text not null default 'CBSE',
  content_text    text not null,
  file_url        text,
  created_at      timestamptz not null default now(),
  unique (board, grade, subject, chapter_number)
);

create index if not exists chapters_subject_idx on public.chapters (subject, grade, board);

-- Anyone authenticated can read chapters; only service-role can write.
alter table public.chapters enable row level security;

create policy "chapters_select_authenticated"
  on public.chapters for select
  using (auth.uid() is not null);

-- ── question_papers ───────────────────────────────────────────────────────────
-- Generated once per (chapter × type), cached forever.
-- questions JSONB shape: array of 40 MCQ objects each with:
--   { id, difficulty, marks, question, options[4], correct_index, explanation }
create table if not exists public.question_papers (
  id          uuid primary key default gen_random_uuid(),
  chapter_id  uuid not null references public.chapters(id) on delete cascade,
  type        text not null check (type in ('mcq', 'written')),
  questions   jsonb not null,
  total_marks int  not null,
  created_at  timestamptz not null default now(),
  unique (chapter_id, type)
);

create index if not exists question_papers_chapter_idx on public.question_papers (chapter_id);

alter table public.question_papers enable row level security;

create policy "question_papers_select_authenticated"
  on public.question_papers for select
  using (auth.uid() is not null);

-- ── student_attempts ──────────────────────────────────────────────────────────
-- One row per test attempt.
-- question_ids: string[] — the subset of question IDs served to this student
-- answers:      { [qId]: number } — zero-based option index chosen
-- feedback:     { [qId]: { correct, correct_index, explanation } }
create table if not exists public.student_attempts (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  question_paper_id uuid not null references public.question_papers(id) on delete cascade,
  question_ids      text[] not null,
  answers           jsonb  not null default '{}'::jsonb,
  score             int,
  max_score         int,
  feedback          jsonb,
  time_taken_secs   int,
  submitted_at      timestamptz not null default now()
);

create index if not exists student_attempts_profile_idx  on public.student_attempts (profile_id);
create index if not exists student_attempts_paper_idx    on public.student_attempts (question_paper_id);
create index if not exists student_attempts_submitted_idx on public.student_attempts (profile_id, submitted_at desc);

alter table public.student_attempts enable row level security;

create policy "student_attempts_select_own"
  on public.student_attempts for select
  using (profile_id in (
    select id from public.profiles where clerk_user_id = auth.jwt() ->> 'sub'
  ));

create policy "student_attempts_insert_own"
  on public.student_attempts for insert
  with check (profile_id in (
    select id from public.profiles where clerk_user_id = auth.jwt() ->> 'sub'
  ));

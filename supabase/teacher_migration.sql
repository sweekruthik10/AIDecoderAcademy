-- ══════════════════════════════════════════════════════════════════════
--  Teacher Dashboard — Migration
--  Run this in the Supabase SQL editor after all other migrations.
-- ══════════════════════════════════════════════════════════════════════

-- ── teacher_profiles ──────────────────────────────────────────────────
-- One row per teacher account. Any authenticated user who completes
-- the teacher onboarding flow gets a row here.
-- The teacher sees ALL student profiles — no class enrollment needed.

create table if not exists public.teacher_profiles (
  id            uuid        primary key default gen_random_uuid(),
  clerk_user_id text        not null unique,
  display_name  text        not null,
  email         text,
  created_at    timestamptz not null default now()
);

alter table public.teacher_profiles enable row level security;

-- Service role (used by the app) bypasses RLS automatically.
-- Open policy lets teacher API routes read/write freely.
create policy "teacher_profiles_all"
  on public.teacher_profiles for all
  using (true);

-- Index for fast clerk_user_id lookups
create index if not exists teacher_profiles_clerk_idx
  on public.teacher_profiles (clerk_user_id);

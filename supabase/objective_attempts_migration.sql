-- Validator Teacher — objective attempt log.
-- Every "Validate my work" click writes a row here. When a student then
-- clicks "Mark Complete" on a passing attempt, completed_at is set on that
-- row (and XP is awarded by the API route, not by this migration).

create table if not exists public.objective_attempts (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  objective_id    text not null,             -- legacy id from lib/objectives.ts (e.g. 'a1-3')
  lms_id          text not null,             -- canonical curriculum id (e.g. 'l1-03')
  score           int  not null check (score between 0 and 100),
  tier            text not null check (tier in ('distinction','merit','pass','fail')),
  passed          boolean not null,
  feedback        jsonb not null,            -- { summary, strengths, improvements, hintForRetry }
  attempt_number  int  not null default 1,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz                -- set when student clicks "Mark Complete"
);

create index if not exists objective_attempts_profile_idx
  on public.objective_attempts (profile_id, lms_id);

create index if not exists objective_attempts_completed_idx
  on public.objective_attempts (profile_id)
  where completed_at is not null;

-- RLS — students can read/write only their own rows.
alter table public.objective_attempts enable row level security;

create policy "objective_attempts_select_own"
  on public.objective_attempts for select
  using (
    profile_id in (
      select id from public.profiles where clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

create policy "objective_attempts_insert_own"
  on public.objective_attempts for insert
  with check (
    profile_id in (
      select id from public.profiles where clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

create policy "objective_attempts_update_own"
  on public.objective_attempts for update
  using (
    profile_id in (
      select id from public.profiles where clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

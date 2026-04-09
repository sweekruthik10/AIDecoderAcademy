-- ══════════════════════════════════════════════════════════════════════
--  AI Decoder Academy — Consolidated Fresh Setup
--  Run this ONCE in the Supabase SQL Editor on a brand-new project.
--  Covers all phases: base schema, gamification, personalisation, sharing,
--  projects, child_profiles, and objective_attempts.
-- ══════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Helper: auto-update updated_at ────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
--  TABLES (in dependency order)
-- ══════════════════════════════════════════════════════════════════════

-- ── profiles ──────────────────────────────────────────────────────────
create table if not exists profiles (
  id                    uuid        primary key default uuid_generate_v4(),
  clerk_user_id         text        not null unique,
  display_name          text        not null,
  avatar_emoji          text        not null default '🚀',
  avatar_url            text,
  age_group             text        not null check (age_group in ('5-7','8-10','11-13','14+')),
  interests             text[]      default '{}',

  -- gamification
  xp                    integer     not null default 0,
  level                 integer     not null default 1,
  active_arena          integer     not null default 1,
  streak_days           integer     not null default 0,
  last_active_date      date,
  badges                jsonb       not null default '[]'::jsonb,

  -- personalisation
  reading_level         text        check (reading_level is null or reading_level in ('below_grade','at_grade','above_grade')),
  language_preference   text        check (language_preference is null or language_preference in ('en','hi','en_with_hi_terms')),
  learning_style        text        check (learning_style is null or learning_style in ('visual','hands_on','story','facts_and_logic')),
  difficulty_preference text        check (difficulty_preference is null or difficulty_preference in ('challenge_me','explain_gently','let_me_pick')),
  current_grade         smallint    check (current_grade is null or (current_grade >= 1 and current_grade <= 12)),

  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create trigger trg_profiles_updated
  before update on profiles
  for each row execute function set_updated_at();

-- ── projects ──────────────────────────────────────────────────────────
create table if not exists projects (
  id         uuid        primary key default uuid_generate_v4(),
  profile_id uuid        not null references profiles(id) on delete cascade,
  name       text        not null,
  created_at timestamptz default now()
);

-- ── sessions ──────────────────────────────────────────────────────────
create table if not exists sessions (
  id            uuid        primary key default uuid_generate_v4(),
  profile_id    uuid        not null references profiles(id) on delete cascade,
  mode          text        not null check (mode in ('story','code','art','quiz','free')),
  title         text,
  summary       text,
  message_count integer     default 0,
  started_at    timestamptz default now(),
  ended_at      timestamptz
);

-- ── creations ─────────────────────────────────────────────────────────
create table if not exists creations (
  id          uuid        primary key default uuid_generate_v4(),
  profile_id  uuid        not null references profiles(id) on delete cascade,
  project_id  uuid        references projects(id) on delete set null,
  session_id  uuid,
  title       text        not null default 'Untitled',
  type        text        not null check (type in ('story','code','art','quiz','chat','mixed')),
  output_type text        not null default 'text' check (output_type in ('text','json','image','audio','slides','video')),
  content     text        not null,
  prompt_used text,
  file_url    text,
  tags        text[]      default '{}',
  is_favourite boolean    default false,
  is_public   boolean     not null default false,
  share_token text        unique,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create trigger trg_creations_updated
  before update on creations
  for each row execute function set_updated_at();

-- ── chat_messages ─────────────────────────────────────────────────────
create table if not exists chat_messages (
  id          uuid        primary key default uuid_generate_v4(),
  session_id  uuid        not null references sessions(id) on delete cascade,
  profile_id  uuid        not null references profiles(id) on delete cascade,
  role        text        not null check (role in ('user','assistant')),
  content     text        not null,
  output_type text        not null default 'text',
  created_at  timestamptz default now()
);

-- ── xp_events ─────────────────────────────────────────────────────────
create table if not exists xp_events (
  id         uuid        primary key default uuid_generate_v4(),
  profile_id uuid        not null references profiles(id) on delete cascade,
  event_type text        not null,
  xp_earned  integer     not null,
  meta       jsonb,
  created_at timestamptz default now()
);

-- ── child_profiles ────────────────────────────────────────────────────
create table if not exists child_profiles (
  id           uuid        primary key default uuid_generate_v4(),
  parent_id    uuid        references profiles(id) on delete cascade,
  display_name text        not null,
  avatar_emoji text        not null default '🌟',
  age_group    text        not null check (age_group in ('5-7','8-10','11-13','14+')),
  pin          text,
  created_at   timestamptz default now()
);

-- ── objective_attempts ────────────────────────────────────────────────
create table if not exists objective_attempts (
  id             uuid        primary key default gen_random_uuid(),
  profile_id     uuid        not null references profiles(id) on delete cascade,
  objective_id   text        not null,
  lms_id         text        not null,
  score          integer     not null check (score between 0 and 100),
  tier           text        not null check (tier in ('distinction','merit','pass','fail')),
  passed         boolean     not null,
  feedback       jsonb       not null,
  attempt_number integer     not null default 1,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

-- ══════════════════════════════════════════════════════════════════════
--  INDEXES
-- ══════════════════════════════════════════════════════════════════════

create index if not exists idx_creations_profile      on creations(profile_id);
create index if not exists idx_creations_created      on creations(created_at desc);
create index if not exists idx_creations_share_token  on creations(share_token) where share_token is not null;
create index if not exists idx_messages_session       on chat_messages(session_id);
create index if not exists idx_sessions_profile       on sessions(profile_id);
create index if not exists idx_xp_events_profile      on xp_events(profile_id);
create index if not exists idx_projects_profile       on projects(profile_id);
create index if not exists idx_child_profiles_parent  on child_profiles(parent_id);
create index if not exists idx_obj_attempts_profile   on objective_attempts(profile_id, lms_id);
create index if not exists idx_obj_attempts_completed on objective_attempts(profile_id) where completed_at is not null;

-- ══════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════

alter table profiles          enable row level security;
alter table projects          enable row level security;
alter table sessions          enable row level security;
alter table creations         enable row level security;
alter table chat_messages     enable row level security;
alter table xp_events         enable row level security;
alter table child_profiles    enable row level security;
alter table objective_attempts enable row level security;

-- Service role bypasses RLS automatically.
-- These open policies let the app (using service role key) read/write freely.
create policy "profiles_all"      on profiles          for all using (true);
create policy "projects_all"      on projects          for all using (true);
create policy "sessions_all"      on sessions          for all using (true);
create policy "creations_all"     on creations         for all using (true);
create policy "messages_all"      on chat_messages     for all using (true);
create policy "xp_events_all"     on xp_events         for all using (true);
create policy "child_profiles_all" on child_profiles   for all using (true);

-- objective_attempts uses stricter per-user policies
create policy "objective_attempts_select_own"
  on objective_attempts for select
  using (
    profile_id in (
      select id from profiles where clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

create policy "objective_attempts_insert_own"
  on objective_attempts for insert
  with check (
    profile_id in (
      select id from profiles where clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

create policy "objective_attempts_update_own"
  on objective_attempts for update
  using (
    profile_id in (
      select id from profiles where clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

-- ══════════════════════════════════════════════════════════════════════
--  HELPER FUNCTIONS
-- ══════════════════════════════════════════════════════════════════════

create or replace function increment_message_count(sid uuid)
returns void language sql as $$
  update sessions set message_count = message_count + 1 where id = sid;
$$;

-- ══════════════════════════════════════════════════════════════════════
--  STORAGE
-- ══════════════════════════════════════════════════════════════════════

-- -- Create the public media bucket.
-- -- Run this separately in the Supabase Storage UI if it fails here,
-- -- as storage API access depends on your Supabase plan.
-- insert into storage.buckets (id, name, public)
-- values ('creations-media', 'creations-media', true)
-- on conflict (id) do nothing;

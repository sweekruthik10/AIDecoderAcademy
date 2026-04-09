-- ══════════════════════════════════════════════════
--  AI Decoder Academy — Phase 1 Schema
-- ══════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- profiles
create table if not exists profiles (
  id            uuid primary key default uuid_generate_v4(),
  clerk_user_id text not null unique,
  display_name  text not null,
  avatar_emoji  text not null default '🚀',
  age_group     text not null check (age_group in ('5-7','8-10','11-13','14+')),
  interests     text[] default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- creations
create table if not exists creations (
  id           uuid primary key default uuid_generate_v4(),
  profile_id   uuid references profiles(id) on delete cascade not null,
  title        text not null default 'Untitled',
  type         text not null check (type in ('story','code','art','quiz','chat','mixed')),
  content      text not null,
  file_url     text,
  tags         text[] default '{}',
  is_favourite boolean default false,
  session_id   uuid,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- sessions
create table if not exists sessions (
  id            uuid primary key default uuid_generate_v4(),
  profile_id    uuid references profiles(id) on delete cascade not null,
  mode          text not null check (mode in ('story','code','art','quiz','free')),
  summary       text,
  message_count int default 0,
  started_at    timestamptz default now(),
  ended_at      timestamptz
);

-- chat_messages
create table if not exists chat_messages (
  id         uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade not null,
  profile_id uuid references profiles(id) on delete cascade not null,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at timestamptz default now()
);

-- indexes
create index if not exists idx_creations_profile on creations(profile_id);
create index if not exists idx_creations_created on creations(created_at desc);
create index if not exists idx_messages_session  on chat_messages(session_id);
create index if not exists idx_sessions_profile  on sessions(profile_id);

-- RLS
alter table profiles      enable row level security;
alter table creations     enable row level security;
alter table sessions      enable row level security;
alter table chat_messages enable row level security;

-- RLS policies (service role bypasses these automatically)
create policy "profiles_own"  on profiles      for all using (true);
create policy "creations_own" on creations     for all using (true);
create policy "sessions_own"  on sessions      for all using (true);
create policy "messages_own"  on chat_messages for all using (true);

-- auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_profiles_updated
  before update on profiles for each row execute function set_updated_at();

create trigger trg_creations_updated
  before update on creations for each row execute function set_updated_at();

-- helper for incrementing session message count
create or replace function increment_message_count(sid uuid)
returns void language sql as $$
  update sessions set message_count = message_count + 1 where id = sid;
$$;

-- Adaptive Learner Model migration
-- Run after 001_phase1_schema.sql and gamification_migration.sql.
-- Idempotent: safe to re-run.

-- 1) learner_model jsonb column on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS learner_model jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_profiles_learner_model
  ON profiles USING GIN (learner_model);

-- 2) session_reflections — per-session LLM analysis
CREATE TABLE IF NOT EXISTS session_reflections (
  id                    uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id            uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id            uuid        REFERENCES sessions(id) ON DELETE SET NULL,
  surface               text        NOT NULL CHECK (surface IN (
                          'aida_chat','playground','validator',
                          'classroom_test','classroom_teacher',
                          'diagnostic','weekly_cron'
                        )),
  reflection_data       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  metrics               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  merged_into_model_at  timestamptz,
  merge_version         integer     DEFAULT 1,
  session_started_at    timestamptz NOT NULL,
  session_ended_at      timestamptz NOT NULL,
  reflected_at          timestamptz NOT NULL DEFAULT now(),
  llm_cost              numeric     DEFAULT 0,
  llm_tokens_in         integer     DEFAULT 0,
  llm_tokens_out        integer     DEFAULT 0,
  status                text        NOT NULL DEFAULT 'reflected'
);

CREATE INDEX IF NOT EXISTS idx_sr_profile     ON session_reflections(profile_id);
CREATE INDEX IF NOT EXISTS idx_sr_surface     ON session_reflections(surface);
CREATE INDEX IF NOT EXISTS idx_sr_merged      ON session_reflections(merged_into_model_at);
CREATE INDEX IF NOT EXISTS idx_sr_reflected   ON session_reflections(reflected_at);

-- 3) learner_snapshots — weekly snapshots for growth timeline
CREATE TABLE IF NOT EXISTS learner_snapshots (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  snapshot_data   jsonb       NOT NULL,
  top_strengths   text[]      DEFAULT '{}',
  top_weaknesses  text[]      DEFAULT '{}',
  overall_level   numeric,
  weekly_delta    numeric,
  streak_days     integer,
  week_start      date        NOT NULL,
  snapshot_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ls_profile_week
  ON learner_snapshots(profile_id, week_start DESC);

-- 4) Link chat_messages to reflections + index for pruning
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reflection_id uuid REFERENCES session_reflections(id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at
  ON chat_messages(created_at);

-- 5) Quality score signal on creations
ALTER TABLE creations
  ADD COLUMN IF NOT EXISTS quality_score numeric;

-- 6) Advisory-lock RPC: prevents concurrent learner_model clobbering.
--    Acquires a per-profile transaction-scoped advisory lock, then writes.
CREATE OR REPLACE FUNCTION lock_and_update_learner_model(
  p_profile_id uuid,
  p_learner_model jsonb
) RETURNS void AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_profile_id::text));
  UPDATE profiles
     SET learner_model = p_learner_model,
         updated_at    = now()
   WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION lock_and_update_learner_model(uuid, jsonb) TO service_role;

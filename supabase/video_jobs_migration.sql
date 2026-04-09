-- AIDA Video Generation Pipeline — job tracking + progress polling
-- Run after gamification_migration.sql

CREATE TABLE IF NOT EXISTS video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,

  prompt          TEXT NOT NULL,
  target_seconds  INT  NOT NULL DEFAULT 20,

  modal_call_id   TEXT,                          -- Modal function-call id (spawn handle)

  status          TEXT NOT NULL DEFAULT 'queued',
  -- queued | planning | narrating | keyframing | rendering | muxing | uploading | done | failed

  status_detail   TEXT,                          -- human text e.g. "Rendering scene 3/8"
  current_step    INT  NOT NULL DEFAULT 0,       -- e.g. 3
  total_steps     INT  NOT NULL DEFAULT 0,       -- e.g. 8

  video_url       TEXT,                          -- Supabase public URL of final MP4
  title           TEXT,                          -- AI-generated title from story
  duration_seconds NUMERIC,                      -- actual final duration
  shot_count      INT,
  model_used      TEXT,                          -- ltx-2.3-22b-distilled-1.1 / 13B fallback

  error           TEXT,                          -- failure message if status='failed'

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_profile  ON video_jobs(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_jobs_status   ON video_jobs(status);
CREATE INDEX IF NOT EXISTS idx_video_jobs_modal    ON video_jobs(modal_call_id) WHERE modal_call_id IS NOT NULL;

-- Auto-bump updated_at on any write
CREATE OR REPLACE FUNCTION touch_video_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_video_jobs_updated_at ON video_jobs;
CREATE TRIGGER trg_video_jobs_updated_at
  BEFORE UPDATE ON video_jobs
  FOR EACH ROW EXECUTE FUNCTION touch_video_jobs_updated_at();

-- RLS — only the owning profile can read their jobs
ALTER TABLE video_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_jobs_owner_read ON video_jobs;
CREATE POLICY video_jobs_owner_read ON video_jobs
  FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- Service role bypasses RLS for Modal worker writes; no INSERT/UPDATE policy needed for authenticated

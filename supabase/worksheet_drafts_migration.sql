-- Worksheet drafts: one row per (student × objective).
-- Upserted on auto-save, explicit save, and validation complete.
-- Run this in the Supabase SQL editor after gamification_migration.sql.

CREATE TABLE IF NOT EXISTS worksheet_drafts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lms_id                text        NOT NULL,
  data                  jsonb       NOT NULL DEFAULT '{}',
  notes                 text,
  worksheet_file_url    text,
  worksheet_file_name   text,
  worksheet_file_format text        CHECK (worksheet_file_format IN ('pdf', 'docx')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, lms_id)
);

CREATE INDEX IF NOT EXISTS worksheet_drafts_profile_idx
  ON worksheet_drafts (profile_id);
CREATE INDEX IF NOT EXISTS worksheet_drafts_lookup_idx
  ON worksheet_drafts (profile_id, lms_id);

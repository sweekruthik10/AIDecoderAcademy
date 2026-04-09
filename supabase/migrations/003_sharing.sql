-- 003_sharing.sql — social sharing columns on creations
-- Run this in the Supabase SQL Editor after 001_phase1_schema.sql and gamification_migration.sql

ALTER TABLE creations
  ADD COLUMN IF NOT EXISTS is_public     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_token   text UNIQUE;

-- Index for fast public share lookups
CREATE INDEX IF NOT EXISTS idx_creations_share_token ON creations (share_token) WHERE share_token IS NOT NULL;

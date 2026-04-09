-- supabase/migrations/002_profile_personalisation.sql
-- Phase 3 personalisation fields. All nullable so existing profiles continue
-- to work unchanged. AIDA prompt builder reads these and falls back to
-- age-tier-only behaviour when null.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reading_level         text,
  ADD COLUMN IF NOT EXISTS language_preference   text,
  ADD COLUMN IF NOT EXISTS learning_style        text,
  ADD COLUMN IF NOT EXISTS difficulty_preference text,
  ADD COLUMN IF NOT EXISTS current_grade         smallint;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_reading_level_valid;
ALTER TABLE profiles
  ADD  CONSTRAINT profiles_reading_level_valid
    CHECK (reading_level IS NULL OR reading_level IN ('below_grade','at_grade','above_grade'));

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_language_preference_valid;
ALTER TABLE profiles
  ADD  CONSTRAINT profiles_language_preference_valid
    CHECK (language_preference IS NULL OR language_preference IN ('en','hi','en_with_hi_terms'));

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_learning_style_valid;
ALTER TABLE profiles
  ADD  CONSTRAINT profiles_learning_style_valid
    CHECK (learning_style IS NULL OR learning_style IN ('visual','hands_on','story','facts_and_logic'));

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_difficulty_preference_valid;
ALTER TABLE profiles
  ADD  CONSTRAINT profiles_difficulty_preference_valid
    CHECK (difficulty_preference IS NULL OR difficulty_preference IN ('challenge_me','explain_gently','let_me_pick'));

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_current_grade_valid;
ALTER TABLE profiles
  ADD  CONSTRAINT profiles_current_grade_valid
    CHECK (current_grade IS NULL OR (current_grade >= 1 AND current_grade <= 12));

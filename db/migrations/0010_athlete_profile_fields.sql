-- Migration 0010 — Extended Athlete Profile Fields & In Court Videos
-- Adds fields to athlete_profiles and adds 'in_court' to athlete_video_kind enum

-- 1. Add 'in_court' to athlete_video_kind enum
ALTER TYPE public.athlete_video_kind ADD VALUE IF NOT EXISTS 'in_court';

-- 2. Add profile fields to athlete_profiles
ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS current_school text,
  ADD COLUMN IF NOT EXISTS high_school_graduation text,
  ADD COLUMN IF NOT EXISTS seeking_opportunities text,
  ADD COLUMN IF NOT EXISTS toefl_duolingo_score text,
  ADD COLUMN IF NOT EXISTS budget text,
  ADD COLUMN IF NOT EXISTS seasons_eligibility text,
  ADD COLUMN IF NOT EXISTS team_contribution_en text;

-- Migration: 0013_full_english_pivot_and_course_of_interest.sql
-- Description: Pivot all data structures to 100% US English (drop bio_pt, hero/catalog PT fields) and add course_of_interest to athlete_profiles.

-- 1. athlete_profiles: drop bio_pt and add course_of_interest
alter table if exists public.athlete_profiles
  drop column if exists bio_pt,
  add column if not exists course_of_interest text;

comment on column public.athlete_profiles.course_of_interest is
  'Desired college major or field of study in the US (e.g. Business Administration, Kinesiology, Computer Science)';

-- 2. agency_visual_settings: drop Portuguese text columns
alter table if exists public.agency_visual_settings
  drop column if exists hero_title_pt,
  drop column if exists hero_subtitle_pt,
  drop column if exists catalog_heading_pt;

-- 3. profiles: set default locale to en
alter table if exists public.profiles
  alter column locale set default 'en';

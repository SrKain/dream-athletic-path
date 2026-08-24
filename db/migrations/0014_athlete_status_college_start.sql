-- Migration: 0014_athlete_status_college_start.sql
-- Description: Add athlete_status and college_start_date to athlete_profiles

alter table if exists public.athlete_profiles
  add column if not exists athlete_status text,
  add column if not exists college_start_date text;

comment on column public.athlete_profiles.athlete_status is
  'Current academic / athletic status (High School, Freshman, Sophomore, Junior, Senior, Graduate Transfer)';

comment on column public.athlete_profiles.college_start_date is
  'Term and year of college entrance (e.g. Fall 2024, Spring 2025, Fall 2025, Spring 2026)';

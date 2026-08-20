-- Migration: Add logo_url and hero_background_url to agency_visual_settings
-- Enables agency administrators to customize agency logo and public hero image.

alter table public.agency_visual_settings
  add column if not exists logo_url text,
  add column if not exists hero_background_url text;

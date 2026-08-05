-- Migration: Add celebration message configuration to pipeline stages
-- This enables agencies to configure custom celebration email messages per stage
-- with support for dynamic placeholders (athlete name, stage names, etc.)

-- Add celebration_message_en column to store English celebration messages
alter table public.pipeline_stages
add column if not exists celebration_message_en text;

comment on column public.pipeline_stages.celebration_message_en is 
  'Optional celebration message sent to athlete when advancing to this stage. '
  'Supports placeholders: {{athlete_name}}, {{athlete_first_name}}, {{previous_stage}}, '
  '{{new_stage}}, {{agency_name}}, {{portal_link}}. If NULL or empty, no email is sent.';

-- Add scheduled_for column to email_log for tracking scheduled emails
alter table public.email_log
add column if not exists scheduled_for timestamptz;

comment on column public.email_log.scheduled_for is
  'When an email is scheduled to be sent (via Resend scheduled_at). NULL for immediate sends.';

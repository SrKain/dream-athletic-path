-- Migration 0021: Email Events and Mailer Metrics
-- Adds provider_id to recruit_email_logs and creates email_events for Resend webhook tracking

-- 1. Add provider_id to recruit_email_logs
alter table public.recruit_email_logs
  add column if not exists provider_id text;

create index if not exists idx_recruit_email_logs_provider_id
  on public.recruit_email_logs (provider_id);

-- 2. Create email_events table for idempotent webhook event ingestion
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend',
  provider_event_id text not null,
  provider_email_id text not null,
  event_type text not null,
  recipient text not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- Unique index ensuring strict idempotency per webhook event delivery
create unique index if not exists idx_email_events_provider_event_id
  on public.email_events (provider_event_id);

create index if not exists idx_email_events_provider_email_id
  on public.email_events (provider_email_id);

create index if not exists idx_email_events_recipient
  on public.email_events (lower(trim(recipient)));

create index if not exists idx_email_events_event_type
  on public.email_events (event_type);

create index if not exists idx_email_events_occurred_at
  on public.email_events (occurred_at desc);

-- 3. Row Level Security for email_events
alter table public.email_events enable row level security;

drop policy if exists email_events_agency_admin on public.email_events;
create policy email_events_agency_admin on public.email_events
  for all to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

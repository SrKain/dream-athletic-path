-- Migration 0016: Coaches directory and recruit email logs

-- 1. Coaches directory table
create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  institution text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_coaches_email_lower on public.coaches (lower(trim(email)));
create index if not exists idx_coaches_name on public.coaches (name);
create index if not exists idx_coaches_institution on public.coaches (institution);

-- 2. Optional highlight_note on athlete_profiles for email teaser hook
alter table public.athlete_profiles
  add column if not exists highlight_note text;

-- 3. Recruit email logs
create table if not exists public.recruit_email_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  subject text not null,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  sent_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_recruit_email_logs_athlete on public.recruit_email_logs(athlete_id);
create index if not exists idx_recruit_email_logs_coach on public.recruit_email_logs(coach_id);
create index if not exists idx_recruit_email_logs_sent_at on public.recruit_email_logs(sent_at desc);

-- 4. Row Level Security
alter table public.coaches enable row level security;
alter table public.recruit_email_logs enable row level security;

-- Only agency admins can read/write coaches and recruit email logs
drop policy if exists coaches_agency_all on public.coaches;
create policy coaches_agency_all on public.coaches for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

drop policy if exists recruit_logs_agency_all on public.recruit_email_logs;
create policy recruit_logs_agency_all on public.recruit_email_logs for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

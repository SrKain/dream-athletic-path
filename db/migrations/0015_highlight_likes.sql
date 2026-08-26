-- Migration 0015: Highlight video likes for recruitment interest tracking
create table if not exists public.athlete_video_likes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.athlete_videos(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  user_fingerprint text not null default 'anonymous',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_athlete_video_likes_video_id on public.athlete_video_likes(video_id);
create index if not exists idx_athlete_video_likes_athlete_id on public.athlete_video_likes(athlete_id);

alter table public.athlete_video_likes enable row level security;

-- Leitura e inserção anônimas para registrar interesse em highlights
create policy "athlete_video_likes_select_all"
  on public.athlete_video_likes for select
  using (true);

create policy "athlete_video_likes_insert_all"
  on public.athlete_video_likes for insert
  with check (true);

-- 0011_athlete_videos_rls_fix.sql
-- Garantir que as políticas de RLS de athlete_videos utilizem a função security definer public.athlete_is_public(athlete_id)
-- evitando qualquer bloqueio de subquery em consultas anônimas públicas.

grant select on public.athlete_videos to anon, authenticated;
grant select, insert, update, delete on public.athlete_videos to authenticated;
grant all on public.athlete_videos to service_role;

alter table public.athlete_videos enable row level security;

drop policy if exists "athlete videos public read" on public.athlete_videos;
create policy "athlete videos public read" on public.athlete_videos
  for select to anon, authenticated
  using (public.athlete_is_public(athlete_id));

drop policy if exists "athlete videos agency manage" on public.athlete_videos;
create policy "athlete videos agency manage" on public.athlete_videos
  for all to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

drop policy if exists "athlete videos owner read" on public.athlete_videos;
create policy "athlete videos owner read" on public.athlete_videos
  for select to authenticated
  using (public.owns_athlete(athlete_id));

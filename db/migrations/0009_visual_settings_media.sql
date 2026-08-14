-- Migration: Aba Visual (configuração do catálogo) + vídeos do atleta por YouTube
-- Cria: agency_visual_settings, catalog_position_order, athlete_videos.

-- ---------- Configurações visuais do catálogo público ----------
create table if not exists public.agency_visual_settings (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  hero_title_pt text,
  hero_title_en text,
  hero_subtitle_pt text,
  hero_subtitle_en text,
  catalog_heading_pt text,
  catalog_heading_en text,
  updated_at timestamptz not null default now()
);

grant select on public.agency_visual_settings to anon;
grant select, insert, update, delete on public.agency_visual_settings to authenticated;
grant all on public.agency_visual_settings to service_role;

alter table public.agency_visual_settings enable row level security;

drop policy if exists "visual settings public read" on public.agency_visual_settings;
create policy "visual settings public read" on public.agency_visual_settings
  for select to anon, authenticated using (true);

drop policy if exists "visual settings agency write" on public.agency_visual_settings;
create policy "visual settings agency write" on public.agency_visual_settings
  for all to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

-- ---------- Ordem manual das categorias (posições) ----------
create table if not exists public.catalog_position_order (
  position_id uuid primary key references public.positions(id) on delete cascade,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

grant select on public.catalog_position_order to anon;
grant select, insert, update, delete on public.catalog_position_order to authenticated;
grant all on public.catalog_position_order to service_role;

alter table public.catalog_position_order enable row level security;

drop policy if exists "position order public read" on public.catalog_position_order;
create policy "position order public read" on public.catalog_position_order
  for select to anon, authenticated using (true);

drop policy if exists "position order agency write" on public.catalog_position_order;
create policy "position order agency write" on public.catalog_position_order
  for all to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

-- ---------- Vídeos do atleta (links do YouTube) ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'athlete_video_kind') then
    create type public.athlete_video_kind as enum ('presentation', 'highlight', 'feature');
  end if;
end
$$;

create table if not exists public.athlete_videos (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  kind public.athlete_video_kind not null,
  youtube_url text not null,
  title text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists athlete_videos_athlete_idx
  on public.athlete_videos (athlete_id, kind, sort_order);

grant select on public.athlete_videos to anon;
grant select, insert, update, delete on public.athlete_videos to authenticated;
grant all on public.athlete_videos to service_role;

alter table public.athlete_videos enable row level security;

drop policy if exists "athlete videos public read" on public.athlete_videos;
create policy "athlete videos public read" on public.athlete_videos
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_videos.athlete_id
        and a.is_public = true
        and a.deleted_at is null
    )
  );

drop policy if exists "athlete videos agency manage" on public.athlete_videos;
create policy "athlete videos agency manage" on public.athlete_videos
  for all to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

drop policy if exists "athlete videos owner read" on public.athlete_videos;
create policy "athlete videos owner read" on public.athlete_videos
  for select to authenticated
  using (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_videos.athlete_id and a.user_id = auth.uid()
    )
  );

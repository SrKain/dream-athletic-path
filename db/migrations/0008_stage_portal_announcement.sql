-- Migration: Pop-up de celebração no portal do atleta
-- Adiciona mensagem de pop-up por etapa, imagens do slider e controle de "já visto".

-- ---------- pipeline_stages: mensagens do pop-up ----------
alter table public.pipeline_stages
  add column if not exists portal_message_pt text,
  add column if not exists portal_message_en text;

comment on column public.pipeline_stages.portal_message_pt is
  'Mensagem exibida no pop-up do portal quando o atleta avança para esta etapa. '
  'Suporta os mesmos placeholders do e-mail. Se vazio, nenhum pop-up é exibido.';

-- ---------- imagens do slider ----------
create table if not exists public.stage_celebration_images (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists stage_celebration_images_stage_idx
  on public.stage_celebration_images (stage_id, sort_order);

grant select on public.stage_celebration_images to authenticated;
grant insert, update, delete on public.stage_celebration_images to authenticated;
grant all on public.stage_celebration_images to service_role;

alter table public.stage_celebration_images enable row level security;

drop policy if exists "stage images readable" on public.stage_celebration_images;
create policy "stage images readable" on public.stage_celebration_images
  for select to authenticated using (true);

drop policy if exists "stage images managed by agency" on public.stage_celebration_images;
create policy "stage images managed by agency" on public.stage_celebration_images
  for all to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

-- ---------- controle de exibição por atleta/etapa ----------
create table if not exists public.athlete_stage_announcements (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  seen_at timestamptz not null default now(),
  unique (athlete_id, stage_id)
);

grant select, insert on public.athlete_stage_announcements to authenticated;
grant all on public.athlete_stage_announcements to service_role;

alter table public.athlete_stage_announcements enable row level security;

drop policy if exists "athlete reads own announcements" on public.athlete_stage_announcements;
create policy "athlete reads own announcements" on public.athlete_stage_announcements
  for select to authenticated
  using (
    public.is_agency_admin()
    or exists (
      select 1 from public.athletes a
      where a.id = athlete_stage_announcements.athlete_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "athlete marks own announcements" on public.athlete_stage_announcements;
create policy "athlete marks own announcements" on public.athlete_stage_announcements
  for insert to authenticated
  with check (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_stage_announcements.athlete_id and a.user_id = auth.uid()
    )
  );

-- ---------- bucket público das imagens ----------
insert into storage.buckets (id, name, public)
values ('stage-celebrations', 'stage-celebrations', true)
on conflict (id) do update set public = true;

drop policy if exists "stage celebrations public read" on storage.objects;
create policy "stage celebrations public read" on storage.objects
  for select using (bucket_id = 'stage-celebrations');

drop policy if exists "stage celebrations agency write" on storage.objects;
create policy "stage celebrations agency write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'stage-celebrations' and public.is_agency_admin());

drop policy if exists "stage celebrations agency delete" on storage.objects;
create policy "stage celebrations agency delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'stage-celebrations' and public.is_agency_admin());
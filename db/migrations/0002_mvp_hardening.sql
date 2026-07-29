-- MVP hardening. Execute after 0001_init.sql. Idempotent.

-- ---------- INTEGRIDADE ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists athletes_set_updated_at on public.athletes;
create trigger athletes_set_updated_at
  before update on public.athletes
  for each row execute function public.set_updated_at();

do $$ begin
  alter table public.positions
    add constraint positions_sport_name_unique unique (sport_id, name_en);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.athlete_checklist_items
    add constraint athlete_checklist_document_fk
    foreign key (document_id) references public.documents(id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists athletes_catalog_idx
  on public.athletes (sport_id, position_id, nationality, created_at desc)
  where is_public and deleted_at is null;
create index if not exists documents_review_idx
  on public.documents (status, created_at desc)
  where deleted_at is null;
create index if not exists progress_status_idx
  on public.athlete_stage_progress (status, due_date);

-- Convites são somente auditoria. O segredo pertence ao Supabase Auth.
alter table public.invitations drop column if exists token;
alter table public.invitations add column if not exists auth_user_id uuid
  references auth.users(id) on delete set null;
alter table public.invitations add column if not exists invited_by uuid
  references auth.users(id) on delete set null;
alter table public.invitations add column if not exists revoked_at timestamptz;

-- ---------- ETAPAS PADRÃO ----------
create or replace function public.create_default_pipeline()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.pipeline_stages
    (agency_id, key, name_en, name_pt, description_en, description_pt, order_index)
  values
    (new.id, 'diagnosis', 'Diagnosis', 'Diagnóstico',
      'Assessment of the athletic, academic and financial profile.',
      'Avaliação do perfil esportivo, acadêmico e financeiro.', 10),
    (new.id, 'personal-plan', 'Personalized plan', 'Plano personalizado',
      'Definition of target divisions, regions and universities.',
      'Definição de divisões, regiões e universidades-alvo.', 20),
    (new.id, 'video-exposure', 'Video and exposure', 'Vídeo e exposição',
      'Preparation of sports media and outreach.',
      'Preparação de mídia esportiva e estratégia de exposição.', 30),
    (new.id, 'negotiation', 'Negotiation', 'Negociação',
      'Management of contacts, offers and scholarship negotiation.',
      'Gestão de contatos, ofertas e negociação da bolsa.', 40),
    (new.id, 'boarding-support', 'Boarding and support', 'Embarque e acompanhamento',
      'Documentation, visa, preparation and ongoing support.',
      'Documentação, visto, preparação e acompanhamento.', 50)
  on conflict (agency_id, key) do nothing;
  return new;
end $$;

drop trigger if exists agencies_create_default_pipeline on public.agencies;
create trigger agencies_create_default_pipeline
  after insert on public.agencies
  for each row execute function public.create_default_pipeline();

insert into public.pipeline_stages
  (agency_id, key, name_en, name_pt, description_en, description_pt, order_index)
select a.id, stage.key, stage.name_en, stage.name_pt, stage.description_en,
  stage.description_pt, stage.order_index
from public.agencies a
cross join (values
  ('diagnosis', 'Diagnosis', 'Diagnóstico',
    'Assessment of the athletic, academic and financial profile.',
    'Avaliação do perfil esportivo, acadêmico e financeiro.', 10),
  ('personal-plan', 'Personalized plan', 'Plano personalizado',
    'Definition of target divisions, regions and universities.',
    'Definição de divisões, regiões e universidades-alvo.', 20),
  ('video-exposure', 'Video and exposure', 'Vídeo e exposição',
    'Preparation of sports media and outreach.',
    'Preparação de mídia esportiva e estratégia de exposição.', 30),
  ('negotiation', 'Negotiation', 'Negociação',
    'Management of contacts, offers and scholarship negotiation.',
    'Gestão de contatos, ofertas e negociação da bolsa.', 40),
  ('boarding-support', 'Boarding and support', 'Embarque e acompanhamento',
    'Documentation, visa, preparation and ongoing support.',
    'Documentação, visto, preparação e acompanhamento.', 50)
) as stage(key, name_en, name_pt, description_en, description_pt, order_index)
on conflict (agency_id, key) do nothing;

-- ---------- ACESSO PÚBLICO POR COLUNA ----------
-- RLS filtra linhas; grants por coluna impedem vazamento de e-mail e ids internos.
revoke select on public.athletes from anon;
grant select (
  id, slug, full_name, birth_date, height_cm, weight_kg, nationality,
  sport_id, position_id, photo_url, cover_url, is_public, is_featured, created_at
) on public.athletes to anon;
grant select on public.athletes to authenticated;

-- ---------- ATLETA: LEITURA + UPLOAD, SEM EDIÇÃO ----------
drop policy if exists athletes_self_update on public.athletes;

drop policy if exists ap_self on public.athlete_profiles;
drop policy if exists ap_self_read on public.athlete_profiles;
create policy ap_self_read on public.athlete_profiles for select to authenticated
  using (public.owns_athlete(athlete_id) or public.is_agency_admin());
drop policy if exists ap_agency_all on public.athlete_profiles;
create policy ap_agency_all on public.athlete_profiles for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

drop policy if exists media_self on public.athlete_media;
drop policy if exists media_self_read on public.athlete_media;
create policy media_self_read on public.athlete_media for select to authenticated
  using (public.owns_athlete(athlete_id) or public.is_agency_admin());
drop policy if exists media_athlete_insert on public.athlete_media;
create policy media_athlete_insert on public.athlete_media for insert to authenticated
  with check (public.owns_athlete(athlete_id) and is_public = false);
drop policy if exists media_agency_all on public.athlete_media;
create policy media_agency_all on public.athlete_media for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

drop policy if exists ach_self on public.achievements;
drop policy if exists ach_self_read on public.achievements;
create policy ach_self_read on public.achievements for select to authenticated
  using (public.owns_athlete(athlete_id) or public.is_agency_admin());
drop policy if exists ach_agency_all on public.achievements;
create policy ach_agency_all on public.achievements for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated
  using (user_id = auth.uid() or public.is_agency_admin());

-- ---------- STORAGE ----------
update storage.buckets
set file_size_limit = 524288000,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']
where id = 'athlete-media';

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'application/pdf','image/jpeg','image/png','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
where id = 'documents';

drop policy if exists media_auth_write on storage.objects;
create policy media_auth_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'athlete-media'
    and public.owns_athlete((storage.foldername(name))[1]::uuid)
  );

drop policy if exists media_owner_delete on storage.objects;
create policy media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'athlete-media' and public.is_agency_admin());

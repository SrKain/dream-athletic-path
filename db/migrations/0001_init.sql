-- =====================================================================
-- Plataforma de Gestão — Agência de Intercâmbio Esportivo
-- Migração inicial. Executar no projeto SUPABASE EXTERNO (SQL Editor).
-- Idempotente: pode ser reexecutada com segurança.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
do $$ begin
  create type public.app_role as enum ('agency_admin','athlete','coach');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_status as enum ('pending','submitted','approved','rejected','resubmit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stage_status as enum ('not_started','in_progress','blocked','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.media_kind as enum ('photo','video');
exception when duplicate_object then null; end $$;

-- ---------- TABELAS BASE ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  locale text not null default 'pt',
  created_at timestamptz not null default now()
);

-- Papéis SEMPRE em tabela separada (previne escalonamento de privilégio).
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.countries (
  code text primary key,
  name_en text not null,
  name_pt text not null,
  flag_emoji text
);

create table if not exists public.sports (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_en text not null,
  name_pt text not null
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete cascade,
  name_en text not null,
  name_pt text not null,
  abbreviation text
);

create table if not exists public.athletes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  slug text unique not null,
  full_name text not null,
  email text,
  birth_date date,
  height_cm int,
  weight_kg int,
  nationality text references public.countries(code),
  sport_id uuid references public.sports(id),
  position_id uuid references public.positions(id),
  photo_url text,
  cover_url text,
  is_public boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists athletes_public_idx on public.athletes (is_public) where deleted_at is null;

-- Slugs antigos continuam funcionando após renomeações.
create table if not exists public.athlete_slug_history (
  slug text primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.athlete_profiles (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  bio_en text,
  bio_pt text,
  highlight_video_url text,
  stats jsonb,
  gpa numeric(3,2),
  english_level text,
  graduation_year int
);

create table if not exists public.athlete_media (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  kind public.media_kind not null,
  url text not null,
  thumbnail_url text,
  caption_en text,
  caption_pt text,
  is_public boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  title_en text not null,
  title_pt text,
  description_en text,
  description_pt text,
  achieved_on date,
  is_public boolean not null default true
);

-- ---------- PIPELINE ----------
create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  key text not null,
  name_en text not null,
  name_pt text,
  description_en text,
  description_pt text,
  order_index int not null default 0,
  is_active boolean not null default true,
  unique (agency_id, key)
);

create table if not exists public.athlete_stage_progress (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  status public.stage_status not null default 'not_started',
  due_date date,
  notes text,
  owner_user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  unique (athlete_id, stage_id)
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  label_en text not null,
  label_pt text,
  requires_document boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.athlete_checklist_items (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  checklist_item_id uuid not null references public.checklist_items(id) on delete cascade,
  status public.document_status not null default 'pending',
  completed_at timestamptz,
  notes text,
  document_id uuid,
  unique (athlete_id, checklist_item_id)
);

-- ---------- DOCUMENTOS ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  checklist_item_id uuid references public.checklist_items(id) on delete set null,
  title text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  status public.document_status not null default 'submitted',
  review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- CONVITES / NOTIFICAÇÕES / E-MAIL ----------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'athlete',
  token text unique not null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  template text not null,
  to_email text not null,
  subject text,
  provider_id text,
  status text not null default 'sent',
  error text,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ---------- FUNÇÕES DE SEGURANÇA ----------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_agency_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'agency_admin');
$$;

create or replace function public.owns_athlete(_athlete_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.athletes a where a.id = _athlete_id and a.user_id = auth.uid());
$$;

create or replace function public.athlete_is_public(_athlete_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.athletes a
    where a.id = _athlete_id and a.is_public and a.deleted_at is null
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- GRANTS ----------
grant select on public.countries, public.sports, public.positions to anon, authenticated;
grant all on public.countries, public.sports, public.positions to service_role;

grant select on public.athletes, public.athlete_profiles, public.athlete_media, public.achievements
  to anon, authenticated;
grant update on public.athletes, public.athlete_profiles to authenticated;
grant insert, update, delete on public.athlete_media, public.achievements to authenticated;
grant all on public.athletes, public.athlete_profiles, public.athlete_media, public.achievements
  to service_role;

grant select on public.athlete_slug_history to anon, authenticated;
grant all on public.athlete_slug_history to service_role;

grant select, insert, update, delete on public.profiles, public.agencies, public.pipeline_stages,
  public.athlete_stage_progress, public.checklist_items, public.athlete_checklist_items,
  public.documents, public.notifications, public.invitations to authenticated;
grant select on public.user_roles to authenticated;
grant all on public.profiles, public.agencies, public.user_roles, public.pipeline_stages,
  public.athlete_stage_progress, public.checklist_items, public.athlete_checklist_items,
  public.documents, public.notifications, public.invitations, public.email_log to service_role;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.agencies enable row level security;
alter table public.countries enable row level security;
alter table public.sports enable row level security;
alter table public.positions enable row level security;
alter table public.athletes enable row level security;
alter table public.athlete_slug_history enable row level security;
alter table public.athlete_profiles enable row level security;
alter table public.athlete_media enable row level security;
alter table public.achievements enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.athlete_stage_progress enable row level security;
alter table public.checklist_items enable row level security;
alter table public.athlete_checklist_items enable row level security;
alter table public.documents enable row level security;
alter table public.notifications enable row level security;
alter table public.invitations enable row level security;
alter table public.email_log enable row level security;

-- Catálogos de referência: leitura pública, escrita só pela agência.
drop policy if exists ref_read on public.countries;
create policy ref_read on public.countries for select using (true);
drop policy if exists ref_read on public.sports;
create policy ref_read on public.sports for select using (true);
drop policy if exists ref_read on public.positions;
create policy ref_read on public.positions for select using (true);
drop policy if exists ref_write on public.positions;
create policy ref_write on public.positions for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

-- profiles
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_agency_admin());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- user_roles: leitura do próprio papel; escrita apenas via service role.
drop policy if exists roles_read_self on public.user_roles;
create policy roles_read_self on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_agency_admin());

-- agencies
drop policy if exists agencies_read on public.agencies;
create policy agencies_read on public.agencies for select to authenticated using (true);
drop policy if exists agencies_write on public.agencies;
create policy agencies_write on public.agencies for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

-- athletes
drop policy if exists athletes_public_read on public.athletes;
create policy athletes_public_read on public.athletes for select
  using (is_public and deleted_at is null);
drop policy if exists athletes_self_read on public.athletes;
create policy athletes_self_read on public.athletes for select to authenticated
  using (user_id = auth.uid() or public.is_agency_admin());
drop policy if exists athletes_self_update on public.athletes;
create policy athletes_self_update on public.athletes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists athletes_agency_all on public.athletes;
create policy athletes_agency_all on public.athletes for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

drop policy if exists slug_history_read on public.athlete_slug_history;
create policy slug_history_read on public.athlete_slug_history for select using (true);

-- athlete_profiles
drop policy if exists ap_public_read on public.athlete_profiles;
create policy ap_public_read on public.athlete_profiles for select
  using (public.athlete_is_public(athlete_id));
drop policy if exists ap_self on public.athlete_profiles;
create policy ap_self on public.athlete_profiles for all to authenticated
  using (public.owns_athlete(athlete_id) or public.is_agency_admin())
  with check (public.owns_athlete(athlete_id) or public.is_agency_admin());

-- athlete_media
drop policy if exists media_public_read on public.athlete_media;
create policy media_public_read on public.athlete_media for select
  using (is_public and public.athlete_is_public(athlete_id));
drop policy if exists media_self on public.athlete_media;
create policy media_self on public.athlete_media for all to authenticated
  using (public.owns_athlete(athlete_id) or public.is_agency_admin())
  with check (public.owns_athlete(athlete_id) or public.is_agency_admin());

-- achievements
drop policy if exists ach_public_read on public.achievements;
create policy ach_public_read on public.achievements for select
  using (is_public and public.athlete_is_public(athlete_id));
drop policy if exists ach_self on public.achievements;
create policy ach_self on public.achievements for all to authenticated
  using (public.owns_athlete(athlete_id) or public.is_agency_admin())
  with check (public.owns_athlete(athlete_id) or public.is_agency_admin());

-- pipeline (nunca público)
drop policy if exists stages_read on public.pipeline_stages;
create policy stages_read on public.pipeline_stages for select to authenticated using (true);
drop policy if exists stages_write on public.pipeline_stages;
create policy stages_write on public.pipeline_stages for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

drop policy if exists progress_read on public.athlete_stage_progress;
create policy progress_read on public.athlete_stage_progress for select to authenticated
  using (public.owns_athlete(athlete_id) or public.is_agency_admin());
drop policy if exists progress_write on public.athlete_stage_progress;
create policy progress_write on public.athlete_stage_progress for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

drop policy if exists ci_read on public.checklist_items;
create policy ci_read on public.checklist_items for select to authenticated using (true);
drop policy if exists ci_write on public.checklist_items;
create policy ci_write on public.checklist_items for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

drop policy if exists aci_read on public.athlete_checklist_items;
create policy aci_read on public.athlete_checklist_items for select to authenticated
  using (public.owns_athlete(athlete_id) or public.is_agency_admin());
drop policy if exists aci_write on public.athlete_checklist_items;
create policy aci_write on public.athlete_checklist_items for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

-- documents (nunca público)
drop policy if exists docs_read on public.documents;
create policy docs_read on public.documents for select to authenticated
  using (deleted_at is null and (public.owns_athlete(athlete_id) or public.is_agency_admin()));
drop policy if exists docs_athlete_insert on public.documents;
create policy docs_athlete_insert on public.documents for insert to authenticated
  with check (public.owns_athlete(athlete_id) or public.is_agency_admin());
drop policy if exists docs_agency_all on public.documents;
create policy docs_agency_all on public.documents for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

-- notifications
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_agency_insert on public.notifications;
create policy notif_agency_insert on public.notifications for insert to authenticated
  with check (public.is_agency_admin());

-- invitations: apenas a agência enxerga; aceite ocorre via service role.
drop policy if exists inv_agency on public.invitations;
create policy inv_agency on public.invitations for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

-- email_log: sem policy para anon/authenticated (somente service role).

-- ---------- STORAGE ----------
insert into storage.buckets (id, name, public)
values ('athlete-media','athlete-media', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('documents','documents', false)
on conflict (id) do update set public = false;

drop policy if exists media_public_select on storage.objects;
create policy media_public_select on storage.objects for select
  using (bucket_id = 'athlete-media');

drop policy if exists media_auth_write on storage.objects;
create policy media_auth_write on storage.objects for insert to authenticated
  with check (bucket_id = 'athlete-media');

drop policy if exists media_owner_delete on storage.objects;
create policy media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'athlete-media' and (owner = auth.uid() or public.is_agency_admin()));

-- documents: caminho = <athlete_id>/<arquivo>
drop policy if exists docs_select on storage.objects;
create policy docs_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (public.is_agency_admin() or public.owns_athlete((storage.foldername(name))[1]::uuid))
  );

drop policy if exists docs_insert on storage.objects;
create policy docs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (public.is_agency_admin() or public.owns_athlete((storage.foldername(name))[1]::uuid))
  );

drop policy if exists docs_delete on storage.objects;
create policy docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_agency_admin());

-- ---------- SEED DE REFERÊNCIA ----------
insert into public.countries (code, name_en, name_pt, flag_emoji) values
  ('BR','Brazil','Brasil','🇧🇷'),
  ('US','United States','Estados Unidos','🇺🇸'),
  ('PT','Portugal','Portugal','🇵🇹'),
  ('AR','Argentina','Argentina','🇦🇷'),
  ('ES','Spain','Espanha','🇪🇸')
on conflict (code) do nothing;

insert into public.sports (slug, name_en, name_pt) values
  ('soccer','Soccer','Futebol'),
  ('volleyball','Volleyball','Vôlei'),
  ('basketball','Basketball','Basquete'),
  ('track-field','Track & Field','Atletismo')
on conflict (slug) do nothing;

insert into public.positions (sport_id, name_en, name_pt, abbreviation)
select s.id, v.en, v.pt, v.abbr
from public.sports s
join (values
  ('soccer','Goalkeeper','Goleiro','GK'),
  ('soccer','Center Back','Zagueiro','CB'),
  ('soccer','Full Back','Lateral','FB'),
  ('soccer','Midfielder','Meio-campista','MF'),
  ('soccer','Winger','Ponta','WG'),
  ('soccer','Striker','Atacante','ST'),
  ('volleyball','Setter','Levantador','S'),
  ('volleyball','Outside Hitter','Ponteiro','OH'),
  ('volleyball','Middle Blocker','Central','MB'),
  ('volleyball','Libero','Líbero','L'),
  ('basketball','Point Guard','Armador','PG'),
  ('basketball','Shooting Guard','Ala-armador','SG'),
  ('basketball','Small Forward','Ala','SF'),
  ('basketball','Power Forward','Ala-pivô','PF'),
  ('basketball','Center','Pivô','C')
) as v(sport, en, pt, abbr) on v.sport = s.slug
where not exists (
  select 1 from public.positions p where p.sport_id = s.id and p.name_en = v.en
);
-- Propostas publicas, versionadas e respondidas sem login.

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete set null,
  recipient_name text not null,
  recipient_email text not null,
  recipient_sport text,
  recipient_photo_url text,
  title text not null default 'Scholarship Offer',
  language text not null default 'en' check (language in ('pt','en')),
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'draft'
    check (status in ('draft','published','accepted','declined','archived')),
  expires_at date,
  active_version_id uuid,
  draft_content jsonb not null default '{"schemaVersion":1,"currency":"USD","blocks":[]}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version_number int not null check (version_number > 0),
  language text not null check (language in ('pt','en')),
  content jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (proposal_id, version_number)
);

do $$ begin
  alter table public.proposals add constraint proposals_active_version_fk
    foreign key (active_version_id) references public.proposal_versions(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.proposal_responses (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.proposals(id) on delete cascade,
  proposal_version_id uuid not null references public.proposal_versions(id) on delete restrict,
  decision text not null check (decision in ('accepted','declined')),
  respondent_name text not null,
  respondent_email text not null,
  responded_at timestamptz not null default now()
);

create index if not exists proposals_agency_status_idx
  on public.proposals (agency_id, status, created_at desc);
create index if not exists proposals_recipient_idx
  on public.proposals (lower(recipient_name), lower(recipient_email));

drop trigger if exists proposals_set_updated_at on public.proposals;
create trigger proposals_set_updated_at before update on public.proposals
  for each row execute function public.set_updated_at();

create or replace function public.keep_published_proposal_version_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Published proposal versions are immutable';
end $$;

drop trigger if exists proposal_versions_immutable on public.proposal_versions;
create trigger proposal_versions_immutable before update or delete on public.proposal_versions
  for each row execute function public.keep_published_proposal_version_immutable();

alter table public.proposals enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.proposal_responses enable row level security;

revoke all on public.proposals, public.proposal_versions, public.proposal_responses from anon;
grant select, insert, update, delete on public.proposals to authenticated;
grant select, insert on public.proposal_versions to authenticated;
grant select on public.proposal_responses to authenticated;

drop policy if exists proposals_admin on public.proposals;
create policy proposals_admin on public.proposals for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());
drop policy if exists proposal_versions_admin on public.proposal_versions;
create policy proposal_versions_admin on public.proposal_versions for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());
drop policy if exists proposal_responses_admin on public.proposal_responses;
create policy proposal_responses_admin on public.proposal_responses for select to authenticated
  using (public.is_agency_admin());

-- Retorna somente o snapshot publicado e os metadados estritamente necessarios.
create or replace function public.get_public_proposal(_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'recipientName', p.recipient_name,
    'recipientEmailHint', regexp_replace(p.recipient_email, '(^.).*(@.*$)', '\1***\2'),
    'recipientSport', p.recipient_sport,
    'recipientPhotoUrl', p.recipient_photo_url,
    'title', p.title,
    'language', v.language,
    'status', p.status,
    'expiresAt', p.expires_at,
    'versionId', v.id,
    'versionNumber', v.version_number,
    'publishedAt', v.published_at,
    'content', v.content,
    'response', case when r.id is null then null else jsonb_build_object(
      'decision', r.decision, 'respondentName', r.respondent_name, 'respondedAt', r.responded_at
    ) end
  )
  from public.proposals p
  join public.proposal_versions v on v.id = p.active_version_id
  left join public.proposal_responses r on r.proposal_id = p.id
  where p.public_token = _token
    and p.status in ('published','accepted','declined')
  limit 1;
$$;

create or replace function public.respond_to_proposal(
  _token text, _name text, _email text, _decision text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target public.proposals;
  response_id uuid;
begin
  if _decision not in ('accepted','declined') then
    raise exception 'Invalid decision';
  end if;
  if length(trim(_name)) < 2 then raise exception 'Name is required'; end if;

  select * into target from public.proposals
  where public_token = _token for update;

  if target.id is null or target.status <> 'published' or target.active_version_id is null then
    raise exception 'Proposal is not available';
  end if;
  if target.expires_at is not null and target.expires_at < current_date then
    raise exception 'Proposal has expired';
  end if;
  if lower(trim(target.recipient_email)) <> lower(trim(_email)) then
    raise exception 'Email does not match the recipient';
  end if;

  insert into public.proposal_responses
    (proposal_id, proposal_version_id, decision, respondent_name, respondent_email)
  values
    (target.id, target.active_version_id, _decision, trim(_name), lower(trim(_email)))
  returning id into response_id;

  update public.proposals set status = _decision where id = target.id;
  return jsonb_build_object('id', response_id, 'decision', _decision, 'respondedAt', now());
exception when unique_violation then
  raise exception 'Proposal already answered';
end $$;

revoke all on function public.get_public_proposal(text) from public;
revoke all on function public.respond_to_proposal(text,text,text,text) from public;
grant execute on function public.get_public_proposal(text) to anon, authenticated;
grant execute on function public.respond_to_proposal(text,text,text,text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proposal-assets','proposal-assets', true, 10485760,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists proposal_assets_public_read on storage.objects;
create policy proposal_assets_public_read on storage.objects for select
  using (bucket_id = 'proposal-assets');
drop policy if exists proposal_assets_admin_insert on storage.objects;
create policy proposal_assets_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proposal-assets' and public.is_agency_admin());
drop policy if exists proposal_assets_admin_update on storage.objects;
create policy proposal_assets_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'proposal-assets' and public.is_agency_admin());
drop policy if exists proposal_assets_admin_delete on storage.objects;
create policy proposal_assets_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proposal-assets' and public.is_agency_admin());

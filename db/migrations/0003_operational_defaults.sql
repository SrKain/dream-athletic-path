-- Operational defaults for pipeline/checklist assignment. Idempotent.

create or replace function public.assign_pipeline_to_athlete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.athlete_stage_progress (athlete_id, stage_id)
  select new.id, id from public.pipeline_stages
  where agency_id = new.agency_id and is_active
  on conflict (athlete_id, stage_id) do nothing;

  insert into public.athlete_checklist_items (athlete_id, checklist_item_id)
  select new.id, ci.id
  from public.checklist_items ci
  join public.pipeline_stages ps on ps.id = ci.stage_id
  where ps.agency_id = new.agency_id
  on conflict (athlete_id, checklist_item_id) do nothing;
  return new;
end $$;

drop trigger if exists athletes_assign_pipeline on public.athletes;
create trigger athletes_assign_pipeline
  after insert on public.athletes
  for each row execute function public.assign_pipeline_to_athlete();

create or replace function public.assign_stage_to_athletes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.athlete_stage_progress (athlete_id, stage_id)
  select id, new.id from public.athletes
  where agency_id = new.agency_id and deleted_at is null
  on conflict (athlete_id, stage_id) do nothing;
  return new;
end $$;

drop trigger if exists stages_assign_athletes on public.pipeline_stages;
create trigger stages_assign_athletes
  after insert on public.pipeline_stages
  for each row execute function public.assign_stage_to_athletes();

create or replace function public.assign_checklist_to_athletes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.athlete_checklist_items (athlete_id, checklist_item_id)
  select a.id, new.id
  from public.athletes a
  join public.pipeline_stages ps on ps.agency_id = a.agency_id
  where ps.id = new.stage_id and a.deleted_at is null
  on conflict (athlete_id, checklist_item_id) do nothing;
  return new;
end $$;

drop trigger if exists checklist_assign_athletes on public.checklist_items;
create trigger checklist_assign_athletes
  after insert on public.checklist_items
  for each row execute function public.assign_checklist_to_athletes();

-- Backfill existing operational records.
insert into public.athlete_stage_progress (athlete_id, stage_id)
select a.id, ps.id
from public.athletes a
join public.pipeline_stages ps on ps.agency_id = a.agency_id and ps.is_active
on conflict (athlete_id, stage_id) do nothing;

insert into public.athlete_checklist_items (athlete_id, checklist_item_id)
select a.id, ci.id
from public.athletes a
join public.pipeline_stages ps on ps.agency_id = a.agency_id
join public.checklist_items ci on ci.stage_id = ps.id
on conflict (athlete_id, checklist_item_id) do nothing;

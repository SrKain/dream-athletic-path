-- Ensure every athlete can be placed in a current pipeline stage. Idempotent.

alter table public.athletes
  add column if not exists current_stage_id uuid;

do $$ begin
  alter table public.athletes
    add constraint athletes_current_stage_fk
    foreign key (current_stage_id) references public.pipeline_stages(id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists athletes_current_stage_idx
  on public.athletes (current_stage_id)
  where deleted_at is null;

create or replace function public.assign_pipeline_to_athlete()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  first_stage_id uuid;
begin
  select id into first_stage_id
  from public.pipeline_stages
  where agency_id = new.agency_id and is_active
  order by order_index asc
  limit 1;

  if new.current_stage_id is null and first_stage_id is not null then
    update public.athletes
    set current_stage_id = first_stage_id
    where id = new.id and current_stage_id is null;
  end if;

  insert into public.athlete_stage_progress (athlete_id, stage_id, status, started_at)
  select
    new.id,
    id,
    case when id = coalesce(new.current_stage_id, first_stage_id)
      then 'in_progress'::public.stage_status
      else 'not_started'::public.stage_status
    end,
    case when id = coalesce(new.current_stage_id, first_stage_id) then now() else null end
  from public.pipeline_stages
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

with first_stages as (
  select distinct on (agency_id) agency_id, id as stage_id
  from public.pipeline_stages
  where is_active
  order by agency_id, order_index asc
)
update public.athletes a
set current_stage_id = fs.stage_id
from first_stages fs
where a.agency_id = fs.agency_id
  and a.current_stage_id is null
  and a.deleted_at is null;

insert into public.athlete_stage_progress (athlete_id, stage_id, status, started_at)
select a.id, a.current_stage_id, 'in_progress'::public.stage_status, now()
from public.athletes a
where a.current_stage_id is not null
on conflict (athlete_id, stage_id) do update
set status = case
    when public.athlete_stage_progress.status = 'not_started'
      then 'in_progress'::public.stage_status
    else public.athlete_stage_progress.status
  end,
  started_at = coalesce(public.athlete_stage_progress.started_at, excluded.started_at);

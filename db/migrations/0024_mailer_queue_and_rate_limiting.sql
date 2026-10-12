-- =============================================================================
-- Migration 0024: Mailer Persistent Queue, Rate Limiting & Autonomous Worker
-- =============================================================================
-- Aditiva e 100% idempotente.
-- Referências verificadas nas migrations 0001-0023:
-- - public.is_agency_admin() -> 0001_init.sql
-- - public.mailer_campaigns -> 0022_mailer_campaigns_and_metrics_rpc.sql
-- - public.recruit_email_logs -> 0016 / 0018 / 0022 / 0023
-- =============================================================================

-- 1. Evolução de mailer_campaigns para controle de estado, lotes e progresso
alter table public.mailer_campaigns
  add column if not exists status text not null default 'queued',
  add column if not exists total_recipients integer not null default 0,
  add column if not exists sent_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists suppressed_count integer not null default 0,
  add column if not exists current_batch integer not null default 0,
  add column if not exists total_batches integer not null default 1,
  add column if not exists batch_size integer not null default 150,
  add column if not exists delay_between_batches_sec integer not null default 60,
  add column if not exists delay_between_items_ms integer not null default 400,
  add column if not exists next_batch_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists last_error text;

-- Constraint de status na campanha (drop + add para idempotência)
alter table public.mailer_campaigns
  drop constraint if exists mailer_campaigns_status_check;

alter table public.mailer_campaigns
  add constraint mailer_campaigns_status_check
  check (status in ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled'));

create index if not exists idx_mailer_campaigns_status
  on public.mailer_campaigns (status);

-- 2. Tabela de Controle de Taxa Global do Provedor (mailer_rate_limits)
create table if not exists public.mailer_rate_limits (
  id text primary key default 'global_resend_limit',
  window_started_at timestamptz not null default timezone('utc', now()),
  dispatches_in_window integer not null default 0,
  max_dispatches_per_window integer not null default 150,
  window_duration_seconds integer not null default 60,
  last_batch_completed_at timestamptz,
  pause_between_batches_seconds integer not null default 60,
  locked_until timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

-- Inicializar linha padrão idempotentemente
insert into public.mailer_rate_limits (
  id,
  window_started_at,
  dispatches_in_window,
  max_dispatches_per_window,
  window_duration_seconds,
  pause_between_batches_seconds,
  updated_at
)
values (
  'global_resend_limit',
  timezone('utc', now()),
  0,
  150,
  60,
  60,
  timezone('utc', now())
)
on conflict (id) do nothing;

alter table public.mailer_rate_limits enable row level security;

drop policy if exists "Agency admin access on mailer_rate_limits" on public.mailer_rate_limits;
create policy "Agency admin access on mailer_rate_limits"
  on public.mailer_rate_limits for all
  to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

-- 3. Tabela da Fila Persistente de Disparos (mailer_queue)
create table if not exists public.mailer_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.mailer_campaigns(id) on delete cascade,
  coach_id uuid references public.coaches(id) on delete set null,
  recipient_email text not null,
  recipient_name text not null,
  university_name text,
  email_type text not null check (email_type in ('athlete_teaser', 'athlete_teaser_multi', 'catalog_general')),
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'retry', 'cancelled')),
  batch_number integer not null default 1,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  reserved_by text,
  reserved_at timestamptz,
  reservation_expires_at timestamptz,
  next_retry_at timestamptz,
  provider_message_id text,
  last_error text,
  error_code text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_mailer_queue_campaign_status
  on public.mailer_queue (campaign_id, status);

create index if not exists idx_mailer_queue_fetch
  on public.mailer_queue (status, next_retry_at, created_at);

create index if not exists idx_mailer_queue_reserved
  on public.mailer_queue (status, reservation_expires_at);

create index if not exists idx_mailer_queue_idempotency
  on public.mailer_queue (idempotency_key);

alter table public.mailer_queue enable row level security;

drop policy if exists "Agency admin full access on mailer_queue" on public.mailer_queue;
create policy "Agency admin full access on mailer_queue"
  on public.mailer_queue for all
  to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

-- 4. RPC: Reserva Atômica de Itens da Fila com SKIP LOCKED
create or replace function public.claim_mailer_queue_batch(
  p_worker_id text,
  p_batch_size integer default 150,
  p_lock_duration_sec integer default 120
)
returns setof public.mailer_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_lock_until timestamptz;
  v_campaign_running_ids uuid[];
begin
  -- Buscar IDs de campanhas ativas (running)
  select array_agg(id) into v_campaign_running_ids
  from public.mailer_campaigns
  where status = 'running'
    and (next_batch_at is null or next_batch_at <= v_now);

  if v_campaign_running_ids is null or cardinality(v_campaign_running_ids) = 0 then
    return;
  end if;

  v_lock_until := v_now + (p_lock_duration_sec || ' seconds')::interval;

  return query
  with to_claim as (
    select q.id
    from public.mailer_queue q
    where q.campaign_id = any(v_campaign_running_ids)
      and (
        q.status = 'pending'
        or (
          q.status = 'retry'
          and (q.next_retry_at is null or q.next_retry_at <= v_now)
          and q.attempts < q.max_attempts
        )
      )
    order by q.batch_number asc, q.created_at asc
    limit coalesce(p_batch_size, 150)
    for update skip locked
  )
  update public.mailer_queue q
  set
    status = 'processing',
    reserved_by = p_worker_id,
    reserved_at = v_now,
    reservation_expires_at = v_lock_until,
    attempts = q.attempts + 1
  from to_claim
  where q.id = to_claim.id
  returning q.*;
end;
$$;

-- 5. RPC: Recuperação de Reservas Abandonadas (Stale / Worker Crash)
create or replace function public.recover_stale_mailer_queue_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recovered integer := 0;
  v_now timestamptz := timezone('utc', now());
begin
  -- Retornar para 'retry' os que ainda têm tentativas restantes
  with recovered as (
    update public.mailer_queue
    set
      status = 'retry',
      reserved_by = null,
      reserved_at = null,
      reservation_expires_at = null,
      next_retry_at = v_now + interval '30 seconds',
      last_error = coalesce(last_error, 'Reservation expired before completion (worker timeout/crash)')
    where status = 'processing'
      and reservation_expires_at < v_now
      and attempts < max_attempts
    returning id
  )
  select count(*) into v_recovered from recovered;

  -- Marcar como 'failed' os que já atingiram max_attempts
  update public.mailer_queue
  set
    status = 'failed',
    reserved_by = null,
    reserved_at = null,
    reservation_expires_at = null,
    processed_at = v_now,
    last_error = coalesce(last_error, 'Exceeded max attempts after worker timeout/crash')
  where status = 'processing'
    and reservation_expires_at < v_now
    and attempts >= max_attempts;

  return v_recovered;
end;
$$;

-- Permissões estritas concedidas à service_role e usuários autenticados da agência
grant select, insert, update, delete on public.mailer_campaigns to authenticated, service_role;
grant select, insert, update, delete on public.mailer_rate_limits to authenticated, service_role;
grant select, insert, update, delete on public.mailer_queue to authenticated, service_role;

revoke execute on function public.claim_mailer_queue_batch from public;
grant execute on function public.claim_mailer_queue_batch to authenticated, service_role;

revoke execute on function public.recover_stale_mailer_queue_reservations from public;
grant execute on function public.recover_stale_mailer_queue_reservations to authenticated, service_role;

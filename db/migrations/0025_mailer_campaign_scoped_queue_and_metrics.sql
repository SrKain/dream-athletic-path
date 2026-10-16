-- =============================================================================
-- Migration 0025: Mailer Campaign-Scoped Queue Reservation, Lease & SQL Metrics
-- =============================================================================
-- Aditiva e 100% idempotente sobre a 0024.
-- Resolve:
-- 1. Reserva restrita por campanha específica (p_campaign_id) via FOR UPDATE SKIP LOCKED
-- 2. Lease de controle por sessão/aba para prevenção de concorrência simultânea
-- 3. Agregação SQL compacta de progresso em O(1) sem carregar linhas da fila para a aplicação
-- =============================================================================

-- 1. Lease de controle na tabela mailer_campaigns
alter table public.mailer_campaigns
  add column if not exists controller_id text,
  add column if not exists controller_lease_expires_at timestamptz;

create index if not exists idx_mailer_campaigns_controller
  on public.mailer_campaigns (controller_id, controller_lease_expires_at);

-- 2. RPC: Reserva Atômica Escopada por Campanha com SKIP LOCKED
create or replace function public.claim_mailer_queue_batch(
  p_worker_id text,
  p_batch_size integer default 2,
  p_lock_duration_sec integer default 120,
  p_campaign_id uuid default null
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
  -- Se p_campaign_id foi informado, validar exclusivamente esta campanha
  if p_campaign_id is not null then
    select array_agg(id) into v_campaign_running_ids
    from public.mailer_campaigns
    where id = p_campaign_id
      and status = 'running'
      and (next_batch_at is null or next_batch_at <= v_now);
  else
    -- Fallback: Buscar IDs de campanhas ativas (running)
    select array_agg(id) into v_campaign_running_ids
    from public.mailer_campaigns
    where status = 'running'
      and (next_batch_at is null or next_batch_at <= v_now);
  end if;

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
    limit coalesce(p_batch_size, 2)
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

-- 3. RPC: Aquisição e Renovação de Lease da Sessão Controladora
create or replace function public.acquire_mailer_campaign_lease(
  p_campaign_id uuid,
  p_controller_id text,
  p_lease_seconds integer default 15
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_expires_at timestamptz := v_now + (p_lease_seconds || ' seconds')::interval;
  v_updated integer := 0;
begin
  update public.mailer_campaigns
  set
    controller_id = p_controller_id,
    controller_lease_expires_at = v_expires_at
  where id = p_campaign_id
    and status in ('running', 'queued')
    and (
      controller_id is null
      or controller_id = p_controller_id
      or controller_lease_expires_at is null
      or controller_lease_expires_at < v_now
    );

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- 4. RPC: Agregação SQL Compacta de Progresso em O(1)
create or replace function public.get_mailer_campaign_progress_summary(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_counts record;
  v_result jsonb;
  v_now timestamptz := timezone('utc', now());
  v_cooldown_remaining_sec integer := 0;
begin
  select * into v_campaign
  from public.mailer_campaigns
  where id = p_campaign_id;

  if not found then
    return null;
  end if;

  -- Agregação compacta e rápida via índices sem transferir linhas
  select
    count(*) as total_items,
    count(*) filter (where status = 'sent') as sent_count,
    count(*) filter (where status = 'failed') as failed_count,
    count(*) filter (where status in ('pending', 'retry')) as pending_count,
    count(*) filter (where status = 'processing') as processing_count,
    count(*) filter (where status = 'cancelled') as cancelled_count
  into v_counts
  from public.mailer_queue
  where campaign_id = p_campaign_id;

  if v_campaign.next_batch_at is not null and v_campaign.next_batch_at > v_now then
    v_cooldown_remaining_sec := greatest(0, ceil(extract(epoch from (v_campaign.next_batch_at - v_now)))::integer);
  end if;

  v_result := jsonb_build_object(
    'campaign_id', v_campaign.id,
    'status', v_campaign.status,
    'subject', v_campaign.subject,
    'total_recipients', coalesce(v_campaign.total_recipients, v_counts.total_items),
    'sent_count', v_counts.sent_count,
    'failed_count', v_counts.failed_count,
    'suppressed_count', coalesce(v_campaign.suppressed_count, 0),
    'pending_count', v_counts.pending_count,
    'processing_count', v_counts.processing_count,
    'cancelled_count', v_counts.cancelled_count,
    'current_batch', coalesce(v_campaign.current_batch, 1),
    'total_batches', coalesce(v_campaign.total_batches, 1),
    'batch_size', coalesce(v_campaign.batch_size, 150),
    'next_batch_at', v_campaign.next_batch_at,
    'cooldown_remaining_sec', v_cooldown_remaining_sec,
    'started_at', v_campaign.started_at,
    'completed_at', v_campaign.completed_at,
    'last_error', v_campaign.last_error,
    'controller_id', v_campaign.controller_id
  );

  return v_result;
end;
$$;

-- Permissões
revoke execute on function public.claim_mailer_queue_batch(text, integer, integer, uuid) from public;
grant execute on function public.claim_mailer_queue_batch(text, integer, integer, uuid) to authenticated, service_role;

revoke execute on function public.acquire_mailer_campaign_lease from public;
grant execute on function public.acquire_mailer_campaign_lease to authenticated, service_role;

revoke execute on function public.get_mailer_campaign_progress_summary from public;
grant execute on function public.get_mailer_campaign_progress_summary to authenticated, service_role;

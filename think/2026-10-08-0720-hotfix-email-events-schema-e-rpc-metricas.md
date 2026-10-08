# Planejamento — TASK-088: Hotfix do Schema de email_events, recruit_email_logs e RPCs de Métricas do Mailer

- **Data/Hora:** 2026-10-08 07:20 Local (14:20 UTC)
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Engineer)
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** `[AGUARDANDO APROVAÇÃO HUMANA]`
- **Arquivo de Plano:** `think/2026-10-08-0720-hotfix-email-events-schema-e-rpc-metricas.md`

---

## 1. Diagnóstico e Causa-Raiz (Conferido contra SQL Real 0001–0022)

1. **`email_events`**:
   - Criada na migration `0021_email_events_and_mailer_metrics.sql` com:
     - `id uuid primary key default gen_random_uuid()`
     - `provider text not null default 'resend'`
     - `provider_event_id text not null` (índice único)
     - `provider_email_id text not null`
     - `event_type text not null`
     - `recipient text not null`
     - `occurred_at timestamptz not null default timezone('utc', now())`
     - `payload jsonb not null default '{}'::jsonb`
     - `created_at timestamptz not null default timezone('utc', now())`
   - Na migration `0022_mailer_campaigns_and_metrics_rpc.sql` ganhou:
     - `campaign_id uuid references public.mailer_campaigns(id)`
     - `athlete_id uuid references public.athletes(id)`
     - `clicked_url text`
     - `clicked_at timestamptz`
     - `user_agent text`
     - `is_probable_automated boolean not null default false`
   - **Inexistentes no banco**: `svix_id`, `recipient_email`, `subject`, `tags` e `event_id`.
   - **Problema no Webhook (`resend-webhook.server.ts`)**: grava `svix_id`, `event_id`, `recipient_email`, `subject`, `tags` e tenta `upsert` com `onConflict: "svix_id"`. Como a coluna e o índice único em `svix_id` não existem no PostgreSQL, o PostgREST rejeita a requisição, o webhook responde HTTP 500 e nenhum evento é salvo. Além disso, `provider_event_id` e `recipient` são `NOT NULL` na 0021, o que falharia se não fossem preenchidos.

2. **`recruit_email_logs`**:
   - Criada na 0016 com: `id`, `athlete_id`, `coach_id (uuid)`, `subject`, `status`, `error_message`, `sent_at`.
   - Na 0018 ganhou: `email_type`, `recipient_email`, `recipient_name`, `university_name` (e `athlete_id` virou nullable).
   - Na 0021 ganhou: `provider_id`.
   - Na 0022 ganhou: `campaign_id`, `athlete_ids (uuid[])`.
   - **Inexistentes no banco**: `university_id`, `coach_role`.
   - **Problema na RPC `get_mailer_dashboard_metrics` (0022)**:
     - Linha 264: `left join public.universities u on u.id = l.university_id` (coluna `l.university_id` não existe).
     - Linha 265: `left join public.coaches c on c.id::text = l.coach_id` (`c.id` é UUID e `l.coach_id` é UUID; comparar `text = uuid` causa erro de tipo `operator does not exist: text = uuid`).
     - Linhas 284, 287, 288: referenciam `e.svix_id`, `e.recipient_email` e `e.subject`, inexistentes em `email_events`.

3. **Fallback em `mailer-metrics.server.ts`**:
   - Linha 469 seleciona `recipient_email, subject` de `email_events`, falhando também no fallback.
   - Esconde o erro da RPC com `console.warn` em vez de `console.error` e não surfaça o erro para o usuário no dashboard.

---

## 2. Escopo da Solução

### A) Nova Migration `db/migrations/0023_fix_email_events_schema_and_metrics_rpc.sql` (Aditiva e Idempotente)
1. **`public.email_events`**:
   - `add column if not exists svix_id text;`
   - `add column if not exists recipient_email text;`
   - `add column if not exists subject text;`
   - `add column if not exists tags jsonb not null default '{}'::jsonb;`
   - `alter table public.email_events alter column provider_event_id drop not null;`
   - `alter table public.email_events alter column recipient drop not null;`
   - Backfill idempotente:
     - `recipient_email = coalesce(recipient_email, lower(trim(recipient)));`
     - `svix_id = coalesce(svix_id, provider_event_id);`
   - Criar índice UNIQUE COMPLETO (sem cláusula WHERE):
     - `create unique index if not exists idx_email_events_svix_id on public.email_events (svix_id);`
   - Índices de performance:
     - `create index if not exists idx_email_events_recipient_email_lower on public.email_events (lower(trim(recipient_email)));`
2. **`public.recruit_email_logs`**:
   - Adicionar `university_id uuid references public.universities(id) on delete set null;`
   - Adicionar `coach_role text;`
   - `create index if not exists idx_recruit_email_logs_university_id on public.recruit_email_logs (university_id);`
3. **RPC `public.get_mailer_dashboard_metrics` (Recriada com `CREATE OR REPLACE`)**:
   - Corrigir join de universidades para usar `university_id` quando preenchido e fallback seguro por nome `lower(trim(u.name)) = lower(trim(l.university_name))`.
   - Corrigir join de coaches: `c.id = l.coach_id` (UUID = UUID).
   - Utilizar as colunas agora existentes `e.svix_id`, `e.recipient_email` (com fallback para `e.recipient`), `e.subject`.
   - Mesma assinatura, `language plpgsql`, `security definer`, `set search_path = public`, `revoke execute ... from public, anon, authenticated; grant execute ... to service_role;`.
4. **RPC `public.get_mailer_filter_options` (Recriada com `CREATE OR REPLACE`)**:
   - Garantir mesma assinatura e permissões estritas para `service_role`.

---

### B) Código da Aplicação
1. **`src/lib/email/resend-webhook.server.ts`**:
   - Remover gravação da coluna fictícia `event_id`.
   - Manter gravação de `svix_id`, `event_type`, `provider_email_id`, `recipient_email`, `subject`, `campaign_id`, `athlete_id`, `clicked_url`, `clicked_at`, `user_agent`, `is_probable_automated`, `occurred_at`, `tags` e `payload`.
   - Preencher também `provider_event_id: uniqueSvixId` e `recipient: email` para manter retrocompatibilidade com logs legados da 0021.
2. **`src/lib/email/mailer-metrics.server.ts`**:
   - Fallback de projeção enxuta alinhado: seleciona colunas reais.
   - Quando a RPC falhar (`metricsRpcRes.error`), registrar com `console.error` (e não `warn`) e retornar `rpcError: metricsRpcRes.error.message` no objeto de métricas.
3. **`src/components/mailer-metrics-dashboard.tsx`**:
   - Exibir alerta visível `Alert` no topo do dashboard caso `metrics.rpcError` venha preenchido ("Metrics RPC Error: <mensagem> — exibindo fallback de projeção").
4. **Script de Verificação SQL (`db/migrations/verify-0023.sql`)**:
   - Script para execução no SQL Editor do Supabase contendo:
     1. Teste de INSERT em `email_events` com colunas do webhook e rollback.
     2. `SELECT public.get_mailer_dashboard_metrics(30, null, null, null);`
     3. `SELECT public.get_mailer_filter_options();`
5. **Teste Vitest de Integridade de Schema (`src/lib/email/schema-integrity.test.ts`)**:
   - Lê os arquivos de migração `0001` até `0023`.
   - Extrai todas as colunas declaradas em `email_events` e `recruit_email_logs`.
   - Valida que as colunas gravadas em `resend-webhook.server.ts` e `recruit-email.server.ts` existem no schema.
6. **Script de Reprocessamento (`scripts/backfill-resend-events.ts`)**:
   - Lê os últimos N envios de `recruit_email_logs` com `provider_id`.
   - Consulta `resend.emails.get(provider_id)` da API oficial Resend.
   - Registra eventos de status recuperados em `email_events`.
   - Documentação no `CERNE.md` sobre como reenviar eventos falhados pelo dashboard do Resend (Webhooks → Attempt → Resend).

---

## 3. SQL Completo Proposto para a Migration 0023

```sql
-- =============================================================================
-- Migration 0023: Fix email_events schema, recruit_email_logs and Mailer Metrics RPCs
-- =============================================================================
-- Aditiva e idempotente.

-- 1. email_events: Adicionar colunas reais utilizadas pelo webhook e relatórios
alter table public.email_events
  add column if not exists svix_id text,
  add column if not exists recipient_email text,
  add column if not exists subject text,
  add column if not exists tags jsonb not null default '{}'::jsonb;

-- 2. Tornar provider_event_id e recipient opcionais (drop not null) mantendo compatibilidade
alter table public.email_events
  alter column provider_event_id drop not null,
  alter column recipient drop not null;

-- 3. Backfill idempotente de recipient_email e svix_id
update public.email_events
set
  recipient_email = coalesce(recipient_email, lower(trim(recipient))),
  svix_id = coalesce(svix_id, provider_event_id)
where recipient_email is null or svix_id is null;

-- 4. Índice UNIQUE completo em svix_id para suportar upsert onConflict: "svix_id"
create unique index if not exists idx_email_events_svix_id
  on public.email_events (svix_id);

-- 5. Índices de busca e agregação
create index if not exists idx_email_events_recipient_email_lower
  on public.email_events (lower(trim(recipient_email)));

-- 6. recruit_email_logs: Adicionar university_id e coach_role para integridade futura
alter table public.recruit_email_logs
  add column if not exists university_id uuid references public.universities(id) on delete set null,
  add column if not exists coach_role text;

create index if not exists idx_recruit_email_logs_university_id
  on public.recruit_email_logs (university_id);

-- 7. RPC: Opções de Filtro do Dashboard (Recriada)
create or replace function public.get_mailer_filter_options()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaigns jsonb;
  v_athletes jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'createdAt', c.created_at,
        'mode', c.mode,
        'subject', c.subject,
        'recipientsCount', c.recipients_count
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_campaigns
  from (
    select id, created_at, mode, subject, recipients_count
    from public.mailer_campaigns
    order by created_at desc
    limit 200
  ) c;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'name', a.full_name,
        'slug', a.slug,
        'position', p.name_en
      )
      order by a.full_name asc
    ),
    '[]'::jsonb
  )
  into v_athletes
  from public.athletes a
  left join public.positions p on p.id = a.position_id
  where a.deleted_at is null;

  return jsonb_build_object(
    'campaigns', v_campaigns,
    'athletes', v_athletes
  );
end;
$$;

revoke execute on function public.get_mailer_filter_options() from public, anon, authenticated;
grant execute on function public.get_mailer_filter_options() to service_role;

-- 8. RPC: get_mailer_dashboard_metrics (Corrigida e Recriada)
create or replace function public.get_mailer_dashboard_metrics(
  p_days integer default 30,
  p_campaign_id uuid default null,
  p_athlete_id uuid default null,
  p_division text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
  v_result jsonb;
begin
  if p_days is not null and p_days > 0 then
    v_cutoff := timezone('utc', now()) - make_interval(days => p_days);
  else
    v_cutoff := null;
  end if;

  with filtered_logs as (
    select
      l.id as log_id,
      l.campaign_id,
      l.athlete_id,
      case
        when cardinality(l.athlete_ids) > 0 then l.athlete_ids
        when l.athlete_id is not null then array[l.athlete_id]
        else '{}'::uuid[]
      end as effective_athlete_ids,
      l.coach_id,
      lower(trim(l.recipient_email)) as recipient_email,
      l.subject,
      l.status,
      l.provider_id,
      l.sent_at,
      l.university_name,
      u.state as university_state,
      u.league as university_league,
      c.name as legacy_coach_name,
      c.institution as legacy_institution
    from public.recruit_email_logs l
    left join public.universities u on (
      (l.university_id is not null and u.id = l.university_id)
      or (l.university_id is null and l.university_name is not null and lower(trim(u.name)) = lower(trim(l.university_name)))
    )
    left join public.coaches c on c.id = l.coach_id
    where (v_cutoff is null or l.sent_at >= v_cutoff)
      and (p_campaign_id is null or l.campaign_id = p_campaign_id)
      and (
        p_athlete_id is null
        or l.athlete_id = p_athlete_id
        or p_athlete_id = any(l.athlete_ids)
      )
      and (
        p_division is null
        or p_division = ''
        or p_division = 'ALL'
        or u.league = p_division
      )
  ),
  matched_events_raw as (
    select
      e.id,
      e.svix_id,
      e.event_type,
      e.provider_email_id,
      lower(trim(coalesce(fl.recipient_email, e.recipient_email, e.recipient))) as recipient_email,
      coalesce(e.subject, fl.subject) as subject,
      coalesce(e.campaign_id, fl.campaign_id) as campaign_id,
      coalesce(e.athlete_id, fl.athlete_id) as athlete_id,
      fl.effective_athlete_ids,
      fl.coach_id,
      fl.university_name,
      fl.university_state,
      fl.university_league,
      fl.legacy_coach_name,
      fl.legacy_institution,
      e.clicked_url,
      coalesce(e.clicked_at, e.occurred_at) as effective_clicked_at,
      e.user_agent,
      e.is_probable_automated as stateless_automated,
      e.occurred_at,
      case
        when e.event_type = 'email.opened'
          and e.user_agent is not null
          and e.user_agent ~* '(GoogleImageProxy|ggpht\.com|YahooMailProxy)'
        then true
        else false
      end as is_privacy_proxy_open
    from public.email_events e
    inner join filtered_logs fl
      on e.provider_email_id is not null
      and e.provider_email_id = fl.provider_id
  ),
  burst_flagged_clicks as (
    select
      c1.id as event_id,
      true as is_burst_click
    from matched_events_raw c1
    join matched_events_raw c2
      on c1.provider_email_id = c2.provider_email_id
      and c1.event_type = 'email.clicked'
      and c2.event_type = 'email.clicked'
      and abs(extract(epoch from (c2.effective_clicked_at - c1.effective_clicked_at))) <= 5
    where c1.clicked_url is not null
      and c2.clicked_url is not null
    group by c1.id
    having count(distinct c2.clicked_url) >= 3
  ),
  matched_events as (
    select
      mer.*,
      case
        when mer.event_type = 'email.clicked'
          then (mer.stateless_automated or coalesce(bfc.is_burst_click, false))
        else false
      end as is_automated_click
    from matched_events_raw mer
    left join burst_flagged_clicks bfc on bfc.event_id = mer.id
  ),
  log_totals as (
    select
      count(*) filter (where status = 'sent')::int as sent_count,
      count(*) filter (where status = 'failed')::int as log_failed_count,
      count(distinct provider_id) filter (where status = 'sent' and provider_id is not null)::int as distinct_sent_providers
    from filtered_logs
  ),
  event_totals as (
    select
      count(distinct provider_email_id) filter (
        where event_type in ('email.delivered', 'email.opened', 'email.clicked')
      )::int as delivered_unique,
      count(distinct provider_email_id) filter (
        where event_type = 'email.opened'
      )::int as opened_unique,
      count(*) filter (
        where event_type = 'email.opened'
      )::int as opened_total,
      count(*) filter (
        where event_type = 'email.opened' and is_privacy_proxy_open = true
      )::int as opened_proxy_total,
      count(distinct provider_email_id) filter (
        where event_type = 'email.clicked' and is_automated_click = false
      )::int as clicked_human_unique,
      count(distinct provider_email_id) filter (
        where event_type = 'email.clicked'
      )::int as clicked_any_unique,
      count(*) filter (
        where event_type = 'email.clicked' and is_automated_click = false
      )::int as clicked_human_total,
      count(*) filter (
        where event_type = 'email.clicked'
      )::int as clicked_any_total,
      count(*) filter (
        where event_type = 'email.clicked' and is_automated_click = true
      )::int as clicked_automated_total,
      count(distinct provider_email_id) filter (
        where event_type = 'email.bounced'
      )::int as bounced_unique,
      count(distinct provider_email_id) filter (
        where event_type = 'email.complained'
      )::int as complained_unique,
      count(distinct provider_email_id) filter (
        where event_type = 'email.failed'
      )::int as event_failed_unique,
      count(distinct provider_email_id) filter (
        where event_type = 'email.suppressed'
      )::int as suppressed_unique,
      count(distinct provider_email_id) filter (
        where event_type = 'email.delivery_delayed'
      )::int as delayed_unique,
      count(distinct recipient_email) filter (
        where event_type = 'email.clicked' and is_automated_click = false
      )::int as hot_coaches_count
    from matched_events
  ),
  daily_logs as (
    select
      to_char(sent_at at time zone 'utc', 'YYYY-MM-DD') as day_key,
      count(*) filter (where status = 'sent')::int as sent
    from filtered_logs
    group by 1
  ),
  daily_ev as (
    select
      to_char(occurred_at at time zone 'utc', 'YYYY-MM-DD') as day_key,
      count(distinct provider_email_id) filter (where event_type = 'email.delivered')::int as delivered,
      count(distinct provider_email_id) filter (where event_type = 'email.opened')::int as opened,
      count(distinct provider_email_id) filter (where event_type = 'email.clicked' and is_automated_click = false)::int as clicked_human,
      count(distinct provider_email_id) filter (where event_type = 'email.bounced')::int as bounced
    from matched_events
    group by 1
  ),
  daily_combined as (
    select
      coalesce(dl.day_key, de.day_key) as date,
      coalesce(dl.sent, 0) as sent,
      coalesce(de.delivered, 0) as delivered,
      coalesce(de.opened, 0) as opened,
      coalesce(de.clicked_human, 0) as clicked,
      coalesce(de.bounced, 0) as bounced
    from daily_logs dl
    full outer join daily_ev de on dl.day_key = de.day_key
    order by 1 asc
  ),
  campaign_rollup as (
    select
      mc.id,
      mc.created_at,
      mc.mode,
      mc.subject,
      mc.recipients_count,
      count(distinct fl.log_id) filter (where fl.status = 'sent')::int as sent,
      count(distinct me.provider_email_id) filter (
        where me.event_type in ('email.delivered', 'email.opened', 'email.clicked')
      )::int as delivered,
      count(distinct me.provider_email_id) filter (
        where me.event_type = 'email.opened'
      )::int as unique_opens,
      count(distinct me.provider_email_id) filter (
        where me.event_type = 'email.clicked' and me.is_automated_click = false
      )::int as unique_human_clicks,
      count(distinct me.provider_email_id) filter (
        where me.event_type = 'email.bounced'
      )::int as bounced
    from public.mailer_campaigns mc
    inner join filtered_logs fl on fl.campaign_id = mc.id
    left join matched_events me on me.provider_email_id = fl.provider_id
    group by mc.id, mc.created_at, mc.mode, mc.subject, mc.recipients_count
    order by mc.created_at desc
    limit 50
  ),
  coach_rollup as (
    select
      me.recipient_email as coach_email,
      max(coalesce(me.legacy_coach_name, split_part(me.recipient_email, '@', 1))) as coach_name,
      max(coalesce(me.university_name, me.legacy_institution, '')) as university_name,
      max(coalesce(me.university_league, '')) as division,
      max(coalesce(me.university_state, '')) as state,
      count(distinct me.provider_email_id) filter (where me.event_type = 'email.opened')::int as unique_opens,
      count(*) filter (where me.event_type = 'email.opened')::int as total_opens,
      count(distinct me.provider_email_id) filter (
        where me.event_type = 'email.clicked' and me.is_automated_click = false
      )::int as unique_human_clicks,
      count(*) filter (
        where me.event_type = 'email.clicked' and me.is_automated_click = false
      )::int as total_human_clicks,
      max(me.occurred_at) filter (where me.event_type = 'email.opened') as last_opened_at,
      max(me.effective_clicked_at) filter (
        where me.event_type = 'email.clicked' and me.is_automated_click = false
      ) as last_clicked_at,
      coalesce(
        array_agg(distinct me.clicked_url) filter (
          where me.event_type = 'email.clicked'
            and me.is_automated_click = false
            and me.clicked_url is not null
        ),
        '{}'::text[]
      ) as clicked_links
    from matched_events me
    where me.event_type in ('email.opened', 'email.clicked')
    group by me.recipient_email
    having count(*) filter (
      where me.event_type = 'email.opened'
        or (me.event_type = 'email.clicked' and me.is_automated_click = false)
    ) > 0
    order by
      count(*) filter (where me.event_type = 'email.clicked' and me.is_automated_click = false) desc,
      count(*) filter (where me.event_type = 'email.opened') desc,
      max(me.occurred_at) desc
    limit 100
  ),
  athlete_rollup as (
    select
      a.id as athlete_id,
      a.full_name as athlete_name,
      a.slug as athlete_slug,
      coalesce(p.name_en, 'Athlete') as position,
      count(distinct ale.campaign_id)::int as campaigns_count,
      count(distinct ale.log_id) filter (where ale.status = 'sent')::int as emails_sent,
      count(distinct me.provider_email_id) filter (
        where me.event_type in ('email.delivered', 'email.opened', 'email.clicked')
      )::int as delivered,
      count(distinct me.provider_email_id) filter (
        where me.event_type = 'email.opened'
      )::int as unique_opens,
      count(distinct me.provider_email_id) filter (
        where me.event_type = 'email.clicked'
          and me.is_automated_click = false
          and (
            me.athlete_id = a.id
            or cardinality(ale.effective_athlete_ids) = 1
            or (me.clicked_url is not null and me.clicked_url like '%' || a.slug || '%')
          )
      )::int as unique_human_clicks,
      count(*) filter (
        where me.event_type = 'email.clicked'
          and me.is_automated_click = false
          and me.clicked_url is not null
          and (
            me.clicked_url like '%youtube.com%'
            or me.clicked_url like '%youtu.be%'
            or me.clicked_url like '%utm_content=watch_film_%'
          )
          and (
            me.athlete_id = a.id
            or (me.clicked_url like '%' || a.slug || '%')
          )
      )::int as film_clicks,
      count(*) filter (
        where me.event_type = 'email.clicked'
          and me.is_automated_click = false
          and me.clicked_url is not null
          and (
            me.clicked_url like '%/athlete/' || a.slug || '%'
            or me.clicked_url like '%utm_content=full_profile_' || a.slug || '%'
          )
      )::int as profile_clicks,
      (
        select count(*)::int
        from public.coach_interest_signals cis
        where cis.athlete_id = a.id
          and (v_cutoff is null or cis.created_at >= v_cutoff)
      ) as not_fit_signals
    from public.athletes a
    left join public.positions p on p.id = a.position_id
    inner join (
      select
        unnest(fl.effective_athlete_ids) as athlete_id,
        fl.effective_athlete_ids,
        fl.log_id,
        fl.campaign_id,
        fl.status,
        fl.provider_id
      from filtered_logs fl
      where cardinality(fl.effective_athlete_ids) > 0
    ) ale on ale.athlete_id = a.id
    left join matched_events me on me.provider_email_id = ale.provider_id
    group by a.id, a.full_name, a.slug, p.name_en
    order by unique_human_clicks desc, unique_opens desc, emails_sent desc
    limit 50
  ),
  recent_ev as (
    select
      me.id,
      me.event_type,
      me.provider_email_id,
      me.recipient_email,
      me.subject,
      me.clicked_url,
      me.user_agent,
      me.is_automated_click,
      me.is_privacy_proxy_open,
      me.occurred_at,
      me.university_name,
      me.university_league
    from matched_events me
    order by me.occurred_at desc
    limit 100
  )
  select jsonb_build_object(
    'kpis', (
      select jsonb_build_object(
        'sent', lt.sent_count,
        'delivered', et.delivered_unique,
        'uniqueOpens', et.opened_unique,
        'totalOpens', et.opened_total,
        'proxyOpens', et.opened_proxy_total,
        'uniqueHumanClicks', et.clicked_human_unique,
        'uniqueTotalClicks', et.clicked_any_unique,
        'totalHumanClicks', et.clicked_human_total,
        'totalClicks', et.clicked_any_total,
        'automatedClicks', et.clicked_automated_total,
        'bounced', et.bounced_unique,
        'complained', et.complained_unique,
        'failed', lt.log_failed_count + et.event_failed_unique,
        'suppressed', et.suppressed_unique,
        'delayed', et.delayed_unique,
        'hotCoachesCount', et.hot_coaches_count,
        'deliveryRate', case
          when lt.sent_count > 0 then least(100, round((et.delivered_unique::numeric / lt.sent_count::numeric) * 100, 1))
          else 0
        end,
        'openRate', case
          when greatest(et.delivered_unique, et.opened_unique) > 0
            then least(100, round((et.opened_unique::numeric / greatest(et.delivered_unique, et.opened_unique)::numeric) * 100, 1))
          else 0
        end,
        'clickRate', case
          when greatest(et.delivered_unique, et.clicked_human_unique) > 0
            then least(100, round((et.clicked_human_unique::numeric / greatest(et.delivered_unique, et.clicked_human_unique)::numeric) * 100, 1))
          else 0
        end,
        'clickToOpenRate', case
          when greatest(et.opened_unique, et.clicked_human_unique) > 0
            then least(100, round((et.clicked_human_unique::numeric / greatest(et.opened_unique, et.clicked_human_unique)::numeric) * 100, 1))
          else 0
        end,
        'bounceRate', case
          when lt.sent_count > 0 then least(100, round((et.bounced_unique::numeric / lt.sent_count::numeric) * 100, 1))
          else 0
        end
      )
      from log_totals lt, event_totals et
    ),
    'dailySeries', coalesce((select jsonb_agg(row_to_json(dc)) from daily_combined dc), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(row_to_json(cr)) from campaign_rollup cr), '[]'::jsonb),
    'engagedCoaches', coalesce((select jsonb_agg(row_to_json(cor)) from coach_rollup cor), '[]'::jsonb),
    'athletePerformance', coalesce((select jsonb_agg(row_to_json(ar)) from athlete_rollup ar), '[]'::jsonb),
    'recentEvents', coalesce((select jsonb_agg(row_to_json(rev)) from recent_ev rev), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_mailer_dashboard_metrics(integer, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_mailer_dashboard_metrics(integer, uuid, uuid, text) to service_role;
```

---

## 4. Relação de Colunas Referenciadas e suas Migrations de Origem

| Tabela | Coluna Referenciada | Migration de Origem | Status / Correção na 0023 |
| :--- | :--- | :--- | :--- |
| `email_events` | `id` | `0021` | Existente |
| `email_events` | `svix_id` | `0023` (adicionada) | Inexistente na 0021/0022; criada na 0023 com unique index completo |
| `email_events` | `provider_event_id` | `0021` | Tornado opcional (drop not null) na 0023 para compatibilidade |
| `email_events` | `provider_email_id` | `0021` | Existente |
| `email_events` | `event_type` | `0021` | Existente |
| `email_events` | `recipient` | `0021` | Tornado opcional (drop not null) na 0023 |
| `email_events` | `recipient_email` | `0023` (adicionada) | Inexistente na 0021/0022; criada na 0023 com backfill de `recipient` |
| `email_events` | `subject` | `0023` (adicionada) | Inexistente na 0021/0022; criada na 0023 |
| `email_events` | `tags` | `0023` (adicionada) | Inexistente na 0021/0022; criada na 0023 como `jsonb not null default '{}'::jsonb` |
| `email_events` | `campaign_id` | `0022` | Existente |
| `email_events` | `athlete_id` | `0022` | Existente |
| `email_events` | `clicked_url` | `0022` | Existente |
| `email_events` | `clicked_at` | `0022` | Existente |
| `email_events` | `user_agent` | `0022` | Existente |
| `email_events` | `is_probable_automated` | `0022` | Existente |
| `email_events` | `occurred_at` | `0021` | Existente |
| `email_events` | `payload` | `0021` | Existente |
| `recruit_email_logs` | `id` | `0016` | Existente |
| `recruit_email_logs` | `athlete_id` | `0016` (tornada nullable na `0018`) | Existente |
| `recruit_email_logs` | `athlete_ids` | `0022` | Existente |
| `recruit_email_logs` | `coach_id` | `0016` | Existente (UUID) |
| `recruit_email_logs` | `subject` | `0016` | Existente |
| `recruit_email_logs` | `status` | `0016` | Existente |
| `recruit_email_logs` | `error_message` | `0016` | Existente |
| `recruit_email_logs` | `sent_at` | `0016` | Existente |
| `recruit_email_logs` | `email_type` | `0018` | Existente |
| `recruit_email_logs` | `recipient_email` | `0018` | Existente |
| `recruit_email_logs` | `recipient_name` | `0018` | Existente |
| `recruit_email_logs` | `university_name` | `0018` | Existente |
| `recruit_email_logs` | `provider_id` | `0021` | Existente |
| `recruit_email_logs` | `campaign_id` | `0022` | Existente |
| `recruit_email_logs` | `university_id` | `0023` (adicionada) | Criada na 0023 como FK opcional para universities |
| `recruit_email_logs` | `coach_role` | `0023` (adicionada) | Criada na 0023 |
| `universities` | `id, name, state, league` | `0018` | Existente |
| `coaches` | `id, name, institution` | `0016` | Existente (`id` é UUID) |
| `mailer_campaigns` | `id, created_at, mode, subject, recipients_count` | `0022` | Existente |
| `athletes` | `id, full_name, slug, position_id, deleted_at` | `0001` | Existente |
| `positions` | `id, name_en` | `0001` / `0013` | Existente |
| `coach_interest_signals` | `athlete_id, created_at` | `0020` | Existente |

---

## 5. Nota de Rollback da Migration 0023

```sql
-- ROLLBACK NOTA:
-- Se necessário reverter a 0023, execute no SQL Editor do Supabase:
-- drop index if exists idx_email_events_svix_id;
-- drop index if exists idx_email_events_recipient_email_lower;
-- drop index if exists idx_recruit_email_logs_university_id;
-- alter table public.email_events drop column if exists svix_id, drop column if exists recipient_email, drop column if exists subject, drop column if exists tags;
-- alter table public.recruit_email_logs drop column if exists university_id, drop column if exists coach_role;
```

---

## 6. Verificação de Smoke Test para o SQL Editor do Supabase (`db/migrations/verify-0023.sql`)

```sql
-- =============================================================================
-- Smoke Test da Migration 0023 para rodar no Supabase SQL Editor
-- =============================================================================

-- Teste 1: Inserção e deleção segura em email_events com as colunas que o webhook grava
do $$
declare
  v_test_id uuid;
begin
  insert into public.email_events (
    svix_id,
    event_type,
    provider_email_id,
    recipient_email,
    subject,
    tags,
    occurred_at,
    payload
  ) values (
    'test_svix_' || gen_random_uuid()::text,
    'email.opened',
    'test_provider_' || gen_random_uuid()::text,
    'smoke-test-coach@stanford.edu',
    'Smoke Test Subject',
    '{"test": "true"}'::jsonb,
    now(),
    '{"smoke_test": true}'::jsonb
  ) returning id into v_test_id;

  if v_test_id is null then
    raise exception 'Falha ao inserir evento de teste em email_events!';
  end if;

  delete from public.email_events where id = v_test_id;
  raise notice 'Teste 1 PASSOU: email_events aceita perfeitamente as colunas do webhook!';
end $$;

-- Teste 2: Execução de get_mailer_dashboard_metrics(30, null, null, null)
-- Resultado esperado: JSONB contendo as chaves 'kpis', 'dailySeries', 'campaigns', 'engagedCoaches', 'athletePerformance', 'recentEvents'
select public.get_mailer_dashboard_metrics(30, null, null, null);

-- Teste 3: Execução de get_mailer_filter_options()
-- Resultado esperado: JSONB contendo 'campaigns' e 'athletes'
select public.get_mailer_filter_options();
```

---

## 7. Passos Operacionais de Execução

1. Criar `db/migrations/0023_fix_email_events_schema_and_metrics_rpc.sql`.
2. Criar `db/migrations/verify-0023.sql`.
3. Atualizar `src/lib/email/resend-webhook.server.ts`:
   - Remover `event_id`.
   - Garantir preenchimento simultâneo de `provider_event_id: uniqueSvixId` e `recipient: email` para compatibilidade total.
4. Atualizar `src/lib/email/mailer-metrics.server.ts`:
   - Atualizar queries de fallback.
   - Surfaçar `rpcError` e logar com `console.error`.
5. Atualizar `src/components/mailer-metrics-dashboard.tsx`:
   - Adicionar exibição do banner de erro da RPC quando `metrics.rpcError` vier preenchido.
6. Criar `src/lib/email/schema-integrity.test.ts`:
   - Teste vitest que lê todas as migrations SQL e garante que o webhook só grava colunas que existem.
7. Criar `scripts/backfill-resend-events.ts`:
   - Script para recuperar eventos via Resend API quando necessário.
8. Executar bateria completa de validação:
   - `bun run lint`
   - `bun run typecheck`
   - `bun run test` (todos os testes passando, incluindo o novo teste de integridade de schema)
   - `bun run build` / `compile_applet`
9. Atualizar `CERNE.md` e `BACKLOGER.md`.

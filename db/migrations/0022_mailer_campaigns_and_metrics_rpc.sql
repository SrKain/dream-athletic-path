-- =============================================================================
-- Migration 0022: Mailer Campaigns, Accurate Attribution & Server-Side Metrics RPCs
-- =============================================================================
-- Aditiva e idempotente.
-- Referências verificadas nas migrations 0001-0021:
-- - public.is_agency_admin() -> 0001_init.sql
-- - public.athletes(id, full_name, slug, position_id) -> 0001_init.sql
-- - public.positions(id, name_en) -> 0001_init.sql / 0013_full_english_pivot_and_course_of_interest.sql
-- - public.coaches(id, name, email, institution) -> 0016_coaches_and_recruit_emails.sql
-- - public.recruit_email_logs(id, athlete_id, coach_id, recipient_email, subject, status, provider_id, error_message, sent_by, sent_at, email_type, university_id, coach_role) -> 0016 & 0018
-- - public.universities(id, name, state, league, coaches) -> 0018_universities_and_mailer.sql
-- - public.coach_interest_signals(id, coach_id, coach_email, reason, athlete_id, athlete_name, position, created_at, expires_at) -> 0020_interest_signals_and_suppression_levels.sql
-- - public.email_events(id, svix_id, event_type, provider_email_id, recipient_email, subject, payload, occurred_at, created_at) -> 0021_email_events_and_mailer_metrics.sql
-- =============================================================================

-- 1. Tabela de Campanhas do Mailer (mailer_campaigns)
create table if not exists public.mailer_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  mode text not null check (mode in ('single_athlete', 'multi_athlete', 'catalog')),
  subject text not null,
  athlete_ids uuid[] not null default '{}',
  recipients_count integer not null default 0,
  filters jsonb not null default '{}'::jsonb
);

create index if not exists idx_mailer_campaigns_created_at
  on public.mailer_campaigns (created_at desc);

create index if not exists idx_mailer_campaigns_mode
  on public.mailer_campaigns (mode);

create index if not exists idx_mailer_campaigns_athlete_ids
  on public.mailer_campaigns using gin (athlete_ids);

alter table public.mailer_campaigns enable row level security;

drop policy if exists "Agency admin full access on mailer_campaigns" on public.mailer_campaigns;
create policy "Agency admin full access on mailer_campaigns"
  on public.mailer_campaigns for all
  to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

-- 2. Evolução de recruit_email_logs (campaign_id e athlete_ids uuid[])
alter table public.recruit_email_logs
  add column if not exists campaign_id uuid references public.mailer_campaigns(id) on delete set null;

alter table public.recruit_email_logs
  add column if not exists athlete_ids uuid[] not null default '{}';

create index if not exists idx_recruit_email_logs_campaign_id
  on public.recruit_email_logs (campaign_id);

create index if not exists idx_recruit_email_logs_provider_id
  on public.recruit_email_logs (provider_id);

create index if not exists idx_recruit_email_logs_athlete_ids
  on public.recruit_email_logs using gin (athlete_ids);

-- Backfill idempotente de athlete_ids em recruit_email_logs
update public.recruit_email_logs
set athlete_ids = array[athlete_id]
where (athlete_ids is null or cardinality(athlete_ids) = 0)
  and athlete_id is not null;

-- 3. Evolução de email_events (flexibilização de event_type + colunas de atribuição e clique)
alter table public.email_events
  drop constraint if exists email_events_event_type_check;

alter table public.email_events
  add column if not exists campaign_id uuid references public.mailer_campaigns(id) on delete set null,
  add column if not exists athlete_id uuid references public.athletes(id) on delete set null,
  add column if not exists clicked_url text,
  add column if not exists clicked_at timestamptz,
  add column if not exists user_agent text,
  add column if not exists is_probable_automated boolean not null default false;

create index if not exists idx_email_events_campaign_id
  on public.email_events (campaign_id);

create index if not exists idx_email_events_athlete_id
  on public.email_events (athlete_id);

create index if not exists idx_email_events_provider_event_type
  on public.email_events (provider_email_id, event_type);

-- 4. Backfill idempotente de email_events e sanitização de privacidade (remoção de ipAddress)
-- 4a) Extrair clicked_url, clicked_at e user_agent de payload->'click' e payload->>'clicked_link'
update public.email_events
set
  clicked_url = coalesce(
    clicked_url,
    nullif(trim(payload->'click'->>'link'), ''),
    nullif(trim(payload->>'clicked_link'), '')
  ),
  clicked_at = coalesce(
    clicked_at,
    case
      when nullif(trim(payload->'click'->>'timestamp'), '') is not null
        then (payload->'click'->>'timestamp')::timestamptz
      else occurred_at
    end
  ),
  user_agent = coalesce(
    user_agent,
    nullif(trim(payload->'click'->>'userAgent'), '')
  )
where event_type = 'email.clicked'
  and (clicked_url is null or clicked_at is null or user_agent is null);

-- 4b) Remover ipAddress do JSONB payload (privacidade)
update public.email_events
set payload = payload #- '{click,ipAddress}'
where payload->'click' ? 'ipAddress';

-- 4c) Backfill de campaign_id e athlete_id a partir de recruit_email_logs (somente via provider_email_id)
update public.email_events e
set
  campaign_id = coalesce(e.campaign_id, l.campaign_id),
  athlete_id = coalesce(e.athlete_id, l.athlete_id)
from public.recruit_email_logs l
where e.provider_email_id is not null
  and e.provider_email_id = l.provider_id
  and (e.campaign_id is null or e.athlete_id is null);

-- 4d) Backfill de athlete_id a partir do slug na clicked_url (/athlete/<slug>) quando aplicável
update public.email_events e
set athlete_id = a.id
from public.athletes a
where e.event_type = 'email.clicked'
  and e.athlete_id is null
  and e.clicked_url is not null
  and e.clicked_url like '%/athlete/' || a.slug || '%';

-- 4e) Backfill de is_probable_automated (regras sem estado: user-agent de scanner ou clique <= 10s após delivered/sent)
update public.email_events e
set is_probable_automated = true
where e.event_type = 'email.clicked'
  and e.is_probable_automated = false
  and (
    (
      e.user_agent is not null
      and e.user_agent ~* '(Barracuda|Proofpoint|Mimecast|Safelinks|ATP|Symantec|FireEye|TrendMicro|HeadlessChrome|PhantomJS|python-requests|curl/|wget/|Go-http-client|bot|crawler|spider|scanner|urlscan)'
    )
    or exists (
      select 1
      from public.email_events d
      where d.provider_email_id = e.provider_email_id
        and d.event_type in ('email.delivered', 'email.sent')
        and extract(epoch from (coalesce(e.clicked_at, e.occurred_at) - d.occurred_at)) >= 0
        and extract(epoch from (coalesce(e.clicked_at, e.occurred_at) - d.occurred_at)) <= 10
    )
  );

-- 5. RPC: Opções de Filtro do Dashboard (Campanhas e Atletas)
-- Segurança: chamada pelo backend com getAdminClient() (service_role) após middleware requireAgency.
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

-- 6. RPC Principal: Agregação Completa de Métricas do Mailer no PostgreSQL
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
      l.email_type,
      l.university_id,
      l.coach_role,
      u.name as university_name,
      u.state as university_state,
      u.league as university_league,
      c.name as legacy_coach_name,
      c.institution as legacy_institution
    from public.recruit_email_logs l
    left join public.universities u on u.id = l.university_id
    left join public.coaches c on c.id::text = l.coach_id
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
  -- Eventos atribuídos SOMENTE por provider_email_id (ou campaign_id direto quando não há filtro restrito de log)
  matched_events_raw as (
    select
      e.id,
      e.svix_id,
      e.event_type,
      e.provider_email_id,
      lower(trim(coalesce(fl.recipient_email, e.recipient_email))) as recipient_email,
      coalesce(e.subject, fl.subject) as subject,
      coalesce(e.campaign_id, fl.campaign_id) as campaign_id,
      coalesce(e.athlete_id, fl.athlete_id) as athlete_id,
      fl.effective_athlete_ids,
      fl.coach_id,
      fl.university_id,
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
      -- Proxy de abertura (somente GoogleImageProxy, ggpht.com, YahooMailProxy)
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
  -- Detecção de burst em tempo de consulta: >= 3 links distintos em <= 5s no mesmo provider_email_id
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
  -- Totais de envio e entrega única por provider_id
  log_totals as (
    select
      count(*) filter (where status = 'sent')::int as sent_count,
      count(*) filter (where status = 'failed')::int as log_failed_count,
      count(distinct provider_id) filter (where status = 'sent' and provider_id is not null)::int as distinct_sent_providers
    from filtered_logs
  ),
  event_totals as (
    select
      -- Delivered único: provider_email_id com email.delivered, email.opened ou email.clicked
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
  -- Série diária
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
  -- Breakdown por Campanha
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
  -- Ranking de Coaches Engajados (Hot Leads)
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
  -- Performance por Atleta
  athlete_logs_expanded as (
    select
      unnest(fl.effective_athlete_ids) as athlete_id,
      fl.log_id,
      fl.campaign_id,
      fl.status,
      fl.provider_id
    from filtered_logs fl
    where cardinality(fl.effective_athlete_ids) > 0
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
  -- Últimos 100 eventos
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

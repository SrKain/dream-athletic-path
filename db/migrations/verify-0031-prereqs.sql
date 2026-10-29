-- ============================================================================
-- VERIFICAÇÃO SOMENTE-LEITURA DE PRÉ-REQUISITOS ANTES DA MIGRATION 0031
-- ============================================================================
-- Execute este script no Supabase SQL Editor ANTES de aplicar
-- `db/migrations/0031_mailer_reliability.sql`.
-- Ele NÃO altera nenhum dado ou objeto; apenas inspeciona `information_schema`
-- e `pg_proc` para confirmar que todas as tabelas, colunas e funções das
-- migrations 0001–0030 existem no banco alvo.
-- ============================================================================

WITH required_tables AS (
  SELECT unnest(ARRAY[
    'profiles',
    'user_roles',
    'athletes',
    'universities',
    'coaches',
    'email_suppressions',
    'coach_interest_signals',
    'recruit_email_logs',
    'email_events',
    'mailer_campaigns',
    'mailer_queue',
    'mailer_campaign_snapshots',
    'mailer_domain_checks'
  ]) AS table_name
),
missing_tables AS (
  SELECT 'table:public.' || rt.table_name AS missing_item
  FROM required_tables rt
  LEFT JOIN information_schema.tables t
    ON t.table_schema = 'public'
   AND t.table_name = rt.table_name
  WHERE t.table_name IS NULL
),
required_columns AS (
  SELECT * FROM (VALUES
    ('mailer_campaigns', 'id'),
    ('mailer_campaigns', 'status'),
    ('mailer_campaigns', 'mode'),
    ('mailer_campaigns', 'subject'),
    ('mailer_campaigns', 'athlete_ids'),
    ('mailer_campaigns', 'recipients_count'),
    ('mailer_campaigns', 'total_recipients'),
    ('mailer_campaigns', 'sent_count'),
    ('mailer_campaigns', 'failed_count'),
    ('mailer_campaigns', 'suppressed_count'),
    ('mailer_campaigns', 'current_batch'),
    ('mailer_campaigns', 'total_batches'),
    ('mailer_campaigns', 'batch_size'),
    ('mailer_campaigns', 'controller_id'),
    ('mailer_campaigns', 'controller_lease_expires_at'),
    ('mailer_campaigns', 'next_batch_at'),
    ('mailer_queue', 'id'),
    ('mailer_queue', 'campaign_id'),
    ('mailer_queue', 'coach_id'),
    ('mailer_queue', 'recipient_email'),
    ('mailer_queue', 'recipient_name'),
    ('mailer_queue', 'university_name'),
    ('mailer_queue', 'email_type'),
    ('mailer_queue', 'subject'),
    ('mailer_queue', 'payload'),
    ('mailer_queue', 'idempotency_key'),
    ('mailer_queue', 'status'),
    ('mailer_queue', 'batch_number'),
    ('mailer_queue', 'attempts'),
    ('mailer_queue', 'max_attempts'),
    ('mailer_queue', 'reserved_by'),
    ('mailer_queue', 'reserved_at'),
    ('mailer_queue', 'reservation_expires_at'),
    ('mailer_queue', 'next_retry_at'),
    ('mailer_queue', 'provider_message_id'),
    ('mailer_queue', 'last_error'),
    ('mailer_queue', 'error_code'),
    ('mailer_queue', 'processed_at'),
    ('recruit_email_logs', 'id'),
    ('recruit_email_logs', 'athlete_id'),
    ('recruit_email_logs', 'coach_id'),
    ('recruit_email_logs', 'subject'),
    ('recruit_email_logs', 'status'),
    ('recruit_email_logs', 'sent_at'),
    ('recruit_email_logs', 'email_type'),
    ('recruit_email_logs', 'recipient_email'),
    ('recruit_email_logs', 'recipient_name'),
    ('recruit_email_logs', 'university_name'),
    ('recruit_email_logs', 'provider_id'),
    ('recruit_email_logs', 'campaign_id'),
    ('recruit_email_logs', 'athlete_ids'),
    ('email_events', 'id'),
    ('email_events', 'provider_email_id'),
    ('email_events', 'event_type'),
    ('email_events', 'recipient_email'),
    ('email_events', 'campaign_id'),
    ('email_events', 'occurred_at'),
    ('email_events', 'svix_id'),
    ('email_suppressions', 'email'),
    ('email_suppressions', 'reason'),
    ('email_suppressions', 'suppression_type'),
    ('email_suppressions', 'expires_at'),
    ('mailer_campaign_snapshots', 'campaign_id'),
    ('mailer_campaign_snapshots', 'schema_version'),
    ('mailer_campaign_snapshots', 'snapshot')
  ) AS rc(table_name, column_name)
),
missing_columns AS (
  SELECT 'column:public.' || rc.table_name || '.' || rc.column_name AS missing_item
  FROM required_columns rc
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = rc.table_name
   AND c.column_name = rc.column_name
  WHERE c.column_name IS NULL
),
required_functions AS (
  SELECT unnest(ARRAY[
    'is_agency_admin',
    'filter_suppressed_emails',
    'mailer_campaign_bounce_stats'
  ]) AS routine_name
),
missing_functions AS (
  SELECT 'function:public.' || rf.routine_name AS missing_item
  FROM required_functions rf
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = rf.routine_name
  )
),
all_missing AS (
  SELECT missing_item FROM missing_tables
  UNION ALL
  SELECT missing_item FROM missing_columns
  UNION ALL
  SELECT missing_item FROM missing_functions
)
SELECT
  (SELECT count(*) FROM all_missing) = 0 AS prereqs_ready,
  COALESCE(
    (SELECT array_agg(missing_item ORDER BY missing_item) FROM all_missing),
    ARRAY[]::text[]
  ) AS missing_prerequisites,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recruit_email_logs'
      AND column_name = 'coach_id'
      AND is_nullable = 'YES'
  ) AS recruit_email_logs_coach_id_nullable;

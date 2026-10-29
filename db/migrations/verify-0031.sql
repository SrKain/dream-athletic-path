-- ============================================================================
-- VERIFICAÇÃO PÓS-MIGRATION 0031 (`db/migrations/verify-0031.sql`)
-- ============================================================================
-- Execute após aplicar `0031_mailer_reliability.sql` para confirmar que todas
-- as tabelas, colunas, índices, constraints, RPCs e invariantes estão ativos.
-- ============================================================================

SELECT
  public.mailer_burst_ready() AS mailer_v2_ready,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_batches'
  ) AS has_mailer_batches,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_campaign_exclusions'
  ) AS has_mailer_campaign_exclusions,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'mailer_queue'
      AND indexname = 'idx_mailer_queue_campaign_email_norm_uniq'
  ) AS has_unique_campaign_email_norm_index,
  (
    SELECT count(*)
    FROM public.mailer_queue
    WHERE status = 'accepted'
      AND (provider_message_id IS NULL OR trim(provider_message_id) = '')
  ) AS accepted_without_provider_id_count,
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'mailer_preflight',
        'create_mailer_campaign',
        'activate_mailer_campaign',
        'claim_mailer_batch',
        'finalize_mailer_batch',
        'mailer_campaign_progress',
        'mailer_requeue_failed_retryable'
      )
  ) AS v2_rpc_count;

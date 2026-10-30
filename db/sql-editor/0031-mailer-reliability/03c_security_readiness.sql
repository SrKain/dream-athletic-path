-- 0031 / 03C: ACL, readiness e PostgREST reload. Execute apos 03B.
BEGIN;
DO $$BEGIN IF to_regprocedure('public.mailer_campaign_progress(uuid)') IS NULL OR to_regprocedure('public.mailer_requeue_failed_retryable(uuid)') IS NULL THEN RAISE EXCEPTION 'Execute 03B antes de 03C'; END IF; END; $$;
-- ----------------------------------------------------------------------------
-- 12. SEGURANÇA ESTRITA DOS RPCS (PADRÃO MIGRATION 0026)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mailer_preflight(jsonb, text, uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_preflight(jsonb, text, uuid[], integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.create_mailer_campaign(text, uuid, text, text, uuid[], integer, integer, integer, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_mailer_campaign(text, uuid, text, text, uuid[], integer, integer, integer, text, jsonb, jsonb, integer) TO service_role;

REVOKE ALL ON FUNCTION public.activate_mailer_campaign(uuid, integer, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_mailer_campaign(uuid, integer, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.claim_mailer_batch(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mailer_batch(uuid, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_mailer_batch(uuid, uuid, text, text, integer, jsonb, jsonb, text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_mailer_batch(uuid, uuid, text, text, integer, jsonb, jsonb, text, integer, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.mailer_campaign_progress(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_campaign_progress(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.mailer_requeue_failed_retryable(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_requeue_failed_retryable(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 13. ATUALIZAÇÃO DE `public.mailer_burst_ready()` PARA VERIFICAR 0031
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mailer_burst_ready()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_batches boolean;
  v_has_exclusions boolean;
  v_has_claim_batch boolean;
  v_has_finalize_batch boolean;
  v_has_progress boolean;
  v_coach_nullable boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_batches'
  ) INTO v_has_batches;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_campaign_exclusions'
  ) INTO v_has_exclusions;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_mailer_batch'
  ) INTO v_has_claim_batch;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'finalize_mailer_batch'
  ) INTO v_has_finalize_batch;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mailer_campaign_progress'
  ) INTO v_has_progress;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recruit_email_logs'
      AND column_name = 'coach_id'
      AND is_nullable = 'YES'
  ) INTO v_coach_nullable;

  RETURN (
    v_has_batches
    AND v_has_exclusions
    AND v_has_claim_batch
    AND v_has_finalize_batch
    AND v_has_progress
    AND v_coach_nullable
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mailer_burst_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_burst_ready() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

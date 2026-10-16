-- Migration 0026: Privileged mailer RPC hardening (after 0025)
-- The app invokes these RPCs only from authenticated server functions
-- with a Supabase service-role client. They must not be callable directly
-- by regular authenticated sessions through PostgREST.
BEGIN;

-- Migration 0025 changed the signature; PostgreSQL preserves the old overload.
-- Removing the old 3-argument function closes the campaign-unscoped path.
DROP FUNCTION IF EXISTS public.claim_mailer_queue_batch(text, integer, integer);

REVOKE ALL ON FUNCTION public.claim_mailer_queue_batch(text, integer, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mailer_queue_batch(text, integer, integer, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.acquire_mailer_campaign_lease(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_mailer_campaign_lease(uuid, text, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_mailer_campaign_progress_summary(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_mailer_campaign_progress_summary(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.recover_stale_mailer_queue_reservations()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_mailer_queue_reservations()
  TO service_role;

COMMIT;

-- Post-deploy verification in SQL Editor:
-- SELECT routine_name, grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_schema='public'
--   AND routine_name IN ('claim_mailer_queue_batch',
--     'acquire_mailer_campaign_lease',
--     'get_mailer_campaign_progress_summary',
--     'recover_stale_mailer_queue_reservations');

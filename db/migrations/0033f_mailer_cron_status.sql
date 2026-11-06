-- TASK-116: aplicar manualmente, na ordem 0033a–0033f; antes do código.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.mailer_require_0033()') IS NULL THEN RAISE EXCEPTION 'PRECHECK_0033: apply 0033a first'; END IF; PERFORM public.mailer_require_0033(); END $$;

CREATE OR REPLACE FUNCTION public.mailer_cron_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text; a boolean:=false; ready boolean:=false;
BEGIN
 IF to_regnamespace('cron') IS NOT NULL AND to_regclass('cron.job') IS NOT NULL THEN
  EXECUTE 'SELECT schedule, active FROM cron.job WHERE jobname=$1 LIMIT 1'
   INTO s,a USING 'mailer-campaign-tick-every-minute';
 END IF;
 IF to_regclass('vault.decrypted_secrets') IS NOT NULL AND to_regnamespace('net') IS NOT NULL THEN
  EXECUTE 'SELECT count(DISTINCT name)=2 FROM vault.decrypted_secrets WHERE name IN ($1,$2) AND length(trim(decrypted_secret))>0'
   INTO ready USING 'mailer_tick_url','mailer_cron_secret';
 END IF;
 RETURN jsonb_build_object('enabled',COALESCE(ready,false) AND COALESCE(a,false),'schedule',s,'active',COALESCE(a,false));
END $$;

REVOKE ALL ON FUNCTION public.mailer_cron_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_cron_status() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

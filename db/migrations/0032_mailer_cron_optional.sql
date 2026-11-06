-- ============================================================================
-- MIGRATION 0032 (OPCIONAL): CONTINUIDADE EM SEGUNDO PLANO VIA PG_CRON + PG_NET
-- ============================================================================
-- Esta migration é SEPARADA da 0031 para que o envio de e-mails NUNCA dependa
-- de extensões opcionais (`pg_cron`, `pg_net`, `supabase_vault`).
--
-- Como habilitar manualmente no Supabase:
--   1. No Supabase Dashboard -> Database -> Extensions, habilite:
--      - `pg_cron`
--      - `pg_net`
--      - `supabase_vault`
--   2. Salve a URL do endpoint e o segredo no Supabase Vault:
--      SELECT vault.create_secret('https://SEU-DOMINIO/api/mailer/tick', 'mailer_tick_url');
--      SELECT vault.create_secret('SEU-MAILER-CRON-SECRET', 'mailer_cron_secret');
--   3. Configure no ambiente da aplicação (Vercel):
--      MAILER_CRON_ENABLED=true
--      MAILER_CRON_SECRET=SEU-MAILER-CRON-SECRET
--   4. Execute esta migration no SQL Editor.
-- ============================================================================

BEGIN;
DO $$
DECLARE missing text[] := '{}'; x text;
BEGIN
 FOREACH x IN ARRAY ARRAY['pg_cron','pg_net','supabase_vault'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname=x) THEN missing:=array_append(missing,'extension:'||x); END IF;
 END LOOP;
 IF to_regprocedure('public.mailer_cron_status()') IS NULL THEN missing:=array_append(missing,'0033a–0033f'); END IF;
 IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
  EXECUTE 'SELECT $1 || ARRAY(SELECT ''secret:''||n FROM unnest(ARRAY[''mailer_tick_url'',''mailer_cron_secret'']) n WHERE NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name=n AND length(trim(decrypted_secret))>0))' INTO missing USING missing;
 END IF;
 IF cardinality(missing)>0 THEN RAISE EXCEPTION 'PRECHECK_0032 missing: %',array_to_string(missing,', '); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.mailer_trigger_expired_campaigns_cron()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_net boolean;
  v_has_vault boolean;
  v_tick_url text;
  v_cron_secret text;
  v_campaign record;
  v_dispatched integer := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_namespace WHERE nspname = 'net'
  ) INTO v_has_net;

  SELECT EXISTS (
    SELECT 1 FROM pg_namespace WHERE nspname = 'vault'
  ) INTO v_has_vault;

  IF NOT v_has_net OR NOT v_has_vault THEN
    RETURN jsonb_build_object(
      'triggered', false,
      'reason', 'EXTENSIONS_NOT_ENABLED',
      'hasPgNet', v_has_net,
      'hasVault', v_has_vault
    );
  END IF;

  EXECUTE $q$
    SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE name = 'mailer_tick_url'
    ORDER BY created_at DESC
    LIMIT 1
  $q$ INTO v_tick_url;

  EXECUTE $q$
    SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE name = 'mailer_cron_secret'
    ORDER BY created_at DESC
    LIMIT 1
  $q$ INTO v_cron_secret;

  IF v_tick_url IS NULL OR trim(v_tick_url) = '' OR v_cron_secret IS NULL OR trim(v_cron_secret) = '' THEN
    RETURN jsonb_build_object(
      'triggered', false,
      'reason', 'VAULT_SECRETS_MISSING'
    );
  END IF;

  -- Dispara POST /api/mailer/tick para campanhas `running` cujo lease de 90s expirou
  FOR v_campaign IN
    SELECT mc.id
    FROM public.mailer_campaigns mc
    WHERE mc.status = 'running'
      AND (
        mc.controller_lease_expires_at IS NULL
        OR mc.controller_lease_expires_at <= now()
      )
      AND (
        mc.next_batch_at IS NULL
        OR mc.next_batch_at <= now()
      )
    ORDER BY mc.created_at ASC
    LIMIT 3
  LOOP
    EXECUTE $q$
      SELECT net.http_post(
        url := $1,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-mailer-cron-secret', $2
        ),
        body := jsonb_build_object(
          'campaignId', $3::text,
          'source', 'pg_cron'
        ),
        timeout_milliseconds := 30000
      )
    $q$ USING v_tick_url, v_cron_secret, v_campaign.id;

    v_dispatched := v_dispatched + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'triggered', true,
    'dispatchedCount', v_dispatched,
    'asOf', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mailer_trigger_expired_campaigns_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_trigger_expired_campaigns_cron() TO service_role;

-- pg_cron >= 1.5 introduziu intervalos em segundos; consultar pg_extension.extversion.
DO $$
DECLARE version_parts text[]; schedule_text text := '* * * * *';
BEGIN
 SELECT regexp_match(extversion,'^(\d+)\.(\d+)') INTO version_parts FROM pg_extension WHERE extname='pg_cron';
 IF version_parts[1]::int>1 OR (version_parts[1]::int=1 AND version_parts[2]::int>=5) THEN schedule_text:='15 seconds'; END IF;
 EXECUTE 'SELECT cron.schedule($1,$2,$3)' USING 'mailer-campaign-tick-every-minute',schedule_text,
  'SELECT public.mailer_trigger_expired_campaigns_cron();';
END $$;
COMMIT;

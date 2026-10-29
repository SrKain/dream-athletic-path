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
        )
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule(
      'mailer-campaign-tick-every-minute',
      '* * * * *',
      $cron$SELECT public.mailer_trigger_expired_campaigns_cron();$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron não está ativo neste banco; agendamento ignorado com segurança (%).', SQLERRM;
END;
$$;

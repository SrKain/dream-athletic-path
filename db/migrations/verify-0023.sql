-- =============================================================================
-- Verification Script: Migration 0023 Smoke Tests
-- =============================================================================
-- Execute este script no SQL Editor do Supabase após rodar a migration 0023.
-- Todos os passos devem executar com sucesso (sem erro de coluna inexistente ou mismatch de tipos).

-- -----------------------------------------------------------------------------
-- 1. Smoke test: Inserção e upsert de evento fake em email_events com as colunas que o webhook usa
-- -----------------------------------------------------------------------------
do $$
declare
  v_test_id uuid;
  v_svix_id text := 'smoke_test_svix_' || gen_random_uuid()::text;
begin
  insert into public.email_events (
    svix_id,
    provider_event_id,
    provider_email_id,
    event_type,
    recipient,
    recipient_email,
    subject,
    campaign_id,
    athlete_id,
    clicked_url,
    clicked_at,
    user_agent,
    is_probable_automated,
    occurred_at,
    tags,
    payload
  ) values (
    v_svix_id,
    v_svix_id,
    're_smoke_test_prov_id',
    'email.clicked',
    'smoke-test-coach@example.edu',
    'smoke-test-coach@example.edu',
    'Smoke Test Subject',
    null,
    null,
    'https://portfolio.goteamgoagency.com/athlete/test',
    timezone('utc', now()),
    'Mozilla/5.0 (SmokeTest; x86_64)',
    false,
    timezone('utc', now()),
    '{"test": "true"}'::jsonb,
    '{"smoke_test": true}'::jsonb
  )
  returning id into v_test_id;

  raise notice 'Sucesso no INSERT em email_events: ID=%', v_test_id;

  -- Teste do upsert com on conflict (svix_id)
  insert into public.email_events (
    svix_id,
    provider_event_id,
    provider_email_id,
    event_type,
    recipient,
    recipient_email,
    subject
  ) values (
    v_svix_id,
    v_svix_id,
    're_smoke_test_prov_id',
    'email.opened',
    'smoke-test-coach@example.edu',
    'smoke-test-coach@example.edu',
    'Smoke Test Subject Updated'
  )
  on conflict (svix_id) do update
  set subject = excluded.subject;

  -- Remoção do registro fake de teste
  delete from public.email_events where id = v_test_id;
  raise notice 'Registro de smoke test removido com sucesso.';
end $$;

-- -----------------------------------------------------------------------------
-- 2. Smoke test: Executar RPC public.get_mailer_dashboard_metrics(30, null, null, null)
-- -----------------------------------------------------------------------------
select public.get_mailer_dashboard_metrics(30, null, null, null) as dashboard_metrics_result;

-- -----------------------------------------------------------------------------
-- 3. Smoke test: Executar RPC public.get_mailer_filter_options()
-- -----------------------------------------------------------------------------
select public.get_mailer_filter_options() as filter_options_result;

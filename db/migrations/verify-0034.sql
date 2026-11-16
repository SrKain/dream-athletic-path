-- verify-0034 — somente leitura. Esperado: todas as linhas com ok = true.
SELECT 'tabela mailer_executor_heartbeats existe' AS checagem,
       to_regclass('public.mailer_executor_heartbeats') IS NOT NULL AS ok
UNION ALL
SELECT 'RLS ligada',
       COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.mailer_executor_heartbeats')), false)
UNION ALL
SELECT 'anon sem acesso',
       NOT has_table_privilege('anon', 'public.mailer_executor_heartbeats', 'SELECT')
UNION ALL
SELECT 'service_role pode gravar',
       has_table_privilege('service_role', 'public.mailer_executor_heartbeats', 'INSERT')
       AND has_table_privilege('service_role', 'public.mailer_executor_heartbeats', 'UPDATE');

-- Depois que o pulse estiver rodando, deve aparecer aqui com last_seen_at recente:
-- SELECT executor, last_seen_at, now() - last_seen_at AS ha, last_tick_status
--   FROM public.mailer_executor_heartbeats ORDER BY last_seen_at DESC;

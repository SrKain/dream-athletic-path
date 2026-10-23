-- =============================================================================
-- Script de Verificação SQL da Migration 0028 (Somente Leitura)
-- =============================================================================
-- Execute no Supabase SQL Editor para verificar se a migration 0028 está aplicada.

-- 1. Verificar Tabelas
SELECT table_name,
       EXISTS (
         SELECT 1 FROM information_schema.tables t
         WHERE t.table_schema = 'public' AND t.table_name = expected.table_name
       ) AS existe
FROM (
  VALUES
    ('mailer_campaign_snapshots'),
    ('mailer_domain_checks')
) AS expected(table_name);

-- 2. Verificar RPCs e Assinaturas
SELECT routine_name,
       routine_type,
       security_type,
       EXISTS (
         SELECT 1 FROM information_schema.routines r
         WHERE r.routine_schema = 'public' AND r.routine_name = expected.routine_name
       ) AS existe
FROM (
  VALUES
    ('filter_suppressed_emails'),
    ('mailer_campaign_bounce_stats'),
    ('complete_mailer_burst'),
    ('mailer_burst_ready')
) AS expected(routine_name);

-- 3. Verificar Permissões (Service Role)
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('filter_suppressed_emails', 'mailer_campaign_bounce_stats', 'complete_mailer_burst', 'mailer_burst_ready')
ORDER BY routine_name, grantee;

-- 4. Testar mailer_burst_ready() diretamente
SELECT public.mailer_burst_ready() AS mailer_burst_ready_status;

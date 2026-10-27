-- =============================================================================
-- Script de Verificação SQL da Migration 0029 (Somente Leitura)
-- =============================================================================
-- Execute no Supabase SQL Editor para verificar se a migration 0029 está aplicada.
-- Todas as checagens devem retornar 'true'.

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

-- 2. Verificar Colunas Exatas da Tabela de Snapshots
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'mailer_campaign_snapshots'
ORDER BY ordinal_position;

-- 3. Verificar Assinatura de 7 Argumentos de complete_mailer_burst (com p_dry_run)
SELECT p.proname,
       p.pronargs AS total_argumentos,
       (p.pronargs = 7) AS tem_7_argumentos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'complete_mailer_burst'
ORDER BY p.pronargs DESC;

-- 4. Verificar Constraint mailer_campaigns_status_check contendo 'draft'
SELECT c.conname,
       pg_get_constraintdef(c.oid) AS constraint_definition,
       (pg_get_constraintdef(c.oid) LIKE '%draft%') AS contem_draft
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
  AND c.conname = 'mailer_campaigns_status_check';

-- 5. Verificar RPCs Existentes e Permissões de Execução (Service Role)
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('filter_suppressed_emails', 'mailer_campaign_bounce_stats', 'complete_mailer_burst', 'mailer_burst_ready')
ORDER BY routine_name, grantee;

-- 6. Execução Direta do Gate mailer_burst_ready() (DEVE RETORNAR TRUE)
SELECT public.mailer_burst_ready() AS mailer_burst_ready_status;

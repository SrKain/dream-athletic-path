-- =============================================================================
-- Script de Verificação SQL da Migration 0030 (Somente Leitura)
-- =============================================================================
-- Execute no Supabase SQL Editor para verificar se a migration 0030 está aplicada.

-- 1. Verificar anulabilidade e defaults das colunas de public.recruit_email_logs
SELECT column_name,
       data_type,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'recruit_email_logs'
  AND column_name IN ('coach_id', 'athlete_id', 'athlete_ids', 'subject', 'status', 'email_type', 'sent_at')
ORDER BY column_name;

-- 2. Verificar constraints CHECK de recruit_email_logs e mailer_queue
SELECT c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
  AND c.conname IN (
    'recruit_email_logs_status_check',
    'mailer_queue_status_check',
    'mailer_campaigns_status_check'
  )
ORDER BY c.conname;

-- 3. Verificar se a subtransação resiliente (EXCEPTION WHEN OTHERS / v_log_error) está presente em complete_mailer_burst
SELECT p.proname,
       p.pronargs,
       (pg_get_functiondef(p.oid) ILIKE '%v_log_error%') AS has_resilient_log_exception_block
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'complete_mailer_burst'
ORDER BY p.pronargs DESC;

-- 4. Testar mailer_burst_ready() diretamente (deve retornar true)
SELECT public.mailer_burst_ready() AS mailer_burst_ready_status;

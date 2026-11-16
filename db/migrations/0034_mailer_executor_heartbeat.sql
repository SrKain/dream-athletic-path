-- ============================================================================
-- MIGRATION 0034 — TASK-117: heartbeat de executores externos do Mailer
-- ============================================================================
-- Registra o último sinal de executores externos (ex.: "hetzner-pulse") que
-- chamam POST /api/mailer/tick autenticados por MAILER_CRON_SECRET.
-- Usado só para exibir "Rede de segurança: ativa" na tela do Mailer.
--
-- Aplicação manual no SQL Editor do Supabase. Idempotente: pode rodar 2x.
-- Não altera nenhuma tabela existente. Não depende de pg_cron/pg_net/Vault.
-- Depois de aplicar: rodar db/migrations/verify-0034.sql (somente leitura).
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.mailer_executor_heartbeats (
  executor text PRIMARY KEY
    CONSTRAINT mailer_executor_heartbeats_executor_chk CHECK (executor ~ '^[a-z0-9-]{1,40}$'),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_tick_status text
);

COMMENT ON TABLE public.mailer_executor_heartbeats IS
  'TASK-117: último sinal de executores externos do Mailer (pulse na Hetzner). Acesso só via service_role.';

ALTER TABLE public.mailer_executor_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mailer_executor_heartbeats FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.mailer_executor_heartbeats TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- =============================================================================
-- Migration 0029: Mailer Schema Reconcile, Snapshots, Bounce Guard & Permissive Bursts
-- =============================================================================
-- AUTOSSUFICIENTE E IDEMPOTENTE (Substitui e revoga a migration 0028).
-- Cruza 100% com as definições das migrations 0001 a 0027:
-- - public.is_agency_admin() (0001, 0002)
-- - public.mailer_campaigns (0022, 0024, 0025)
-- - public.mailer_queue (0024, 0025, 0027)
-- - public.email_suppressions (0018, 0020)
-- - public.email_events (0021, 0023)
-- - public.recruit_email_logs (0016, 0018, 0022, 0023, 0027)
-- - public.mailer_rate_limits (0024)
-- =============================================================================
BEGIN;

-- 1. Status 'draft' e 'preparing' na constraint de status da tabela mailer_campaigns
-- Execução direta e determinística (sem blocos anônimos que engolem exceções)
ALTER TABLE public.mailer_campaigns
  DROP CONSTRAINT IF EXISTS mailer_campaigns_status_check;

ALTER TABLE public.mailer_campaigns
  ADD CONSTRAINT mailer_campaigns_status_check
  CHECK (status IN ('draft', 'preparing', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled'));

-- 2. Tabela de Snapshots Leves por Campanha (mailer_campaign_snapshots)
-- Reduz tamanho médio da fila de ~88 KB para ~0,5 KB por destinatário.
-- Colunas canônicas: campaign_id (PK/FK), schema_version, snapshot (jsonb), created_at.
CREATE TABLE IF NOT EXISTS public.mailer_campaign_snapshots (
  campaign_id uuid PRIMARY KEY REFERENCES public.mailer_campaigns(id) ON DELETE CASCADE,
  schema_version integer NOT NULL DEFAULT 1,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.mailer_campaign_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency admin full access on mailer_campaign_snapshots" ON public.mailer_campaign_snapshots;
CREATE POLICY "Agency admin full access on mailer_campaign_snapshots"
  ON public.mailer_campaign_snapshots FOR ALL
  TO authenticated
  USING (public.is_agency_admin())
  WITH CHECK (public.is_agency_admin());

REVOKE ALL ON TABLE public.mailer_campaign_snapshots FROM PUBLIC, anon;
GRANT ALL ON TABLE public.mailer_campaign_snapshots TO authenticated, service_role;

-- 3. Tabela de Cache de Verificação de Domínio (mailer_domain_checks)
-- Armazena validação DNS MX/A por domínio único (TTL 30 dias em aplicação).
CREATE TABLE IF NOT EXISTS public.mailer_domain_checks (
  domain text PRIMARY KEY,
  has_mx boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.mailer_domain_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency admin full access on mailer_domain_checks" ON public.mailer_domain_checks;
CREATE POLICY "Agency admin full access on mailer_domain_checks"
  ON public.mailer_domain_checks FOR ALL
  TO authenticated
  USING (public.is_agency_admin())
  WITH CHECK (public.is_agency_admin());

REVOKE ALL ON TABLE public.mailer_domain_checks FROM PUBLIC, anon;
GRANT ALL ON TABLE public.mailer_domain_checks TO authenticated, service_role;

-- 4. RPC filter_suppressed_emails(p_emails text[])
-- Pré-filtragem O(1) contra email_suppressions normalizando com lower(trim(email))
CREATE OR REPLACE FUNCTION public.filter_suppressed_emails(
  p_emails text[]
)
RETURNS TABLE (suppressed_email text, reason text, suppression_type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input_emails AS (
    SELECT DISTINCT lower(trim(e)) AS email
    FROM unnest(COALESCE(p_emails, ARRAY[]::text[])) AS e
    WHERE nullif(trim(e), '') IS NOT NULL
  )
  SELECT
    s.email AS suppressed_email,
    COALESCE(s.reason, 'user_unsubscribed') AS reason,
    COALESCE(s.suppression_type, 'permanent') AS suppression_type
  FROM input_emails i
  JOIN public.email_suppressions s
    ON lower(trim(s.email)) = i.email
  WHERE s.expires_at IS NULL OR s.expires_at > timezone('utc', now());
$$;

REVOKE ALL ON FUNCTION public.filter_suppressed_emails(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.filter_suppressed_emails(text[]) TO service_role;

-- 5. RPC mailer_campaign_bounce_stats(p_campaign_id uuid)
-- Consulta O(1) de métricas de reputação agregando email_events e calculando bounce_guard_triggered
CREATE OR REPLACE FUNCTION public.mailer_campaign_bounce_stats(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sent_count bigint := 0;
  v_permanent_bounces bigint := 0;
  v_transient_bounces bigint := 0;
  v_complaints bigint := 0;
  v_bounce_rate numeric := 0;
  v_complaint_rate numeric := 0;
  v_bounce_guard_triggered boolean := false;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN jsonb_build_object(
      'sent_count', 0,
      'permanent_bounces', 0,
      'transient_bounces', 0,
      'complaints', 0,
      'bounce_rate', 0,
      'complaint_rate', 0,
      'bounce_guard_triggered', false
    );
  END IF;

  -- 1. Total enviado pela fila da campanha
  SELECT COALESCE(sent_count, 0)
    INTO v_sent_count
    FROM public.mailer_campaigns
   WHERE id = p_campaign_id;

  -- 2. Métricas de eventos vinculados à campanha
  SELECT
    COUNT(*) FILTER (
      WHERE event_type = 'email.bounced'
        AND (payload->'bounce'->>'type' ILIKE 'Permanent' OR payload->>'bounce_type' ILIKE 'Permanent')
    ),
    COUNT(*) FILTER (
      WHERE event_type = 'email.bounced'
        AND NOT (payload->'bounce'->>'type' ILIKE 'Permanent' OR payload->>'bounce_type' ILIKE 'Permanent')
    ),
    COUNT(*) FILTER (
      WHERE event_type ILIKE '%complain%'
    )
    INTO v_permanent_bounces, v_transient_bounces, v_complaints
    FROM public.email_events
   WHERE (tags->>'campaign_id') = p_campaign_id::text
      OR campaign_id = p_campaign_id;

  IF v_sent_count > 0 THEN
    v_bounce_rate := ROUND((v_permanent_bounces::numeric / v_sent_count::numeric) * 100, 2);
    v_complaint_rate := ROUND((v_complaints::numeric / v_sent_count::numeric) * 100, 3);
  END IF;

  -- Regra do Bounce Guard: sent_count >= 20 E bounce_rate > 3.0
  IF v_sent_count >= 20 AND v_bounce_rate > 3.0 THEN
    v_bounce_guard_triggered := true;
  END IF;

  RETURN jsonb_build_object(
    'sent_count', v_sent_count,
    'permanent_bounces', v_permanent_bounces,
    'transient_bounces', v_transient_bounces,
    'complaints', v_complaints,
    'bounce_rate', v_bounce_rate,
    'complaint_rate', v_complaint_rate,
    'bounce_guard_triggered', v_bounce_guard_triggered
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mailer_campaign_bounce_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_campaign_bounce_stats(uuid) TO service_role;

-- 6. complete_mailer_burst com 7 argumentos (incluindo p_dry_run),
-- limpeza atômica de payload (html/text) em sent/cancelled e persistência de logs
CREATE OR REPLACE FUNCTION public.complete_mailer_burst(
  p_campaign_id uuid,
  p_worker_id text,
  p_results jsonb,
  p_next_size integer DEFAULT 300,
  p_pause_ms integer DEFAULT 1000,
  p_lock_until timestamptz DEFAULT NULL,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_updated int := 0;
  v_logs int := 0;
  v_sent int;
  v_failed int;
  v_remaining int;
  v_cancelled int;
  v_campaign public.mailer_campaigns%ROWTYPE;
  v_size int := GREATEST(1, LEAST(300, COALESCE(p_next_size, 300)));
  v_pause int := GREATEST(250, LEAST(60000, COALESCE(p_pause_ms, 250)));
BEGIN
  IF p_campaign_id IS NULL OR nullif(btrim(p_worker_id),'') IS NULL
     OR jsonb_typeof(p_results) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_results) > 300 THEN
    RAISE EXCEPTION 'Invalid burst result';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_results) AS r(id uuid, status text, provider_id text)
    WHERE r.id IS NULL OR r.status NOT IN ('sent','retry','failed','cancelled')
       OR (r.status = 'sent' AND nullif(r.provider_id,'') IS NULL)
  ) THEN RAISE EXCEPTION 'Invalid result item'; END IF;

  IF (SELECT count(*) FROM jsonb_to_recordset(p_results) AS r(id uuid))
     <> (SELECT count(DISTINCT id) FROM jsonb_to_recordset(p_results) AS r(id uuid)) THEN
    RAISE EXCEPTION 'Duplicate queue ids in burst';
  END IF;

  SELECT * INTO v_campaign FROM public.mailer_campaigns
  WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  WITH outcomes AS (
    SELECT * FROM jsonb_to_recordset(p_results)
      AS r(id uuid, status text, provider_id text, error_code text,
           error_message text, next_retry_at timestamptz)
  ),
  updated AS (
    UPDATE public.mailer_queue q
    SET status = CASE WHEN q.status = 'cancelled' AND r.status <> 'sent'
                          THEN 'cancelled' ELSE r.status END,
        provider_message_id = CASE WHEN r.status = 'sent'
                                   THEN r.provider_id ELSE q.provider_message_id END,
        error_code = r.error_code,
        last_error = r.error_message,
        next_retry_at = r.next_retry_at,
        attempts = CASE WHEN r.status = 'retry' AND r.error_code IN (
                          '429', 'PROVIDER_PAUSED', 'BATCH_REJECTED_TRANSIENT', 'CONFIG_ERROR', 'AMBIGUOUS'
                        )
                        THEN GREATEST(0, q.attempts - 1) ELSE q.attempts END,
        processed_at = CASE WHEN r.status IN ('sent','failed','cancelled')
                            THEN v_now ELSE NULL END,
        payload = CASE WHEN r.status IN ('sent', 'cancelled')
                       THEN (q.payload - 'html' - 'text')
                       ELSE q.payload END,
        reserved_by = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL
    FROM outcomes r
    WHERE q.id = r.id AND q.campaign_id = p_campaign_id
      AND q.reserved_by = p_worker_id AND q.status IN ('processing','cancelled')
    RETURNING q.*
  ),
  inserted_logs AS (
    INSERT INTO public.recruit_email_logs (
      campaign_id, athlete_id, athlete_ids, coach_id, subject, status, error_message,
      sent_at, email_type, recipient_email, recipient_name, university_name, provider_id
    )
    SELECT u.campaign_id,
      CASE WHEN nullif(u.payload->>'athleteId','') IS NOT NULL
           THEN (u.payload->>'athleteId')::uuid ELSE NULL END,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(u.payload->'athleteIds','[]'::jsonb))::uuid),
      u.coach_id, u.subject, u.status, u.last_error,
      v_now, u.email_type, u.recipient_email, u.recipient_name, u.university_name,
      u.provider_message_id
    FROM updated u
    WHERE u.status IN ('sent','failed') AND NOT COALESCE(p_dry_run, false)
    RETURNING id
  )
  SELECT (SELECT count(*) FROM updated), (SELECT count(*) FROM inserted_logs)
    INTO v_updated, v_logs;

  IF v_updated <> jsonb_array_length(p_results) THEN
    RAISE EXCEPTION 'Burst persistence mismatch: updated %, expected %',
      v_updated, jsonb_array_length(p_results);
  END IF;

  IF p_lock_until IS NOT NULL AND p_lock_until > v_now THEN
    UPDATE public.mailer_rate_limits
       SET locked_until = GREATEST(COALESCE(locked_until, v_now), p_lock_until),
           updated_at = v_now
     WHERE id = 'global_resend_limit';
  END IF;

  SELECT count(*) FILTER (WHERE status='sent'),
         count(*) FILTER (WHERE status='failed'),
         count(*) FILTER (WHERE status IN ('pending','retry','processing')),
         count(*) FILTER (WHERE status='cancelled')
    INTO v_sent, v_failed, v_remaining, v_cancelled
    FROM public.mailer_queue WHERE campaign_id = p_campaign_id;

  UPDATE public.mailer_campaigns c
     SET sent_count = v_sent,
         failed_count = v_failed,
         batch_size = v_size,
         current_batch = CASE WHEN v_remaining = 0 THEN
             GREATEST(1,c.current_batch) ELSE GREATEST(1,c.current_batch)+1 END,
         total_batches = GREATEST(
             GREATEST(1,c.current_batch),
             GREATEST(1,c.current_batch) +
               CASE WHEN v_remaining > 0 THEN CEIL(v_remaining::numeric/v_size)::integer ELSE 0 END
         ),
         status = CASE WHEN c.status IN ('cancelled','paused','failed') THEN c.status
                       WHEN v_remaining = 0 THEN 'completed'
                       ELSE 'running' END,
         completed_at = CASE WHEN c.status NOT IN ('cancelled','paused','failed')
                                  AND v_remaining = 0 THEN v_now ELSE c.completed_at END,
         next_batch_at = CASE WHEN c.status <> 'running' OR v_remaining = 0 THEN NULL
                              ELSE clock_timestamp() + (v_pause * interval '1 millisecond') END
  WHERE c.id = p_campaign_id;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'logs', v_logs,
    'sent', v_sent,
    'failed', v_failed,
    'remaining', v_remaining,
    'cancelled', v_cancelled,
    'batch_size', v_size,
    'next_batch_at', (SELECT next_batch_at FROM public.mailer_campaigns WHERE id=p_campaign_id)
  );
END;
$$;

-- Sobrecarga de 6 argumentos para compatibilidade total
CREATE OR REPLACE FUNCTION public.complete_mailer_burst(
  p_campaign_id uuid,
  p_worker_id text,
  p_results jsonb,
  p_next_size integer DEFAULT 300,
  p_pause_ms integer DEFAULT 1000,
  p_lock_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.complete_mailer_burst(
    p_campaign_id,
    p_worker_id,
    p_results,
    p_next_size,
    p_pause_ms,
    p_lock_until,
    false
  );
END;
$$;

-- 7. mailer_burst_ready com verificação rigorosa (tabelas, RPCs, pronargs=7 e constraint de status)
CREATE OR REPLACE FUNCTION public.mailer_burst_ready()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_snapshots boolean := false;
  v_has_domains boolean := false;
  v_has_filter_rpc boolean := false;
  v_has_bounce_rpc boolean := false;
  v_has_complete_7args boolean := false;
  v_has_draft_check boolean := false;
BEGIN
  -- 1. Tabelas
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_campaign_snapshots'
  ) INTO v_has_snapshots;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_domain_checks'
  ) INTO v_has_domains;

  -- 2. RPCs
  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'filter_suppressed_emails'
  ) INTO v_has_filter_rpc;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'mailer_campaign_bounce_stats'
  ) INTO v_has_bounce_rpc;

  -- 3. Assinatura de 7 argumentos de complete_mailer_burst via pg_proc
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'complete_mailer_burst'
      AND p.pronargs = 7
  ) INTO v_has_complete_7args;

  -- 4. Constraint mailer_campaigns_status_check contendo 'draft'
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
      AND c.conname = 'mailer_campaigns_status_check'
      AND pg_get_constraintdef(c.oid) LIKE '%draft%'
  ) INTO v_has_draft_check;

  RETURN (
    v_has_snapshots AND
    v_has_domains AND
    v_has_filter_rpc AND
    v_has_bounce_rpc AND
    v_has_complete_7args AND
    v_has_draft_check
  );
END;
$$;

-- 8. Permissões estritas de segurança (padrão 0026/0027)
REVOKE ALL ON FUNCTION public.mailer_burst_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_burst_ready() TO service_role;

REVOKE ALL ON FUNCTION public.complete_mailer_burst(uuid,text,jsonb,integer,integer,timestamptz,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mailer_burst(uuid,text,jsonb,integer,integer,timestamptz,boolean) TO service_role;

REVOKE ALL ON FUNCTION public.complete_mailer_burst(uuid,text,jsonb,integer,integer,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mailer_burst(uuid,text,jsonb,integer,integer,timestamptz) TO service_role;

-- 9. Índices parciais de alta performance para claim e métricas
CREATE INDEX IF NOT EXISTS idx_mailer_queue_active_batch
  ON public.mailer_queue (campaign_id, batch_number, created_at, id)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_email_events_campaign_type
  ON public.email_events (((tags->>'campaign_id')), event_type);

COMMIT;

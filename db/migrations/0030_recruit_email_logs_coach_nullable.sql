-- =============================================================================
-- Migration 0030: Nullable coach_id in recruit_email_logs, Resilient Burst
-- Persistence & Unconfirmed Queue State
-- =============================================================================
-- IDEMPOTENTE E ADITIVA sobre as migrations 0001 a 0029.
-- Resolve:
-- 1. Remove NOT NULL de recruit_email_logs.coach_id (e garante athlete_id NULL),
--    além de blindar todas as colunas NOT NULL/CHECK de recruit_email_logs
--    (subject, status, email_type, athlete_ids, sent_at).
-- 2. Adiciona o status 'unconfirmed' em public.mailer_queue para itens órfãos
--    em processing sem evidência de entrega (impedindo reenvio automático).
-- 3. Isola o INSERT em public.recruit_email_logs dentro de um bloco
--    BEGIN ... EXCEPTION WHEN OTHERS THEN ... END em complete_mailer_burst,
--    garantindo que a atualização de mailer_queue (status = 'sent' +
--    provider_message_id) JAMAIS seja revertida se o log de auditoria falhar.
-- 4. Atualiza get_mailer_campaign_progress_summary e mailer_burst_ready().
-- =============================================================================
BEGIN;

-- 1. Reconciliação completa de constraints e defaults em public.recruit_email_logs
ALTER TABLE public.recruit_email_logs
  DROP CONSTRAINT IF EXISTS recruit_email_logs_coach_id_fkey;

ALTER TABLE public.recruit_email_logs
  ALTER COLUMN coach_id DROP NOT NULL,
  ALTER COLUMN athlete_id DROP NOT NULL,
  ALTER COLUMN subject SET DEFAULT 'Go Team Go Recruiting',
  ALTER COLUMN status SET DEFAULT 'sent',
  ALTER COLUMN email_type SET DEFAULT 'athlete_teaser',
  ALTER COLUMN athlete_ids SET DEFAULT '{}'::uuid[],
  ALTER COLUMN sent_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.recruit_email_logs
  DROP CONSTRAINT IF EXISTS recruit_email_logs_status_check;

ALTER TABLE public.recruit_email_logs
  ADD CONSTRAINT recruit_email_logs_status_check
  CHECK (status IN ('sent', 'failed', 'suppressed'));

-- 2. Inclusão de 'unconfirmed' na constraint de status de public.mailer_queue
ALTER TABLE public.mailer_queue
  DROP CONSTRAINT IF EXISTS mailer_queue_status_check;

ALTER TABLE public.mailer_queue
  ADD CONSTRAINT mailer_queue_status_check
  CHECK (status IN ('pending', 'processing', 'retry', 'sent', 'failed', 'suppressed', 'cancelled', 'unconfirmed'));

-- 3. complete_mailer_burst resiliente:
--    Passo A: Atualiza mailer_queue e valida contagem.
--    Passo B: Insere logs em recruit_email_logs dentro de subtransação isolada
--             (BEGIN ... EXCEPTION WHEN OTHERS THEN ... END) com COALESCE em
--             todas as colunas NOT NULL. Se o log falhar, mailer_queue NÃO reverte.
--    Passo C: Atualiza mailer_rate_limits e mailer_campaigns.
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
  v_log_error text := NULL;
  v_sent int := 0;
  v_failed int := 0;
  v_remaining int := 0;
  v_cancelled int := 0;
  v_unconfirmed int := 0;
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
    WHERE r.id IS NULL OR r.status NOT IN ('sent','retry','failed','cancelled','unconfirmed')
       OR (r.status = 'sent' AND nullif(r.provider_id,'') IS NULL)
  ) THEN RAISE EXCEPTION 'Invalid result item'; END IF;

  IF (SELECT count(*) FROM jsonb_to_recordset(p_results) AS r(id uuid))
     <> (SELECT count(DISTINCT id) FROM jsonb_to_recordset(p_results) AS r(id uuid)) THEN
    RAISE EXCEPTION 'Duplicate queue ids in burst';
  END IF;

  SELECT * INTO v_campaign FROM public.mailer_campaigns
  WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  -- Passo A: Persistência prioritária da fila (mailer_queue)
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
    RETURNING q.id
  )
  SELECT count(*) INTO v_updated FROM updated;

  IF v_updated <> jsonb_array_length(p_results) THEN
    RAISE EXCEPTION 'Burst persistence mismatch: updated %, expected %',
      v_updated, jsonb_array_length(p_results);
  END IF;

  -- Passo B: Inserção resiliente de logs em subtransação isolada (NUNCA reverte mailer_queue)
  IF NOT COALESCE(p_dry_run, false) THEN
    BEGIN
      WITH outcomes AS (
        SELECT * FROM jsonb_to_recordset(p_results)
          AS r(id uuid, status text, provider_id text, error_code text,
               error_message text)
        WHERE r.status IN ('sent', 'failed')
      ),
      inserted_logs AS (
        INSERT INTO public.recruit_email_logs (
          campaign_id,
          athlete_id,
          athlete_ids,
          coach_id,
          subject,
          status,
          error_message,
          sent_at,
          email_type,
          recipient_email,
          recipient_name,
          university_name,
          provider_id
        )
        SELECT
          u.campaign_id,
          CASE
            WHEN nullif(btrim(u.payload->>'athleteId'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (btrim(u.payload->>'athleteId'))::uuid
            ELSE NULL
          END,
          COALESCE(
            ARRAY(
              SELECT elem::uuid
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(u.payload->'athleteIds') = 'array' THEN u.payload->'athleteIds'
                  ELSE '[]'::jsonb
                END
              ) AS elem
              WHERE elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            ),
            '{}'::uuid[]
          ),
          u.coach_id,
          COALESCE(NULLIF(btrim(u.subject), ''), 'Go Team Go Recruiting'),
          CASE WHEN o.status IN ('sent', 'failed', 'suppressed') THEN o.status ELSE 'sent' END,
          o.error_message,
          COALESCE(v_now, timezone('utc', now())),
          COALESCE(NULLIF(btrim(u.email_type), ''), 'athlete_teaser'),
          u.recipient_email,
          u.recipient_name,
          u.university_name,
          COALESCE(o.provider_id, u.provider_message_id)
        FROM outcomes o
        JOIN public.mailer_queue u
          ON u.id = o.id AND u.campaign_id = p_campaign_id
        RETURNING id
      )
      SELECT count(*) INTO v_logs FROM inserted_logs;
    EXCEPTION WHEN OTHERS THEN
      v_log_error := SQLERRM;
      v_logs := 0;
    END;
  END IF;

  -- Passo C: Atualização de rate limit e contadores da campanha
  IF p_lock_until IS NOT NULL AND p_lock_until > v_now THEN
    UPDATE public.mailer_rate_limits
       SET locked_until = GREATEST(COALESCE(locked_until, v_now), p_lock_until),
           updated_at = v_now
     WHERE id = 'global_resend_limit';
  END IF;

  SELECT count(*) FILTER (WHERE status = 'sent'),
         count(*) FILTER (WHERE status = 'failed'),
         count(*) FILTER (WHERE status IN ('pending','retry','processing','unconfirmed')),
         count(*) FILTER (WHERE status = 'cancelled'),
         count(*) FILTER (WHERE status = 'unconfirmed')
    INTO v_sent, v_failed, v_remaining, v_cancelled, v_unconfirmed
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
                       WHEN v_unconfirmed > 0 THEN 'paused'
                       WHEN v_remaining = 0 THEN 'completed'
                       ELSE 'running' END,
         completed_at = CASE WHEN c.status NOT IN ('cancelled','paused','failed')
                                  AND v_remaining = 0 AND v_unconfirmed = 0 THEN v_now ELSE c.completed_at END,
         next_batch_at = CASE WHEN c.status <> 'running' OR v_remaining = 0 OR v_unconfirmed > 0 THEN NULL
                              ELSE clock_timestamp() + (v_pause * interval '1 millisecond') END
  WHERE c.id = p_campaign_id;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'logs', v_logs,
    'log_error', v_log_error,
    'sent', v_sent,
    'failed', v_failed,
    'remaining', v_remaining,
    'cancelled', v_cancelled,
    'unconfirmed', v_unconfirmed,
    'batch_size', v_size,
    'next_batch_at', (SELECT next_batch_at FROM public.mailer_campaigns WHERE id=p_campaign_id)
  );
END;
$$;

-- Sobrecarga de 6 argumentos para compatibilidade
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

-- 4. RPC get_mailer_campaign_progress_summary incluindo unconfirmed_count
CREATE OR REPLACE FUNCTION public.get_mailer_campaign_progress_summary(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign record;
  v_counts record;
  v_result jsonb;
  v_now timestamptz := timezone('utc', now());
  v_cooldown_remaining_sec integer := 0;
BEGIN
  SELECT * INTO v_campaign
  FROM public.mailer_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*) AS total_items,
    count(*) FILTER (WHERE status = 'sent') AS sent_count,
    count(*) FILTER (WHERE status = 'failed') AS failed_count,
    count(*) FILTER (WHERE status IN ('pending', 'retry')) AS pending_count,
    count(*) FILTER (WHERE status = 'processing') AS processing_count,
    count(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
    count(*) FILTER (WHERE status = 'unconfirmed') AS unconfirmed_count
  INTO v_counts
  FROM public.mailer_queue
  WHERE campaign_id = p_campaign_id;

  IF v_campaign.next_batch_at IS NOT NULL AND v_campaign.next_batch_at > v_now THEN
    v_cooldown_remaining_sec := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_campaign.next_batch_at - v_now)))::integer);
  END IF;

  v_result := jsonb_build_object(
    'campaign_id', v_campaign.id,
    'status', v_campaign.status,
    'subject', v_campaign.subject,
    'total_recipients', COALESCE(v_campaign.total_recipients, v_counts.total_items),
    'sent_count', v_counts.sent_count,
    'failed_count', v_counts.failed_count,
    'suppressed_count', COALESCE(v_campaign.suppressed_count, 0),
    'pending_count', v_counts.pending_count,
    'processing_count', v_counts.processing_count,
    'cancelled_count', v_counts.cancelled_count,
    'unconfirmed_count', v_counts.unconfirmed_count,
    'current_batch', COALESCE(v_campaign.current_batch, 1),
    'total_batches', COALESCE(v_campaign.total_batches, 1),
    'batch_size', COALESCE(v_campaign.batch_size, 150),
    'next_batch_at', v_campaign.next_batch_at,
    'cooldown_remaining_sec', v_cooldown_remaining_sec,
    'started_at', v_campaign.started_at,
    'completed_at', v_campaign.completed_at,
    'last_error', v_campaign.last_error,
    'controller_id', v_campaign.controller_id
  );

  RETURN v_result;
END;
$$;

-- 5. mailer_burst_ready verificando também coach_id nullable e status unconfirmed
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
  v_coach_id_nullable boolean := false;
  v_has_unconfirmed_check boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_campaign_snapshots'
  ) INTO v_has_snapshots;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_domain_checks'
  ) INTO v_has_domains;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'filter_suppressed_emails'
  ) INTO v_has_filter_rpc;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'mailer_campaign_bounce_stats'
  ) INTO v_has_bounce_rpc;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'complete_mailer_burst'
      AND p.pronargs = 7
  ) INTO v_has_complete_7args;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
      AND c.conname = 'mailer_campaigns_status_check'
      AND pg_get_constraintdef(c.oid) LIKE '%draft%'
  ) INTO v_has_draft_check;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recruit_email_logs'
      AND column_name = 'coach_id'
      AND is_nullable = 'YES'
  ) INTO v_coach_id_nullable;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
      AND c.conname = 'mailer_queue_status_check'
      AND pg_get_constraintdef(c.oid) LIKE '%unconfirmed%'
  ) INTO v_has_unconfirmed_check;

  RETURN (
    v_has_snapshots AND
    v_has_domains AND
    v_has_filter_rpc AND
    v_has_bounce_rpc AND
    v_has_complete_7args AND
    v_has_draft_check AND
    v_coach_id_nullable AND
    v_has_unconfirmed_check
  );
END;
$$;

-- 6. Permissões de segurança
REVOKE ALL ON FUNCTION public.mailer_burst_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_burst_ready() TO service_role;

REVOKE ALL ON FUNCTION public.complete_mailer_burst(uuid,text,jsonb,integer,integer,timestamptz,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mailer_burst(uuid,text,jsonb,integer,integer,timestamptz,boolean) TO service_role;

REVOKE ALL ON FUNCTION public.complete_mailer_burst(uuid,text,jsonb,integer,integer,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mailer_burst(uuid,text,jsonb,integer,integer,timestamptz) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_mailer_campaign_progress_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mailer_campaign_progress_summary(uuid) TO authenticated, service_role;

COMMIT;

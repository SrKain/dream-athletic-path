-- 0031 / PARTE 03 DE 03 — finalização, progresso, permissões e readiness.
-- USO MANUAL no SQL Editor. Execute somente após sucesso da parte 02.
-- Origem: db/migrations/0031_mailer_reliability.sql @ dde0902eb3f452fe67bdd1cbfb450af57db093b4
BEGIN;

DO $part3_guard$
BEGIN
  IF to_regprocedure('public.create_mailer_campaign(text,uuid,text,text,uuid[],integer,integer,integer,text,jsonb,jsonb,integer)') IS NULL
     OR to_regprocedure('public.activate_mailer_campaign(uuid,integer,text,boolean)') IS NULL
     OR to_regprocedure('public.claim_mailer_batch(uuid,text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION '0031: executar a parte 02 antes da parte 03';
  END IF;
END;
$part3_guard$;

-- ----------------------------------------------------------------------------
-- 9. RPC `public.finalize_mailer_batch`
-- ----------------------------------------------------------------------------
-- Em UMA ÚNICA TRANSAÇÃO ATÔMICA:
--   - Atualiza os itens de `mailer_queue` conforme o desfecho do lote
--   - Atualiza `mailer_batches`
--   - Insere `recruit_email_logs` sem duplicar por (campaign_id, email)
--   - Atualiza contadores de `mailer_campaigns` e decide transição para
--     `paused` (pausa de segurança) ou `completed` (fila zerada).
-- Regra de ouro: NUNCA permite status = `accepted` sem `provider_message_id`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_mailer_batch(
  p_campaign_id uuid,
  p_batch_id uuid,
  p_controller_id text,
  p_batch_status text,
  p_http_status integer DEFAULT NULL,
  p_provider_response jsonb DEFAULT NULL,
  p_outcomes jsonb DEFAULT '[]'::jsonb,
  p_pause_reason text DEFAULT NULL,
  p_next_tick_ms integer DEFAULT 1500,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_batch record;
  v_campaign record;
  v_outcome record;
  v_queue_row record;
  v_item_status text;
  v_provider_id text;
  v_error_code text;
  v_error_msg text;
  v_failure_cat text;
  v_new_attempts integer;
  v_acc_cnt integer := 0;
  v_fp_cnt integer := 0;
  v_fr_cnt integer := 0;
  v_unc_cnt integer := 0;
  v_can_cnt integer := 0;
  v_pend_cnt integer := 0;
  v_claim_cnt integer := 0;
  v_next_campaign_status text;
  v_primary_athlete_id uuid;
BEGIN
  SELECT *
  INTO v_campaign
  FROM public.mailer_campaigns mc
  WHERE mc.id = p_campaign_id
  FOR UPDATE;

  IF v_campaign.id IS NULL THEN
    RAISE EXCEPTION 'FINALIZE_BATCH_CAMPAIGN_NOT_FOUND: %', p_campaign_id;
  END IF;

  SELECT *
  INTO v_batch
  FROM public.mailer_batches mb
  WHERE mb.id = p_batch_id
    AND mb.campaign_id = p_campaign_id
  FOR UPDATE;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'FINALIZE_BATCH_NOT_FOUND: %', p_batch_id;
  END IF;

  IF v_campaign.athlete_ids IS NOT NULL AND array_length(v_campaign.athlete_ids, 1) > 0 THEN
    v_primary_athlete_id := v_campaign.athlete_ids[1];
  ELSE
    v_primary_athlete_id := NULL;
  END IF;

  -- Caso 1: Lote precisa repetir com a MESMA chave (`claimed` após 429 rate-limit / 409 concurrent,
  -- ou `ambiguous` após 5xx / timeout / queda de rede)
  IF p_batch_status IN ('claimed', 'ambiguous') THEN
    v_new_attempts := v_batch.attempts + 1;

    -- Se esgotou 3 tentativas num erro retentável (429/5xx/timeout):
    IF v_new_attempts >= 3 AND p_batch_status = 'claimed' THEN
      UPDATE public.mailer_queue mq
      SET status = 'failed_retryable',
          attempts = v_new_attempts,
          error_code = COALESCE(p_provider_response->>'errorCode', 'RETRY_EXHAUSTED'),
          failure_category = 'retryable_exhausted',
          last_error = COALESCE(p_provider_response->>'message', 'Limite de 3 tentativas atingido para o lote.'),
          processed_at = v_now
      WHERE mq.id = ANY(v_batch.item_ids)
        AND mq.status IN ('claimed', 'processing', 'pending');

      UPDATE public.mailer_batches
      SET status = 'failed',
          attempts = v_new_attempts,
          provider_http_status = p_http_status,
          provider_response = p_provider_response,
          last_error = COALESCE(p_provider_response->>'message', 'Limite de 3 tentativas atingido.'),
          finished_at = v_now
      WHERE id = p_batch_id;
    ELSIF v_new_attempts >= 3 AND p_batch_status = 'ambiguous' THEN
      -- Se 3 envios idênticos com a mesma chave deram timeout/5xx sem resposta,
      -- marcar itens como `unconfirmed` para reconciliação/decisão sem risco de duplicar
      UPDATE public.mailer_queue mq
      SET status = 'unconfirmed',
          attempts = v_new_attempts,
          error_code = COALESCE(p_provider_response->>'errorCode', 'AMBIGUOUS_MAX_ATTEMPTS'),
          failure_category = 'ambiguous_exhausted',
          last_error = COALESCE(
            p_provider_response->>'message',
            'Três tentativas com a mesma chave de idempotência terminaram sem confirmação HTTP.'
          ),
          processed_at = v_now
      WHERE mq.id = ANY(v_batch.item_ids)
        AND mq.status IN ('claimed', 'processing', 'pending');

      UPDATE public.mailer_batches
      SET status = 'failed',
          attempts = v_new_attempts,
          provider_http_status = p_http_status,
          provider_response = p_provider_response,
          last_error = COALESCE(p_provider_response->>'message', 'Ambiguidade persistente após 3 tentativas.'),
          finished_at = v_now
      WHERE id = p_batch_id;
    ELSE
      -- Mantém o lote aberto (`claimed` ou `ambiguous`) com a MESMA chave `mc:{campaign_id}:b{seq}`
      UPDATE public.mailer_batches
      SET status = p_batch_status,
          attempts = v_new_attempts,
          provider_http_status = p_http_status,
          provider_response = p_provider_response,
          last_error = COALESCE(p_provider_response->>'message', last_error)
      WHERE id = p_batch_id;

      UPDATE public.mailer_queue mq
      SET status = 'claimed',
          attempts = v_new_attempts,
          last_error = COALESCE(p_provider_response->>'message', mq.last_error),
          error_code = COALESCE(p_provider_response->>'errorCode', mq.error_code)
      WHERE mq.id = ANY(v_batch.item_ids)
        AND mq.status IN ('claimed', 'processing', 'pending');
    END IF;
  ELSE
    -- Caso 2: Desfecho por item (`accepted`, `partial`, `failed`)
    IF p_outcomes IS NOT NULL AND jsonb_typeof(p_outcomes) = 'array' THEN
      FOR v_outcome IN
        SELECT
          (elem->>'id')::uuid AS item_id,
          COALESCE(elem->>'status', 'failed_permanent') AS target_status,
          NULLIF(trim(COALESCE(elem->>'providerMessageId', elem->>'provider_message_id', '')), '') AS provider_id,
          NULLIF(trim(COALESCE(elem->>'errorCode', elem->>'error_code', '')), '') AS err_code,
          NULLIF(trim(COALESCE(elem->>'errorMessage', elem->>'last_error', '')), '') AS err_msg,
          NULLIF(trim(COALESCE(elem->>'failureCategory', elem->>'failure_category', '')), '') AS fail_cat
        FROM jsonb_array_elements(p_outcomes) AS elem
      LOOP
        SELECT *
        INTO v_queue_row
        FROM public.mailer_queue mq
        WHERE mq.id = v_outcome.item_id
          AND mq.campaign_id = p_campaign_id
        FOR UPDATE;

        IF v_queue_row.id IS NULL THEN
          CONTINUE;
        END IF;

        v_item_status := v_outcome.target_status;
        v_provider_id := v_outcome.provider_id;
        v_error_code := v_outcome.err_code;
        v_error_msg := v_outcome.err_msg;
        v_failure_cat := v_outcome.fail_cat;

        -- INVARIANTE CRÍTICA: Nunca gravar `accepted` sem `provider_message_id`
        IF v_item_status = 'accepted' AND v_provider_id IS NULL THEN
          v_item_status := 'unconfirmed';
          v_error_code := COALESCE(v_error_code, 'MISSING_PROVIDER_MESSAGE_ID');
          v_failure_cat := COALESCE(v_failure_cat, 'missing_provider_id');
          v_error_msg := COALESCE(
            v_error_msg,
            'Resposta 200 recebida sem provider_message_id para este destinatário.'
          );
        END IF;

        UPDATE public.mailer_queue
        SET status = v_item_status,
            provider_message_id = COALESCE(v_provider_id, provider_message_id),
            attempts = v_batch.attempts + 1,
            error_code = CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_error_code END,
            failure_category = CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_failure_cat END,
            last_error = CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_error_msg END,
            processed_at = v_now,
            reserved_by = NULL,
            reservation_expires_at = NULL
        WHERE id = v_queue_row.id;

        -- Inserir log em `recruit_email_logs` (isolado por SAVEPOINT/EXCEPTION e sem duplicar)
        IF NOT COALESCE(p_dry_run, false) AND v_item_status IN ('accepted', 'failed_permanent', 'failed_retryable') THEN
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM public.recruit_email_logs rel
              WHERE rel.campaign_id = p_campaign_id
                AND lower(trim(rel.recipient_email)) = v_queue_row.email_normalized
            ) THEN
              INSERT INTO public.recruit_email_logs (
                athlete_id,
                athlete_ids,
                coach_id,
                campaign_id,
                recipient_email,
                recipient_name,
                university_name,
                subject,
                email_type,
                status,
                error_message,
                provider_id,
                sent_at
              ) VALUES (
                v_primary_athlete_id,
                v_campaign.athlete_ids,
                v_queue_row.coach_id,
                p_campaign_id,
                v_queue_row.recipient_email,
                v_queue_row.recipient_name,
                v_queue_row.university_name,
                v_queue_row.subject,
                v_queue_row.email_type,
                CASE WHEN v_item_status = 'accepted' THEN 'sent' ELSE 'failed' END,
                CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_error_msg END,
                v_provider_id,
                v_now
              );
            END IF;
          EXCEPTION WHEN OTHERS THEN
            -- Falha de log secundário nunca reverte o estado real da fila
            NULL;
          END;
        END IF;
      END LOOP;
    END IF;

    UPDATE public.mailer_batches
    SET status = CASE
          WHEN p_batch_status IN ('accepted', 'partial', 'failed') THEN p_batch_status
          ELSE 'accepted'
        END,
        attempts = v_batch.attempts + 1,
        provider_http_status = p_http_status,
        provider_response = p_provider_response,
        last_error = CASE WHEN p_batch_status = 'accepted' THEN NULL ELSE COALESCE(p_provider_response->>'message', last_error) END,
        finished_at = v_now
    WHERE id = p_batch_id;
  END IF;

  -- Recalcular contadores da campanha diretamente de `mailer_queue`
  SELECT
    count(*) FILTER (WHERE status = 'pending')::integer,
    count(*) FILTER (WHERE status IN ('claimed', 'processing'))::integer,
    count(*) FILTER (WHERE status IN ('accepted', 'sent'))::integer,
    count(*) FILTER (WHERE status IN ('failed_permanent', 'failed'))::integer,
    count(*) FILTER (WHERE status IN ('failed_retryable', 'retry'))::integer,
    count(*) FILTER (WHERE status = 'unconfirmed')::integer,
    count(*) FILTER (WHERE status = 'cancelled')::integer
  INTO
    v_pend_cnt,
    v_claim_cnt,
    v_acc_cnt,
    v_fp_cnt,
    v_fr_cnt,
    v_unc_cnt,
    v_can_cnt
  FROM public.mailer_queue
  WHERE campaign_id = p_campaign_id;

  IF p_pause_reason IS NOT NULL AND trim(p_pause_reason) <> '' THEN
    v_next_campaign_status := 'paused';
  ELSIF v_pend_cnt = 0 AND v_claim_cnt = 0 THEN
    v_next_campaign_status := 'completed';
  ELSE
    v_next_campaign_status := v_campaign.status;
  END IF;

  UPDATE public.mailer_campaigns
  SET status = v_next_campaign_status,
      accepted_count = v_acc_cnt,
      sent_count = v_acc_cnt,
      failed_permanent_count = v_fp_cnt,
      failed_retryable_count = v_fr_cnt,
      failed_count = v_fp_cnt + v_fr_cnt,
      unconfirmed_count = v_unc_cnt,
      cancelled_count = v_can_cnt,
      paused_at = CASE WHEN v_next_campaign_status = 'paused' THEN v_now ELSE paused_at END,
      completed_at = CASE WHEN v_next_campaign_status = 'completed' THEN COALESCE(completed_at, v_now) ELSE completed_at END,
      safety_pause_reason = CASE WHEN p_pause_reason IS NOT NULL THEN p_pause_reason ELSE safety_pause_reason END,
      last_error = CASE
        WHEN p_pause_reason IS NOT NULL THEN p_pause_reason
        WHEN p_batch_status = 'accepted' THEN NULL
        ELSE COALESCE(p_provider_response->>'message', last_error)
      END,
      next_batch_at = v_now + make_interval(secs => GREATEST(0, COALESCE(p_next_tick_ms, 1500))::numeric / 1000.0),
      controller_id = CASE WHEN v_next_campaign_status IN ('completed', 'paused', 'cancelled') THEN NULL ELSE p_controller_id END,
      controller_lease_expires_at = CASE
        WHEN v_next_campaign_status IN ('completed', 'paused', 'cancelled') THEN NULL
        ELSE v_now + interval '90 seconds'
      END
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'finalized', true,
    'campaignId', p_campaign_id,
    'batchId', p_batch_id,
    'batchStatus', p_batch_status,
    'campaignStatus', v_next_campaign_status,
    'pendingCount', v_pend_cnt,
    'claimedCount', v_claim_cnt,
    'acceptedCount', v_acc_cnt,
    'failedPermanentCount', v_fp_cnt,
    'failedRetryableCount', v_fr_cnt,
    'unconfirmedCount', v_unc_cnt,
    'cancelledCount', v_can_cnt
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. RPC `public.mailer_campaign_progress`
-- ----------------------------------------------------------------------------
-- Retorna um JSONB leve (~1 KB) com contagens por estado da fila, lote atual,
-- entregas confirmadas deduplicadas por mensagem (`COUNT(DISTINCT provider_email_id)`),
-- verificação de invariante (`soma dos estados == elegíveis`), ETA baseado em
-- vazão real e `as_of`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mailer_campaign_progress(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_campaign record;
  v_pend integer := 0;
  v_claim integer := 0;
  v_acc integer := 0;
  v_fp integer := 0;
  v_fr integer := 0;
  v_unc integer := 0;
  v_can integer := 0;
  v_supp_queue integer := 0;
  v_states_sum integer := 0;
  v_decided integer := 0;
  v_eligible integer := 0;
  v_delivered integer := 0;
  v_bounced integer := 0;
  v_complained integer := 0;
  v_opened integer := 0;
  v_clicked integer := 0;
  v_awaiting_delivery integer := 0;
  v_elapsed_sec numeric := 0;
  v_throughput numeric := 0;
  v_eta_sec integer := NULL;
  v_active_batch record;
BEGIN
  SELECT *
  INTO v_campaign
  FROM public.mailer_campaigns mc
  WHERE mc.id = p_campaign_id;

  IF v_campaign.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*) FILTER (WHERE status = 'pending')::integer,
    count(*) FILTER (WHERE status IN ('claimed', 'processing'))::integer,
    count(*) FILTER (WHERE status IN ('accepted', 'sent'))::integer,
    count(*) FILTER (WHERE status IN ('failed_permanent', 'failed'))::integer,
    count(*) FILTER (WHERE status IN ('failed_retryable', 'retry'))::integer,
    count(*) FILTER (WHERE status = 'unconfirmed')::integer,
    count(*) FILTER (WHERE status = 'cancelled')::integer,
    count(*) FILTER (WHERE status = 'suppressed')::integer,
    count(*)::integer
  INTO
    v_pend,
    v_claim,
    v_acc,
    v_fp,
    v_fr,
    v_unc,
    v_can,
    v_supp_queue,
    v_states_sum
  FROM public.mailer_queue
  WHERE campaign_id = p_campaign_id;

  v_eligible := CASE
    WHEN v_campaign.eligible_count > 0 THEN v_campaign.eligible_count
    ELSE v_states_sum
  END;

  v_decided := v_acc + v_fp + v_fr + v_unc + v_can + v_supp_queue;

  -- Contadores de entrega deduplicados por mensagem (provider_email_id) em email_events
  SELECT
    COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.delivered')::integer,
    COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.bounced')::integer,
    COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.complained')::integer,
    COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.opened')::integer,
    COUNT(DISTINCT ee.provider_email_id) FILTER (
      WHERE ee.event_type = 'email.clicked'
        AND COALESCE(ee.is_probable_automated, false) = false
    )::integer
  INTO
    v_delivered,
    v_bounced,
    v_complained,
    v_opened,
    v_clicked
  FROM public.email_events ee
  WHERE ee.campaign_id = p_campaign_id
    AND ee.provider_email_id IS NOT NULL;

  v_awaiting_delivery := GREATEST(0, v_acc - v_delivered - v_bounced);

  IF v_campaign.started_at IS NOT NULL THEN
    v_elapsed_sec := GREATEST(
      1,
      EXTRACT(EPOCH FROM (COALESCE(v_campaign.completed_at, v_now) - v_campaign.started_at))
    );
    IF v_decided > 0 THEN
      v_throughput := ROUND((v_decided::numeric / v_elapsed_sec), 2);
    END IF;
  END IF;

  IF v_campaign.status = 'running' AND (v_pend + v_claim) > 0 THEN
    IF v_throughput > 0 THEN
      v_eta_sec := CEIL((v_pend + v_claim)::numeric / v_throughput)::integer;
    ELSE
      -- Estimativa conservadora inicial baseada em 100 e-mails a cada ~2.5s (~40 e-mails/s)
      v_eta_sec := CEIL(((v_pend + v_claim)::numeric / 100.0) * 2.5)::integer;
    END IF;
  ELSIF v_campaign.status = 'completed' THEN
    v_eta_sec := 0;
  END IF;

  SELECT mb.id, mb.seq, mb.status, mb.attempts, mb.idempotency_key
  INTO v_active_batch
  FROM public.mailer_batches mb
  WHERE mb.campaign_id = p_campaign_id
  ORDER BY mb.seq DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'campaignId', v_campaign.id,
    'subject', v_campaign.subject,
    'mode', v_campaign.mode,
    'status', v_campaign.status,
    'engineVersion', COALESCE(v_campaign.engine_version, 'v2'),
    'selectedCount', GREATEST(v_campaign.selected_count, v_eligible),
    'eligibleCount', v_eligible,
    'totalRecipients', v_eligible,
    'pendingCount', v_pend,
    'claimedCount', v_claim,
    'processingCount', v_claim,
    'acceptedCount', v_acc,
    'sentCount', v_acc,
    'failedPermanentCount', v_fp,
    'failedRetryableCount', v_fr,
    'failedCount', (v_fp + v_fr),
    'unconfirmedCount', v_unc,
    'cancelledCount', v_can,
    'suppressedCount', COALESCE(v_campaign.suppressed_count, 0) + v_supp_queue,
    'decidedCount', v_decided,
    'statesSum', v_states_sum,
    'invariantValid', (v_states_sum = v_eligible),
    'submissionPercent', CASE
      WHEN v_eligible > 0 THEN LEAST(100, ROUND((v_decided::numeric / v_eligible::numeric) * 100.0)::integer)
      ELSE 100
    END,
    'deliveryPercent', CASE
      WHEN v_acc > 0 THEN LEAST(100, ROUND((v_delivered::numeric / v_acc::numeric) * 100.0)::integer)
      ELSE 0
    END,
    'deliveredCount', v_delivered,
    'bouncedCount', v_bounced,
    'complainedCount', v_complained,
    'openedCount', v_opened,
    'clickedCount', v_clicked,
    'awaitingDeliveryCount', v_awaiting_delivery,
    'currentBatch', COALESCE(v_active_batch.seq, v_campaign.current_batch, 0),
    'totalBatches', GREATEST(1, COALESCE(v_campaign.total_batches, CEIL(GREATEST(v_eligible, 1)::numeric / 100.0)::integer)),
    'batchSize', COALESCE(v_campaign.batch_size, 100),
    'lastBatchStatus', v_active_batch.status,
    'lastBatchAttempts', COALESCE(v_active_batch.attempts, 0),
    'lastBatchIdempotencyKey', v_active_batch.idempotency_key,
    'exclusionsSummary', COALESCE(v_campaign.exclusions_summary, '{}'::jsonb),
    'safetyPauseReason', v_campaign.safety_pause_reason,
    'lastError', v_campaign.last_error,
    'startedAt', v_campaign.started_at,
    'completedAt', v_campaign.completed_at,
    'pausedAt', v_campaign.paused_at,
    'nextBatchAt', v_campaign.next_batch_at,
    'controllerId', v_campaign.controller_id,
    'controllerLeaseExpiresAt', v_campaign.controller_lease_expires_at,
    'throughputPerSec', v_throughput,
    'estimatedRemainingSeconds', v_eta_sec,
    'asOf', v_now
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. RPC `public.mailer_requeue_failed_retryable`
-- ----------------------------------------------------------------------------
-- Permite ao operador reenviar SOMENTE os itens `failed_retryable` no relatório
-- final, devolvendo-os para `pending` e reabrindo a campanha para `running`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mailer_requeue_failed_retryable(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requeued integer := 0;
BEGIN
  UPDATE public.mailer_queue
  SET status = 'pending',
      batch_id = NULL,
      batch_seq = NULL,
      attempts = 0,
      reserved_by = NULL,
      reserved_at = NULL,
      reservation_expires_at = NULL,
      next_retry_at = NULL,
      last_error = NULL,
      error_code = NULL,
      failure_category = NULL,
      processed_at = NULL
  WHERE campaign_id = p_campaign_id
    AND status IN ('failed_retryable', 'retry');

  GET DIAGNOSTICS v_requeued = ROW_COUNT;

  IF v_requeued > 0 THEN
    UPDATE public.mailer_campaigns
    SET status = 'running',
        completed_at = NULL,
        paused_at = NULL,
        safety_pause_reason = NULL,
        last_error = NULL,
        failed_retryable_count = 0,
        failed_count = failed_permanent_count,
        next_batch_at = now()
    WHERE id = p_campaign_id;
  END IF;

  RETURN jsonb_build_object(
    'requeuedCount', v_requeued,
    'campaignId', p_campaign_id,
    'status', CASE WHEN v_requeued > 0 THEN 'running' ELSE 'unchanged' END
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 12. SEGURANÇA ESTRITA DOS RPCS (PADRÃO MIGRATION 0026)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mailer_preflight(jsonb, text, uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_preflight(jsonb, text, uuid[], integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.create_mailer_campaign(text, uuid, text, text, uuid[], integer, integer, integer, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_mailer_campaign(text, uuid, text, text, uuid[], integer, integer, integer, text, jsonb, jsonb, integer) TO service_role;

REVOKE ALL ON FUNCTION public.activate_mailer_campaign(uuid, integer, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_mailer_campaign(uuid, integer, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.claim_mailer_batch(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mailer_batch(uuid, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_mailer_batch(uuid, uuid, text, text, integer, jsonb, jsonb, text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_mailer_batch(uuid, uuid, text, text, integer, jsonb, jsonb, text, integer, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.mailer_campaign_progress(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_campaign_progress(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.mailer_requeue_failed_retryable(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_requeue_failed_retryable(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 13. ATUALIZAÇÃO DE `public.mailer_burst_ready()` PARA VERIFICAR 0031
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mailer_burst_ready()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_batches boolean;
  v_has_exclusions boolean;
  v_has_claim_batch boolean;
  v_has_finalize_batch boolean;
  v_has_progress boolean;
  v_coach_nullable boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_batches'
  ) INTO v_has_batches;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_campaign_exclusions'
  ) INTO v_has_exclusions;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_mailer_batch'
  ) INTO v_has_claim_batch;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'finalize_mailer_batch'
  ) INTO v_has_finalize_batch;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mailer_campaign_progress'
  ) INTO v_has_progress;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recruit_email_logs'
      AND column_name = 'coach_id'
      AND is_nullable = 'YES'
  ) INTO v_coach_nullable;

  RETURN (
    v_has_batches
    AND v_has_exclusions
    AND v_has_claim_batch
    AND v_has_finalize_batch
    AND v_has_progress
    AND v_coach_nullable
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mailer_burst_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_burst_ready() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

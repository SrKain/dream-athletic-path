-- 0031 / PARTE 02 DE 03 — criação, ativação e reserva atômica de lotes.
-- USO MANUAL no SQL Editor. Execute somente após sucesso da parte 01.
-- Origem: db/migrations/0031_mailer_reliability.sql @ dde0902eb3f452fe67bdd1cbfb450af57db093b4
BEGIN;

DO $part2_guard$
BEGIN
  IF to_regclass('public.mailer_batches') IS NULL
     OR to_regclass('public.mailer_campaign_exclusions') IS NULL
     OR to_regprocedure('public.mailer_preflight(jsonb,text,uuid[],integer,integer)') IS NULL THEN
    RAISE EXCEPTION '0031: executar a parte 01 antes da parte 02';
  END IF;
END;
$part2_guard$;

-- ----------------------------------------------------------------------------
-- 6. RPC `public.create_mailer_campaign`
-- ----------------------------------------------------------------------------
-- Cria ou reutiliza uma campanha de forma idempotente via `p_idempotency_key`.
-- Nunca ativa a campanha até que `activate_mailer_campaign` valide a fila.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_mailer_campaign(
  p_idempotency_key text,
  p_created_by uuid,
  p_mode text,
  p_subject text,
  p_athlete_ids uuid[],
  p_selected_count integer,
  p_eligible_count integer,
  p_suppressed_count integer,
  p_manifest_fingerprint text,
  p_exclusions_summary jsonb DEFAULT '{}'::jsonb,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_campaign_id uuid;
  v_enqueued_count integer := 0;
  v_total_batches integer := GREATEST(1, CEIL(GREATEST(COALESCE(p_eligible_count, 0), 1)::numeric / GREATEST(COALESCE(p_batch_size, 100), 1)::numeric)::integer);
BEGIN
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    SELECT
      mc.id,
      mc.status,
      mc.manifest_count,
      mc.manifest_fingerprint
    INTO v_existing
    FROM public.mailer_campaigns mc
    WHERE mc.idempotency_key = trim(p_idempotency_key)
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      SELECT COUNT(*)::integer
      INTO v_enqueued_count
      FROM public.mailer_queue mq
      WHERE mq.campaign_id = v_existing.id;

      RETURN jsonb_build_object(
        'campaignId', v_existing.id,
        'status', v_existing.status,
        'reused', true,
        'enqueuedCount', v_enqueued_count,
        'manifestCount', v_existing.manifest_count,
        'manifestFingerprint', v_existing.manifest_fingerprint
      );
    END IF;
  END IF;

  INSERT INTO public.mailer_campaigns (
    idempotency_key,
    created_by,
    mode,
    subject,
    athlete_ids,
    recipients_count,
    selected_count,
    eligible_count,
    manifest_count,
    manifest_fingerprint,
    total_recipients,
    sent_count,
    accepted_count,
    failed_count,
    failed_permanent_count,
    failed_retryable_count,
    unconfirmed_count,
    cancelled_count,
    suppressed_count,
    exclusions_summary,
    filters,
    status,
    current_batch,
    total_batches,
    batch_size,
    delay_between_batches_sec,
    delay_between_items_ms,
    engine_version
  ) VALUES (
    NULLIF(trim(COALESCE(p_idempotency_key, '')), ''),
    p_created_by,
    p_mode,
    p_subject,
    COALESCE(p_athlete_ids, '{}'::uuid[]),
    COALESCE(p_selected_count, 0),
    COALESCE(p_selected_count, 0),
    COALESCE(p_eligible_count, 0),
    COALESCE(p_eligible_count, 0),
    p_manifest_fingerprint,
    COALESCE(p_eligible_count, 0),
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    COALESCE(p_suppressed_count, 0),
    COALESCE(p_exclusions_summary, '{}'::jsonb),
    COALESCE(p_filters, '{}'::jsonb),
    'preparing',
    0,
    v_total_batches,
    LEAST(GREATEST(COALESCE(p_batch_size, 100), 1), 100),
    2,
    0,
    'v2'
  )
  RETURNING id INTO v_campaign_id;

  RETURN jsonb_build_object(
    'campaignId', v_campaign_id,
    'status', 'preparing',
    'reused', false,
    'enqueuedCount', 0,
    'manifestCount', COALESCE(p_eligible_count, 0),
    'manifestFingerprint', p_manifest_fingerprint
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC `public.activate_mailer_campaign`
-- ----------------------------------------------------------------------------
-- Só transiciona a campanha de `preparing`/`draft` para `running` se:
--   1. Contagem real de itens na `mailer_queue` == `p_expected_count` (> 0)
--   2. Fingerprint MD5 dos `email_normalized` na fila == `p_expected_fingerprint`
--   3. Snapshot persistido em `mailer_campaign_snapshots` (salvo dry_run)
-- Caso contrário, NUNCA ativa uma fila parcial.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_mailer_campaign(
  p_campaign_id uuid,
  p_expected_count integer,
  p_expected_fingerprint text DEFAULT NULL,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign record;
  v_actual_count integer := 0;
  v_actual_fingerprint text := '';
  v_has_snapshot boolean := false;
  v_total_batches integer;
BEGIN
  SELECT *
  INTO v_campaign
  FROM public.mailer_campaigns mc
  WHERE mc.id = p_campaign_id
  FOR UPDATE;

  IF v_campaign.id IS NULL THEN
    RETURN jsonb_build_object(
      'activated', false,
      'reason', 'CAMPAIGN_NOT_FOUND',
      'message', 'Campanha não encontrada.'
    );
  END IF;

  -- Se já estiver running ou completed, retorna idempotente
  IF v_campaign.status IN ('running', 'completed') THEN
    RETURN jsonb_build_object(
      'activated', true,
      'alreadyActive', true,
      'status', v_campaign.status,
      'enqueuedCount', v_campaign.eligible_count
    );
  END IF;

  SELECT
    COUNT(*)::integer,
    COALESCE(md5(string_agg(mq.email_normalized, ',' ORDER BY mq.email_normalized)), md5(''))
  INTO v_actual_count, v_actual_fingerprint
  FROM public.mailer_queue mq
  WHERE mq.campaign_id = p_campaign_id;

  IF v_actual_count <= 0 OR v_actual_count <> COALESCE(p_expected_count, -1) THEN
    RETURN jsonb_build_object(
      'activated', false,
      'reason', 'MANIFEST_COUNT_MISMATCH',
      'expectedCount', p_expected_count,
      'actualCount', v_actual_count,
      'message', format(
        'Ativação bloqueada: a fila possui %s itens, mas o manifesto exige %s.',
        v_actual_count,
        COALESCE(p_expected_count, 0)
      )
    );
  END IF;

  IF p_expected_fingerprint IS NOT NULL
     AND trim(p_expected_fingerprint) <> ''
     AND v_actual_fingerprint <> trim(p_expected_fingerprint) THEN
    RETURN jsonb_build_object(
      'activated', false,
      'reason', 'MANIFEST_FINGERPRINT_MISMATCH',
      'expectedFingerprint', p_expected_fingerprint,
      'actualFingerprint', v_actual_fingerprint,
      'message', 'Ativação bloqueada: o fingerprint de destinatários da fila diverge do manifesto aprovado.'
    );
  END IF;

  IF NOT COALESCE(p_dry_run, false) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.mailer_campaign_snapshots mcs
      WHERE mcs.campaign_id = p_campaign_id
    )
    INTO v_has_snapshot;

    IF NOT v_has_snapshot THEN
      RETURN jsonb_build_object(
        'activated', false,
        'reason', 'SNAPSHOT_MISSING',
        'message', 'Ativação bloqueada: snapshot de conteúdo da campanha não foi encontrado.'
      );
    END IF;
  END IF;

  v_total_batches := GREATEST(1, CEIL(v_actual_count::numeric / GREATEST(COALESCE(v_campaign.batch_size, 100), 1)::numeric)::integer);

  UPDATE public.mailer_campaigns
  SET status = 'running',
      eligible_count = v_actual_count,
      manifest_count = v_actual_count,
      manifest_fingerprint = COALESCE(NULLIF(trim(p_expected_fingerprint), ''), v_actual_fingerprint),
      total_recipients = v_actual_count,
      total_batches = v_total_batches,
      started_at = COALESCE(started_at, now()),
      next_batch_at = now(),
      last_error = NULL,
      safety_pause_reason = NULL
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'activated', true,
    'status', 'running',
    'enqueuedCount', v_actual_count,
    'totalBatches', v_total_batches,
    'manifestFingerprint', v_actual_fingerprint
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC `public.claim_mailer_batch`
-- ----------------------------------------------------------------------------
-- Reserva de forma atômica até 100 itens com `FOR UPDATE SKIP LOCKED`, renova o
-- lease de 90s da campanha e cria (ou retoma em caso de `ambiguous`/`claimed`
-- dentro de 24h) um lote em `public.mailer_batches` com chave imutável:
--   `mc:{campaign_id}:b{seq}`
-- Se um lote `ambiguous` tiver mais de 24h, reconcilia com `email_events` /
-- `recruit_email_logs` e marca o restante como `unconfirmed` sem reenviar às cegas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_mailer_batch(
  p_campaign_id uuid,
  p_controller_id text,
  p_batch_size integer DEFAULT 100,
  p_lease_seconds integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_campaign record;
  v_existing_batch record;
  v_batch_id uuid;
  v_seq integer;
  v_idempotency_key text;
  v_item_ids uuid[];
  v_items jsonb := '[]'::jsonb;
  v_pending_remaining integer := 0;
  v_effective_size integer := LEAST(GREATEST(COALESCE(p_batch_size, 100), 1), 100);
  v_lease_secs integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 90), 15), 300);
BEGIN
  SELECT *
  INTO v_campaign
  FROM public.mailer_campaigns mc
  WHERE mc.id = p_campaign_id
  FOR UPDATE;

  IF v_campaign.id IS NULL THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'CAMPAIGN_NOT_FOUND',
      'campaignStatus', 'failed'
    );
  END IF;

  IF v_campaign.status <> 'running' THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'CAMPAIGN_NOT_RUNNING',
      'campaignStatus', v_campaign.status,
      'safetyPauseReason', v_campaign.safety_pause_reason
    );
  END IF;

  -- Verificar contenção de lease entre controladores distintos
  IF v_campaign.controller_id IS NOT NULL
     AND v_campaign.controller_id <> p_controller_id
     AND v_campaign.controller_lease_expires_at IS NOT NULL
     AND v_campaign.controller_lease_expires_at > v_now THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'LEASE_HELD_BY_OTHER',
      'campaignStatus', v_campaign.status,
      'controllerId', v_campaign.controller_id,
      'leaseExpiresAt', v_campaign.controller_lease_expires_at
    );
  END IF;

  -- Respeitar intervalo agendado (ex: 429 retry-after)
  IF v_campaign.next_batch_at IS NOT NULL AND v_campaign.next_batch_at > v_now THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'COOLDOWN_ACTIVE',
      'campaignStatus', v_campaign.status,
      'nextBatchAt', v_campaign.next_batch_at,
      'waitMs', GREATEST(100, CEIL(EXTRACT(EPOCH FROM (v_campaign.next_batch_at - v_now)) * 1000)::integer)
    );
  END IF;

  -- Renovar lease de 90s do controlador atual
  UPDATE public.mailer_campaigns
  SET controller_id = p_controller_id,
      controller_lease_expires_at = v_now + make_interval(secs => v_lease_secs)
  WHERE id = p_campaign_id;

  -- 1) Verificar se existe lote em aberto (`claimed`, `submitting`, `ambiguous`)
  FOR v_existing_batch IN
    SELECT *
    FROM public.mailer_batches mb
    WHERE mb.campaign_id = p_campaign_id
      AND mb.status IN ('claimed', 'submitting', 'ambiguous')
    ORDER BY mb.seq ASC
    FOR UPDATE
  LOOP
    -- Se o lote tem mais de 24h (janela do Idempotency-Key do Resend expirou),
    -- reconciliar via evidência de entrega/log e marcar o restante como `unconfirmed`
    IF v_existing_batch.claimed_at < (v_now - interval '24 hours') THEN
      -- Marcar como accepted quem tiver evidência confirmada em email_events ou recruit_email_logs
      UPDATE public.mailer_queue mq
      SET status = 'accepted',
          provider_message_id = COALESCE(
            mq.provider_message_id,
            (
              SELECT ee.provider_email_id
              FROM public.email_events ee
              WHERE ee.campaign_id = p_campaign_id
                AND lower(trim(ee.recipient_email)) = mq.email_normalized
                AND ee.provider_email_id IS NOT NULL
              ORDER BY ee.occurred_at DESC
              LIMIT 1
            ),
            (
              SELECT rel.provider_id
              FROM public.recruit_email_logs rel
              WHERE rel.campaign_id = p_campaign_id
                AND lower(trim(rel.recipient_email)) = mq.email_normalized
                AND rel.provider_id IS NOT NULL
              ORDER BY rel.sent_at DESC
              LIMIT 1
            )
          ),
          processed_at = COALESCE(mq.processed_at, v_now),
          last_error = NULL,
          error_code = NULL
      WHERE mq.id = ANY(v_existing_batch.item_ids)
        AND mq.status IN ('claimed', 'processing')
        AND (
          mq.provider_message_id IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM public.email_events ee
            WHERE ee.campaign_id = p_campaign_id
              AND lower(trim(ee.recipient_email)) = mq.email_normalized
              AND ee.provider_email_id IS NOT NULL
          )
          OR EXISTS (
            SELECT 1
            FROM public.recruit_email_logs rel
            WHERE rel.campaign_id = p_campaign_id
              AND lower(trim(rel.recipient_email)) = mq.email_normalized
              AND rel.provider_id IS NOT NULL
          )
        );

      -- Os demais itens desse lote > 24h viram `unconfirmed` (nunca reenviar às cegas após 24h)
      UPDATE public.mailer_queue mq
      SET status = 'unconfirmed',
          error_code = 'AMBIGUOUS_EXPIRED_24H',
          failure_category = 'ambiguous_expired_24h',
          last_error = 'Lote ambíguo expirou a janela de 24h de idempotência sem confirmação do provedor; requer decisão humana.',
          processed_at = COALESCE(mq.processed_at, v_now)
      WHERE mq.id = ANY(v_existing_batch.item_ids)
        AND mq.status IN ('claimed', 'processing');

      UPDATE public.mailer_batches
      SET status = 'failed',
          last_error = 'AMBIGUOUS_EXPIRED_24H',
          finished_at = v_now
      WHERE id = v_existing_batch.id;
    ELSE
      -- Dentro da janela de 24h: retomar este MESMO lote com a MESMA chave `mc:{campaign_id}:b{seq}`
      UPDATE public.mailer_batches
      SET status = 'submitting',
          submitted_at = v_now
      WHERE id = v_existing_batch.id;

      UPDATE public.mailer_queue mq
      SET reserved_by = p_controller_id,
          reserved_at = v_now,
          reservation_expires_at = v_now + make_interval(secs => v_lease_secs)
      WHERE mq.id = ANY(v_existing_batch.item_ids)
        AND mq.status IN ('claimed', 'processing');

      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mq.id,
            'campaign_id', mq.campaign_id,
            'coach_id', mq.coach_id,
            'recipient_email', mq.recipient_email,
            'email_normalized', mq.email_normalized,
            'recipient_name', mq.recipient_name,
            'university_name', mq.university_name,
            'email_type', mq.email_type,
            'subject', mq.subject,
            'payload', mq.payload,
            'idempotency_key', mq.idempotency_key,
            'status', mq.status,
            'batch_number', mq.batch_number,
            'attempts', mq.attempts,
            'max_attempts', mq.max_attempts
          )
          ORDER BY array_position(v_existing_batch.item_ids, mq.id)
        ),
        '[]'::jsonb
      )
      INTO v_items
      FROM public.mailer_queue mq
      WHERE mq.id = ANY(v_existing_batch.item_ids);

      RETURN jsonb_build_object(
        'claimed', true,
        'reusedBatch', true,
        'batchId', v_existing_batch.id,
        'seq', v_existing_batch.seq,
        'idempotencyKey', v_existing_batch.idempotency_key,
        'attempts', v_existing_batch.attempts,
        'previousStatus', v_existing_batch.status,
        'campaignStatus', 'running',
        'items', v_items
      );
    END IF;
  END LOOP;

  -- 2) Reservar novos itens `pending` com FOR UPDATE SKIP LOCKED
  WITH locked_items AS (
    SELECT mq.id
    FROM public.mailer_queue mq
    WHERE mq.campaign_id = p_campaign_id
      AND mq.status = 'pending'
      AND (mq.next_retry_at IS NULL OR mq.next_retry_at <= v_now)
    ORDER BY mq.batch_number ASC, mq.created_at ASC, mq.id ASC
    LIMIT v_effective_size
    FOR UPDATE SKIP LOCKED
  )
  SELECT array_agg(id)
  INTO v_item_ids
  FROM locked_items;

  IF v_item_ids IS NULL OR array_length(v_item_ids, 1) IS NULL OR array_length(v_item_ids, 1) = 0 THEN
    -- Verificar se ainda resta algum item pendente (ex: aguardando next_retry_at) ou claimed
    SELECT COUNT(*)::integer
    INTO v_pending_remaining
    FROM public.mailer_queue mq
    WHERE mq.campaign_id = p_campaign_id
      AND mq.status IN ('pending', 'claimed', 'processing');

    IF v_pending_remaining = 0 THEN
      -- Todos os itens da campanha têm destino final explicável -> concluir campanha
      With final_rollups AS (
        SELECT
          count(*) FILTER (WHERE status IN ('accepted', 'sent'))::integer AS acc_cnt,
          count(*) FILTER (WHERE status IN ('failed_permanent', 'failed'))::integer AS fp_cnt,
          count(*) FILTER (WHERE status IN ('failed_retryable', 'retry'))::integer AS fr_cnt,
          count(*) FILTER (WHERE status = 'unconfirmed')::integer AS unc_cnt,
          count(*) FILTER (WHERE status = 'cancelled')::integer AS can_cnt
        FROM public.mailer_queue
        WHERE campaign_id = p_campaign_id
      )
      UPDATE public.mailer_campaigns mc
      SET status = 'completed',
          completed_at = COALESCE(mc.completed_at, v_now),
          accepted_count = fr.acc_cnt,
          sent_count = fr.acc_cnt,
          failed_permanent_count = fr.fp_cnt,
          failed_retryable_count = fr.fr_cnt,
          failed_count = fr.fp_cnt + fr.fr_cnt,
          unconfirmed_count = fr.unc_cnt,
          cancelled_count = fr.can_cnt,
          controller_id = NULL,
          controller_lease_expires_at = NULL
      FROM final_rollups fr
      WHERE mc.id = p_campaign_id;

      RETURN jsonb_build_object(
        'claimed', false,
        'reason', 'QUEUE_DRAINED',
        'campaignStatus', 'completed',
        'items', '[]'::jsonb
      );
    END IF;

    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'AWAITING_RETRY_WINDOW',
      'campaignStatus', 'running',
      'items', '[]'::jsonb
    );
  END IF;

  -- Alocar próximo seq para o lote da campanha
  SELECT COALESCE(MAX(mb.seq), 0) + 1
  INTO v_seq
  FROM public.mailer_batches mb
  WHERE mb.campaign_id = p_campaign_id;

  v_idempotency_key := 'mc:' || p_campaign_id::text || ':b' || v_seq::text;

  INSERT INTO public.mailer_batches (
    campaign_id,
    seq,
    item_ids,
    idempotency_key,
    status,
    attempts,
    claimed_at,
    submitted_at
  ) VALUES (
    p_campaign_id,
    v_seq,
    v_item_ids,
    v_idempotency_key,
    'submitting',
    0,
    v_now,
    v_now
  )
  RETURNING id INTO v_batch_id;

  UPDATE public.mailer_queue mq
  SET status = 'claimed',
      batch_id = v_batch_id,
      batch_seq = v_seq,
      reserved_by = p_controller_id,
      reserved_at = v_now,
      reservation_expires_at = v_now + make_interval(secs => v_lease_secs)
  WHERE mq.id = ANY(v_item_ids);

  UPDATE public.mailer_campaigns
  SET current_batch = GREATEST(current_batch, v_seq)
  WHERE id = p_campaign_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', mq.id,
        'campaign_id', mq.campaign_id,
        'coach_id', mq.coach_id,
        'recipient_email', mq.recipient_email,
        'email_normalized', mq.email_normalized,
        'recipient_name', mq.recipient_name,
        'university_name', mq.university_name,
        'email_type', mq.email_type,
        'subject', mq.subject,
        'payload', mq.payload,
        'idempotency_key', mq.idempotency_key,
        'status', mq.status,
        'batch_number', mq.batch_number,
        'attempts', mq.attempts,
        'max_attempts', mq.max_attempts
      )
      ORDER BY array_position(v_item_ids, mq.id)
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.mailer_queue mq
  WHERE mq.id = ANY(v_item_ids);

  RETURN jsonb_build_object(
    'claimed', true,
    'reusedBatch', false,
    'batchId', v_batch_id,
    'seq', v_seq,
    'idempotencyKey', v_idempotency_key,
    'attempts', 0,
    'previousStatus', 'claimed',
    'campaignStatus', 'running',
    'items', v_items
  );
END;
$$;


-- ACL antecipada: a parte 03 repete estes comandos de modo idempotente.
REVOKE ALL ON FUNCTION public.create_mailer_campaign(text, uuid, text, text, uuid[], integer, integer, integer, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_mailer_campaign(text, uuid, text, text, uuid[], integer, integer, integer, text, jsonb, jsonb, integer) TO service_role;
REVOKE ALL ON FUNCTION public.activate_mailer_campaign(uuid, integer, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_mailer_campaign(uuid, integer, text, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.claim_mailer_batch(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mailer_batch(uuid, text, integer, integer) TO service_role;

COMMIT;

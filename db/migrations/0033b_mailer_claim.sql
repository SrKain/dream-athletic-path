-- TASK-116: aplicar manualmente, na ordem 0033a–0033f; antes do código.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.mailer_require_0033()') IS NULL THEN RAISE EXCEPTION 'PRECHECK_0033: apply 0033a first'; END IF; PERFORM public.mailer_require_0033(); END $$;
CREATE OR REPLACE FUNCTION public.claim_mailer_batch( p_campaign_id uuid, p_controller_id text,
p_batch_size integer DEFAULT 100, p_lease_seconds integer DEFAULT 90 )
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$ DECLARE
v_now timestamptz := now(); v_campaign record; v_existing_batch record;
v_batch_id uuid; v_seq integer; v_idempotency_key text;
v_item_ids uuid[]; v_items jsonb := '[]'::jsonb; v_pending_remaining integer := 0;
v_effective_size integer := LEAST(GREATEST(COALESCE(p_batch_size, 100), 1), 100); v_lease_secs integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 90), 15), 300); BEGIN
SELECT * INTO v_campaign FROM public.mailer_campaigns mc
WHERE mc.id = p_campaign_id FOR UPDATE; IF v_campaign.id IS NULL THEN
RETURN jsonb_build_object( 'claimed', false, 'reason', 'CAMPAIGN_NOT_FOUND',
'campaignStatus', 'failed' ); END IF;
IF v_campaign.status <> 'running' THEN RETURN jsonb_build_object( 'claimed', false,
'reason', 'CAMPAIGN_NOT_RUNNING', 'campaignStatus', v_campaign.status, 'safetyPauseReason', v_campaign.safety_pause_reason
); END IF; IF v_campaign.controller_id IS NOT NULL
AND v_campaign.controller_id <> p_controller_id AND v_campaign.controller_lease_expires_at IS NOT NULL AND v_campaign.controller_lease_expires_at > v_now THEN
RETURN jsonb_build_object( 'claimed', false, 'reason', 'LEASE_HELD_BY_OTHER',
'campaignStatus', v_campaign.status, 'controllerId', v_campaign.controller_id, 'leaseExpiresAt', v_campaign.controller_lease_expires_at
); END IF; IF v_campaign.next_batch_at IS NOT NULL AND v_campaign.next_batch_at > v_now THEN
RETURN jsonb_build_object( 'claimed', false, 'reason', 'COOLDOWN_ACTIVE',
'campaignStatus', v_campaign.status, 'nextBatchAt', v_campaign.next_batch_at, 'waitMs', GREATEST(100, CEIL(EXTRACT(EPOCH FROM (v_campaign.next_batch_at - v_now)) * 1000)::integer)
); END IF; UPDATE public.mailer_queue q SET status='unconfirmed', error_code='ORPHANED_CLAIM', failure_category='orphaned_claim',
last_error='Item claimed sem lote aberto; requer reconciliação humana.', processed_at=v_now, reserved_by=NULL,reservation_expires_at=NULL WHERE q.campaign_id=p_campaign_id AND q.status='claimed' AND NOT EXISTS
(SELECT 1 FROM public.mailer_batches b WHERE b.id=q.batch_id AND b.campaign_id=p_campaign_id AND q.id=ANY(b.item_ids) AND b.status IN ('claimed','submitting','ambiguous')); UPDATE public.mailer_campaigns
SET controller_id = p_controller_id, controller_lease_expires_at = v_now + make_interval(secs => v_lease_secs) WHERE id = p_campaign_id;
FOR v_existing_batch IN SELECT * FROM public.mailer_batches mb
WHERE mb.campaign_id = p_campaign_id AND mb.status IN ('claimed', 'submitting', 'ambiguous') ORDER BY mb.seq ASC
FOR UPDATE LOOP IF v_existing_batch.claimed_at < (v_now - interval '23 hours') THEN
UPDATE public.mailer_queue mq SET status = 'accepted', provider_message_id = COALESCE(
mq.provider_message_id, ( SELECT ee.provider_email_id
FROM public.email_events ee WHERE ee.campaign_id = p_campaign_id AND lower(trim(ee.recipient_email)) = mq.email_normalized
AND ee.provider_email_id IS NOT NULL ORDER BY ee.occurred_at DESC LIMIT 1
), ( SELECT rel.provider_id
FROM public.recruit_email_logs rel WHERE rel.campaign_id = p_campaign_id AND lower(trim(rel.recipient_email)) = mq.email_normalized
AND rel.provider_id IS NOT NULL ORDER BY rel.sent_at DESC LIMIT 1
) ), processed_at = COALESCE(mq.processed_at, v_now),
last_error = NULL, error_code = NULL WHERE mq.id = ANY(v_existing_batch.item_ids)
AND mq.status IN ('claimed', 'processing') AND ( mq.provider_message_id IS NOT NULL
OR EXISTS ( SELECT 1 FROM public.email_events ee
WHERE ee.campaign_id = p_campaign_id AND lower(trim(ee.recipient_email)) = mq.email_normalized AND ee.provider_email_id IS NOT NULL
) OR EXISTS ( SELECT 1
FROM public.recruit_email_logs rel WHERE rel.campaign_id = p_campaign_id AND lower(trim(rel.recipient_email)) = mq.email_normalized
AND rel.provider_id IS NOT NULL ) );
UPDATE public.mailer_queue mq SET status = 'unconfirmed', error_code = 'AMBIGUOUS_EXPIRED_23H',
failure_category = 'ambiguous_expired_23h', last_error = 'Lote ambíguo expirou a janela de 23h de idempotência sem confirmação do provedor; requer decisão humana.', processed_at = COALESCE(mq.processed_at, v_now)
WHERE mq.id = ANY(v_existing_batch.item_ids) AND mq.status IN ('claimed', 'processing'); UPDATE public.mailer_batches
SET status = 'failed', last_error = 'AMBIGUOUS_EXPIRED_23H', finished_at = v_now
WHERE id = v_existing_batch.id; ELSE UPDATE public.mailer_batches
SET status = 'submitting', submitted_at = v_now WHERE id = v_existing_batch.id;
UPDATE public.mailer_queue mq SET reserved_by = p_controller_id, reserved_at = v_now,
reservation_expires_at = v_now + make_interval(secs => v_lease_secs) WHERE mq.id = ANY(v_existing_batch.item_ids) AND mq.status IN ('claimed', 'processing');
SELECT COALESCE( jsonb_agg( jsonb_build_object(
'id', mq.id, 'campaign_id', mq.campaign_id, 'coach_id', mq.coach_id,
'recipient_email', mq.recipient_email, 'email_normalized', mq.email_normalized, 'recipient_name', mq.recipient_name,
'university_name', mq.university_name, 'email_type', mq.email_type, 'subject', mq.subject,
'payload', mq.payload, 'idempotency_key', mq.idempotency_key, 'status', mq.status,
'batch_number', mq.batch_number, 'attempts', mq.attempts, 'max_attempts', mq.max_attempts
) ORDER BY array_position(v_existing_batch.item_ids, mq.id) ),
'[]'::jsonb ) INTO v_items
FROM public.mailer_queue mq WHERE mq.id = ANY(v_existing_batch.item_ids); RETURN jsonb_build_object(
'claimed', true, 'reusedBatch', true, 'batchId', v_existing_batch.id,
'seq', v_existing_batch.seq, 'idempotencyKey', v_existing_batch.idempotency_key, 'attempts', v_existing_batch.attempts,
'previousStatus', v_existing_batch.status, 'requestPayload', v_existing_batch.request_payload, 'campaignStatus', 'running', 'items', v_items
); END IF; END LOOP;
WITH locked_items AS ( SELECT mq.id FROM public.mailer_queue mq
WHERE mq.campaign_id = p_campaign_id AND mq.status = 'pending' AND (mq.next_retry_at IS NULL OR mq.next_retry_at <= v_now)
ORDER BY mq.batch_number ASC, mq.created_at ASC, mq.id ASC LIMIT v_effective_size FOR UPDATE SKIP LOCKED
) SELECT array_agg(id) INTO v_item_ids
FROM locked_items; IF v_item_ids IS NULL OR array_length(v_item_ids, 1) IS NULL OR array_length(v_item_ids, 1) = 0 THEN SELECT COUNT(*)::integer
INTO v_pending_remaining FROM public.mailer_queue mq WHERE mq.campaign_id = p_campaign_id
AND mq.status IN ('pending', 'claimed', 'processing'); IF v_pending_remaining = 0 THEN With final_rollups AS (
SELECT count(*) FILTER (WHERE status IN ('accepted', 'sent'))::integer AS acc_cnt, count(*) FILTER (WHERE status IN ('failed_permanent', 'failed'))::integer AS fp_cnt,
count(*) FILTER (WHERE status IN ('failed_retryable', 'retry'))::integer AS fr_cnt, count(*) FILTER (WHERE status = 'unconfirmed')::integer AS unc_cnt, count(*) FILTER (WHERE status = 'cancelled')::integer AS can_cnt
FROM public.mailer_queue WHERE campaign_id = p_campaign_id )
UPDATE public.mailer_campaigns mc SET status = 'completed', completed_at = COALESCE(mc.completed_at, v_now),
accepted_count = fr.acc_cnt, sent_count = fr.acc_cnt, failed_permanent_count = fr.fp_cnt,
failed_retryable_count = fr.fr_cnt, failed_count = fr.fp_cnt + fr.fr_cnt, unconfirmed_count = fr.unc_cnt,
cancelled_count = fr.can_cnt, controller_id = NULL, controller_lease_expires_at = NULL
FROM final_rollups fr WHERE mc.id = p_campaign_id; RETURN jsonb_build_object(
'claimed', false, 'reason', 'QUEUE_DRAINED', 'campaignStatus', 'completed',
'items', '[]'::jsonb ); END IF;
RETURN jsonb_build_object( 'claimed', false, 'reason', 'AWAITING_RETRY_WINDOW',
'campaignStatus', 'running', 'items', '[]'::jsonb );
END IF; SELECT COALESCE(MAX(mb.seq), 0) + 1 INTO v_seq
FROM public.mailer_batches mb WHERE mb.campaign_id = p_campaign_id; v_idempotency_key := 'mc:' || p_campaign_id::text || ':b' || v_seq::text;
INSERT INTO public.mailer_batches ( campaign_id, seq,
item_ids, idempotency_key, status,
attempts, claimed_at, submitted_at
) VALUES ( p_campaign_id, v_seq,
v_item_ids, v_idempotency_key, 'submitting',
0, v_now, v_now
) RETURNING id INTO v_batch_id; UPDATE public.mailer_queue mq
SET status = 'claimed', batch_id = v_batch_id, batch_seq = v_seq,
reserved_by = p_controller_id, reserved_at = v_now, reservation_expires_at = v_now + make_interval(secs => v_lease_secs)
WHERE mq.id = ANY(v_item_ids); UPDATE public.mailer_campaigns SET current_batch = GREATEST(current_batch, v_seq)
WHERE id = p_campaign_id; SELECT COALESCE( jsonb_agg(
jsonb_build_object( 'id', mq.id, 'campaign_id', mq.campaign_id,
'coach_id', mq.coach_id, 'recipient_email', mq.recipient_email, 'email_normalized', mq.email_normalized,
'recipient_name', mq.recipient_name, 'university_name', mq.university_name, 'email_type', mq.email_type,
'subject', mq.subject, 'payload', mq.payload, 'idempotency_key', mq.idempotency_key,
'status', mq.status, 'batch_number', mq.batch_number, 'attempts', mq.attempts,
'max_attempts', mq.max_attempts ) ORDER BY array_position(v_item_ids, mq.id)
), '[]'::jsonb )
INTO v_items FROM public.mailer_queue mq WHERE mq.id = ANY(v_item_ids);
RETURN jsonb_build_object( 'claimed', true, 'reusedBatch', false,
'batchId', v_batch_id, 'seq', v_seq, 'idempotencyKey', v_idempotency_key,
'attempts', 0, 'previousStatus', 'claimed', 'campaignStatus', 'running',
'items', v_items ); END;
$$;

REVOKE ALL ON FUNCTION public.claim_mailer_batch(uuid,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mailer_batch(uuid,text,integer,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

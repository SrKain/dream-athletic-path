-- 0031 / 03A: finalize_mailer_batch. Execute apos 01 e 02.
BEGIN;
DO $$BEGIN IF to_regprocedure('public.claim_mailer_batch(uuid,text,integer,integer)') IS NULL THEN RAISE EXCEPTION 'Execute 02 antes de 03A'; END IF; END; $;
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
IF p_batch_status IN ('claimed', 'ambiguous') THEN
v_new_attempts := v_batch.attempts + 1;
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
REVOKE ALL ON FUNCTION public.finalize_mailer_batch(uuid,uuid,text,text,integer,jsonb,jsonb,text,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_mailer_batch(uuid,uuid,text,text,integer,jsonb,jsonb,text,integer,boolean) TO service_role;
COMMIT;

-- TASK-116: aplicar manualmente, na ordem 0033a–0033f; antes do código.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.mailer_require_0033()') IS NULL THEN RAISE EXCEPTION 'PRECHECK_0033: apply 0033a first'; END IF; PERFORM public.mailer_require_0033(); END $$;
CREATE OR REPLACE FUNCTION public.finalize_mailer_batch( p_campaign_id uuid, p_batch_id uuid,
p_controller_id text, p_batch_status text, p_http_status integer DEFAULT NULL,
p_provider_response jsonb DEFAULT NULL, p_outcomes jsonb DEFAULT '[]'::jsonb, p_pause_reason text DEFAULT NULL,
p_next_tick_ms integer DEFAULT 1500, p_dry_run boolean DEFAULT false )
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$ DECLARE
v_now timestamptz := now(); v_batch record; v_campaign record;
v_outcome record; v_queue_row record; v_item_status text;
v_provider_id text; v_error_code text; v_error_msg text;
v_failure_cat text; v_new_attempts integer; v_max_ambiguous constant integer := 8;
v_key_window constant interval := interval '23 hours'; v_max_backoff_ms constant integer := 300000; v_retry_ms integer;
v_retry_exhausted boolean; v_acc_cnt integer := 0; v_fp_cnt integer := 0;
v_fr_cnt integer := 0; v_unc_cnt integer := 0; v_can_cnt integer := 0;
v_pend_cnt integer := 0; v_claim_cnt integer := 0; v_next_campaign_status text;
v_primary_athlete_id uuid; BEGIN SELECT *
INTO v_campaign FROM public.mailer_campaigns mc WHERE mc.id = p_campaign_id
FOR UPDATE; IF v_campaign.id IS NULL THEN RAISE EXCEPTION 'FINALIZE_BATCH_CAMPAIGN_NOT_FOUND: %', p_campaign_id;
END IF; SELECT * INTO v_batch
FROM public.mailer_batches mb WHERE mb.id = p_batch_id AND mb.campaign_id = p_campaign_id
FOR UPDATE; IF v_batch.id IS NULL THEN RAISE EXCEPTION 'FINALIZE_BATCH_NOT_FOUND: %', p_batch_id;
END IF; IF v_campaign.athlete_ids IS NOT NULL AND array_length(v_campaign.athlete_ids, 1) > 0 THEN v_primary_athlete_id := v_campaign.athlete_ids[1];
ELSE v_primary_athlete_id := NULL; END IF;
IF v_campaign.status='cancelled' OR v_batch.status IN ('accepted','partial','failed') THEN RETURN jsonb_build_object('finalized',true,'campaignStatus',v_campaign.status,'alreadyClosed',true); END IF;
IF v_campaign.controller_id IS NOT NULL AND v_campaign.controller_id<>p_controller_id THEN RAISE EXCEPTION 'FINALIZE_LEASE_LOST'; END IF; IF p_batch_status IN ('claimed','ambiguous') THEN v_new_attempts := v_batch.attempts+1;
v_retry_exhausted := v_batch.claimed_at <= v_now-v_key_window; IF p_batch_status='ambiguous' THEN v_retry_exhausted := v_retry_exhausted OR v_batch.ambiguous_attempts+1>=v_max_ambiguous;
END IF; v_retry_ms := LEAST(v_max_backoff_ms,GREATEST(COALESCE(p_next_tick_ms,1500), COALESCE((p_provider_response->>'retryAfterMs')::integer,0),
(2000*power(2,LEAST(v_batch.retry_attempts,8)))::integer)); UPDATE public.mailer_batches SET status=CASE WHEN v_retry_exhausted THEN 'failed' ELSE p_batch_status END,
attempts=v_new_attempts, retry_attempts=retry_attempts+CASE WHEN p_batch_status='claimed' THEN 1 ELSE 0 END, ambiguous_attempts=ambiguous_attempts+CASE WHEN p_batch_status='ambiguous' THEN 1 ELSE 0 END,
provider_http_status=p_http_status,provider_response=p_provider_response, last_error=COALESCE(p_provider_response->>'message',last_error), finished_at=CASE WHEN v_retry_exhausted THEN v_now ELSE NULL END, request_payload=CASE WHEN v_retry_exhausted THEN NULL ELSE request_payload END
WHERE id=p_batch_id; UPDATE public.mailer_queue mq SET status=CASE WHEN v_retry_exhausted THEN 'unconfirmed' ELSE 'claimed' END,
attempts=v_new_attempts, error_code=CASE WHEN v_retry_exhausted THEN 'REPLAY_WINDOW_OR_ATTEMPTS_EXHAUSTED' ELSE p_provider_response->>'errorCode' END, failure_category=CASE WHEN v_retry_exhausted THEN 'replay_exhausted' ELSE failure_category END,
last_error=CASE WHEN v_retry_exhausted THEN 'Janela de 23h ou 8 respostas ambíguas esgotadas; requer reconciliação.' ELSE p_provider_response->>'message' END, processed_at=CASE WHEN v_retry_exhausted THEN v_now ELSE processed_at END WHERE mq.id=ANY(v_batch.item_ids) AND mq.status IN ('claimed','processing','pending');
ELSE IF p_outcomes IS NOT NULL AND jsonb_typeof(p_outcomes) = 'array' THEN FOR v_outcome IN
SELECT (elem->>'id')::uuid AS item_id, COALESCE(elem->>'status', 'failed_permanent') AS target_status,
NULLIF(trim(COALESCE(elem->>'providerMessageId', elem->>'provider_message_id', '')), '') AS provider_id, NULLIF(trim(COALESCE(elem->>'errorCode', elem->>'error_code', '')), '') AS err_code, NULLIF(trim(COALESCE(elem->>'errorMessage', elem->>'last_error', '')), '') AS err_msg,
NULLIF(trim(COALESCE(elem->>'failureCategory', elem->>'failure_category', '')), '') AS fail_cat FROM jsonb_array_elements(p_outcomes) AS elem LOOP
SELECT * INTO v_queue_row FROM public.mailer_queue mq
WHERE mq.id = v_outcome.item_id AND mq.campaign_id = p_campaign_id FOR UPDATE;
IF v_queue_row.id IS NULL THEN CONTINUE; END IF;
v_item_status := v_outcome.target_status; v_provider_id := v_outcome.provider_id; v_error_code := v_outcome.err_code;
v_error_msg := v_outcome.err_msg; v_failure_cat := v_outcome.fail_cat; IF v_item_status = 'accepted' AND v_provider_id IS NULL THEN
v_item_status := 'unconfirmed'; v_error_code := COALESCE(v_error_code, 'MISSING_PROVIDER_MESSAGE_ID'); v_failure_cat := COALESCE(v_failure_cat, 'missing_provider_id');
v_error_msg := COALESCE( v_error_msg, 'Resposta 200 recebida sem provider_message_id para este destinatário.'
); END IF; UPDATE public.mailer_queue
SET status = v_item_status, provider_message_id = COALESCE(v_provider_id, provider_message_id), attempts = v_batch.attempts + 1,
error_code = CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_error_code END, failure_category = CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_failure_cat END, last_error = CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_error_msg END,
processed_at = v_now, reserved_by = NULL, reservation_expires_at = NULL
WHERE id = v_queue_row.id; IF NOT COALESCE(p_dry_run, false) AND v_item_status IN ('accepted', 'failed_permanent', 'failed_retryable') THEN BEGIN
IF NOT EXISTS ( SELECT 1 FROM public.recruit_email_logs rel
WHERE rel.campaign_id = p_campaign_id AND lower(trim(rel.recipient_email)) = v_queue_row.email_normalized ) THEN
INSERT INTO public.recruit_email_logs ( athlete_id, athlete_ids,
coach_id, campaign_id, recipient_email,
recipient_name, university_name, subject,
email_type, status, error_message,
provider_id, sent_at ) VALUES (
v_primary_athlete_id, v_campaign.athlete_ids, v_queue_row.coach_id,
p_campaign_id, v_queue_row.recipient_email, v_queue_row.recipient_name,
v_queue_row.university_name, v_queue_row.subject, v_queue_row.email_type,
CASE WHEN v_item_status = 'accepted' THEN 'sent' ELSE 'failed' END, CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_error_msg END, v_provider_id,
v_now ); END IF;
EXCEPTION WHEN OTHERS THEN NULL; END;
END IF; END LOOP; END IF;
UPDATE public.mailer_batches SET status = CASE WHEN p_batch_status IN ('accepted', 'partial', 'failed') THEN p_batch_status
ELSE 'accepted' END, attempts = v_batch.attempts + 1,
provider_http_status = p_http_status, provider_response = p_provider_response, last_error = CASE WHEN p_batch_status = 'accepted' THEN NULL ELSE COALESCE(p_provider_response->>'message', last_error) END,
finished_at = v_now, request_payload=NULL WHERE id = p_batch_id; END IF;
SELECT count(*) FILTER (WHERE status = 'pending')::integer, count(*) FILTER (WHERE status IN ('claimed', 'processing'))::integer,
count(*) FILTER (WHERE status IN ('accepted', 'sent'))::integer, count(*) FILTER (WHERE status IN ('failed_permanent', 'failed'))::integer, count(*) FILTER (WHERE status IN ('failed_retryable', 'retry'))::integer,
count(*) FILTER (WHERE status = 'unconfirmed')::integer, count(*) FILTER (WHERE status = 'cancelled')::integer INTO
v_pend_cnt, v_claim_cnt, v_acc_cnt,
v_fp_cnt, v_fr_cnt, v_unc_cnt,
v_can_cnt FROM public.mailer_queue WHERE campaign_id = p_campaign_id;
IF v_campaign.status='paused' THEN v_next_campaign_status := 'paused'; ELSIF p_pause_reason IS NOT NULL AND trim(p_pause_reason) <> '' THEN
v_next_campaign_status := 'paused'; ELSIF v_pend_cnt = 0 AND v_claim_cnt = 0 THEN v_next_campaign_status := 'completed';
ELSE v_next_campaign_status := v_campaign.status; END IF;
UPDATE public.mailer_campaigns SET status = v_next_campaign_status, accepted_count = v_acc_cnt,
sent_count = v_acc_cnt, failed_permanent_count = v_fp_cnt, failed_retryable_count = v_fr_cnt,
failed_count = v_fp_cnt + v_fr_cnt, unconfirmed_count = v_unc_cnt, cancelled_count = v_can_cnt,
paused_at = CASE WHEN v_next_campaign_status = 'paused' THEN v_now ELSE paused_at END, completed_at = CASE WHEN v_next_campaign_status = 'completed' THEN COALESCE(completed_at, v_now) ELSE completed_at END, safety_pause_reason = CASE WHEN p_pause_reason IS NOT NULL THEN p_pause_reason ELSE safety_pause_reason END,
last_error = CASE WHEN p_pause_reason IS NOT NULL THEN p_pause_reason WHEN p_batch_status = 'accepted' THEN NULL
ELSE COALESCE(p_provider_response->>'message', last_error) END, next_batch_at = v_now + make_interval(secs => GREATEST(0, COALESCE(v_retry_ms, p_next_tick_ms, 1500))::numeric / 1000.0),
controller_id = CASE WHEN v_next_campaign_status IN ('completed', 'paused', 'cancelled') THEN NULL ELSE p_controller_id END, controller_lease_expires_at = CASE WHEN v_next_campaign_status IN ('completed', 'paused', 'cancelled') THEN NULL
ELSE v_now + interval '90 seconds' END WHERE id = p_campaign_id;
RETURN jsonb_build_object( 'finalized', true, 'campaignId', p_campaign_id,
'batchId', p_batch_id, 'batchStatus', p_batch_status, 'campaignStatus', v_next_campaign_status,
'pendingCount', v_pend_cnt, 'claimedCount', v_claim_cnt, 'acceptedCount', v_acc_cnt,
'failedPermanentCount', v_fp_cnt, 'failedRetryableCount', v_fr_cnt, 'unconfirmedCount', v_unc_cnt,
'cancelledCount', v_can_cnt ); END;
$$;

REVOKE ALL ON FUNCTION public.finalize_mailer_batch(uuid,uuid,text,text,integer,jsonb,jsonb,text,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_mailer_batch(uuid,uuid,text,text,integer,jsonb,jsonb,text,integer,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- TASK-116: aplicar manualmente, na ordem 0033a–0033f; antes do código.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.mailer_require_0033()') IS NULL THEN RAISE EXCEPTION 'PRECHECK_0033: apply 0033a first'; END IF; PERFORM public.mailer_require_0033(); END $$;
CREATE OR REPLACE FUNCTION public.mailer_campaign_progress( p_campaign_id uuid )
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$ DECLARE
v_now timestamptz := now(); v_campaign record; v_pend integer := 0;
v_claim integer := 0; v_acc integer := 0; v_fp integer := 0;
v_fr integer := 0; v_unc integer := 0; v_can integer := 0;
v_supp_queue integer := 0; v_states_sum integer := 0; v_decided integer := 0;
v_eligible integer := 0; v_delivered integer := 0; v_bounced integer := 0;
v_complained integer := 0; v_opened integer := 0; v_clicked integer := 0;
v_awaiting_delivery integer := 0; v_elapsed_sec numeric := 0; v_throughput numeric := 0;
v_eta_sec integer := NULL; v_active_batch record; BEGIN
SELECT * INTO v_campaign FROM public.mailer_campaigns mc
WHERE mc.id = p_campaign_id; IF v_campaign.id IS NULL THEN RETURN NULL;
END IF; SELECT count(*) FILTER (WHERE status = 'pending')::integer,
count(*) FILTER (WHERE status IN ('claimed', 'processing'))::integer, count(*) FILTER (WHERE status IN ('accepted', 'sent'))::integer, count(*) FILTER (WHERE status IN ('failed_permanent', 'failed'))::integer,
count(*) FILTER (WHERE status IN ('failed_retryable', 'retry'))::integer, count(*) FILTER (WHERE status = 'unconfirmed')::integer, count(*) FILTER (WHERE status = 'cancelled')::integer,
count(*) FILTER (WHERE status = 'suppressed')::integer, count(*)::integer INTO
v_pend, v_claim, v_acc,
v_fp, v_fr, v_unc,
v_can, v_supp_queue, v_states_sum
FROM public.mailer_queue WHERE campaign_id = p_campaign_id; v_eligible := CASE
WHEN v_campaign.eligible_count > 0 THEN v_campaign.eligible_count ELSE v_states_sum END;
v_decided := v_acc + v_fp + v_fr + v_unc + v_can + v_supp_queue; SELECT COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.delivered')::integer,
COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.bounced')::integer, COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.complained')::integer, COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.opened')::integer,
COUNT(DISTINCT ee.provider_email_id) FILTER ( WHERE ee.event_type = 'email.clicked' AND COALESCE(ee.is_probable_automated, false) = false
)::integer INTO v_delivered,
v_bounced, v_complained, v_opened,
v_clicked FROM public.email_events ee WHERE ee.campaign_id = p_campaign_id
AND ee.provider_email_id IS NOT NULL; v_awaiting_delivery := GREATEST(0, v_acc - v_delivered - v_bounced); IF v_campaign.started_at IS NOT NULL THEN
v_elapsed_sec := GREATEST( 1, EXTRACT(EPOCH FROM (COALESCE(v_campaign.completed_at, v_now) - v_campaign.started_at))
); IF v_decided > 0 THEN v_throughput := ROUND((v_decided::numeric / v_elapsed_sec), 2);
END IF; END IF; IF v_campaign.status = 'running' AND (v_pend + v_claim) > 0 THEN
IF v_throughput > 0 THEN v_eta_sec := CEIL((v_pend + v_claim)::numeric / v_throughput)::integer; ELSE
v_eta_sec := CEIL(((v_pend + v_claim)::numeric / 100.0) * 2.5)::integer; END IF; ELSIF v_campaign.status = 'completed' THEN
v_eta_sec := 0; END IF; SELECT mb.id, mb.seq, mb.status, mb.attempts, mb.idempotency_key
INTO v_active_batch FROM public.mailer_batches mb WHERE mb.campaign_id = p_campaign_id
ORDER BY mb.seq DESC LIMIT 1; RETURN jsonb_build_object(
'campaignId', v_campaign.id, 'subject', v_campaign.subject, 'mode', v_campaign.mode,
'status', v_campaign.status, 'engineVersion', COALESCE(v_campaign.engine_version, 'v2'), 'selectedCount', GREATEST(v_campaign.selected_count, v_eligible),
'eligibleCount', v_eligible, 'totalRecipients', v_eligible, 'pendingCount', v_pend,
'claimedCount', v_claim, 'processingCount', v_claim, 'acceptedCount', v_acc,
'sentCount', v_acc, 'failedPermanentCount', v_fp, 'failedRetryableCount', v_fr,
'failedCount', (v_fp + v_fr), 'unconfirmedCount', v_unc, 'cancelledCount', v_can,
'suppressedCount', COALESCE(v_campaign.suppressed_count, 0) + v_supp_queue, 'decidedCount', v_decided, 'statesSum', v_states_sum,
'invariantValid', (v_states_sum = v_eligible), 'submissionPercent', CASE WHEN v_eligible > 0 THEN LEAST(100, ROUND((v_acc::numeric / v_eligible::numeric) * 100.0)::integer)
ELSE 100 END, 'deliveryPercent', CASE
WHEN v_acc > 0 THEN LEAST(100, ROUND((v_delivered::numeric / v_acc::numeric) * 100.0)::integer) ELSE 0 END,
'deliveredCount', v_delivered, 'bouncedCount', v_bounced, 'complainedCount', v_complained,
'openedCount', v_opened, 'clickedCount', v_clicked, 'awaitingDeliveryCount', v_awaiting_delivery,
'currentBatch', COALESCE(v_active_batch.seq, v_campaign.current_batch, 0), 'totalBatches', GREATEST(1, COALESCE(v_campaign.total_batches, CEIL(GREATEST(v_eligible, 1)::numeric / 100.0)::integer)), 'batchSize', COALESCE(v_campaign.batch_size, 100),
'lastBatchStatus', v_active_batch.status, 'lastBatchAttempts', COALESCE(v_active_batch.attempts, 0), 'lastBatchIdempotencyKey', v_active_batch.idempotency_key,
'exclusionsSummary', COALESCE(v_campaign.exclusions_summary, '{}'::jsonb), 'safetyPauseReason', v_campaign.safety_pause_reason, 'lastError', v_campaign.last_error,
'startedAt', v_campaign.started_at, 'completedAt', v_campaign.completed_at, 'pausedAt', v_campaign.paused_at,
'nextBatchAt', v_campaign.next_batch_at, 'controllerId', v_campaign.controller_id, 'controllerLeaseExpiresAt', v_campaign.controller_lease_expires_at,
'throughputPerSec', v_throughput, 'estimatedRemainingSeconds', v_eta_sec) || jsonb_build_object('lastProviderHttpStatus',(SELECT provider_http_status FROM public.mailer_batches WHERE campaign_id=p_campaign_id ORDER BY seq DESC LIMIT 1),'lastTickAt',v_campaign.last_tick_at,'lastTickBy',v_campaign.last_tick_by,'lastTickMessage',v_campaign.last_tick_message,
'staleSeconds',GREATEST(0,EXTRACT(EPOCH FROM (v_now-COALESCE(v_campaign.last_tick_at,v_campaign.started_at,v_campaign.created_at)))), 'health',CASE WHEN v_campaign.status='cancelled' THEN 'cancelled'
WHEN v_campaign.status='failed' THEN 'failed' WHEN v_campaign.status='paused' AND v_campaign.safety_pause_reason IS NOT NULL THEN 'paused_safety' WHEN v_unc>0 THEN 'needs_reconciliation'
WHEN v_campaign.status='paused' THEN 'paused_manual' WHEN v_campaign.status='completed' AND v_pend+v_claim>0 THEN 'needs_reconciliation' WHEN v_campaign.status='completed' AND v_fp+v_fr+v_can>0 THEN 'completed_with_issues'
WHEN v_campaign.status='completed' THEN 'completed' WHEN v_campaign.status='running' AND COALESCE(v_campaign.last_tick_at,v_campaign.started_at,v_campaign.created_at)<v_now-interval '45 seconds' AND COALESCE(v_campaign.controller_lease_expires_at,v_now)<=v_now THEN 'stalled'
WHEN v_campaign.status='running' AND v_campaign.next_batch_at>v_now AND EXISTS (SELECT 1 FROM public.mailer_batches b WHERE b.campaign_id=p_campaign_id AND b.status IN ('claimed','ambiguous') AND b.provider_http_status IN (429,409)) THEN 'waiting_provider' WHEN v_campaign.status='running' THEN 'sending' ELSE 'preparing' END,
'firstAcceptedAt',(SELECT min(processed_at) FROM public.mailer_queue WHERE campaign_id=p_campaign_id AND status IN ('accepted','sent')), 'webhookEventCount',(SELECT count(*) FROM public.email_events WHERE campaign_id=p_campaign_id), 'asOf', v_now
); END; $$;

REVOKE ALL ON FUNCTION public.mailer_campaign_progress(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_campaign_progress(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- TASK-116: aplicar manualmente, na ordem 0033a–0033f; antes do código.
BEGIN;
CREATE OR REPLACE FUNCTION public.mailer_require_0033() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_missing text[] := '{}'; x record; f text;
BEGIN
 FOR x IN SELECT * FROM (VALUES ('mailer_campaigns','id'),
('mailer_campaigns','status'),
('mailer_campaigns','athlete_ids'),
('mailer_campaigns','started_at'),
('mailer_campaigns','completed_at'),
('mailer_campaigns','paused_at'),
('mailer_campaigns','cancelled_at'),
('mailer_campaigns','last_error'),
('mailer_campaigns','next_batch_at'),
('mailer_campaigns','controller_id'),
('mailer_campaigns','controller_lease_expires_at'),
('mailer_campaigns','eligible_count'),
('mailer_campaigns','selected_count'),
('mailer_campaigns','manifest_count'),
('mailer_campaigns','accepted_count'),
('mailer_campaigns','sent_count'),
('mailer_campaigns','failed_permanent_count'),
('mailer_campaigns','failed_retryable_count'),
('mailer_campaigns','failed_count'),
('mailer_campaigns','unconfirmed_count'),
('mailer_campaigns','cancelled_count'),
('mailer_campaigns','suppressed_count'),
('mailer_campaigns','safety_pause_reason'),
('mailer_campaigns','current_batch'),
('mailer_campaigns','total_batches'),
('mailer_campaigns','batch_size'),
('mailer_campaigns','subject'),
('mailer_campaigns','mode'),
('mailer_campaigns','engine_version'),
('mailer_campaigns','exclusions_summary'),
('mailer_campaigns','created_at'),
('mailer_queue','id'),
('mailer_queue','campaign_id'),
('mailer_queue','coach_id'),
('mailer_queue','recipient_email'),
('mailer_queue','recipient_name'),
('mailer_queue','university_name'),
('mailer_queue','email_type'),
('mailer_queue','subject'),
('mailer_queue','payload'),
('mailer_queue','idempotency_key'),
('mailer_queue','status'),
('mailer_queue','batch_number'),
('mailer_queue','attempts'),
('mailer_queue','max_attempts'),
('mailer_queue','reserved_by'),
('mailer_queue','reserved_at'),
('mailer_queue','reservation_expires_at'),
('mailer_queue','next_retry_at'),
('mailer_queue','provider_message_id'),
('mailer_queue','last_error'),
('mailer_queue','error_code'),
('mailer_queue','processed_at'),
('mailer_queue','created_at'),
('mailer_queue','email_normalized'),
('mailer_queue','batch_id'),
('mailer_queue','batch_seq'),
('mailer_queue','failure_category'),
('mailer_batches','id'),
('mailer_batches','campaign_id'),
('mailer_batches','seq'),
('mailer_batches','item_ids'),
('mailer_batches','idempotency_key'),
('mailer_batches','status'),
('mailer_batches','attempts'),
('mailer_batches','provider_http_status'),
('mailer_batches','provider_response'),
('mailer_batches','last_error'),
('mailer_batches','claimed_at'),
('mailer_batches','submitted_at'),
('mailer_batches','finished_at'),
('mailer_batches','created_at'),
('email_events','campaign_id'),
('email_events','provider_email_id'),
('email_events','recipient_email'),
('email_events','occurred_at'),
('email_events','event_type'),
('email_events','payload'),
('email_events','tags'),
('email_events','is_probable_automated'),
('recruit_email_logs','campaign_id'),
('recruit_email_logs','recipient_email'),
('recruit_email_logs','provider_id'),
('recruit_email_logs','sent_at'),
('recruit_email_logs','athlete_id'),
('recruit_email_logs','athlete_ids'),
('recruit_email_logs','coach_id'),
('recruit_email_logs','subject'),
('recruit_email_logs','status'),
('recruit_email_logs','email_type'),
('recruit_email_logs','recipient_name'),
('recruit_email_logs','university_name'),
('recruit_email_logs','error_message'),
('user_roles','user_id'),
('user_roles','role')) AS cols(t,c) LOOP
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=x.t AND column_name=x.c) THEN
   v_missing := array_append(v_missing, x.t||'.'||x.c);
  END IF;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['is_agency_admin()', 'claim_mailer_batch(uuid,text,integer,integer)', 'finalize_mailer_batch(uuid,uuid,text,text,integer,jsonb,jsonb,text,integer,boolean)', 'mailer_campaign_progress(uuid)'] LOOP
  IF to_regprocedure('public.'||f) IS NULL THEN v_missing := array_append(v_missing, 'function:'||f); END IF;
 END LOOP;
 IF cardinality(v_missing)>0 THEN RAISE EXCEPTION 'PRECHECK_0033 missing: %', array_to_string(v_missing, ', '); END IF;
END $$;
SELECT public.mailer_require_0033();
ALTER TABLE public.mailer_campaigns
 ADD COLUMN IF NOT EXISTS last_tick_at timestamptz,
 ADD COLUMN IF NOT EXISTS last_tick_by text,
 ADD COLUMN IF NOT EXISTS last_tick_message text,
 ADD COLUMN IF NOT EXISTS bounce_guard_override_at timestamptz,
 ADD COLUMN IF NOT EXISTS bounce_guard_override_by uuid,
 ADD COLUMN IF NOT EXISTS bounce_guard_override_note text;
ALTER TABLE public.mailer_batches
 ADD COLUMN IF NOT EXISTS ambiguous_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS retry_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS request_payload jsonb;
CREATE OR REPLACE FUNCTION public.mailer_release_lease(p_campaign_id uuid,p_controller_id text,p_keep_seconds int DEFAULT 15)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE public.mailer_campaigns SET controller_lease_expires_at=LEAST(controller_lease_expires_at, now()+make_interval(secs=>LEAST(15,GREATEST(0,p_keep_seconds))))
 WHERE id=p_campaign_id AND controller_id=p_controller_id;
END $$;
CREATE OR REPLACE FUNCTION public.mailer_record_tick(p_campaign_id uuid,p_controller_id text,p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE public.mailer_campaigns SET last_tick_at=now(),last_tick_by=p_controller_id,last_tick_message=left(p_message,2000)
 WHERE id=p_campaign_id AND (controller_id=p_controller_id OR controller_id IS NULL);
END $$;
CREATE OR REPLACE FUNCTION public.mailer_store_batch_payload(p_campaign_id uuid,p_batch_id uuid,p_controller_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.mailer_campaigns; b public.mailer_batches;
BEGIN
 SELECT * INTO c FROM public.mailer_campaigns WHERE id=p_campaign_id FOR UPDATE;
 IF c.status<>'running' OR c.controller_id IS DISTINCT FROM p_controller_id OR c.controller_lease_expires_at<=now() THEN RAISE EXCEPTION 'BATCH_LEASE_LOST'; END IF;
 UPDATE public.mailer_batches SET request_payload=COALESCE(request_payload,p_payload)
 WHERE id=p_batch_id AND campaign_id=p_campaign_id AND status IN ('claimed','submitting','ambiguous') RETURNING * INTO b;
 IF b.id IS NULL THEN RAISE EXCEPTION 'BATCH_NOT_OPEN'; END IF;
 RETURN b.request_payload;
END $$;

REVOKE ALL ON FUNCTION public.mailer_require_0033() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_require_0033() TO service_role;
REVOKE ALL ON FUNCTION public.mailer_release_lease(uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_release_lease(uuid,text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.mailer_record_tick(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_record_tick(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.mailer_store_batch_payload(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_store_batch_payload(uuid,uuid,text,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

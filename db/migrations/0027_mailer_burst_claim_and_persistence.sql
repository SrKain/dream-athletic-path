-- 0027: Mailer burst reservation and atomic persistence.
-- Apply AFTER 0025 and 0026. Never expose privileged RPCs to authenticated/anon.
BEGIN;

CREATE OR REPLACE FUNCTION public.claim_mailer_queue_batch(
  p_worker_id text,
  p_batch_size integer DEFAULT 300,
  p_lock_duration_sec integer DEFAULT 240,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS SETOF public.mailer_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_campaign_id IS NULL OR nullif(btrim(p_worker_id), '') IS NULL THEN
    RAISE EXCEPTION 'Campaign and worker are required for scoped claim';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.mailer_campaigns c
    WHERE c.id = p_campaign_id AND c.status = 'running'
      AND (c.next_batch_at IS NULL OR c.next_batch_at <= v_now)
      AND c.controller_id IS NOT NULL
      AND c.controller_lease_expires_at > v_now
  ) THEN RETURN; END IF;
  RETURN QUERY
  WITH claimed AS (
    SELECT q.id FROM public.mailer_queue q
    WHERE q.campaign_id = p_campaign_id
      AND (q.status = 'pending' OR (
        q.status = 'retry'
        AND (q.next_retry_at IS NULL OR q.next_retry_at <= v_now)
        AND q.attempts < q.max_attempts
      ))
    ORDER BY q.batch_number, q.created_at, q.id
    LIMIT GREATEST(1, LEAST(300, COALESCE(p_batch_size, 300)))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.mailer_queue q
  SET status = 'processing',
      reserved_by = p_worker_id,
      reserved_at = v_now,
      reservation_expires_at = v_now + make_interval(secs => GREATEST(30, LEAST(600, COALESCE(p_lock_duration_sec,240)))),
      attempts = q.attempts + 1
  FROM claimed
  WHERE q.id = claimed.id
  RETURNING q.*;
END;
$$;

-- A single RPC provides one queue UPDATE, one log INSERT and one campaign UPDATE.
-- Provider acceptance is authoritative: accepted items may become sent even when
-- an operator cancelled the campaign during the in-flight request.
CREATE OR REPLACE FUNCTION public.complete_mailer_burst(
  p_campaign_id uuid,
  p_worker_id text,
  p_results jsonb,
  p_next_size integer DEFAULT 300,
  p_pause_ms integer DEFAULT 1000,
  p_lock_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  v_pause int := GREATEST(1000, LEAST(60000, COALESCE(p_pause_ms,1000)));
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
        provider_message_id = CASE WHEN r.status='sent'
                                  THEN r.provider_id ELSE q.provider_message_id END,
        error_code = r.error_code,
        last_error = r.error_message,
        next_retry_at = r.next_retry_at,
        -- Provider throttling does not consume a delivery attempt. Otherwise
        -- three 429s would strand a retry row permanently above max_attempts.
        attempts = CASE WHEN r.status = 'retry' AND r.error_code = '429'
                        THEN GREATEST(0, q.attempts - 1) ELSE q.attempts END,
        processed_at = CASE WHEN r.status IN ('sent','failed','cancelled')
                            THEN v_now ELSE NULL END,
        reserved_by = NULL, reserved_at = NULL, reservation_expires_at = NULL
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
    FROM updated u WHERE u.status IN ('sent','failed')
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

  RETURN jsonb_build_object('updated',v_updated,'logs',v_logs,
    'sent',v_sent,'failed',v_failed,'remaining',v_remaining,'cancelled',v_cancelled,
    'batch_size',v_size,'next_batch_at',
    (SELECT next_batch_at FROM public.mailer_campaigns WHERE id=p_campaign_id));
END;
$$;

-- Deployment gate: the worker checks this BEFORE contacting Resend.
CREATE OR REPLACE FUNCTION public.mailer_burst_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $ SELECT true $;
REVOKE ALL ON FUNCTION public.mailer_burst_ready()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_burst_ready()
  TO service_role;

REVOKE ALL ON FUNCTION public.claim_mailer_queue_batch(text,integer,integer,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mailer_queue_batch(text,integer,integer,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.complete_mailer_burst(uuid,text,jsonb,integer,integer,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mailer_burst(uuid,text,jsonb,integer,integer,timestamptz)
  TO service_role;
COMMIT;

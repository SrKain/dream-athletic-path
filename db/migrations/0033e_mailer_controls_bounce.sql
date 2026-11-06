-- TASK-116: aplicar manualmente, na ordem 0033a–0033f; antes do código.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.mailer_require_0033()') IS NULL THEN RAISE EXCEPTION 'PRECHECK_0033: apply 0033a first'; END IF; PERFORM public.mailer_require_0033(); END $$;

CREATE OR REPLACE FUNCTION public.mailer_campaign_bounce_stats(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a integer; h integer; t integer; c integer; r numeric:=0; o boolean; triggered boolean;
BEGIN
 SELECT accepted_count,bounce_guard_override_at IS NOT NULL INTO a,o FROM public.mailer_campaigns WHERE id=p_campaign_id;
 SELECT count(DISTINCT provider_email_id) FILTER (WHERE event_type='email.bounced' AND
 (payload->'bounce'->>'type' ILIKE 'Permanent' OR payload->>'bounce_type' ILIKE 'Permanent')),
 count(DISTINCT provider_email_id) FILTER (WHERE event_type='email.bounced' AND NOT COALESCE(
 (payload->'bounce'->>'type' ILIKE 'Permanent' OR payload->>'bounce_type' ILIKE 'Permanent'),false)),
 count(DISTINCT provider_email_id) FILTER (WHERE event_type ILIKE '%complain%')
 INTO h,t,c FROM public.email_events WHERE campaign_id=p_campaign_id OR tags->>'campaign_id'=p_campaign_id::text;
 IF a>0 THEN r:=100.0*h/a; END IF;
 triggered:=CASE WHEN o THEN r>8.0 ELSE a>=200 AND h>=5 AND r>3.0 END;
 RETURN jsonb_build_object('sent_count',COALESCE(a,0),'permanent_bounces',h,'transient_bounces',t,'complaints',c,
 'bounce_rate',round(r,2),'complaint_rate',CASE WHEN a>0 THEN round(100.0*c/a,3) ELSE 0 END,
 'bounce_guard_triggered',COALESCE(triggered,false),'override_active',COALESCE(o,false));
END $$;
CREATE OR REPLACE FUNCTION public.mailer_control_campaign(p_campaign_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.mailer_campaigns; b jsonb;
BEGIN
 SELECT * INTO c FROM public.mailer_campaigns WHERE id=p_campaign_id FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND'; END IF;
 IF p_action='pause' AND c.status='running' THEN
  UPDATE public.mailer_campaigns SET status='paused',paused_at=now(),controller_id=NULL,controller_lease_expires_at=NULL WHERE id=c.id;
 ELSIF p_action='resume' AND c.status='paused' THEN
  b:=public.mailer_campaign_bounce_stats(c.id);
  IF (b->>'bounce_guard_triggered')::boolean THEN RAISE EXCEPTION 'BOUNCE_GUARD: taxa % pct; mínimo 200 aceitos e 5 hard bounces; limite com override 8 pct',b->>'bounce_rate'; END IF;
  IF EXISTS(SELECT 1 FROM public.mailer_queue WHERE campaign_id=c.id AND status='unconfirmed') THEN RAISE EXCEPTION 'NEEDS_RECONCILIATION'; END IF;
  -- Pausa por cota/configuração requer que o operador trate a causa antes de retomar.
  UPDATE public.mailer_campaigns SET status='running',paused_at=NULL,safety_pause_reason=NULL,last_error=NULL,
   controller_id=NULL,controller_lease_expires_at=NULL,next_batch_at=now() WHERE id=c.id;
 ELSIF p_action='cancel' AND c.status IN ('running','paused','queued','preparing','draft') THEN
  UPDATE public.mailer_queue SET status='cancelled',processed_at=now(),reserved_by=NULL,reservation_expires_at=NULL
   WHERE campaign_id=c.id AND status='pending';
  UPDATE public.mailer_queue SET status='unconfirmed',error_code='CANCELLED_IN_FLIGHT',failure_category='cancelled_in_flight',
   last_error='Cancelado durante envio; confira o provedor antes de reconciliar.',processed_at=now(),reserved_by=NULL,reservation_expires_at=NULL
   WHERE campaign_id=c.id AND status='claimed';
  UPDATE public.mailer_batches SET status='failed',last_error='CANCELLED_IN_FLIGHT',finished_at=now(),request_payload=NULL
   WHERE campaign_id=c.id AND status IN ('claimed','submitting','ambiguous');
  UPDATE public.mailer_campaigns SET status='cancelled',cancelled_at=now(),controller_id=NULL,controller_lease_expires_at=NULL,
   cancelled_count=(SELECT count(*) FROM public.mailer_queue WHERE campaign_id=c.id AND status='cancelled'),
   unconfirmed_count=(SELECT count(*) FROM public.mailer_queue WHERE campaign_id=c.id AND status='unconfirmed') WHERE id=c.id;
 ELSE RETURN jsonb_build_object('success',false,'message','Transição de campanha não permitida.'); END IF;
 RETURN jsonb_build_object('success',true,'message','Campanha atualizada.');
END $$;
CREATE OR REPLACE FUNCTION public.mailer_override_bounce_guard(p_campaign_id uuid,p_note text,p_actor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.mailer_campaigns; b jsonb;
BEGIN
 SELECT * INTO c FROM public.mailer_campaigns WHERE id=p_campaign_id FOR UPDATE;
 IF c.id IS NULL OR c.status<>'paused' THEN RAISE EXCEPTION 'CAMPAIGN_NOT_PAUSED'; END IF;
 IF length(trim(COALESCE(p_note,'')))<5 OR p_actor_id IS NULL THEN RAISE EXCEPTION 'OVERRIDE_NOTE_AND_ACTOR_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor_id AND role='agency_admin') THEN RAISE EXCEPTION 'OVERRIDE_AGENCY_REQUIRED'; END IF;
 b:=public.mailer_campaign_bounce_stats(c.id);
 IF (b->>'bounce_rate')::numeric>8 THEN RAISE EXCEPTION 'BOUNCE_HARD_CAP_8_PERCENT'; END IF;
 UPDATE public.mailer_campaigns SET bounce_guard_override_at=now(),bounce_guard_override_by=p_actor_id,bounce_guard_override_note=trim(p_note) WHERE id=c.id;
 RETURN public.mailer_control_campaign(c.id,'resume');
END $$;

REVOKE ALL ON FUNCTION public.mailer_campaign_bounce_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_campaign_bounce_stats(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mailer_control_campaign(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_control_campaign(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.mailer_override_bounce_guard(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_override_bounce_guard(uuid,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mailer_sync_lease(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.mailer_campaigns;
BEGIN
 SELECT * INTO c FROM public.mailer_campaigns WHERE id=p_campaign_id FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND'; END IF;
 IF c.controller_id IS NOT NULL AND c.controller_lease_expires_at>now() THEN
  RETURN jsonb_build_object('active',true,'controllerId',c.controller_id,'expiresAt',c.controller_lease_expires_at);
 END IF;
 UPDATE public.mailer_campaigns SET controller_id=NULL,controller_lease_expires_at=NULL WHERE id=c.id;
 RETURN jsonb_build_object('active',false);
END $$;
REVOKE ALL ON FUNCTION public.mailer_sync_lease(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_sync_lease(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

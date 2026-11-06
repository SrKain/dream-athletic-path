-- Somente para o PostgreSQL DESCARTÁVEL criado pelo runner local. Nunca produção.
BEGIN;
CREATE FUNCTION pg_temp.check_true(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION_FAILED: %',msg; END IF; END $$;
CREATE FUNCTION pg_temp.seed(n int) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE c uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.mailer_campaigns(id,mode,subject,status,eligible_count,accepted_count,started_at,next_batch_at)
 VALUES(c,'catalog','fixture','running',n,0,now(),now());
 INSERT INTO public.mailer_queue(campaign_id,recipient_email,email_normalized,recipient_name,email_type,subject,idempotency_key,status)
 SELECT c,'coach'||i||'@uni.edu','coach'||i||'@uni.edu','Coach','catalog_general','fixture',c::text||':'||i,'pending'
 FROM generate_series(1,n)i;
 RETURN c;
END $$;
DO $$
DECLARE c uuid; b jsonb; key text; i int; p jsonb; a uuid:=gen_random_uuid();
BEGIN
 c:=pg_temp.seed(100); b:=public.claim_mailer_batch(c,'tab-a'); key:=b->>'idempotencyKey';
 PERFORM pg_temp.check_true((b->>'claimed')::boolean,'first claim');
 PERFORM pg_temp.check_true(public.claim_mailer_batch(c,'cron-b')->>'reason'='LEASE_HELD_BY_OTHER','concurrent contender rejected');
 PERFORM public.mailer_record_tick(c,'tab-a','sent');
 PERFORM public.mailer_record_tick(c,'cron-b','fake heartbeat');
 PERFORM pg_temp.check_true((SELECT last_tick_by='tab-a' FROM public.mailer_campaigns WHERE id=c),'contender cannot fabricate heartbeat');
 FOR i IN 1..5 LOOP
  PERFORM public.finalize_mailer_batch(c,(b->>'batchId')::uuid,'tab-a','claimed',429,'{"retryAfterMs":5000}', '[]',NULL,5000,true);
  PERFORM pg_temp.check_true((SELECT count(*)=100 FROM public.mailer_queue WHERE campaign_id=c AND status='claimed'),'429 keeps claimed');
  PERFORM pg_temp.check_true((SELECT next_batch_at>=now()+interval '5 seconds' AND next_batch_at<=now()+interval '5 minutes' FROM public.mailer_campaigns WHERE id=c),'bounded backoff respects retry-after');
  UPDATE public.mailer_campaigns SET next_batch_at=now() WHERE id=c;
  b:=public.claim_mailer_batch(c,'tab-a');
  PERFORM pg_temp.check_true(b->>'idempotencyKey'=key,'same key on rate retry');
 END LOOP;
 PERFORM pg_temp.check_true((SELECT ambiguous_attempts=0 AND retry_attempts=5 FROM public.mailer_batches WHERE id=(b->>'batchId')::uuid),'separate retry counters');
 FOR i IN 1..8 LOOP
  PERFORM public.finalize_mailer_batch(c,(b->>'batchId')::uuid,'tab-a','ambiguous',503,'{}','[]',NULL,1500,true);
  PERFORM pg_temp.check_true((SELECT count(*)=100 FROM public.mailer_queue WHERE campaign_id=c AND status=CASE WHEN i<8 THEN 'claimed' ELSE 'unconfirmed' END),'8 ambiguous responses');
  IF i<8 THEN UPDATE public.mailer_campaigns SET next_batch_at=now() WHERE id=c; b:=public.claim_mailer_batch(c,'tab-a'); END IF;
 END LOOP;
 c:=pg_temp.seed(1); b:=public.claim_mailer_batch(c,'tab');
 UPDATE public.mailer_batches SET claimed_at=now()-interval '23 hours' WHERE campaign_id=c;
 PERFORM public.finalize_mailer_batch(c,(b->>'batchId')::uuid,'tab','claimed',409,'{}','[]',NULL,1000,true);
 PERFORM pg_temp.check_true((SELECT status='unconfirmed' FROM public.mailer_queue WHERE campaign_id=c),'23h window ends safely');
 c:=pg_temp.seed(101); b:=public.claim_mailer_batch(c,'tab');
 PERFORM public.mailer_control_campaign(c,'pause');
 PERFORM pg_temp.check_true((SELECT status='submitting' FROM public.mailer_batches WHERE campaign_id=c),'pause preserves open batch');
 UPDATE public.mailer_campaigns SET safety_pause_reason='quota resolved',last_error='quota resolved' WHERE id=c;
 PERFORM public.mailer_control_campaign(c,'resume');
 PERFORM pg_temp.check_true((SELECT status='running' AND safety_pause_reason IS NULL AND last_error IS NULL AND next_batch_at=now() FROM public.mailer_campaigns WHERE id=c),'resume clears treated pause');
 PERFORM public.mailer_control_campaign(c,'cancel');
 PERFORM pg_temp.check_true((SELECT count(*)=100 FROM public.mailer_queue WHERE campaign_id=c AND status='unconfirmed' AND error_code='CANCELLED_IN_FLIGHT'),'cancel in-flight');
 PERFORM pg_temp.check_true((SELECT count(*)=1 FROM public.mailer_queue WHERE campaign_id=c AND status='cancelled'),'cancel pending');
 PERFORM public.finalize_mailer_batch(c,(b->>'batchId')::uuid,'tab','accepted',200,'{}',jsonb_build_array(jsonb_build_object('id',b->'items'->0->>'id','status','accepted','providerMessageId','late')),NULL,0,true);
 PERFORM pg_temp.check_true((SELECT count(*)=0 FROM public.mailer_queue WHERE campaign_id=c AND status='accepted'),'late finalize cannot undo cancellation');
 c:=pg_temp.seed(1); UPDATE public.mailer_queue SET status='claimed' WHERE campaign_id=c;
 PERFORM public.claim_mailer_batch(c,'cron');
 PERFORM pg_temp.check_true((SELECT status='unconfirmed' AND error_code='ORPHANED_CLAIM' FROM public.mailer_queue WHERE campaign_id=c),'heal orphan conservatively');
 c:=pg_temp.seed(200); UPDATE public.mailer_campaigns SET accepted_count=199 WHERE id=c;
 INSERT INTO public.email_events(campaign_id,provider_email_id,event_type,payload)
 SELECT c,'hard'||g.value,'email.bounced','{"bounce":{"type":"Permanent"}}' FROM generate_series(1,20) AS g(value);
 PERFORM pg_temp.check_true(NOT (public.mailer_campaign_bounce_stats(c)->>'bounce_guard_triggered')::boolean,'min 200 accepted');
 UPDATE public.mailer_campaigns SET accepted_count=200 WHERE id=c;
 DELETE FROM public.email_events WHERE campaign_id=c;
 INSERT INTO public.email_events(campaign_id,provider_email_id,event_type,payload)
 SELECT c,'hard'||g.value,'email.bounced','{"bounce":{"type":"Permanent"}}' FROM generate_series(1,4) AS g(value);
 PERFORM pg_temp.check_true(NOT (public.mailer_campaign_bounce_stats(c)->>'bounce_guard_triggered')::boolean,'min 5 hard bounces');
 INSERT INTO public.email_events(campaign_id,provider_email_id,event_type,payload)
 SELECT c,'hard'||g.value,'email.bounced','{"bounce":{"type":"Permanent"}}' FROM generate_series(5,8) AS g(value);
 -- Duplicate provider event does not increase numerator.
 INSERT INTO public.email_events(campaign_id,provider_email_id,event_type,payload) VALUES(c,'hard1','email.bounced','{"bounce":{"type":"Permanent"}}');
 PERFORM pg_temp.check_true((public.mailer_campaign_bounce_stats(c)->>'permanent_bounces')::int=8,'deduplicate hard bounces');
 PERFORM pg_temp.check_true((public.mailer_campaign_bounce_stats(c)->>'bounce_guard_triggered')::boolean,'4pct stops');
 UPDATE public.mailer_campaigns SET status='paused',safety_pause_reason='Bounce Guard' WHERE id=c;
 INSERT INTO public.user_roles VALUES(a,'agency_admin');
 PERFORM public.mailer_override_bounce_guard(c,'Operador verificou endereços',a);
 PERFORM pg_temp.check_true((SELECT bounce_guard_override_by=a AND bounce_guard_override_at IS NOT NULL AND status='running' FROM public.mailer_campaigns WHERE id=c),'audited override');
 INSERT INTO public.email_events(campaign_id,provider_email_id,event_type,payload)
 SELECT c,'hard'||g.value,'email.bounced','{"bounce":{"type":"Permanent"}}' FROM generate_series(9,16) AS g(value);
 PERFORM pg_temp.check_true(NOT (public.mailer_campaign_bounce_stats(c)->>'bounce_guard_triggered')::boolean,'8pct boundary');
 INSERT INTO public.email_events(campaign_id,provider_email_id,event_type,payload) VALUES(c,'hard17','email.bounced','{"bounce":{"type":"Permanent"}}');
 PERFORM pg_temp.check_true((public.mailer_campaign_bounce_stats(c)->>'bounce_guard_triggered')::boolean,'hard cap above 8pct');
 c:=pg_temp.seed(5000);
 -- Virtual cron iterations: expire the lease/cooldown rather than sleeping 50 minutes.
 FOR i IN 1..50 LOOP
  UPDATE public.mailer_campaigns SET controller_lease_expires_at=now(),next_batch_at=now() WHERE id=c;
  b:=public.claim_mailer_batch(c,'cron-'||i);
  PERFORM pg_temp.check_true((b->>'claimed')::boolean,'cron claims next batch');
  SELECT jsonb_agg(jsonb_build_object('id',v->>'id','status','accepted','providerMessageId','dry-'||(v->>'id'))) INTO p FROM jsonb_array_elements(b->'items')v;
  PERFORM public.finalize_mailer_batch(c,(b->>'batchId')::uuid,'cron-'||i,'accepted',200,'{}',p,NULL,0,true);
  PERFORM public.mailer_release_lease(c,'cron-'||i,15);
 END LOOP;
 p:=public.mailer_campaign_progress(c);
 PERFORM pg_temp.check_true(p->>'health'='completed' AND (p->>'acceptedCount')::int=5000 AND (p->>'statesSum')::int=5000,'5000 completed by cron only');
 PERFORM pg_temp.check_true((SELECT count(*)=50 FROM public.mailer_batches WHERE campaign_id=c),'50 unique batches');
 c:=pg_temp.seed(1);
 UPDATE public.mailer_campaigns SET started_at=now()-interval '46 seconds',last_tick_at=NULL,controller_lease_expires_at=NULL WHERE id=c;
 PERFORM pg_temp.check_true(public.mailer_campaign_progress(c)->>'health'='stalled','stalled 46sec without lease');
 PERFORM pg_temp.check_true((public.mailer_cron_status()->>'enabled')::boolean=false,'cron absent is safe');
 RAISE NOTICE 'TASK-116 SQL assertions passed: retries, lifecycle, orphan, bounce, 5000 cron, health, cron absent';
END $$;
ROLLBACK;

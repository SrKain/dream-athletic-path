-- TASK-116: somente leitura. Executar após 0033a–0033f e novamente após 0032.
SELECT extname,extversion FROM pg_extension WHERE extname IN ('pg_cron','pg_net','supabase_vault');
SELECT column_name,data_type,is_nullable FROM information_schema.columns
 WHERE table_schema='public' AND table_name='mailer_campaigns'
 AND column_name IN ('last_tick_at','last_tick_by','last_tick_message','bounce_guard_override_at','bounce_guard_override_by','bounce_guard_override_note')
 ORDER BY column_name;
SELECT column_name,data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name='mailer_batches'
 AND column_name IN ('request_payload','retry_attempts','ambiguous_attempts');
WITH required(signature) AS (VALUES
 ('mailer_require_0033()'),('mailer_record_tick(uuid,text,text)'),('mailer_release_lease(uuid,text,integer)'),
 ('mailer_store_batch_payload(uuid,uuid,text,jsonb)'),('claim_mailer_batch(uuid,text,integer,integer)'),
 ('finalize_mailer_batch(uuid,uuid,text,text,integer,jsonb,jsonb,text,integer,boolean)'),
 ('mailer_campaign_progress(uuid)'),('mailer_campaign_bounce_stats(uuid)'),('mailer_control_campaign(uuid,text)'),
 ('mailer_override_bounce_guard(uuid,text,uuid)'),('mailer_sync_lease(uuid)'),('mailer_cron_status()'))
SELECT r.signature,p.oid IS NOT NULL AS exists,p.prosecdef AS security_definer,
 p.proconfig,NOT has_function_privilege('anon',p.oid,'EXECUTE') AS anon_blocked,
 NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_blocked,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_allowed
FROM required r LEFT JOIN pg_proc p ON p.oid=to_regprocedure('public.'||r.signature);
-- A função usa SQL dinâmico e tolera schema cron ausente. Nunca mostra segredos.
SELECT public.mailer_cron_status() AS cron_status;
SELECT count(*) AS orphaned_claims FROM public.mailer_queue q
 WHERE q.status='claimed' AND NOT EXISTS (SELECT 1 FROM public.mailer_batches b
 WHERE b.id=q.batch_id AND b.campaign_id=q.campaign_id AND q.id=ANY(b.item_ids)
 AND b.status IN ('claimed','submitting','ambiguous'));
SELECT id,status,last_tick_at,last_tick_by,last_tick_message,controller_id,controller_lease_expires_at,next_batch_at,
 public.mailer_campaign_progress(id)->>'health' AS health
 FROM public.mailer_campaigns WHERE status IN ('running','paused') ORDER BY created_at DESC LIMIT 20;
SELECT count(*) AS accepted_without_provider_id FROM public.mailer_queue
 WHERE status='accepted' AND nullif(trim(provider_message_id),'') IS NULL;

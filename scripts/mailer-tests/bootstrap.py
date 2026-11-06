"""Build a disposable pre-0033 fixture from real migration DDL; no production access."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
m=root/'db/migrations'
def table(file,name):
    sql=(m/file).read_text()
    return re.search(r'create table if not exists public\.'+name+r'\s*\([\s\S]*?\n\);',sql,re.I)[0]
sql="""CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE FUNCTION public.is_agency_admin() RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE TABLE public.user_roles(user_id uuid,role text);
CREATE TABLE public.coaches(id uuid PRIMARY KEY);
CREATE TABLE public.recruit_email_logs(id uuid DEFAULT gen_random_uuid(),campaign_id uuid,recipient_email text,provider_id text,sent_at timestamptz,athlete_id uuid,athlete_ids uuid[],coach_id uuid,subject text,status text,email_type text,recipient_name text,university_name text,error_message text);
CREATE TABLE public.email_events(id uuid DEFAULT gen_random_uuid(),campaign_id uuid,provider_email_id text,recipient_email text,occurred_at timestamptz,event_type text,payload jsonb,tags jsonb,is_probable_automated boolean DEFAULT false);
CREATE TABLE public.mailer_campaign_snapshots(campaign_id uuid,snapshot jsonb);
"""
sql+=table('0022_mailer_campaigns_and_metrics_rpc.sql','mailer_campaigns')+'\n'
s=(m/'0024_mailer_queue_and_rate_limiting.sql').read_text()
sql+=s[s.index('alter table public.mailer_campaigns'):s.index('-- Constraint de status')]
sql+=table('0024_mailer_queue_and_rate_limiting.sql','mailer_queue')+'\n'
s=(m/'0025_mailer_campaign_scoped_queue_and_metrics.sql').read_text();sql+=s[s.index('alter table public.mailer_campaigns'):s.index('create index')]
s=(m/'0031_mailer_reliability.sql').read_text();sql+=table('0031_mailer_reliability.sql','mailer_batches')+'\n'
a=s.index('ALTER TABLE public.mailer_campaigns\n  ADD COLUMN');b=s.index('CREATE UNIQUE INDEX',a);sql+=s[a:b]
a=s.index('ALTER TABLE public.mailer_queue\n  ADD COLUMN');b=s.index('-- Preencher email_normalized',a);sql+=s[a:b]
sql+='ALTER TABLE public.mailer_queue DROP CONSTRAINT mailer_queue_status_check;\n'
sql+="ALTER TABLE public.mailer_queue ADD CONSTRAINT mailer_queue_status_check CHECK(status IN ('pending','claimed','processing','accepted','sent','failed_permanent','failed','failed_retryable','retry','unconfirmed','cancelled','suppressed'));\n"
for name in ['claim_mailer_batch','finalize_mailer_batch','mailer_campaign_progress']:
    a=s.index('CREATE OR REPLACE FUNCTION public.'+name+'(');b=s.index('\n$$;',a)+4;sql+=s[a:b]+'\n'
print(sql)

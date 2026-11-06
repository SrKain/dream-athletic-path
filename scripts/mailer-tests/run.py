"""Offline integration checks in a disposable PostgreSQL; never connects to Supabase.
Pull postgres:17-alpine beforehand; the runner itself never pulls or exposes a port.
Usage: python3 scripts/mailer-tests/run.py
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
NAME = 'mailer-task116-' + uuid.uuid4().hex[:10]
IMAGE = 'postgres:17-alpine@sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac'

def sql(source):
    result = subprocess.run(DOCKER + ['exec', '-i', NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input=source, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

try:
    subprocess.run(DOCKER + ['run', '--pull=never', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=isolated-fixture-only', IMAGE], check=True, capture_output=True)
    for attempt in range(60):
        probe = subprocess.run(DOCKER + ['exec', NAME, 'pg_isready', '-U', 'postgres'], capture_output=True)
        if probe.returncode == 0:
            break
        time.sleep(.5)
    else:
        raise RuntimeError('PostgreSQL fixture did not become ready')
    bootstrap = subprocess.run([sys.executable, str(Path(__file__).with_name('bootstrap.py'))], check=True, capture_output=True, text=True).stdout
    sql(bootstrap)
    for repeat in range(2):
        for path in sorted((ROOT/'db/migrations').glob('0033*.sql')):
            sql(path.read_text())
        print(f'0033a–0033f: aplicação {repeat+1} OK')
    sql('''DO $$ BEGIN
      BEGIN
        ALTER TABLE public.mailer_queue DROP COLUMN max_attempts;
        PERFORM public.mailer_require_0033();
        RAISE EXCEPTION 'PRECHECK_SHOULD_HAVE_FAILED';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%mailer_queue.max_attempts%' THEN RAISE; END IF;
      END;
    END $$;''')
    print('Pré-checagem negativa: coluna faltante explicitamente identificada OK')
    sql((ROOT/'scripts/mailer-tests/assertions.sql').read_text())
    print('SQL real: 429 x5, ambíguos x8, janela 23h, pausa/retomada/cancelamento, órfãos, bounce/override/teto, 5000 cron, health OK')
    cid = str(uuid.uuid4())
    sql(f"""INSERT INTO public.mailer_campaigns(id,mode,subject,status,eligible_count) VALUES('{cid}','catalog','Concurrent fixture','running',100);
      INSERT INTO public.mailer_queue(campaign_id,recipient_email,email_normalized,recipient_name,email_type,subject,idempotency_key)
      SELECT '{cid}','c'||i||'@uni.edu','c'||i||'@uni.edu','Coach','catalog_general','Fixture','{cid}'||i FROM generate_series(1,100)i;""")
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda controller: json.loads(sql(f"SELECT public.claim_mailer_batch('{cid}','{controller}');")), ['cron', 'browser']))
    assert sum(r['claimed'] for r in results) == 1
    assert any(r.get('reason') == 'LEASE_HELD_BY_OTHER' for r in results)
    assert sql(f"SELECT count(*) FROM public.mailer_batches WHERE campaign_id='{cid}';") == '1'
    print('Concorrência em duas sessões PostgreSQL (cron+navegador): um lote, um executor OK')
    sql((ROOT/'db/migrations/verify-0033.sql').read_text())
    print('verify-0033.sql: executado com sucesso; nenhuma escrita OK')
finally:
    subprocess.run(DOCKER + ['rm', '-f', NAME], capture_output=True)

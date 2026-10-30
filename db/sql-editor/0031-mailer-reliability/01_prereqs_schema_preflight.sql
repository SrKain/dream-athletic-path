-- 0031 / PARTE 01 DE 03 — pré-requisitos, tabelas, reconciliação e preflight.
-- USO MANUAL no SQL Editor. Execute apenas após verify-0031-prereqs.sql.
-- Origem: db/migrations/0031_mailer_reliability.sql @ dde0902eb3f452fe67bdd1cbfb450af57db093b4
BEGIN;

-- ============================================================================
-- MIGRATION 0031: RECRUIT MAILER RELIABILITY OVERHAUL (V2)
-- ============================================================================
-- Objetivo:
--   1. Pré-checagem determinística de todas as tabelas, colunas e funções das
--      migrations 0001–0030 antes de qualquer DDL (abortando com lista clara
--      se faltar algum pré-requisito). Nunca referencia `profiles.role`; usa
--      exclusivamente `public.is_agency_admin()`.
--   2. Criar `public.mailer_batches` com chave de idempotência imutável
--      `mc:{campaign_id}:b{seq}` e estados fechados.
--   3. Criar `public.mailer_campaign_exclusions` para persistir descartes da
--      pré-checagem (duplicados, inválidos, suprimidos, conflito de fit).
--   4. Evoluir `public.mailer_campaigns` e `public.mailer_queue` para estados
--      fechados (`pending`, `claimed`, `accepted`, `failed_retryable`,
--      `failed_permanent`, `unconfirmed`, `cancelled`), mantendo compatibilidade
--      com `MAILER_ENGINE=legacy` e reconciliando dados legados sem inventar IDs.
--   5. Criar RPCs atômicos e idempotentes:
--      - `public.mailer_preflight`
--      - `public.create_mailer_campaign`
--      - `public.activate_mailer_campaign`
--      - `public.claim_mailer_batch`
--      - `public.finalize_mailer_batch`
--      - `public.mailer_campaign_progress`
--      - `public.mailer_requeue_failed_retryable`
--   6. Endurecer permissões seguindo o padrão da migration 0026 (`SECURITY DEFINER`,
--      `SET search_path = public`, `REVOKE ALL FROM PUBLIC, anon, authenticated`,
--      `GRANT EXECUTE TO service_role`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. BLOCO DE PRÉ-CHECAGEM OBRIGATÓRIO (ABORTA COM LISTA CLARA SE FALTAR ALGO)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_tbl text;
  v_col record;
  v_fn text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'profiles',
    'user_roles',
    'athletes',
    'universities',
    'coaches',
    'email_suppressions',
    'coach_interest_signals',
    'recruit_email_logs',
    'email_events',
    'mailer_campaigns',
    'mailer_queue',
    'mailer_campaign_snapshots',
    'mailer_domain_checks'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = v_tbl
    ) THEN
      v_missing := array_append(v_missing, 'table:public.' || v_tbl);
    END IF;
  END LOOP;

  FOR v_col IN
    SELECT * FROM (VALUES
      ('mailer_campaigns', 'id'),
      ('mailer_campaigns', 'status'),
      ('mailer_campaigns', 'mode'),
      ('mailer_campaigns', 'subject'),
      ('mailer_campaigns', 'athlete_ids'),
      ('mailer_campaigns', 'recipients_count'),
      ('mailer_campaigns', 'total_recipients'),
      ('mailer_campaigns', 'sent_count'),
      ('mailer_campaigns', 'failed_count'),
      ('mailer_campaigns', 'suppressed_count'),
      ('mailer_campaigns', 'current_batch'),
      ('mailer_campaigns', 'total_batches'),
      ('mailer_campaigns', 'batch_size'),
      ('mailer_campaigns', 'controller_id'),
      ('mailer_campaigns', 'controller_lease_expires_at'),
      ('mailer_campaigns', 'next_batch_at'),
      ('mailer_queue', 'id'),
      ('mailer_queue', 'campaign_id'),
      ('mailer_queue', 'coach_id'),
      ('mailer_queue', 'recipient_email'),
      ('mailer_queue', 'recipient_name'),
      ('mailer_queue', 'university_name'),
      ('mailer_queue', 'email_type'),
      ('mailer_queue', 'subject'),
      ('mailer_queue', 'payload'),
      ('mailer_queue', 'idempotency_key'),
      ('mailer_queue', 'status'),
      ('mailer_queue', 'batch_number'),
      ('mailer_queue', 'attempts'),
      ('mailer_queue', 'max_attempts'),
      ('mailer_queue', 'reserved_by'),
      ('mailer_queue', 'reserved_at'),
      ('mailer_queue', 'reservation_expires_at'),
      ('mailer_queue', 'next_retry_at'),
      ('mailer_queue', 'provider_message_id'),
      ('mailer_queue', 'last_error'),
      ('mailer_queue', 'error_code'),
      ('mailer_queue', 'processed_at'),
      ('recruit_email_logs', 'id'),
      ('recruit_email_logs', 'athlete_id'),
      ('recruit_email_logs', 'coach_id'),
      ('recruit_email_logs', 'subject'),
      ('recruit_email_logs', 'status'),
      ('recruit_email_logs', 'sent_at'),
      ('recruit_email_logs', 'email_type'),
      ('recruit_email_logs', 'recipient_email'),
      ('recruit_email_logs', 'recipient_name'),
      ('recruit_email_logs', 'university_name'),
      ('recruit_email_logs', 'provider_id'),
      ('recruit_email_logs', 'campaign_id'),
      ('recruit_email_logs', 'athlete_ids'),
      ('email_events', 'id'),
      ('email_events', 'provider_email_id'),
      ('email_events', 'event_type'),
      ('email_events', 'recipient_email'),
      ('email_events', 'campaign_id'),
      ('email_events', 'occurred_at'),
      ('email_events', 'svix_id'),
      ('mailer_campaign_snapshots', 'campaign_id'),
      ('mailer_campaign_snapshots', 'schema_version'),
      ('mailer_campaign_snapshots', 'snapshot')
    ) AS t(tbl_name, col_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_col.tbl_name
        AND column_name = v_col.col_name
    ) THEN
      v_missing := array_append(v_missing, 'column:public.' || v_col.tbl_name || '.' || v_col.col_name);
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'is_agency_admin',
    'filter_suppressed_emails',
    'mailer_campaign_bounce_stats'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = v_fn
    ) THEN
      v_missing := array_append(v_missing, 'function:public.' || v_fn);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'PRECHECK_0031_FAILED: Pré-requisitos ausentes antes da migration 0031: %',
      array_to_string(v_missing, ', ');
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. TABELA `public.mailer_batches`
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mailer_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.mailer_campaigns(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'claimed',
  attempts integer NOT NULL DEFAULT 0,
  provider_http_status integer,
  provider_response jsonb,
  last_error text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mailer_batches_status_check CHECK (
    status IN ('claimed', 'submitting', 'accepted', 'partial', 'failed', 'ambiguous')
  ),
  CONSTRAINT mailer_batches_campaign_seq_uniq UNIQUE (campaign_id, seq),
  CONSTRAINT mailer_batches_idempotency_key_uniq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_mailer_batches_campaign_status
  ON public.mailer_batches (campaign_id, status, seq);

ALTER TABLE public.mailer_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mailer_batches_admin_all" ON public.mailer_batches;
CREATE POLICY "mailer_batches_admin_all"
  ON public.mailer_batches
  FOR ALL
  TO authenticated
  USING (public.is_agency_admin())
  WITH CHECK (public.is_agency_admin());

-- ----------------------------------------------------------------------------
-- 2. TABELA `public.mailer_campaign_exclusions`
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mailer_campaign_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.mailer_campaigns(id) ON DELETE CASCADE,
  coach_id uuid,
  email text NOT NULL,
  email_normalized text NOT NULL,
  coach_name text,
  university_name text,
  reason text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mailer_campaign_exclusions_reason_check CHECK (
    reason IN ('duplicate', 'invalid', 'suppressed', 'blocked_fit', 'other')
  )
);

CREATE INDEX IF NOT EXISTS idx_mailer_campaign_exclusions_campaign_reason
  ON public.mailer_campaign_exclusions (campaign_id, reason);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailer_campaign_exclusions_campaign_email_reason
  ON public.mailer_campaign_exclusions (campaign_id, email_normalized, reason);

ALTER TABLE public.mailer_campaign_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mailer_campaign_exclusions_admin_all" ON public.mailer_campaign_exclusions;
CREATE POLICY "mailer_campaign_exclusions_admin_all"
  ON public.mailer_campaign_exclusions
  FOR ALL
  TO authenticated
  USING (public.is_agency_admin())
  WITH CHECK (public.is_agency_admin());

-- ----------------------------------------------------------------------------
-- 3. EVOLUÇÃO DE `public.mailer_campaigns`
-- ----------------------------------------------------------------------------
ALTER TABLE public.mailer_campaigns
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS selected_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eligible_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manifest_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manifest_fingerprint text,
  ADD COLUMN IF NOT EXISTS accepted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_permanent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_retryable_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unconfirmed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exclusions_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS safety_pause_reason text,
  ADD COLUMN IF NOT EXISTS engine_version text NOT NULL DEFAULT 'v2';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailer_campaigns_idempotency_key_uniq
  ON public.mailer_campaigns (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. EVOLUÇÃO DE `public.mailer_queue`, MIGRAÇÃO DE ESTADOS E RECONCILIAÇÃO LEGADA
-- ----------------------------------------------------------------------------
ALTER TABLE public.mailer_queue
  ADD COLUMN IF NOT EXISTS email_normalized text,
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.mailer_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_seq integer,
  ADD COLUMN IF NOT EXISTS failure_category text;

-- Preencher email_normalized para todas as linhas existentes
UPDATE public.mailer_queue
SET email_normalized = lower(trim(recipient_email))
WHERE email_normalized IS NULL
   OR email_normalized <> lower(trim(recipient_email));

ALTER TABLE public.mailer_queue
  ALTER COLUMN email_normalized SET NOT NULL;

-- Atualizar CHECK constraint de status para suportar estados fechados V2 e rollback legacy
ALTER TABLE public.mailer_queue
  DROP CONSTRAINT IF EXISTS mailer_queue_status_check;

ALTER TABLE public.mailer_queue
  ADD CONSTRAINT mailer_queue_status_check CHECK (
    status IN (
      -- Estados fechados V2
      'pending',
      'claimed',
      'accepted',
      'failed_retryable',
      'failed_permanent',
      'unconfirmed',
      'cancelled',
      -- Estados legados preservados para compatibilidade caso MAILER_ENGINE=legacy
      'processing',
      'retry',
      'sent',
      'failed',
      'suppressed'
    )
  );

-- 4.1 Reconciliação explícita do legado (Seção 5 do plano aprovado):
-- a) Os 100 itens `sent` sem `provider_message_id` da campanha `2725beda…` (e qualquer
--    outro item legado marcado como `sent` sem `provider_message_id`) passam para
--    `unconfirmed` com observação "legado", sem inventar dado retroativo.
UPDATE public.mailer_queue
SET status = 'unconfirmed',
    error_code = COALESCE(NULLIF(trim(error_code), ''), 'LEGACY_UNCONFIRMED'),
    failure_category = COALESCE(failure_category, 'legacy_unconfirmed'),
    last_error = COALESCE(
      NULLIF(trim(last_error), ''),
      'legado: item registrado como sent sem provider_message_id confirmado'
    )
WHERE status = 'sent'
  AND (provider_message_id IS NULL OR trim(provider_message_id) = '');

-- b) Itens legados `sent` COM `provider_message_id` confirmado migram com segurança
--    para `accepted`.
UPDATE public.mailer_queue
SET status = 'accepted'
WHERE status = 'sent'
  AND provider_message_id IS NOT NULL
  AND trim(provider_message_id) <> '';

-- c) Itens legados `failed` migram para `failed_permanent` e `retry` para `failed_retryable`.
UPDATE public.mailer_queue
SET status = 'failed_permanent',
    failure_category = COALESCE(failure_category, 'legacy_failed')
WHERE status = 'failed';

UPDATE public.mailer_queue
SET status = 'failed_retryable',
    failure_category = COALESCE(failure_category, 'legacy_retry')
WHERE status = 'retry';

-- d) O rascunho órfão `8a56bef1…` (399 destinatários em `draft`) é encerrado como
--    `cancelled` com motivo explícito.
UPDATE public.mailer_campaigns
SET status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, now()),
    last_error = COALESCE(
      NULLIF(trim(last_error), ''),
      'legado: rascunho 8a56bef1 encerrado como cancelled na reconciliação 0031'
    )
WHERE id::text LIKE '8a56bef1%'
  AND status IN ('draft', 'preparing');

UPDATE public.mailer_queue
SET status = 'cancelled',
    error_code = COALESCE(error_code, 'LEGACY_DRAFT_CANCELLED'),
    last_error = COALESCE(
      last_error,
      'legado: rascunho 8a56bef1 encerrado como cancelled na reconciliação 0031'
    ),
    processed_at = COALESCE(processed_at, now())
WHERE campaign_id::text LIKE '8a56bef1%'
  AND status IN ('pending', 'processing', 'claimed');

-- e) Garantir ausência de duplicatas residuais (campaign_id, email_normalized) antes do índice único
DELETE FROM public.mailer_queue mq
USING public.mailer_queue keep_row
WHERE mq.campaign_id = keep_row.campaign_id
  AND mq.email_normalized = keep_row.email_normalized
  AND mq.id <> keep_row.id
  AND (
    (keep_row.status = 'accepted' AND mq.status <> 'accepted')
    OR (
      (keep_row.status = 'accepted') = (mq.status = 'accepted')
      AND (keep_row.created_at < mq.created_at OR (keep_row.created_at = mq.created_at AND keep_row.id < mq.id))
    )
  );

-- f) Sincronizar contadores de `mailer_campaigns` com os estados reais da fila
With queue_rollups AS (
  SELECT
    q.campaign_id,
    count(*)::integer AS total_rows,
    count(*) FILTER (WHERE q.status IN ('accepted', 'sent'))::integer AS accepted_rows,
    count(*) FILTER (WHERE q.status IN ('failed_permanent', 'failed'))::integer AS failed_perm_rows,
    count(*) FILTER (WHERE q.status IN ('failed_retryable', 'retry'))::integer AS failed_retry_rows,
    count(*) FILTER (WHERE q.status = 'unconfirmed')::integer AS unconfirmed_rows,
    count(*) FILTER (WHERE q.status = 'cancelled')::integer AS cancelled_rows
  FROM public.mailer_queue q
  GROUP BY q.campaign_id
)
UPDATE public.mailer_campaigns mc
SET eligible_count = CASE WHEN mc.eligible_count > 0 THEN mc.eligible_count ELSE qr.total_rows END,
    selected_count = CASE WHEN mc.selected_count > 0 THEN mc.selected_count ELSE GREATEST(mc.recipients_count, qr.total_rows) END,
    manifest_count = CASE WHEN mc.manifest_count > 0 THEN mc.manifest_count ELSE qr.total_rows END,
    accepted_count = qr.accepted_rows,
    sent_count = qr.accepted_rows,
    failed_permanent_count = qr.failed_perm_rows,
    failed_retryable_count = qr.failed_retry_rows,
    failed_count = qr.failed_perm_rows + qr.failed_retry_rows,
    unconfirmed_count = qr.unconfirmed_rows,
    cancelled_count = qr.cancelled_rows
FROM queue_rollups qr
WHERE mc.id = qr.campaign_id;

-- 4.2 Índices obrigatórios em `public.mailer_queue`
CREATE INDEX IF NOT EXISTS idx_mailer_queue_campaign_status
  ON public.mailer_queue (campaign_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailer_queue_campaign_email_norm_uniq
  ON public.mailer_queue (campaign_id, email_normalized);

CREATE INDEX IF NOT EXISTS idx_mailer_queue_provider_message_id
  ON public.mailer_queue (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Trigger leve para manter `email_normalized` sempre populado em qualquer INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.mailer_queue_normalize_email_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email_normalized := lower(trim(COALESCE(NEW.recipient_email, '')));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mailer_queue_normalize_email ON public.mailer_queue;
CREATE TRIGGER trg_mailer_queue_normalize_email
  BEFORE INSERT OR UPDATE OF recipient_email, email_normalized
  ON public.mailer_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.mailer_queue_normalize_email_trg();

-- ----------------------------------------------------------------------------
-- 5. RPC `public.mailer_preflight`
-- ----------------------------------------------------------------------------
-- Recebe JSONB de destinatários selecionados, normaliza e classifica cada item
-- com 1 motivo primário mutuamente exclusivo:
--   `eligible` | `duplicate` | `invalid` | `suppressed` | `blocked_fit` | `other`
-- Garante invariante:
--   selecionados = elegíveis + duplicados + inválidos + suprimidos + outros
-- Verifica cota mensal do ciclo atual e retorna fingerprint do manifesto elegível.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mailer_preflight(
  p_recipients jsonb,
  p_mode text DEFAULT 'single_athlete',
  p_athlete_ids uuid[] DEFAULT '{}'::uuid[],
  p_monthly_quota integer DEFAULT 20000,
  p_cycle_start_day integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_cycle_day integer := LEAST(GREATEST(COALESCE(p_cycle_start_day, 1), 1), 28);
  v_quota integer := GREATEST(COALESCE(p_monthly_quota, 20000), 1);
  v_cycle_start timestamptz;
  v_used_month integer := 0;
  v_selected_count integer := 0;
  v_eligible_count integer := 0;
  v_duplicate_count integer := 0;
  v_invalid_count integer := 0;
  v_suppressed_count integer := 0;
  v_blocked_fit_count integer := 0;
  v_other_count integer := 0;
  v_fingerprint text := '';
  v_eligible_items jsonb := '[]'::jsonb;
  v_excluded_items jsonb := '[]'::jsonb;
  v_remaining_before integer;
  v_remaining_after integer;
  v_usage_percent numeric(6,2);
  v_quota_warning boolean := false;
  v_quota_blocked boolean := false;
BEGIN
  -- Calcular início do ciclo mensal
  IF EXTRACT(DAY FROM v_now)::integer >= v_cycle_day THEN
    v_cycle_start := date_trunc('month', v_now) + make_interval(days => v_cycle_day - 1);
  ELSE
    v_cycle_start := (date_trunc('month', v_now) - interval '1 month') + make_interval(days => v_cycle_day - 1);
  END IF;

  -- Contabilizar envios já aceitos no ciclo atual (via recruit_email_logs)
  SELECT COUNT(*)::integer
  INTO v_used_month
  FROM public.recruit_email_logs rel
  WHERE rel.status = 'sent'
    AND rel.sent_at >= v_cycle_start;

  IF p_recipients IS NULL OR jsonb_typeof(p_recipients) <> 'array' THEN
    p_recipients := '[]'::jsonb;
  END IF;

  -- Classificação determinística com motivo primário mutuamente exclusivo
  WITH raw_items AS (
    SELECT
      ord::integer AS idx,
      COALESCE(elem->>'coachId', elem->>'coach_id') AS coach_id_text,
      COALESCE(elem->>'name', elem->>'recipientName', elem->>'coachName', 'Coach') AS coach_name,
      COALESCE(elem->>'lastName', elem->>'last_name', '') AS last_name,
      COALESCE(elem->>'universityName', elem->>'university_name', '') AS university_name,
      COALESCE(elem->>'email', elem->>'recipientEmail', '') AS raw_email,
      lower(trim(COALESCE(elem->>'email', elem->>'recipientEmail', ''))) AS email_norm,
      COALESCE((elem->>'blockedFit')::boolean, (elem->>'blocked_fit')::boolean, false) AS blocked_fit_flag,
      NULLIF(trim(COALESCE(elem->>'excludedReason', elem->>'excluded_reason', '')), '') AS custom_exclusion_reason
    FROM jsonb_array_elements(p_recipients) WITH ORDINALITY AS t(elem, ord)
  ),
  syntax_checked AS (
    SELECT
      ri.*,
      (
        ri.email_norm <> ''
        AND length(ri.email_norm) <= 254
        AND position(' ' in ri.email_norm) = 0
        AND position('..' in ri.email_norm) = 0
        AND ri.email_norm ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
        AND length(split_part(ri.email_norm, '@', 1)) BETWEEN 1 AND 64
      ) AS is_valid_syntax
    FROM raw_items ri
  ),
  dedup_ranked AS (
    SELECT
      sc.*,
      CASE
        WHEN sc.is_valid_syntax THEN
          ROW_NUMBER() OVER (
            PARTITION BY sc.email_norm
            ORDER BY sc.idx ASC
          )
        ELSE 1
      END AS occurrence_rank
    FROM syntax_checked sc
  ),
  suppression_checked AS (
    SELECT
      dr.*,
      EXISTS (
        SELECT 1
        FROM public.email_suppressions es
        WHERE lower(trim(es.email)) = dr.email_norm
          AND (es.expires_at IS NULL OR es.expires_at > v_now)
      ) AS is_suppressed,
      (
        SELECT es.reason
        FROM public.email_suppressions es
        WHERE lower(trim(es.email)) = dr.email_norm
          AND (es.expires_at IS NULL OR es.expires_at > v_now)
        ORDER BY es.created_at DESC NULLS LAST
        LIMIT 1
      ) AS suppression_reason
    FROM dedup_ranked dr
  ),
  classified AS (
    SELECT
      sc.idx,
      sc.coach_id_text,
      sc.coach_name,
      sc.last_name,
      sc.university_name,
      sc.raw_email,
      sc.email_norm,
      CASE
        WHEN NOT sc.is_valid_syntax THEN 'invalid'
        WHEN sc.occurrence_rank > 1 THEN 'duplicate'
        WHEN sc.is_suppressed THEN 'suppressed'
        WHEN sc.blocked_fit_flag THEN 'blocked_fit'
        WHEN sc.custom_exclusion_reason IS NOT NULL THEN 'other'
        ELSE 'eligible'
      END AS classification,
      CASE
        WHEN NOT sc.is_valid_syntax THEN 'Sintaxe de e-mail inválida (RFC 5322)'
        WHEN sc.occurrence_rank > 1 THEN 'E-mail duplicado na seleção (mantida apenas a 1ª ocorrência)'
        WHEN sc.is_suppressed THEN 'Contato suprimido (' || COALESCE(sc.suppression_reason, 'opt-out/bounce') || ')'
        WHEN sc.blocked_fit_flag THEN 'Conflito de interesse sinalizado pelo coach'
        WHEN sc.custom_exclusion_reason IS NOT NULL THEN sc.custom_exclusion_reason
        ELSE NULL
      END AS details
    FROM suppression_checked sc
  )
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE classification = 'eligible')::integer,
    COUNT(*) FILTER (WHERE classification = 'duplicate')::integer,
    COUNT(*) FILTER (WHERE classification = 'invalid')::integer,
    COUNT(*) FILTER (WHERE classification = 'suppressed')::integer,
    COUNT(*) FILTER (WHERE classification = 'blocked_fit')::integer,
    COUNT(*) FILTER (WHERE classification = 'other')::integer,
    COALESCE(
      md5(string_agg(email_norm, ',' ORDER BY email_norm) FILTER (WHERE classification = 'eligible')),
      md5('')
    ),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'coachId', coach_id_text,
          'name', coach_name,
          'lastName', last_name,
          'universityName', university_name,
          'email', raw_email,
          'emailNormalized', email_norm
        )
        ORDER BY idx ASC
      ) FILTER (WHERE classification = 'eligible'),
      '[]'::jsonb
    ),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'coachId', coach_id_text,
          'name', coach_name,
          'universityName', university_name,
          'email', raw_email,
          'emailNormalized', email_norm,
          'reason', classification,
          'details', details
        )
        ORDER BY idx ASC
      ) FILTER (WHERE classification <> 'eligible'),
      '[]'::jsonb
    )
  INTO
    v_selected_count,
    v_eligible_count,
    v_duplicate_count,
    v_invalid_count,
    v_suppressed_count,
    v_blocked_fit_count,
    v_other_count,
    v_fingerprint,
    v_eligible_items,
    v_excluded_items
  FROM classified;

  v_remaining_before := GREATEST(0, v_quota - v_used_month);
  v_remaining_after := GREATEST(0, v_quota - (v_used_month + v_eligible_count));
  v_usage_percent := ROUND(((v_used_month + v_eligible_count)::numeric / v_quota::numeric) * 100.0, 2);
  v_quota_blocked := (v_used_month + v_eligible_count) > v_quota;
  v_quota_warning := ((v_used_month + v_eligible_count)::numeric >= (v_quota::numeric * 0.80));

  RETURN jsonb_build_object(
    'selectedCount', v_selected_count,
    'eligibleCount', v_eligible_count,
    'duplicateCount', v_duplicate_count,
    'invalidCount', v_invalid_count,
    'suppressedCount', v_suppressed_count,
    'blockedFitCount', v_blocked_fit_count,
    'otherExcludedCount', v_other_count,
    'excludedTotalCount', (v_duplicate_count + v_invalid_count + v_suppressed_count + v_blocked_fit_count + v_other_count),
    'invariantValid', (
      v_selected_count = (
        v_eligible_count + v_duplicate_count + v_invalid_count + v_suppressed_count + v_blocked_fit_count + v_other_count
      )
    ),
    'manifestFingerprint', v_fingerprint,
    'quota', jsonb_build_object(
      'monthlyQuota', v_quota,
      'cycleStartDay', v_cycle_day,
      'cycleStartsAt', v_cycle_start,
      'usedThisMonth', v_used_month,
      'remainingBeforeSend', v_remaining_before,
      'remainingAfterSend', v_remaining_after,
      'projectedUsagePercent', v_usage_percent,
      'warning80Percent', v_quota_warning,
      'blocked', v_quota_blocked
    ),
    'eligibleRecipients', v_eligible_items,
    'excludedRecipients', v_excluded_items
  );
END;
$$;


-- ACL antecipada: não deixar RPC SECURITY DEFINER acessível entre as etapas.
REVOKE ALL ON FUNCTION public.mailer_preflight(jsonb, text, uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_preflight(jsonb, text, uuid[], integer, integer) TO service_role;

COMMIT;

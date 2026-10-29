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

-- ----------------------------------------------------------------------------
-- 6. RPC `public.create_mailer_campaign`
-- ----------------------------------------------------------------------------
-- Cria ou reutiliza uma campanha de forma idempotente via `p_idempotency_key`.
-- Nunca ativa a campanha até que `activate_mailer_campaign` valide a fila.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_mailer_campaign(
  p_idempotency_key text,
  p_created_by uuid,
  p_mode text,
  p_subject text,
  p_athlete_ids uuid[],
  p_selected_count integer,
  p_eligible_count integer,
  p_suppressed_count integer,
  p_manifest_fingerprint text,
  p_exclusions_summary jsonb DEFAULT '{}'::jsonb,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_campaign_id uuid;
  v_enqueued_count integer := 0;
  v_total_batches integer := GREATEST(1, CEIL(GREATEST(COALESCE(p_eligible_count, 0), 1)::numeric / GREATEST(COALESCE(p_batch_size, 100), 1)::numeric)::integer);
BEGIN
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    SELECT
      mc.id,
      mc.status,
      mc.manifest_count,
      mc.manifest_fingerprint
    INTO v_existing
    FROM public.mailer_campaigns mc
    WHERE mc.idempotency_key = trim(p_idempotency_key)
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      SELECT COUNT(*)::integer
      INTO v_enqueued_count
      FROM public.mailer_queue mq
      WHERE mq.campaign_id = v_existing.id;

      RETURN jsonb_build_object(
        'campaignId', v_existing.id,
        'status', v_existing.status,
        'reused', true,
        'enqueuedCount', v_enqueued_count,
        'manifestCount', v_existing.manifest_count,
        'manifestFingerprint', v_existing.manifest_fingerprint
      );
    END IF;
  END IF;

  INSERT INTO public.mailer_campaigns (
    idempotency_key,
    created_by,
    mode,
    subject,
    athlete_ids,
    recipients_count,
    selected_count,
    eligible_count,
    manifest_count,
    manifest_fingerprint,
    total_recipients,
    sent_count,
    accepted_count,
    failed_count,
    failed_permanent_count,
    failed_retryable_count,
    unconfirmed_count,
    cancelled_count,
    suppressed_count,
    exclusions_summary,
    filters,
    status,
    current_batch,
    total_batches,
    batch_size,
    delay_between_batches_sec,
    delay_between_items_ms,
    engine_version
  ) VALUES (
    NULLIF(trim(COALESCE(p_idempotency_key, '')), ''),
    p_created_by,
    p_mode,
    p_subject,
    COALESCE(p_athlete_ids, '{}'::uuid[]),
    COALESCE(p_selected_count, 0),
    COALESCE(p_selected_count, 0),
    COALESCE(p_eligible_count, 0),
    COALESCE(p_eligible_count, 0),
    p_manifest_fingerprint,
    COALESCE(p_eligible_count, 0),
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    COALESCE(p_suppressed_count, 0),
    COALESCE(p_exclusions_summary, '{}'::jsonb),
    COALESCE(p_filters, '{}'::jsonb),
    'preparing',
    0,
    v_total_batches,
    LEAST(GREATEST(COALESCE(p_batch_size, 100), 1), 100),
    2,
    0,
    'v2'
  )
  RETURNING id INTO v_campaign_id;

  RETURN jsonb_build_object(
    'campaignId', v_campaign_id,
    'status', 'preparing',
    'reused', false,
    'enqueuedCount', 0,
    'manifestCount', COALESCE(p_eligible_count, 0),
    'manifestFingerprint', p_manifest_fingerprint
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC `public.activate_mailer_campaign`
-- ----------------------------------------------------------------------------
-- Só transiciona a campanha de `preparing`/`draft` para `running` se:
--   1. Contagem real de itens na `mailer_queue` == `p_expected_count` (> 0)
--   2. Fingerprint MD5 dos `email_normalized` na fila == `p_expected_fingerprint`
--   3. Snapshot persistido em `mailer_campaign_snapshots` (salvo dry_run)
-- Caso contrário, NUNCA ativa uma fila parcial.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_mailer_campaign(
  p_campaign_id uuid,
  p_expected_count integer,
  p_expected_fingerprint text DEFAULT NULL,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign record;
  v_actual_count integer := 0;
  v_actual_fingerprint text := '';
  v_has_snapshot boolean := false;
  v_total_batches integer;
BEGIN
  SELECT *
  INTO v_campaign
  FROM public.mailer_campaigns mc
  WHERE mc.id = p_campaign_id
  FOR UPDATE;

  IF v_campaign.id IS NULL THEN
    RETURN jsonb_build_object(
      'activated', false,
      'reason', 'CAMPAIGN_NOT_FOUND',
      'message', 'Campanha não encontrada.'
    );
  END IF;

  -- Se já estiver running ou completed, retorna idempotente
  IF v_campaign.status IN ('running', 'completed') THEN
    RETURN jsonb_build_object(
      'activated', true,
      'alreadyActive', true,
      'status', v_campaign.status,
      'enqueuedCount', v_campaign.eligible_count
    );
  END IF;

  SELECT
    COUNT(*)::integer,
    COALESCE(md5(string_agg(mq.email_normalized, ',' ORDER BY mq.email_normalized)), md5(''))
  INTO v_actual_count, v_actual_fingerprint
  FROM public.mailer_queue mq
  WHERE mq.campaign_id = p_campaign_id;

  IF v_actual_count <= 0 OR v_actual_count <> COALESCE(p_expected_count, -1) THEN
    RETURN jsonb_build_object(
      'activated', false,
      'reason', 'MANIFEST_COUNT_MISMATCH',
      'expectedCount', p_expected_count,
      'actualCount', v_actual_count,
      'message', format(
        'Ativação bloqueada: a fila possui %s itens, mas o manifesto exige %s.',
        v_actual_count,
        COALESCE(p_expected_count, 0)
      )
    );
  END IF;

  IF p_expected_fingerprint IS NOT NULL
     AND trim(p_expected_fingerprint) <> ''
     AND v_actual_fingerprint <> trim(p_expected_fingerprint) THEN
    RETURN jsonb_build_object(
      'activated', false,
      'reason', 'MANIFEST_FINGERPRINT_MISMATCH',
      'expectedFingerprint', p_expected_fingerprint,
      'actualFingerprint', v_actual_fingerprint,
      'message', 'Ativação bloqueada: o fingerprint de destinatários da fila diverge do manifesto aprovado.'
    );
  END IF;

  IF NOT COALESCE(p_dry_run, false) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.mailer_campaign_snapshots mcs
      WHERE mcs.campaign_id = p_campaign_id
    )
    INTO v_has_snapshot;

    IF NOT v_has_snapshot THEN
      RETURN jsonb_build_object(
        'activated', false,
        'reason', 'SNAPSHOT_MISSING',
        'message', 'Ativação bloqueada: snapshot de conteúdo da campanha não foi encontrado.'
      );
    END IF;
  END IF;

  v_total_batches := GREATEST(1, CEIL(v_actual_count::numeric / GREATEST(COALESCE(v_campaign.batch_size, 100), 1)::numeric)::integer);

  UPDATE public.mailer_campaigns
  SET status = 'running',
      eligible_count = v_actual_count,
      manifest_count = v_actual_count,
      manifest_fingerprint = COALESCE(NULLIF(trim(p_expected_fingerprint), ''), v_actual_fingerprint),
      total_recipients = v_actual_count,
      total_batches = v_total_batches,
      started_at = COALESCE(started_at, now()),
      next_batch_at = now(),
      last_error = NULL,
      safety_pause_reason = NULL
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'activated', true,
    'status', 'running',
    'enqueuedCount', v_actual_count,
    'totalBatches', v_total_batches,
    'manifestFingerprint', v_actual_fingerprint
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC `public.claim_mailer_batch`
-- ----------------------------------------------------------------------------
-- Reserva de forma atômica até 100 itens com `FOR UPDATE SKIP LOCKED`, renova o
-- lease de 90s da campanha e cria (ou retoma em caso de `ambiguous`/`claimed`
-- dentro de 24h) um lote em `public.mailer_batches` com chave imutável:
--   `mc:{campaign_id}:b{seq}`
-- Se um lote `ambiguous` tiver mais de 24h, reconcilia com `email_events` /
-- `recruit_email_logs` e marca o restante como `unconfirmed` sem reenviar às cegas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_mailer_batch(
  p_campaign_id uuid,
  p_controller_id text,
  p_batch_size integer DEFAULT 100,
  p_lease_seconds integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_campaign record;
  v_existing_batch record;
  v_batch_id uuid;
  v_seq integer;
  v_idempotency_key text;
  v_item_ids uuid[];
  v_items jsonb := '[]'::jsonb;
  v_pending_remaining integer := 0;
  v_effective_size integer := LEAST(GREATEST(COALESCE(p_batch_size, 100), 1), 100);
  v_lease_secs integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 90), 15), 300);
BEGIN
  SELECT *
  INTO v_campaign
  FROM public.mailer_campaigns mc
  WHERE mc.id = p_campaign_id
  FOR UPDATE;

  IF v_campaign.id IS NULL THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'CAMPAIGN_NOT_FOUND',
      'campaignStatus', 'failed'
    );
  END IF;

  IF v_campaign.status <> 'running' THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'CAMPAIGN_NOT_RUNNING',
      'campaignStatus', v_campaign.status,
      'safetyPauseReason', v_campaign.safety_pause_reason
    );
  END IF;

  -- Verificar contenção de lease entre controladores distintos
  IF v_campaign.controller_id IS NOT NULL
     AND v_campaign.controller_id <> p_controller_id
     AND v_campaign.controller_lease_expires_at IS NOT NULL
     AND v_campaign.controller_lease_expires_at > v_now THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'LEASE_HELD_BY_OTHER',
      'campaignStatus', v_campaign.status,
      'controllerId', v_campaign.controller_id,
      'leaseExpiresAt', v_campaign.controller_lease_expires_at
    );
  END IF;

  -- Respeitar intervalo agendado (ex: 429 retry-after)
  IF v_campaign.next_batch_at IS NOT NULL AND v_campaign.next_batch_at > v_now THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'COOLDOWN_ACTIVE',
      'campaignStatus', v_campaign.status,
      'nextBatchAt', v_campaign.next_batch_at,
      'waitMs', GREATEST(100, CEIL(EXTRACT(EPOCH FROM (v_campaign.next_batch_at - v_now)) * 1000)::integer)
    );
  END IF;

  -- Renovar lease de 90s do controlador atual
  UPDATE public.mailer_campaigns
  SET controller_id = p_controller_id,
      controller_lease_expires_at = v_now + make_interval(secs => v_lease_secs)
  WHERE id = p_campaign_id;

  -- 1) Verificar se existe lote em aberto (`claimed`, `submitting`, `ambiguous`)
  FOR v_existing_batch IN
    SELECT *
    FROM public.mailer_batches mb
    WHERE mb.campaign_id = p_campaign_id
      AND mb.status IN ('claimed', 'submitting', 'ambiguous')
    ORDER BY mb.seq ASC
    FOR UPDATE
  LOOP
    -- Se o lote tem mais de 24h (janela do Idempotency-Key do Resend expirou),
    -- reconciliar via evidência de entrega/log e marcar o restante como `unconfirmed`
    IF v_existing_batch.claimed_at < (v_now - interval '24 hours') THEN
      -- Marcar como accepted quem tiver evidência confirmada em email_events ou recruit_email_logs
      UPDATE public.mailer_queue mq
      SET status = 'accepted',
          provider_message_id = COALESCE(
            mq.provider_message_id,
            (
              SELECT ee.provider_email_id
              FROM public.email_events ee
              WHERE ee.campaign_id = p_campaign_id
                AND lower(trim(ee.recipient_email)) = mq.email_normalized
                AND ee.provider_email_id IS NOT NULL
              ORDER BY ee.occurred_at DESC
              LIMIT 1
            ),
            (
              SELECT rel.provider_id
              FROM public.recruit_email_logs rel
              WHERE rel.campaign_id = p_campaign_id
                AND lower(trim(rel.recipient_email)) = mq.email_normalized
                AND rel.provider_id IS NOT NULL
              ORDER BY rel.sent_at DESC
              LIMIT 1
            )
          ),
          processed_at = COALESCE(mq.processed_at, v_now),
          last_error = NULL,
          error_code = NULL
      WHERE mq.id = ANY(v_existing_batch.item_ids)
        AND mq.status IN ('claimed', 'processing')
        AND (
          mq.provider_message_id IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM public.email_events ee
            WHERE ee.campaign_id = p_campaign_id
              AND lower(trim(ee.recipient_email)) = mq.email_normalized
              AND ee.provider_email_id IS NOT NULL
          )
          OR EXISTS (
            SELECT 1
            FROM public.recruit_email_logs rel
            WHERE rel.campaign_id = p_campaign_id
              AND lower(trim(rel.recipient_email)) = mq.email_normalized
              AND rel.provider_id IS NOT NULL
          )
        );

      -- Os demais itens desse lote > 24h viram `unconfirmed` (nunca reenviar às cegas após 24h)
      UPDATE public.mailer_queue mq
      SET status = 'unconfirmed',
          error_code = 'AMBIGUOUS_EXPIRED_24H',
          failure_category = 'ambiguous_expired_24h',
          last_error = 'Lote ambíguo expirou a janela de 24h de idempotência sem confirmação do provedor; requer decisão humana.',
          processed_at = COALESCE(mq.processed_at, v_now)
      WHERE mq.id = ANY(v_existing_batch.item_ids)
        AND mq.status IN ('claimed', 'processing');

      UPDATE public.mailer_batches
      SET status = 'failed',
          last_error = 'AMBIGUOUS_EXPIRED_24H',
          finished_at = v_now
      WHERE id = v_existing_batch.id;
    ELSE
      -- Dentro da janela de 24h: retomar este MESMO lote com a MESMA chave `mc:{campaign_id}:b{seq}`
      UPDATE public.mailer_batches
      SET status = 'submitting',
          submitted_at = v_now
      WHERE id = v_existing_batch.id;

      UPDATE public.mailer_queue mq
      SET reserved_by = p_controller_id,
          reserved_at = v_now,
          reservation_expires_at = v_now + make_interval(secs => v_lease_secs)
      WHERE mq.id = ANY(v_existing_batch.item_ids)
        AND mq.status IN ('claimed', 'processing');

      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mq.id,
            'campaign_id', mq.campaign_id,
            'coach_id', mq.coach_id,
            'recipient_email', mq.recipient_email,
            'email_normalized', mq.email_normalized,
            'recipient_name', mq.recipient_name,
            'university_name', mq.university_name,
            'email_type', mq.email_type,
            'subject', mq.subject,
            'payload', mq.payload,
            'idempotency_key', mq.idempotency_key,
            'status', mq.status,
            'batch_number', mq.batch_number,
            'attempts', mq.attempts,
            'max_attempts', mq.max_attempts
          )
          ORDER BY array_position(v_existing_batch.item_ids, mq.id)
        ),
        '[]'::jsonb
      )
      INTO v_items
      FROM public.mailer_queue mq
      WHERE mq.id = ANY(v_existing_batch.item_ids);

      RETURN jsonb_build_object(
        'claimed', true,
        'reusedBatch', true,
        'batchId', v_existing_batch.id,
        'seq', v_existing_batch.seq,
        'idempotencyKey', v_existing_batch.idempotency_key,
        'attempts', v_existing_batch.attempts,
        'previousStatus', v_existing_batch.status,
        'campaignStatus', 'running',
        'items', v_items
      );
    END IF;
  END LOOP;

  -- 2) Reservar novos itens `pending` com FOR UPDATE SKIP LOCKED
  WITH locked_items AS (
    SELECT mq.id
    FROM public.mailer_queue mq
    WHERE mq.campaign_id = p_campaign_id
      AND mq.status = 'pending'
      AND (mq.next_retry_at IS NULL OR mq.next_retry_at <= v_now)
    ORDER BY mq.batch_number ASC, mq.created_at ASC, mq.id ASC
    LIMIT v_effective_size
    FOR UPDATE SKIP LOCKED
  )
  SELECT array_agg(id)
  INTO v_item_ids
  FROM locked_items;

  IF v_item_ids IS NULL OR array_length(v_item_ids, 1) IS NULL OR array_length(v_item_ids, 1) = 0 THEN
    -- Verificar se ainda resta algum item pendente (ex: aguardando next_retry_at) ou claimed
    SELECT COUNT(*)::integer
    INTO v_pending_remaining
    FROM public.mailer_queue mq
    WHERE mq.campaign_id = p_campaign_id
      AND mq.status IN ('pending', 'claimed', 'processing');

    IF v_pending_remaining = 0 THEN
      -- Todos os itens da campanha têm destino final explicável -> concluir campanha
      With final_rollups AS (
        SELECT
          count(*) FILTER (WHERE status IN ('accepted', 'sent'))::integer AS acc_cnt,
          count(*) FILTER (WHERE status IN ('failed_permanent', 'failed'))::integer AS fp_cnt,
          count(*) FILTER (WHERE status IN ('failed_retryable', 'retry'))::integer AS fr_cnt,
          count(*) FILTER (WHERE status = 'unconfirmed')::integer AS unc_cnt,
          count(*) FILTER (WHERE status = 'cancelled')::integer AS can_cnt
        FROM public.mailer_queue
        WHERE campaign_id = p_campaign_id
      )
      UPDATE public.mailer_campaigns mc
      SET status = 'completed',
          completed_at = COALESCE(mc.completed_at, v_now),
          accepted_count = fr.acc_cnt,
          sent_count = fr.acc_cnt,
          failed_permanent_count = fr.fp_cnt,
          failed_retryable_count = fr.fr_cnt,
          failed_count = fr.fp_cnt + fr.fr_cnt,
          unconfirmed_count = fr.unc_cnt,
          cancelled_count = fr.can_cnt,
          controller_id = NULL,
          controller_lease_expires_at = NULL
      FROM final_rollups fr
      WHERE mc.id = p_campaign_id;

      RETURN jsonb_build_object(
        'claimed', false,
        'reason', 'QUEUE_DRAINED',
        'campaignStatus', 'completed',
        'items', '[]'::jsonb
      );
    END IF;

    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'AWAITING_RETRY_WINDOW',
      'campaignStatus', 'running',
      'items', '[]'::jsonb
    );
  END IF;

  -- Alocar próximo seq para o lote da campanha
  SELECT COALESCE(MAX(mb.seq), 0) + 1
  INTO v_seq
  FROM public.mailer_batches mb
  WHERE mb.campaign_id = p_campaign_id;

  v_idempotency_key := 'mc:' || p_campaign_id::text || ':b' || v_seq::text;

  INSERT INTO public.mailer_batches (
    campaign_id,
    seq,
    item_ids,
    idempotency_key,
    status,
    attempts,
    claimed_at,
    submitted_at
  ) VALUES (
    p_campaign_id,
    v_seq,
    v_item_ids,
    v_idempotency_key,
    'submitting',
    0,
    v_now,
    v_now
  )
  RETURNING id INTO v_batch_id;

  UPDATE public.mailer_queue mq
  SET status = 'claimed',
      batch_id = v_batch_id,
      batch_seq = v_seq,
      reserved_by = p_controller_id,
      reserved_at = v_now,
      reservation_expires_at = v_now + make_interval(secs => v_lease_secs)
  WHERE mq.id = ANY(v_item_ids);

  UPDATE public.mailer_campaigns
  SET current_batch = GREATEST(current_batch, v_seq)
  WHERE id = p_campaign_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', mq.id,
        'campaign_id', mq.campaign_id,
        'coach_id', mq.coach_id,
        'recipient_email', mq.recipient_email,
        'email_normalized', mq.email_normalized,
        'recipient_name', mq.recipient_name,
        'university_name', mq.university_name,
        'email_type', mq.email_type,
        'subject', mq.subject,
        'payload', mq.payload,
        'idempotency_key', mq.idempotency_key,
        'status', mq.status,
        'batch_number', mq.batch_number,
        'attempts', mq.attempts,
        'max_attempts', mq.max_attempts
      )
      ORDER BY array_position(v_item_ids, mq.id)
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.mailer_queue mq
  WHERE mq.id = ANY(v_item_ids);

  RETURN jsonb_build_object(
    'claimed', true,
    'reusedBatch', false,
    'batchId', v_batch_id,
    'seq', v_seq,
    'idempotencyKey', v_idempotency_key,
    'attempts', 0,
    'previousStatus', 'claimed',
    'campaignStatus', 'running',
    'items', v_items
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. RPC `public.finalize_mailer_batch`
-- ----------------------------------------------------------------------------
-- Em UMA ÚNICA TRANSAÇÃO ATÔMICA:
--   - Atualiza os itens de `mailer_queue` conforme o desfecho do lote
--   - Atualiza `mailer_batches`
--   - Insere `recruit_email_logs` sem duplicar por (campaign_id, email)
--   - Atualiza contadores de `mailer_campaigns` e decide transição para
--     `paused` (pausa de segurança) ou `completed` (fila zerada).
-- Regra de ouro: NUNCA permite status = `accepted` sem `provider_message_id`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_mailer_batch(
  p_campaign_id uuid,
  p_batch_id uuid,
  p_controller_id text,
  p_batch_status text,
  p_http_status integer DEFAULT NULL,
  p_provider_response jsonb DEFAULT NULL,
  p_outcomes jsonb DEFAULT '[]'::jsonb,
  p_pause_reason text DEFAULT NULL,
  p_next_tick_ms integer DEFAULT 1500,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_batch record;
  v_campaign record;
  v_outcome record;
  v_queue_row record;
  v_item_status text;
  v_provider_id text;
  v_error_code text;
  v_error_msg text;
  v_failure_cat text;
  v_new_attempts integer;
  v_acc_cnt integer := 0;
  v_fp_cnt integer := 0;
  v_fr_cnt integer := 0;
  v_unc_cnt integer := 0;
  v_can_cnt integer := 0;
  v_pend_cnt integer := 0;
  v_claim_cnt integer := 0;
  v_next_campaign_status text;
  v_primary_athlete_id uuid;
BEGIN
  SELECT *
  INTO v_campaign
  FROM public.mailer_campaigns mc
  WHERE mc.id = p_campaign_id
  FOR UPDATE;

  IF v_campaign.id IS NULL THEN
    RAISE EXCEPTION 'FINALIZE_BATCH_CAMPAIGN_NOT_FOUND: %', p_campaign_id;
  END IF;

  SELECT *
  INTO v_batch
  FROM public.mailer_batches mb
  WHERE mb.id = p_batch_id
    AND mb.campaign_id = p_campaign_id
  FOR UPDATE;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'FINALIZE_BATCH_NOT_FOUND: %', p_batch_id;
  END IF;

  IF v_campaign.athlete_ids IS NOT NULL AND array_length(v_campaign.athlete_ids, 1) > 0 THEN
    v_primary_athlete_id := v_campaign.athlete_ids[1];
  ELSE
    v_primary_athlete_id := NULL;
  END IF;

  -- Caso 1: Lote precisa repetir com a MESMA chave (`claimed` após 429 rate-limit / 409 concurrent,
  -- ou `ambiguous` após 5xx / timeout / queda de rede)
  IF p_batch_status IN ('claimed', 'ambiguous') THEN
    v_new_attempts := v_batch.attempts + 1;

    -- Se esgotou 3 tentativas num erro retentável (429/5xx/timeout):
    IF v_new_attempts >= 3 AND p_batch_status = 'claimed' THEN
      UPDATE public.mailer_queue mq
      SET status = 'failed_retryable',
          attempts = v_new_attempts,
          error_code = COALESCE(p_provider_response->>'errorCode', 'RETRY_EXHAUSTED'),
          failure_category = 'retryable_exhausted',
          last_error = COALESCE(p_provider_response->>'message', 'Limite de 3 tentativas atingido para o lote.'),
          processed_at = v_now
      WHERE mq.id = ANY(v_batch.item_ids)
        AND mq.status IN ('claimed', 'processing', 'pending');

      UPDATE public.mailer_batches
      SET status = 'failed',
          attempts = v_new_attempts,
          provider_http_status = p_http_status,
          provider_response = p_provider_response,
          last_error = COALESCE(p_provider_response->>'message', 'Limite de 3 tentativas atingido.'),
          finished_at = v_now
      WHERE id = p_batch_id;
    ELSIF v_new_attempts >= 3 AND p_batch_status = 'ambiguous' THEN
      -- Se 3 envios idênticos com a mesma chave deram timeout/5xx sem resposta,
      -- marcar itens como `unconfirmed` para reconciliação/decisão sem risco de duplicar
      UPDATE public.mailer_queue mq
      SET status = 'unconfirmed',
          attempts = v_new_attempts,
          error_code = COALESCE(p_provider_response->>'errorCode', 'AMBIGUOUS_MAX_ATTEMPTS'),
          failure_category = 'ambiguous_exhausted',
          last_error = COALESCE(
            p_provider_response->>'message',
            'Três tentativas com a mesma chave de idempotência terminaram sem confirmação HTTP.'
          ),
          processed_at = v_now
      WHERE mq.id = ANY(v_batch.item_ids)
        AND mq.status IN ('claimed', 'processing', 'pending');

      UPDATE public.mailer_batches
      SET status = 'failed',
          attempts = v_new_attempts,
          provider_http_status = p_http_status,
          provider_response = p_provider_response,
          last_error = COALESCE(p_provider_response->>'message', 'Ambiguidade persistente após 3 tentativas.'),
          finished_at = v_now
      WHERE id = p_batch_id;
    ELSE
      -- Mantém o lote aberto (`claimed` ou `ambiguous`) com a MESMA chave `mc:{campaign_id}:b{seq}`
      UPDATE public.mailer_batches
      SET status = p_batch_status,
          attempts = v_new_attempts,
          provider_http_status = p_http_status,
          provider_response = p_provider_response,
          last_error = COALESCE(p_provider_response->>'message', last_error)
      WHERE id = p_batch_id;

      UPDATE public.mailer_queue mq
      SET status = 'claimed',
          attempts = v_new_attempts,
          last_error = COALESCE(p_provider_response->>'message', mq.last_error),
          error_code = COALESCE(p_provider_response->>'errorCode', mq.error_code)
      WHERE mq.id = ANY(v_batch.item_ids)
        AND mq.status IN ('claimed', 'processing', 'pending');
    END IF;
  ELSE
    -- Caso 2: Desfecho por item (`accepted`, `partial`, `failed`)
    IF p_outcomes IS NOT NULL AND jsonb_typeof(p_outcomes) = 'array' THEN
      FOR v_outcome IN
        SELECT
          (elem->>'id')::uuid AS item_id,
          COALESCE(elem->>'status', 'failed_permanent') AS target_status,
          NULLIF(trim(COALESCE(elem->>'providerMessageId', elem->>'provider_message_id', '')), '') AS provider_id,
          NULLIF(trim(COALESCE(elem->>'errorCode', elem->>'error_code', '')), '') AS err_code,
          NULLIF(trim(COALESCE(elem->>'errorMessage', elem->>'last_error', '')), '') AS err_msg,
          NULLIF(trim(COALESCE(elem->>'failureCategory', elem->>'failure_category', '')), '') AS fail_cat
        FROM jsonb_array_elements(p_outcomes) AS elem
      LOOP
        SELECT *
        INTO v_queue_row
        FROM public.mailer_queue mq
        WHERE mq.id = v_outcome.item_id
          AND mq.campaign_id = p_campaign_id
        FOR UPDATE;

        IF v_queue_row.id IS NULL THEN
          CONTINUE;
        END IF;

        v_item_status := v_outcome.target_status;
        v_provider_id := v_outcome.provider_id;
        v_error_code := v_outcome.err_code;
        v_error_msg := v_outcome.err_msg;
        v_failure_cat := v_outcome.fail_cat;

        -- INVARIANTE CRÍTICA: Nunca gravar `accepted` sem `provider_message_id`
        IF v_item_status = 'accepted' AND v_provider_id IS NULL THEN
          v_item_status := 'unconfirmed';
          v_error_code := COALESCE(v_error_code, 'MISSING_PROVIDER_MESSAGE_ID');
          v_failure_cat := COALESCE(v_failure_cat, 'missing_provider_id');
          v_error_msg := COALESCE(
            v_error_msg,
            'Resposta 200 recebida sem provider_message_id para este destinatário.'
          );
        END IF;

        UPDATE public.mailer_queue
        SET status = v_item_status,
            provider_message_id = COALESCE(v_provider_id, provider_message_id),
            attempts = v_batch.attempts + 1,
            error_code = CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_error_code END,
            failure_category = CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_failure_cat END,
            last_error = CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_error_msg END,
            processed_at = v_now,
            reserved_by = NULL,
            reservation_expires_at = NULL
        WHERE id = v_queue_row.id;

        -- Inserir log em `recruit_email_logs` (isolado por SAVEPOINT/EXCEPTION e sem duplicar)
        IF NOT COALESCE(p_dry_run, false) AND v_item_status IN ('accepted', 'failed_permanent', 'failed_retryable') THEN
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM public.recruit_email_logs rel
              WHERE rel.campaign_id = p_campaign_id
                AND lower(trim(rel.recipient_email)) = v_queue_row.email_normalized
            ) THEN
              INSERT INTO public.recruit_email_logs (
                athlete_id,
                athlete_ids,
                coach_id,
                campaign_id,
                recipient_email,
                recipient_name,
                university_name,
                subject,
                email_type,
                status,
                error_message,
                provider_id,
                sent_at
              ) VALUES (
                v_primary_athlete_id,
                v_campaign.athlete_ids,
                v_queue_row.coach_id,
                p_campaign_id,
                v_queue_row.recipient_email,
                v_queue_row.recipient_name,
                v_queue_row.university_name,
                v_queue_row.subject,
                v_queue_row.email_type,
                CASE WHEN v_item_status = 'accepted' THEN 'sent' ELSE 'failed' END,
                CASE WHEN v_item_status = 'accepted' THEN NULL ELSE v_error_msg END,
                v_provider_id,
                v_now
              );
            END IF;
          EXCEPTION WHEN OTHERS THEN
            -- Falha de log secundário nunca reverte o estado real da fila
            NULL;
          END;
        END IF;
      END LOOP;
    END IF;

    UPDATE public.mailer_batches
    SET status = CASE
          WHEN p_batch_status IN ('accepted', 'partial', 'failed') THEN p_batch_status
          ELSE 'accepted'
        END,
        attempts = v_batch.attempts + 1,
        provider_http_status = p_http_status,
        provider_response = p_provider_response,
        last_error = CASE WHEN p_batch_status = 'accepted' THEN NULL ELSE COALESCE(p_provider_response->>'message', last_error) END,
        finished_at = v_now
    WHERE id = p_batch_id;
  END IF;

  -- Recalcular contadores da campanha diretamente de `mailer_queue`
  SELECT
    count(*) FILTER (WHERE status = 'pending')::integer,
    count(*) FILTER (WHERE status IN ('claimed', 'processing'))::integer,
    count(*) FILTER (WHERE status IN ('accepted', 'sent'))::integer,
    count(*) FILTER (WHERE status IN ('failed_permanent', 'failed'))::integer,
    count(*) FILTER (WHERE status IN ('failed_retryable', 'retry'))::integer,
    count(*) FILTER (WHERE status = 'unconfirmed')::integer,
    count(*) FILTER (WHERE status = 'cancelled')::integer
  INTO
    v_pend_cnt,
    v_claim_cnt,
    v_acc_cnt,
    v_fp_cnt,
    v_fr_cnt,
    v_unc_cnt,
    v_can_cnt
  FROM public.mailer_queue
  WHERE campaign_id = p_campaign_id;

  IF p_pause_reason IS NOT NULL AND trim(p_pause_reason) <> '' THEN
    v_next_campaign_status := 'paused';
  ELSIF v_pend_cnt = 0 AND v_claim_cnt = 0 THEN
    v_next_campaign_status := 'completed';
  ELSE
    v_next_campaign_status := v_campaign.status;
  END IF;

  UPDATE public.mailer_campaigns
  SET status = v_next_campaign_status,
      accepted_count = v_acc_cnt,
      sent_count = v_acc_cnt,
      failed_permanent_count = v_fp_cnt,
      failed_retryable_count = v_fr_cnt,
      failed_count = v_fp_cnt + v_fr_cnt,
      unconfirmed_count = v_unc_cnt,
      cancelled_count = v_can_cnt,
      paused_at = CASE WHEN v_next_campaign_status = 'paused' THEN v_now ELSE paused_at END,
      completed_at = CASE WHEN v_next_campaign_status = 'completed' THEN COALESCE(completed_at, v_now) ELSE completed_at END,
      safety_pause_reason = CASE WHEN p_pause_reason IS NOT NULL THEN p_pause_reason ELSE safety_pause_reason END,
      last_error = CASE
        WHEN p_pause_reason IS NOT NULL THEN p_pause_reason
        WHEN p_batch_status = 'accepted' THEN NULL
        ELSE COALESCE(p_provider_response->>'message', last_error)
      END,
      next_batch_at = v_now + make_interval(secs => GREATEST(0, COALESCE(p_next_tick_ms, 1500))::numeric / 1000.0),
      controller_id = CASE WHEN v_next_campaign_status IN ('completed', 'paused', 'cancelled') THEN NULL ELSE p_controller_id END,
      controller_lease_expires_at = CASE
        WHEN v_next_campaign_status IN ('completed', 'paused', 'cancelled') THEN NULL
        ELSE v_now + interval '90 seconds'
      END
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'finalized', true,
    'campaignId', p_campaign_id,
    'batchId', p_batch_id,
    'batchStatus', p_batch_status,
    'campaignStatus', v_next_campaign_status,
    'pendingCount', v_pend_cnt,
    'claimedCount', v_claim_cnt,
    'acceptedCount', v_acc_cnt,
    'failedPermanentCount', v_fp_cnt,
    'failedRetryableCount', v_fr_cnt,
    'unconfirmedCount', v_unc_cnt,
    'cancelledCount', v_can_cnt
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. RPC `public.mailer_campaign_progress`
-- ----------------------------------------------------------------------------
-- Retorna um JSONB leve (~1 KB) com contagens por estado da fila, lote atual,
-- entregas confirmadas deduplicadas por mensagem (`COUNT(DISTINCT provider_email_id)`),
-- verificação de invariante (`soma dos estados == elegíveis`), ETA baseado em
-- vazão real e `as_of`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mailer_campaign_progress(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_campaign record;
  v_pend integer := 0;
  v_claim integer := 0;
  v_acc integer := 0;
  v_fp integer := 0;
  v_fr integer := 0;
  v_unc integer := 0;
  v_can integer := 0;
  v_supp_queue integer := 0;
  v_states_sum integer := 0;
  v_decided integer := 0;
  v_eligible integer := 0;
  v_delivered integer := 0;
  v_bounced integer := 0;
  v_complained integer := 0;
  v_opened integer := 0;
  v_clicked integer := 0;
  v_awaiting_delivery integer := 0;
  v_elapsed_sec numeric := 0;
  v_throughput numeric := 0;
  v_eta_sec integer := NULL;
  v_active_batch record;
BEGIN
  SELECT *
  INTO v_campaign
  FROM public.mailer_campaigns mc
  WHERE mc.id = p_campaign_id;

  IF v_campaign.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*) FILTER (WHERE status = 'pending')::integer,
    count(*) FILTER (WHERE status IN ('claimed', 'processing'))::integer,
    count(*) FILTER (WHERE status IN ('accepted', 'sent'))::integer,
    count(*) FILTER (WHERE status IN ('failed_permanent', 'failed'))::integer,
    count(*) FILTER (WHERE status IN ('failed_retryable', 'retry'))::integer,
    count(*) FILTER (WHERE status = 'unconfirmed')::integer,
    count(*) FILTER (WHERE status = 'cancelled')::integer,
    count(*) FILTER (WHERE status = 'suppressed')::integer,
    count(*)::integer
  INTO
    v_pend,
    v_claim,
    v_acc,
    v_fp,
    v_fr,
    v_unc,
    v_can,
    v_supp_queue,
    v_states_sum
  FROM public.mailer_queue
  WHERE campaign_id = p_campaign_id;

  v_eligible := CASE
    WHEN v_campaign.eligible_count > 0 THEN v_campaign.eligible_count
    ELSE v_states_sum
  END;

  v_decided := v_acc + v_fp + v_fr + v_unc + v_can + v_supp_queue;

  -- Contadores de entrega deduplicados por mensagem (provider_email_id) em email_events
  SELECT
    COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.delivered')::integer,
    COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.bounced')::integer,
    COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.complained')::integer,
    COUNT(DISTINCT ee.provider_email_id) FILTER (WHERE ee.event_type = 'email.opened')::integer,
    COUNT(DISTINCT ee.provider_email_id) FILTER (
      WHERE ee.event_type = 'email.clicked'
        AND COALESCE(ee.is_probable_automated, false) = false
    )::integer
  INTO
    v_delivered,
    v_bounced,
    v_complained,
    v_opened,
    v_clicked
  FROM public.email_events ee
  WHERE ee.campaign_id = p_campaign_id
    AND ee.provider_email_id IS NOT NULL;

  v_awaiting_delivery := GREATEST(0, v_acc - v_delivered - v_bounced);

  IF v_campaign.started_at IS NOT NULL THEN
    v_elapsed_sec := GREATEST(
      1,
      EXTRACT(EPOCH FROM (COALESCE(v_campaign.completed_at, v_now) - v_campaign.started_at))
    );
    IF v_decided > 0 THEN
      v_throughput := ROUND((v_decided::numeric / v_elapsed_sec), 2);
    END IF;
  END IF;

  IF v_campaign.status = 'running' AND (v_pend + v_claim) > 0 THEN
    IF v_throughput > 0 THEN
      v_eta_sec := CEIL((v_pend + v_claim)::numeric / v_throughput)::integer;
    ELSE
      -- Estimativa conservadora inicial baseada em 100 e-mails a cada ~2.5s (~40 e-mails/s)
      v_eta_sec := CEIL(((v_pend + v_claim)::numeric / 100.0) * 2.5)::integer;
    END IF;
  ELSIF v_campaign.status = 'completed' THEN
    v_eta_sec := 0;
  END IF;

  SELECT mb.id, mb.seq, mb.status, mb.attempts, mb.idempotency_key
  INTO v_active_batch
  FROM public.mailer_batches mb
  WHERE mb.campaign_id = p_campaign_id
  ORDER BY mb.seq DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'campaignId', v_campaign.id,
    'subject', v_campaign.subject,
    'mode', v_campaign.mode,
    'status', v_campaign.status,
    'engineVersion', COALESCE(v_campaign.engine_version, 'v2'),
    'selectedCount', GREATEST(v_campaign.selected_count, v_eligible),
    'eligibleCount', v_eligible,
    'totalRecipients', v_eligible,
    'pendingCount', v_pend,
    'claimedCount', v_claim,
    'processingCount', v_claim,
    'acceptedCount', v_acc,
    'sentCount', v_acc,
    'failedPermanentCount', v_fp,
    'failedRetryableCount', v_fr,
    'failedCount', (v_fp + v_fr),
    'unconfirmedCount', v_unc,
    'cancelledCount', v_can,
    'suppressedCount', COALESCE(v_campaign.suppressed_count, 0) + v_supp_queue,
    'decidedCount', v_decided,
    'statesSum', v_states_sum,
    'invariantValid', (v_states_sum = v_eligible),
    'submissionPercent', CASE
      WHEN v_eligible > 0 THEN LEAST(100, ROUND((v_decided::numeric / v_eligible::numeric) * 100.0)::integer)
      ELSE 100
    END,
    'deliveryPercent', CASE
      WHEN v_acc > 0 THEN LEAST(100, ROUND((v_delivered::numeric / v_acc::numeric) * 100.0)::integer)
      ELSE 0
    END,
    'deliveredCount', v_delivered,
    'bouncedCount', v_bounced,
    'complainedCount', v_complained,
    'openedCount', v_opened,
    'clickedCount', v_clicked,
    'awaitingDeliveryCount', v_awaiting_delivery,
    'currentBatch', COALESCE(v_active_batch.seq, v_campaign.current_batch, 0),
    'totalBatches', GREATEST(1, COALESCE(v_campaign.total_batches, CEIL(GREATEST(v_eligible, 1)::numeric / 100.0)::integer)),
    'batchSize', COALESCE(v_campaign.batch_size, 100),
    'lastBatchStatus', v_active_batch.status,
    'lastBatchAttempts', COALESCE(v_active_batch.attempts, 0),
    'lastBatchIdempotencyKey', v_active_batch.idempotency_key,
    'exclusionsSummary', COALESCE(v_campaign.exclusions_summary, '{}'::jsonb),
    'safetyPauseReason', v_campaign.safety_pause_reason,
    'lastError', v_campaign.last_error,
    'startedAt', v_campaign.started_at,
    'completedAt', v_campaign.completed_at,
    'pausedAt', v_campaign.paused_at,
    'nextBatchAt', v_campaign.next_batch_at,
    'controllerId', v_campaign.controller_id,
    'controllerLeaseExpiresAt', v_campaign.controller_lease_expires_at,
    'throughputPerSec', v_throughput,
    'estimatedRemainingSeconds', v_eta_sec,
    'asOf', v_now
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. RPC `public.mailer_requeue_failed_retryable`
-- ----------------------------------------------------------------------------
-- Permite ao operador reenviar SOMENTE os itens `failed_retryable` no relatório
-- final, devolvendo-os para `pending` e reabrindo a campanha para `running`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mailer_requeue_failed_retryable(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requeued integer := 0;
BEGIN
  UPDATE public.mailer_queue
  SET status = 'pending',
      batch_id = NULL,
      batch_seq = NULL,
      attempts = 0,
      reserved_by = NULL,
      reserved_at = NULL,
      reservation_expires_at = NULL,
      next_retry_at = NULL,
      last_error = NULL,
      error_code = NULL,
      failure_category = NULL,
      processed_at = NULL
  WHERE campaign_id = p_campaign_id
    AND status IN ('failed_retryable', 'retry');

  GET DIAGNOSTICS v_requeued = ROW_COUNT;

  IF v_requeued > 0 THEN
    UPDATE public.mailer_campaigns
    SET status = 'running',
        completed_at = NULL,
        paused_at = NULL,
        safety_pause_reason = NULL,
        last_error = NULL,
        failed_retryable_count = 0,
        failed_count = failed_permanent_count,
        next_batch_at = now()
    WHERE id = p_campaign_id;
  END IF;

  RETURN jsonb_build_object(
    'requeuedCount', v_requeued,
    'campaignId', p_campaign_id,
    'status', CASE WHEN v_requeued > 0 THEN 'running' ELSE 'unchanged' END
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 12. SEGURANÇA ESTRITA DOS RPCS (PADRÃO MIGRATION 0026)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mailer_preflight(jsonb, text, uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_preflight(jsonb, text, uuid[], integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.create_mailer_campaign(text, uuid, text, text, uuid[], integer, integer, integer, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_mailer_campaign(text, uuid, text, text, uuid[], integer, integer, integer, text, jsonb, jsonb, integer) TO service_role;

REVOKE ALL ON FUNCTION public.activate_mailer_campaign(uuid, integer, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_mailer_campaign(uuid, integer, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.claim_mailer_batch(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mailer_batch(uuid, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_mailer_batch(uuid, uuid, text, text, integer, jsonb, jsonb, text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_mailer_batch(uuid, uuid, text, text, integer, jsonb, jsonb, text, integer, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.mailer_campaign_progress(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_campaign_progress(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.mailer_requeue_failed_retryable(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_requeue_failed_retryable(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 13. ATUALIZAÇÃO DE `public.mailer_burst_ready()` PARA VERIFICAR 0031
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mailer_burst_ready()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_batches boolean;
  v_has_exclusions boolean;
  v_has_claim_batch boolean;
  v_has_finalize_batch boolean;
  v_has_progress boolean;
  v_coach_nullable boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_batches'
  ) INTO v_has_batches;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mailer_campaign_exclusions'
  ) INTO v_has_exclusions;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_mailer_batch'
  ) INTO v_has_claim_batch;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'finalize_mailer_batch'
  ) INTO v_has_finalize_batch;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mailer_campaign_progress'
  ) INTO v_has_progress;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recruit_email_logs'
      AND column_name = 'coach_id'
      AND is_nullable = 'YES'
  ) INTO v_coach_nullable;

  RETURN (
    v_has_batches
    AND v_has_exclusions
    AND v_has_claim_batch
    AND v_has_finalize_batch
    AND v_has_progress
    AND v_coach_nullable
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mailer_burst_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailer_burst_ready() TO service_role;

NOTIFY pgrst, 'reload schema';

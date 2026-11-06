# TASK-116 — contrato de colunas antes do SQL

Base: migrations 0018–0032, main d464a51. Executor atual: ChatGPT/Codex, aprovado por Kauan em 06/11/2026.

Colunas existentes utilizadas pelos RPCs preservados e estendidos:

| Tabela | Colunas | Origem |
| --- | --- | --- |
| mailer_campaigns | id, created_at, created_by, status, mode, subject, athlete_ids, filters, recipients_count | 0018/0022 |
| mailer_campaigns | total_recipients, sent_count, failed_count, suppressed_count, current_batch, total_batches, batch_size, started_at, completed_at, paused_at, cancelled_at, last_error, controller_id, controller_lease_expires_at, next_batch_at | 0024/0025/0027 |
| mailer_campaigns | selected_count, eligible_count, manifest_count, manifest_fingerprint, accepted_count, delivered_count, failed_permanent_count, failed_retryable_count, unconfirmed_count, cancelled_count, exclusions_summary, safety_pause_reason, engine_version | 0031 |
| mailer_queue | id, campaign_id, coach_id, recipient_email, recipient_name, university_name, email_type, subject, payload, idempotency_key, status, batch_number, attempts, max_attempts, reserved_by, reserved_at, reservation_expires_at, next_retry_at, provider_message_id, last_error, error_code, processed_at, created_at | 0024/0025/0027 |
| mailer_queue | email_normalized, batch_id, batch_seq, failure_category | 0031 |
| mailer_batches | id, campaign_id, seq, item_ids, idempotency_key, status, attempts, provider_http_status, provider_response, last_error, claimed_at, submitted_at, finished_at, created_at | 0031 |

Todas constam das migrations; não usar nomes antigos de documentação como batch_seq/attempt_count no lugar de seq/attempts de mailer_batches.

Colunas novas, ainda inexistentes e criadas explicitamente pela 0033a:

- mailer_campaigns: last_tick_at timestamptz, last_tick_by text, last_tick_message text, bounce_guard_override_at timestamptz, bounce_guard_override_by uuid, bounce_guard_override_note text.
- mailer_batches: ambiguous_attempts integer e retry_attempts integer (contadores separados, sem consumir ambiguidade ao receber 429/409), request_payload jsonb (payload congelado antes da primeira chamada ao provedor para replay idêntico, inclusive ao cruzar meia-noite ou após supressão).

Os RPCs também preservam as referências existentes a email_events e recruit_email_logs da 0031. O bloco de pré-checagem verifica tabelas, colunas e funções, incluindo public.is_agency_admin(), e aborta antes de DDL em caso de ausência. Nenhum SQL deve ser aplicado em produção nesta sessão.

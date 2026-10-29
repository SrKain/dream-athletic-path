# Plano Técnico: Correção de `coach_id` Nulo em `recruit_email_logs`, Persistência Resiliente de Rajada e Reconciliação `unconfirmed`

- **Data/Hora**: 2026-10-27 13:20 UTC
- **Solicitante**: Usuário Humano (Kauan / Go Team Go)
- **Executor**: Senior Software Engineer AI Agent
- **Status da Aprovação Humana**: **APROVADO EXPLICITAMENTE** pelo usuário (`Proceed`).

---

## 1. Contexto e Objetivo

Em produção, o fechamento de rajada do Mailer falha com:
`null value in column "coach_id" of relation "recruit_email_logs" violates not-null constraint`.

### Causa Comprovada

- `recruit_email_logs.coach_id` é `NOT NULL` desde a migration `0016`.
- A migration `0018` removeu apenas o `NOT NULL` de `athlete_id` e a FK `recruit_email_logs_coach_id_fkey`, mantendo `coach_id` como `NOT NULL`.
- Contatos importados de universidades (JSONB) não possuem linha em `public.coaches`, logo `mailer_queue.coach_id` é `NULL`.
- Na `complete_mailer_burst` (`0027`/`0029`), o `INSERT INTO public.recruit_email_logs` roda na mesma CTE do `UPDATE public.mailer_queue`. Quando a constraint falha, a transação inteira reverte e a campanha pausa com `"Provider accepted N messages, but burst persistence failed"`, após o Resend já ter aceitado o lote.

---

## 2. Escopo e Arquivos Afetados

1. `db/migrations/0030_recruit_email_logs_coach_nullable.sql`:
   - `ALTER TABLE public.recruit_email_logs ALTER COLUMN coach_id DROP NOT NULL` e `ALTER COLUMN athlete_id DROP NOT NULL`.
   - Auditoria e blindagem de todas as colunas `NOT NULL` e `CHECK` de `recruit_email_logs` (`subject`, `status`, `email_type`, `athlete_ids`, `sent_at`).
   - Inclusão do status `'unconfirmed'` em `mailer_queue_status_check`.
   - Isolamento do `INSERT INTO public.recruit_email_logs` dentro de bloco `BEGIN ... EXCEPTION WHEN OTHERS THEN ... END` em `complete_mailer_burst`, impedindo reversão do `UPDATE` em `mailer_queue`.
   - Atualização de `get_mailer_campaign_progress_summary` (incluindo `unconfirmed_count`) e `mailer_burst_ready()` (validando `coach_id` anulável e constraint `unconfirmed`).
2. `db/migrations/verify-0030.sql`:
   - Script somente-leitura para verificar a aplicação da migration `0030` no Supabase SQL Editor.
3. `src/types/db.ts`:
   - Adição de `"unconfirmed"` em `MailerQueueStatus` e `unconfirmedCount?: number` em `CampaignProgress`.
4. `src/lib/email/mailer-health.ts`:
   - `deriveCampaignSubstate` sinaliza `reconciliation_required` quando `unconfirmedCount > 0` ou quando `last_error` indica entrega não confirmada (`UNCONFIRMED_DELIVERY`).
5. `src/lib/email/mailer-queue.server.ts`:
   - Garantia de retorno de `progress` em todos os caminhos de `processMailerQueue` (inclusive early-returns).
   - Fallback resiliente caso `complete_mailer_burst` retorne erro ou `log_error`.
   - `reconcileStaleProcessingQueueItems` marca itens órfãos em `processing` sem evidência como `unconfirmed` (nunca `pending` automaticamente) e retorna a lista de destinatários afetados.
6. `src/lib/email/mailer-runner.server.ts` e `src/lib/email/recruit-email.functions.ts`:
   - Suporte às 3 ações explícitas de decisão humana (`MARKED_SENT`, `REQUEUE_PENDING`, `MARKED_FAILED`) sobre itens `unconfirmed` e `PROVIDER_AMBIGUOUS`.
   - `triggerCampaignWorkerServerFn` pausa e exige decisão humana se encontrar itens `unconfirmed`.
7. `src/routes/_authenticated/admin/mailer.tsx`:
   - Polling independente de leitura a cada 7s no modo navegador.
   - Indicador `"Último tick há Xs"` no monitor da campanha.
   - Exibição da lista de destinatários `unconfirmed` no modal de reconciliação com as 3 opções de decisão humana.
8. `src/lib/email/mailer-queue.test.ts`, `src/lib/email/mailer-runner.test.ts`, `src/lib/email/schema-integrity.test.ts`:
   - Testes unitários cobrindo `coach_id = null` com falha simulada no log, reconciliação para `unconfirmed`, early-returns com `progress` e ciclo dry-run completo.
9. `CERNE.md` e `BACKLOGER.md`:
   - Atualização da documentação viva e registro das saídas reais do Portão 7.

---

## 3. Etapas de Implementação

1. Criar `db/migrations/0030_recruit_email_logs_coach_nullable.sql` e `db/migrations/verify-0030.sql`.
2. Atualizar `src/types/db.ts` e `src/lib/email/mailer-health.ts`.
3. Atualizar `src/lib/email/mailer-queue.server.ts`, `src/lib/email/mailer-runner.server.ts` e `src/lib/email/recruit-email.functions.ts`.
4. Atualizar `src/routes/_authenticated/admin/mailer.tsx`.
5. Atualizar e criar testes em `src/lib/email/mailer-queue.test.ts`, `src/lib/email/mailer-runner.test.ts` e `src/lib/email/schema-integrity.test.ts`.
6. Atualizar `CERNE.md` e `BACKLOGER.md` e executar os comandos obrigatórios de validação.

---

## 4. Impactos, Riscos e Alternativas Consideradas

- **Ordem de Deploy**: A migration `0030` deve ser aplicada no Supabase antes do deploy do código.
- **Zero Envio Duplicado**: Nenhum item em `processing` sem evidência volta sozinho para `pending`; todos exigem decisão humana explícita sobre a lista nominal de destinatários.

---

## 5. Estratégia de Validação

1. `bun install --frozen-lockfile`
2. `git diff --exit-code -- package.json bun.lock`
3. `bun run validate` (`lint` + `typecheck` + `test` + `build`)

---

## 6. Status da Aprovação Humana e Resultado

- Aprovado pelo usuário via `Proceed` no artefato de planejamento.

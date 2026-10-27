# Planejamento — TASK-111: Reconciliação do Schema do Mailer (Migration 0029), Correção de Snapshot FK/Colunas, Parse de Bounce Stats e Orquestração Navegador

- **Data / Hora**: 2026-10-27 11:35 (UTC-7) / 15:35 (America/Sao_Paulo)
- **Solicitante**: Kauan (Usuário Humano)
- **Executor Planejado**: Google AI Studio (Coding Engine)
- **Status do Plano**: `[AGUARDANDO APROVAÇÃO HUMANA]` — Nenhuma alteração em código ou banco será realizada antes da aprovação prévia e explícita do usuário.
- **Branch**: `main`, HEAD de referência `8651da0`.

---

## 1. Contexto & Diagnóstico da Regressão (Commit 5c6a1e4 / TASK-109)

O Mailer foi projetado para orquestração guiada pelo navegador (browser-driven via `processMailerMicroBatchServerFn`, Web Worker inline via Blob, Screen Wake Lock API, lease no Supabase em `sessionStorage` e lotes de 100 com 1 requisição `resend.batch.send` por tick).

A auditoria de produção comprovou 10 falhas críticas introduzidas na tentativa de suporte a 5.000+ destinatários (TASK-109, commit `5c6a1e4`):

1. **Migration 0028 não aplicada em produção**: No Supabase de produção existem apenas as versões da migration 0027 de `mailer_burst_ready` e `complete_mailer_burst` (assinatura de 6 parâmetros, sem `p_dry_run`). As tabelas `mailer_campaign_snapshots`, `mailer_domain_checks` e as RPCs `filter_suppressed_emails`, `mailer_campaign_bounce_stats` não existem.
2. **CHECK constraint desatualizada**: A restrição `mailer_campaigns_status_check` em produção é a da migration 0024 (`queued`, `running`, `paused`, `completed`, `failed`, `cancelled`), sem `draft` nem `preparing`. A 0028 tentava adicioná-los dentro de um bloco anônimo `DO ... EXCEPTION WHEN OTHERS THEN NULL`, que engoliu silenciosamente a falha.
3. **Colunas divergentes em `mailer_campaign_snapshots`**: O código de `createCampaignDraft` insere `version`, `mode`, `subject_template`, `snapshot_data`, enquanto a DDL da tabela previa apenas `(campaign_id, schema_version, snapshot, created_at)`. `processMailerQueue` e `appendCampaignRecipients` também realizavam `.select("snapshot_data").order("version")`, causando erro de coluna inexistente no PostgreSQL.
4. **Violação de Chave Estrangeira (FK)**: `createCampaignDraft` tentava inserir o snapshot antes de inserir a campanha, mas `campaign_id` referencia `mailer_campaigns(id)`.
5. **Bloqueio de status 'draft'**: `createCampaignDraft` e `activateCampaign` utilizam o status `"draft"`, rejeitado pela constraint de status do banco.
6. **Incompatibilidade de assinatura em `complete_mailer_burst`**: `processMailerQueue` envia `p_dry_run` (7 parâmetros). No banco com 0027 (6 parâmetros), a chamada PostgREST falha após o lote ser aceito pelo provedor, pausando a campanha com erro `"Provider accepted X messages, but burst persistence failed"`.
7. **Falso positivo de segurança em `mailer_burst_ready`**: A versão 0027 retorna `SELECT true` estático, permitindo que o worker chame o Resend mesmo sem as tabelas e colunas novas.
8. **Incompatibilidade de tipo no retorno de `mailer_campaign_bounce_stats`**: A RPC retorna um objeto `jsonb` único (não um array), e a versão 0028 não incluía a chave `bounce_guard_triggered`. O código cliente/servidor verificava `Array.isArray(rows)` e lia `bounce_guard_triggered`, fazendo com que o semáforo de reputação ficasse sempre em zero e a guarda nunca disparasse.
9. **Filtro de supressão no banco inoperante**: A RPC `filter_suppressed_emails` retorna a coluna `suppressed_email`, mas o código lia `row.email`, caindo invariavelmente no fallback local.
10. **Testes mockados**: Os testes unitários mockavam o Supabase e o `schema-integrity.test.ts` apenas testava regex de `CREATE TABLE`, sem validar as colunas acessadas no código nem os valores literais aceitos no CHECK de status.

---

## 2. Cruzamento Exaustivo com Migrations 0001 a 0027 (Prevenção Anti "Column does not exist")

Antes de modelar a migration 0029, todas as tabelas, colunas, constraints e funções referenciadas foram cruzadas com as definições históricas das migrations 0001–0027:

| Tabela / Objeto                    | Migrations de Origem        | Colunas e Atributos Validados                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Status no Plano                                |
| :--------------------------------- | :-------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------- |
| `public.mailer_campaigns`          | 0022, 0024, 0025            | `id`, `created_by`, `mode`, `subject`, `athlete_ids`, `total_recipients`, `recipients_count`, `sent_count`, `failed_count`, `suppressed_count`, `current_batch`, `total_batches`, `batch_size`, `delay_between_batches_sec`, `delay_between_items_ms`, `status`, `filters`, `started_at`, `completed_at`, `paused_at`, `cancelled_at`, `next_batch_at`, `last_error`, `pending_count`, `processing_count`, `cancelled_count`, `controller_id`, `controller_lease_expires_at`, `created_at`, `updated_at`. | **Confirmadas 100% existentes**.               |
| `mailer_campaigns_status_check`    | 0022, 0024                  | Constraint CHECK em `mailer_campaigns.status`. Em 0024: `('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')`. Em 0029 será recriada diretamente (sem bloco com exceção engolida) para conter: `('draft', 'preparing', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled')`.                                                                                                                                                                                               | **Compatível com todas as linhas existentes**. |
| `public.mailer_campaign_snapshots` | 0028 (substituída por 0029) | `campaign_id uuid PRIMARY KEY REFERENCES public.mailer_campaigns(id) ON DELETE CASCADE`, `schema_version integer NOT NULL DEFAULT 1`, `snapshot jsonb NOT NULL DEFAULT '{}'::jsonb`, `created_at timestamptz NOT NULL DEFAULT timezone('utc', now())`.                                                                                                                                                                                                                                                    | **Definição canônica autossuficiente**.        |
| `public.mailer_domain_checks`      | 0028 (substituída por 0029) | `domain text PRIMARY KEY`, `has_mx boolean NOT NULL DEFAULT false`, `checked_at timestamptz NOT NULL DEFAULT timezone('utc', now())`.                                                                                                                                                                                                                                                                                                                                                                     | **Definição canônica autossuficiente**.        |
| `public.email_suppressions`        | 0018, 0020                  | `id`, `email`, `reason`, `suppression_type`, `notes`, `expires_at`, `created_at`. Índice funcional único: `lower(trim(email))`.                                                                                                                                                                                                                                                                                                                                                                           | **Confirmada**.                                |
| `public.email_events`              | 0021, 0023                  | `id`, `provider_email_id`, `event_type`, `recipient_email`, `occurred_at`, `payload`, `campaign_id`, `tags`, `created_at`.                                                                                                                                                                                                                                                                                                                                                                                | **Confirmada**.                                |
| `public.recruit_email_logs`        | 0016, 0018, 0022, 0027      | `id`, `campaign_id`, `athlete_id`, `athlete_ids`, `coach_id`, `subject`, `status`, `error_message`, `sent_at`, `email_type`, `recipient_email`, `recipient_name`, `university_name`, `provider_id`.                                                                                                                                                                                                                                                                                                       | **Confirmada**.                                |
| `public.mailer_rate_limits`        | 0024                        | `id = 'global_resend_limit'`, `locked_until`, `updated_at`.                                                                                                                                                                                                                                                                                                                                                                                                                                               | **Confirmada**.                                |
| `public.mailer_queue`              | 0024, 0025, 0027            | `id`, `campaign_id`, `coach_id`, `recipient_email`, `recipient_name`, `university_name`, `email_type`, `subject`, `payload`, `idempotency_key`, `status`, `batch_number`, `attempts`, `max_attempts`, `reserved_by`, `reserved_at`, `reservation_expires_at`, `next_retry_at`, `provider_message_id`, `last_error`, `error_code`, `processed_at`, `created_at`.                                                                                                                                           | **Confirmada**.                                |
| `public.is_agency_admin()`         | 0001, 0002                  | Função de autorização de administradores em RLS.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Confirmada**.                                |

---

## 3. Plano Detalhado de Implementação

### Bloco A — Migration `0029_mailer_schema_reconcile.sql` & Script de Verificação `verify-0029.sql`

1. **Arquivo `db/migrations/0029_mailer_schema_reconcile.sql`**:
   - Totalmente autossuficiente e idempotente, sem qualquer dependência da 0028.
   - Não utiliza blocos `DO ... EXCEPTION WHEN OTHERS THEN NULL` que mascaram erros.
   - Recria a constraint `mailer_campaigns_status_check`:
     ```sql
     ALTER TABLE public.mailer_campaigns DROP CONSTRAINT IF EXISTS mailer_campaigns_status_check;
     ALTER TABLE public.mailer_campaigns ADD CONSTRAINT mailer_campaigns_status_check
       CHECK (status IN ('draft', 'preparing', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled'));
     ```
   - Cria tabelas `mailer_campaign_snapshots` e `mailer_domain_checks` com `CREATE TABLE IF NOT EXISTS`, habilitando RLS, políticas restritas a `public.is_agency_admin()` e concessões `GRANT ALL ... TO authenticated, service_role`.
   - Cria ou substitui RPC `filter_suppressed_emails(p_emails text[])` retornando `TABLE (suppressed_email text, reason text, suppression_type text)`.
   - Cria ou substitui RPC `mailer_campaign_bounce_stats(p_campaign_id uuid)` calculando `sent_count`, `permanent_bounces`, `transient_bounces`, `complaints`, `bounce_rate`, `complaint_rate` e computando explicitamente `bounce_guard_triggered := (v_sent_count >= 20 AND v_bounce_rate > 3.0)`.
   - Cria ou substitui RPC `complete_mailer_burst` com 7 argumentos (incluindo `p_dry_run boolean DEFAULT false`), e a sobrecarga de 6 argumentos para compatibilidade total.
   - Cria ou substitui RPC `mailer_burst_ready()` com validação profunda:
     1. Existência de `public.mailer_campaign_snapshots` e `public.mailer_domain_checks` em `information_schema.tables`.
     2. Existência de `filter_suppressed_emails` e `mailer_campaign_bounce_stats` em `information_schema.routines`.
     3. Existência de `complete_mailer_burst` com **7 argumentos** inspecionando `pg_proc.pronargs = 7`.
     4. Validação da constraint `mailer_campaigns_status_check` contendo `'draft'` via `pg_constraint` e `pg_get_constraintdef(c.oid) LIKE '%draft%'`.
        Retorna `true` apenas se todas as 4 condições forem estritamente satisfeitas; caso contrário, `false`.
   - Revogação de permissões públicas/anônimas e concessão exclusiva a `service_role` em todas as RPCs sensíveis.
   - Marcação da migration 0028 como obsoleta/substituída por comentário no topo de `0028_mailer_high_volume_snapshot_and_bounce_guard.sql` (sem deletar o arquivo).

2. **Arquivo `db/migrations/verify-0029.sql`**:
   - Script SQL somente leitura para ser executado no Supabase SQL Editor antes do deploy de código.
   - Valida:
     - Presença das tabelas `mailer_campaign_snapshots` e `mailer_domain_checks`.
     - Presença das colunas exatas de `mailer_campaign_snapshots` (`campaign_id`, `schema_version`, `snapshot`, `created_at`).
     - Presença da assinatura de 7 argumentos de `complete_mailer_burst` via `pg_proc`.
     - Presença dos status `draft` e `preparing` na constraint `mailer_campaigns_status_check`.
     - Execução direta de `SELECT public.mailer_burst_ready()` (deve retornar `true`).

---

### Bloco B — Correção do Código da Fila e Servidor (`src/lib/email/...`)

1. **`createCampaignDraft` em `src/lib/email/mailer-queue.server.ts`**:
   - Inserir **PRIMEIRO** o registro da campanha em `mailer_campaigns` com status `"draft"`, `total_recipients: 0`, contadores em zero.
   - Inserir **DEPOIS** o snapshot em `mailer_campaign_snapshots` com as colunas reais da migration:
     ```ts
     {
       campaign_id: campaignId,
       schema_version: 1,
       snapshot: snapshot as unknown as Record<string, unknown>,
       created_at: now,
     }
     ```
   - Se a inserção do snapshot falhar por qualquer motivo: executar rollback manual removendo o registro recém-criado em `mailer_campaigns` (`admin.from("mailer_campaigns").delete().eq("id", campaignId)`) e propagar erro explicativo.

2. **`appendCampaignRecipients` e `processMailerQueue` em `src/lib/email/mailer-queue.server.ts`**:
   - Leitura de snapshot corrigida:
     ```ts
     const { data: snapshotRow, error: snapErr } = await admin
       .from("mailer_campaign_snapshots")
       .select("snapshot")
       .eq("campaign_id", campaignId)
       .maybeSingle();
     ```
     Removido completamente `.order("version")` e a leitura da coluna inexistente `snapshot_data`.
   - Correção do consumo da RPC `filter_suppressed_emails`:
     Mapear `row.suppressed_email || row.email` para capturar os endereços suprimidos retornados pelo banco.
   - Mensagem clara do gate `mailer_burst_ready`: quando retornar `false`, a mensagem deve orientar explicitamente:
     `"A migration 0029 do Mailer não está aplicada no banco. Aplique a migration 0029 (e execute verify-0029.sql) no Supabase SQL Editor para liberar os disparos."`

3. **Parse Resiliente de Bounce Stats (`mailer_campaign_bounce_stats`)**:
   - Implementar helper defensivo compartilhado `parseCampaignBounceStats(raw: unknown)`:
     Aceita tanto objeto jsonb direto quanto array (`raw[0]`), mapeando:
     - `sentCount = Number(obj.sent_count) || 0`
     - `bounceCount = Number(obj.permanent_bounces ?? obj.bounce_count) || 0`
     - `complaintCount = Number(obj.complaints ?? obj.complaint_count) || 0`
     - `bounceRate = Number(obj.bounce_rate) || 0`
     - `bounceGuardTriggered = Boolean(obj.bounce_guard_triggered ?? (sentCount >= 20 && bounceRate > 3))`
   - Em `activateCampaign`: aplicar o helper. Se a verificação RPC falhar por erro transitório de infraestrutura, aplicar fail-open com log (`console.warn`) sem bloquear campanhas legítimas; se `bounceGuardTriggered` for verdadeiro, bloquear a ativação com a mensagem de proteção de reputação.
   - Em `processMailerQueue`: aplicar o helper após envios para suspender a campanha caso o limiar de 3% de bounce seja violado em produção.
   - Em `getCampaignBounceStatsServerFn` (`src/lib/email/recruit-email.functions.ts`): utilizar o parser para alimentar os cards da UI com números reais.

4. **Tipos em `src/types/db.ts`**:
   - Atualizar `MailerCampaignStatus` para:
     ```ts
     export type MailerCampaignStatus =
       | "draft"
       | "preparing"
       | "queued"
       | "running"
       | "paused"
       | "completed"
       | "failed"
       | "cancelled";
     ```
   - Adicionar interface `MailerCampaignSnapshotRow`:
     ```ts
     export interface MailerCampaignSnapshotRow {
       campaign_id: string;
       schema_version: number;
       snapshot: Record<string, unknown>;
       created_at: string;
     }
     ```

5. **Listagem de Campanhas Recentes em `src/lib/email/mailer-runner.server.ts`**:
   - Em `getRecentMailerCampaigns`, filtrar `.not("status", "in", '("draft","preparing")')` para que rascunhos em composição ou abandonados não poluam o dropdown de monitoramento da agência.

---

### Bloco C — Orquestração no Navegador (Preservação e Proteção)

- **Garantia de Não-Regressão**: O fluxo validado da TASK-108/109 permanece o condutor oficial:
  - Disparo de campanha acionado pelo botão da UI → `enqueueMailerCampaignServerFn` cria e ativa a campanha (`running`).
  - Efeito do React em `src/routes/_authenticated/admin/mailer.tsx` assume a orquestração via ticks com `processMailerMicroBatchServerFn` (micro-lote padrão de 100 destinatários por tick, 1 requisição `resend.batch.send` por tick).
  - Web Worker inline via Blob (`setInterval` fora da main thread para imunidade a abas em segundo plano).
  - Screen Wake Lock API ativada enquanto a fila estiver processando.
  - Alerta `window.onbeforeunload` ativo contra fechamento acidental da aba.
  - `tabId` persistido em `sessionStorage` para reter o lease de 30s sem conflito no recarregamento.
  - Botão `"Destravar Fila / Sincronizar Navegador"` funcional para limpar processamentos órfãos.
  - Variável `serverOrchestration` mantida desligada (`false`) por padrão e worker do servidor fechado por segredo.

---

### Bloco D — Testes Automatizados (Sem Envio Real)

1. **Teste Estrito de Integridade de Contrato de Schema (`src/lib/email/schema-integrity.test.ts`)**:
   - Analisar com TypeScript AST / regex todas as chamadas `.from("mailer_campaign_snapshots")`, `.from("mailer_campaigns")` e `.from("mailer_queue")` nos métodos `.insert()`, `.update()`, `.select()` e `.order()` do código de produção.
   - Falhar se qualquer propriedade acessada não estiver declarada nas migrations 0001–0029.
   - Extrair todos os status literais atribuídos a `mailer_campaigns.status` no código (`'draft'`, `'preparing'`, `'queued'`, `'running'`, `'paused'`, `'completed'`, `'failed'`, `'cancelled'`) e validar que 100% deles constam na definição do CHECK da migration 0029.
   - Validar que a migration 0029 declara as tabelas `mailer_campaign_snapshots` e `mailer_domain_checks`, a constraint de status, a RPC `filter_suppressed_emails`, a RPC `mailer_campaign_bounce_stats` (com `bounce_guard_triggered`), a assinatura de 7 argumentos de `complete_mailer_burst` e a função `mailer_burst_ready`.

2. **Teste de Ordem e Rollback de Draft (`src/lib/email/mailer-queue.test.ts`)**:
   - Testar que `createCampaignDraft` insere na tabela `mailer_campaigns` antes de `mailer_campaign_snapshots`.
   - Testar que, se a inserção do snapshot falhar, o rascunho de `mailer_campaigns` é removido imediatamente (rollback) e o erro original é propagado.

3. **Teste do Parser de Bounce Stats (`src/lib/email/mailer-queue.test.ts` e `src/lib/email/recruit-email.functions.ts`)**:
   - Testar resposta como objeto jsonb `{ sent_count: 50, permanent_bounces: 4, complaints: 1, bounce_rate: 8.0, bounce_guard_triggered: true }`.
   - Testar resposta de fallback ou formato array legado.
   - Testar acionamento correto da guarda de reputação (`sent_count >= 20` e `bounce_rate > 3.0`).

4. **Teste de Ciclo Completo End-to-End em Modo Ensaio (Dry-Run)**:
   - Utilizando `FakeMailProvider`:
     1. `createCampaignDraft` cria rascunho com snapshot.
     2. `appendCampaignRecipients` anexa destinatários com sintaxe válida e deduplicação.
     3. `activateCampaign` ativa a campanha com status `running`.
     4. Ticks de `processMailerQueue` processam e reservam o lote, persistem via `complete_mailer_burst` com `p_dry_run: true` e compactam o payload.
     5. Campanha é concluída com sucesso (`status = 'completed'`, contadores 100% consistentes).

---

## 4. Instruções de Implantação e Validação Operacional

### Ordem Obrigatória de Aplicação

1. **Passo 1 (Supabase SQL Editor)**: Executar o arquivo `db/migrations/0029_mailer_schema_reconcile.sql`.
2. **Passo 2 (Supabase SQL Editor)**: Executar `db/migrations/verify-0029.sql`.
   - **Resultado Esperado**:
     - `tabelas_ok`: `true` para `mailer_campaign_snapshots` e `mailer_domain_checks`.
     - `snapshot_columns_ok`: `true` (colunas `campaign_id`, `schema_version`, `snapshot`, `created_at`).
     - `complete_burst_7args_ok`: `true`.
     - `status_check_has_draft`: `true`.
     - `mailer_burst_ready_status`: `true`.
3. **Passo 3 (Deploy de Código)**: Após o `verify-0029.sql` retornar `true` em todas as verificações, efetuar o deploy da aplicação.

### Procedimento de Teste em Dry-Run (Zero Envio Real)

1. Acessar `/admin/mailer` autenticado como agência.
2. Selecionar 1 ou mais atletas no composer.
3. Marcar o toggle **"Modo Ensaio (Dry-Run)"**. O badge visual `DRY RUN` aparecerá em destaque.
4. Clicar em **"Disparar Mailer"** e confirmar no modal de segurança.
5. Observar o monitor ao vivo:
   - A campanha é criada em `draft`, preenchida com destinatários e ativada em `running`.
   - O orquestrador via Web Worker realiza ticks no micro-lote de 100.
   - Nenhuma requisição externa à Resend é disparada (`FakeMailProvider` gera IDs sintéticos `dry_<uuid>`).
   - Nenhum registro é gravado em `recruit_email_logs`.
   - A fila transiciona para `sent`, payloads têm HTML/texto purgados para economia de storage, e a campanha finaliza em `completed` com feedback visual de sucesso.

---

## 5. Portão Anti-Build-Quebrada (Regra 7 do AGENTS.md)

Nenhum arquivo `package.json` ou `bun.lock` será alterado.
Antes de qualquer entrega, os seguintes comandos devem ser validados:

1. `bun install --frozen-lockfile` (código de saída 0).
2. `git diff --exit-code -- package.json bun.lock` (código de saída 0).
3. `bun run validate` (lint + typecheck + test + build, código de saída 0).
4. Atualização de `CERNE.md` e registro no `BACKLOGER.md`.

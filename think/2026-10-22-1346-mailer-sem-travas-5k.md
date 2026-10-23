# PLANO DE EXECUÇÃO — TASK-109 (VERSÃO FINAL)

## MAILER SEM TRAVAS: 5.000+ DESTINATÁRIOS COM BUILD INTACTA

- **Data e Hora:** 2026-10-22 13:46 (America/Sao_Paulo)
- **Solicitante:** Kauan (Usuário Humano)
- **Executor:** Google AI Studio (Coding Engine)
- **Status:** `[AGUARDANDO APROVAÇÃO PRÉVIA HUMANA]` — Nenhuma alteração de código ou migração executada até aprovação explícita.

---

### 0. Diagnóstico Inicial e Medições da Linha de Base (HEAD 504cf43)

1. **Linha de Base de Testes (Vitest):**
   - Execução completa: **36 arquivos de teste, 300 testes no total**.
   - **298 testes passaram** e exatamente **2 testes falharam** em `src/lib/email/resend-email.test.ts`:
     - `processes email.bounced event and inserts into email_suppressions`
     - `processes email.complained event and inserts into email_suppressions`
     - **Causa confirmada:** Os testes esperavam `mockUpsert(expect.objectContaining(...), { onConflict: "email" })`. Com a introdução do `upsertEmailSuppressionSafe` (que consulta por `lower(trim(email))` e executa `update` ou `insert` com fallback para `23505`), a assinatura `{ onConflict: "email" }` não é mais chamada, eliminando a falha de constraint única no Postgres. O passo 1 da implementação ajustará o teste para validar esse contrato real.

2. **Configuração de Funções na Vercel (`vercel.json`):**
   - O arquivo `vercel.json` atual define apenas `buildCommand` e `installCommand`, com `"framework": null`.
   - **`maxDuration` não está definido no `vercel.json`**.
   - No plano Vercel Hobby o teto padrão é 15 segundos; em planos Pro é configurável até 300 segundos, mas sem declaração explícita o runtime assume 15 segundos.
   - **Decisão arquitetural:** Cada tick de envio do Mailer deve completar confortavelmente com orçamento de até 3 segundos (p95) e máximo estrito de 10 segundos, garantindo execução segura mesmo sob o menor limite serverless da Vercel.

3. **Verificação do SDK Resend (`resend ^6.31.0`):**
   - Inspecionada a definição de tipos em `node_modules/resend/dist/index.d.mts`.
   - Confirmado: `resend.batch.send(payload, { batchValidation: 'permissive' })` é **nativamente suportado** pelo SDK instalado.
   - Retorno tipado: `{ data: { id: string }[], errors: { index: number, message: string }[] }`.
   - Isso viabiliza eliminar 100% o fallback de disparos individuais sequenciais que gerava timeouts e consumo indevido de tentativas.

4. **Auditoria de Índices e Constraints (Migrations 0001-0027):**
   - Tabela `public.email_suppressions` (criada na 0018, alterada na 0020): possui índice funcional único `create unique index if not exists idx_email_suppressions_email_lower on public.email_suppressions (lower(trim(email)))`. Não possui constraint de chave única pura em `email`.
   - Tabela `public.mailer_queue` (0024): a coluna `idempotency_key` foi declarada como `text not null unique`, e na linha 120 da 0024 foi criado `create index if not exists idx_mailer_queue_idempotency on public.mailer_queue (idempotency_key)`. O Postgres cria automaticamente um índice único para a constraint `UNIQUE`, portanto `idx_mailer_queue_idempotency` é redundante (conforme instrução da regra 6, este fato fica registrado e o índice NÃO será dropado para garantir idempotência aditiva).
   - Tabela `public.mailer_campaigns`: status válidos atuais `('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')`. Para o novo enqueue de 3 fases, o status `'preparing'` será adicionado à constraint de status de forma aditiva.

5. **Inspeção dos Tipos de Bounce (Resend):**
   - Webhook `email.bounced` da Resend fornece `payload.data.bounce.type` (ou `payload.data.bounce_type`) com os valores `"Permanent"`, `"Transient"` e `"Undetermined"`.
   - Regra E17 confirmada:
     - `Permanent` e `email.complained` -> `suppression_type = 'permanent'`, `expires_at = null`.
     - `Transient` e `Undetermined` -> `suppression_type = 'temporary_6m'`, `expires_at = now() + interval '6 months'`.

---

### 1. Cruzamento Integral de Tabelas, Colunas e RPCs com as Migrations 0001 a 0027

| Objeto / Coluna Referenciada      | Migration de Origem                                | Status / Validação na 0028                                                                     |
| :-------------------------------- | :------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| `public.is_agency_admin()`        | `0001_init.sql`                                    | Confirmada; usada nas RLS policies da 0028                                                     |
| `public.athletes(id)`             | `0001_init.sql`, `0010_athlete_profile_fields.sql` | Confirmada; campos validados                                                                   |
| `public.coaches(id)`              | `0016_coaches_and_recruit_emails.sql`              | Confirmada                                                                                     |
| `public.recruit_email_logs`       | `0016`, `0018`, `0023`                             | Confirmada; colunas `campaign_id`, `athlete_ids`, `provider_id` intactas                       |
| `public.universities`             | `0018_universities_and_mailer.sql`                 | Confirmada                                                                                     |
| `public.email_suppressions`       | `0018`, `0020_interest_signals...sql`              | Colunas: `email`, `reason`, `suppression_type`, `expires_at`, `created_at`                     |
| `public.email_events`             | `0021`, `0023_fix_email_events...sql`              | Colunas: `svix_id`, `event_type`, `recipient_email`, `provider_email_id`, `tags`               |
| `public.mailer_campaigns`         | `0022`, `0024`, `0025`                             | Colunas: `id`, `status`, `controller_id`, `controller_lease_expires_at`, `next_batch_at`       |
| `public.mailer_queue`             | `0024`, `0025`, `0027`                             | Colunas: `id`, `campaign_id`, `recipient_email`, `status`, `payload`, `attempts`, `error_code` |
| `public.mailer_rate_limits`       | `0024_mailer_queue_and_rate_limiting.sql`          | Linha `global_resend_limit`, coluna `locked_until`                                             |
| `public.claim_mailer_queue_batch` | `0027_mailer_burst_claim_and_persistence.sql`      | 4 argumentos: `(text, integer, integer, uuid)`                                                 |
| `public.complete_mailer_burst`    | `0027_mailer_burst_claim_and_persistence.sql`      | Atualizada na 0028 com `p_dry_run`, 250ms min pause e attempts refund                          |
| `public.mailer_burst_ready`       | `0027_mailer_burst_claim_and_persistence.sql`      | Substituída na 0028 por verificação real de colunas/RPCs                                       |

---

### 2. Arquitetura da Migration 0028 (Aditiva e Idempotente)

Arquivo a ser criado: `db/migrations/0028_mailer_high_volume_snapshot_and_bounce_guard.sql`.

1. **Status `'preparing'` em `mailer_campaigns`:**
   - Adiciona `'preparing'` à constraint `mailer_campaigns_status_check`.
2. **Tabela `mailer_campaign_snapshots`:**
   ```sql
   create table if not exists public.mailer_campaign_snapshots (
     campaign_id uuid primary key references public.mailer_campaigns(id) on delete cascade,
     schema_version integer not null default 1,
     snapshot jsonb not null default '{}'::jsonb,
     created_at timestamptz not null default timezone('utc', now())
   );
   ```
   - RLS com acesso total para `is_agency_admin()` e permissões `service_role`.
3. **Tabela `mailer_domain_checks` (Cache DNS MX/A):**
   ```sql
   create table if not exists public.mailer_domain_checks (
     domain text primary key,
     has_mx boolean not null default false,
     checked_at timestamptz not null default timezone('utc', now())
   );
   ```
   - RLS para `is_agency_admin()` e `service_role`.
4. **RPC `filter_suppressed_emails(p_emails text[])`:**
   - Recebe array de emails, normaliza com `lower(trim(e))` e retorna conjunto filtrado que já consta em `email_suppressions` (ativos, não expirados).
5. **RPC `mailer_campaign_bounce_stats(p_campaign_id uuid)`:**
   - Calcula em O(1) pelo índice de `email_events`: total de envios, total de bounces permanentes, total de reclamações (complaints), e percentuais.
6. **Evolução de `complete_mailer_burst`:**
   - Adiciona parâmetro `p_dry_run boolean DEFAULT false`.
   - Se `p_dry_run = true`, NÃO insere linhas em `recruit_email_logs`.
   - Reduz pausa mínima para `250` ms (`GREATEST(250, ...)`).
   - Reembolsa `attempts = GREATEST(0, q.attempts - 1)` para:
     `'429'`, `'PROVIDER_PAUSED'`, `'BATCH_REJECTED_TRANSIENT'`, `'CONFIG_ERROR'`, `'AMBIGUOUS'`.
   - Ao transicionar para `'sent'` ou `'cancelled'`, remove `html` e `text` do payload legado via `q.payload - 'html' - 'text'`, mantendo `athleteId`, `athleteIds` e `tags` para economia maciça de armazenamento e egress.
7. **`mailer_burst_ready()` Real:**
   - Inspeciona `information_schema.tables` e `routine_privileges` para garantir que `mailer_campaign_snapshots`, `mailer_domain_checks`, `filter_suppressed_emails`, `mailer_campaign_bounce_stats` e `complete_mailer_burst` com 7 argumentos existem.
8. **Índices de Alta Performance:**
   - `create index if not exists idx_mailer_queue_active_batch on public.mailer_queue (campaign_id, batch_number, created_at, id) where status in ('pending', 'retry');`
   - `create index if not exists idx_email_events_campaign_type on public.email_events (((tags->>'campaign_id')), event_type);`

---

### 3. Plano de Implementação em 12 Etapas

1. **Etapa 1: Correção dos 2 Testes de Supressão e Remoção de Ramos Adaptados a Mock**
   - Atualizar `src/lib/email/resend-email.test.ts` para validar o contrato real de `upsertEmailSuppressionSafe` (busca case-insensitive + update/insert).
   - Remover os ramos puramente artificiais `typeof x === 'function'` de `upsertEmailSuppressionSafe` e `reconcileStaleProcessingQueueItems`.
   - Rodar vitest para confirmar 300/300 testes verdes antes de qualquer refatoração.

2. **Etapa 2: Teste de Schema Automático (T9) e `mailer_burst_ready` Real**
   - Criar teste em `src/lib/email/schema-integrity.test.ts` que inspeciona todas as strings de query/RPC em `src/lib/email/*.server.ts` contra as definições das migrations 0001 a 0028.
   - Implementar `mailer_burst_ready()` real com bloqueio fail-closed se migration 0028 não estiver aplicada.

3. **Etapa 3: Arquivos de Migration 0028 e Script de Verificação SQL**
   - Criar `db/migrations/0028_mailer_high_volume_snapshot_and_bounce_guard.sql`.
   - Criar `db/migrations/verify-0028.sql` (somente leitura para verificação pré e pós-aplicação no SQL Editor do Supabase).

4. **Etapa 4: Camada de Provedor Isolada (`mail-provider.server.ts`)**
   - Criar interface `MailProvider` com método `sendBatch(items, options)`.
   - Implementar `ResendMailProvider` usando `resend.batch.send` com `batchValidation: 'permissive'`.
   - Implementar `FakeMailProvider` para dry-run e testes unitários (gera IDs `dry_<uuid>`, simula latência configurável, 0 chamadas à rede).
   - Garantir que o SDK Resend NUNCA seja instanciado em modo dry-run.

5. **Etapa 5: Validação Estrita de Sintaxe e Higiene de Domínio (E1, E18)**
   - Criar `src/lib/email/email-syntax.ts` com `isDeliverableEmailSyntax`:
     - Trim, lowercase, sem espaços, 1 arroba, domínio com ponto e TLD válido, sem pontos consecutivos, sem caracteres ilegais.
     - Aplicar no enqueue, no importador de CSV/XLSX (`src/lib/universities-import.ts`), nos formulários de coach e no seletor da UI.
   - Criar `src/lib/email/domain-hygiene.server.ts`:
     - Checa cache `mailer_domain_checks` (TTL 30 dias).
     - Usa `node:dns/promises` (`resolveMx` e fallback `resolve4`) com timeout de 3s e concorrência máxima de 20.
     - Domínio comprovadamente sem MX e sem A é excluído da fila (`failed/INVALID_DOMAIN`).
     - Erros transitórios de DNS (timeout, SERVFAIL) não excluem o e-mail: marcam como "não verificado".

6. **Etapa 6: Golden File de Paridade de Render (T1)**
   - Gerar fixtures determinísticas para single, multi 3/6/10, catalog, com/sem foto, texto customizado.
   - Criar teste de paridade comparando byte a byte a saída de `renderQueuedEmail` a partir do snapshot com a renderização legada.

7. **Etapa 7: Snapshot de Campanha, Render no Envio e Enqueue em 3 Fases (E4, E7, 4.1-4.3)**
   - Criar `src/lib/email/mailer-snapshot.ts` para empacotar os dados imutáveis da campanha (atletas, logo, hero, textos, ano).
   - Enqueue em 3 fases:
     1. `createCampaignDraftServerFn`: cria campanha em `status = 'preparing'`, salva o snapshot, valida amostra com `assertEmailIntegrity`.
     2. `appendCampaignRecipientsServerFn`: processa em fatias de até 1.000 destinatários. Filtra sintaxe, filtra domínio, consulta supressões via RPC `filter_suppressed_emails`, insere linhas leves (~0,5 KB por linha na `mailer_queue`).
     3. `activateCampaignServerFn`: confere contagem esperada = inserida, impõe guarda de bounce (obrigatória para > 1.000 destinatários), transiciona para `status = 'running'`.
   - Limpeza automática: drafts em `'preparing'` com mais de 30 minutos são cancelados com descarte das linhas.

8. **Etapa 8: Classificação de Erros, Circuit Breaker, Guarda de Bounce e Supressão no Envio (E5, E6, E10, E11, 4.6, 4.7)**
   - No `mailer-burst.ts`:
     - Classificação por `statusCode` e erro tipado (não por regex de mensagem).
     - Timeout de 12s por chamada ao provedor com AbortController nativo.
     - 429: divide lote por 2; ticks sem 429 recuperam +10 até o teto de 100.
     - Erros de configuração (401, 403, quota, domínio não verificado): pausar imediatamente sem consumir tentativas.
     - Erros ambíguos: até 2 retries imediatos com a MESMA idempotency key. Pausa após 3 ticks ambíguos seguidos.
   - Guarda de bounce: a cada 5 ticks (mínimo 200 enviados), chama `mailer_campaign_bounce_stats`. Se bounce permanente > 3% ou complaint > 0.05%, pausa a campanha automaticamente com alerta vermelho.
   - Rechecagem de supressão no tick: antes do envio, filtra itens recém-suprimidos via `filter_suppressed_emails` e cancela sem enviar.

9. **Etapa 9: Reconciliação Estrita e Destravamento Seguro (E2, E9)**
   - `reconcileStaleProcessingQueueItems`:
     - Usa apenas colunas existentes (`reserved_at`, `reservation_expires_at`).
     - Cruza estritamente `recipient_email` com `tags->>'campaign_id' = campaignId` e `provider_message_id`.
     - Atua apenas em reservas expiradas (rejeita `forceAll` em leases ativas).
     - Recupera para `pending` somente na ausência comprovada de aceite da Resend.
   - "Destravar seguro":
     - Só atua em campanhas `paused` ou `running` com lease expirada.
     - NUNCA reabre `failed`, `cancelled` ou `completed`.
     - Registra auditoria em `last_error`.

10. **Etapa 10: Webhook Otimizado (E17, 4.8) e Unsubscribe Assinado com RFC 8058 (E12)**
    - Em `resend-webhook.server.ts`:
      - Idempotente por `svix_id` / `provider_event_id` (duplicado retorna 200).
      - Limite de no máximo 3 queries por evento.
      - Tipagem de bounce: Permanent -> `permanent`, Transient/Undetermined -> `temporary_6m`.
    - Em `src/lib/email/unsubscribe-token.ts`:
      - Geração e validação de token HMAC-SHA256 (`email`, `campaignId`, expiração de 90 dias) com segredo `MAILER_UNSUBSCRIBE_SECRET`.
      - Se segredo configurado, injeta headers `List-Unsubscribe: <https://.../api/unsubscribe?token=...>` e `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
      - Se ausente, omite os headers e preserva link web normal sem quebrar o envio.
    - Em `src/server.ts`: rota POST `/api/unsubscribe` compatível com One-Click Unsubscribe (RFC 8058).

11. **Etapa 11: Interface do Mailer com Web Worker Inline e Modo Dry-Run (E6, 5, 6)**
    - Ticker em Web Worker criado via `Blob` inline (sem gerar novos entrypoints de bundler no Vite).
    - Fallback para `setTimeout` se Web Worker não estiver disponível.
    - `Screen Wake Lock` com guarda de compatibilidade.
    - `beforeunload` avisando o usuário se houver campanha orquestrada ativa.
    - Resumo pré-disparo: contagem de e-mails, excluídos por sintaxe, excluídos por MX, suprimidos, não verificados, taxa histórica de bounce.
    - Semáforo de bounce ao vivo na UI (verde < 2%, amarelo 2-3%, vermelho > 3%).
    - Modo DRY RUN: badge visual na UI, aciona `FakeMailProvider`, não polui logs reais e botão "Apagar ensaio".

12. **Etapa 12: Suíte de Testes Automatizados Completa (T1 a T17) e Validação de Build**
    - Implementar os 17 testes requeridos cobrindo todos os cenários (paridade, poison pill, simulação 5k/20k, falha no meio do batch, corrida de duas abas, 401/403, guarda de bounce, unsubscribe, schema check, enqueue fatiado, HMAC, webhook, recuperação de 429, destravar seguro, dry run, higiene de domínio).
    - Executar `bun run validate` (lint 0 erros / máx 14 warnings, typecheck 0 erros, testes 100% verdes, build de produção bem-sucedida).
    - Atualizar `CERNE.md` e registrar `TASK-109` em `BACKLOGER.md`.

---

### 4. Fora de Escopo e Decisões Pendentes (Conforme Seção 10)

- Migração para Amazon SES (mantido Resend ^6.31.0 com provedor isolado).
- Worker/cron de servidor como watchdog opcional.
- Cooldown por contato (evitar reenviar ao mesmo coach em X dias).
- Janela de envio por fuso horário do coach.
- Retenção e purga automática de logs antigos.
- Serviço pago de validação profunda de caixas postais (coberto nesta tarefa apenas sintaxe e DNS MX/A).
- Verificação externa de SPF, DKIM e DMARC do domínio remetente.

---

### 5. Procedimento de Rampa e Deploy (Instruções para o Usuário)

- **Passo 1:** Executar backfill de supressões no Supabase SQL Editor:
  ```sql
  -- (a) Conferência somente leitura
  select lower(trim(recipient_email)) as email, bool_or(event_type ilike '%complain%') as teve_reclamacao
  from email_events
  where (event_type ilike '%bounce%' or event_type ilike '%complain%') and recipient_email is not null
  group by 1;

  -- (b) Inserção idempotente
  insert into email_suppressions (email, reason, suppression_type, expires_at, created_at)
  select e.email, case when e.teve_reclamacao then 'resend_complaint' else 'resend_bounce' end, 'permanent', null, now()
  from (select lower(trim(recipient_email)) as email, bool_or(event_type ilike '%complain%') as teve_reclamacao
        from email_events
        where (event_type ilike '%bounce%' or event_type ilike '%complain%') and recipient_email is not null
        group by 1) e
  where not exists (select 1 from email_suppressions s where lower(trim(s.email)) = e.email);

  -- (c) Conferência
  select count(*) from email_suppressions;
  ```
- **Passo 2:** Rodar `verify-0028.sql` e aplicar a migration `0028` no Supabase SQL Editor.
- **Passo 3:** Deploy do código com `MAILER_RENDER_MODE=stored`.
- **Passo 4:** Verificação de smoke (login, logo, hero, favicon, preview).
- **Passo 5:** Ativar `MAILER_RENDER_MODE=snapshot` e executar dry-run de 5.000.
- **Passo 6 a 8:** Rampa controlada (3 testes próprios -> 200 filtrados -> 5.000 em horário comercial).

# Planejamento — Fila de Disparos Inteligente do Mailer

- **Data/Hora:** 2026-10-12 15:20 (Horário Local)
- **Autor/Executor:** Coding Engine (AI Studio / Senior Software Architect)
- **Solicitante:** Kauan (Usuário Humano)
- **Status:** `[CONCLUÍDO E APROVADO]` (Aprovação humana recebida em 2026-10-12 15:23)
- **Modalidade de Entrega:** Entrega Consolidada e Segura (Zero Partial Delivery)
- **Package Manager:** Bun 1.3.14 (exclusivo)
- **Migration:** `db/migrations/0024_mailer_queue_and_rate_limiting.sql`

---

## 1. Diagnóstico da Implementação Atual e Riscos Identificados

### 1.1. Diagnóstico do Fluxo Atual
Atualmente, o Mailer funciona com disparo monolítico e síncrono dentro da Server Function `sendMailerServerFn`:
1. **Seleção de Destinatários na UI (`src/routes/_authenticated/admin/mailer.tsx`)**: O usuário seleciona filtros e destinatários, configurando modo (`single`, `multi`, `catalog`).
2. **Envio Síncrono no Servidor (`src/lib/email/recruit-email.server.ts`)**: A função `sendMailerEmails` percorre todos os destinatários em lotes fixos de 100 via `resendClient.batch.send(chunk)` dentro da mesma requisição HTTP.
3. **Registro Posterior**: Os logs em `recruit_email_logs` e a campanha em `mailer_campaigns` são inseridos sequencialmente após a resposta da API do Resend.

### 1.2. Riscos Críticos Identificados
1. **Timeout Serverless da Vercel / Desconexão do Navegador:**
   - Requisições na Vercel possuem limites estritos de execução (10s no plano Hobby, 60s a 300s no Pro).
   - Se o usuário fechar a aba ou se a campanha possuir 151, 300 ou 1.000 destinatários, a requisição é cancelada no meio pela infraestrutura serverless, gerando perda silenciosa de disparos e deixando o sistema em estado inconsistente.
2. **Sobrecarga na API do Resend e Supabase (HTTP 429 Too Many Requests):**
   - Não há controle de cadência nem vazão distribuída.
   - Chamadas imediatas em lote sem espaçamento de tempo esgotam rapidamente o rate limit por segundo do Resend (2 req/s no free tier ou limites por credencial).
   - Ao receber HTTP 429, o código atual falha o lote imediatamente e marca os e-mails como `'failed'`, sem fila de espera ou retry com backoff.
3. **Falta de Controle de Concorrência Global:**
   - Se duas campanhas ou dois administradores dispararem simultaneamente, não existe controle coordenado para respeitar a cota global por conta do provedor.
4. **Ausência de Controle do Administrador:**
   - Uma vez iniciado o disparo, o usuário fica preso a um indicador de loading (`isSending`), sem possibilidade de acompanhar o lote atual, pausar, retomar ou cancelar com segurança.

---

## 2. Arquitetura Proposta: Fila Persistente e Controle de Vazão

A solução adota uma arquitetura em camadas orientada a eventos e persistida no Supabase, garantindo que o processamento ocorra no backend independentemente da sessão do usuário:

```text
[ Administrador no Painel /admin/mailer ]
                   │
                   ▼ (1. Validação & Criação de Campanha)
[ Supabase: public.mailer_campaigns (status: 'running'/'queued') ]
                   │
                   ▼ (2. Enfileiramento Atômico em Lote)
[ Supabase: public.mailer_queue (status: 'pending', idempotency_key) ]
                   │
    ┌──────────────┴────────────────────────┐
    ▼                                       ▼
[ Gatilho Imediato ]             [ Vercel Cron (* * * * *) ]
(ao criar/retomar campanha)      (/api/cron/process-mailer-queue)
    │                                       │
    └──────────────┬────────────────────────┘
                   ▼
     [ Mailer Queue Worker (Backend) ]
                   │
  1. Recuperação de locks abandonados (stale reservations)
  2. Verificação de pausa de 60s entre lotes & limite global
  3. Reserva atômica: claim_mailer_queue_batch (FOR UPDATE SKIP LOCKED)
  4. Disparo de até 150 e-mails com ~400ms de espaçamento / batches seguros
  5. Tratamento de HTTP 429 e Retry-After com backoff exponencial + jitter
  6. Atualização atômica para 'sent', 'retry' ou 'failed'
  7. Atualização do progresso da campanha em mailer_campaigns
                   │
                   ▼
[ Resend API ] ────► [ Confirmação messageId ] ────► [ recruit_email_logs ]
```

---

## 3. Modelo de Dados & Persistência (Migration 0024)

### 3.1. Evolução da Tabela `mailer_campaigns`
Adição de colunas para gerenciamento de estado e ciclo de vida:
- `status`: `'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'` (default `'queued'`)
- `total_recipients`: total de itens registrados na fila.
- `sent_count`: total de itens enviados com sucesso e aceitos pelo provedor.
- `failed_count`: total de falhas definitivas.
- `suppressed_count`: total de destinatários ignorados por descadastro.
- `current_batch`: número do lote em execução (1, 2, 3...).
- `total_batches`: total estimado de lotes (`ceil(total / batch_size)`).
- `batch_size`: tamanho máximo por lote (default `150`, configurável).
- `delay_between_batches_sec`: pausa obrigatória entre lotes (default `60`).
- `delay_between_items_ms`: espaçamento nominal entre tentativas (default `400`).
- `next_batch_at`: timestamp que define quando o próximo lote pode ser processado.
- `started_at`, `completed_at`, `paused_at`, `cancelled_at`.
- `last_error`: último erro registrado de nível de campanha.

### 3.2. Nova Tabela `mailer_queue`
Armazena individualmente cada envio com garantia estrita de unicidade:
- `id uuid primary key default gen_random_uuid()`
- `campaign_id uuid not null references public.mailer_campaigns(id) on delete cascade`
- `coach_id uuid references public.coaches(id) on delete set null`
- `recipient_email text not null`
- `recipient_name text not null`
- `university_name text`
- `email_type text not null check (email_type in ('athlete_teaser', 'athlete_teaser_multi', 'catalog_general'))`
- `subject text not null`
- `payload jsonb not null` (dados estruturados pré-validados para renderização e tags)
- `idempotency_key text not null unique` (hash sha256 de `${campaignId}:${recipientEmail}`)
- `status text not null check (status in ('pending', 'processing', 'sent', 'failed', 'retry', 'cancelled')) default 'pending'`
- `batch_number integer not null default 1`
- `attempts integer not null default 0`
- `max_attempts integer not null default 3`
- `reserved_by text` (identificador do worker / run)
- `reserved_at timestamptz`
- `reservation_expires_at timestamptz`
- `next_retry_at timestamptz`
- `provider_message_id text` (ID retornado pelo Resend após aceitação)
- `last_error text`
- `error_code text`
- `processed_at timestamptz`
- `created_at timestamptz not null default timezone('utc', now())`

**Índices Otimizados:**
- `idx_mailer_queue_campaign_status` em `(campaign_id, status)`
- `idx_mailer_queue_fetch` em `(status, next_retry_at, created_at)` para itens `pending` e `retry`
- `idx_mailer_queue_recovery` em `(status, reservation_expires_at)` para itens `processing`

### 3.3. Tabela de Controle de Taxa Global (`mailer_rate_limits`)
Garante que múltiplas campanhas compartilhem o teto global:
- `id text primary key default 'global_resend_limit'`
- `window_started_at timestamptz not null`
- `dispatches_in_window integer not null default 0`
- `max_dispatches_per_window integer not null default 150`
- `window_duration_seconds integer not null default 60`
- `last_batch_completed_at timestamptz`
- `pause_between_batches_seconds integer not null default 60`
- `locked_until timestamptz`
- `updated_at timestamptz not null`

### 3.4. Funções PostgreSQL Transacionais (RPC)
- `claim_mailer_queue_batch(p_worker_id text, p_batch_size integer, p_lock_duration_sec integer)`:
  Utiliza `SELECT id FROM public.mailer_queue ... FOR UPDATE SKIP LOCKED` para reservar atômica e simultaneamente até `p_batch_size` itens de campanhas com `status = 'running'`.
- `recover_stale_mailer_queue_reservations()`:
  Identifica itens em `processing` com reserva expirada (> 5 min) e os libera de volta para `retry` (se `attempts < max_attempts`) ou `failed`.

---

## 4. Controle de Disparos e Tolerância a Falhas

### 4.1. Regras do Lote e Pausa
1. **Lote Máximo:** até 150 e-mails por ciclo.
2. **Espaçamento:** distribuição nominal de ~400 ms entre disparos ou mini-batches de 10 a 50 com pausas controladas, sem estourar limites por segundo do Resend.
3. **Pausa Entre Lotes:** 60 segundos obrigatórios após a conclusão de cada lote de até 150 itens, registrado em `next_batch_at`.
4. **Lotes Menores:** campanhas com menos destinatários (ex: 10 ou 80) são processadas em lote único sem espera desnecessária.
5. **Multi-Lote:** campanhas com 151 destinatários geram lote 1 (150 itens), pausa de 60s, e lote 2 (1 item). Campanhas com 300 geram 2 lotes de 150 com 60s de intervalo. Campanhas com 1.000 geram 7 lotes.

### 4.2. Tratamento de Erros e HTTP 429
- **HTTP 429:** Respeita o cabeçalho `Retry-After`. Define `locked_until` no limite global e agenda os itens restantes para `status = 'retry'` com `next_retry_at = now() + retryAfter`.
- **Backoff Exponencial com Jitter:** para falhas temporárias de rede: `delay = Math.min(300, Math.pow(2, attempts) * 2 + Math.random() * 2)`.
- **Tentativas Máximas:** configurável (padrão 3 tentativas). Excedendo 3 tentativas, o item é marcado como `failed`.
- **Diferenciação Estrita:** `sent` é marcado apenas quando o Resend confirma a aceitação e retorna o `id` da mensagem. A entrega efetiva ao coach continuará sendo rastreada pelos webhooks do Resend em `email_events`.

---

## 5. Estratégia de Execução sem Bloqueio Serverless

Para garantir funcionamento 100% autônomo e sem dependência do navegador aberto:
1. **Vercel Cron (`vercel.json`):**
   ```json
   "crons": [
     {
       "path": "/api/cron/process-mailer-queue",
       "schedule": "* * * * *"
     }
   ]
   ```
2. **Processamento Inicial Instantâneo:** Ao iniciar a campanha, a Server Function invoca o worker imediatamente para despachar o primeiro lote sem esperar 1 minuto.
3. **Execução Fracionada:** Cada invocação do worker processa estritamente o lote atual (máximo 150 envios ou fatia segura) em tempo muito inferior ao timeout serverless, atualiza o status da campanha com `next_batch_at = now() + 60s` e finaliza. No tick seguinte do cron, o próximo lote é processado.
4. **Resiliência a Fechamento de Aba:** Se o administrador fechar a janela, o cron continua a execução dos lotes pendentes até a conclusão da campanha.

---

## 6. Interface do Mailer e Monitoramento em Tempo Real

A tela `/admin/mailer` será atualizada em conformidade com o `UI&UX.md`:
1. **Painel de Monitoramento da Campanha Ativa:**
   - Card estilo *Dark Glass Panel* (`.glass-dark`) com bordas esmeralda e dourada.
   - **Indicadores Principais:** Total de Destinatários, Enviados (`sent`), Pendentes (`pending`), Falhas (`failed`), Lote Atual / Total de Lotes.
   - **Barra de Progresso:** Percentual visual em gradiente esmeralda (`bg-primary`).
   - **Estado em Tempo Real:** Badges dinâmicas (`QUEUED`, `SENDING`, `WAITING (Cooldown)`, `PAUSED`, `COMPLETED`, `CANCELLED`, `ERROR`).
   - **Tempo Estimado:** Cálculo baseado nos lotes restantes e pausas de 60s.
2. **Controles de Campanha:**
   - Botão **Pause** (pausa novos disparos mantendo histórico).
   - Botão **Resume** (retoma a partir do item pendente).
   - Botão **Cancel** (cancela pendentes com confirmação e preserva os já enviados).
3. **Polling Otimizado:** Atualização a cada 3s durante campanhas ativas, pausando quando concluída ou inativa.

---

## 7. Plano de Implementação e Arquivos Envolvidos

1. **`db/migrations/0024_mailer_queue_and_rate_limiting.sql`**:
   - Criação de `mailer_queue`, `mailer_rate_limits`, evolução de `mailer_campaigns`, índices e RPCs atômicas com RLS.
2. **`src/types/db.ts`**:
   - Definição dos tipos TypeScript para `MailerQueueItem`, `MailerCampaignStatus`, `MailerRateLimit` e payloads de fila.
3. **`src/lib/email/mailer-queue.server.ts`**:
   - Módulo central do motor de fila:
     - `enqueueCampaignDispatches`: validação, sanitização e inserção em lote na fila.
     - `processMailerQueue`: reserva atômica de lote, verificação de taxa global, envio com espaçamento, tratamento de HTTP 429 e atualização de status.
     - `pauseCampaign`, `resumeCampaign`, `cancelCampaign`, `getCampaignQueueProgress`.
4. **`src/lib/email/recruit-email.functions.ts`**:
   - Novas Server Functions:
     - `enqueueMailerCampaignServerFn`
     - `pauseMailerCampaignServerFn`
     - `resumeMailerCampaignServerFn`
     - `cancelMailerCampaignServerFn`
     - `getCampaignStatusServerFn`
     - `triggerQueueWorkerServerFn`
5. **`src/server.ts`**:
   - Suporte ao endpoint `/api/cron/process-mailer-queue` e `/api/mailer/process-queue` para Vercel Cron e requisições autenticadas.
6. **`vercel.json`**:
   - Inclusão da entrada `crons` a cada 1 minuto (`* * * * *`).
7. **`src/routes/_authenticated/admin/mailer.tsx`**:
   - Atualização do fluxo de envio para enfileiramento inteligente.
   - Componente visual de Live Campaign Monitor com barras de progresso, métricas e botões de ação (Pausar, Retomar, Cancelar).
8. **`src/lib/email/mailer-queue.test.ts`**:
   - Testes unitários com simulação de 10, 150, 151, 300 e 1.000 destinatários, concorrência, rate limiting HTTP 429, retry com backoff e cancelamento de campanha.
9. **`CERNE.md` & `BACKLOGER.md`**:
   - Atualização viva da documentação do sistema e registro da tarefa `TASK-091`.

---

## 8. Verificação e Critérios de Aceite

1. `bun run typecheck` com 0 erros.
2. `bun run lint` com 0 erros.
3. `bun run test` (todos os testes passando, incluindo os novos cenários de fila).
4. `bun run validate` (build e testes 100% aprovados).
5. Nenhuma alteração manual em `bun.lock` divergente.

---

## 9. Status da Aprovação Humana

- **Status:** `[PLANO REGISTRADO — AGUARDANDO APROVAÇÃO HUMANA EXPLÍCITA]`
- Nenhum arquivo de código foi alterado. Por favor, revise o diagnóstico e a arquitetura proposta e forneça sua aprovação explícita para iniciarmos a implementação!

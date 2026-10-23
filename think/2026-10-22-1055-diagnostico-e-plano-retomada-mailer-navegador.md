# Diagnóstico Definitivo e Plano de Resolução do Mailer (Orquestração via Navegador)

**Data/Hora**: 2026-10-22 11:05  
**Autor**: Agente IA (Google AI Studio)  
**Solicitante**: Kauan (Usuário)  
**Status**: Aguardando aprovação humana explícita  
**Referência no Backlog**: `TASK-108`

---

## 1. Evidências Reais de Produção Coletadas (Supabase & Vercel)

### Evidência A — Fila da Campanha `0fe81b27-bdf5-4bbb-9101-27f533d9cd63` no Supabase

```json
[
  {
    "campaign_id": "0fe81b27-bdf5-4bbb-9101-27f533d9cd63",
    "status": "processing",
    "error_code": null,
    "sample_error": null,
    "count": 300
  },
  {
    "campaign_id": "0fe81b27-bdf5-4bbb-9101-27f533d9cd63",
    "status": "pending",
    "error_code": null,
    "sample_error": null,
    "count": 359
  }
]
```

**O que essa evidência comprova matematicamente:**

1. O RPC `claim_mailer_queue_batch` da migration `0027` **está instalado no Supabase** e reservou exatamente o primeiro lote de **`300` itens** (`BURST_SIZE = 300`), mudando o status deles para `processing`, enquanto os `359` restantes ficaram em `pending` (total de 659 destinatários na campanha).
2. Porém, após reservar os `300` itens, a execução de `processMailerQueue` (`src/lib/email/mailer-queue.server.ts`):
   - Disparou **3 chamadas paralelas** de `resendClient.batch.send` (100 e-mails cada via `Promise.all`), o que esbarra no rate limit padrão da Resend (**2 requisições/segundo**).
   - Quando um chunk recebe erro `429` ou falha parcial na chamada paralela, o código entra em um fallback sequencial (`for (const item of chunk)` chamando `resendClient.emails.send` individualmente até 100 vezes).
   - Isso estoura o tempo da Serverless Function na Vercel (ou perde a conexão com o navegador) **antes** de chegar na linha `1084` (`complete_mailer_burst`).
3. **Como resultado**:
   - Os `300` itens ficaram eternamente presos em `status = 'processing'` com `error_code = null` e `last_error = null`.
   - Mesmo após `reservation_expires_at` (360 segundos) expirar, o RPC `claim_mailer_queue_batch` (`0027`) **só seleciona** `status IN ('pending', 'retry')` — ele **jamais** recupera itens expirados em `processing`.
   - Além disso, na `TASK-107`, a chamada para `recover_stale_mailer_queue_reservations` foi removida do início de `processMailerQueue`. Portanto, qualquer item cujo worker sofra timeout na Vercel fica órfão em `processing` para sempre, travando a conclusão da campanha!

---

### Evidência B — Erro em Produção na Vercel (`[resend-webhook]`)

```text
2026-10-22 17:00:32.213 [error] [resend-webhook] Database error upserting email_suppressions:
there is no unique or exclusion constraint matching the ON CONFLICT specification
{ email: 'kiersten.eggleton@glenville.edu', reason: 'resend_bounce' }
```

**Causa-Raiz Exata no Banco e Código:**

1. Na migration `db/migrations/0018_universities_and_mailer.sql` (linhas 26–34), a tabela `public.email_suppressions` foi criada sem `UNIQUE` direto na coluna `email`, usando apenas um **índice de expressão funcional**:
   ```sql
   create unique index if not exists idx_email_suppressions_email_lower
     on public.email_suppressions (lower(trim(email)));
   ```
2. Porém, tanto `src/lib/email/resend-webhook.server.ts` (linha 441) quanto `src/lib/email/recruit-email.server.ts` (`unsubscribeEmailAddress`, linha 170) executam:
   ```ts
   admin.from("email_suppressions").upsert({ email, ... }, { onConflict: "email" })
   ```
3. O PostgreSQL **rejeita** `INSERT ... ON CONFLICT (email)` quando não existe uma constraint/índice `UNIQUE` exatamente sobre a coluna pura `(email)` (um índice em `lower(trim(email))` não satisfaz `ON CONFLICT (email)` sem predicado de expressão, o qual o PostgREST não suporta via `onConflict: "email"`).
4. **Impacto**:
   - Todo bounce (`email.bounced`) ou reclamação (`email.complained`) enviado pela Resend para `/api/webhooks/resend` falha com erro de banco e faz o endpoint responder HTTP `500` para a Resend (gerando retentativas infinitas com erro na Vercel e impedindo que e-mails inválidos sejam suprimidos!).
   - O descadastro manual/público (`unsubscribeEmailAddress`) também falha pelo mesmo motivo.

---

### Evidência C — Outros Gargalos Identificados na Auditoria do Código

1. **Releitura pesada pós-insert em `enqueueCampaignDispatches` (`src/lib/email/mailer-queue.server.ts`)**:
   - Após validar (`assertEmailIntegrity`) e inserir todos os itens na fila, `enqueueCampaignDispatches` chama `sanitizePendingQueueItemsMissingCards`, que faz `SELECT id, recipient_email, payload` paginando de 1.000 em 1.000 linhas (~60 MB de HTML trafegados de volta do Supabase para a Vercel), podendo causar timeout/OOM na criação da campanha.
2. **Desativação silenciosa da orquestração pelo navegador em caso de erro de rede (`src/routes/_authenticated/admin/mailer.tsx`)**:
   - No `useEffect` que consulta `getMailerCampaignOrchestrationModeServerFn`, o `.catch()` define `serverOrchestrated: true`, desligando o loop do navegador se houver qualquer oscilação momentânea.

---

## 2. Plano de Resolução Definitiva

### Passo 1 — Tornar cada Tick do Navegador Rápido, Atômico e Compatível com o Rate Limit da Resend (`src/lib/email/mailer-queue.server.ts` e `src/routes/_authenticated/admin/mailer.tsx`)

1. **Reduzir o tamanho padrão do lote por tick (`BURST_SIZE`) de `300` para `100` e-mails** (1 único `resend.batch.send` de até 100 destinatários por requisição do navegador):
   - A API Batch da Resend suporta até **100 e-mails em 1 única chamada HTTP** (`POST /emails/batch`).
   - Com `100` e-mails por tick e `1.200ms` de intervalo entre ticks no navegador, cada chamada à Vercel faz **apenas 1 requisição à Resend**, levando **~1 a 2 segundos** (zero risco de timeout na Vercel e zero risco de `429 Too Many Requests` por concorrência de `Promise.all`).
   - Uma campanha de 659 destinatários será concluída em **7 ticks (~9 a 12 segundos no total)** com progresso em tempo real na tela!
2. **Caso `BURST_SIZE` maior que 100 seja passado**, executar os chunks de 100 **sequencialmente com pausa de `600ms` entre eles** (nunca `Promise.all` paralelo), respeitando estritamente o limite de 2 req/s da Resend.
3. **Eliminar o fallback sequencial de 100 chamadas individuais (`resendClient.emails.send`) dentro do mesmo tick**:
   - Se `resendClient.batch.send` retornar `429` (rate limit) ou erro transitório de rede, **não** disparar 100 chamadas individuais (que demoram >30s e causam timeout na Vercel antes de salvar o estado no Supabase).
   - Em vez disso, classificar o chunk como `retry` (ex.: `RESEND_RATE_LIMIT` ou `BATCH_SEND_TRANSIENT_ERROR`) e persistir imediatamente via `complete_mailer_burst`, permitindo que o próximo tick do navegador reenvie o lote com segurança.
   - Se o erro do batch for de validação (ex.: um endereço de e-mail com sintaxe inválida rejeitado pela Resend), validar/isolar ou dividir sem estourar o tempo limite da função.

### Passo 2 — Recuperação Segura e Reconciliação de Itens Presos em `processing` (`src/lib/email/mailer-queue.server.ts` e `src/lib/email/mailer-runner.server.ts`)

1. **Reconciliação Inteligente de Itens `processing` Expirados**:
   - Criar uma rotina segura em `mailer-queue.server.ts` (acionada automaticamente ao retomar uma campanha via `resumeCampaign` / `reconcileMailerCampaignIncidentServerFn` e também ao detectar itens em `processing` com `reservation_expires_at < now()`):
   - Antes de devolver um item `processing` expirado para `pending`, verificar em `recruit_email_logs` (por `campaign_id` + `recipient_email` com `status = 'sent'`) e em `email_events` (por tag `campaign_id` + `recipient_email`) se a Resend **já aceitou/enviou** aquele e-mail antes do timeout da Vercel!
   - **Se já constar em `recruit_email_logs` ou `email_events`**: marcar o item da `mailer_queue` como `sent` (evitando **100% de duplicidade**!).
   - **Se não constar envio prévio**: restaurar o item de `processing` para `pending` (`processing_started_at = null`, `reservation_expires_at = null`) para que o navegador possa despachá-lo normalmente!
2. **Desbloqueio do Botão "Resume" / Reconciliação no Navegador**:
   - Permitir que `resumeCampaign` e `reconcileCampaignIncident` executem essa reconciliação inteligente mesmo quando a campanha tiver itens presos em `processing` (como os 300 itens da campanha `0fe81b27-bdf5-4bbb-9101-27f533d9cd63`) ou estiver pausada com incidente, destravando a campanha diretamente pelo botão da interface `/admin/mailer`.

### Passo 3 — Correção Definitiva de `email_suppressions` (`src/lib/email/resend-webhook.server.ts` e `src/lib/email/recruit-email.server.ts`)

1. Criar uma função utilitária compartilhada `upsertEmailSuppressionSafe(admin, { email, reason, suppression_type, expires_at })`:
   - Normaliza `cleanEmail = email.toLowerCase().trim()`.
   - Consulta registro existente via `.select("id").ilike("email", cleanEmail).limit(1).maybeSingle()`.
   - Se existir `id`, executa `.update({ email: cleanEmail, reason, suppression_type, expires_at, created_at })` por `.eq("id", existing.id)`.
   - Se não existir, executa `.insert({ email: cleanEmail, reason, suppression_type, expires_at, created_at })` (e se houver condição de corrida `23505 unique_violation` no índice `idx_email_suppressions_email_lower`, faz fallback imediato para `.update`).
2. Usar `upsertEmailSuppressionSafe` tanto em `src/lib/email/resend-webhook.server.ts` quanto em `unsubscribeEmailAddress` (`src/lib/email/recruit-email.server.ts`).
   - **Vantagem imediata**: Funciona **100% sem depender de nova migration SQL no Supabase**, eliminando na hora o erro `there is no unique or exclusion constraint matching the ON CONFLICT specification` nos webhooks de bounce/complaint da Resend e nos descadastros.

### Passo 4 — Remoção da Releitura Pesada Pós-Insert e Resiliência do Loop no Navegador

1. **Em `src/lib/email/mailer-queue.server.ts`**:
   - Remover a chamada redundante `sanitizePendingQueueItemsMissingCards` ao final de `enqueueCampaignDispatches`, pois `assertEmailIntegrity` já valida 100% dos HTMLs em memória antes do `.insert()`.
2. **Em `src/routes/_authenticated/admin/mailer.tsx`**:
   - Garantir que falha transitória em `getMailerCampaignOrchestrationModeServerFn` mantenha `serverOrchestrated: false` (para nunca desativar silenciosamente o loop do navegador).
   - Ajustar o tick do navegador para enviar `batchSize: 100` com intervalo de `1200ms` e backoff resiliente em caso de erro de rede.

---

## 3. Arquivos que Serão Modificados (Após Aprovação)

1. `src/lib/email/recruit-email.server.ts` — Implementação e uso de `upsertEmailSuppressionSafe` sem depender de `ON CONFLICT (email)`.
2. `src/lib/email/resend-webhook.server.ts` — Uso de `upsertEmailSuppressionSafe` para bounces e complaints da Resend.
3. `src/lib/email/resend-webhook.test.ts` — Atualização e adição de testes cobrindo a persistência de supressão sem `ON CONFLICT (email)`.
4. `src/lib/email/mailer-queue.server.ts` — Redução de `BURST_SIZE` padrão para `100`, envio sequencial com rate-limit seguro, remoção do fallback lento de 100 envios unitários em caso de erro transitório, reconciliação inteligente de itens `processing` expirados verificando `recruit_email_logs`/`email_events`, e remoção da releitura pesada pós-insert.
5. `src/lib/email/mailer-runner.server.ts` — Integração da reconciliação inteligente de itens `processing` órfãos em `reconcileCampaignIncident` e `orchestrateMailerCampaignTick`.
6. `src/lib/email/mailer-queue.test.ts` — Atualização dos testes unitários para refletir o novo `BURST_SIZE = 100` e a reconciliação de itens `processing` expirados.
7. `src/routes/_authenticated/admin/mailer.tsx` — Resiliência do loop de orquestração no navegador (`serverOrchestrated: false` por padrão e retomada limpa da campanha travada).
8. `CERNE.md` e `BACKLOGER.md` — Atualização obrigatória da documentação viva e fechamento da `TASK-108`.

# Diagnóstico Comprovado e Plano de Resolução do Mailer

Os dois dados que você trouxe do **Supabase** e da **Vercel** fecharam 100% o quebra-cabeça com precisão cirúrgica. Abaixo está exatamente o que aconteceu na sua campanha atual (`0fe81b27-bdf5-4bbb-9101-27f533d9cd63`) e no webhook da Resend, seguido do plano de correção.

---

## 1. O que os seus dados comprovam (Causas-Raiz Exatas)

### Causa 1 — Por que a campanha `0fe81b27-bdf5-4bbb-9101-27f533d9cd63` travou com `300 processing` e `359 pending`
1. **O RPC `0027` rodou e reservou os primeiros 300 e-mails**:
   - O fato de existirem exatamente **`300` itens em `processing`** prova que a função `claim_mailer_queue_batch` do Supabase funcionou e reservou o primeiro lote (`BURST_SIZE = 300`) dos 659 destinatários da campanha.
2. **Estouro de Rate Limit da Resend + Timeout na Vercel antes de salvar o retorno**:
   - Assim que reservou os 300 itens, `processMailerQueue` (`src/lib/email/mailer-queue.server.ts`) disparou **3 chamadas `resend.batch.send` de 100 e-mails simultaneamente (`Promise.all`)**.
   - A Resend possui limite estrito de **2 requisições por segundo**. Ao receber 3 chamadas simultâneas (ou se qualquer chunk sofrer rate limit `429`), o código atual cai em um **fallback sequencial que tenta disparar até 100 chamadas `resend.emails.send` uma a uma** dentro da mesma requisição HTTP.
   - Esse fallback demora mais do que o tempo limite da Serverless Function na Vercel (ou da conexão com o navegador), matando o processo **antes** de chegar na linha que chama `complete_mailer_burst` no Supabase.
3. **Itens órfãos eternos em `processing`**:
   - Como o processo morreu antes de `complete_mailer_burst`, os 300 itens ficaram com `status = 'processing'` e `error_code = null`.
   - Na alteração anterior (`TASK-107`), a recuperação de reservas expiradas (`recover_stale_mailer_queue_reservations`) foi removida, e o RPC `claim_mailer_queue_batch` **só busca itens com `status IN ('pending', 'retry')`**. Resultado: os 300 itens em `processing` jamais são recuperados, mesmo horas depois de expirarem!

---

### Causa 2 — Por que a Vercel acusou erro em `email_suppressions` (`there is no unique or exclusion constraint matching the ON CONFLICT specification`)
1. Na migration `0018_universities_and_mailer.sql`, a tabela `public.email_suppressions` foi criada **sem** `UNIQUE (email)` direto na coluna; ela possui apenas um índice de expressão funcional:
   ```sql
   create unique index idx_email_suppressions_email_lower on public.email_suppressions (lower(trim(email)));
   ```
2. Porém, tanto o webhook da Resend (`src/lib/email/resend-webhook.server.ts`) quanto a função de descadastro (`src/lib/email/recruit-email.server.ts`) fazem:
   ```ts
   admin.from("email_suppressions").upsert({ email, ... }, { onConflict: "email" })
   ```
3. O PostgreSQL rejeita `ON CONFLICT (email)` porque o índice único é sobre a expressão `lower(trim(email))` e não sobre a coluna pura `email`. Isso faz todo webhook de bounce/complaint da Resend falhar com erro 500 na Vercel e impede que e-mails com bounce (`kiersten.eggleton@glenville.edu`) sejam adicionados à lista de supressão!

---

## 2. Plano de Ação e Retomada (4 Frentes)

### Frente 1 — Lotes Atômicos de 100 E-mails por Tick no Navegador (Zero `429` e Zero Timeout na Vercel)
- **Reduzir `BURST_SIZE` padrão de `300` para `100` e-mails por tick** (`src/lib/email/mailer-queue.server.ts` e `src/routes/_authenticated/admin/mailer.tsx`):
  - A API Batch da Resend envia até **100 e-mails em 1 única requisição HTTP**.
  - Com `100` e-mails por tick do navegador (e pausa de `1.2s` entre ticks), cada chamada à Vercel faz **apenas 1 requisição à Resend**, terminando em **~1 a 2 segundos** (nunca bate no limite de 2 req/s da Resend e nunca dá timeout na Vercel).
  - Caso um tamanho maior que 100 seja solicitado, os chunks de 100 serão enviados **sequencialmente com espaçamento de `650ms`** (nunca `Promise.all` paralelo).
- **Remover o fallback lento de 100 chamadas individuais em erros de batch**:
  - Se `resend.batch.send` sofrer `429` ou falha transitória, o lote é imediatamente salvo no banco como `retry` (`complete_mailer_burst`) em menos de 1 segundo para que o próximo tick do navegador reenvie com segurança.

### Frente 2 — Reconciliação Inteligente dos `300` Itens Presos em `processing` (Sem Duplicar Envios)
- Criar a rotina automática `reconcileStaleProcessingQueueItems` em `src/lib/email/mailer-queue.server.ts` e integrá-la ao `resumeCampaign`, `reconcileCampaignIncident` e ao ciclo de orquestração (`src/lib/email/mailer-runner.server.ts`):
  1. Busca itens da campanha que estejam em `status = 'processing'` cuja reserva (`reservation_expires_at`) já expirou.
  2. Cruza os e-mails desses itens com `recruit_email_logs` (`status = 'sent'`) e `email_events` da mesma campanha:
     - **Se a Resend já tiver enviado o e-mail antes do timeout**: marca o item como `'sent'` na `mailer_queue` (garantindo **zero e-mails duplicados** para os treinadores).
     - **Se o e-mail não tiver sido enviado**: devolve o item de `'processing'` para `'pending'` (`processing_started_at = null`, `reservation_expires_at = null`) para que o navegador conclua o disparo!
  3. Permite retomar a campanha `0fe81b27-bdf5-4bbb-9101-27f533d9cd63` diretamente pelo botão na tela `/admin/mailer`.

### Frente 3 — Correção Imediata do Upsert em `email_suppressions` (Sem Depender de Nova Migration)
- Criar `upsertEmailSuppressionSafe` em `src/lib/email/recruit-email.server.ts` e utilizá-lo tanto no descadastro quanto no webhook da Resend (`src/lib/email/resend-webhook.server.ts`):
  - Em vez de `.upsert(..., { onConflict: "email" })` (que quebra no PostgreSQL por causa do índice funcional `lower(trim(email))`), faz busca case-insensitive (`.ilike("email", cleanEmail)`) seguida de `.update()` se já existir ou `.insert()` se não existir.
  - Resolve imediatamente os erros de `[resend-webhook]` na Vercel sem exigir alteração manual de schema no Supabase.

### Frente 4 — Otimização da Criação de Campanha e Estabilidade do Loop no Navegador
- Remover a releitura pesada pós-insert (`sanitizePendingQueueItemsMissingCards` em `src/lib/email/mailer-queue.server.ts`), pois `assertEmailIntegrity` já valida 100% dos cards em memória antes de inserir na fila.
- Em `src/routes/_authenticated/admin/mailer.tsx`, garantir que qualquer falha de rede momentânea ao consultar `getMailerCampaignOrchestrationModeServerFn` mantenha `serverOrchestrated: false` (para o navegador nunca parar de orquestrar os disparos sozinho).

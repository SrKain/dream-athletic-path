# Plano de Implementação — TASK-109: Mailer Sem Travas (5.000+ Destinatários com Build Intacta)

Este plano detalha a resolução das 18 causas de instabilidade e a execução integral dos critérios da **TASK-109**, sem alterar `package.json` nem `bun.lock`, mantendo build, lint, typecheck e vitest 100% íntegros.

---

## 1. Linha de Base Medida no Repositório

- **Testes (Vitest):** 36 arquivos, 300 testes. 298 aprovados e exatamente 2 falhas conhecidas em `src/lib/email/resend-email.test.ts` decorrentes da substituição do `upsert({ onConflict: 'email' })` por `upsertEmailSuppressionSafe()`. Serão corrigidos no Passo 1 da entrega para validar o contrato real.
- **Funções Vercel:** `vercel.json` não especifica `maxDuration`. O teto padrão é 15 segundos. Orçamento de tick estabelecido em p95 <= 3s, teto máximo de 10s.
- **SDK Resend (`resend ^6.31.0`):** Inspecionado `node_modules/resend/dist/index.d.mts`. Suporte nativo a `batchValidation: 'permissive'` com `{ data: { id: string }[], errors: { index: number, message: string }[] }`. Fallback de envios individuais e adiamento serão totalmente removidos.
- **Auditoria de Índices (0024):** Confirmado que `idx_mailer_queue_idempotency` é redundante com a constraint `UNIQUE(idempotency_key)`. O índice será documentado e preservado sem DROP.
- **Inspeção de Bounces:** Tipos Resend `Permanent` vs `Transient`/`Undetermined` serão mapeados respectivamente para `permanent` e `temporary_6m` em `email_suppressions`.

---

## 2. Componentes e Arquivos a Serem Criados / Alterados

1. **Testes de Regressão e Mocks:**
   - `src/lib/email/resend-email.test.ts`: atualizar os 2 testes falhos para o contrato real de `upsertEmailSuppressionSafe`.
   - `src/lib/email/recruit-email.server.ts`: remover ramos artificiais `typeof x === 'function'`.
   - `src/lib/email/schema-integrity.test.ts`: teste T9 validando queries contra migrations 0001 a 0028.
2. **Migration 0028 e Verificação SQL:**
   - `db/migrations/0028_mailer_high_volume_snapshot_and_bounce_guard.sql`:
     - Tabela `mailer_campaign_snapshots` (RLS agency admin + service_role).
     - Tabela `mailer_domain_checks` (cache DNS MX/A de 30 dias).
     - RPC `filter_suppressed_emails(p_emails text[])`.
     - RPC `mailer_campaign_bounce_stats(p_campaign_id uuid)`.
     - Atualização de `complete_mailer_burst`: parâmetro `p_dry_run`, pausa mínima de 250ms, reembolso de tentativas para 429/pause/config/ambiguous, strip de `html`/`text` do payload após envio.
     - `mailer_burst_ready()` real verificando tabelas e colunas no `information_schema`.
     - Índices de performance na fila e em `email_events`.
   - `db/migrations/verify-0028.sql`: verificação somente leitura.
3. **Abstração do Provedor (`mail-provider.server.ts`):**
   - Interface `MailProvider` com `sendBatch()`.
   - `ResendMailProvider` com `batchValidation: 'permissive'`.
   - `FakeMailProvider` para ensaio dry-run (IDs `dry_<uuid>`, 0 chamadas externas, sem inicializar Resend).
4. **Higiene de Sintaxe e Domínio:**
   - `src/lib/email/email-syntax.ts`: `isDeliverableEmailSyntax` (validação rigorosa de sintaxe, sem regex frágil).
   - `src/lib/email/domain-hygiene.server.ts`: verificação assíncrona de MX (fallback para A) via `node:dns/promises` com concorrência 20, timeout de 3s e cache de 30 dias.
   - Aplicação no enqueue, no importador de universidades/coaches e no formulário.
5. **Snapshots e Render no Envio:**
   - `src/lib/email/mailer-snapshot.ts`: empacota dados estáticos da campanha (~0,5 KB por linha na fila).
   - Teste de paridade golden file (T1) garantindo paridade de renderização HTML byte a byte.
   - Enqueue em 3 fases (`createCampaignDraft`, `appendCampaignRecipients` em fatias de 1.000, `activateCampaign`).
6. **Controle de Resiliência e Fila:**
   - `src/lib/email/mailer-burst.ts`: classificação de erros por status code, circuit breaker para 401/403/quota, recuperação progressiva do burst (+10 por tick sem 429).
   - `src/lib/email/mailer-queue.server.ts`: rechecagem de supressão pré-envio, guarda de bounce a cada 5 ticks, reconciliação estrita somente para reservas expiradas.
7. **Unsubscribe One-Click (RFC 8058):**
   - `src/lib/email/unsubscribe-token.ts`: token assinado HMAC-SHA256 (`MAILER_UNSUBSCRIBE_SECRET`).
   - `src/server.ts`: endpoint POST `/api/unsubscribe` compatível com leitores de e-mail.
8. **Interface do Mailer (`src/routes/_authenticated/admin/mailer.tsx`):**
   - Ticker orquestrador desacoplado em Web Worker via `Blob` inline (sem novos entrypoints no bundler) com fallback para timer.
   - Screen Wake Lock e `beforeunload` durante orquestração ativa.
   - Resumo pré-disparo detalhado (destinatários totais, excluídos por sintaxe, excluídos por MX, suprimidos, não verificados).
   - Semáforo ao vivo de taxa de bounce com bloqueio preventivo acima de 3%.
   - Modo DRY RUN com badge e ações isoladas.

---

## 3. Critérios de Verificação da Entrega

1. **Paridade e Segurança:** Golden test T1 aprovado byte a byte; 0 e-mails enviados em modo dry-run; client Resend nunca instanciado no ensaio.
2. **Resiliência a Lotes de Volume:** Simulações de 5.000 e 20.000 itens com erros de rede e taxa de falhas passando com 100% dos válidos enviados uma única vez.
3. **Qualidade do Código:** Lint com 0 erros e no máximo 14 warnings (preexistentes), typecheck com 0 erros, vitest 100% verde (mais de 300 testes), compilação do applet aprovada.
4. **Governança:** `package.json` e `bun.lock` inalterados. Documentação viva `CERNE.md` atualizada e `TASK-109` registrada no `BACKLOGER.md`.

# Migração Completa da Infraestrutura de E-mail: Amazon SES → Resend

**Data:** 2026-10-01
**Autor:** Antigravity AI / Gemini Coding Agent
**Status:** [PLANEJAMENTO CONCLUÍDO & EM EXECUÇÃO]

---

## 1. Contexto e Objetivo

O sistema `dream-athletic-path` (Go Team Go / Sport Scout Hub) utilizava anteriormente o Amazon SES (Simple Email Service v2 via `@aws-sdk/client-sesv2`) para disparos de e-mails transacionais, celebrações de avanço de etapa e campanhas do Mailer para treinadores universitários.

O objetivo desta migração é realizar uma transição **completa, arquitetural e definitiva** para o **Resend** como **único provedor oficial de disparo de e-mails**, eliminando 100% da dependência operacional da AWS/SES, simplificando as variáveis de ambiente, aumentando a resiliência e integrando o SDK oficial `resend` com recursos modernos como Batch API, webhooks com validação de assinatura e mapeamento seguro de logs no Supabase (`email_log`, `recruit_email_logs`, `email_suppressions`).

---

## 2. Arquitetura Proposta

```text
                    ┌───────────────────────────────┐
                    │     dream-athletic-path       │
                    │   (TanStack Start / Server)   │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │    Serviço Central de E-mail  │
                    │   src/lib/email/resend-client │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │          RESEND SDK           │
                    │      (emails.send, batch)     │
                    └───────────────┬───────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   Transactional            Stage Advancement            Recruiting Mailer
   (Convites, Docs,        (Celebrações com            (Single, Multi-Athlete,
   Recuperação)             Janela de Envio)            Catalog + Batch API)
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │     Resend Webhooks Server    │
                    │  /api/webhooks/resend (Svix)  │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │       Supabase Storage        │
                    │  - email_log                  │
                    │  - recruit_email_logs         │
                    │  - email_suppressions         │
                    └───────────────────────────────┘
```

---

## 3. Escopo e Arquivos Afetados

### 3.1 Criação de Novos Módulos
1. `src/lib/email/resend-client.server.ts`:
   - Singleton seguro do cliente `Resend` instanciado com `RESEND_API_KEY`.
   - `getResendConfig()` lendo `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`.
   - Isolamento estrito server-side (sem vazamento de chaves para o browser).
   - Função `resetResendClientCache()` para testes unitários.
2. `src/lib/email/resend-webhook.server.ts`:
   - Processador de eventos de webhooks do Resend (`email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`).
   - Verificação de assinatura criptográfica (Svix headers: `svix-id`, `svix-timestamp`, `svix-signature`) quando `RESEND_WEBHOOK_SECRET` estiver configurado.
   - Sincronização automática com a tabela `email_suppressions` para bounces e complaints (com motivo `resend_bounce` ou `resend_complaint`).
3. `src/lib/email/resend-email.test.ts`:
   - Suite completa de testes unitários cobrindo: configuração, ausência de chave, envios unitários, envio em lote (Batch API), agendamento/scheduler e processamento de webhooks.

### 3.2 Migração de Módulos Existentes
1. `src/lib/email/email.server.ts`:
   - Substituição de `SendEmailCommand` da AWS pelo `resend.emails.send()`.
   - Manutenção do contrato de `sendEmail({ template, to, data, respectSendingWindow })`.
   - Suporte a agendamento inteligente via janela comercial (`sending-window`) e fila interna `email_log` (`scheduled_for`), além de compatibilidade com `scheduledAt` do Resend.
   - Atualização de `processScheduledEmails()` para envio via Resend.
   - Persistência do ID retornado pelo Resend (`data.id`) na coluna `provider_id`.
2. `src/lib/email/recruit-email.server.ts`:
   - Migração dos 3 modos do Mailer (`single_athlete`, `multi_athlete`, `catalog`) para o Resend.
   - Utilização de `resend.batch.send()` para envios em lote (lotes de até 100 e-mails), otimizando throughput e latência.
   - Persistência dos IDs individuais retornados pelo Resend em `recruit_email_logs`.
   - Preservação integral das regras de negócio: `email_suppressions`, descadastro em 2 níveis (`permanent` e `temporary_6m`), registro de sinais de interesse (`coach_interest_signals`) e textos customizados.
3. `src/lib/email/stage-change.server.ts`:
   - Atualização da documentação/comentários de SES para Resend.
   - Garantia de que celebrações de avanço de fase continuem utilizando a janela inteligente de envio e anti-duplicidade determinística.
4. `src/server.ts`:
   - Substituição do endpoint `/api/webhooks/ses` por `/api/webhooks/resend`.
   - Manutenção de `/api/cron/process-scheduled-emails` chamando o processador migrado para Resend.
5. `.env.example`:
   - Remoção de variáveis legadas do SES (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `SES_CONFIGURATION_SET`, `SES_MAX_SEND_RATE`).
   - Adição de `RESEND_API_KEY=`, `EMAIL_FROM=`, `RESEND_WEBHOOK_SECRET=`.
6. `package.json`:
   - Remoção da dependência `@aws-sdk/client-sesv2`.
   - Inclusão da dependência oficial `resend`.
7. `docs/SETUP.md`, `README.md`, `CERNE.md`, `BACKLOGER.md`:
   - Atualização da documentação do ecossistema e registro da tarefa concluída.

### 3.3 Remoção de Arquivos Obsoletos
- `src/lib/email/ses-client.server.ts`
- `src/lib/email/ses-webhook.server.ts`
- `src/lib/email/ses-email.test.ts`

---

## 4. Estratégia de Testes e Validação

1. **Testes Unitários**:
   - `resend-email.test.ts`: 100% de cobertura sobre configuração, fallbacks de chave ausente, envio transacional, processamento de agendados, batch send e webhooks (com e sem assinatura).
   - Execução de toda a suite com `bun run test` (18+ arquivos de teste).
2. **Typecheck & Linter**:
   - `bun run typecheck` com zero erros.
   - `bun run lint` com conformidade estrita ESLint.
3. **Build de Produção**:
   - `bun run build` validando a geração do pacote de produção e Nitro preset da Vercel.

---

## 5. Estratégia de Rollback

Em caso de imprevisto, as versões históricas dos módulos SES e configurações de infraestrutura permanecem preservadas no histórico do Git. A arquitetura centralizada garante que a troca de provedor ocorra em um único ponto estrutural.

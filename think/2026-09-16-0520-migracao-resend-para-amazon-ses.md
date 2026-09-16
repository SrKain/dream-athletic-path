# Planejamento: Migração Total de Provedor de E-mail de Resend para Amazon SES

## 1. Contexto e Objetivo

- **Objetivo**: Substituir 100% o provedor de e-mail `resend` por **Amazon SES** (`@aws-sdk/client-sesv2`), abrangendo tanto o serviço transacional (`src/lib/email/email.server.ts`) quanto o mailer em massa para coaches universitários (`src/lib/email/recruit-email.server.ts`).
- **Infraestrutura Existente**: Domínio já verificado com DKIM ativo no SES, conta AWS liberada fora de sandbox, e Configuration Set configurado com tópico SNS para notificações de Bounce e Complaint.
- **Novas Variáveis de Ambiente**:
  - `AWS_ACCESS_KEY_ID`: Chave de acesso AWS
  - `AWS_SECRET_ACCESS_KEY`: Chave secreta AWS
  - `AWS_REGION`: Região AWS (ex: `us-east-1` / `sa-east-1`)
  - `SES_CONFIGURATION_SET`: Nome do Configuration Set para rastreio de reputação/SNS
  - `EMAIL_FROM`: Mantido, assegurando envio através de remetente do domínio verificado (ex: `Go Team Go <contact@goteamgoagency.com>`).

---

## 2. Escopo de Alterações Técnicas

### 2.1 Dependências e Limpeza

1. Desinstalar / remover `resend` de `package.json`.
2. Adicionar e garantir `@aws-sdk/client-sesv2` nas dependências.
3. Atualizar `.env.example` removendo `RESEND_API_KEY` e adicionando as variáveis da AWS/SES.

### 2.2 Transacional & Fila de Agendamento (`src/lib/email/email.server.ts`)

- Substituir cliente Resend por `SESv2Client` instanciado com credenciais e região dos env vars.
- Manter o contrato de `sendEmail({ template, to, data, respectSendingWindow })`.
- **Agendamento**: Como o SES não possui agendamento nativo via parâmetro, quando `shouldSchedule=true` (fora da sending window), registrar na tabela `email_log` com `status: "scheduled"`, `scheduled_for: nextWindow.toISOString()` e `payload: { template, to, data, ... }`.
- **Processador de E-mails Agendados (`processScheduledEmails`)**: Função exportada que busca registros com `status = 'scheduled'` e `scheduled_for <= now()`, dispara via SESv2 `SendEmailCommand`, e atualiza o status para `sent` (com `provider_id` / MessageId) ou `failed`.
- Configurar `ConfigurationSetName` em todas as chamadas `SendEmailCommand`.
- Fallback seguro para credenciais ausentes (`skipped` com log explicativo).

### 2.3 Mailer em Massa para Coaches (`src/lib/email/recruit-email.server.ts`)

- Substituir `resend.batch.send()` por loop controlado e sequencial de `SendEmailCommand` via SESv2.
- Implementar controle de taxa de envio (rate limiting / throttling):
  - Limite configurável (default seguro de 10 envios/segundo).
  - Delay programado (`1000 / rateLimitMs`) para não estourar a taxa máxima de envio da conta AWS SES durante importações com ~3500 coaches.
- Preservar integridade de todas as funcionalidades existentes:
  - Verificação de `email_suppressions` (descadastros prévios).
  - Gravação de logs de supressão e logs de envio em `recruit_email_logs`.
  - Suporte aos 3 modos: `single_athlete`, `multi_athlete` e `catalog`.
  - Passagem de `ConfigurationSetName` em todas as mensagens.

### 2.4 Webhook de Eventos SNS para Bounces e Complaints

- Criar endpoint HTTP para processar eventos do Amazon SNS:
  - Arquivo: `src/lib/email/ses-webhook.server.ts` e rota no servidor TanStack Start (`src/server.ts` em `/api/webhooks/ses`).
  - Suporte automático a `SubscriptionConfirmation` (consumindo `SubscribeURL` para auto-confirmação do tópico SNS).
  - Suporte a `Notification`: extração de eventos SES de `Bounce` e `Complaint`.
  - Inserção automática de cada e-mail afetado na tabela `email_suppressions` com `reason: "ses_bounce"` ou `reason: "ses_complaint"`.

### 2.5 Atualização de Documentação e Nomenclaturas

- Substituir todas as menções a "Resend" por "Amazon SES" nos comentários de código, documentações e logs.

---

## 3. Estratégia de Validação

1. **Testes Unitários (Vitest)**:
   - Criar / atualizar testes de unidade cobrindo o envio SES transacional, fallbacks de configuração, processamento de e-mails agendados, throttling do mailer e processamento do webhook SNS.
2. **Validação de Tipagem e Linter**:
   - `npm run lint` e `npm run typecheck`.
3. **Validação de Compilação**:
   - Executar `compile_applet` para garantir que o bundle final e build de produção funcionam com zero erros.
4. **Governança**:
   - Atualizar `CERNE.md` com a nova arquitetura do serviço de e-mail.
   - Registrar entrega da TASK-067 no `BACKLOGER.md`.

---

## 4. Status da Execução

- **Status**: [CONCLUÍDO]
- **Data de Conclusão**: 2026-09-16 05:25 (UTC)
- **Resultados**:
  - Dependência `resend` totalmente removida e substituída por `@aws-sdk/client-sesv2`.
  - Cliente SES singleton em `src/lib/email/ses-client.server.ts` com suporte a `SES_CONFIGURATION_SET`.
  - E-mails transacionais em `src/lib/email/email.server.ts` migrados com suporte a envio imediato e agendamento na janela de envio (`email_log`).
  - Disparo de recrutamento em `src/lib/email/recruit-email.server.ts` migrado para loop individual com rate limiting e logging individual de auditoria.
  - Webhook de SNS em `src/lib/email/ses-webhook.server.ts` exposto em `POST /api/webhooks/ses` no `src/server.ts` com confirmação automática de assinatura e supressão de Bounce / Complaint.
  - 106 testes automatizados passando (16 suítes). Build de produção e linter 100% aprovados.


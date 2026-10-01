# Planejamento: Sistema Completo de Métricas e Relatórios do Mailer (Resend Metrics API & Webhooks)

**Data:** 2026-10-01  
**Autor:** Antigravity AI / Gemini Coding Agent  
**Status:** `[AGUARDANDO APROVAÇÃO HUMANA]`  
**Solicitante:** Kauan / Usuário Humano  

---

## 1. Contexto e Objetivo

O **Dream Athletic Path** realizou a migração estrutural para o **Resend** como seu provedor oficial e exclusivo de e-mails para todos os fluxos (disparos transacionais, celebrações de pipeline e campanhas do Mailer com batch sending de até 100 mensagens).

O objetivo desta tarefa é construir uma camada completa de **Inteligência e Relatórios de Desempenho de E-mails (Email Metrics & Reporting)** integrada ao Mailer (`/admin/mailer`), respondendo às perguntas centrais:
- **"O que aconteceu com os e-mails que enviei?"** (Status de entrega, aberturas, cliques, bounces, denúncias de spam).
- **"Qual foi a performance das campanhas?"** (Taxas de entrega, taxas de abertura, taxas de clique, funil de conversão e comparação entre modos Single Athlete, Multi-Athlete e Catalog).

---

## 2. Arquitetura de Dados: Resend Metrics API vs. Webhooks vs. Supabase

```text
                                 ┌─────────────────────────────────┐
                                 │       Admin / Mailer UI         │
                                 │  Create Send | History | Metrics│
                                 └───────────────┬─────────────────┘
                                                 │
                                                 ▼
                                 ┌─────────────────────────────────┐
                                 │   Server Functions (Type-Safe)  │
                                 │   - getMailerMetricsServerFn    │
                                 │   - getMailerHistoryServerFn    │
                                 └───────┬─────────────────┬───────┘
                                         │                 │
                  ┌──────────────────────┘                 └──────────────────────┐
                  ▼                                                               ▼
   ┌───────────────────────────────┐                               ┌───────────────────────────────┐
   │    Resend Email Metrics API   │                               │     Supabase Database Logs    │
   │  resend.emails.metrics(...)   │                               │  - recruit_email_logs         │
   │  (Totais agregados, taxas,    │                               │    (agora com provider_id)    │
   │   série temporal diária)      │                               │  - email_events               │
   └───────────────────────────────┘                               │    (ingestão de webhooks)     │
                                                                   └───────────────▲───────────────┘
                                                                                   │
                                                                   ┌───────────────┴───────────────┐
                                                                   │     /api/webhooks/resend      │
                                                                   │   (Svix signature check +     │
                                                                   │    idempotent event storage)  │
                                                                   └───────────────────────────────┘
```

### A. Resend Email Metrics API (Agregados & Série Temporal)
- Chamada direta e oficial ao SDK `resend.emails.metrics({ startDate, endDate, granularity: 'daily', dimensions: ['period'] })`.
- Fornece totais auditados e oficiais do provedor: `sent`, `delivered`, `opened`, `unique_opened`, `clicked`, `unique_clicked`, `bounced`, `bounced_permanent`, `bounced_transient`, `delivery_delayed`, `unsubscribed`, `complained`, `failed`, `suppressed`.
- Fornece taxas calculadas: `delivery_rate`, `open_rate`, `click_rate`, `bounce_rate`, `complaint_rate`, `unsubscribe_rate`.
- Resolução temporal por período para alimentar os gráficos do Recharts.

### B. Ingestão de Webhooks do Resend (Eventos Individuais & Idempotência)
- Endpoint existente: `/api/webhooks/resend` em `src/server.ts`.
- Módulo `src/lib/email/resend-webhook.server.ts`.
- Preserva a validação de assinatura criptográfica Svix (`svix-id`, `svix-timestamp`, `svix-signature`).
- Nova tabela `public.email_events` com chave única `provider_event_id` para garantir **idempotência estrita** (duplicidades ou retentativas do webhook nunca geram registros duplicados).
- Eventos rastreados: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`.
- Bounces e Complaints continuam alimentando `email_suppressions` (como já implementado).
- Clientes com link de clique têm o campo `payload.click.link` preservado.

### C. Persistência de `provider_id` em `recruit_email_logs`
- Adição da coluna `provider_id text` na tabela `recruit_email_logs`.
- No envio de lotes (`resendClient.batch.send`) e no envio individual em `src/lib/email/recruit-email.server.ts`, o ID retornado pelo Resend (`responseList[idx]?.id`) é persistido junto ao registro de log.
- Isso conecta diretamente cada envio individual aos seus eventos de webhook (`provider_email_id`).

---

## 3. Escopo e Arquivos Envolvidos

| Arquivo / Módulo | Tipo | Descrição Cirúrgica |
| :--- | :--- | :--- |
| `db/migrations/0021_email_events_and_mailer_metrics.sql` | Migration SQL | Cria tabela `email_events`, índice único `provider_event_id`, índices de performance (`provider_email_id`, `recipient`, `event_type`, `occurred_at`) e adiciona `provider_id text` com índice em `recruit_email_logs`. RLS protegida para agência. |
| `src/types/db.ts` | Types | Definições de tipos TypeScript: `EmailEvent`, `EmailEventType`, `RecruitEmailLog.provider_id`, `MailerMetricsData`. |
| `src/lib/email/resend-webhook.server.ts` | Webhook Server | Inserção idempotente em `email_events` de todos os tipos de eventos recebidos (`delivered`, `opened`, `clicked`, etc.), preservando validação Svix e supressões de bounce/complaint. |
| `src/lib/email/recruit-email.server.ts` | Mailer Server | Persistir `provider_id: resendId` nos registros de `recruit_email_logs` tanto no batch send quanto no envio unitário. |
| `src/lib/email/mailer-metrics.server.ts` | Novo Módulo | Funções servidoras para consumir a Resend Metrics API (`resend.emails.metrics`), agregar dados locais de fallback e buscar timeline de eventos por e-mail/recipiente. |
| `src/lib/email/recruit-email.functions.ts` | Server Functions | Exportar `getMailerMetricsServerFn` e `getEmailEventTimelineServerFn` protegidas com `requireAgency`. |
| `src/components/mailer-metrics-dashboard.tsx` | Novo Componente | Painel completo de métricas com seletor de período (7d, 30d, 90d, custom), cards de KPIs, gráfico Recharts, funil de conversão, tabela de campanhas e problemas de entrega. |
| `src/routes/_authenticated/admin/mailer.tsx` | UI Principal | Adicionar aba **Metrics** (Create Send \| History \| Metrics). Na aba **History**, adicionar visualização de timeline e status real dos eventos (`Delivered`, `Opened`, `Clicked`, `Bounced`). |
| `src/lib/email/mailer-metrics.test.ts` | Testes | Suite de testes unitários cobrindo: chamada à Metrics API, agregação, cálculo de taxas, ingestão idempotente de webhooks, timeline de eventos e fallbacks de erro. |
| `CERNE.md` & `BACKLOGER.md` | Governança | Documentação viva atualizada e encerramento da tarefa no diário de bordo. |

---

## 4. Detalhamento da Interface & UX/UI

### 4.1 Navegação Superior do Mailer
Três abas limpas com design system nativo:
- **Create Send** (`Send` icon)
- **History** (`History` icon + contador dinâmico)
- **Metrics** (`BarChart3` ou `TrendingUp` icon + status de dados)

### 4.2 Topo do Dashboard de Métricas
- **Seletor de Período**: Pílulas rápidas (`Last 7 days`, `Last 30 days`, `Last 90 days`, `Custom`) + inputs de data inicial e final quando "Custom" for selecionado.
- **Botão de Refresh Manual**: Ícone de recarga com spinner, feedback visual e timestamp `Last Updated: [hora/data]`.
- **Badge de Fonte de Dados**: Indicador discreto mostrando `Live Resend Metrics API` ou `Local Event Logs (Fallback)`.

### 4.3 Seção 1: Cards Primários de KPIs (Hierarquia Positiva → Secundária)
- **Linha Principal (Volume & Engajamento Positivo)**:
  - **Sent**: Total de envios realizados no período.
  - **Delivered**: Total de entregas confirmadas com badge de **Delivery Rate** (ex: `98.8%`).
  - **Opened**: Total de eventos de abertura com badge de **Open Rate** (ex: `44.2%`) e exibição de Unique Opens. (Com aviso claro: *Open tracking registered by email client* — sem confusão com "confirmação humana de leitura").
  - **Clicked**: Total de cliques com badge de **Click Rate** (ex: `18.5%`) e Unique Clicks.
- **Linha Secundária (Reputação & Problemas)**:
  - **Bounced**: Total com badge de **Bounce Rate** (destacando permanent vs transient).
  - **Complaints**: Total de denúncias de spam com badge de **Complaint Rate**.
  - **Unsubscribed**: Total de descadastros gerados no período.
  - **Failed / Delayed**: Total de falhas ou atrasos de entrega.

### 4.4 Seção 2: Performance Over Time (Gráfico de Linha/Área Temporal)
- Implementado com **Recharts** usando o `ChartContainer` nativo do projeto (`src/components/ui/chart.tsx`).
- Curvas suaves com cores da identidade visual:
  - Sent: Cinza/Verde escuro suave.
  - Delivered: Verde esmeralda (`#084323` / `#30b884`).
  - Opened: Âmbar/Dourado institucional (`#f69e00`).
  - Clicked: Azul claro/Sky.
- Tooltip customizado formatando data e valores de cada métrica no ponto do gráfico.

### 4.5 Seção 3: Email Funnel (Funil de Conversão)
Visualização clara em degraus mostrando retenção e perda:
```text
[ Sent: 1,240 ] ───────── 100%
      │
      ▼
[ Delivered: 1,215 ] ──── 98.0% of sent (25 bounced/failed)
      │
      ▼
[ Opened: 535 ] ───────── 44.0% of delivered
      │
      ▼
[ Clicked: 112 ] ──────── 20.9% of opened (9.2% of delivered)
```

### 4.6 Seção 4: Desempenho por Campanha / Modo de Envio
Tabela compacta comparando:
- **Single Athlete Teasers** (envios de 1 atleta específico)
- **Multi-Athlete Rosters** (envios com múltiplos cards empilhados)
- **Catalog Showcases** (convites institucionais para o portfólio geral)
Colunas: *Mode*, *Total Dispatched*, *Delivered*, *Opens*, *Clicks*, *Bounces*, *Top Performing Recruit*.

### 4.7 Seção 5: Delivery Problems & Diagnostics
Painel de alerta para diagnóstico de problemas:
- Resumo de Bounces Permanentes vs Temporários.
- Lista recente de e-mails com problemas (data, destinatário, universidade, tipo de erro/bounce, motivo do Resend).
- Atalho rápido para ver ou gerenciar a lista de supressão (`email_suppressions`).

### 4.8 Histórico Enriquecido (Aba History)
Para cada linha de histórico existente:
- Adicionar badge com status de ciclo de vida atual:
  - `Sent` (Neutro)
  - `Delivered` (Verde suave)
  - `Opened` (Dourado/Âmbar suave com timestamp da última abertura)
  - `Clicked` (Azul/Sky com timestamp do último clique)
  - `Bounced` (Vermelho com tooltip do motivo)
  - `Suppressed` (Cinza)
- Timeline compacta expansível para detalhes do e-mail:
  `Sent (14:32) → Delivered (14:32) → Opened (14:48) → Clicked (14:50 - /athlete/carolina-becker)`

---

## 5. Estratégia de Testes Automatizados

1. **`resend-metrics.test.ts`**:
   - Teste de chamada e parsing da Resend Metrics API (`r.emails.metrics`).
   - Teste de filtros de data (7d, 30d, 90d, custom).
   - Teste de cálculo seguro de taxas (evitando divisão por zero quando `sent = 0` ou `delivered = 0`).
   - Teste de fallback gracioso para agregação local quando `RESEND_API_KEY` estiver ausente ou inválida.
   - Teste de estado vazio (distinção entre `0 events` e `Data unavailable`).
2. **`resend-webhook.test.ts`**:
   - Ingestão idempotente de `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`.
   - Teste de rejeição de eventos duplicados (mesmo `provider_event_id`).
   - Teste de persistência de links clicados no payload.
3. **Validação Geral**:
   - `npm run lint` (ESLint sem erros).
   - `npm run typecheck` (zero erros de TypeScript).
   - `npm run test` (todos os testes passando).
   - `compile_applet` (build de produção concluído com sucesso).

---

## 6. Segurança e Conformidade

- `RESEND_API_KEY` e `RESEND_WEBHOOK_SECRET` permanecem **estritamente server-side** (lidos exclusivamente em módulos `.server.ts` e Server Functions com `requireAgency`).
- Nenhuma chave secreta ou token privilegiado é exposto para o cliente ou serializado no bundle.
- Acesso à rota de métricas restrito ao perfil `agency_admin`.
- Ingestão de webhooks protegida por verificação criptográfica Svix HMAC SHA256 com tolerância de replay de 5 minutos.

---

## 7. Configuração Manual do Dashboard do Resend (Se Necessário)

No painel do Resend (**Dashboard → Webhooks**):
- A URL do webhook deve estar configurada como: `https://[seu-dominio]/api/webhooks/resend`.
- Marcar todos os tipos de eventos desejados para entrega: `Sent`, `Delivered`, `Delivery Delayed`, `Complained`, `Bounced`, `Opened`, `Clicked`.
- O secret gerado (`whsec_...`) deve ser configurado como variável de ambiente `RESEND_WEBHOOK_SECRET`.

---

Você aprova a execução deste plano para iniciarmos a implementação?

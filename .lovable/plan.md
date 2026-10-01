# Finalizar o painel de métricas do Mailer (Resend)

## Contexto
O README e o `think/` foram lidos. A base do painel existe no histórico (commit `dc9ad3f`): `mailer-metrics-dashboard.tsx` com gráfico de área, `mailer-metrics.server.ts`, testes e a migração `0021_email_events_and_mailer_metrics.sql`. **Esses arquivos não estão na versão atual do projeto aqui.** As dependências deles também não estão: a tabela `recruit_email_logs`, `resend-client.server.ts`, as migrações 0016 a 0020 e a própria aba Mailer. Isso indica que o seu repositório local está à frente deste.

**Primeiro passo obrigatório:** envie (push) a versão local mais recente para o GitHub, para que eu trabalhe sobre o código real. Sem isso, a implementação recriaria arquivos que você já tem.

## Objetivo
Painel na aba Mailer com dados reais do Resend, recebidos em tempo real (webhooks):
1. **Volume por dia:** enviados, entregues, abertos, clicados, devolvidos (bounce) e reclamações, em um gráfico de área com filtro de 7, 30 ou 90 dias.
2. **Taxas:** cartões com entrega %, abertura %, clique %, bounce % e reclamação %, com a variação em relação ao período anterior.

## O que o Resend disponibiliza
Eventos por webhook: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained` e `email.failed`. Cada evento traz o id do e-mail, o destinatário, a data e, nos cliques, o link clicado. O Resend não oferece uma API pública de métricas agregadas. A chamada `client.emails.metrics` usada no rascunho será verificada contra a documentação oficial e removida se não existir. Os números serão calculados a partir dos eventos guardados.

## Etapas
1. **Recebimento de eventos:** rota pública `/api/public/resend/webhook` que verifica a assinatura (Svix, `RESEND_WEBHOOK_SECRET`) antes de gravar. A inserção é idempotente em `email_events`, pela chave `provider_event_id`.
2. **Banco:** revisar e aplicar a migração `0021`, adicionando os `GRANT`s que faltam. Criar a função SQL `mailer_daily_metrics(start, end)`, que agrega os eventos por dia e por tipo.
3. **Server function `getMailerMetrics`** (somente agência): devolve a série diária e as taxas do período atual e do anterior. As aberturas e os cliques são contados por e-mail único.
4. **Painel** (`mailer-metrics-dashboard.tsx`, recharts, mobile-first conforme `UI&UX.md`):
   - seletor de período;
   - 5 cartões de taxa com variação;
   - gráfico de volume diário com legenda clicável;
   - estados de carregando, vazio (com instrução para configurar o webhook) e erro.
5. **Configuração no Resend (você):** cadastrar em Resend → Webhooks a URL `https://<seu-domínio>/api/public/resend/webhook` com os eventos `email.*`. Depois, salvar o *signing secret* como `RESEND_WEBHOOK_SECRET` na Vercel.
6. **Documentação:** salvar este plano em `think/2026-10-01-1530-finalizacao-painel-metricas-mailer.md` e atualizar `CERNE.md`, `BACKLOGER.md` e `docs/SETUP.md`.

## Detalhes técnicos
- As aberturas exigem o rastreamento de aberturas ativado no Resend. O Apple Mail infla esse número, e o painel mostrará um aviso discreto sobre isso.
- `email_log.provider_id` liga cada evento ao envio original.
- Testes Vitest cobrirão a assinatura, a idempotência e o cálculo das taxas, inclusive quando não houver envios no período.

## Riscos
- Os dados só existem a partir da ativação do webhook, porque o Resend não reenvia eventos antigos.
- O plano será ajustado se o código local divergir do que está descrito aqui.

## Validação
Enviar um evento de teste pelo Resend, conferir o registro no banco e ver o gráfico e as taxas no Mailer. Rodar `bun run validate`.

## Status
Aguardando aprovação humana.

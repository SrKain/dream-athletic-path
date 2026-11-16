# TASK-117 — Executor externo do Mailer na Hetzner ("pulse")

- **Data:** 2026-11-16 16:10 (America/Sao_Paulo)
- **Solicitante:** Kauan (Iasin) — Go Team Go
- **Planejamento e execução:** Claude (Anthropic)
- **Aprovação humana:** plano apresentado na conversa e aprovado por Kauan em 16/11/2026 ("Vamos lá, vc vai fazer a migração toda, o que precisa pra fazer rodar").

## Diagnóstico (estado da `main` em `f75f777`, 09/11/2026)

1. O motor do Mailer (`runCampaignTick`, `src/lib/email/mailer-engine-v2.server.ts`) é idempotente e sem estado entre chamadas. Ele roda na Vercel em `POST /api/mailer/tick`: trabalha até `MAILER_TICK_BUDGET_MS` (8 s), envia lotes de 100 pela Resend (`resend.batch.send`) com 1,5 s entre lotes, persiste tudo e devolve `nextTickInMs`.
2. A função da Vercel termina depois de cada resposta, então alguém precisa chamar o tick de novo. Hoje quem faz isso é o navegador (`useCampaignRunner`). Com a aba fechada, minimizada, o computador suspenso ou a rede oscilando, a campanha para. Foi o caso dos 565 e-mails de 06/11, que pararam no lote 5 e só concluíram cerca de 17 h depois, quando a tela foi reaberta.
3. A rede de segurança da TASK-116 (pg_cron + pg_net + Vault no Supabase) depende de passos humanos que não foram executados: `cron.job` não existe em produção.

**Conclusão:** o motor está correto. O que falta é um chamador confiável e independente do navegador.

## Decisão

Usar uma máquina que o Kauan já tem na Hetzner Cloud como chamador permanente (o "pulse"). É um processo `bash` + `curl` + `jq` gerenciado pelo `systemd` que chama `POST /api/mailer/tick` em loop, autenticado por `x-mailer-cron-secret` (mecanismo que já existe em `verifyMailerCronTickSecret`), e dorme o tempo indicado em `nextTickInMs` (ou 20 s quando não há campanha).

- O envio continua na Vercel, com a Resend e o mesmo motor e as mesmas garantias (lease, idempotência, retry de 429, supressão, Bounce Guard).
- Banco, auth e storage continuam no Supabase.
- Não é preciso máquina nova, banco novo nem dependência nova. O custo adicional na Hetzner é zero, porque a máquina já existe (o processo usa poucos MB de RAM).
- O pg_cron deixa de ser obrigatório. Os dois podem coexistir, porque o lease garante um único executor por campanha.

## Mudanças no código (mínimas)

1. **Migration `0034_mailer_executor_heartbeat.sql`** (aplicação manual e idempotente): tabela `mailer_executor_heartbeats(executor, last_seen_at, last_tick_status)`, com RLS ligada, sem policies e acesso só pelo `service_role`. Mais o `verify-0034.sql`, somente leitura.
2. **`src/server.ts`:** quando o tick é autenticado pelo segredo e traz o header `x-mailer-executor`, grava o heartbeat sem bloquear a resposta (falha de gravação não derruba o tick e funciona mesmo sem a 0034 aplicada).
3. **`getMailerCronStatus`:** a "Rede de segurança" passa a contar como ativa quando o pg_cron está ativo (comportamento atual) **ou** quando há um executor externo com sinal nos últimos 90 s. O `schedule` exibe `pulse externo (hetzner-pulse)`. O contrato `MailerCronStatus` ganha os campos opcionais `source` e `lastSeenAt`. A UI não muda.
4. **Testes:** heartbeat (gravação, sanitização, frescor) e status combinado.

## Infra (fora do bundle)

- `ops/hetzner-mailer-pulse/pulse.sh`: loop com backoff em falhas, alerta opcional por webhook (Slack, Discord ou ntfy) e segredo enviado por arquivo de header, para não aparecer no `ps`.
- `ops/hetzner-mailer-pulse/mailer-pulse.service`: unidade `systemd` com `Restart=always`, usuário sem privilégios, sandbox e `MemoryMax=64M`.
- `ops/hetzner-mailer-pulse/install.sh`: instalador de um comando, interativo.
- `docs/mailer/TASK-117-hetzner-pulse.md`: runbook de implantação, teste e operação.

## Operação humana

1. Aplicar `0033a`–`0033f` (se `verify-0033.sql` acusar pendência) e depois `0034`, rodando `verify-0034.sql` em seguida.
2. Na Vercel, definir `MAILER_CRON_SECRET` (64 hex, gerado com `openssl rand -hex 32`) e fazer o deploy desta branch.
3. Na Hetzner: `git clone` e `sudo bash ops/hetzner-mailer-pulse/install.sh`.
4. Teste: campanha pequena, fechar a aba, conferir conclusão e o selo "Rede de segurança: ativa".

## Limites conhecidos

- A vazão máxima passa a depender da cota e do rate limit da conta Resend (plano documentado no CERNE: 20 mil/mês), não do disparador.
- Em estado ocioso, o pulse gera cerca de 130 mil invocações leves por mês na Vercel (uma a cada 20 s). Isso é ajustável por `PULSE_IDLE_SLEEP_SEC`.

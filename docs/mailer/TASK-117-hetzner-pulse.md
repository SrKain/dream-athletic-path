# TASK-117 — Runbook: Mailer pulse na Hetzner

Plano e diagnóstico: [think/2026-11-16-1610-mailer-pulse-hetzner.md](../../think/2026-11-16-1610-mailer-pulse-hetzner.md)

## O que é

```
[Hetzner: mailer-pulse (systemd)] --POST /api/mailer/tick a cada nextTickInMs--> [Vercel: runCampaignTick] --batch--> [Resend]
                                                                                     |
                                                                                     +--> [Supabase: fila, lotes, progresso, heartbeat]
[Navegador: tela do Mailer] --só lê o progresso--> [Supabase]
```

- O envio continua na Vercel, pela Resend, com o mesmo motor da TASK-116.
- A Hetzner só "bate o coração" do motor. Com isso a campanha continua com a aba fechada.
- O lease de 90 s garante um único executor por campanha. Navegador, pulse e pg_cron (se um dia for ligado) podem coexistir sem duplicar envio.
- O custo adicional é zero se usar a máquina que já existe. Qualquer plano serve, porque o processo usa menos de 10 MB de RAM.

## Implantação (cerca de 15 minutos, nesta ordem)

### 1. Supabase (SQL Editor)

1. Rode `db/migrations/verify-0033.sql`. Se acusar pendência, aplique `0033a` → `0033f` na ordem (runbook da TASK-116) e rode o verify de novo.
2. Aplique `db/migrations/0034_mailer_executor_heartbeat.sql`.
3. Rode `db/migrations/verify-0034.sql`. Todas as linhas devem sair com `ok = true`.

### 2. Vercel

1. Gere o segredo em qualquer terminal com `openssl rand -hex 32`.
2. Em Settings → Environment Variables (Production), defina `MAILER_CRON_SECRET` com esse valor.
3. Faça merge/deploy desta entrega e confirme que o deploy de produção terminou. A variável só vale depois do redeploy.
4. Não é preciso ligar `MAILER_CRON_ENABLED`, que é só do pg_cron.

### 3. Hetzner (SSH na máquina)

```bash
git clone --depth 1 https://github.com/SrKain/dream-athletic-path.git
sudo bash dream-athletic-path/ops/hetzner-mailer-pulse/install.sh
```

O instalador pede a URL do tick (Enter aceita `https://portfolio.goteamgoagency.com/api/mailer/tick`), o segredo (o mesmo da Vercel) e um webhook de alerta opcional. Em seguida ele testa a conexão: **HTTP 200** significa que está tudo certo; **401** significa que o segredo está diferente ou que a Vercel ainda não foi redeployada.

### 4. Teste de aceitação

1. Abra o Mailer. O painel deve mostrar **"Rede de segurança: ativa (pulse externo (hetzner-pulse))"**.
2. Crie uma campanha pequena para contatos de teste, inicie e **feche a aba**.
3. Na Hetzner, acompanhe os ticks com `journalctl -u mailer-pulse -f`.
4. Reabra o Mailer: a campanha deve estar concluída ou avançando sem você.

## Operação

| Ação | Comando |
|---|---|
| Logs ao vivo | `journalctl -u mailer-pulse -f` |
| Status | `systemctl status mailer-pulse` |
| Reiniciar | `sudo systemctl restart mailer-pulse` |
| Parar todos os disparos automáticos | `sudo systemctl stop mailer-pulse` (o navegador ainda dispara com a aba aberta) |
| Trocar segredo | atualizar na Vercel → redeploy → `sudo bash install.sh --reconfigure` |
| Atualizar o script | `git -C dream-athletic-path pull && sudo bash dream-athletic-path/ops/hetzner-mailer-pulse/install.sh` |
| Último sinal no banco | `SELECT * FROM mailer_executor_heartbeats;` |

## Comportamento e falhas

- **Ocioso:** uma chamada a cada 20 s (`PULSE_IDLE_SLEEP_SEC`), o que dá cerca de 130 mil invocações leves por mês na Vercel.
- **Campanha rodando:** a próxima chamada respeita `nextTickInMs`. Cada tick envia até ~400–500 e-mails (8 s de orçamento, lotes de 100), então 5 mil saem em poucos minutos. O teto real passa a ser a cota e o rate limit da conta Resend. Os 429 já são tratados pelo motor.
- **Falha de rede, 5xx ou 401:** backoff de 5 s × número da falha (até 120 s). Depois de 5 falhas seguidas, envia um alerta ao webhook, e envia outro aviso quando recupera.
- **O processo morreu:** o systemd sobe de novo em 5 s. Depois de um reboot da máquina, sobe sozinho.
- **A máquina caiu:** o painel volta a mostrar "Rede de segurança: inativa" em até 90 s, e o envio segue apenas com a aba aberta, como era antes.

## Variáveis (`/opt/mailer-pulse/pulse.env`)

`MAILER_TICK_URL`, `MAILER_CRON_SECRET`, `MAILER_EXECUTOR_NAME` (padrão `hetzner-pulse`), `PULSE_IDLE_SLEEP_SEC` (20), `PULSE_MAX_SLEEP_SEC` (300), `PULSE_ERROR_SLEEP_MAX_SEC` (120), `PULSE_ALERT_WEBHOOK_URL`, `PULSE_ALERT_AFTER_FAILURES` (5).

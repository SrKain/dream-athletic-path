#!/usr/bin/env bash
# =============================================================================
# TASK-117 — Instalador do Mailer pulse (Debian/Ubuntu com systemd)
# Uso (na máquina da Hetzner):
#   git clone --depth 1 https://github.com/SrKain/dream-athletic-path.git
#   sudo bash dream-athletic-path/ops/hetzner-mailer-pulse/install.sh
# Reexecutar é seguro: atualiza o script e mantém o pulse.env existente.
# Para trocar o segredo: sudo bash install.sh --reconfigure
# =============================================================================
set -euo pipefail

DEFAULT_URL="https://portfolio.goteamgoagency.com/api/mailer/tick"
DIR="/opt/mailer-pulse"
ENV_FILE="$DIR/pulse.env"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECONFIGURE="${1:-}"

[ "$(id -u)" = "0" ] || { echo "Rode com sudo."; exit 1; }
command -v systemctl >/dev/null || { echo "systemd não encontrado."; exit 1; }

echo "==> Dependências (curl, jq)"
if command -v apt-get >/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl jq ca-certificates >/dev/null
elif command -v dnf >/dev/null; then
  dnf install -y -q curl jq ca-certificates
fi
command -v jq >/dev/null && command -v curl >/dev/null || { echo "Instale curl e jq e rode de novo."; exit 1; }

echo "==> Usuário de serviço"
id mailerpulse >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin mailerpulse

echo "==> Arquivos em $DIR"
install -d -m 750 -o root -g mailerpulse "$DIR"
install -m 755 -o root -g root "$SRC/pulse.sh" "$DIR/pulse.sh"

if [ ! -f "$ENV_FILE" ] || [ "$RECONFIGURE" = "--reconfigure" ]; then
  echo
  read -rp "URL do tick [$DEFAULT_URL]: " URL
  URL="${URL:-$DEFAULT_URL}"
  read -rsp "MAILER_CRON_SECRET (o MESMO valor da Vercel): " SECRET; echo
  if [ "${#SECRET}" -lt 32 ]; then
    echo "O segredo precisa ter 32+ caracteres. Gere com: openssl rand -hex 32"; exit 1
  fi
  read -rp "Webhook de alerta (Slack/Discord/ntfy; Enter para pular): " ALERT
  umask 077
  cat >"$ENV_FILE" <<EOF
MAILER_TICK_URL=$URL
MAILER_CRON_SECRET=$SECRET
MAILER_EXECUTOR_NAME=hetzner-pulse
PULSE_IDLE_SLEEP_SEC=20
PULSE_ALERT_WEBHOOK_URL=$ALERT
PULSE_ALERT_AFTER_FAILURES=5
EOF
  chown root:mailerpulse "$ENV_FILE"
  chmod 640 "$ENV_FILE"
fi

echo "==> Teste de conexão com o endpoint"
set -a; . "$ENV_FILE"; set +a
CODE="$(curl -sS -o /tmp/mailer-pulse-test.json -w '%{http_code}' -m 60 -X POST \
  -H "x-mailer-cron-secret: $MAILER_CRON_SECRET" -H "x-mailer-executor: ${MAILER_EXECUTOR_NAME:-hetzner-pulse}" \
  -H 'content-type: application/json' -d '{}' "$MAILER_TICK_URL" || echo 000)"
echo "HTTP $CODE: $(head -c 200 /tmp/mailer-pulse-test.json 2>/dev/null)"
rm -f /tmp/mailer-pulse-test.json
case "$CODE" in
  200) echo "OK: endpoint aceitou o segredo." ;;
  401) echo "ERRO 401: segredo diferente do configurado na Vercel (ou Vercel sem MAILER_CRON_SECRET/sem redeploy)."; exit 1 ;;
  *)   echo "AVISO: resposta inesperada. O serviço será instalado mesmo assim e tentará de novo com backoff." ;;
esac

echo "==> systemd"
install -m 644 "$SRC/mailer-pulse.service" /etc/systemd/system/mailer-pulse.service
systemctl daemon-reload
systemctl enable mailer-pulse >/dev/null
systemctl restart mailer-pulse
sleep 2
systemctl --no-pager --lines=0 status mailer-pulse | head -5 || true
echo
echo "Pronto. Logs ao vivo:  journalctl -u mailer-pulse -f"

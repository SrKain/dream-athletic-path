#!/usr/bin/env bash
# =============================================================================
# TASK-117 — Mailer pulse (executor externo do Mailer na Hetzner)
# -----------------------------------------------------------------------------
# Chama POST /api/mailer/tick em loop. O motor (Vercel) envia os lotes pela
# Resend e devolve `nextTickInMs`; o pulse dorme esse tempo e chama de novo.
# Sem campanha rodando, o endpoint responde "idle" e o pulse espera
# PULSE_IDLE_SLEEP_SEC. Não envia e-mail, não acessa banco, não guarda estado.
#
# Variáveis (arquivo /opt/mailer-pulse/pulse.env, carregado pelo systemd):
#   MAILER_TICK_URL            obrigatório  ex.: https://portfolio.goteamgoagency.com/api/mailer/tick
#   MAILER_CRON_SECRET         obrigatório  mesmo valor configurado na Vercel
#   MAILER_EXECUTOR_NAME       opcional     default: hetzner-pulse  ([a-z0-9-], até 40)
#   PULSE_IDLE_SLEEP_SEC       opcional     default: 20
#   PULSE_MAX_SLEEP_SEC        opcional     default: 300 (teto para nextTickInMs)
#   PULSE_ERROR_SLEEP_MAX_SEC  opcional     default: 120 (teto do backoff em falhas)
#   PULSE_ALERT_WEBHOOK_URL    opcional     Slack/Discord/ntfy: recebe alerta de falhas seguidas
#   PULSE_ALERT_AFTER_FAILURES opcional     default: 5
# =============================================================================
set -uo pipefail

: "${MAILER_TICK_URL:?MAILER_TICK_URL não definido}"
: "${MAILER_CRON_SECRET:?MAILER_CRON_SECRET não definido}"
EXECUTOR="${MAILER_EXECUTOR_NAME:-hetzner-pulse}"
IDLE_SLEEP="${PULSE_IDLE_SLEEP_SEC:-20}"
MAX_SLEEP="${PULSE_MAX_SLEEP_SEC:-300}"
ERROR_SLEEP_MAX="${PULSE_ERROR_SLEEP_MAX_SEC:-120}"
ALERT_URL="${PULSE_ALERT_WEBHOOK_URL:-}"
ALERT_AFTER="${PULSE_ALERT_AFTER_FAILURES:-5}"

for bin in curl jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "dependência ausente: $bin" >&2; exit 1; }
done

log() { printf '%s %s\n' "$(date -Is)" "$*"; }

# Segredo vai por arquivo de header (não aparece em `ps`).
WORKDIR="$(mktemp -d)"
HDR="$WORKDIR/headers"
BODY="$WORKDIR/body"
umask 077
{
  printf 'x-mailer-cron-secret: %s\n' "$MAILER_CRON_SECRET"
  printf 'x-mailer-executor: %s\n' "$EXECUTOR"
  printf 'content-type: application/json\n'
} >"$HDR"
unset MAILER_CRON_SECRET
trap 'rm -rf "$WORKDIR"; log "pulse encerrado"; exit 0' TERM INT

alert() {
  [ -n "$ALERT_URL" ] || return 0
  local payload
  payload="$(jq -nc --arg t "$1" '{text: $t, content: $t}')"
  curl -sS -m 10 -X POST -H 'content-type: application/json' -d "$payload" "$ALERT_URL" >/dev/null 2>&1 || true
}

fails=0
alerted=0
log "pulse iniciado executor=$EXECUTOR url=$MAILER_TICK_URL idle=${IDLE_SLEEP}s"

while true; do
  code="$(curl -sS -o "$BODY" -w '%{http_code}' -m 60 -X POST -H @"$HDR" -d '{}' "$MAILER_TICK_URL" 2>/dev/null)" || code="000"

  if [ "$code" = "200" ]; then
    if [ "$alerted" = "1" ]; then
      log "recuperado após $fails falhas"
      alert "✅ Mailer pulse ($EXECUTOR) recuperado após $fails falhas."
    fi
    fails=0
    alerted=0

    status="$(jq -r '.status // .campaignStatus // empty' "$BODY" 2>/dev/null)"
    next="$(jq -r '.nextTickInMs // empty' "$BODY" 2>/dev/null)"

    if [ "$status" != "idle" ] && [ -n "$status" ]; then
      log "$(jq -r '"tick campanha=\(.campaignId // "-") status=\(.campaignStatus // "-") aceitos=\(.acceptedInTick // 0) falhas=\(.failedInTick // 0) lotes=\(.batchesProcessed // 0) próximo=\(if .nextTickInMs then "\(.nextTickInMs)ms" else "fim/ocioso" end)\(if .message then " msg=\(.message)" else "" end)"' "$BODY" 2>/dev/null)"
    fi

    if [[ "$next" =~ ^[0-9]+$ ]]; then
      s=$(( (next + 999) / 1000 ))
      (( s < 1 )) && s=1
      (( s > MAX_SLEEP )) && s=$MAX_SLEEP
      sleep "$s"
    else
      sleep "$IDLE_SLEEP"
    fi
  else
    fails=$((fails + 1))
    log "falha http=$code tentativa=$fails resposta=$(head -c 300 "$BODY" 2>/dev/null | tr '\n' ' ')"
    if [ "$code" = "401" ]; then
      log "401: MAILER_CRON_SECRET da Hetzner diferente do da Vercel (ou não configurado lá)"
    fi
    if (( fails >= ALERT_AFTER )) && [ "$alerted" = "0" ]; then
      alert "⚠️ Mailer pulse ($EXECUTOR): $fails falhas seguidas (último http=$code). Disparos podem estar parados."
      alerted=1
    fi
    s=$(( 5 * fails ))
    (( s > ERROR_SLEEP_MAX )) && s=$ERROR_SLEEP_MAX
    sleep "$s"
  fi
done

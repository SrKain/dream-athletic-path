/**
 * scripts/backfill-resend-events.ts
 *
 * Script de emergência / recuperação de eventos de e-mail pela API do Resend.
 * Lê os últimos N envios de recruit_email_logs com provider_id, consulta a API
 * oficial do Resend (resend.emails.get) e reconstrói os eventos (delivered/opened/clicked/bounced)
 * salvando-os em email_events com deduplicação via svix_id.
 *
 * NOTA DE LIMITAÇÃO DA API RESEND:
 * A chamada `resend.emails.get(id)` retorna o status geral e `last_event`, mas NÃO
 * expõe URLs individuais clicadas nem cabeçalhos User-Agent dos scanners. O fluxo
 * recomendado primário é sempre reenviar as tentativas falhadas diretamente pelo
 * painel do Resend (Webhooks -> Selecionar tentativa -> Resend / Replay).
 *
 * Uso:
 *   bun scripts/backfill-resend-events.ts [--limit=50] [--dry-run]
 */

import { getAdminClient } from "../src/lib/supabase/clients.server";
import { getResendClient, getResendConfig } from "../src/lib/email/resend-client.server";

interface CommandLineArgs {
  limit: number;
  dryRun: boolean;
}

function parseArgs(): CommandLineArgs {
  const args = process.argv.slice(2);
  let limit = 50;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith("--limit=")) {
      const parsed = parseInt(arg.replace("--limit=", ""), 10);
      if (!isNaN(parsed) && parsed > 0) limit = parsed;
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return { limit, dryRun };
}

async function main() {
  const { limit, dryRun } = parseArgs();
  console.log(`[backfill-resend-events] Iniciando recuperação de eventos...`);
  console.log(`[backfill-resend-events] Limite: ${limit} e-mails | Modo Dry-Run: ${dryRun}`);

  const resend = getResendClient();
  const config = getResendConfig();

  if (!resend || !config.apiKey) {
    console.error("[backfill-resend-events] ERRO: RESEND_API_KEY não configurada.");
    process.exit(1);
  }

  const admin = getAdminClient();
  if (!admin) {
    console.error("[backfill-resend-events] ERRO: Supabase admin client não configurado.");
    process.exit(1);
  }

  // 1. Buscar últimos N logs enviados com provider_id
  const { data: logs, error: logsError } = await admin
    .from("recruit_email_logs")
    .select("id, provider_id, recipient_email, subject, campaign_id, athlete_id, sent_at")
    .eq("status", "sent")
    .not("provider_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (logsError) {
    console.error("[backfill-resend-events] Erro ao buscar recruit_email_logs:", logsError.message);
    process.exit(1);
  }

  if (!logs || logs.length === 0) {
    console.log("[backfill-resend-events] Nenhum log com provider_id encontrado para processar.");
    return;
  }

  console.log(`[backfill-resend-events] Encontrados ${logs.length} logs com provider_id.`);

  let recoveredCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const log of logs) {
    const providerId = log.provider_id as string;
    try {
      const resendRes = await resend.emails.get(providerId);

      if (resendRes.error || !resendRes.data) {
        console.warn(
          `[backfill-resend-events] Provider ID ${providerId}: erro na API Resend (${resendRes.error?.message || "sem dados"}).`,
        );
        errorCount++;
        continue;
      }

      const emailData = resendRes.data as {
        id: string;
        last_event?: string;
        created_at?: string;
        to?: string[];
      };

      const lastEvent = emailData.last_event?.toLowerCase();
      if (!lastEvent) {
        skippedCount++;
        continue;
      }

      const normalizedEventType = lastEvent.startsWith("email.") ? lastEvent : `email.${lastEvent}`;
      const svixId = `backfill_${providerId}_${lastEvent}`;
      const recipient = (log.recipient_email as string) || (emailData.to?.[0] ?? "");

      const eventRow = {
        svix_id: svixId,
        provider_event_id: svixId,
        provider_email_id: providerId,
        event_type: normalizedEventType,
        recipient,
        recipient_email: recipient,
        subject: (log.subject as string) || null,
        campaign_id: (log.campaign_id as string) || null,
        athlete_id: (log.athlete_id as string) || null,
        occurred_at: emailData.created_at || log.sent_at || new Date().toISOString(),
        tags: { source: "resend_api_backfill" },
        payload: {
          source: "resend_api_backfill",
          resend_data: emailData,
        },
      };

      if (dryRun) {
        console.log(
          `[DRY-RUN] Simularia upsert para ${recipient} (evento: ${normalizedEventType})`,
        );
      } else {
        const { error: upsertErr } = await admin
          .from("email_events")
          .upsert(eventRow, { onConflict: "svix_id" });

        if (upsertErr) {
          console.error(
            `[backfill-resend-events] Erro ao persistir evento para ${providerId}:`,
            upsertErr.message,
          );
          errorCount++;
          continue;
        }
      }

      recoveredCount++;
    } catch (err) {
      console.error(`[backfill-resend-events] Falha ao processar provider_id ${providerId}:`, err);
      errorCount++;
    }
  }

  console.log("\n--- Relatório de Backfill Resend ---");
  console.log(`Total analisado: ${logs.length}`);
  console.log(`Eventos recuperados/atualizados: ${recoveredCount}`);
  console.log(`Ignorados (sem evento): ${skippedCount}`);
  console.log(`Erros: ${errorCount}`);
  console.log(
    "\nLembrete: URLs individuais de clique e IPs/User-Agents detalhados só são transmitidos em tempo real via Webhook Resend.",
  );
  console.log(
    "Caso necessite do histórico exato de cliques com URLs, utilize o botão 'Resend' no painel de Webhooks da Resend.",
  );
}

main().catch((err) => {
  console.error("[backfill-resend-events] Erro fatal:", err);
  process.exit(1);
});

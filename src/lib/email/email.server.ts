import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { getAdminClient } from "@/lib/supabase/clients.server";
import { getSesClient, getSesConfig } from "./ses-client.server";
import { renderEmail, type EmailTemplate } from "./templates";
import {
  isWithinSendingWindow,
  getNextSendingWindowStart,
  getNextWindowDescription,
} from "./sending-window";

/**
 * Serviço centralizado de e-mail (Amazon SES).
 * Todo disparo da plataforma passa por aqui e é registrado em `email_log`.
 */
export interface SendEmailInput {
  template: EmailTemplate;
  to: string;
  data?: Record<string, string | number | undefined>;
  /**
   * If true, checks sending window and schedules email if outside allowed hours.
   * Default: false (sends immediately regardless of time)
   */
  respectSendingWindow?: boolean;
}

export type SendEmailResult =
  | {
      sent: true;
      scheduled: false;
      id?: string;
    }
  | {
      sent: true;
      scheduled: true;
      scheduledFor: string;
      windowDescription: string;
      id?: string;
    }
  | {
      sent: false;
      reason: "not_configured" | "provider_error";
    };

export async function sendEmail({
  template,
  to,
  data = {},
  respectSendingWindow = false,
}: SendEmailInput): Promise<SendEmailResult> {
  const sesConfig = getSesConfig();
  const from = sesConfig.from;
  const { subject, html } = renderEmail(template, data);

  if (!sesConfig.isConfigured) {
    console.warn(
      `[email] Credenciais AWS SES ausentes (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) — disparo "${template}" não enviado.`,
    );
    await logEmail({
      template,
      to,
      subject,
      status: "skipped",
      error: "missing_aws_credentials",
      data,
    });
    return { sent: false, reason: "not_configured" };
  }

  const now = new Date();
  const shouldSchedule = respectSendingWindow && !isWithinSendingWindow(now);

  try {
    if (shouldSchedule) {
      // Fila de agendamento: registra em email_log para envio na próxima janela
      const nextWindow = getNextSendingWindowStart(now);
      const scheduledAt = nextWindow.toISOString();
      const windowDesc = getNextWindowDescription(now);

      await logEmail({
        template,
        to,
        subject,
        status: "scheduled",
        scheduledFor: scheduledAt,
        data,
      });

      return {
        sent: true,
        scheduled: true,
        scheduledFor: scheduledAt,
        windowDescription: windowDesc,
      };
    } else {
      // Envio imediato via Amazon SES
      const sesClient = getSesClient();
      if (!sesClient) {
        throw new Error("Falha ao inicializar o cliente Amazon SES");
      }

      const command = new SendEmailCommand({
        FromEmailAddress: from,
        Destination: {
          ToAddresses: [to],
        },
        Content: {
          Simple: {
            Subject: {
              Data: subject,
              Charset: "UTF-8",
            },
            Body: {
              Html: {
                Data: html,
                Charset: "UTF-8",
              },
            },
          },
        },
        ConfigurationSetName: sesConfig.configurationSet || undefined,
      });

      const result = await sesClient.send(command);
      const messageId = result.MessageId;

      await logEmail({
        template,
        to,
        subject,
        status: "sent",
        providerId: messageId,
        data,
      });

      return { sent: true, scheduled: false, id: messageId };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error(`[email] falha ao enviar "${template}" via SES:`, message);
    await logEmail({ template, to, subject, status: "failed", error: message, data });
    return { sent: false, reason: "provider_error" };
  }
}

/**
 * Processador de fila de e-mails agendados.
 * Busca registros pendentes com `status = 'scheduled'` e `scheduled_for <= now()`
 * e realiza o disparo via Amazon SES.
 */
export async function processScheduledEmails(): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  const sesConfig = getSesConfig();
  const sesClient = getSesClient();

  if (!sesConfig.isConfigured || !sesClient) {
    console.warn("[email-scheduler] SES não configurado. Processamento adiado.");
    return { processed: 0, successful: 0, failed: 0 };
  }

  const admin = getAdminClient();
  const now = new Date().toISOString();

  const { data: scheduledEmails, error } = await admin
    .from("email_log")
    .select("id, template, to_email, subject, payload")
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(50);

  if (error || !scheduledEmails || scheduledEmails.length === 0) {
    return { processed: 0, successful: 0, failed: 0 };
  }

  let successful = 0;
  let failed = 0;

  for (const item of scheduledEmails) {
    try {
      const { subject, html } = renderEmail(
        item.template as EmailTemplate,
        (item.payload as Record<string, string | number | undefined>) || {},
      );

      const command = new SendEmailCommand({
        FromEmailAddress: sesConfig.from,
        Destination: {
          ToAddresses: [item.to_email],
        },
        Content: {
          Simple: {
            Subject: { Data: subject || item.subject || "Notification", Charset: "UTF-8" },
            Body: { Html: { Data: html, Charset: "UTF-8" } },
          },
        },
        ConfigurationSetName: sesConfig.configurationSet || undefined,
      });

      const response = await sesClient.send(command);

      await admin
        .from("email_log")
        .update({
          status: "sent",
          provider_id: response.MessageId ?? null,
          error: null,
        })
        .eq("id", item.id);

      successful++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Scheduled send failure";
      console.error(`[email-scheduler] Falha ao disparar agendado ${item.id}:`, errorMsg);

      await admin
        .from("email_log")
        .update({
          status: "failed",
          error: errorMsg,
        })
        .eq("id", item.id);

      failed++;
    }
  }

  return {
    processed: scheduledEmails.length,
    successful,
    failed,
  };
}

async function logEmail(entry: {
  template: string;
  to: string;
  subject: string;
  status: string;
  providerId?: string;
  error?: string;
  scheduledFor?: string;
  data?: Record<string, unknown>;
}) {
  try {
    const admin = getAdminClient();
    await admin.from("email_log").insert({
      template: entry.template,
      to_email: entry.to,
      subject: entry.subject,
      status: entry.status,
      provider_id: entry.providerId ?? null,
      error: entry.error ?? null,
      scheduled_for: entry.scheduledFor ?? null,
      payload: entry.data ?? null,
    });
  } catch {
    // Log de e-mail nunca deve derrubar o fluxo principal.
  }
}

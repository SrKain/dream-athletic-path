import { getAdminClient } from "@/lib/supabase/clients.server";
import { getResendClient, getResendConfig } from "./resend-client.server";
import { renderEmail, type EmailTemplate } from "./templates";
import {
  isWithinSendingWindow,
  getNextSendingWindowStart,
  getNextWindowDescription,
} from "./sending-window";

/**
 * Serviço centralizado de e-mail (Resend).
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
  const resendConfig = getResendConfig();
  const from = resendConfig.from;
  const { subject, html } = renderEmail(template, data);
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!resendConfig.isConfigured) {
    console.warn(
      `[email] Chave Resend ausente (RESEND_API_KEY) — disparo "${template}" não enviado.`,
    );
    await logEmail({
      template,
      to,
      subject,
      status: "skipped",
      error: "missing_resend_api_key",
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
      // Envio imediato via Resend
      const resendClient = getResendClient();
      if (!resendClient) {
        throw new Error("Falha ao inicializar o cliente Resend");
      }

      const response = await resendClient.emails.send({
        from,
        to: [to],
        subject,
        html,
        text,
      });

      if (response.error) {
        throw new Error(response.error.message || "Resend send failed");
      }

      const messageId = response.data?.id;

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
    console.error(`[email] falha ao enviar "${template}" via Resend:`, message);
    await logEmail({ template, to, subject, status: "failed", error: message, data });
    return { sent: false, reason: "provider_error" };
  }
}

/**
 * Processador de fila de e-mails agendados.
 * Busca registros pendentes com `status = 'scheduled'` e `scheduled_for <= now()`
 * e realiza o disparo via Resend.
 */
export async function processScheduledEmails(): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  const resendConfig = getResendConfig();
  const resendClient = getResendClient();

  if (!resendConfig.isConfigured || !resendClient) {
    console.warn("[email-scheduler] Resend não configurado. Processamento adiado.");
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

      const text = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const response = await resendClient.emails.send({
        from: resendConfig.from,
        to: [item.to_email],
        subject: subject || item.subject || "Notification",
        html,
        text,
      });

      if (response.error) {
        throw new Error(response.error.message || "Resend scheduled send failed");
      }

      await admin
        .from("email_log")
        .update({
          status: "sent",
          provider_id: response.data?.id ?? null,
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

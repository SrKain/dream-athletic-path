import { Resend } from "resend";

import { getAdminClient } from "@/lib/supabase/clients.server";
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

export async function sendEmail({
  template,
  to,
  data = {},
  respectSendingWindow = false,
}: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Go Team Go <onboarding@resend.dev>";
  const { subject, html } = renderEmail(template, data);

  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY ausente — disparo "${template}" não enviado.`);
    await logEmail({ template, to, subject, status: "skipped", error: "missing_api_key", data });
    return { sent: false as const, reason: "not_configured" as const };
  }

  const now = new Date();
  const shouldSchedule = respectSendingWindow && !isWithinSendingWindow(now);

  try {
    const resend = new Resend(apiKey);

    if (shouldSchedule) {
      // Schedule for next available window
      const nextWindow = getNextSendingWindowStart(now);
      const scheduledAt = nextWindow.toISOString();
      const windowDesc = getNextWindowDescription(now);

      const result = await resend.emails.send({
        from,
        to,
        subject,
        html,
        scheduledAt,
      });

      if (result.error) throw new Error(result.error.message);

      await logEmail({
        template,
        to,
        subject,
        status: "scheduled",
        providerId: result.data?.id,
        scheduledFor: scheduledAt,
        data,
      });

      return {
        sent: true as const,
        scheduled: true as const,
        scheduledFor: scheduledAt,
        windowDescription: windowDesc,
        id: result.data?.id,
      };
    } else {
      // Send immediately
      const result = await resend.emails.send({ from, to, subject, html });
      if (result.error) throw new Error(result.error.message);

      await logEmail({
        template,
        to,
        subject,
        status: "sent",
        providerId: result.data?.id,
        data,
      });

      return { sent: true as const, scheduled: false as const, id: result.data?.id };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error(`[email] falha ao enviar "${template}":`, message);
    await logEmail({ template, to, subject, status: "failed", error: message, data });
    return { sent: false as const, reason: "provider_error" as const };
  }
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

import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/clients.server";
import { getResendConfig } from "./resend-client.server";

export interface ResendWebhookResult {
  success: boolean;
  type: string;
  message?: string;
  processedEmails?: string[];
}

export interface ResendWebhookEvent {
  type:
    | "email.sent"
    | "email.delivered"
    | "email.delivery_delayed"
    | "email.complained"
    | "email.bounced"
    | "email.opened"
    | "email.clicked"
    | string;
  created_at?: string;
  data?: {
    id?: string;
    email_id?: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
    created_at?: string;
    bounce_type?: string;
    [key: string]: unknown;
  };
}

export interface WebhookHeaders {
  "svix-id"?: string | null;
  "svix-timestamp"?: string | null;
  "svix-signature"?: string | null;
  [key: string]: string | string[] | null | undefined;
}

/**
 * Valida a assinatura de webhooks do Resend (formato Svix HMAC SHA256).
 * Se o secret não estiver configurado no ambiente, permite a execução com aviso.
 */
export function verifyResendWebhookSignature(
  rawBody: string,
  headers: WebhookHeaders,
  secret?: string,
): { valid: boolean; error?: string } {
  const webhookSecret = secret || getResendConfig().webhookSecret;
  if (!webhookSecret) {
    // Modo permissivo quando secret não estiver configurado
    return { valid: true };
  }

  const rawId = headers["svix-id"] || headers["Svix-Id"];
  const rawTimestamp = headers["svix-timestamp"] || headers["Svix-Timestamp"];
  const rawSignature = headers["svix-signature"] || headers["Svix-Signature"];

  const svixId = typeof rawId === "string" ? rawId : undefined;
  const svixTimestamp = typeof rawTimestamp === "string" ? rawTimestamp : undefined;
  const svixSignature = typeof rawSignature === "string" ? rawSignature : undefined;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valid: false, error: "Missing Svix verification headers" };
  }

  // Prevenir replay attack (janela de tolerância de 5 minutos)
  const timestampSec = parseInt(svixTimestamp, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (isNaN(timestampSec) || Math.abs(nowSec - timestampSec) > 300) {
    return { valid: false, error: "Timestamp outside tolerance window" };
  }

  try {
    const cleanSecret = webhookSecret.startsWith("whsec_") ? webhookSecret.slice(6) : webhookSecret;
    const secretBuffer = Buffer.from(cleanSecret, "base64");
    const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;

    const expectedSignature = crypto
      .createHmac("sha256", secretBuffer)
      .update(signedPayload)
      .digest("base64");

    const passedSignatures = svixSignature.split(" ").map((sig) => {
      const parts = sig.split(",");
      return parts.length === 2 ? parts[1] : parts[0];
    });

    const isMatch = passedSignatures.some((sig) => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(sig, "utf-8"),
          Buffer.from(expectedSignature, "utf-8"),
        );
      } catch {
        return false;
      }
    });

    if (!isMatch) {
      return { valid: false, error: "Signature mismatch" };
    }

    return { valid: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verification error";
    return { valid: false, error: msg };
  }
}

/**
 * Processa um webhook recebido do Resend.
 * Lida com eventos de bounce e complaint gravando em `email_suppressions`.
 */
export async function processResendWebhook(
  rawPayload: string | Record<string, unknown>,
  headers: WebhookHeaders = {},
): Promise<ResendWebhookResult> {
  const rawString = typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload);

  // 1. Verificação de assinatura
  const verification = verifyResendWebhookSignature(rawString, headers);
  if (!verification.valid) {
    console.error("[resend-webhook] Security verification failed:", verification.error);
    return {
      success: false,
      type: "Unauthorized",
      message: verification.error || "Invalid webhook signature",
    };
  }

  // 2. Parse do payload
  let event: ResendWebhookEvent;
  try {
    event = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  } catch (err) {
    console.error("[resend-webhook] Invalid JSON payload:", err);
    return { success: false, type: "Unknown", message: "Invalid JSON format" };
  }

  const eventType = event.type || "unknown";
  const data = event.data;

  if (!data) {
    return {
      success: true,
      type: eventType,
      message: "Event received without data payload",
    };
  }

  const rawRecipients = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];
  const processedEmails: string[] = [];
  const admin = getAdminClient();

  // 3. Ingestão Idempotente na tabela email_events
  const rawSvixId = headers["svix-id"] || headers["Svix-Id"];
  const svixId = typeof rawSvixId === "string" ? rawSvixId : undefined;
  const providerEmailId = String(data.email_id || data.id || "");
  const occurredAt = event.created_at || data.created_at || new Date().toISOString();
  const baseEventId = svixId || `${providerEmailId || "resend"}_${eventType}_${occurredAt}`;

  const clickData = (data.click as Record<string, unknown> | undefined) || undefined;
  const clickedLink =
    clickData?.link ||
    (typeof (data as Record<string, unknown>).link === "string"
      ? (data as Record<string, unknown>).link
      : null);

  for (const rawTo of rawRecipients) {
    const email = (rawTo || "").toLowerCase().trim();
    if (!email) continue;

    const eventId = rawRecipients.length > 1 ? `${baseEventId}_${email}` : baseEventId;

    try {
      await admin.from("email_events").upsert(
        {
          provider: "resend",
          provider_event_id: eventId,
          provider_email_id: providerEmailId,
          event_type: eventType,
          recipient: email,
          occurred_at: occurredAt,
          payload: {
            from: data.from,
            subject: data.subject,
            bounce_type: data.bounce_type,
            click: clickData,
            clicked_link: clickedLink,
          },
          created_at: new Date().toISOString(),
        },
        { onConflict: "provider_event_id", ignoreDuplicates: true },
      );
      processedEmails.push(email);
    } catch (ingestErr) {
      // Falhas no log de evento não devem quebrar o webhook
      console.warn(`[resend-webhook] Failed to ingest event ${eventId}:`, ingestErr);
    }
  }

  // 4. Processamento de Bounces (E-mails inexistentes, caixas cheias ou rejeitadas)
  if (eventType === "email.bounced") {
    const reason = `resend_bounce${data.bounce_type ? `_${data.bounce_type.toLowerCase()}` : ""}`;
    for (const rawTo of rawRecipients) {
      const email = (rawTo || "").toLowerCase().trim();
      if (!email || !email.includes("@")) continue;

      const { error } = await admin
        .from("email_suppressions")
        .upsert({ email, reason }, { onConflict: "email" });

      if (error) {
        console.error(`[resend-webhook] Failed to suppress bounced email ${email}:`, error.message);
      } else {
        console.info(`[resend-webhook] Suppressed bounced email: ${email} (Reason: ${reason})`);
      }
    }

    return {
      success: true,
      type: "email.bounced",
      processedEmails,
      message: `Processed ${processedEmails.length} bounce suppression(s)`,
    };
  }

  // 5. Processamento de Complaints (Spam / Denúncia)
  if (eventType === "email.complained") {
    const reason = "resend_complaint";
    for (const rawTo of rawRecipients) {
      const email = (rawTo || "").toLowerCase().trim();
      if (!email || !email.includes("@")) continue;

      const { error } = await admin
        .from("email_suppressions")
        .upsert({ email, reason }, { onConflict: "email" });

      if (error) {
        console.error(
          `[resend-webhook] Failed to suppress complained email ${email}:`,
          error.message,
        );
      } else {
        console.info(`[resend-webhook] Suppressed complained email: ${email} (Reason: ${reason})`);
      }
    }

    return {
      success: true,
      type: "email.complained",
      processedEmails,
      message: `Processed ${processedEmails.length} complaint suppression(s)`,
    };
  }

  // 6. Demais eventos registrados com sucesso (email.sent, email.delivered, email.opened, email.clicked, etc.)
  return {
    success: true,
    type: eventType,
    processedEmails,
    message: `Event ${eventType} recorded successfully for ${processedEmails.length} recipient(s)`,
  };
}

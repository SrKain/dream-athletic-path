import { getAdminClient } from "@/lib/supabase/clients.server";

export interface SnsWebhookResult {
  success: boolean;
  type: string;
  message?: string;
  processedEmails?: string[];
}

interface SnsBaseMessage {
  Type: "SubscriptionConfirmation" | "Notification" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
  SubscribeURL?: string;
  Token?: string;
}

interface SesBounceRecipient {
  emailAddress: string;
  action?: string;
  status?: string;
  diagnosticCode?: string;
}

interface SesComplaintRecipient {
  emailAddress: string;
}

interface SesEventPayload {
  eventType?: "Bounce" | "Complaint" | "Delivery" | "Send" | "Reject" | "Open" | "Click";
  notificationType?: "Bounce" | "Complaint" | "Delivery";
  bounce?: {
    bounceType?: string;
    bounceSubType?: string;
    bouncedRecipients?: SesBounceRecipient[];
    timestamp?: string;
    feedbackId?: string;
  };
  complaint?: {
    complainedRecipients?: SesComplaintRecipient[];
    timestamp?: string;
    feedbackId?: string;
    complaintFeedbackType?: string;
  };
  mail?: {
    messageId?: string;
    destination?: string[];
    source?: string;
  };
}

/**
 * Processa uma notificação do Amazon SNS recebida via webhook HTTP.
 * Lida com:
 * 1. SubscriptionConfirmation (faz fetch automático na SubscribeURL segura da AWS)
 * 2. Notification com eventos de Bounce e Complaint do SES (adiciona em email_suppressions)
 */
export async function processSnsWebhook(
  rawPayload: string | Record<string, unknown>,
): Promise<SnsWebhookResult> {
  let snsPayload: SnsBaseMessage;

  if (typeof rawPayload === "string") {
    try {
      snsPayload = JSON.parse(rawPayload) as SnsBaseMessage;
    } catch (err) {
      console.error("[ses-webhook] Invalid JSON payload:", err);
      return { success: false, type: "Unknown", message: "Invalid JSON format" };
    }
  } else {
    snsPayload = rawPayload as unknown as SnsBaseMessage;
  }

  const messageType = snsPayload.Type;

  // 1. Tratamento de Confirmação de Assinatura do SNS
  if (messageType === "SubscriptionConfirmation") {
    const subscribeUrl = snsPayload.SubscribeURL;
    if (!subscribeUrl) {
      console.error("[ses-webhook] Missing SubscribeURL in SubscriptionConfirmation");
      return { success: false, type: "SubscriptionConfirmation", message: "Missing SubscribeURL" };
    }

    try {
      // Validação de segurança: a URL deve ser estritamente do domínio amazonaws.com
      const parsedUrl = new URL(subscribeUrl);
      if (
        !parsedUrl.hostname.endsWith(".amazonaws.com") &&
        parsedUrl.hostname !== "sns.amazonaws.com"
      ) {
        console.error("[ses-webhook] Untrusted SubscribeURL host:", parsedUrl.hostname);
        return { success: false, type: "SubscriptionConfirmation", message: "Untrusted host" };
      }

      console.info("[ses-webhook] Auto-confirming SNS Subscription from URL:", subscribeUrl);
      const res = await fetch(subscribeUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      console.info(
        "[ses-webhook] SNS Subscription confirmed successfully for topic:",
        snsPayload.TopicArn,
      );
      return { success: true, type: "SubscriptionConfirmation", message: "Subscription confirmed" };
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : "Fetch error";
      console.error("[ses-webhook] Failed to confirm subscription:", msg);
      return { success: false, type: "SubscriptionConfirmation", message: msg };
    }
  }

  // 2. Tratamento de Notificações de Eventos SES
  if (messageType === "Notification") {
    let sesData: SesEventPayload;

    try {
      sesData =
        typeof snsPayload.Message === "string"
          ? (JSON.parse(snsPayload.Message) as SesEventPayload)
          : (snsPayload.Message as unknown as SesEventPayload);
    } catch (parseErr) {
      console.error("[ses-webhook] Failed to parse SNS Message JSON:", parseErr);
      return { success: false, type: "Notification", message: "Invalid SES message JSON" };
    }

    const eventType = sesData.eventType || sesData.notificationType;
    const admin = getAdminClient();
    const processedEmails: string[] = [];

    if (eventType === "Bounce" && sesData.bounce?.bouncedRecipients) {
      for (const recipient of sesData.bounce.bouncedRecipients) {
        const email = (recipient.emailAddress || "").toLowerCase().trim();
        if (!email || !email.includes("@")) continue;

        const reason = `ses_bounce${sesData.bounce.bounceType ? `_${sesData.bounce.bounceType.toLowerCase()}` : ""}`;
        const { error } = await admin
          .from("email_suppressions")
          .upsert({ email, reason }, { onConflict: "email" });

        if (error) {
          console.error(`[ses-webhook] Failed to suppress bounced email ${email}:`, error.message);
        } else {
          console.info(`[ses-webhook] Suppressed bounced email: ${email} (Reason: ${reason})`);
          processedEmails.push(email);
        }
      }

      return {
        success: true,
        type: "Bounce",
        processedEmails,
        message: `Processed ${processedEmails.length} bounce suppression(s)`,
      };
    }

    if (eventType === "Complaint" && sesData.complaint?.complainedRecipients) {
      for (const recipient of sesData.complaint.complainedRecipients) {
        const email = (recipient.emailAddress || "").toLowerCase().trim();
        if (!email || !email.includes("@")) continue;

        const reason = "ses_complaint";
        const { error } = await admin
          .from("email_suppressions")
          .upsert({ email, reason }, { onConflict: "email" });

        if (error) {
          console.error(
            `[ses-webhook] Failed to suppress complained email ${email}:`,
            error.message,
          );
        } else {
          console.info(`[ses-webhook] Suppressed complained email: ${email} (Reason: ${reason})`);
          processedEmails.push(email);
        }
      }

      return {
        success: true,
        type: "Complaint",
        processedEmails,
        message: `Processed ${processedEmails.length} complaint suppression(s)`,
      };
    }

    // Outros eventos informativos (Delivery, Send, Open, Click, etc.) são aceitos sem erro
    return {
      success: true,
      type: eventType || "OtherNotification",
      message: "Notification received and acknowledged",
    };
  }

  return {
    success: true,
    type: messageType || "Unknown",
    message: "Event acknowledged",
  };
}

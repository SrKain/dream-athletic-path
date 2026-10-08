import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/clients.server";
import { getResendConfig } from "./resend-client.server";
import {
  extractTagsFromWebhookData,
  isStatelessAutomatedClick,
  parseAttributionFromClickedUrl,
} from "./mailer-metrics-quality";

export type ResendWebhookEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked"
  | "email.failed"
  | "email.suppressed"
  | (string & {});

export interface ResendWebhookPayload {
  type: ResendWebhookEventType;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string | string[];
    subject?: string;
    created_at?: string;
    tags?: Array<{ name: string; value: string }> | Record<string, string>;
    bounce?: {
      message?: string;
      type?: string;
      subType?: string;
    };
    click?: {
      ipAddress?: string;
      link?: string;
      timestamp?: string;
      userAgent?: string;
    };
    open?: {
      ipAddress?: string;
      timestamp?: string;
      userAgent?: string;
    };
    user_agent?: string;
    userAgent?: string;
  };
}

export type ResendWebhookEventPayload = ResendWebhookPayload;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value?: string | null): value is string {
  if (!value || typeof value !== "string") return false;
  return UUID_REGEX.test(value.trim());
}

/**
 * Verifica a assinatura Svix de um webhook do Resend quando RESEND_WEBHOOK_SECRET estiver configurado.
 * Em produção (VERCEL_ENV === "production"), falha fechado (false -> 401) se o segredo estiver ausente.
 * Permissivo sem segredo apenas em dev/test.
 */
export function verifyResendWebhookSignature(
  rawBody: string,
  headers: {
    svixId?: string | null;
    svixTimestamp?: string | null;
    svixSignature?: string | null;
    "svix-id"?: string | null;
    "svix-timestamp"?: string | null;
    "svix-signature"?: string | null;
    [key: string]: string | null | undefined;
  },
): boolean {
  const { webhookSecret } = getResendConfig();
  if (!webhookSecret) {
    const isVercelProd = process.env.VERCEL_ENV === "production";
    const isNodeProdWithoutPreview =
      process.env.NODE_ENV === "production" &&
      process.env.VERCEL_ENV !== "preview" &&
      process.env.VERCEL_ENV !== "development";

    if (isVercelProd || isNodeProdWithoutPreview) {
      console.error(
        "[resend-webhook] CRITICAL: RESEND_WEBHOOK_SECRET is not configured in production. Rejecting webhook (401).",
      );
      return false;
    }

    // Em dev/test sem secret configurado, aceita para facilitar testes locais
    return true;
  }

  const svixId = headers.svixId ?? headers["svix-id"] ?? headers["Svix-Id"] ?? null;
  const svixTimestamp =
    headers.svixTimestamp ?? headers["svix-timestamp"] ?? headers["Svix-Timestamp"] ?? null;
  const svixSignature =
    headers.svixSignature ?? headers["svix-signature"] ?? headers["Svix-Signature"] ?? null;
  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  try {
    const secretBase64 = webhookSecret.startsWith("whsec_")
      ? webhookSecret.slice("whsec_".length)
      : webhookSecret;
    const secretBytes = Buffer.from(secretBase64, "base64");
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac("sha256", secretBytes)
      .update(signedContent)
      .digest("base64");

    const signatures = svixSignature.split(" ");
    for (const sig of signatures) {
      const parts = sig.split(",");
      const sigValue = parts.length > 1 ? parts[1] : parts[0];
      if (sigValue === expectedSignature) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error("[resend-webhook] Signature verification error:", err);
    return false;
  }
}

export interface ProcessResendWebhookResult {
  processed: boolean;
  type?: string;
  eventType?: string;
  success?: boolean;
  processedEmails?: string[];
  suppressedCount: number;
  eventsLoggedCount: number;
  dbError?: boolean;
  errorMessage?: string;
}

export type WebhookHeadersInput = {
  svixId?: string | null;
  svixTimestamp?: string | null;
  svixSignature?: string | null;
  [key: string]: string | null | undefined;
};

/**
 * Processa eventos de webhook do Resend (sent, delivered, bounced, complained, opened, clicked,
 * failed, suppressed, delivery_delayed e eventos futuros desconhecidos).
 * Suporta tanto chamada direta `(payloadObj, svixId)` quanto `(rawBodyString, headersRecord)`.
 * - Persiste cada evento em `public.email_events` para relatórios de métricas do Mailer.
 * - NÃO persiste ipAddress por privacidade.
 * - Extrai tags, clicked_url, clicked_at, user_agent, campaign_id, athlete_id e is_probable_automated.
 * - Em caso de erro de banco no upsert, loga o erro e sinaliza `dbError: true` para retorno 5xx.
 */
export async function processResendWebhook(
  payloadOrRawBody: ResendWebhookPayload | string,
  svixIdOrHeaders?: string | null | WebhookHeadersInput,
): Promise<ProcessResendWebhookResult> {
  let payload: ResendWebhookPayload;
  let svixId: string | null = null;

  if (typeof payloadOrRawBody === "string") {
    const hdrs = svixIdOrHeaders && typeof svixIdOrHeaders === "object" ? svixIdOrHeaders : {};
    const extractedSvixId = hdrs.svixId ?? hdrs["svix-id"] ?? hdrs["Svix-Id"] ?? null;
    const extractedTimestamp =
      hdrs.svixTimestamp ?? hdrs["svix-timestamp"] ?? hdrs["Svix-Timestamp"] ?? null;
    const extractedSignature =
      hdrs.svixSignature ?? hdrs["svix-signature"] ?? hdrs["Svix-Signature"] ?? null;

    const isValid = verifyResendWebhookSignature(payloadOrRawBody, {
      svixId: extractedSvixId,
      svixTimestamp: extractedTimestamp,
      svixSignature: extractedSignature,
    });

    if (!isValid) {
      return {
        processed: false,
        type: "Unauthorized",
        suppressedCount: 0,
        eventsLoggedCount: 0,
      };
    }

    try {
      payload = JSON.parse(payloadOrRawBody) as ResendWebhookPayload;
    } catch {
      return {
        processed: false,
        type: "InvalidJson",
        suppressedCount: 0,
        eventsLoggedCount: 0,
      };
    }
    svixId = extractedSvixId;
  } else {
    payload = payloadOrRawBody;
    svixId = typeof svixIdOrHeaders === "string" ? svixIdOrHeaders : null;
  }

  if (!payload || !payload.type) {
    return { processed: false, suppressedCount: 0, eventsLoggedCount: 0 };
  }

  const admin = getAdminClient();
  const rawRecipients = payload.data?.to;
  const recipients: string[] = Array.isArray(rawRecipients)
    ? rawRecipients
    : typeof rawRecipients === "string"
      ? [rawRecipients]
      : [];

  const normalizedRecipients = recipients
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes("@"));

  const providerEmailId = payload.data?.email_id ?? null;
  const subject = payload.data?.subject ?? null;
  const occurredAt = payload.created_at ?? payload.data?.created_at ?? new Date().toISOString();

  // 1. Extrair tags do webhook
  const tagsMap = extractTagsFromWebhookData(payload.data?.tags);

  // 2. Extrair dados de clique sem ipAddress (privacidade estrita)
  const rawClick = payload.data?.click;
  const clickedUrl =
    typeof rawClick?.link === "string" && rawClick.link.trim() ? rawClick.link.trim() : null;
  const clickedAt =
    typeof rawClick?.timestamp === "string" && rawClick.timestamp.trim()
      ? rawClick.timestamp.trim()
      : payload.type === "email.clicked"
        ? occurredAt
        : null;
  const userAgent =
    (typeof rawClick?.userAgent === "string" && rawClick.userAgent.trim()
      ? rawClick.userAgent.trim()
      : null) ??
    (typeof payload.data?.open?.userAgent === "string" && payload.data.open.userAgent.trim()
      ? payload.data.open.userAgent.trim()
      : null) ??
    (typeof payload.data?.user_agent === "string" && payload.data.user_agent.trim()
      ? payload.data.user_agent.trim()
      : null) ??
    (typeof payload.data?.userAgent === "string" && payload.data.userAgent.trim()
      ? payload.data.userAgent.trim()
      : null);

  // 3. Resolver atribuição (campaign_id e athlete_id) a partir de tags, URL clicada ou log existente
  const urlAttribution = parseAttributionFromClickedUrl(clickedUrl);

  let campaignId: string | null = isValidUuid(tagsMap.campaign_id)
    ? tagsMap.campaign_id
    : isValidUuid(urlAttribution.campaignId)
      ? urlAttribution.campaignId
      : null;

  let athleteId: string | null = isValidUuid(tagsMap.athlete_id)
    ? tagsMap.athlete_id
    : isValidUuid(urlAttribution.athleteId)
      ? urlAttribution.athleteId
      : null;

  let deliveredOrSentAt: string | null = null;

  if (admin && providerEmailId) {
    // Se ainda não temos campaign_id ou athlete_id, ou se for um clique (para checar tempo desde entrega)
    try {
      if (!campaignId || !athleteId || payload.type === "email.clicked") {
        const logRes = await admin
          .from("recruit_email_logs")
          .select("campaign_id, athlete_id, sent_at")
          .eq("provider_id", providerEmailId)
          .limit(1)
          .maybeSingle();

        if (logRes?.data) {
          const row = logRes.data as {
            campaign_id?: string | null;
            athlete_id?: string | null;
            sent_at?: string | null;
          };
          if (!campaignId && isValidUuid(row.campaign_id)) {
            campaignId = row.campaign_id;
          }
          if (!athleteId && isValidUuid(row.athlete_id)) {
            athleteId = row.athlete_id;
          }
          if (row.sent_at) {
            deliveredOrSentAt = row.sent_at;
          }
        }
      }

      if (payload.type === "email.clicked") {
        const delivRes = await admin
          .from("email_events")
          .select("occurred_at")
          .eq("provider_email_id", providerEmailId)
          .in("event_type", ["email.delivered", "email.sent"])
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (delivRes?.data && (delivRes.data as { occurred_at?: string }).occurred_at) {
          deliveredOrSentAt = (delivRes.data as { occurred_at: string }).occurred_at;
        }
      }

      // Se a URL clicada tem o slug da atleta (ex: em campanha multi_athlete), resolve o UUID da atleta
      if (!athleteId && urlAttribution.athleteSlug) {
        const athRes = await admin
          .from("athletes")
          .select("id")
          .eq("slug", urlAttribution.athleteSlug)
          .limit(1)
          .maybeSingle();

        if (athRes?.data && isValidUuid((athRes.data as { id?: string }).id)) {
          athleteId = (athRes.data as { id: string }).id;
        }
      }
    } catch {
      // Continua normalmente caso uma consulta auxiliar de enriquecimento falhe em mock/test
    }
  }

  // 4. Regra sem estado (stateless) para clique automatizado (<= 10s após entrega/envio ou UA de scanner)
  const isProbableAutomated =
    payload.type === "email.clicked"
      ? isStatelessAutomatedClick({
          clickedAt: clickedAt ?? occurredAt,
          deliveredOrSentAt,
          userAgent,
        })
      : false;

  // 5. Persistir eventos na tabela `email_events` (sem ipAddress no payload)
  let eventsLoggedCount = 0;
  if (admin && normalizedRecipients.length > 0) {
    const sanitizedClick = rawClick
      ? {
          link: clickedUrl,
          timestamp: clickedAt,
          userAgent: userAgent,
        }
      : null;

    for (let idx = 0; idx < normalizedRecipients.length; idx++) {
      const email = normalizedRecipients[idx];
      const uniqueSvixId =
        svixId && svixId.trim()
          ? normalizedRecipients.length === 1
            ? svixId.trim()
            : `${svixId.trim()}:${idx}`
          : null;

      const eventRow: Record<string, unknown> = {
        svix_id: uniqueSvixId,
        provider_event_id: uniqueSvixId,
        provider_email_id: providerEmailId,
        event_type: payload.type,
        recipient: email,
        recipient_email: email,
        subject,
        campaign_id: campaignId,
        athlete_id: athleteId,
        clicked_url: clickedUrl,
        clicked_at: clickedAt,
        user_agent: userAgent,
        is_probable_automated: isProbableAutomated,
        occurred_at: occurredAt,
        tags: tagsMap,
        payload: {
          from: payload.data?.from ?? null,
          tags: tagsMap,
          bounce: payload.data?.bounce ?? null,
          click: sanitizedClick,
          clicked_link: clickedUrl,
        },
      };

      const upsertRes = uniqueSvixId
        ? await admin.from("email_events").upsert(eventRow, { onConflict: "svix_id" })
        : await admin.from("email_events").insert(eventRow);

      if (upsertRes?.error) {
        console.error(
          "[resend-webhook] Database error persisting email_events:",
          upsertRes.error.message,
          { svixId: uniqueSvixId, type: payload.type, providerEmailId },
        );
        return {
          processed: false,
          type: payload.type,
          eventType: payload.type,
          success: false,
          processedEmails: normalizedRecipients,
          suppressedCount: 0,
          eventsLoggedCount,
          dbError: true,
          errorMessage: upsertRes.error.message,
        };
      }

      eventsLoggedCount++;
    }
  }

  // 6. Em caso de bounce ou complaint, adicionar automaticamente à lista de supressão permanente
  if (payload.type === "email.bounced" || payload.type === "email.complained") {
    if (!admin || normalizedRecipients.length === 0) {
      return {
        processed: true,
        type: payload.type,
        eventType: payload.type,
        success: true,
        processedEmails: normalizedRecipients,
        suppressedCount: 0,
        eventsLoggedCount,
      };
    }

    const reason = payload.type === "email.bounced" ? "resend_bounce" : "resend_complaint";
    let suppressedCount = 0;

    for (const email of normalizedRecipients) {
      const supRes = await admin.from("email_suppressions").upsert(
        {
          email,
          reason,
          suppression_type: "permanent",
          expires_at: null,
          created_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      );

      if (supRes?.error) {
        console.error(
          "[resend-webhook] Database error upserting email_suppressions:",
          supRes.error.message,
          { email, reason },
        );
        return {
          processed: false,
          type: payload.type,
          eventType: payload.type,
          success: false,
          processedEmails: normalizedRecipients,
          suppressedCount,
          eventsLoggedCount,
          dbError: true,
          errorMessage: supRes.error.message,
        };
      }

      suppressedCount++;
    }

    return {
      processed: true,
      type: payload.type,
      eventType: payload.type,
      success: true,
      processedEmails: normalizedRecipients,
      suppressedCount,
      eventsLoggedCount,
    };
  }

  return {
    processed: true,
    type: payload.type,
    eventType: payload.type,
    success: true,
    processedEmails: normalizedRecipients,
    suppressedCount: 0,
    eventsLoggedCount,
  };
}

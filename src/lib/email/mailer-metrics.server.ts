import { getAdminClient } from "@/lib/supabase/clients.server";
import { getResendClient, getResendConfig } from "./resend-client.server";
import type {
  MailerMetricsReport,
  MailerMetricsTotals,
  MailerMetricsTimePoint,
  CampaignModePerformance,
  DeliveryProblemItem,
  EmailEvent,
} from "@/types/db";

export interface MailerMetricsFilterInput {
  range?: "7d" | "30d" | "90d" | "custom";
  startDate?: string;
  endDate?: string;
}

export interface EmailTimelineItem {
  id: string;
  eventType: string;
  occurredAt: string;
  details?: string | null;
  clickedLink?: string | null;
}

/**
 * Normaliza datas do filtro em ISO Strings seguras
 */
export function resolveDateRange(input?: MailerMetricsFilterInput): {
  startDate: string;
  endDate: string;
  granularity: "daily" | "hourly";
} {
  const range = input?.range || "30d";
  const now = new Date();
  const end = input?.endDate ? new Date(input.endDate) : now;

  let start: Date;
  let granularity: "daily" | "hourly" = "daily";

  if (range === "7d") {
    start = new Date(end);
    start.setDate(start.getDate() - 7);
  } else if (range === "90d") {
    start = new Date(end);
    start.setDate(start.getDate() - 90);
  } else if (range === "custom" && input?.startDate) {
    start = new Date(input.startDate);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 2) granularity = "hourly";
  } else {
    // Default 30d
    start = new Date(end);
    start.setDate(start.getDate() - 30);
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    granularity,
  };
}

/**
 * Consulta a Resend Email Metrics API oficial
 */
export async function fetchResendEmailMetrics(options: {
  startDate: string;
  endDate: string;
  granularity: "daily" | "hourly";
}) {
  const client = getResendClient();
  const config = getResendConfig();

  if (!client || !config.isConfigured) {
    return { data: null, error: { message: "Resend client not configured" } };
  }

  try {
    const res = await client.emails.metrics({
      startDate: options.startDate,
      endDate: options.endDate,
      granularity: options.granularity,
      dimensions: ["period"],
    });

    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Resend metrics";
    return { data: null, error: { message } };
  }
}

/**
 * Gera o relatório analítico consolidado do Mailer
 */
export async function getMailerMetricsReport(
  input?: MailerMetricsFilterInput,
): Promise<MailerMetricsReport> {
  const { startDate, endDate, granularity } = resolveDateRange(input);
  const config = getResendConfig();
  const admin = getAdminClient();

  // 1. Tentar obter métricas oficiais da Resend Email Metrics API
  const resendResult = await fetchResendEmailMetrics({
    startDate,
    endDate,
    granularity,
  });

  // 2. Consultar logs locais em paralelo para decomposição de campanhas e problemas de entrega
  const [logsRes, eventsRes] = await Promise.all([
    admin.from("recruit_email_logs").select("*").gte("sent_at", startDate).lte("sent_at", endDate),
    admin
      .from("email_events")
      .select("*")
      .gte("occurred_at", startDate)
      .lte("occurred_at", endDate)
      .order("occurred_at", { ascending: false })
      .limit(200),
  ]);

  const recruitLogs = logsRes.data || [];
  const rawEvents = (eventsRes.data as EmailEvent[]) || [];

  // 3. Montar dados por campanha/modo
  const singleLogs = recruitLogs.filter((l) => l.email_type === "athlete_teaser" || !l.email_type);
  const multiLogs = recruitLogs.filter((l) => l.email_type === "athlete_teaser_multi");
  const catalogLogs = recruitLogs.filter((l) => l.email_type === "catalog_general");

  const buildCampaignMetrics = (
    mode: "single_athlete" | "multi_athlete" | "catalog",
    label: string,
    logs: typeof recruitLogs,
  ): CampaignModePerformance => {
    const sent = logs.length;
    const delivered = logs.filter((l) => l.status === "sent").length;
    const providerIds = new Set(logs.map((l) => l.provider_id).filter(Boolean));
    const recipientEmails = new Set(
      logs.map((l) => l.recipient_email?.toLowerCase()).filter(Boolean),
    );

    const relatedEvents = rawEvents.filter(
      (e) => providerIds.has(e.provider_email_id) || recipientEmails.has(e.recipient.toLowerCase()),
    );

    const opened = relatedEvents.filter((e) => e.event_type === "email.opened").length;
    const clicked = relatedEvents.filter((e) => e.event_type === "email.clicked").length;
    const bounced =
      logs.filter((l) => l.status === "failed").length +
      relatedEvents.filter((e) => e.event_type === "email.bounced").length;

    const delivery_rate = sent > 0 ? Math.round((delivered / sent) * 1000) / 10 : 0;
    const open_rate = delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : 0;
    const click_rate = delivered > 0 ? Math.round((clicked / delivered) * 1000) / 10 : 0;

    return {
      mode,
      label,
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      delivery_rate,
      open_rate,
      click_rate,
    };
  };

  const campaigns: CampaignModePerformance[] = [
    buildCampaignMetrics("single_athlete", "Single Athlete Teasers", singleLogs),
    buildCampaignMetrics("multi_athlete", "Multi-Athlete Rosters", multiLogs),
    buildCampaignMetrics("catalog", "Catalog General Showcases", catalogLogs),
  ];

  // 4. Montar lista de problemas de entrega
  const deliveryProblems: DeliveryProblemItem[] = [];

  // Falhas diretas nos logs
  for (const failedLog of recruitLogs.filter((l) => l.status === "failed")) {
    deliveryProblems.push({
      id: failedLog.id,
      recipient: failedLog.recipient_email || "Unknown recipient",
      university_name: failedLog.university_name,
      event_type: "send_failed",
      reason: failedLog.error_message || "Delivery rejected by mail server",
      occurred_at: failedLog.sent_at,
    });
  }

  // Eventos de bounce, complaint ou delay gravados por webhook
  for (const evt of rawEvents) {
    if (
      evt.event_type === "email.bounced" ||
      evt.event_type === "email.complained" ||
      evt.event_type === "email.delivery_delayed" ||
      evt.event_type === "email.failed"
    ) {
      const payload = evt.payload || {};
      const bounceType = typeof payload.bounce_type === "string" ? payload.bounce_type : null;
      deliveryProblems.push({
        id: evt.id,
        recipient: evt.recipient,
        event_type: evt.event_type.replace("email.", ""),
        reason: bounceType
          ? `Bounce (${bounceType})`
          : (payload.reason as string) || evt.event_type,
        occurred_at: evt.occurred_at,
      });
    }
  }

  // Se a Resend Metrics API respondeu com dados válidos:
  if (resendResult.data && !resendResult.error) {
    const rawTotals = resendResult.data.totals || {};
    const sent = Number(rawTotals.sent ?? 0);
    const delivered = Number(rawTotals.delivered ?? 0);
    const opened = Number(rawTotals.opened ?? 0);
    const unique_opened = Number(rawTotals.unique_opened ?? opened);
    const clicked = Number(rawTotals.clicked ?? 0);
    const unique_clicked = Number(rawTotals.unique_clicked ?? clicked);
    const bounced = Number(rawTotals.bounced ?? 0);
    const bounced_permanent = Number(rawTotals.bounced_permanent ?? 0);
    const bounced_transient = Number(rawTotals.bounced_transient ?? 0);
    const delivery_delayed = Number(rawTotals.delivery_delayed ?? 0);
    const unsubscribed = Number(rawTotals.unsubscribed ?? 0);
    const complained = Number(rawTotals.complained ?? 0);
    const failed = Number(rawTotals.failed ?? 0);
    const suppressed = Number(rawTotals.suppressed ?? 0);

    const delivery_rate =
      rawTotals.delivery_rate !== undefined
        ? Number(rawTotals.delivery_rate)
        : sent > 0
          ? Math.round((delivered / sent) * 1000) / 10
          : 0;

    const open_rate =
      rawTotals.open_rate !== undefined
        ? Number(rawTotals.open_rate)
        : delivered > 0
          ? Math.round((opened / delivered) * 1000) / 10
          : 0;

    const click_rate =
      rawTotals.click_rate !== undefined
        ? Number(rawTotals.click_rate)
        : delivered > 0
          ? Math.round((clicked / delivered) * 1000) / 10
          : 0;

    const bounce_rate =
      rawTotals.bounce_rate !== undefined
        ? Number(rawTotals.bounce_rate)
        : sent > 0
          ? Math.round((bounced / sent) * 1000) / 10
          : 0;

    const complaint_rate =
      rawTotals.complaint_rate !== undefined
        ? Number(rawTotals.complaint_rate)
        : sent > 0
          ? Math.round((complained / sent) * 1000) / 10
          : 0;

    const unsubscribe_rate =
      rawTotals.unsubscribe_rate !== undefined
        ? Number(rawTotals.unsubscribe_rate)
        : delivered > 0
          ? Math.round((unsubscribed / delivered) * 1000) / 10
          : 0;

    const totals: MailerMetricsTotals = {
      sent,
      delivered,
      opened,
      unique_opened,
      clicked,
      unique_clicked,
      bounced,
      bounced_permanent,
      bounced_transient,
      delivery_delayed,
      unsubscribed,
      complained,
      failed,
      suppressed,
      delivery_rate,
      open_rate,
      click_rate,
      bounce_rate,
      complaint_rate,
      unsubscribe_rate,
    };

    const timeSeries: MailerMetricsTimePoint[] = (resendResult.data.data || []).map((row) => ({
      period: row.period || new Date().toISOString(),
      sent: Number(row.sent ?? 0),
      delivered: Number(row.delivered ?? 0),
      opened: Number(row.opened ?? 0),
      clicked: Number(row.clicked ?? 0),
      bounced: Number(row.bounced ?? 0),
    }));

    return {
      dataSource: "resend_api",
      startDate,
      endDate,
      granularity,
      totals,
      timeSeries,
      campaigns,
      deliveryProblems: deliveryProblems.slice(0, 50),
      lastUpdated: new Date().toISOString(),
      apiConfigured: true,
    };
  }

  // 5. Fallback local: se a Resend Metrics API não estiver disponível (ex: chave de teste ou rede)
  // Agrega a partir de `recruit_email_logs` e `email_events`
  const localSent = recruitLogs.length;
  const localDelivered = recruitLogs.filter((l) => l.status === "sent").length;
  const localFailed = recruitLogs.filter((l) => l.status === "failed").length;
  const localSuppressed = recruitLogs.filter((l) => l.status === "suppressed").length;

  const localOpened = rawEvents.filter((e) => e.event_type === "email.opened").length;
  const localUniqueOpened = new Set(
    rawEvents.filter((e) => e.event_type === "email.opened").map((e) => e.recipient.toLowerCase()),
  ).size;

  const localClicked = rawEvents.filter((e) => e.event_type === "email.clicked").length;
  const localUniqueClicked = new Set(
    rawEvents.filter((e) => e.event_type === "email.clicked").map((e) => e.recipient.toLowerCase()),
  ).size;

  const localBounced =
    rawEvents.filter((e) => e.event_type === "email.bounced").length + localFailed;
  const localComplaints = rawEvents.filter((e) => e.event_type === "email.complained").length;

  const delivery_rate = localSent > 0 ? Math.round((localDelivered / localSent) * 1000) / 10 : 0;
  const open_rate = localDelivered > 0 ? Math.round((localOpened / localDelivered) * 1000) / 10 : 0;
  const click_rate =
    localDelivered > 0 ? Math.round((localClicked / localDelivered) * 1000) / 10 : 0;
  const bounce_rate = localSent > 0 ? Math.round((localBounced / localSent) * 1000) / 10 : 0;
  const complaint_rate = localSent > 0 ? Math.round((localComplaints / localSent) * 1000) / 10 : 0;
  const unsubscribe_rate = 0;

  // Montar buckets diários locais
  const dayMap = new Map<string, MailerMetricsTimePoint>();
  for (const log of recruitLogs) {
    const day = log.sent_at.split("T")[0];
    if (!dayMap.has(day)) {
      dayMap.set(day, {
        period: `${day}T00:00:00.000Z`,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
      });
    }
    const item = dayMap.get(day)!;
    item.sent++;
    if (log.status === "sent") item.delivered++;
    if (log.status === "failed") item.bounced++;
  }

  for (const evt of rawEvents) {
    const day = evt.occurred_at.split("T")[0];
    if (dayMap.has(day)) {
      const item = dayMap.get(day)!;
      if (evt.event_type === "email.opened") item.opened++;
      if (evt.event_type === "email.clicked") item.clicked++;
      if (evt.event_type === "email.bounced") item.bounced++;
    }
  }

  const timeSeries = Array.from(dayMap.values()).sort((a, b) => a.period.localeCompare(b.period));

  return {
    dataSource: config.isConfigured ? "local_database" : "unavailable",
    startDate,
    endDate,
    granularity,
    totals: {
      sent: localSent,
      delivered: localDelivered,
      opened: localOpened,
      unique_opened: localUniqueOpened,
      clicked: localClicked,
      unique_clicked: localUniqueClicked,
      bounced: localBounced,
      bounced_permanent: localBounced,
      bounced_transient: 0,
      delivery_delayed: 0,
      unsubscribed: 0,
      complained: localComplaints,
      failed: localFailed,
      suppressed: localSuppressed,
      delivery_rate,
      open_rate,
      click_rate,
      bounce_rate,
      complaint_rate,
      unsubscribe_rate,
    },
    timeSeries,
    campaigns,
    deliveryProblems: deliveryProblems.slice(0, 50),
    lastUpdated: new Date().toISOString(),
    apiConfigured: config.isConfigured,
    message: resendResult.error?.message,
  };
}

/**
 * Retorna a linha do tempo de eventos para um e-mail individual
 */
export async function getEmailEventTimeline(
  providerEmailId?: string | null,
  recipientEmail?: string | null,
): Promise<EmailTimelineItem[]> {
  const admin = getAdminClient();
  const timeline: EmailTimelineItem[] = [];

  let query = admin.from("email_events").select("*");

  if (providerEmailId && recipientEmail) {
    query = query.or(
      `provider_email_id.eq.${providerEmailId},recipient.ilike.${recipientEmail.trim()}`,
    );
  } else if (providerEmailId) {
    query = query.eq("provider_email_id", providerEmailId);
  } else if (recipientEmail) {
    query = query.ilike("recipient", recipientEmail.trim());
  } else {
    return [];
  }

  const { data, error } = await query.order("occurred_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  for (const item of data as EmailEvent[]) {
    const payload = item.payload || {};
    const clickedLink =
      (payload.clicked_link as string) ||
      ((payload.click as Record<string, unknown> | undefined)?.link as string) ||
      null;

    timeline.push({
      id: item.id,
      eventType: item.event_type.replace("email.", ""),
      occurredAt: item.occurred_at,
      details: (payload.bounce_type as string) || null,
      clickedLink,
    });
  }

  return timeline;
}

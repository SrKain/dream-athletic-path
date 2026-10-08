import { getAdminClient } from "@/lib/supabase/clients.server";
import { getResendConfig } from "./resend-client.server";
import {
  computeCappedRate,
  detectBurstClickEventIds,
  isPrivacyProxyUserAgent,
  isStatelessAutomatedClick,
  parseAttributionFromClickedUrl,
} from "./mailer-metrics-quality";

export interface MailerMetricsQueryInput {
  days?: number;
  campaignId?: string;
  athleteId?: string;
  division?: string;
}

export interface MailerDailyMetricPoint {
  date: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
}

export interface MailerEventRow {
  id: string;
  event_type: string;
  provider_email_id: string | null;
  recipient_email: string;
  subject: string | null;
  occurred_at: string;
  clicked_link?: string | null;
  clicked_url?: string | null;
  user_agent?: string | null;
  is_automated_click?: boolean;
  is_privacy_proxy_open?: boolean;
  bounce_reason?: string | null;
  university_name?: string | null;
  university_league?: string | null;
}

export interface MailerCampaignRollupItem {
  id: string;
  created_at: string;
  mode: "single_athlete" | "multi_athlete" | "catalog";
  subject: string;
  recipients_count: number;
  sent: number;
  delivered: number;
  unique_opens: number;
  unique_human_clicks: number;
  bounced: number;
  open_rate: number;
  click_rate: number;
  ctor: number;
}

export interface EngagedCoachLeadItem {
  coach_email: string;
  coach_name: string;
  university_name: string;
  division: string;
  state: string;
  unique_opens: number;
  total_opens: number;
  unique_human_clicks: number;
  total_human_clicks: number;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  clicked_links: string[];
}

export interface AthletePerformanceItem {
  athlete_id: string;
  athlete_name: string;
  athlete_slug: string;
  position: string;
  campaigns_count: number;
  emails_sent: number;
  delivered: number;
  unique_opens: number;
  unique_human_clicks: number;
  film_clicks: number;
  profile_clicks: number;
  not_fit_signals: number;
  open_rate: number;
  click_rate: number;
}

export interface MailerFilterCampaignOption {
  id: string;
  createdAt: string;
  mode: string;
  subject: string;
  recipientsCount: number;
}

export interface MailerFilterAthleteOption {
  id: string;
  name: string;
  slug: string;
  position: string | null;
}

export interface MailerMetricsSummary {
  periodDays: number;
  resendConfigured: boolean;
  webhookSecretConfigured: boolean;
  rpcError?: string | null;
  filtersApplied: {
    days: number;
    campaignId: string | null;
    athleteId: string | null;
    division: string | null;
  };
  filterOptions: {
    campaigns: MailerFilterCampaignOption[];
    athletes: MailerFilterAthleteOption[];
  };
  totals: {
    sent: number;
    delivered: number;
    opened: number;
    totalOpens: number;
    proxyOpens: number;
    clicked: number;
    uniqueTotalClicks: number;
    totalHumanClicks: number;
    totalClicks: number;
    automatedClicks: number;
    bounced: number;
    complained: number;
    suppressed: number;
    failed: number;
    delayed: number;
    hotCoachesCount: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    clickToOpenRate: number;
    bounceRate: number;
    complaintRate: number;
  };
  byMode: {
    single_athlete: number;
    multi_athlete: number;
    catalog: number;
  };
  dailySeries: MailerDailyMetricPoint[];
  campaigns: MailerCampaignRollupItem[];
  engagedCoaches: EngagedCoachLeadItem[];
  athletePerformance: AthletePerformanceItem[];
  recentEvents: MailerEventRow[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuidOrNull(value?: string | null): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "ALL") return null;
  return UUID_REGEX.test(trimmed) ? trimmed : null;
}

/**
 * Gera a série de dias contínua para os últimos N dias (preenchendo zeros onde não houve evento).
 */
function buildCompleteDailyTimeline(
  days: number,
  rawSeries: Array<{
    date: string;
    sent?: number;
    delivered?: number;
    opened?: number;
    clicked?: number;
    bounced?: number;
  }>,
): MailerDailyMetricPoint[] {
  const effectiveDays = days > 0 ? Math.min(days, 90) : 30;
  const map = new Map<string, MailerDailyMetricPoint>();

  for (let i = effectiveDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    map.set(key, {
      date: key,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
    });
  }

  for (const row of rawSeries) {
    if (!row || !row.date) continue;
    const key = row.date.slice(0, 10);
    const existing = map.get(key) ?? {
      date: key,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
    };
    existing.sent += Number(row.sent ?? 0);
    existing.delivered += Number(row.delivered ?? 0);
    existing.opened += Number(row.opened ?? 0);
    existing.clicked += Number(row.clicked ?? 0);
    existing.bounced += Number(row.bounced ?? 0);
    map.set(key, existing);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Consulta e agrega as métricas do Mailer diretamente no PostgreSQL via RPC (`get_mailer_dashboard_metrics`),
 * sem `.select("*")` e sem `.limit(200)` que truncavam resultados ou geravam egress excessivo.
 * Atribuição de campanha/envio é feita SOMENTE por `provider_email_id` / `campaign_id` (nunca por `recipient_email`).
 * Todas as taxas primárias usam contagens únicas limitadas a 100%.
 */
export async function getMailerMetricsSummary(
  input: MailerMetricsQueryInput = {},
): Promise<MailerMetricsSummary> {
  const days = typeof input.days === "number" ? input.days : 30;
  const campaignId = normalizeUuidOrNull(input.campaignId);
  const athleteId = normalizeUuidOrNull(input.athleteId);
  const division =
    input.division && input.division.trim() && input.division !== "ALL"
      ? input.division.trim()
      : null;

  const admin = getAdminClient();
  const config = getResendConfig();
  let rpcErrorMessage: string | null = null;

  // 1. Tentar caminho principal: RPC SQL no PostgreSQL (migration 0022)
  if (typeof admin.rpc === "function") {
    const [filterOptsRes, metricsRpcRes] = await Promise.all([
      admin.rpc("get_mailer_filter_options"),
      admin.rpc("get_mailer_dashboard_metrics", {
        p_days: days,
        p_campaign_id: campaignId,
        p_athlete_id: athleteId,
        p_division: division,
      }),
    ]);

    if (!metricsRpcRes.error && metricsRpcRes.data) {
      const data = metricsRpcRes.data as {
        kpis?: Record<string, number>;
        dailySeries?: Array<{
          date: string;
          sent: number;
          delivered: number;
          opened: number;
          clicked: number;
          bounced: number;
        }>;
        campaigns?: Array<{
          id: string;
          created_at: string;
          mode: "single_athlete" | "multi_athlete" | "catalog";
          subject: string;
          recipients_count: number;
          sent: number;
          delivered: number;
          unique_opens: number;
          unique_human_clicks: number;
          bounced: number;
        }>;
        engagedCoaches?: EngagedCoachLeadItem[];
        athletePerformance?: Array<{
          athlete_id: string;
          athlete_name: string;
          athlete_slug: string;
          position: string;
          campaigns_count: number;
          emails_sent: number;
          delivered: number;
          unique_opens: number;
          unique_human_clicks: number;
          film_clicks: number;
          profile_clicks: number;
          not_fit_signals: number;
        }>;
        recentEvents?: Array<{
          id: string;
          event_type: string;
          provider_email_id: string | null;
          recipient_email: string;
          subject: string | null;
          clicked_url: string | null;
          user_agent: string | null;
          is_automated_click: boolean;
          is_privacy_proxy_open: boolean;
          occurred_at: string;
          university_name?: string | null;
          university_league?: string | null;
        }>;
      };

      const filterData = (filterOptsRes?.data ?? {}) as {
        campaigns?: MailerFilterCampaignOption[];
        athletes?: MailerFilterAthleteOption[];
      };

      const k = data.kpis ?? {};
      const sent = Number(k.sent ?? 0);
      const delivered = Number(k.delivered ?? 0);
      const uniqueOpens = Number(k.uniqueOpens ?? 0);
      const totalOpens = Number(k.totalOpens ?? 0);
      const proxyOpens = Number(k.proxyOpens ?? 0);
      const uniqueHumanClicks = Number(k.uniqueHumanClicks ?? 0);
      const uniqueTotalClicks = Number(k.uniqueTotalClicks ?? 0);
      const totalHumanClicks = Number(k.totalHumanClicks ?? 0);
      const totalClicks = Number(k.totalClicks ?? 0);
      const automatedClicks = Number(k.automatedClicks ?? 0);
      const bounced = Number(k.bounced ?? 0);
      const complained = Number(k.complained ?? 0);
      const failed = Number(k.failed ?? 0);
      const suppressed = Number(k.suppressed ?? 0);
      const delayed = Number(k.delayed ?? 0);
      const hotCoachesCount = Number(k.hotCoachesCount ?? 0);

      const effectiveDeliveredBase = Math.max(delivered, uniqueOpens, uniqueHumanClicks);

      const campaignsRollup: MailerCampaignRollupItem[] = (data.campaigns ?? []).map((c) => {
        const cDeliv = Math.max(
          Number(c.delivered ?? 0),
          Number(c.unique_opens ?? 0),
          Number(c.unique_human_clicks ?? 0),
        );
        return {
          ...c,
          open_rate: computeCappedRate(Number(c.unique_opens ?? 0), cDeliv),
          click_rate: computeCappedRate(Number(c.unique_human_clicks ?? 0), cDeliv),
          ctor: computeCappedRate(
            Number(c.unique_human_clicks ?? 0),
            Math.max(Number(c.unique_opens ?? 0), Number(c.unique_human_clicks ?? 0)),
          ),
        };
      });

      const byMode = {
        single_athlete: 0,
        multi_athlete: 0,
        catalog: 0,
      };
      for (const c of campaignsRollup) {
        if (c.mode === "single_athlete") byMode.single_athlete += c.sent;
        else if (c.mode === "multi_athlete") byMode.multi_athlete += c.sent;
        else if (c.mode === "catalog") byMode.catalog += c.sent;
      }

      const athletePerformance: AthletePerformanceItem[] = (data.athletePerformance ?? []).map(
        (a) => {
          const aDeliv = Math.max(
            Number(a.delivered ?? 0),
            Number(a.unique_opens ?? 0),
            Number(a.unique_human_clicks ?? 0),
          );
          return {
            ...a,
            open_rate: computeCappedRate(Number(a.unique_opens ?? 0), aDeliv),
            click_rate: computeCappedRate(Number(a.unique_human_clicks ?? 0), aDeliv),
          };
        },
      );

      const recentEvents: MailerEventRow[] = (data.recentEvents ?? []).map((ev) => ({
        id: ev.id,
        event_type: ev.event_type,
        provider_email_id: ev.provider_email_id,
        recipient_email: ev.recipient_email,
        subject: ev.subject,
        occurred_at: ev.occurred_at,
        clicked_link: ev.clicked_url,
        clicked_url: ev.clicked_url,
        user_agent: ev.user_agent,
        is_automated_click: Boolean(ev.is_automated_click),
        is_privacy_proxy_open: Boolean(ev.is_privacy_proxy_open),
        university_name: ev.university_name ?? null,
        university_league: ev.university_league ?? null,
      }));

      return {
        periodDays: days,
        resendConfigured: config.isConfigured,
        webhookSecretConfigured: Boolean(config.webhookSecret),
        rpcError: null,
        filtersApplied: {
          days,
          campaignId,
          athleteId,
          division,
        },
        filterOptions: {
          campaigns: filterData.campaigns ?? [],
          athletes: filterData.athletes ?? [],
        },
        totals: {
          sent,
          delivered,
          opened: uniqueOpens,
          totalOpens,
          proxyOpens,
          clicked: uniqueHumanClicks,
          uniqueTotalClicks,
          totalHumanClicks,
          totalClicks,
          automatedClicks,
          bounced,
          complained,
          suppressed,
          failed,
          delayed,
          hotCoachesCount,
          deliveryRate: computeCappedRate(delivered, sent),
          openRate: computeCappedRate(uniqueOpens, effectiveDeliveredBase),
          clickRate: computeCappedRate(uniqueHumanClicks, effectiveDeliveredBase),
          clickToOpenRate: computeCappedRate(
            uniqueHumanClicks,
            Math.max(uniqueOpens, uniqueHumanClicks),
          ),
          bounceRate: computeCappedRate(bounced, sent),
          complaintRate: computeCappedRate(complained, sent),
        },
        byMode,
        dailySeries: buildCompleteDailyTimeline(days, data.dailySeries ?? []),
        campaigns: campaignsRollup,
        engagedCoaches: data.engagedCoaches ?? [],
        athletePerformance,
        recentEvents,
      };
    }

    if (metricsRpcRes.error) {
      rpcErrorMessage = metricsRpcRes.error.message;
      console.error(
        "[mailer-metrics] RPC get_mailer_dashboard_metrics failed, using narrow projection fallback:",
        metricsRpcRes.error.message,
      );
    }
  }

  // 2. Fallback seguro de projeção enxuta (sem select("*"), sem OR recipient_email, e com regras idênticas)
  const cutoffIso =
    days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : null;

  let logsQuery = admin
    .from("recruit_email_logs")
    .select(
      "id, campaign_id, athlete_id, status, email_type, sent_at, recipient_email, recipient_name, university_name, provider_id, subject",
    );

  if (cutoffIso) {
    logsQuery = logsQuery.gte("sent_at", cutoffIso);
  }
  if (campaignId) {
    logsQuery = logsQuery.eq("campaign_id", campaignId);
  }
  if (athleteId) {
    logsQuery = logsQuery.eq("athlete_id", athleteId);
  }

  let eventsQuery = admin
    .from("email_events")
    .select(
      "id, event_type, provider_email_id, recipient_email, subject, occurred_at, clicked_url, clicked_at, user_agent, is_probable_automated, payload",
    );

  if (cutoffIso) {
    eventsQuery = eventsQuery.gte("occurred_at", cutoffIso);
  }

  const [logsRes, eventsRes] = await Promise.all([
    logsQuery.order("sent_at", { ascending: false }),
    eventsQuery.order("occurred_at", { ascending: false }),
  ]);

  const logs = (logsRes.data ?? []) as Array<{
    id: string;
    campaign_id?: string | null;
    athlete_id: string | null;
    status: "sent" | "failed" | "suppressed";
    email_type?: string | null;
    sent_at: string;
    recipient_email?: string | null;
    recipient_name?: string | null;
    university_name?: string | null;
    provider_id?: string | null;
    subject?: string | null;
  }>;

  const rawEvents = (eventsRes.data ?? []) as Array<{
    id: string;
    event_type: string;
    provider_email_id: string | null;
    recipient_email: string;
    subject: string | null;
    occurred_at: string;
    clicked_url?: string | null;
    clicked_at?: string | null;
    user_agent?: string | null;
    is_probable_automated?: boolean | null;
    payload?: Record<string, unknown> | null;
  }>;

  // Mapear logs enviados por provider_id (atribuição ESTRITA por provider_email_id — NUNCA por recipient_email)
  const logByProviderId = new Map<string, (typeof logs)[number]>();
  for (const log of logs) {
    if (log.provider_id) {
      logByProviderId.set(log.provider_id, log);
    }
  }

  // Filtrar eventos atribuídos exclusivamente por provider_email_id (ou todos quando não há filtro restrito e logs possuem provider_id)
  const matchedEventsRaw = rawEvents.filter((ev) => {
    if (!ev.provider_email_id) return false;
    return logByProviderId.has(ev.provider_email_id);
  });

  // Calcular timestamps de entrega/envio por provider_email_id para regra stateless
  const deliveredAtByProvider = new Map<string, string>();
  for (const log of logs) {
    if (log.provider_id && log.sent_at) {
      deliveredAtByProvider.set(log.provider_id, log.sent_at);
    }
  }
  for (const ev of matchedEventsRaw) {
    if (
      ev.provider_email_id &&
      (ev.event_type === "email.delivered" || ev.event_type === "email.sent")
    ) {
      deliveredAtByProvider.set(ev.provider_email_id, ev.occurred_at);
    }
  }

  // Detecção de burst (>= 3 links distintos em <= 5s no mesmo provider_email_id)
  const burstSamples = matchedEventsRaw
    .filter((ev) => ev.event_type === "email.clicked")
    .map((ev) => {
      const clickObj = ev.payload?.click as { link?: string; timestamp?: string } | undefined;
      const url =
        ev.clicked_url ||
        clickObj?.link ||
        (typeof ev.payload?.clicked_link === "string" ? ev.payload.clicked_link : null);
      const ts = ev.clicked_at || clickObj?.timestamp || ev.occurred_at;
      return {
        id: ev.id,
        providerEmailId: ev.provider_email_id,
        clickedUrl: url ?? null,
        clickedAt: ts,
      };
    });

  const burstIds = detectBurstClickEventIds(burstSamples);

  const enrichedEvents = matchedEventsRaw.map((ev) => {
    const clickObj = ev.payload?.click as
      { link?: string; timestamp?: string; userAgent?: string } | undefined;
    const clickedUrl =
      ev.clicked_url ??
      clickObj?.link ??
      (typeof ev.payload?.clicked_link === "string" ? ev.payload.clicked_link : null);
    const clickedAt = ev.clicked_at ?? clickObj?.timestamp ?? ev.occurred_at;
    const userAgent = ev.user_agent ?? clickObj?.userAgent ?? null;
    const deliveredAt = ev.provider_email_id
      ? deliveredAtByProvider.get(ev.provider_email_id)
      : null;

    const statelessAuto =
      Boolean(ev.is_probable_automated) ||
      (ev.event_type === "email.clicked" &&
        isStatelessAutomatedClick({
          clickedAt,
          deliveredOrSentAt: deliveredAt,
          userAgent,
        }));

    const isAutomatedClick =
      ev.event_type === "email.clicked" && (statelessAuto || burstIds.has(ev.id));
    const isProxyOpen = ev.event_type === "email.opened" && isPrivacyProxyUserAgent(userAgent);

    return {
      ...ev,
      clickedUrl,
      clickedAt,
      userAgent,
      isAutomatedClick,
      isProxyOpen,
    };
  });

  let sent = 0;
  let suppressed = 0;
  let logFailed = 0;
  const byMode = {
    single_athlete: 0,
    multi_athlete: 0,
    catalog: 0,
  };

  const dailyRawMap = new Map<
    string,
    {
      date: string;
      sent: number;
      deliveredSet: Set<string>;
      openedSet: Set<string>;
      clickedSet: Set<string>;
      bouncedSet: Set<string>;
    }
  >();

  function getDayBucket(isoDate: string) {
    const key = isoDate.slice(0, 10);
    let bucket = dailyRawMap.get(key);
    if (!bucket) {
      bucket = {
        date: key,
        sent: 0,
        deliveredSet: new Set(),
        openedSet: new Set(),
        clickedSet: new Set(),
        bouncedSet: new Set(),
      };
      dailyRawMap.set(key, bucket);
    }
    return bucket;
  }

  for (const log of logs) {
    if (log.status === "sent") {
      sent++;
      if (log.email_type === "athlete_teaser") byMode.single_athlete++;
      else if (log.email_type === "athlete_teaser_multi") byMode.multi_athlete++;
      else if (log.email_type === "catalog_general" || log.email_type === "catalog")
        byMode.catalog++;
      if (log.sent_at) {
        getDayBucket(log.sent_at).sent++;
      }
    } else if (log.status === "suppressed") {
      suppressed++;
    } else if (log.status === "failed") {
      logFailed++;
    }
  }

  const deliveredProviders = new Set<string>();
  const openedProviders = new Set<string>();
  const humanClickedProviders = new Set<string>();
  const anyClickedProviders = new Set<string>();
  const bouncedProviders = new Set<string>();
  const complainedProviders = new Set<string>();
  const failedEventProviders = new Set<string>();
  const suppressedEventProviders = new Set<string>();
  const delayedProviders = new Set<string>();
  const hotCoachesEmails = new Set<string>();

  let totalOpens = 0;
  let proxyOpens = 0;
  let totalHumanClicks = 0;
  let totalClicks = 0;
  let automatedClicks = 0;

  const coachAgg = new Map<
    string,
    {
      coach_email: string;
      coach_name: string;
      university_name: string;
      division: string;
      state: string;
      openedProviders: Set<string>;
      total_opens: number;
      clickedProviders: Set<string>;
      total_human_clicks: number;
      last_opened_at: string | null;
      last_clicked_at: string | null;
      clicked_links: Set<string>;
    }
  >();

  for (const ev of enrichedEvents) {
    const pid = ev.provider_email_id;
    if (!pid) continue;
    const log = logByProviderId.get(pid);
    const email = (log?.recipient_email || ev.recipient_email || "").toLowerCase().trim();
    const bucket = ev.occurred_at ? getDayBucket(ev.occurred_at) : null;

    if (
      ev.event_type === "email.delivered" ||
      ev.event_type === "email.opened" ||
      ev.event_type === "email.clicked"
    ) {
      deliveredProviders.add(pid);
      if (ev.event_type === "email.delivered" && bucket) {
        bucket.deliveredSet.add(pid);
      }
    }

    if (ev.event_type === "email.opened") {
      openedProviders.add(pid);
      totalOpens++;
      if (ev.isProxyOpen) proxyOpens++;
      if (bucket) bucket.openedSet.add(pid);

      if (email) {
        const c = coachAgg.get(email) ?? {
          coach_email: email,
          coach_name: log?.recipient_name || email.split("@")[0] || "Coach",
          university_name: log?.university_name || "",
          division: "",
          state: "",
          openedProviders: new Set(),
          total_opens: 0,
          clickedProviders: new Set(),
          total_human_clicks: 0,
          last_opened_at: null,
          last_clicked_at: null,
          clicked_links: new Set(),
        };
        c.openedProviders.add(pid);
        c.total_opens++;
        if (!c.last_opened_at || ev.occurred_at > c.last_opened_at) {
          c.last_opened_at = ev.occurred_at;
        }
        coachAgg.set(email, c);
      }
    } else if (ev.event_type === "email.clicked") {
      anyClickedProviders.add(pid);
      totalClicks++;
      if (ev.isAutomatedClick) {
        automatedClicks++;
      } else {
        humanClickedProviders.add(pid);
        totalHumanClicks++;
        if (email) hotCoachesEmails.add(email);
        if (bucket) bucket.clickedSet.add(pid);

        if (email) {
          const c = coachAgg.get(email) ?? {
            coach_email: email,
            coach_name: log?.recipient_name || email.split("@")[0] || "Coach",
            university_name: log?.university_name || "",
            division: "",
            state: "",
            openedProviders: new Set(),
            total_opens: 0,
            clickedProviders: new Set(),
            total_human_clicks: 0,
            last_opened_at: null,
            last_clicked_at: null,
            clicked_links: new Set(),
          };
          c.clickedProviders.add(pid);
          c.total_human_clicks++;
          if (!c.last_clicked_at || ev.clickedAt > c.last_clicked_at) {
            c.last_clicked_at = ev.clickedAt;
          }
          if (ev.clickedUrl) {
            c.clicked_links.add(ev.clickedUrl);
          }
          coachAgg.set(email, c);
        }
      }
    } else if (ev.event_type === "email.bounced") {
      bouncedProviders.add(pid);
      if (bucket) bucket.bouncedSet.add(pid);
    } else if (ev.event_type === "email.complained") {
      complainedProviders.add(pid);
    } else if (ev.event_type === "email.failed") {
      failedEventProviders.add(pid);
    } else if (ev.event_type === "email.suppressed") {
      suppressedEventProviders.add(pid);
    } else if (ev.event_type === "email.delivery_delayed") {
      delayedProviders.add(pid);
    }
  }

  const delivered = deliveredProviders.size;
  const uniqueOpens = openedProviders.size;
  const uniqueHumanClicks = humanClickedProviders.size;
  const bounced = bouncedProviders.size;
  const complained = complainedProviders.size;
  const failed = logFailed + failedEventProviders.size;
  const totalSuppressed = suppressed + suppressedEventProviders.size;
  const effectiveDeliveredBase = Math.max(delivered, uniqueOpens, uniqueHumanClicks);

  const dailySeries = buildCompleteDailyTimeline(
    days,
    Array.from(dailyRawMap.values()).map((d) => ({
      date: d.date,
      sent: d.sent,
      delivered: d.deliveredSet.size,
      opened: d.openedSet.size,
      clicked: d.clickedSet.size,
      bounced: d.bouncedSet.size,
    })),
  );

  const engagedCoaches: EngagedCoachLeadItem[] = Array.from(coachAgg.values())
    .map((c) => ({
      coach_email: c.coach_email,
      coach_name: c.coach_name,
      university_name: c.university_name,
      division: c.division,
      state: c.state,
      unique_opens: c.openedProviders.size,
      total_opens: c.total_opens,
      unique_human_clicks: c.clickedProviders.size,
      total_human_clicks: c.total_human_clicks,
      last_opened_at: c.last_opened_at,
      last_clicked_at: c.last_clicked_at,
      clicked_links: Array.from(c.clicked_links),
    }))
    .sort((a, b) => b.total_human_clicks - a.total_human_clicks || b.total_opens - a.total_opens)
    .slice(0, 100);

  const recentEvents: MailerEventRow[] = enrichedEvents.slice(0, 100).map((ev) => {
    const bounceObj = ev.payload?.bounce as { message?: string; type?: string } | undefined;
    const log = ev.provider_email_id ? logByProviderId.get(ev.provider_email_id) : undefined;
    const parsedUrl = parseAttributionFromClickedUrl(ev.clickedUrl);
    return {
      id: ev.id,
      event_type: ev.event_type,
      provider_email_id: ev.provider_email_id,
      recipient_email: ev.recipient_email,
      subject: ev.subject ?? log?.subject ?? null,
      occurred_at: ev.occurred_at,
      clicked_link: ev.clickedUrl,
      clicked_url: ev.clickedUrl,
      user_agent: ev.userAgent,
      is_automated_click: ev.isAutomatedClick,
      is_privacy_proxy_open: ev.isProxyOpen,
      bounce_reason: bounceObj?.message ?? bounceObj?.type ?? (parsedUrl.buttonType || null),
      university_name: log?.university_name ?? null,
      university_league: null,
    };
  });

  return {
    periodDays: days,
    resendConfigured: config.isConfigured,
    webhookSecretConfigured: Boolean(config.webhookSecret),
    rpcError: rpcErrorMessage,
    filtersApplied: {
      days,
      campaignId,
      athleteId,
      division,
    },
    filterOptions: {
      campaigns: [],
      athletes: [],
    },
    totals: {
      sent,
      delivered,
      opened: uniqueOpens,
      totalOpens,
      proxyOpens,
      clicked: uniqueHumanClicks,
      uniqueTotalClicks: anyClickedProviders.size,
      totalHumanClicks,
      totalClicks,
      automatedClicks,
      bounced,
      complained,
      suppressed: totalSuppressed,
      failed,
      delayed: delayedProviders.size,
      hotCoachesCount: hotCoachesEmails.size,
      deliveryRate: computeCappedRate(delivered, sent),
      openRate: computeCappedRate(uniqueOpens, effectiveDeliveredBase),
      clickRate: computeCappedRate(uniqueHumanClicks, effectiveDeliveredBase),
      clickToOpenRate: computeCappedRate(
        uniqueHumanClicks,
        Math.max(uniqueOpens, uniqueHumanClicks),
      ),
      bounceRate: computeCappedRate(bounced, sent),
      complaintRate: computeCappedRate(complained, sent),
    },
    byMode,
    dailySeries,
    campaigns: [],
    engagedCoaches,
    athletePerformance: [],
    recentEvents,
  };
}

/**
 * Alias de compatibilidade para chamadas que esperam `getMailerMetricsReport`.
 */
export async function getMailerMetricsReport(input?: {
  range?: "7d" | "30d" | "90d" | "all" | "custom";
  days?: number;
  campaignId?: string;
  athleteId?: string;
  division?: string;
}): Promise<MailerMetricsSummary> {
  const days =
    typeof input?.days === "number"
      ? input.days
      : input?.range === "7d"
        ? 7
        : input?.range === "90d"
          ? 90
          : input?.range === "all"
            ? 0
            : 30;

  return getMailerMetricsSummary({
    days,
    campaignId: input?.campaignId,
    athleteId: input?.athleteId,
    division: input?.division,
  });
}

export interface EmailTimelineItem {
  id: string;
  eventType: string;
  occurredAt: string;
  details?: string | null;
  clickedLink?: string | null;
}

/**
 * Retorna a linha do tempo de eventos de um envio específico (somente por providerEmailId,
 * com fallback por recipientEmail apenas quando providerEmailId não for informado).
 */
export async function getEmailEventTimeline(
  providerEmailId?: string | null,
  recipientEmail?: string | null,
): Promise<EmailTimelineItem[]> {
  const admin = getAdminClient();
  let query = admin
    .from("email_events")
    .select(
      "id, event_type, provider_email_id, recipient_email, subject, occurred_at, clicked_url, user_agent, is_probable_automated",
    )
    .order("occurred_at", { ascending: true })
    .limit(50);

  if (providerEmailId && providerEmailId.trim()) {
    query = query.eq("provider_email_id", providerEmailId.trim());
  } else if (recipientEmail && recipientEmail.trim()) {
    query = query.eq("recipient_email", recipientEmail.trim().toLowerCase());
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("[mailer-metrics] Error loading email event timeline:", error?.message);
    return [];
  }

  return data.map((row) => {
    const rawType = String(row.event_type ?? "");
    const shortType = rawType.replace(/^email\./, "");
    const isAuto = Boolean(row.is_probable_automated);
    const details =
      shortType === "clicked" && isAuto
        ? "Automated scanner/bot click detected"
        : ((row.user_agent as string | null) ?? null);

    return {
      id: String(row.id),
      eventType: shortType,
      occurredAt: String(row.occurred_at),
      details,
      clickedLink: (row.clicked_url as string | null) ?? null,
    };
  });
}

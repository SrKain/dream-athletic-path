import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  AUTOMATED_SCANNER_USER_AGENT_PATTERNS,
  BURST_CLICK_DISTINCT_LINKS_THRESHOLD,
  BURST_CLICK_WINDOW_SECONDS,
  FAST_CLICK_THRESHOLD_SECONDS,
  PRIVACY_PROXY_USER_AGENT_PATTERNS,
  appendMailerUtmParams,
  buildResendMailerTags,
  computeCappedRate,
  detectBurstClickEventIds,
  extractTagsFromWebhookData,
  isPrivacyProxyUserAgent,
  isScannerUserAgent,
  isStatelessAutomatedClick,
  parseAttributionFromClickedUrl,
  sanitizeResendTagValue,
} from "./mailer-metrics-quality";
import { getMailerMetricsSummary } from "./mailer-metrics.server";

const mockLogsData: Array<Record<string, unknown>> = [];
const mockEventsData: Array<Record<string, unknown>> = [];
let mockRpcResponse: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: { message: "RPC not mocked" },
};

vi.mock("@/lib/supabase/clients.server", () => ({
  getAdminClient: () => ({
    rpc: vi.fn((fnName: string) => {
      if (fnName === "get_mailer_filter_options") {
        return Promise.resolve({
          data: { campaigns: [], athletes: [] },
          error: null,
        });
      }
      return Promise.resolve(mockRpcResponse);
    }),
    from: (table: string) => {
      const source = table === "recruit_email_logs" ? mockLogsData : mockEventsData;
      const chain: Record<string, unknown> = {};
      let filtered = [...source];

      chain.select = () => chain;
      chain.gte = () => chain;
      chain.eq = (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return chain;
      };
      chain.order = () => Promise.resolve({ data: filtered, error: null });
      chain.limit = () => Promise.resolve({ data: filtered, error: null });
      return chain;
    },
  }),
}));

vi.mock("./resend-client.server", () => ({
  getResendConfig: () => ({
    apiKey: "re_test_key",
    from: "Go Team Go <contact@goteamgoagency.com>",
    webhookSecret: "whsec_test",
    isConfigured: true,
  }),
}));

describe("Mailer Metrics Quality, Attribution & Aggregation", () => {
  beforeEach(() => {
    mockLogsData.length = 0;
    mockEventsData.length = 0;
    mockRpcResponse = {
      data: null,
      error: { message: "Fallback to narrow query" },
    };
  });

  describe("1. Named Quality Constants & Bot/Scanner Heuristics", () => {
    it("exports exact threshold constants required for scanner and burst detection", () => {
      expect(FAST_CLICK_THRESHOLD_SECONDS).toBe(10);
      expect(BURST_CLICK_DISTINCT_LINKS_THRESHOLD).toBe(3);
      expect(BURST_CLICK_WINDOW_SECONDS).toBe(5);
      expect(AUTOMATED_SCANNER_USER_AGENT_PATTERNS.length).toBeGreaterThan(5);
      expect(PRIVACY_PROXY_USER_AGENT_PATTERNS.length).toBe(3);
    });

    it("flags clicks <= 10s after delivered/sent as stateless automated clicks", () => {
      const deliveredAt = "2026-10-08T12:00:00.000Z";
      const clickAt4s = "2026-10-08T12:00:04.000Z";
      const clickAt10s = "2026-10-08T12:00:10.000Z";
      const clickAt15s = "2026-10-08T12:00:15.000Z";

      expect(
        isStatelessAutomatedClick({
          clickedAt: clickAt4s,
          deliveredOrSentAt: deliveredAt,
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        }),
      ).toBe(true);

      expect(
        isStatelessAutomatedClick({
          clickedAt: clickAt10s,
          deliveredOrSentAt: deliveredAt,
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        }),
      ).toBe(true);

      expect(
        isStatelessAutomatedClick({
          clickedAt: clickAt15s,
          deliveredOrSentAt: deliveredAt,
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        }),
      ).toBe(false);
    });

    it("flags known security scanner and headless user agents", () => {
      expect(isScannerUserAgent("Barracuda Sentinel Link Scanner/1.2")).toBe(true);
      expect(isScannerUserAgent("Mozilla/5.0 Proofpoint URL Defense")).toBe(true);
      expect(isScannerUserAgent("Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/122.0")).toBe(true);
      expect(isScannerUserAgent("python-requests/2.31.0")).toBe(true);
      expect(
        isScannerUserAgent(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        ),
      ).toBe(false);
    });

    it("detects privacy image proxies without falsely flagging standard macOS Safari User-Agent", () => {
      // Google e Yahoo proxies são marcados
      expect(
        isPrivacyProxyUserAgent(
          "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)",
        ),
      ).toBe(true);
      expect(isPrivacyProxyUserAgent("YahooMailProxy; https://help.yahoo.com")).toBe(true);

      // Safari macOS padrão NÃO deve ser marcado como proxy (regra explícita aprovada)
      expect(
        isPrivacyProxyUserAgent(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        ),
      ).toBe(false);
    });

    it("detects burst clicks (>= 3 distinct links within <= 5s on the same provider_email_id)", () => {
      const burstSamples = [
        {
          id: "c1",
          providerEmailId: "msg-1",
          clickedUrl: "https://portfolio.goteamgoagency.com/athlete/mariana-silva",
          clickedAt: "2026-10-08T12:01:00.000Z",
        },
        {
          id: "c2",
          providerEmailId: "msg-1",
          clickedUrl: "https://www.youtube.com/watch?v=123",
          clickedAt: "2026-10-08T12:01:02.000Z",
        },
        {
          id: "c3",
          providerEmailId: "msg-1",
          clickedUrl: "https://portfolio.goteamgoagency.com/feedback?athleteId=ath-1",
          clickedAt: "2026-10-08T12:01:04.000Z",
        },
        // Clique humano isolado em outro e-mail
        {
          id: "c4",
          providerEmailId: "msg-2",
          clickedUrl: "https://portfolio.goteamgoagency.com/athlete/mariana-silva",
          clickedAt: "2026-10-08T12:05:00.000Z",
        },
      ];

      const flagged = detectBurstClickEventIds(burstSamples);
      expect(flagged.has("c1")).toBe(true);
      expect(flagged.has("c2")).toBe(true);
      expect(flagged.has("c3")).toBe(true);
      expect(flagged.has("c4")).toBe(false);
    });
  });

  describe("2. Resend Tag Sanitization & UTM Link Instrumentation", () => {
    it("sanitizes Resend tag values to ASCII alphanumeric, underscore and hyphen only", () => {
      expect(sanitizeResendTagValue("athlete_teaser")).toBe("athlete_teaser");
      expect(sanitizeResendTagValue("camp-123:test/value!@#")).toBe("camp-123_test_value_");
      const tags = buildResendMailerTags({
        campaignId: "550e8400-e29b-41d4-a716-446655440000",
        emailType: "athlete_teaser",
        athleteId: "110e8400-e29b-41d4-a716-446655440001",
      });
      expect(tags).toEqual([
        { name: "email_type", value: "athlete_teaser" },
        { name: "campaign_id", value: "550e8400-e29b-41d4-a716-446655440000" },
        { name: "athlete_id", value: "110e8400-e29b-41d4-a716-446655440001" },
      ]);
    });

    it("extracts webhook tags from both Array<{name, value}> and Record<string, string>", () => {
      expect(
        extractTagsFromWebhookData([
          { name: "campaign_id", value: "camp-1" },
          { name: "email_type", value: "catalog_general" },
        ]),
      ).toEqual({
        campaign_id: "camp-1",
        email_type: "catalog_general",
      });

      expect(
        extractTagsFromWebhookData({
          campaign_id: "camp-2",
          athlete_id: "ath-9",
        }),
      ).toEqual({
        campaign_id: "camp-2",
        athlete_id: "ath-9",
      });
    });

    it("adds UTM parameters only to our domain links and preserves YouTube, feedback, and unsubscribe URLs", () => {
      const profileWithUtm = appendMailerUtmParams(
        "https://portfolio.goteamgoagency.com/athlete/mariana-silva",
        {
          campaignId: "camp-123",
          content: "full_profile_mariana-silva",
        },
      );
      expect(profileWithUtm).toContain("utm_source=gtg_mailer");
      expect(profileWithUtm).toContain("utm_medium=email");
      expect(profileWithUtm).toContain("utm_campaign=camp-123");
      expect(profileWithUtm).toContain("utm_content=full_profile_mariana-silva");

      // YouTube externo permanece intacto
      const ytUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      expect(
        appendMailerUtmParams(ytUrl, {
          campaignId: "camp-123",
          content: "watch_film_mariana-silva",
        }),
      ).toBe(ytUrl);

      // Links de feedback e unsubscribe permanecem intactos
      const feedbackUrl =
        "https://portfolio.goteamgoagency.com/feedback?sentiment=not_fit&athleteId=ath-1";
      expect(
        appendMailerUtmParams(feedbackUrl, {
          campaignId: "camp-123",
          content: "not_fit",
        }),
      ).toBe(feedbackUrl);

      const parsed = parseAttributionFromClickedUrl(profileWithUtm);
      expect(parsed.athleteSlug).toBe("mariana-silva");
      expect(parsed.campaignId).toBe("camp-123");
      expect(parsed.buttonType).toBe("full_profile");
    });
  });

  describe("3. Strict Campaign Attribution & Unique Capped Rates (<= 100%)", () => {
    it("caps all percentage rates at 100% even when multiple opens/clicks occur per email", () => {
      expect(computeCappedRate(5, 1)).toBe(100);
      expect(computeCappedRate(1, 2)).toBe(50);
      expect(computeCappedRate(0, 10)).toBe(0);
    });

    it("attributes events strictly by provider_email_id (never mixing campaigns via recipient_email)", async () => {
      const now = new Date().toISOString();
      const campA = "550e8400-e29b-41d4-a716-446655440001";

      // Log pertence à Campanha A (provider_id = re_camp_a)
      mockLogsData.push({
        id: "log-1",
        campaign_id: campA,
        athlete_id: "110e8400-e29b-41d4-a716-446655440000",
        status: "sent",
        email_type: "athlete_teaser",
        sent_at: "2026-10-08T10:00:00.000Z",
        recipient_email: "coach@stanford.edu",
        recipient_name: "Coach Smith",
        university_name: "Stanford",
        provider_id: "re_camp_a",
        subject: "Prospect A",
      });

      mockEventsData.push(
        // Entregue na Campanha A
        {
          id: "ev-1",
          event_type: "email.delivered",
          provider_email_id: "re_camp_a",
          recipient_email: "coach@stanford.edu",
          subject: "Prospect A",
          occurred_at: "2026-10-08T10:00:02.000Z",
          payload: {},
        },
        // 3 aberturas repetidas do mesmo e-mail na Campanha A (deve contar 1 única abertura, openRate = 100%, bruto = 3)
        {
          id: "ev-2",
          event_type: "email.opened",
          provider_email_id: "re_camp_a",
          recipient_email: "coach@stanford.edu",
          subject: "Prospect A",
          occurred_at: "2026-10-08T10:05:00.000Z",
          user_agent: "GoogleImageProxy",
          payload: {},
        },
        {
          id: "ev-3",
          event_type: "email.opened",
          provider_email_id: "re_camp_a",
          recipient_email: "coach@stanford.edu",
          subject: "Prospect A",
          occurred_at: "2026-10-08T10:06:00.000Z",
          payload: {},
        },
        // Clique de scanner (3s após entrega -> <= 10s, automatizado)
        {
          id: "ev-scanner",
          event_type: "email.clicked",
          provider_email_id: "re_camp_a",
          recipient_email: "coach@stanford.edu",
          subject: "Prospect A",
          occurred_at: "2026-10-08T10:00:05.000Z",
          clicked_at: "2026-10-08T10:00:05.000Z",
          clicked_url: "https://portfolio.goteamgoagency.com/athlete/mariana-silva",
          payload: {},
        },
        // Clique humano (10 minutos após entrega)
        {
          id: "ev-human",
          event_type: "email.clicked",
          provider_email_id: "re_camp_a",
          recipient_email: "coach@stanford.edu",
          subject: "Prospect A",
          occurred_at: "2026-10-08T10:10:00.000Z",
          clicked_at: "2026-10-08T10:10:00.000Z",
          clicked_url: "https://portfolio.goteamgoagency.com/athlete/mariana-silva",
          payload: {},
        },
        // Evento de OUTRA campanha (re_camp_b) para o MESMO coach@stanford.edu -> NÃO deve ser atribuído à Campanha A!
        {
          id: "ev-other-campaign",
          event_type: "email.clicked",
          provider_email_id: "re_camp_b",
          recipient_email: "coach@stanford.edu",
          subject: "Other Campaign",
          occurred_at: now,
          clicked_at: now,
          clicked_url: "https://portfolio.goteamgoagency.com/athlete/other-athlete",
          payload: {},
        },
      );

      const summary = await getMailerMetricsSummary({
        days: 30,
        campaignId: campA,
      });

      expect(summary.totals.sent).toBe(1);
      expect(summary.totals.delivered).toBe(1);
      // Aberturas únicas = 1 (mesmo com 2 eventos de open), bruto = 2, proxy = 1
      expect(summary.totals.opened).toBe(1);
      expect(summary.totals.totalOpens).toBe(2);
      expect(summary.totals.proxyOpens).toBe(1);
      expect(summary.totals.openRate).toBe(100);

      // Cliques humanos únicos = 1, automatizados filtrados = 1, e o clique da outra campanha (re_camp_b) foi ignorado
      expect(summary.totals.clicked).toBe(1);
      expect(summary.totals.automatedClicks).toBe(1);
      expect(summary.totals.totalClicks).toBe(2);
      expect(summary.totals.clickRate).toBe(100);
      expect(summary.totals.clickToOpenRate).toBe(100);
      expect(summary.engagedCoaches).toHaveLength(1);
      expect(summary.engagedCoaches[0]?.coach_email).toBe("coach@stanford.edu");
      expect(summary.engagedCoaches[0]?.unique_human_clicks).toBe(1);
    });
  });
});

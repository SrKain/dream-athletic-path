import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  resolveDateRange,
  fetchResendEmailMetrics,
  getMailerMetricsReport,
  getEmailEventTimeline,
} from "./mailer-metrics.server";
import { resetResendClientCache } from "./resend-client.server";

// Mock Supabase admin client
const mockRecruitLogs = [
  {
    id: "log-1",
    athlete_id: "ath-1",
    coach_id: "c-1",
    subject: "Player Prospect: Carolina Becker",
    status: "sent",
    error_message: null,
    sent_at: "2026-09-25T14:30:00.000Z",
    email_type: "athlete_teaser",
    recipient_email: "coach.smith@stanford.edu",
    recipient_name: "Coach Smith",
    university_name: "Stanford University",
    provider_id: "resend_email_123",
  },
  {
    id: "log-2",
    athlete_id: "ath-2",
    coach_id: "c-2",
    subject: "Dream Athletic Path - 2027 Roster",
    status: "sent",
    error_message: null,
    sent_at: "2026-09-26T15:00:00.000Z",
    email_type: "athlete_teaser_multi",
    recipient_email: "coach.jones@ucla.edu",
    recipient_name: "Coach Jones",
    university_name: "UCLA",
    provider_id: "resend_email_456",
  },
  {
    id: "log-3",
    athlete_id: null,
    coach_id: "c-3",
    subject: "International Soccer Prospects 2027",
    status: "failed",
    error_message: "Invalid domain address",
    sent_at: "2026-09-27T10:00:00.000Z",
    email_type: "catalog_general",
    recipient_email: "invalid@bad-domain.xyz",
    recipient_name: "Unknown Coach",
    university_name: null,
    provider_id: null,
  },
];

const mockEmailEvents = [
  {
    id: "evt-1",
    provider: "resend",
    provider_event_id: "svix_evt_1",
    provider_email_id: "resend_email_123",
    event_type: "email.delivered",
    recipient: "coach.smith@stanford.edu",
    occurred_at: "2026-09-25T14:30:05.000Z",
    payload: { from: "onboarding@resend.dev", subject: "Player Prospect" },
    created_at: "2026-09-25T14:30:06.000Z",
  },
  {
    id: "evt-2",
    provider: "resend",
    provider_event_id: "svix_evt_2",
    provider_email_id: "resend_email_123",
    event_type: "email.opened",
    recipient: "coach.smith@stanford.edu",
    occurred_at: "2026-09-25T14:45:00.000Z",
    payload: { from: "onboarding@resend.dev" },
    created_at: "2026-09-25T14:45:01.000Z",
  },
  {
    id: "evt-3",
    provider: "resend",
    provider_event_id: "svix_evt_3",
    provider_email_id: "resend_email_123",
    event_type: "email.clicked",
    recipient: "coach.smith@stanford.edu",
    occurred_at: "2026-09-25T14:48:00.000Z",
    payload: {
      from: "onboarding@resend.dev",
      click: { link: "https://dreamathleticpath.com/athlete/carolina-becker" },
    },
    created_at: "2026-09-25T14:48:01.000Z",
  },
  {
    id: "evt-4",
    provider: "resend",
    provider_event_id: "svix_evt_4",
    provider_email_id: "resend_email_789",
    event_type: "email.bounced",
    recipient: "bounce@test.com",
    occurred_at: "2026-09-27T11:00:00.000Z",
    payload: { bounce_type: "permanent" },
    created_at: "2026-09-27T11:00:01.000Z",
  },
];

vi.mock("@/lib/supabase/clients.server", () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === "recruit_email_logs") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => Promise.resolve({ data: mockRecruitLogs, error: null }),
            }),
          }),
        };
      }
      if (table === "email_events") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: mockEmailEvents, error: null }),
                }),
              }),
            }),
            or: () => ({
              order: () => Promise.resolve({ data: mockEmailEvents.slice(0, 3), error: null }),
            }),
            eq: () => ({
              order: () => Promise.resolve({ data: mockEmailEvents.slice(0, 3), error: null }),
            }),
            ilike: () => ({
              order: () => Promise.resolve({ data: mockEmailEvents.slice(0, 3), error: null }),
            }),
          }),
        };
      }
      return {
        select: () => Promise.resolve({ data: [], error: null }),
      };
    },
  }),
}));

describe("Mailer Metrics & Reporting System", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetResendClientCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetResendClientCache();
  });

  describe("resolveDateRange", () => {
    it("correctly resolves 7d, 30d, and 90d periods", () => {
      const r7 = resolveDateRange({ range: "7d" });
      expect(r7.granularity).toBe("daily");
      expect(new Date(r7.endDate).getTime()).toBeGreaterThan(new Date(r7.startDate).getTime());

      const r30 = resolveDateRange({ range: "30d" });
      expect(r30.granularity).toBe("daily");

      const r90 = resolveDateRange({ range: "90d" });
      expect(r90.granularity).toBe("daily");
    });

    it("correctly calculates custom date ranges with daily or hourly granularity", () => {
      const start = "2026-09-01T00:00:00.000Z";
      const end = "2026-09-02T00:00:00.000Z";
      const rCustomHourly = resolveDateRange({
        range: "custom",
        startDate: start,
        endDate: end,
      });
      expect(rCustomHourly.granularity).toBe("hourly");
      expect(rCustomHourly.startDate).toBe(new Date(start).toISOString());

      const rCustomDaily = resolveDateRange({
        range: "custom",
        startDate: "2026-08-01T00:00:00.000Z",
        endDate: "2026-08-20T00:00:00.000Z",
      });
      expect(rCustomDaily.granularity).toBe("daily");
    });
  });

  describe("fetchResendEmailMetrics", () => {
    it("returns error if Resend API key is not configured", async () => {
      delete process.env.RESEND_API_KEY;
      resetResendClientCache();

      const res = await fetchResendEmailMetrics({
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-09-30T00:00:00.000Z",
        granularity: "daily",
      });

      expect(res.data).toBeNull();
      expect(res.error).toBeDefined();
    });
  });

  describe("getMailerMetricsReport", () => {
    it("falls back to local database aggregation when Resend API is unconfigured", async () => {
      delete process.env.RESEND_API_KEY;
      resetResendClientCache();

      const report = await getMailerMetricsReport({ range: "30d" });

      expect(report.dataSource).toBe("unavailable");
      expect(report.totals.sent).toBe(3);
      expect(report.totals.delivered).toBe(2);
      expect(report.totals.failed).toBe(1);
      expect(report.totals.delivery_rate).toBe(66.7);
      expect(report.campaigns.length).toBe(3);
      expect(report.deliveryProblems.length).toBeGreaterThan(0);
    });

    it("produces correct campaign performance breakdown across modes", async () => {
      const report = await getMailerMetricsReport({ range: "30d" });

      const single = report.campaigns.find((c) => c.mode === "single_athlete");
      expect(single).toBeDefined();
      expect(single?.sent).toBe(1);
      expect(single?.delivered).toBe(1);

      const multi = report.campaigns.find((c) => c.mode === "multi_athlete");
      expect(multi).toBeDefined();
      expect(multi?.sent).toBe(1);

      const catalog = report.campaigns.find((c) => c.mode === "catalog");
      expect(catalog).toBeDefined();
      expect(catalog?.sent).toBe(1);
    });
  });

  describe("getEmailEventTimeline", () => {
    it("returns empty array when neither provider id nor email is given", async () => {
      const timeline = await getEmailEventTimeline(null, null);
      expect(timeline).toEqual([]);
    });

    it("queries and formats timeline events for a given providerEmailId", async () => {
      const timeline = await getEmailEventTimeline("resend_email_123", "coach.smith@stanford.edu");
      expect(timeline.length).toBe(3);
      expect(timeline[0].eventType).toBe("delivered");
      expect(timeline[1].eventType).toBe("opened");
      expect(timeline[2].eventType).toBe("clicked");
      expect(timeline[2].clickedLink).toContain("carolina-becker");
    });
  });
});

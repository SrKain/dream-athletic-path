import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  processResendWebhook,
  verifyResendWebhookSignature,
  type ResendWebhookEventPayload,
} from "./resend-webhook.server";

const mockUpsertedEvents: Array<Record<string, unknown>> = [];
const mockUpsertedSuppressions: Array<Record<string, unknown>> = [];
let mockEventsUpsertError: { message: string } | null = null;
let mockDeliveriesLookup: Array<{ occurred_at: string }> = [];

vi.mock("@/lib/supabase/clients.server", () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === "email_events") {
        return {
          upsert: (row: Record<string, unknown>) => {
            if (!mockEventsUpsertError) {
              mockUpsertedEvents.push(row);
            }
            return Promise.resolve({ error: mockEventsUpsertError });
          },
          select: () => {
            const chain = {
              eq: () => chain,
              in: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: () =>
                Promise.resolve({
                  data: mockDeliveriesLookup[0] ?? null,
                  error: null,
                }),
            };
            return chain;
          },
        };
      }

      if (table === "email_suppressions") {
        return {
          upsert: (row: Record<string, unknown>) => {
            mockUpsertedSuppressions.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "recruit_email_logs") {
        return {
          select: () => {
            const chain = {
              eq: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            };
            return chain;
          },
        };
      }

      return {};
    },
  }),
}));

describe("Resend Webhook Verification & Event Processing", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
  const originalApiKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    mockUpsertedEvents.length = 0;
    mockUpsertedSuppressions.length = 0;
    mockEventsUpsertError = null;
    mockDeliveriesLookup = [];
    delete process.env.RESEND_WEBHOOK_SECRET;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.NODE_ENV = originalNodeEnv;
  });

  afterEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe("1. verifyResendWebhookSignature (Fail-Closed in Production)", () => {
    it("allows unsigned webhooks in dev/test when RESEND_WEBHOOK_SECRET is empty", () => {
      process.env.VERCEL_ENV = "development";
      delete process.env.RESEND_WEBHOOK_SECRET;

      const ok = verifyResendWebhookSignature('{"type":"email.sent"}', {});
      expect(ok).toBe(true);
    });

    it("fails closed (returns false) in production when RESEND_WEBHOOK_SECRET is missing", () => {
      process.env.VERCEL_ENV = "production";
      delete process.env.RESEND_WEBHOOK_SECRET;

      const ok = verifyResendWebhookSignature('{"type":"email.sent"}', {
        svixId: "msg_123",
        svixTimestamp: "1700000000",
        svixSignature: "v1,invalid",
      });
      expect(ok).toBe(false);
    });

    it("verifies valid Svix HMAC-SHA256 signatures and rejects invalid ones", () => {
      const rawSecret = Buffer.from("super-secret-webhook-key-123456").toString("base64");
      process.env.RESEND_WEBHOOK_SECRET = `whsec_${rawSecret}`;

      const rawBody = JSON.stringify({
        type: "email.delivered",
        data: { email_id: "re_123", to: ["coach@ucla.edu"] },
      });
      const svixId = "msg_test_001";
      const svixTimestamp = "1728000000";

      const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
      const expectedSig = crypto
        .createHmac("sha256", Buffer.from(rawSecret, "base64"))
        .update(signedContent)
        .digest("base64");

      expect(
        verifyResendWebhookSignature(rawBody, {
          svixId,
          svixTimestamp,
          svixSignature: `v1,${expectedSig}`,
        }),
      ).toBe(true);

      expect(
        verifyResendWebhookSignature(rawBody, {
          svixId,
          svixTimestamp,
          svixSignature: "v1,d3Jvbmctc2lnbmF0dXJl",
        }),
      ).toBe(false);
    });
  });

  describe("2. Privacy Sanitization, Tag Persistence & Automated Scanner Flagging", () => {
    it("persists tags, sanitizes click (link, timestamp, userAgent only) and strips ipAddress", async () => {
      mockDeliveriesLookup = [{ occurred_at: "2026-10-08T10:00:00.000Z" }];

      const payload: ResendWebhookEventPayload = {
        type: "email.clicked",
        created_at: "2026-10-08T10:05:00.000Z",
        data: {
          email_id: "re_click_1",
          to: ["Coach@Stanford.edu"],
          subject: "Prospect Spotlight",
          tags: [
            { name: "campaign_id", value: "550e8400-e29b-41d4-a716-446655440000" },
            { name: "email_type", value: "athlete_teaser" },
          ],
          click: {
            link: "https://portfolio.goteamgoagency.com/athlete/mariana-silva",
            timestamp: "2026-10-08T10:05:00.000Z",
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            ipAddress: "203.0.113.99",
          },
        },
      };

      const res = await processResendWebhook(payload, "svix_click_1");
      expect(res.processed).toBe(true);
      expect(res.dbError).toBeUndefined();
      expect(mockUpsertedEvents).toHaveLength(1);

      const saved = mockUpsertedEvents[0]!;
      expect(saved.event_id).toBe("svix_click_1");
      expect(saved.provider_email_id).toBe("re_click_1");
      expect(saved.recipient_email).toBe("coach@stanford.edu");
      expect(saved.clicked_url).toBe("https://portfolio.goteamgoagency.com/athlete/mariana-silva");
      expect(saved.clicked_at).toBe("2026-10-08T10:05:00.000Z");
      expect(saved.user_agent).toBe("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
      expect(saved.is_probable_automated).toBe(false);
      expect(saved.tags).toEqual({
        campaign_id: "550e8400-e29b-41d4-a716-446655440000",
        email_type: "athlete_teaser",
      });

      const savedPayload = saved.payload as {
        click?: Record<string, unknown>;
        tags?: Record<string, string>;
      };
      expect(savedPayload.click).toEqual({
        link: "https://portfolio.goteamgoagency.com/athlete/mariana-silva",
        timestamp: "2026-10-08T10:05:00.000Z",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      });
      // Garante que ipAddress NUNCA foi persistido
      expect(savedPayload.click && "ipAddress" in savedPayload.click).toBe(false);
    });

    it("flags click as is_probable_automated when clicked <= 10s after delivery", async () => {
      mockDeliveriesLookup = [{ occurred_at: "2026-10-08T10:00:00.000Z" }];

      const payload: ResendWebhookEventPayload = {
        type: "email.clicked",
        created_at: "2026-10-08T10:00:03.000Z",
        data: {
          email_id: "re_scanner_1",
          to: ["coach@duke.edu"],
          click: {
            link: "https://portfolio.goteamgoagency.com/athlete/mariana-silva",
            timestamp: "2026-10-08T10:00:03.000Z",
            userAgent: "Mozilla/5.0",
          },
        },
      };

      await processResendWebhook(payload, "svix_scanner_1");
      expect(mockUpsertedEvents).toHaveLength(1);
      expect(mockUpsertedEvents[0]?.is_probable_automated).toBe(true);
    });
  });

  describe("3. Database Error Handling & Extended Event Types", () => {
    it("returns dbError when email_events upsert fails so server can respond with HTTP 500", async () => {
      mockEventsUpsertError = { message: "connection timeout" };

      const res = await processResendWebhook(
        {
          type: "email.opened",
          data: { email_id: "re_err_1", to: ["coach@penn.edu"] },
        },
        "svix_err_1",
      );

      expect(res.processed).toBe(false);
      expect(res.dbError).toBe(true);
      expect(res.errorMessage).toBe("connection timeout");
    });

    it("records email.failed, email.suppressed, email.delivery_delayed and future unknown events without throwing", async () => {
      for (const type of [
        "email.failed",
        "email.suppressed",
        "email.delivery_delayed",
        "email.future_custom_event",
      ]) {
        const res = await processResendWebhook(
          {
            type,
            data: { email_id: `re_${type}`, to: ["coach@usc.edu"] },
          },
          `svix_${type}`,
        );
        expect(res.processed).toBe(true);
        expect(res.eventType).toBe(type);
      }

      expect(mockUpsertedEvents).toHaveLength(4);
    });

    it("automatically adds hard bounces and complaints to email_suppressions", async () => {
      await processResendWebhook(
        {
          type: "email.bounced",
          data: {
            email_id: "re_bounce_1",
            to: ["bounced@college.edu"],
            bounce: { type: "hard_bounce", message: "Mailbox does not exist" },
          },
        },
        "svix_bounce_1",
      );

      expect(mockUpsertedSuppressions).toHaveLength(1);
      expect(mockUpsertedSuppressions[0]?.email).toBe("bounced@college.edu");
    });
  });
});

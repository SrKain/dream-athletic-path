import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getResendConfig, getResendClient, resetResendClientCache } from "./resend-client.server";
import { processResendWebhook, verifyResendWebhookSignature } from "./resend-webhook.server";
import { sendEmail, processScheduledEmails } from "./email.server";
import { sendMailerEmails } from "./recruit-email.server";
import crypto from "node:crypto";

// Mock do Supabase admin client
const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockSelect = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

vi.mock("@/lib/supabase/clients.server", () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === "email_suppressions") {
        return {
          upsert: mockUpsert,
          select: mockSelect,
        };
      }
      if (table === "email_log" || table === "recruit_email_logs") {
        return {
          insert: mockInsert,
          select: mockSelect,
          update: mockUpdate,
        };
      }
      if (table === "agency_visual_settings") {
        return {
          select: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      return {
        select: mockSelect,
        insert: mockInsert,
        upsert: mockUpsert,
      };
    },
  }),
}));

describe("Resend Configuration & Client", () => {
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

  it("identifies missing API key correctly", () => {
    delete process.env.RESEND_API_KEY;

    const config = getResendConfig();
    expect(config.isConfigured).toBe(false);
    expect(getResendClient()).toBeNull();
  });

  it("identifies present credentials and initializes client", () => {
    process.env.RESEND_API_KEY = "re_123456789_test";
    process.env.EMAIL_FROM = "Go Team Go <contact@goteamgoagency.com>";
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test_secret";

    const config = getResendConfig();
    expect(config.isConfigured).toBe(true);
    expect(config.apiKey).toBe("re_123456789_test");
    expect(config.from).toBe("Go Team Go <contact@goteamgoagency.com>");
    expect(config.webhookSecret).toBe("whsec_test_secret");

    const client = getResendClient();
    expect(client).not.toBeNull();
    // Singleton check
    expect(getResendClient()).toBe(client);
  });
});

describe("Resend Webhook Processor (Bounces, Complaints & Verification)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies Svix signature successfully", () => {
    const secret = "whsec_mfasl3498sdfa98s7dfa";
    const cleanSecret = "mfasl3498sdfa98s7dfa";
    const secretBuffer = Buffer.from(cleanSecret, "base64");
    const svixId = "msg_p98345";
    const svixTimestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = JSON.stringify({ type: "email.delivered" });
    const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
    const sig = crypto.createHmac("sha256", secretBuffer).update(signedPayload).digest("base64");

    const headers = {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": `v1,${sig}`,
    };

    const verification = verifyResendWebhookSignature(rawBody, headers, secret);
    expect(verification.valid).toBe(true);
  });

  it("rejects invalid signature when secret is configured", () => {
    const headers = {
      "svix-id": "msg_test",
      "svix-timestamp": Math.floor(Date.now() / 1000).toString(),
      "svix-signature": "v1,invalid_signature",
    };

    const verification = verifyResendWebhookSignature("{}", headers, "whsec_mfasl3498sdfa98s7dfa");
    expect(verification.valid).toBe(false);
    expect(verification.error).toBe("Signature mismatch");
  });

  it("processes email.bounced event and inserts into email_suppressions", async () => {
    const payload = {
      type: "email.bounced",
      data: {
        to: ["bounced-coach@university.edu"],
        bounce_type: "Permanent",
      },
    };

    const result = await processResendWebhook(payload);
    expect(result.success).toBe(true);
    expect(result.type).toBe("email.bounced");
    expect(result.processedEmails).toContain("bounced-coach@university.edu");
    expect(mockUpsert).toHaveBeenCalledWith(
      { email: "bounced-coach@university.edu", reason: "resend_bounce_permanent" },
      { onConflict: "email" },
    );
  });

  it("processes email.complained event and inserts into email_suppressions", async () => {
    const payload = {
      type: "email.complained",
      data: {
        to: ["complaint-coach@athletics.org"],
      },
    };

    const result = await processResendWebhook(payload);
    expect(result.success).toBe(true);
    expect(result.type).toBe("email.complained");
    expect(result.processedEmails).toContain("complaint-coach@athletics.org");
    expect(mockUpsert).toHaveBeenCalledWith(
      { email: "complaint-coach@athletics.org", reason: "resend_complaint" },
      { onConflict: "email" },
    );
  });
});

describe("Email Service with Resend", () => {
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

  it("returns not_configured when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail({
      template: "welcome",
      to: "athlete@example.com",
      data: { name: "Test Athlete" },
    });

    expect(result.sent).toBe(false);
    if (!result.sent) {
      expect(result.reason).toBe("not_configured");
    }
  });

  it("sends email successfully when RESEND_API_KEY is configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Go Team Go <contact@goteamgoagency.com>";

    const client = getResendClient();
    if (client) {
      vi.spyOn(client.emails, "send").mockImplementation(
        () =>
          Promise.resolve({
            data: { id: "resend_msg_123" },
            error: null,
            headers: null,
          }) as ReturnType<typeof client.emails.send>,
      );
    }

    const result = await sendEmail({
      template: "welcome",
      to: "athlete@example.com",
      data: { name: "Test Athlete" },
    });

    expect(result.sent).toBe(true);
    if (result.sent && !result.scheduled) {
      expect(result.id).toBe("resend_msg_123");
    }
    expect(mockInsert).toHaveBeenCalled();
  });

  it("processes scheduled emails via Resend", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Go Team Go <contact@goteamgoagency.com>";

    const client = getResendClient();
    if (client) {
      vi.spyOn(client.emails, "send").mockImplementation(
        () =>
          Promise.resolve({
            data: { id: "resend_scheduled_ok" },
            error: null,
            headers: null,
          }) as ReturnType<typeof client.emails.send>,
      );
    }

    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        lte: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "sched_1",
                  template: "welcome",
                  to_email: "scheduled@example.com",
                  subject: "Welcome",
                  payload: { name: "Alex" },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });

    const result = await processScheduledEmails();
    expect(result.processed).toBe(1);
    expect(result.successful).toBe(1);
    expect(result.failed).toBe(0);
  });
});

describe("Mailer Batch Send with Resend", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, RESEND_API_KEY: "re_batch_test" };
    resetResendClientCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetResendClientCache();
  });

  it("filters suppressed emails and sends batch to active recipients", async () => {
    mockSelect.mockResolvedValueOnce({
      data: [{ email: "blocked@coach.com", expires_at: null }],
      error: null,
    });

    const client = getResendClient();
    if (client) {
      vi.spyOn(client.batch, "send").mockImplementation(
        () =>
          Promise.resolve({
            data: { data: [{ id: "resend_batch_1" }] },
            error: null,
            headers: null,
          }) as ReturnType<typeof client.batch.send>,
      );
    }

    const result = await sendMailerEmails({
      mode: "catalog",
      recipients: [
        { email: "active@coach.com", name: "Coach Active", universityName: "State Univ" },
        { email: "blocked@coach.com", name: "Coach Blocked", universityName: "Tech Univ" },
      ],
    });

    expect(result.totalSuppressed).toBe(1);
    expect(result.totalSent).toBe(1);
    expect(result.success).toBe(true);
  });
});

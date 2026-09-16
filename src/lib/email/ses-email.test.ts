import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getSesConfig, resetSesClientCache } from "./ses-client.server";
import { processSnsWebhook } from "./ses-webhook.server";

// Mock do supabase admin client
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
      return {
        select: mockSelect,
        insert: mockInsert,
        upsert: mockUpsert,
      };
    },
  }),
}));

describe("Amazon SES Configuration & Client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetSesClientCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetSesClientCache();
  });

  it("identifies missing credentials correctly", () => {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    const config = getSesConfig();
    expect(config.isConfigured).toBe(false);
  });

  it("identifies present credentials and configuration set correctly", () => {
    process.env.AWS_ACCESS_KEY_ID = "AKIA_MOCK_TEST";
    process.env.AWS_SECRET_ACCESS_KEY = "SECRET_MOCK_TEST";
    process.env.AWS_REGION = "sa-east-1";
    process.env.SES_CONFIGURATION_SET = "dream-athletic-config-set";
    process.env.EMAIL_FROM = "Go Team Go <contact@goteamgoagency.com>";

    const config = getSesConfig();
    expect(config.isConfigured).toBe(true);
    expect(config.accessKeyId).toBe("AKIA_MOCK_TEST");
    expect(config.region).toBe("sa-east-1");
    expect(config.configurationSet).toBe("dream-athletic-config-set");
    expect(config.from).toBe("Go Team Go <contact@goteamgoagency.com>");
  });
});

describe("Amazon SNS Webhook Processor (Bounces & Complaints)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles SubscriptionConfirmation safely with aws domain check", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("OK", { status: 200 }));

    const payload = {
      Type: "SubscriptionConfirmation",
      MessageId: "msg-123",
      TopicArn: "arn:aws:sns:us-east-1:123456789:ses-events",
      Message: "Subscription confirmation request",
      SubscribeURL:
        "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=arn...",
      Timestamp: new Date().toISOString(),
    };

    const result = await processSnsWebhook(JSON.stringify(payload));
    expect(result.success).toBe(true);
    expect(result.type).toBe("SubscriptionConfirmation");
    expect(fetchSpy).toHaveBeenCalledWith(payload.SubscribeURL);

    fetchSpy.mockRestore();
  });

  it("rejects untrusted host for SubscriptionConfirmation", async () => {
    const payload = {
      Type: "SubscriptionConfirmation",
      MessageId: "msg-123",
      TopicArn: "arn:aws:sns:us-east-1:123456789:ses-events",
      Message: "Subscription confirmation request",
      SubscribeURL: "https://malicious-site.com/confirm",
      Timestamp: new Date().toISOString(),
    };

    const result = await processSnsWebhook(payload);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Untrusted host");
  });

  it("processes SES Bounce notification and inserts into email_suppressions", async () => {
    const bounceMessage = {
      eventType: "Bounce",
      bounce: {
        bounceType: "Permanent",
        bounceSubType: "General",
        bouncedRecipients: [
          { emailAddress: "invalid-coach@unknown-university.edu" },
          { emailAddress: "nonexistent@college.edu" },
        ],
      },
    };

    const payload = {
      Type: "Notification",
      MessageId: "notif-123",
      TopicArn: "arn:aws:sns:us-east-1:123456789:ses-events",
      Message: JSON.stringify(bounceMessage),
      Timestamp: new Date().toISOString(),
    };

    const result = await processSnsWebhook(payload);
    expect(result.success).toBe(true);
    expect(result.type).toBe("Bounce");
    expect(result.processedEmails).toContain("invalid-coach@unknown-university.edu");
    expect(result.processedEmails).toContain("nonexistent@college.edu");
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert).toHaveBeenCalledWith(
      { email: "invalid-coach@unknown-university.edu", reason: "ses_bounce_permanent" },
      { onConflict: "email" },
    );
  });

  it("processes SES Complaint notification and inserts into email_suppressions", async () => {
    const complaintMessage = {
      eventType: "Complaint",
      complaint: {
        complainedRecipients: [{ emailAddress: "coach-spam-reporter@ncaa.org" }],
      },
    };

    const payload = {
      Type: "Notification",
      MessageId: "notif-456",
      TopicArn: "arn:aws:sns:us-east-1:123456789:ses-events",
      Message: JSON.stringify(complaintMessage),
      Timestamp: new Date().toISOString(),
    };

    const result = await processSnsWebhook(payload);
    expect(result.success).toBe(true);
    expect(result.type).toBe("Complaint");
    expect(result.processedEmails).toContain("coach-spam-reporter@ncaa.org");
    expect(mockUpsert).toHaveBeenCalledWith(
      { email: "coach-spam-reporter@ncaa.org", reason: "ses_complaint" },
      { onConflict: "email" },
    );
  });
});

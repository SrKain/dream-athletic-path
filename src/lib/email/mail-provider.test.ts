import { describe, expect, it } from "vitest";
import {
  FakeMailProvider,
  ResendMailProvider,
  getMailProvider,
  type BatchEmailItem,
} from "./mail-provider.server";

describe("MailProvider Abstraction & Permissive Batch Handling", () => {
  const sampleItems: BatchEmailItem[] = [
    {
      id: "queue-1",
      to: "coach1@university.edu",
      subject: "Showcase 1",
      html: "<p>Hello Coach 1</p>",
    },
    {
      id: "queue-2",
      to: "coach2@university.edu",
      subject: "Showcase 2",
      html: "<p>Hello Coach 2</p>",
    },
  ];

  it("factory returns FakeMailProvider when dryRun: true and ResendMailProvider when false", () => {
    const fake = getMailProvider({ dryRun: true });
    expect(fake).toBeInstanceOf(FakeMailProvider);

    const real = getMailProvider({ dryRun: false });
    expect(real).toBeInstanceOf(ResendMailProvider);
  });

  it("FakeMailProvider returns synthetic dry_ IDs without network calls", async () => {
    const provider = new FakeMailProvider({ latencyMs: 5 });
    const outcome = await provider.sendBatch(sampleItems, { dryRun: true });

    expect(outcome.sent).toHaveLength(2);
    expect(outcome.failed).toHaveLength(0);
    expect(outcome.sent[0].providerId).toMatch(/^dry_/);
    expect(outcome.sent[1].providerId).toMatch(/^dry_/);
    expect(outcome.sent[0].id).toBe("queue-1");
    expect(outcome.sent[1].id).toBe("queue-2");
  });

  it("ResendMailProvider triggers circuit break when API key is missing", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    try {
      const provider = new ResendMailProvider();
      const outcome = await provider.sendBatch(sampleItems);

      expect(outcome.circuitBreak).toBe(true);
      expect(outcome.sent).toHaveLength(0);
      expect(outcome.failed).toHaveLength(2);
      expect(outcome.failed[0].errorCode).toBe("RESEND_NOT_CONFIGURED");
    } finally {
      if (prevKey) process.env.RESEND_API_KEY = prevKey;
    }
  });
});

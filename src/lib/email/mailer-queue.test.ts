import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enqueueCampaignDispatches,
  processMailerQueue,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  getCampaignQueueProgress,
} from "./mailer-queue.server";
import type { SendMailerInput } from "./recruit-email.server";

// Mocks do Supabase e Resend
const mockCampaigns = new Map<string, any>();
const mockQueue = new Map<string, any>();
const mockLogs: any[] = [];
const mockRateLimit = {
  id: "global_resend_limit",
  locked_until: null as string | null,
  dispatches_in_window: 0,
};

const mockResendSend = vi.fn().mockResolvedValue({
  data: { id: "resend_test_msg_id" },
  error: null,
});

vi.mock("./resend-client.server", () => ({
  getResendClient: () => ({
    emails: {
      send: mockResendSend,
    },
  }),
  getResendConfig: () => ({
    isConfigured: true,
    from: "Go Team Go <scouting@goteamgoagency.com>",
  }),
}));

vi.mock("./recruit-email.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./recruit-email.server")>();
  return {
    ...actual,
    getSuppressedEmailSet: vi.fn().mockResolvedValue(new Set(["suppressed@coach.edu"])),
  };
});

function createMockAdminClient() {
  return {
    from: (table: string) => {
      if (table === "mailer_campaigns") {
        return {
          insert: vi.fn(async (row: any) => {
            const rowData = Array.isArray(row) ? row[0] : row;
            mockCampaigns.set(rowData.id, { ...rowData });
            return { data: [rowData], error: null };
          }),
          select: vi.fn((_cols?: string) => ({
            eq: vi.fn((col: string, val: any) => {
              const res = {
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => {
                      for (const c of mockCampaigns.values()) {
                        if (c[col] === val) return { data: c, error: null };
                      }
                      return { data: null, error: null };
                    }),
                  })),
                })),
                maybeSingle: vi.fn(async () => {
                  const c = mockCampaigns.get(val);
                  return { data: c || null, error: null };
                }),
              };
              return res;
            }),
          })),
          update: vi.fn((updates: any) => ({
            eq: vi.fn(async (_col: string, id: string) => {
              const existing = mockCampaigns.get(id);
              if (existing) {
                mockCampaigns.set(id, { ...existing, ...updates });
              }
              return { data: null, error: null };
            }),
          })),
        };
      }

      if (table === "mailer_queue") {
        return {
          insert: vi.fn(async (rows: any[]) => {
            for (const r of rows) {
              const id = r.id || `q_${mockQueue.size + 1}`;
              mockQueue.set(id, { ...r, id });
            }
            return { data: rows, error: null };
          }),
          select: vi.fn((_cols?: string, opts?: any) => ({
            eq: vi.fn((col: string, val: any) => {
              const matches: any[] = [];
              for (const q of mockQueue.values()) {
                if (q[col] === val) matches.push(q);
              }

              // Return an object that is both awaitable (returns matches) AND allows chaining .in, .order, etc.
              const queryObj: any = {
                then: (resolve: any) => resolve({ data: matches, error: null }),
                in: vi.fn((statusCol: string, statuses: string[]) => ({
                  order: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(async (lim: number) => {
                        const inMatches: any[] = [];
                        for (const q of mockQueue.values()) {
                          if (q[col] === val && statuses.includes(q[statusCol])) {
                            inMatches.push(q);
                            if (inMatches.length >= lim) break;
                          }
                        }
                        return { data: inMatches, error: null };
                      }),
                    })),
                  })),
                })),
              };
              return queryObj;
            }),
          })),
          update: vi.fn((updates: any) => ({
            eq: vi.fn((col: string, val: string) => {
              const performUpdate = () => {
                for (const [id, q] of mockQueue.entries()) {
                  if (q[col] === val) {
                    mockQueue.set(id, { ...q, ...updates });
                  }
                }
                return { data: null, error: null };
              };

              const updateChain: any = {
                then: (resolve: any) => resolve(performUpdate()),
                in: vi.fn(async (col2: string, vals2: string[]) => {
                  for (const [id, q] of mockQueue.entries()) {
                    if (q[col] === val && vals2.includes(q[col2])) {
                      mockQueue.set(id, { ...q, ...updates });
                    }
                  }
                  return { data: null, error: null };
                }),
                neq: vi.fn(async (col2: string, val2: string) => {
                  for (const [id, q] of mockQueue.entries()) {
                    if (q[col] === val && q[col2] !== val2) {
                      mockQueue.set(id, { ...q, ...updates });
                    }
                  }
                  return { data: null, error: null };
                }),
              };
              return updateChain;
            }),
            in: vi.fn((col: string, vals: string[]) => ({
              select: vi.fn(async () => {
                const updatedList: any[] = [];
                for (const id of vals) {
                  const q = mockQueue.get(id);
                  if (q) {
                    const u = { ...q, ...updates };
                    mockQueue.set(id, u);
                    updatedList.push(u);
                  }
                }
                return { data: updatedList, error: null };
              }),
            })),
          })),
        };
      }

      if (table === "mailer_rate_limits") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: mockRateLimit, error: null })),
            })),
          })),
          update: vi.fn((updates: any) => ({
            eq: vi.fn(async () => {
              Object.assign(mockRateLimit, updates);
              return { data: null, error: null };
            }),
          })),
        };
      }

      if (table === "recruit_email_logs") {
        return {
          insert: vi.fn(async (rows: any[]) => {
            const list = Array.isArray(rows) ? rows : [rows];
            mockLogs.push(...list);
            return { data: list, error: null };
          }),
        };
      }

      if (table === "agency_visual_settings") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { logo_url: "https://example.com/logo.png", hero_background_url: null },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "athletes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col: string, val: string) => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: val,
                  slug: `athlete-${val}`,
                  full_name: `Athlete ${val}`,
                  photo_url: null,
                  height_cm: 180,
                  nationality: "BRA",
                  sport_id: null,
                  position_id: null,
                },
                error: null,
              })),
            })),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
        insert: vi.fn(async () => ({ data: null, error: null })),
        update: vi.fn(async () => ({ data: null, error: null })),
      };
    },
    rpc: vi.fn(async (fnName: string, args: any) => {
      if (fnName === "recover_stale_mailer_queue_reservations") {
        return { data: 0, error: null };
      }
      if (fnName === "claim_mailer_queue_batch") {
        const batchSize = args.p_batch_size || 150;
        const claimed: any[] = [];
        for (const [id, q] of mockQueue.entries()) {
          if (q.status === "pending" || q.status === "retry") {
            const updated = {
              ...q,
              status: "processing",
              reserved_by: args.p_worker_id,
              attempts: (q.attempts || 0) + 1,
            };
            mockQueue.set(id, updated);
            claimed.push(updated);
            if (claimed.length >= batchSize) break;
          }
        }
        return { data: claimed, error: null };
      }
      return { data: null, error: null };
    }),
  } as any;
}

describe("Mailer Intelligent Queue & Rate Limiting Suite", () => {
  beforeEach(() => {
    mockCampaigns.clear();
    mockQueue.clear();
    mockLogs.length = 0;
    mockRateLimit.locked_until = null;
    mockResendSend.mockReset();
    mockResendSend.mockResolvedValue({
      data: { id: "resend_test_msg_id" },
      error: null,
    });
  });

  describe("1. Campaign Enqueueing & Batch Calculations (10, 150, 151, 300, 1000)", () => {
    it("handles small campaign (10 recipients) in 1 batch", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 10 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
        universityName: "State Univ",
      }));

      const input: SendMailerInput = {
        mode: "catalog",
        recipients,
      };

      const result = await enqueueCampaignDispatches(input, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.totalRecipients).toBe(10);
      expect(result.totalEnqueued).toBe(10);
      expect(result.totalBatches).toBe(1);
      expect(mockQueue.size).toBe(10);

      // Verify campaign created in mockCampaigns
      const campaign = mockCampaigns.get(result.campaignId);
      expect(campaign).toBeDefined();
      expect(campaign.status).toBe("running");
      expect(campaign.total_recipients).toBe(10);
      expect(campaign.total_batches).toBe(1);
    });

    it("handles exact boundary (150 recipients) in 1 batch", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 150 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const input: SendMailerInput = {
        mode: "catalog",
        recipients,
      };

      const result = await enqueueCampaignDispatches(input, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.totalBatches).toBe(1);
      expect(mockQueue.size).toBe(150);
    });

    it("handles 151 recipients splitting cleanly into 2 batches (150 + 1)", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 151 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const input: SendMailerInput = {
        mode: "catalog",
        recipients,
      };

      const result = await enqueueCampaignDispatches(input, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.totalBatches).toBe(2);
      expect(mockQueue.size).toBe(151);

      let batch1Count = 0;
      let batch2Count = 0;
      for (const q of mockQueue.values()) {
        if (q.batch_number === 1) batch1Count++;
        if (q.batch_number === 2) batch2Count++;
      }
      expect(batch1Count).toBe(150);
      expect(batch2Count).toBe(1);
    });

    it("handles 300 recipients into 2 batches of 150", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 300 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const input: SendMailerInput = {
        mode: "catalog",
        recipients,
      };

      const result = await enqueueCampaignDispatches(input, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.totalBatches).toBe(2);
      expect(mockQueue.size).toBe(300);
    });

    it("handles large campaign of 1000 recipients across 7 batches (ceil(1000/150) = 7)", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 1000 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const input: SendMailerInput = {
        mode: "catalog",
        recipients,
      };

      const result = await enqueueCampaignDispatches(input, mockAdmin);

      expect(result.success).toBe(true);
      expect(result.totalBatches).toBe(7);
      expect(mockQueue.size).toBe(1000);
    });

    it("omits suppressed email from queue and logs it", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = [
        { name: "Active Coach", email: "active@coach.edu" },
        { name: "Suppressed Coach", email: "suppressed@coach.edu" },
      ];

      const input: SendMailerInput = {
        mode: "catalog",
        recipients,
      };

      const result = await enqueueCampaignDispatches(input, mockAdmin);

      expect(result.totalRecipients).toBe(2);
      expect(result.totalEnqueued).toBe(1);
      expect(result.totalSuppressed).toBe(1);
      expect(mockQueue.size).toBe(1);
      expect(mockLogs.some((l) => l.status === "suppressed")).toBe(true);
    });
  });

  describe("2. Worker Processing, Rate Limits & Batch Progression", () => {
    it("processes a batch of up to 150 items and updates queue & logs", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 10 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const enqueueRes = await enqueueCampaignDispatches(
        { mode: "catalog", recipients },
        mockAdmin,
      );

      const processRes = await processMailerQueue({
        customAdmin: mockAdmin,
        maxBatchSize: 150,
        itemSpacingMs: 0,
      });

      expect(processRes.processed).toBe(10);
      expect(processRes.sent).toBe(10);
      expect(processRes.failed).toBe(0);
      expect(processRes.rateLimited).toBe(false);

      for (const q of mockQueue.values()) {
        expect(q.status).toBe("sent");
        expect(q.provider_message_id).toBe("resend_test_msg_id");
      }

      const campaign = mockCampaigns.get(enqueueRes.campaignId);
      expect(campaign.status).toBe("completed");
      expect(campaign.sent_count).toBe(10);
    });

    it("respects HTTP 429 rate limit, triggers backoff and avoids hammering Resend", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 5 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      await enqueueCampaignDispatches({ mode: "catalog", recipients }, mockAdmin);

      mockResendSend.mockRejectedValueOnce(new Error("429 Too Many Requests"));

      const processRes = await processMailerQueue({
        customAdmin: mockAdmin,
        maxBatchSize: 150,
        itemSpacingMs: 0,
      });

      expect(processRes.rateLimited).toBe(true);
      expect(processRes.retried).toBeGreaterThan(0);
      expect(mockRateLimit.locked_until).toBeDefined();

      for (const q of mockQueue.values()) {
        expect(["retry", "pending"]).toContain(q.status);
      }
    });

    it("retries transient failures up to max_attempts (3) before failing definitively", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = [{ name: "Coach Error", email: "error@college.edu" }];

      await enqueueCampaignDispatches({ mode: "catalog", recipients }, mockAdmin);

      // Attempt 1: fails -> retry
      mockResendSend.mockRejectedValueOnce(new Error("Network timeout"));
      await processMailerQueue({ customAdmin: mockAdmin, itemSpacingMs: 0, ignoreCooldown: true });

      let item = Array.from(mockQueue.values())[0];
      expect(item.status).toBe("retry");
      expect(item.attempts).toBe(1);

      // Attempt 2: fails -> retry
      mockResendSend.mockRejectedValueOnce(new Error("Network timeout"));
      await processMailerQueue({ customAdmin: mockAdmin, itemSpacingMs: 0, ignoreCooldown: true });
      item = Array.from(mockQueue.values())[0];
      expect(item.status).toBe("retry");
      expect(item.attempts).toBe(2);

      // Attempt 3: fails -> reached max_attempts (3) -> failed
      mockResendSend.mockRejectedValueOnce(new Error("Permanent server error"));
      await processMailerQueue({ customAdmin: mockAdmin, itemSpacingMs: 0, ignoreCooldown: true });
      item = Array.from(mockQueue.values())[0];
      expect(item.status).toBe("failed");
      expect(item.attempts).toBe(3);
    });
  });

  describe("3. Campaign State Controls: Pause, Resume & Cancel", () => {
    it("pauses an active campaign preventing further queue processing", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 5 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const enqueueRes = await enqueueCampaignDispatches(
        { mode: "catalog", recipients },
        mockAdmin,
      );

      const pauseRes = await pauseCampaign(enqueueRes.campaignId, mockAdmin);
      expect(pauseRes.success).toBe(true);

      const campaign = mockCampaigns.get(enqueueRes.campaignId);
      expect(campaign.status).toBe("paused");

      const processRes = await processMailerQueue({ customAdmin: mockAdmin, itemSpacingMs: 0 });
      expect(processRes.processed).toBe(0);
    });

    it("resumes a paused campaign and enables processing", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 5 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const enqueueRes = await enqueueCampaignDispatches(
        { mode: "catalog", recipients },
        mockAdmin,
      );

      await pauseCampaign(enqueueRes.campaignId, mockAdmin);
      const resumeRes = await resumeCampaign(enqueueRes.campaignId, mockAdmin);
      expect(resumeRes.success).toBe(true);

      const campaign = mockCampaigns.get(enqueueRes.campaignId);
      expect(campaign.status).toBe("running");

      const processRes = await processMailerQueue({ customAdmin: mockAdmin, itemSpacingMs: 0, ignoreCooldown: true });
      expect(processRes.sent).toBe(5);
    });

    it("cancels campaign and marks pending items as cancelled without losing sent history", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 10 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const enqueueRes = await enqueueCampaignDispatches(
        { mode: "catalog", recipients },
        mockAdmin,
      );

      // Process first 5 items
      await processMailerQueue({ customAdmin: mockAdmin, maxBatchSize: 5, itemSpacingMs: 0 });

      // Cancel campaign
      const cancelRes = await cancelCampaign(enqueueRes.campaignId, mockAdmin);
      expect(cancelRes.success).toBe(true);

      const campaign = mockCampaigns.get(enqueueRes.campaignId);
      expect(campaign.status).toBe("cancelled");

      let sentCount = 0;
      let cancelledCount = 0;
      for (const q of mockQueue.values()) {
        if (q.status === "sent") sentCount++;
        if (q.status === "cancelled") cancelledCount++;
      }

      expect(sentCount).toBe(5);
      expect(cancelledCount).toBe(5);
    });

    it("calculates accurate campaign progress metrics", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 20 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const enqueueRes = await enqueueCampaignDispatches(
        { mode: "catalog", recipients },
        mockAdmin,
      );

      await processMailerQueue({ customAdmin: mockAdmin, maxBatchSize: 10, itemSpacingMs: 0 });

      const progress = await getCampaignQueueProgress(enqueueRes.campaignId, mockAdmin);
      expect(progress).toBeDefined();
      expect(progress?.totalRecipients).toBe(20);
      expect(progress?.sentCount).toBe(10);
      expect(progress?.percentComplete).toBe(50);
      expect(progress?.currentBatch).toBeGreaterThanOrEqual(1);
    });
  });
});

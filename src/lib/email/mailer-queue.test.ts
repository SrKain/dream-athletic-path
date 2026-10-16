/* eslint-disable @typescript-eslint/no-explicit-any */
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
let failQueueInsertOnCall = 0;
let queueInsertCalls = 0;
let failSentPersistence = false;
let failLease = false;
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
            queueInsertCalls += 1;
            if (queueInsertCalls === failQueueInsertOnCall) {
              return { data: null, error: { message: "simulated queue insert failure" } };
            }
            for (const r of rows) {
              const id = r.id || `q_${mockQueue.size + 1}`;
              mockQueue.set(id, { ...r, id });
            }
            return { data: rows, error: null };
          }),
          select: vi.fn((_cols?: string, opts?: any) => {
            const createQueryChain = (currentMatches: any[]) => {
              const chain: any = {
                then: (resolve: any) =>
                  resolve({
                    data: opts?.head ? null : currentMatches,
                    count: currentMatches.length,
                    error: null,
                  }),
                eq: vi.fn((col: string, val: any) => {
                  const filtered = currentMatches.filter((q) => q[col] === val);
                  return createQueryChain(filtered);
                }),
                in: vi.fn((col: string, vals: any[]) => {
                  const filtered = currentMatches.filter((q) => vals.includes(q[col]));
                  return createQueryChain(filtered);
                }),
                order: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async (lim: number) => ({
                      data: opts?.head ? null : currentMatches.slice(0, lim),
                      count: Math.min(currentMatches.length, lim),
                      error: null,
                    })),
                  })),
                })),
              };
              return chain;
            };

            return {
              eq: vi.fn((col: string, val: any) => {
                const matches = Array.from(mockQueue.values()).filter((q) => q[col] === val);
                return createQueryChain(matches);
              }),
              in: vi.fn((col: string, vals: any[]) => {
                const matches = Array.from(mockQueue.values()).filter((q) => vals.includes(q[col]));
                return createQueryChain(matches);
              }),
            };
          }),
          update: vi.fn((updates: any) => ({
            eq: vi.fn((col: string, val: string) => {
              const performUpdate = () => {
                if (updates.status === "sent" && failSentPersistence) {
                  return { data: null, error: { message: "simulated sent persistence failure" } };
                }
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
      if (fnName === "acquire_mailer_campaign_lease") {
        return failLease
          ? { data: null, error: { message: "simulated lease unavailable" } }
          : { data: true, error: null };
      }
      if (fnName === "get_mailer_campaign_progress_summary") {
        const campaignId = args.p_campaign_id;
        const c = mockCampaigns.get(campaignId);
        if (!c) return { data: null, error: null };
        let sent = 0;
        let failed = 0;
        let pending = 0;
        let processing = 0;
        let cancelled = 0;
        for (const q of mockQueue.values()) {
          if (q.campaign_id === campaignId) {
            if (q.status === "sent") sent++;
            else if (q.status === "failed") failed++;
            else if (q.status === "pending" || q.status === "retry") pending++;
            else if (q.status === "processing") processing++;
            else if (q.status === "cancelled") cancelled++;
          }
        }
        return {
          data: {
            campaign_id: c.id,
            status: c.status,
            subject: c.subject,
            total_recipients: c.total_recipients,
            sent_count: sent,
            failed_count: failed,
            suppressed_count: c.suppressed_count || 0,
            pending_count: pending,
            processing_count: processing,
            cancelled_count: cancelled,
            current_batch: c.current_batch || 1,
            total_batches: c.total_batches || 1,
            batch_size: c.batch_size || 150,
            next_batch_at: c.next_batch_at,
            cooldown_remaining_sec: 0,
            started_at: c.started_at,
            completed_at: c.completed_at,
            last_error: c.last_error,
            controller_id: c.controller_id,
          },
          error: null,
        };
      }
      if (fnName === "claim_mailer_queue_batch") {
        const batchSize = Math.min(2, Math.max(1, args.p_batch_size || 2));
        const campaignId = args.p_campaign_id;
        const claimed: any[] = [];
        for (const [id, q] of mockQueue.entries()) {
          if (campaignId && q.campaign_id !== campaignId) continue;
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
    failQueueInsertOnCall = 0;
    queueInsertCalls = 0;
    failSentPersistence = false;
    failLease = false;
    mockRateLimit.locked_until = null;
    mockResendSend.mockReset();
    mockResendSend.mockResolvedValue({
      data: { id: "resend_test_msg_id" },
      error: null,
    });
  });

  describe("1. Campaign Enqueueing & Batch Calculations (10, 150, 151, 300, 1000)", () => {
    it("persists a custom subject and a different greeting for each coach", async () => {
      const result = await enqueueCampaignDispatches(
        {
          mode: "catalog",
          customOptions: { subject: "Recruiting for next season" },
          recipients: [
            { name: "Taylor Smith", lastName: "Smith", email: "smith@college.edu" },
            { name: "Alex Van Dijk", lastName: "Van Dijk", email: "alex@college.edu" },
          ],
        },
        createMockAdminClient(),
      );
      expect(result.success).toBe(true);
      const items = Array.from(mockQueue.values());
      expect(items).toHaveLength(2);
      expect(items[0].subject).toBe("Recruiting for next season");
      expect(items[0].payload.html).toContain("Hi Coach Smith,");
      expect(items[0].payload.text).toContain("Hi Coach Smith,");
      expect(items[1].payload.html).toContain("Hi Coach Van Dijk,");
      expect(items[1].payload.text).toContain("Hi Coach Van Dijk,");
    });

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
    it("processes items in micro-batches and updates queue & logs", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 10 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const enqueueRes = await enqueueCampaignDispatches(
        { mode: "catalog", recipients },
        mockAdmin,
      );

      let totalProcessed = 0;
      let totalSent = 0;
      while (totalSent < 10) {
        const tickRes = await processMailerQueue({
          customAdmin: mockAdmin,
          campaignId: enqueueRes.campaignId,
          maxBatchSize: 2,
        });
        totalProcessed += tickRes.processed;
        totalSent += tickRes.sent;
        if (tickRes.campaignCompleted || tickRes.processed === 0) break;
      }

      expect(totalProcessed).toBe(10);
      expect(totalSent).toBe(10);

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

      const enqueueRes = await enqueueCampaignDispatches(
        { mode: "catalog", recipients },
        mockAdmin,
      );

      mockResendSend.mockRejectedValueOnce(new Error("429 Too Many Requests"));

      const processRes = await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
        maxBatchSize: 2,
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

      const enqueueRes = await enqueueCampaignDispatches(
        { mode: "catalog", recipients },
        mockAdmin,
      );

      // Attempt 1: fails -> retry
      mockResendSend.mockRejectedValueOnce(new Error("Network timeout"));
      await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
        maxBatchSize: 1,
      });

      let item = Array.from(mockQueue.values())[0];
      expect(item.status).toBe("retry");
      expect(item.attempts).toBe(1);

      // Attempt 2: fails -> retry
      mockResendSend.mockRejectedValueOnce(new Error("Network timeout"));
      await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
        maxBatchSize: 1,
      });
      item = Array.from(mockQueue.values())[0];
      expect(item.status).toBe("retry");
      expect(item.attempts).toBe(2);

      // Attempt 3: fails -> reached max_attempts (3) -> failed
      mockResendSend.mockRejectedValueOnce(new Error("Permanent server error"));
      await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
        maxBatchSize: 1,
      });
      item = Array.from(mockQueue.values())[0];
      expect(item.status).toBe("failed");
      expect(item.attempts).toBe(3);
    });

    it("processes micro-batches of 2 emails per cycle as orchestrated by browser", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 6 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const enqueueRes = await enqueueCampaignDispatches(
        { mode: "catalog", recipients },
        mockAdmin,
      );

      // Micro-tick 1: 2 emails
      const tick1 = await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
        maxBatchSize: 2,
      });
      expect(tick1.processed).toBe(2);
      expect(tick1.sent).toBe(2);
      expect(tick1.campaignCompleted).toBe(false);

      // Micro-tick 2: 2 emails
      const tick2 = await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
        maxBatchSize: 2,
      });
      expect(tick2.processed).toBe(2);
      expect(tick2.sent).toBe(2);
      expect(tick2.campaignCompleted).toBe(false);

      // Micro-tick 3: 2 emails
      const tick3 = await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
        maxBatchSize: 2,
      });
      expect(tick3.processed).toBe(2);
      expect(tick3.sent).toBe(2);

      // Micro-tick 4: all items sent -> marks completed
      const tick4 = await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
        maxBatchSize: 2,
      });
      expect(tick4.campaignCompleted).toBe(true);
      expect(tick4.campaignStatus).toBe("completed");
    });

    it("scopes queue reservation strictly to authorized campaignId and does not claim items from other campaigns", async () => {
      const mockAdmin = createMockAdminClient();
      const campA = await enqueueCampaignDispatches(
        { mode: "catalog", recipients: [{ name: "Coach A", email: "a@college.edu" }] },
        mockAdmin,
      );
      const campB = await enqueueCampaignDispatches(
        { mode: "catalog", recipients: [{ name: "Coach B", email: "b@college.edu" }] },
        mockAdmin,
      );

      // Process only Campaign A
      const resA = await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: campA.campaignId,
        maxBatchSize: 2,
      });

      expect(resA.sent).toBe(1);
      expect(resA.activeCampaignId).toBe(campA.campaignId);

      // Items for Campaign B must remain pending
      const queueB = Array.from(mockQueue.values()).find((q) => q.campaign_id === campB.campaignId);
      expect(queueB?.status).toBe("pending");
    });

    it("fails closed when the server-side lease cannot be obtained", async () => {
      const mockAdmin = createMockAdminClient();
      const camp = await enqueueCampaignDispatches(
        { mode: "catalog", recipients: [{ name: "Test Coach", email: "coach@college.edu" }] },
        mockAdmin,
      );
      failLease = true;
      const result = await processMailerQueue({
        customAdmin: mockAdmin, campaignId: camp.campaignId, clientId: "browser-1",
      });
      expect(result.processed).toBe(0);
      expect(result.message).toContain("lease");
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it("never activates a partially inserted campaign", async () => {
      const mockAdmin = createMockAdminClient();
      failQueueInsertOnCall = 2;
      const recipients = Array.from({ length: 151 }, (_, i) => ({
        name: `Coach ${i}`, email: `coach${i}@college.edu`,
      }));
      const camp = await enqueueCampaignDispatches({ mode: "catalog", recipients }, mockAdmin);
      expect(camp.success).toBe(false);
      expect(camp.totalEnqueued).toBe(0);
      expect(mockCampaigns.get(camp.campaignId).status).toBe("failed");
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it("stops after Resend acceptance when queue persistence is unavailable", async () => {
      const mockAdmin = createMockAdminClient();
      const camp = await enqueueCampaignDispatches(
        { mode: "catalog", recipients: [{ name: "Test Coach", email: "coach@college.edu" }] },
        mockAdmin,
      );
      failSentPersistence = true;
      const result = await processMailerQueue({
        customAdmin: mockAdmin, campaignId: camp.campaignId, clientId: "browser-1",
      });
      expect(result.campaignStatus).toBe("paused");
      expect(result.message).toContain("Manual reconciliation required");
      expect(mockResendSend).toHaveBeenCalledTimes(1);
      expect(mockCampaigns.get(camp.campaignId).status).toBe("paused");
    });

    it("uses the official Resend request idempotency option", async () => {
      const mockAdmin = createMockAdminClient();
      const camp = await enqueueCampaignDispatches(
        { mode: "catalog", recipients: [{ name: "Test Coach", email: "coach@college.edu" }] },
        mockAdmin,
      );
      await processMailerQueue({ customAdmin: mockAdmin, campaignId: camp.campaignId });
      const queueItem = Array.from(mockQueue.values())[0];
      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["coach@college.edu"],
          headers: { "X-Entity-Ref-ID": queueItem.idempotency_key },
        }),
        { idempotencyKey: queueItem.idempotency_key },
      );
    });

    it("deduplicates recipients with the same normalized email address", async () => {
      const mockAdmin = createMockAdminClient();
      const res = await enqueueCampaignDispatches(
        {
          mode: "catalog",
          recipients: [
            { name: "Coach One", email: "coach@college.edu" },
            { name: "Coach Two", email: "  COACH@college.edu " },
          ],
        },
        mockAdmin,
      );

      expect(res.success).toBe(true);
      expect(res.totalEnqueued).toBe(1);
      const items = Array.from(mockQueue.values()).filter((q) => q.campaign_id === res.campaignId);
      expect(items).toHaveLength(1);
      expect(items[0].recipient_email).toBe("coach@college.edu");
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

      const processRes = await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
      });
      expect(processRes.processed).toBe(0);
      expect(processRes.campaignStatus).toBe("paused");
    });

    it("resumes a paused campaign and enables processing", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 4 }, (_, i) => ({
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

      const processRes = await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
        maxBatchSize: 2,
      });
      expect(processRes.sent).toBe(2);
    });

    it("cancels campaign and marks pending items as cancelled without losing sent history", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 6 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const enqueueRes = await enqueueCampaignDispatches(
        { mode: "catalog", recipients },
        mockAdmin,
      );

      // Process first 2 items
      await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
        maxBatchSize: 2,
      });

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

      expect(sentCount).toBe(2);
      expect(cancelledCount).toBe(4);
    });

    it("calculates accurate campaign progress metrics", async () => {
      const mockAdmin = createMockAdminClient();
      const recipients = Array.from({ length: 6 }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));

      const enqueueRes = await enqueueCampaignDispatches(
        { mode: "catalog", recipients },
        mockAdmin,
      );

      await processMailerQueue({
        customAdmin: mockAdmin,
        campaignId: enqueueRes.campaignId,
        maxBatchSize: 2,
      });

      const progress = await getCampaignQueueProgress(enqueueRes.campaignId, mockAdmin);
      expect(progress).toBeDefined();
      expect(progress?.totalRecipients).toBe(6);
      expect(progress?.sentCount).toBe(2);
      expect(progress?.percentComplete).toBe(33);
      expect(progress?.currentBatch).toBeGreaterThanOrEqual(1);
    });
  });
});

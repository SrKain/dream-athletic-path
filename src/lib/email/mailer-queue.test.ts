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

import { assertAnaQuickFacts } from "./__fixtures__/assert-quick-facts";
import { loadAthletesEmailData } from "./athlete-email-data.server";
import { composeEmailBlocks } from "./email-blocks";
import { renderRecruitEmail, renderMultiAthleteRecruitEmail } from "./recruit-email-template";
import { renderCatalogEmail } from "./recruit-email-catalog-template";

// Mocks do Supabase e Resend
const mockCampaigns = new Map<string, any>();
const mockQueue = new Map<string, any>();
const mockLogs: any[] = [];
const mockPersistedCoachIds = new Set<string>();
let mockEmailBio: string | null = "Full professional biography for the athlete.";
let mockEmailFit: string | null = "High court awareness; Reliable leadership";
let failQueueInsertOnCall = 0;
let queueInsertCalls = 0;
let failSentPersistence = false;
let failLease = false;
const mockRateLimit = {
  id: "global_resend_limit",
  locked_until: null as string | null,
  dispatches_in_window: 0,
};

const mockResendBatchSend = vi.fn(async (messages: Array<{ to: string[] }>) => ({
  data: { data: messages.map((_, i) => ({ id: `resend_batch_${i}` })) },
  error: null,
}));

const mockResendSend = vi.fn().mockResolvedValue({
  data: { id: "resend_test_msg_id" },
  error: null,
});

vi.mock("./resend-client.server", () => ({
  getResendClient: () => ({
    emails: {
      send: mockResendSend,
    },
    batch: { send: mockResendBatchSend },
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

// Queue paths must use one complete per-athlete dataset, never per-recipient queries.
vi.mock("./athlete-email-data.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./athlete-email-data.server")>();
  return {
    ...actual,
    loadAthletesEmailData: vi.fn(async (athleteIds: string[]) =>
      athleteIds.map((id) => ({
        athleteId: id,
        athleteName: `Prospect ${id.slice(0, 4)}`,
        athleteSlug: `prospect-${id.slice(0, 4)}`,
        positionName: "Setter",
        nationality: "Brazil",
        athleteStatus: "Sophomore",
        heightCm: 170,
        gpa: 3.31,
        currentSchool: "Eastern Wyoming College",
        seekingOpportunities: "Fall 2025",
        courseOfInterest: "Computer Engineering",
        countryFlag: "🇧🇷",
        aboutHer: mockEmailBio,
        teamContribution: mockEmailFit,
        highSchoolGraduation: "2025",
        collegeStartDate: "Fall 2026",
      })),
    ),
  };
});

function createMockAdminClient() {
  return {
    from: (table: string) => {
      if (table === "coaches") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({
              data: ids.filter((id) => mockPersistedCoachIds.has(id)).map((id) => ({ id })),
              error: null,
            })),
          })),
        };
      }

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
                neq: vi.fn((col: string, value: any) =>
                  createQueryChain(currentMatches.filter((q) => q[col] !== value)),
                ),
                order: vi.fn(() => createQueryChain(currentMatches)),
                range: vi.fn(async (from: number, to: number) => ({
                  data: currentMatches.slice(from, to + 1),
                  error: null,
                })),
                limit: vi.fn(async (lim: number) => ({
                  data: opts?.head ? null : currentMatches.slice(0, lim),
                  count: Math.min(currentMatches.length, lim),
                  error: null,
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
      if (fnName === "complete_mailer_burst") {
        if (failSentPersistence)
          return { data: null, error: { message: "simulated sent persistence failure" } };
        const camp = mockCampaigns.get(args.p_campaign_id);
        let updated = 0;
        for (const result of args.p_results) {
          const q = mockQueue.get(result.id);
          if (!q || q.reserved_by !== args.p_worker_id) continue;
          const next = {
            ...q,
            status: result.status,
            provider_message_id: result.provider_id || q.provider_message_id,
            last_error: result.error_message,
            next_retry_at: result.next_retry_at,
            reserved_by: null,
            reservation_expires_at: null,
          };
          mockQueue.set(q.id, next);
          updated++;
          if (result.status === "sent" || result.status === "failed") {
            mockLogs.push({
              campaign_id: q.campaign_id,
              status: result.status,
              recipient_email: q.recipient_email,
              provider_id: result.provider_id || null,
            });
          }
        }
        const rows = Array.from(mockQueue.values()).filter(
          (q) => q.campaign_id === args.p_campaign_id,
        );
        const remain = rows.filter((q) =>
          ["pending", "processing", "retry"].includes(q.status),
        ).length;
        Object.assign(camp, {
          sent_count: rows.filter((q) => q.status === "sent").length,
          failed_count: rows.filter((q) => q.status === "failed").length,
          batch_size: args.p_next_size,
          current_batch: (camp.current_batch || 1) + (remain ? 1 : 0),
          status: remain === 0 ? "completed" : "running",
          next_batch_at: null,
        });
        if (args.p_lock_until) mockRateLimit.locked_until = args.p_lock_until;
        return { data: { updated }, error: null };
      }
      if (fnName === "claim_mailer_queue_batch") {
        const batchSize = Math.min(300, Math.max(1, args.p_batch_size || 300));
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
    mockPersistedCoachIds.clear();
    mockEmailBio = "Full professional biography for the athlete.";
    mockEmailFit = "High court awareness; Reliable leadership";
    failQueueInsertOnCall = 0;
    queueInsertCalls = 0;
    failSentPersistence = false;
    failLease = false;
    mockRateLimit.locked_until = null;
    mockResendBatchSend.mockReset();
    mockResendBatchSend.mockImplementation(async (messages: Array<{ to: string[] }>) => ({
      data: { data: messages.map((_, i) => ({ id: `resend_batch_${i}` })) },
      error: null,
    }));
    mockResendSend.mockReset();
    mockResendSend.mockResolvedValue({
      data: { id: "resend_test_msg_id" },
      error: null,
    });
  });

  describe("Mandatory athlete data during enqueue", () => {
    const first = "110e8400-e29b-41d4-a716-446655440001";
    const second = "220e8400-e29b-41d4-a716-446655440002";
    const recipients = [{ name: "Coach Taylor", email: "taylor@college.edu" }];

    it("uses canonical form texts and keeps preview == queued payload for one recipient", async () => {
      const admin = createMockAdminClient();
      const recipient = { name: "Coach Taylor", lastName: "Taylor", email: "taylor@college.edu" };
      const opts = {
        subject: "ASSUNTO-789",
        hook: "TEXTO-ABERTURA-123",
        introduction: "TEXTO-FECHAMENTO-456",
      };
      const maliciousClientBlocks = [
        { type: "text" as const, content: "OLD-STALE-TEXT" },
        { type: "athlete" as const, athleteId: first },
        { type: "text" as const, content: "OLD-CLOSING" },
      ];
      for (const mode of ["single_athlete", "multi_athlete"] as const) {
        const ids = mode === "single_athlete" ? [first] : [first, second];
        const result = await enqueueCampaignDispatches(
          {
            mode,
            athleteIds: ids,
            recipients: [recipient],
            customOptions: opts,
            blocks: maliciousClientBlocks,
          },
          admin,
        );
        expect(result.success).toBe(true);
        const queued = Array.from(mockQueue.values()).find(
          (row) => row.campaign_id === result.campaignId,
        );
        const payload = queued?.payload;
        expect(queued.subject).toBe("ASSUNTO-789");
        expect(queued.subject).toBe("ASSUNTO-789");
        for (const body of [payload.html, payload.text]) {
          expect(body).toContain("TEXTO-ABERTURA-123");
          expect(body).toContain("TEXTO-FECHAMENTO-456");
          expect(body).not.toContain("OLD-STALE-TEXT");
          expect(body).not.toContain("OLD-CLOSING");
        }
        const data = await loadAthletesEmailData(ids, admin);
        const blocks = composeEmailBlocks({
          opening: opts.hook,
          closing: opts.introduction,
          athleteIds: ids,
        });
        const shared = {
          recipientEmail: recipient.email,
          coachName: recipient.name,
          coachLastName: recipient.lastName,
          customSubject: opts.subject,
          blocks,
          campaignId: result.campaignId,
          logoUrl: "https://example.com/logo.png",
        };
        const preview =
          mode === "single_athlete"
            ? renderRecruitEmail({ ...data[0], ...shared })
            : renderMultiAthleteRecruitEmail({ athletes: data, ...shared });
        expect(payload.html).toBe(preview.html);
        expect(payload.text).toBe(preview.text);
        expect(queued.subject).toBe(preview.subject);
      }
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it("catalog isolates message and matches the queued snapshot", async () => {
      const admin = createMockAdminClient();
      const recipient = { name: "Coach Taylor", lastName: "Taylor", email: "taylor@college.edu" };
      const result = await enqueueCampaignDispatches(
        {
          mode: "catalog",
          recipients: [recipient],
          customOptions: {
            subject: "ASSUNTO-789",
            headline: "HEADLINE-1",
            hook: "HOOK-2",
            message: "MESSAGE-3",
            introduction: "SHOULD-NOT-LEAK",
          },
        },
        admin,
      );
      expect(result.success).toBe(true);
      const queued = Array.from(mockQueue.values()).find(
        (row) => row.campaign_id === result.campaignId,
      );
      const payload = queued?.payload;
      const preview = renderCatalogEmail({
        coachName: recipient.name,
        coachLastName: recipient.lastName,
        recipientEmail: recipient.email,
        customSubject: "ASSUNTO-789",
        customHeadline: "HEADLINE-1",
        customHook: "HOOK-2",
        customMessage: "MESSAGE-3",
        campaignId: result.campaignId,
        logoUrl: "https://example.com/logo.png",
      });
      expect(payload.html).toBe(preview.html);
      expect(payload.text).toBe(preview.text);
      expect(queued.subject).toBe(preview.subject);
      expect(queued.subject).toBe("ASSUNTO-789");
      for (const body of [payload.html, payload.text]) {
        expect(body).toContain("HEADLINE-1");
        expect(body).toContain("HOOK-2");
        expect(body).toContain("MESSAGE-3");
        expect(body).not.toContain("SHOULD-NOT-LEAK");
      }
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it("queues complete HTML and text in single- and multi-athlete modes", async () => {
      const client = createMockAdminClient();
      const single = await enqueueCampaignDispatches(
        { mode: "single_athlete", athleteIds: [first], recipients },
        client,
      );
      expect(single.success).toBe(true);
      const singlePayload = Array.from(mockQueue.values()).find(
        (item) => item.campaign_id === single.campaignId,
      )?.payload;
      assertAnaQuickFacts(singlePayload.html, singlePayload.text);
      expect(singlePayload?.html).toContain("ABOUT HER");
      expect(singlePayload?.html).toContain("Full professional biography for the athlete.");
      expect(singlePayload?.html).toContain("High court awareness");
      expect(singlePayload?.text).toContain("WHY SHE COULD FIT YOUR PROGRAM");

      const multi = await enqueueCampaignDispatches(
        { mode: "multi_athlete", athleteIds: [first, second], recipients },
        client,
      );
      expect(multi.success).toBe(true);
      const multiPayload = Array.from(mockQueue.values()).find(
        (item) => item.campaign_id === multi.campaignId,
      )?.payload;
      expect(
        multiPayload?.html.match(/Full professional biography for the athlete\./g),
      ).toHaveLength(2);
      expect(multiPayload?.html.match(/WHY SHE COULD FIT YOUR PROGRAM/g)).toHaveLength(2);
      expect(multiPayload?.text.match(/ABOUT HER/g)).toHaveLength(2);
      assertAnaQuickFacts(multiPayload.html, multiPayload.text, 2);
    });

    it("rejects missing bio or missing fit before creating a campaign or queue rows", async () => {
      const client = createMockAdminClient();
      mockEmailBio = " ";
      const noBio = await enqueueCampaignDispatches(
        { mode: "single_athlete", athleteIds: [first], recipients },
        client,
      );
      expect(noBio.success).toBe(false);
      expect(noBio.message).toContain("ABOUT HER");
      expect(mockQueue.size).toBe(0);
      expect(mockCampaigns.size).toBe(0);

      mockEmailBio = "Complete bio";
      mockEmailFit = "";
      const noFit = await enqueueCampaignDispatches(
        { mode: "multi_athlete", athleteIds: [first, second], recipients },
        client,
      );
      expect(noFit.success).toBe(false);
      expect(noFit.message).toContain("WHY SHE COULD FIT YOUR PROGRAM");
      expect(mockQueue.size).toBe(0);
      expect(mockCampaigns.size).toBe(0);
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

    it("handles 151 recipients in one 300-email batch", async () => {
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
      expect(result.totalBatches).toBe(1);
      expect(mockQueue.size).toBe(151);

      let batch1Count = 0;
      let batch2Count = 0;
      for (const q of mockQueue.values()) {
        if (q.batch_number === 1) batch1Count++;
        if (q.batch_number === 2) batch2Count++;
      }
      expect(batch1Count).toBe(151);
      expect(batch2Count).toBe(0);
    });

    it("handles 300 recipients in 1 burst", async () => {
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
      expect(result.totalBatches).toBe(1);
      expect(mockQueue.size).toBe(300);
    });

    it("handles 1000 recipients across 4 bursts of 300", async () => {
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
      expect(result.totalBatches).toBe(4);
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
    async function enqueueCatalog(count: number) {
      const admin = createMockAdminClient();
      const recipients = Array.from({ length: count }, (_, i) => ({
        name: `Coach ${i}`,
        email: `coach${i}@college.edu`,
      }));
      const campaign = await enqueueCampaignDispatches({ mode: "catalog", recipients }, admin);
      expect(campaign.success).toBe(true);
      return { admin, campaign };
    }

    it.each([
      [10, 1],
      [150, 1],
      [300, 1],
      [301, 2],
      [799, 3],
      [3300, 11],
    ])("dispatches %i recipients with %i bursts and no duplicates", async (size, batches) => {
      const { admin, campaign } = await enqueueCatalog(size);
      expect(campaign.totalBatches).toBe(batches);
      for (let i = 0; i < batches; i++) {
        const result = await processMailerQueue({
          campaignId: campaign.campaignId,
          customAdmin: admin,
        });
        expect(result.processed).toBe(Math.min(300, size - 300 * i));
      }
      const rows = Array.from(mockQueue.values());
      expect(rows.filter((r) => r.status === "sent")).toHaveLength(size);
      expect(mockLogs.filter((r) => r.status === "sent")).toHaveLength(size);
      expect(mockResendBatchSend).toHaveBeenCalledTimes(Math.ceil(size / 100));
      expect(mockResendSend).not.toHaveBeenCalled();
      expect(mockCampaigns.get(campaign.campaignId).status).toBe("completed");
      const duplicateKeys = new Set(rows.map((r) => r.idempotency_key));
      expect(duplicateKeys.size).toBe(size);
    });

    it("sends three 100-item chunks concurrently within one burst", async () => {
      const { admin, campaign } = await enqueueCatalog(300);
      const result = await processMailerQueue({
        campaignId: campaign.campaignId,
        customAdmin: admin,
      });
      expect(result.sent).toBe(300);
      expect(mockResendBatchSend).toHaveBeenCalledTimes(3);
      for (const [payload, options] of mockResendBatchSend.mock.calls) {
        expect(payload).toHaveLength(100);
        expect(options.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
        expect(payload[0].replyTo).toBe("contact@goteamgoagency.com");
        expect(payload[0].headers["X-Entity-Ref-ID"]).toMatch(/^[a-f0-9]{64}$/);
      }
      expect(admin.rpc).toHaveBeenCalledWith(
        "complete_mailer_burst",
        expect.objectContaining({
          p_campaign_id: campaign.campaignId,
          p_results: expect.arrayContaining([expect.objectContaining({ status: "sent" })]),
        }),
      );
    });

    it("falls back to individual keyed sends ONLY for a definitively rejected chunk", async () => {
      const { admin, campaign } = await enqueueCatalog(10);
      mockResendBatchSend.mockResolvedValueOnce({
        data: null,
        error: { message: "Validation error" },
      });
      const result = await processMailerQueue({
        campaignId: campaign.campaignId,
        customAdmin: admin,
      });
      expect(result.sent).toBe(10);
      expect(mockResendSend).toHaveBeenCalledTimes(10);
      expect(mockLogs.filter((l) => l.status === "sent")).toHaveLength(10);
      const first = Array.from(mockQueue.values())[0];
      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: "contact@goteamgoagency.com",
        }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
      expect(first.status).toBe("sent");
    });

    it("handles 429 with Retry-After, global lock and halves next burst", async () => {
      const { admin, campaign } = await enqueueCatalog(300);
      mockResendBatchSend.mockResolvedValueOnce({
        data: null,
        error: { message: "429 Too Many Requests", retryAfter: 3 },
      });
      const result = await processMailerQueue({
        campaignId: campaign.campaignId,
        customAdmin: admin,
      });
      expect(result.rateLimited).toBe(true);
      expect(result.effectiveBurstSize).toBe(150);
      expect(mockCampaigns.get(campaign.campaignId).batch_size).toBe(150);
      expect(mockRateLimit.locked_until).not.toBeNull();
      expect(result.retried).toBe(100);
      expect(mockResendSend).not.toHaveBeenCalled();
      expect(mockQueue.size).toBe(300);
      expect(mockLogs.filter((l) => l.status === "sent")).toHaveLength(200);
    });

    it("never falls back after ambiguous provider acceptance", async () => {
      const { admin, campaign } = await enqueueCatalog(10);
      mockResendBatchSend.mockRejectedValueOnce(new Error("Network timeout"));
      const result = await processMailerQueue({
        campaignId: campaign.campaignId,
        customAdmin: admin,
      });
      expect(result.campaignStatus).toBe("paused");
      expect(result.message).toContain("Manual reconciliation");
      expect(mockResendSend).not.toHaveBeenCalled();
      expect(mockLogs.filter((l) => l.status === "sent")).toHaveLength(0);
    });

    it("blocks sending when another tab owns the lease", async () => {
      const { admin, campaign } = await enqueueCatalog(10);
      failLease = true;
      const result = await processMailerQueue({
        campaignId: campaign.campaignId,
        customAdmin: admin,
      });
      expect(result.processed).toBe(0);
      expect(mockResendBatchSend).not.toHaveBeenCalled();
    });

    it("pauses after confirmed acceptance if atomic persistence fails", async () => {
      const { admin, campaign } = await enqueueCatalog(10);
      failSentPersistence = true;
      const result = await processMailerQueue({
        campaignId: campaign.campaignId,
        customAdmin: admin,
      });
      expect(result.campaignStatus).toBe("paused");
      expect(result.message).toContain("Manual reconciliation required");
      expect(mockCampaigns.get(campaign.campaignId).status).toBe("paused");
      const retry = await resumeCampaign(campaign.campaignId, admin);
      expect(retry.success).toBe(false);
    });

    it("will not duplicate accepted emails on a repeated browser tick", async () => {
      const { admin, campaign } = await enqueueCatalog(10);
      await processMailerQueue({ campaignId: campaign.campaignId, customAdmin: admin });
      const repeat = await processMailerQueue({
        campaignId: campaign.campaignId,
        customAdmin: admin,
      });
      expect(repeat.processed).toBe(0);
      expect(mockResendBatchSend).toHaveBeenCalledTimes(1);
      expect(mockLogs.filter((l) => l.status === "sent")).toHaveLength(10);
    });

    it("sets coach_id to null for valid-looking university JSON IDs not present in coaches", async () => {
      const mockAdmin = createMockAdminClient();
      const syntheticCoachId = "b0c7a8f1-3210-4200-8101-556677889900";
      const camp = await enqueueCampaignDispatches(
        {
          mode: "catalog",
          recipients: [
            {
              coachId: syntheticCoachId,
              name: "University Coach",
              email: "university-coach@college.edu",
              universityName: "Test University",
            },
          ],
        },
        mockAdmin,
      );
      expect(camp.success).toBe(true);
      const queued = Array.from(mockQueue.values()).find(
        (row) => row.campaign_id === camp.campaignId,
      );
      expect(queued?.coach_id).toBeNull();
      expect(queued?.recipient_email).toBe("university-coach@college.edu");
      expect(queued?.university_name).toBe("Test University");
    });

    it("preserves coach_id only when the referenced coach actually exists", async () => {
      const mockAdmin = createMockAdminClient();
      const existingCoachId = "b0c7a8f1-3210-4200-8101-556677889900";
      mockPersistedCoachIds.add(existingCoachId);
      const camp = await enqueueCampaignDispatches(
        {
          mode: "catalog",
          recipients: [
            { coachId: existingCoachId, name: "Existing Coach", email: "existing@college.edu" },
          ],
        },
        mockAdmin,
      );
      expect(camp.success).toBe(true);
      const queued = Array.from(mockQueue.values()).find(
        (row) => row.campaign_id === camp.campaignId,
      );
      expect(queued?.coach_id).toBe(existingCoachId);
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

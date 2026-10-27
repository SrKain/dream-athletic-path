import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  canEstimateMailerEta,
  deriveCampaignSubstate,
  type CampaignHealthSummary,
} from "./mailer-health";
import {
  getRecentMailerCampaigns,
  reconcileCampaignIncident,
  runNextEligibleCampaignBurst,
} from "./mailer-runner.server";

describe("Mailer Health & Substate Derivation Suite", () => {
  it("derives completed substate when status is completed", () => {
    const health = deriveCampaignSubstate({
      status: "completed",
    });
    expect(health.substate).toBe("completed");
    expect(health.isHealthy).toBe(true);
    expect(health.canResume).toBe(false);
    expect(health.requiresReconciliation).toBe(false);
  });

  it("derives cancelled substate when status is cancelled", () => {
    const health = deriveCampaignSubstate({
      status: "cancelled",
    });
    expect(health.substate).toBe("cancelled");
    expect(health.canCancel).toBe(false);
  });

  it("prioritizes reconciliation_required over any other state when last_error indicates ambiguity or quarantine", () => {
    const healthAmbiguous = deriveCampaignSubstate({
      status: "paused",
      last_error: "Manual reconciliation required: ambiguous Resend acceptance",
    });
    expect(healthAmbiguous.substate).toBe("reconciliation_required");
    expect(healthAmbiguous.canResume).toBe(false); // MUST be false
    expect(healthAmbiguous.requiresReconciliation).toBe(true);
    expect(healthAmbiguous.isHealthy).toBe(false);

    const healthQuarantine = deriveCampaignSubstate({
      status: "running",
      last_error: "PROVIDER_AMBIGUOUS: connection reset while awaiting message ID",
    });
    expect(healthQuarantine.substate).toBe("reconciliation_required");
    expect(healthQuarantine.canResume).toBe(false);
    expect(healthQuarantine.requiresReconciliation).toBe(true);

    const healthUnconfirmed = deriveCampaignSubstate(
      {
        status: "paused",
        last_error: null,
      },
      { unconfirmedCount: 3 },
    );
    expect(healthUnconfirmed.substate).toBe("reconciliation_required");
    expect(healthUnconfirmed.canResume).toBe(false);
    expect(healthUnconfirmed.requiresReconciliation).toBe(true);
    expect(healthUnconfirmed.description).toContain("3 destinatário(s) em estado 'unconfirmed'");
  });

  it("derives manual_pause when status is paused and no quarantine error exists", () => {
    const health = deriveCampaignSubstate({
      status: "paused",
      last_error: null,
    });
    expect(health.substate).toBe("manual_pause");
    expect(health.canResume).toBe(true);
    expect(health.isHealthy).toBe(true);
  });

  it("derives waiting_lease when controller conflict is flagged", () => {
    const health = deriveCampaignSubstate({ status: "running" }, { controllerConflict: true });
    expect(health.substate).toBe("waiting_lease");
    expect(health.canResume).toBe(false);
    expect(health.canPause).toBe(true);
  });

  it("derives waiting_retry when cooldown or rate limit is active", () => {
    const health = deriveCampaignSubstate({ status: "running" }, { cooldownActive: true });
    expect(health.substate).toBe("waiting_retry");
    expect(health.canResume).toBe(false);
    expect(health.canPause).toBe(true);
  });

  it("derives scheduled when status is queued", () => {
    const health = deriveCampaignSubstate({
      status: "queued",
    });
    expect(health.substate).toBe("scheduled");
    expect(health.canPause).toBe(true);
  });

  it("derives scheduled when running and next_batch_at is in the future", () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    const health = deriveCampaignSubstate({
      status: "running",
      next_batch_at: futureDate,
    });
    expect(health.substate).toBe("scheduled");
    expect(health.description).toContain("Próximo lote programado para");
  });

  it("derives stalled when next_batch_at is expired by more than 120s without progress", () => {
    const pastDate = new Date(Date.now() - 150_000).toISOString();
    const health = deriveCampaignSubstate({
      status: "running",
      next_batch_at: pastDate,
    });
    expect(health.substate).toBe("stalled");
    expect(health.isHealthy).toBe(false);
  });

  it("derives sending when running with active batch ready", () => {
    const now = new Date().toISOString();
    const health = deriveCampaignSubstate({
      status: "running",
      next_batch_at: now,
    });
    expect(health.substate).toBe("sending");
    expect(health.isHealthy).toBe(true);
  });
});

describe("Mailer Incident Reconciliation Suite", () => {
  it("rejects reconciliation without sufficient explanation notes", async () => {
    const mockAdmin = {} as unknown as Parameters<typeof reconcileCampaignIncident>[3];
    const res = await reconcileCampaignIncident("camp-1", "abc", "admin@gtg.com", mockAdmin);
    expect(res.success).toBe(false);
    expect(res.message).toContain("no mínimo 5 caracteres");
  });

  it("keeps ambiguous incidents quarantined without mutating campaign rows", async () => {
    const updateSpy = vi.fn();
    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "camp-1",
                status: "paused",
                last_error: "Manual reconciliation required",
              },
              error: null,
            }),
          })),
        })),
        update: updateSpy,
      })),
    } as unknown as Parameters<typeof reconcileCampaignIncident>[3];
    const res = await reconcileCampaignIncident(
      "camp-1",
      "Analisado no provedor, ainda incerto.",
      "admin",
      mockAdmin,
    );
    expect(res.success).toBe(false);
    expect(res.message).toContain("Quarentena preservada");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["[MARKED_SENT] Confirmado no painel do Resend", "marked_sent", "sent"],
    ["[REQUEUE_PENDING] Não saiu no Resend, reenviar para a fila", "requeue_pending", "pending"],
    ["[MARKED_FAILED] Cancelar envio para esses destinatários", "marked_failed", "failed"],
  ] as const)(
    "applies explicit human decision %s to unconfirmed items",
    async (notes, expectedResolution, expectedStatus) => {
      const queueUpdates: Array<Record<string, unknown>> = [];
      const mockAdmin = {
        from: vi.fn((table: string) => {
          if (table === "mailer_campaigns") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: "110e8400-e29b-41d4-a716-446655440001",
                      status: "paused",
                      last_error: "Manual reconciliation required: UNCONFIRMED_DELIVERY",
                    },
                    error: null,
                  }),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            };
          }
          if (table === "mailer_queue") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  })),
                })),
              })),
              update: vi.fn((payload: Record<string, unknown>) => {
                queueUpdates.push(payload);
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                };
              }),
            };
          }
          return {};
        }),
      } as unknown as Parameters<typeof reconcileCampaignIncident>[3];

      const res = await reconcileCampaignIncident(
        "110e8400-e29b-41d4-a716-446655440001",
        notes,
        "admin@gtg.com",
        mockAdmin,
      );
      expect(res.success).toBe(true);
      expect(res.resolution).toBe(expectedResolution);
      expect(queueUpdates.some((u) => u.status === expectedStatus)).toBe(true);
    },
  );
});

describe("TASK-107 honest ETA", () => {
  it("never guesses without sample or while paused/quarantined/cooldown", () => {
    const firstBatch = canEstimateMailerEta({ status: "running", sentCount: 1, currentBatch: 2 });
    const paused = canEstimateMailerEta({ status: "paused", sentCount: 300, currentBatch: 10 });
    const quarantine = canEstimateMailerEta({
      status: "running",
      sentCount: 300,
      currentBatch: 4,
      lastError: "Manual reconciliation required",
    });
    const cooldown = canEstimateMailerEta({
      status: "running",
      sentCount: 300,
      currentBatch: 4,
      nextBatchAt: new Date(Date.now() + 60000).toISOString(),
    });
    const healthy = canEstimateMailerEta({ status: "running", sentCount: 600, currentBatch: 4 });
    expect(firstBatch).toBe(false);
    expect(paused).toBe(false);
    expect(quarantine).toBe(false);
    expect(cooldown).toBe(false);
    expect(healthy).toBe(true);
  });
});

describe("TASK-107 server worker candidate isolation", () => {
  const mockAdmin = (campaigns: unknown[], error: unknown = null) => {
    const limit = vi.fn().mockResolvedValue({ data: campaigns, error });
    const order = vi.fn().mockReturnValue({ limit });
    const lte = vi.fn().mockReturnValue({ order });
    const contains = vi.fn().mockReturnValue({ lte });
    const eq = vi.fn().mockReturnValue({ contains });
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq }),
      }),
    } as unknown as NonNullable<Parameters<typeof runNextEligibleCampaignBurst>[0]>;
  };

  const mockExecute = vi.fn().mockResolvedValue({
    processed: 2,
    sent: 2,
    failed: 0,
    retried: 0,
    rateLimited: false,
    campaignStatus: "running",
  });

  it("does not send when there are no opted-in eligible campaigns", async () => {
    mockExecute.mockClear();
    const result = await runNextEligibleCampaignBurst(mockAdmin([]), mockExecute);
    expect(result.status).toBe("idle");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("excludes quarantined and unopted campaigns even if returned by the DB", async () => {
    mockExecute.mockClear();
    const result = await runNextEligibleCampaignBurst(
      mockAdmin([
        {
          id: "quarantined",
          status: "running",
          last_error: "PROVIDER_AMBIGUOUS: Manual reconciliation required",
          filters: { serverOrchestration: true },
        },
        {
          id: "unopted",
          status: "running",
          last_error: null,
          filters: {},
        },
      ]),
      mockExecute,
    );
    expect(result.status).toBe("idle");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("executes at most one bounded burst for the first eligible campaign", async () => {
    mockExecute.mockClear();
    const result = await runNextEligibleCampaignBurst(
      mockAdmin([
        {
          id: "healthy",
          status: "running",
          last_error: null,
          filters: { serverOrchestration: true },
        },
      ]),
      mockExecute,
    );
    expect(result.status).toBe("processed");
    expect(result.totalSent).toBe(2);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "healthy",
        maxBatchSize: 300,
      }),
    );
  });

  it("fails closed if campaign eligibility query fails", async () => {
    mockExecute.mockClear();
    await expect(
      runNextEligibleCampaignBurst(mockAdmin([], { message: "DB unavailable" }), mockExecute),
    ).rejects.toThrow("Unable to read eligible");
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("TASK-107 recent campaign read model", () => {
  it("preserves bounded server pagination and never dispatches email", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "camp-1",
          subject: "Test campaign",
          status: "paused",
          created_at: "2026-10-21T10:00:00Z",
          total_recipients: 200,
          sent_count: 70,
        },
      ],
      error: null,
    });
    const order = vi.fn();
    const ordered = { order, limit };
    order.mockReturnValue(ordered);
    const admin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ order }),
      }),
    } as unknown as NonNullable<Parameters<typeof getRecentMailerCampaigns>[0]>;
    const result = await getRecentMailerCampaigns(admin);
    expect(result).toHaveLength(1);
    expect(result[0].sentCount).toBe(70);
    expect(limit).toHaveBeenCalledWith(20);
    expect(admin.from).toHaveBeenCalledWith("mailer_campaigns");
  });
});

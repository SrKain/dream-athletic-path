import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deriveCampaignSubstate,
  type CampaignHealthSummary,
} from "./mailer-health";
import { reconcileCampaignIncident } from "./mailer-runner.server";

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
    const health = deriveCampaignSubstate(
      { status: "running" },
      { controllerConflict: true },
    );
    expect(health.substate).toBe("waiting_lease");
    expect(health.canResume).toBe(false);
    expect(health.canPause).toBe(true);
  });

  it("derives waiting_retry when cooldown or rate limit is active", () => {
    const health = deriveCampaignSubstate(
      { status: "running" },
      { cooldownActive: true },
    );
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
    const mockAdmin = {} as any;
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
              data: { id: "camp-1", status: "paused", last_error: "Manual reconciliation required" },
              error: null,
            }),
          })),
        })),
        update: updateSpy,
      })),
    } as any;
    const res = await reconcileCampaignIncident(
      "camp-1", "Analisado no provedor, ainda incerto.", "admin", mockAdmin,
    );
    expect(res.success).toBe(false);
    expect(res.message).toContain("Quarentena preservada");
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  controlCampaignV2,
  getMailerCronStatus,
  syncCampaignV2,
} from "./mailer-controls-v2.server";
import { runCampaignTick } from "./mailer-engine-v2.server";
vi.mock("./mailer-engine-v2.server", () => ({
  runCampaignTick: vi.fn(),
  getCampaignProgressV2: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("TASK-116 v2 controls boundary", () => {
  it.each(["pause", "resume", "cancel"] as const)(
    "routes %s to transactional v2 SQL only",
    async (action) => {
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: { success: true, message: "OK" }, error: null });
      expect((await controlCampaignV2("c", action, { rpc } as never)).success).toBe(true);
      expect(rpc).toHaveBeenCalledExactlyOnceWith("mailer_control_campaign", {
        p_campaign_id: "c",
        p_action: action,
      });
    },
  );
  it("returns a failed resume reason, without legacy reconciliation or forced transition", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "NEEDS_RECONCILIATION" } });
    expect(await controlCampaignV2("c", "resume", { rpc } as never)).toEqual({
      success: false,
      message: "NEEDS_RECONCILIATION",
    });
  });
  it("reports an active executor and expiry instead of clearing its lease", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { active: true, controllerId: "cron", expiresAt: "2026-11-06T13:00:00Z" },
      error: null,
    });
    const result = await syncCampaignV2("c", { rpc } as never);
    expect(result.message).toContain("cron");
    expect(result.message).toContain("13:00:00");
    expect(runCampaignTick).not.toHaveBeenCalled();
  });
  it("requires both scheduled job readiness and Vercel flag/secret to label cron active", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { enabled: true, active: true, schedule: "15 seconds" },
      error: null,
    });
    vi.stubEnv("MAILER_CRON_ENABLED", "false");
    vi.stubEnv("MAILER_CRON_SECRET", "fixture");
    expect((await getMailerCronStatus({ rpc } as never)).enabled).toBe(false);
    vi.stubEnv("MAILER_CRON_ENABLED", "true");
    expect((await getMailerCronStatus({ rpc } as never)).enabled).toBe(true);
  });
});

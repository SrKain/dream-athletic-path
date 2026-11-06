import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  deriveCampaignHealth,
  shouldPauseBounceGuard,
  tickRetryDelay,
  tickErrorMessage,
  MAILER_MAX_AMBIGUOUS,
  MAILER_KEY_WINDOW_MS,
  MAILER_MAX_BACKOFF_MS,
} from "./mailer-v2-policy";
import {
  getBatchSuppressedEmails,
  getCampaignProgressV2,
  runCampaignTick,
} from "./mailer-engine-v2.server";
import type { CampaignProgress } from "@/types/db";

type Row = Record<string, unknown>;
class MockDatabase {
  campaign: Row = {
    id: "campaign",
    status: "running",
    subject: "Test",
    mode: "catalog",
    started_at: new Date().toISOString(),
    eligible_count: 0,
    filters: { dryRun: true },
    controller_id: null,
  };
  queue: Row[];
  batches: Row[] = [];
  calls: Array<{ name: string; args: Row }> = [];
  failure: string | null = null;
  progressFailure = false;
  bounceCancel = false;
  counts: string[] = [];
  constructor(n = 100) {
    this.queue = Array.from({ length: n }, (_, i) => ({
      id: `q${i}`,
      campaign_id: "campaign",
      status: "pending",
      recipient_email: `coach${i}@uni.edu`,
      email_normalized: `coach${i}@uni.edu`,
      recipient_name: "Coach",
      subject: "Test",
      payload: { html: "<p>Hello</p>", text: "Hello" },
      idempotency_key: `key${i}`,
      email_type: "catalog_general",
    }));
    this.campaign.eligible_count = n;
  }
  progress() {
    const count = (s: string) => this.queue.filter((q) => q.status === s).length;
    return {
      campaignId: "campaign",
      status: this.campaign.status,
      subject: "Test",
      eligibleCount: this.queue.length,
      totalRecipients: this.queue.length,
      acceptedCount: count("accepted"),
      pendingCount: count("pending"),
      claimedCount: count("claimed"),
      unconfirmedCount: count("unconfirmed"),
      failedCount: 0,
      failedPermanentCount: 0,
      failedRetryableCount: 0,
      cancelledCount: 0,
      suppressedCount: 0,
      controllerId: this.campaign.controller_id,
      controllerLeaseExpiresAt: this.campaign.controller_lease_expires_at,
      lastTickAt: this.campaign.last_tick_at,
      lastTickBy: this.campaign.last_tick_by,
      startedAt: this.campaign.started_at,
      lastBatchStatus: this.batches.at(-1)?.status,
      health: this.campaign.status === "completed" ? "completed" : "sending",
    };
  }
  from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let single = false;
    let update: Row | null = null;
    let head = false;
    let statuses: string[] = [];
    const rowsForTable = () =>
      table === "mailer_campaigns" ? [this.campaign] : table === "mailer_queue" ? this.queue : [];
    const noteCounts = () => this.counts.push(...statuses);
    const builder = {
      select(_cols: string, opts?: { head?: boolean }) {
        head = Boolean(opts?.head);
        return builder;
      },
      eq(key: string, val: unknown) {
        filters.push((r) => r[key] === val);
        return builder;
      },
      in(key: string, vals: string[]) {
        statuses = vals;
        filters.push((r) => vals.includes(String(r[key])));
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      range() {
        return builder;
      },
      maybeSingle() {
        single = true;
        return builder;
      },
      update(value: Row) {
        update = value;
        return builder;
      },
      then(resolve: (r: unknown) => unknown) {
        const all = rowsForTable();
        const rows = all.filter((r) => filters.every((f) => f(r)));
        if (update) rows.forEach((r) => Object.assign(r, update));
        if (head) noteCounts();
        return Promise.resolve({
          data: head ? null : single ? rows[0] || null : rows,
          count: rows.length,
          error: null,
        }).then(resolve);
      },
    };
    return builder;
  }
  async rpc(name: string, args: Row = {}) {
    this.calls.push({ name, args });
    if (this.failure === name)
      return { data: null, error: { message: `Injected ${name} failure` } };
    if (name === "mailer_campaign_progress")
      return this.progressFailure
        ? { data: null, error: { message: "RPC unavailable" } }
        : { data: this.progress(), error: null };
    if (name === "mailer_campaign_bounce_stats") {
      if (this.bounceCancel) {
        this.campaign.status = "cancelled";
        return {
          data: {
            sent_count: 200,
            permanent_bounces: 20,
            bounce_rate: 10,
            bounce_guard_triggered: true,
          },
          error: null,
        };
      }
      return { data: { bounce_guard_triggered: false }, error: null };
    }
    if (name === "filter_suppressed_emails") return { data: [], error: null };
    if (name === "mailer_record_tick") {
      this.campaign.last_tick_at = new Date().toISOString();
      this.campaign.last_tick_by = args.p_controller_id;
    }
    if (name === "mailer_release_lease")
      this.campaign.controller_lease_expires_at = new Date(Date.now() + 15000).toISOString();
    if (name === "mailer_store_batch_payload") {
      const b = this.batches.find((b) => b.id === args.p_batch_id)!;
      b.payload ||= JSON.parse(JSON.stringify(args.p_payload));
      return { data: b.payload, error: null };
    }
    if (name === "claim_mailer_batch") {
      if (
        this.campaign.controller_id &&
        this.campaign.controller_id !== args.p_controller_id &&
        Date.parse(String(this.campaign.controller_lease_expires_at)) > Date.now()
      )
        return { data: { claimed: false, reason: "LEASE_HELD_BY_OTHER" }, error: null };
      this.campaign.controller_id = args.p_controller_id;
      this.campaign.controller_lease_expires_at = new Date(Date.now() + 90000).toISOString();
      let b = this.batches.find((b) =>
        ["claimed", "submitting", "ambiguous"].includes(String(b.status)),
      );
      const reused = Boolean(b);
      if (!b) {
        const items = this.queue.filter((q) => q.status === "pending").slice(0, 100);
        if (!items.length) {
          this.campaign.status = "completed";
          return {
            data: { claimed: false, reason: "QUEUE_DRAINED", campaignStatus: "completed" },
            error: null,
          };
        }
        b = {
          id: `batch${this.batches.length + 1}`,
          key: `mc:campaign:b${this.batches.length + 1}`,
          items,
          status: "submitting",
        };
        items.forEach((q) => (q.status = "claimed"));
        this.batches.push(b);
      }
      return {
        data: {
          claimed: true,
          batchId: b.id,
          idempotencyKey: b.key,
          items: b.items,
          reusedBatch: reused,
          previousStatus: b.status,
          requestPayload: b.payload,
        },
        error: null,
      };
    }
    if (name === "finalize_mailer_batch") {
      const b = this.batches.find((b) => b.id === args.p_batch_id)!;
      b.status = args.p_batch_status;
      if (args.p_batch_status === "ambiguous") {
        b.ambiguous = Number(b.ambiguous || 0) + 1;
        if (Number(b.ambiguous) >= 8) {
          b.status = "failed";
          (b.items as Row[]).forEach((q) => (q.status = "unconfirmed"));
        }
      }
      for (const outcome of args.p_outcomes as Row[]) {
        const q = this.queue.find((q) => q.id === outcome.id)!;
        q.status = outcome.status;
        q.provider_message_id = outcome.providerMessageId;
      }
      if (this.queue.every((q) => q.status !== "pending" && q.status !== "claimed"))
        this.campaign.status = "completed";
      return { data: { finalized: true, campaignStatus: this.campaign.status }, error: null };
    }
    return { data: {}, error: null };
  }
  admin() {
    return this as never;
  }
}
const base: CampaignProgress = {
  campaignId: "c",
  status: "running",
  subject: "s",
  totalRecipients: 100,
  sentCount: 0,
  failedCount: 0,
  suppressedCount: 0,
  pendingCount: 100,
  processingCount: 0,
  cancelledCount: 0,
  currentBatch: 0,
  totalBatches: 1,
  batchSize: 100,
  percentComplete: 0,
  nextBatchAt: null,
  startedAt: "2026-11-06T12:00:00Z",
  completedAt: null,
  estimatedRemainingSeconds: null,
  lastError: null,
};
afterEach(() => vi.useRealTimers());

describe("TASK-116 actual engine and progress", () => {
  it("finishes 5000 recipients with no browser for 50 virtual minutes; cron alone calls the real engine", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    const db = new MockDatabase(5000);
    for (let i = 0; i < 50; i++) {
      const tick = await runCampaignTick("campaign", {
        customAdmin: db.admin(),
        controllerId: `cron-${i}`,
        tickBudgetMs: 1500,
        batchGapMs: 0,
      });
      expect(tick.success).toBe(true);
      expect(tick.durationMs).toBeGreaterThanOrEqual(0);
      vi.setSystemTime(Date.now() + 60_000);
    }
    expect(db.campaign.status).toBe("completed");
    expect(db.queue.filter((q) => q.status === "accepted")).toHaveLength(5000);
    expect(db.batches).toHaveLength(50);
    expect(new Set(db.batches.map((b) => b.key)).size).toBe(50);
    expect(db.calls.filter((c) => c.name === "mailer_record_tick")).toHaveLength(50);
    expect(
      db.calls
        .filter((c) => c.name === "mailer_release_lease")
        .every((c) => c.args.p_keep_seconds === 15),
    ).toBe(true);
  });
  it("cron and browser concurrent ticks create only one batch, and contender never records a fake heartbeat", async () => {
    const db = new MockDatabase();
    const results = await Promise.all(
      ["cron", "tab"].map((controllerId) =>
        runCampaignTick("campaign", {
          customAdmin: db.admin(),
          controllerId,
          tickBudgetMs: 1500,
          batchGapMs: 0,
        }),
      ),
    );
    expect(db.batches).toHaveLength(1);
    expect(results.some((r) => r.leaseHeldByOther)).toBe(true);
    expect(db.calls.filter((c) => c.name === "mailer_record_tick")).toHaveLength(1);
  });
  it("replays five rate limits with byte-identical payload/key across midnight then succeeds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T23:59:58Z"));
    const db = new MockDatabase(1);
    db.campaign.filters = { dryRun: false };
    const payloads: unknown[] = [];
    const keys: string[] = [];
    const client = {
      batch: {
        send: async (payload: unknown, opts: unknown) => {
          payloads.push(payload);
          keys.push((opts as { idempotencyKey: string }).idempotencyKey);
          return payloads.length <= 5
            ? { error: { statusCode: 429, name: "rate_limit_exceeded", message: "Slow down" } }
            : { data: [{ id: "resend-id" }] };
        },
      },
    };
    for (let i = 0; i < 6; i++) {
      const tick = await runCampaignTick("campaign", {
        customAdmin: db.admin(),
        customResendClient: client,
        controllerId: "cron",
        tickBudgetMs: 1500,
      });
      expect(tick.success).toBe(true);
      vi.setSystemTime(Date.now() + 60_000);
    }
    expect(keys).toHaveLength(6);
    expect(keys.every((k) => k === keys[0])).toBe(true);
    expect(payloads.every((p) => JSON.stringify(p) === JSON.stringify(payloads[0]))).toBe(true);
    expect(db.queue[0].status).toBe("accepted");
  });
  it("finalize failure after provider acceptance stops the loop, persists the real error and keeps same-key replay", async () => {
    const db = new MockDatabase(200);
    db.failure = "finalize_mailer_batch";
    const tick = await runCampaignTick("campaign", {
      customAdmin: db.admin(),
      controllerId: "cron",
      tickBudgetMs: 8000,
      batchGapMs: 0,
    });
    expect(tick.success).toBe(false);
    expect(tick.message).toContain("persistir lote");
    expect(db.campaign.last_error).toContain("finalize_mailer_batch");
    expect(db.batches).toHaveLength(1);
    expect(db.calls.filter((c) => c.name === "claim_mailer_batch")).toHaveLength(1);
  });
  it("surfaces a bounce RPC failure and never sends a batch", async () => {
    const db = new MockDatabase();
    db.failure = "mailer_campaign_bounce_stats";
    const tick = await runCampaignTick("campaign", {
      customAdmin: db.admin(),
      controllerId: "cron",
    });
    expect(tick.success).toBe(false);
    expect(tick.message).toContain("Bounce Guard");
    expect(db.batches).toHaveLength(0);
  });
  it("RPC degradation uses exact head counts above 1000, logs the error and exposes degradation", async () => {
    const db = new MockDatabase(5000);
    db.progressFailure = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const p = await getCampaignProgressV2("campaign", db.admin());
    expect(p?.pendingCount).toBe(5000);
    expect(p?.invariantValid).toBe(true);
    expect(p?.degraded).toBe(true);
    expect(db.counts).toContain("claimed");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("TASK-116 health and SQL contracts", () => {
  it("derives all health states, leases, 45-second boundary, provider waiting and incomplete completion", () => {
    const now = Date.parse("2026-11-06T12:00:46Z");
    expect(deriveCampaignHealth(base, now)).toBe("stalled");
    expect(deriveCampaignHealth(base, now - 1000)).toBe("sending");
    expect(
      deriveCampaignHealth({ ...base, controllerLeaseExpiresAt: "2026-11-06T12:01:00Z" }, now),
    ).toBe("sending");
    expect(
      deriveCampaignHealth(
        {
          ...base,
          lastTickAt: "2026-11-06T12:00:45Z",
          nextBatchAt: "2026-11-06T12:01:00Z",
          lastProviderHttpStatus: 429,
        },
        now,
      ),
    ).toBe("waiting_provider");
    expect(deriveCampaignHealth({ ...base, status: "paused" }, now)).toBe("paused_manual");
    expect(
      deriveCampaignHealth({ ...base, status: "paused", safetyPauseReason: "Bounce" }, now),
    ).toBe("paused_safety");
    expect(deriveCampaignHealth({ ...base, unconfirmedCount: 1 }, now)).toBe(
      "needs_reconciliation",
    );
    expect(deriveCampaignHealth({ ...base, status: "completed" }, now)).toBe(
      "needs_reconciliation",
    );
    expect(
      deriveCampaignHealth({ ...base, status: "completed", pendingCount: 0, failedCount: 1 }, now),
    ).toBe("completed_with_issues");
    expect(deriveCampaignHealth({ ...base, status: "completed", pendingCount: 0 }, now)).toBe(
      "completed",
    );
  });
  it("never stops scheduling on another executor and backs errors off from 3 to 30 seconds", () => {
    expect(tickRetryDelay(0, true, 1)).toBe(5000);
    expect(tickRetryDelay(0, true, 8000)).toBe(8000);
    expect([1, 2, 3, 4, 5].map((n) => tickRetryDelay(n))).toEqual([
      3000, 6000, 12000, 24000, 30000,
    ]);
    expect(tickErrorMessage(new Error("HTTP 401 Unauthorized"))).toContain("Sessão expirada");
  });
  it("keeps SQL limits aligned with named constants, migrations small, and verify read-only", () => {
    expect(MAILER_MAX_AMBIGUOUS).toBe(8);
    expect(MAILER_KEY_WINDOW_MS).toBe(23 * 3600000);
    expect(MAILER_MAX_BACKOFF_MS).toBe(300000);
    const files = readdirSync("db/migrations").filter((n) => /^0033[a-f]_/.test(n));
    expect(files).toHaveLength(6);
    for (const file of files) {
      const sql = readFileSync(`db/migrations/${file}`, "utf8");
      expect(sql.split("\n").length).toBeLessThanOrEqual(251);
      expect(sql).toContain("PRECHECK_0033");
      expect(sql).toContain("SECURITY DEFINER");
      expect(sql).toContain("SET search_path = public");
      expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    }
    const fin = readFileSync("db/migrations/0033c_mailer_finalize.sql", "utf8");
    expect(fin).toContain(`v_max_ambiguous constant integer := ${MAILER_MAX_AMBIGUOUS}`);
    expect(fin).toContain(`v_max_backoff_ms constant integer := ${MAILER_MAX_BACKOFF_MS}`);
    expect(fin).not.toContain("status = 'failed_retryable'");
    const verify = readFileSync("db/migrations/verify-0033.sql", "utf8").replace(/--.*$/gm, "");
    expect(verify).not.toMatch(/\b(UPDATE|INSERT|DELETE|ALTER|CREATE|DROP)\b/i);
  });
});

describe("TASK-116 bounce sample and override", () => {
  it("requires >=200 accepted, >=5 hard bounces, >3pct; override cannot exceed 8pct", () => {
    expect(shouldPauseBounceGuard(199, 20, false)).toBe(false);
    expect(shouldPauseBounceGuard(200, 4, false)).toBe(false);
    expect(shouldPauseBounceGuard(200, 6, false)).toBe(false);
    expect(shouldPauseBounceGuard(200, 7, false)).toBe(true);
    expect(shouldPauseBounceGuard(200, 7, true)).toBe(false);
    expect(shouldPauseBounceGuard(200, 16, true)).toBe(false);
    expect(shouldPauseBounceGuard(200, 17, true)).toBe(true);
    expect(shouldPauseBounceGuard(100, 9, true)).toBe(true);
  });
  it("keeps ambiguous replays on the same key until the eighth ambiguous outcome needs reconciliation", async () => {
    const db = new MockDatabase(1);
    db.campaign.filters = { dryRun: false };
    const keys: string[] = [];
    const client = {
      batch: {
        send: async (_payload: unknown, opts: unknown) => {
          keys.push((opts as { idempotencyKey: string }).idempotencyKey);
          return {
            error: { statusCode: 503, name: "internal_server_error", message: "Unavailable" },
          };
        },
      },
    };
    for (let i = 0; i < 8; i++) {
      const tick = await runCampaignTick("campaign", {
        customAdmin: db.admin(),
        customResendClient: client,
        controllerId: "cron",
        tickBudgetMs: 1500,
      });
      expect(tick.success).toBe(true);
      expect(db.queue[0].status).toBe(i < 7 ? "claimed" : "unconfirmed");
    }
    expect(keys).toHaveLength(8);
    expect(new Set(keys).size).toBe(1);
  });
});

describe("TASK-116 tick budget", () => {
  it("bounds a hanging provider by the remaining budget minus persistence margin", async () => {
    vi.useFakeTimers();
    const db = new MockDatabase(1);
    db.campaign.filters = { dryRun: false };
    const send = vi.fn(() => new Promise<unknown>(() => {}));
    const started = Date.now();
    const pending = runCampaignTick("campaign", {
      customAdmin: db.admin(),
      controllerId: "cron",
      tickBudgetMs: 2000,
      customResendClient: { batch: { send } },
    });
    await vi.advanceTimersByTimeAsync(1001);
    const tick = await pending;
    expect(send).toHaveBeenCalledTimes(1);
    expect(tick.durationMs).toBeLessThanOrEqual(1001);
    expect(tick.durationMs).toBeGreaterThanOrEqual(1000);
    expect(Date.now() - started).toBe(1001);
    expect(db.batches[0].status).toBe("ambiguous");
  });
});

describe("TASK-116 suppression fallback", () => {
  it("paginates when the suppression RPC is unavailable, including matches after row 1000", async () => {
    const pages: number[] = [];
    const admin = {
      rpc: async () => ({ data: null, error: { message: "unavailable" } }),
      from: () => ({
        select: () => ({
          order: () => ({
            range: async (start: number) => {
              pages.push(start);
              return {
                error: null,
                data:
                  start === 0
                    ? Array.from({ length: 1000 }, (_, i) => ({
                        email: `suppressed${i}@uni.edu`,
                        expires_at: null,
                      }))
                    : [{ email: "target@uni.edu", expires_at: null }],
              };
            },
          }),
        }),
      }),
    };
    const result = await getBatchSuppressedEmails(admin as never, ["target@uni.edu"]);
    expect(pages).toEqual([0, 1000]);
    expect([...result]).toEqual(["target@uni.edu"]);
  });
  it("recognizes a thrown HTTP Response as an expired session", () => {
    expect(tickErrorMessage(new Response("", { status: 401 }))).toContain("Sessão expirada");
  });
});

describe("TASK-116 safety pause versus cancellation", () => {
  it("cannot revive a cancelled campaign when cancellation races the bounce lookup", async () => {
    const db = new MockDatabase(1);
    db.bounceCancel = true;
    const tick = await runCampaignTick("campaign", {
      customAdmin: db.admin(),
      controllerId: "cron",
    });
    expect(db.campaign.status).toBe("cancelled");
    expect(tick.campaignStatus).toBe("cancelled");
    expect(tick.nextTickInMs).toBeNull();
    expect(db.calls.some((c) => c.name === "claim_mailer_batch")).toBe(false);
  });
});

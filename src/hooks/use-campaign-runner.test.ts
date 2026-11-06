import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignProgress } from "@/types/db";

// Minimal React hook host: memoization, dependency cleanup and state survive renders.
// It exercises the actual hook and timers without adding a DOM/test-renderer dependency.
const host = vi.hoisted(() => {
  const slots: Array<{ value?: unknown; deps?: unknown[]; cleanup?: () => void }> = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  const same = (a: unknown[] | undefined, b: unknown[]) =>
    a?.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    slots,
    begin() {
      cursor = 0;
      effects = [];
    },
    effects() {
      for (const run of effects) run();
    },
    reset() {
      for (const slot of slots) slot.cleanup?.();
      slots.length = 0;
    },
    state(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [
        slots[index].value,
        (value: unknown) => {
          slots[index].value = typeof value === "function" ? value(slots[index].value) : value;
        },
      ];
    },
    ref(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
    callback(fn: unknown, deps: unknown[]) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: fn, deps };
      return slots[index].value;
    },
    effect(fn: () => void | (() => void), deps: unknown[]) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        const old = slots[index];
        slots[index] = { deps };
        effects.push(() => {
          old?.cleanup?.();
          const cleanup = fn();
          if (cleanup) slots[index].cleanup = cleanup;
        });
      }
    },
  };
});
const mocks = vi.hoisted(() => ({
  tick: vi.fn(),
  progress: vi.fn(),
  bounce: vi.fn(),
  report: vi.fn(),
  cron: vi.fn(),
}));
vi.mock("react", () => ({
  useState: host.state,
  useRef: host.ref,
  useCallback: host.callback,
  useEffect: host.effect,
}));
vi.mock("@/lib/email/recruit-email.functions", () => ({
  runCampaignTickServerFn: mocks.tick,
  getCampaignQueueProgressServerFn: mocks.progress,
  getCampaignBounceStatsServerFn: mocks.bounce,
  getCampaignFinalReportServerFn: mocks.report,
  getMailerCronStatusServerFn: mocks.cron,
}));
import { useCampaignRunner } from "./use-campaign-runner";
const progress = {
  campaignId: "c",
  status: "running",
  subject: "s",
  pendingCount: 100,
  processingCount: 0,
  totalRecipients: 100,
  failedCount: 0,
  sentCount: 0,
  suppressedCount: 0,
  cancelledCount: 0,
  currentBatch: 1,
  totalBatches: 1,
  batchSize: 100,
  percentComplete: 0,
  nextBatchAt: null,
  startedAt: null,
  completedAt: null,
  estimatedRemainingSeconds: null,
  lastError: null,
} satisfies CampaignProgress;
let doc: EventTarget & { visibilityState: string };
let nav: { onLine: boolean };
function RenderRunner() {
  host.begin();
  const result = useCampaignRunner({ campaignId: "c", onCampaignCompleted: () => {} });
  host.effects();
  return result;
}
async function load() {
  RenderRunner();
  await vi.advanceTimersByTimeAsync(0);
  return RenderRunner();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  host.reset();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  nav = { onLine: true };
  const win = Object.assign(new EventTarget(), {
    sessionStorage: { getItem: () => null, setItem: () => {} },
  });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("BroadcastChannel", undefined);
  mocks.progress.mockResolvedValue(progress);
  mocks.bounce.mockResolvedValue(null);
  mocks.report.mockResolvedValue(null);
  mocks.cron.mockResolvedValue({ enabled: false, active: false, schedule: null });
  mocks.tick.mockResolvedValue({
    success: true,
    campaignStatus: "running",
    progress,
    nextTickInMs: 5000,
  });
});
afterEach(() => {
  host.reset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TASK-116 actual runner regression", () => {
  it("keeps scheduling after leaseHeldByOther causes a render, then takes over without clicking", async () => {
    mocks.tick.mockResolvedValueOnce({
      success: true,
      campaignStatus: "running",
      progress,
      nextTickInMs: 100,
      leaseHeldByOther: true,
    });
    await load();
    await vi.advanceTimersByTimeAsync(250);
    const following = RenderRunner();
    expect(following.isAnotherTabActive).toBe(true);
    expect(following.statusMessage).toContain("Outro executor ativo");
    await vi.advanceTimersByTimeAsync(4999);
    expect(mocks.tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.tick).toHaveBeenCalledTimes(2);
    expect(RenderRunner().isAnotherTabActive).toBe(false);
  });
  it("keeps ticking when hidden; only offline blocks sending", async () => {
    doc.visibilityState = "hidden";
    await load();
    await vi.advanceTimersByTimeAsync(250);
    expect(mocks.tick).toHaveBeenCalledTimes(1);
    expect(RenderRunner().isTabHidden).toBe(true);
    nav.onLine = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.tick).toHaveBeenCalledTimes(1);
  });
  it("shows real session errors, clears sending text, and retries with increasing backoff", async () => {
    mocks.tick.mockRejectedValue(new Error("HTTP 401 Unauthorized"));
    await load();
    await vi.advanceTimersByTimeAsync(250);
    expect(RenderRunner().statusMessage).toContain("Sessão expirada");
    expect(RenderRunner().statusMessage).not.toContain("Enviando lote");
    await vi.advanceTimersByTimeAsync(2999);
    expect(mocks.tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.tick).toHaveBeenCalledTimes(2);
    expect(RenderRunner().statusMessage).toContain("6s");
  });
  it("stopping during a pending request prevents a new timer from its response", async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.tick.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await load();
    await vi.advanceTimersByTimeAsync(250);
    RenderRunner().stopRunner();
    finish({ success: true, campaignStatus: "running", progress, nextTickInMs: 5000 });
    await vi.advanceTimersByTimeAsync(10000);
    expect(mocks.tick).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXECUTOR_HEARTBEAT_FRESH_MS,
  getFreshExecutorHeartbeat,
  recordExecutorHeartbeat,
  sanitizeExecutorName,
} from "./mailer-executor-heartbeat.server";
import { getMailerCronStatus } from "./mailer-controls-v2.server";

vi.mock("./mailer-engine-v2.server", () => ({
  runCampaignTick: vi.fn(),
  getCampaignProgressV2: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function readerReturning(
  rows: Array<{ executor: string; last_seen_at: string }> | null,
  error: { message: string } | null = null,
) {
  const calls: Record<string, unknown[]> = {};
  const chain = {
    select: (c: string) => ((calls.select = [c]), chain),
    gte: (col: string, v: string) => ((calls.gte = [col, v]), chain),
    order: (col: string, o: unknown) => ((calls.order = [col, o]), chain),
    limit: async (n: number) => ((calls.limit = [n]), { data: rows, error }),
  };
  return { from: vi.fn(() => chain), calls };
}

describe("TASK-117 sanitizeExecutorName", () => {
  it("aceita nomes simples e normaliza caixa", () => {
    expect(sanitizeExecutorName("hetzner-pulse")).toBe("hetzner-pulse");
    expect(sanitizeExecutorName("  Hetzner-Pulse ")).toBe("hetzner-pulse");
  });
  it("rejeita vazio, caracteres inválidos e nomes longos", () => {
    expect(sanitizeExecutorName(null)).toBeNull();
    expect(sanitizeExecutorName("")).toBeNull();
    expect(sanitizeExecutorName("pulse; drop table")).toBeNull();
    expect(sanitizeExecutorName("a".repeat(41))).toBeNull();
  });
});

describe("TASK-117 recordExecutorHeartbeat", () => {
  it("faz upsert por executor", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: vi.fn(() => ({ upsert })) };
    const now = new Date("2026-11-16T19:00:00Z");
    expect(await recordExecutorHeartbeat(admin, "hetzner-pulse", null, now)).toBe(true);
    expect(admin.from).toHaveBeenCalledWith("mailer_executor_heartbeats");
    expect(upsert).toHaveBeenCalledWith(
      { executor: "hetzner-pulse", last_seen_at: now.toISOString(), last_tick_status: null },
      { onConflict: "executor" },
    );
  });
  it("nunca lança: erro do banco ou tabela ausente devolvem false", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: { message: "relation does not exist" } }),
      })),
    };
    expect(await recordExecutorHeartbeat(failing, "hetzner-pulse")).toBe(false);
    const throwing = {
      from: vi.fn(() => {
        throw new Error("boom");
      }),
    };
    expect(await recordExecutorHeartbeat(throwing as never, "hetzner-pulse")).toBe(false);
  });
});

describe("TASK-117 getFreshExecutorHeartbeat", () => {
  it("consulta só sinais dentro da janela de frescor", async () => {
    const now = new Date("2026-11-16T19:00:00Z");
    const r = readerReturning([
      { executor: "hetzner-pulse", last_seen_at: "2026-11-16T18:59:50Z" },
    ]);
    expect(await getFreshExecutorHeartbeat(r as never, now)).toEqual({
      executor: "hetzner-pulse",
      lastSeenAt: "2026-11-16T18:59:50Z",
    });
    expect(r.calls.gte).toEqual([
      "last_seen_at",
      new Date(now.getTime() - EXECUTOR_HEARTBEAT_FRESH_MS).toISOString(),
    ]);
  });
  it("devolve null sem linhas, com erro ou sem cliente de tabela", async () => {
    expect(await getFreshExecutorHeartbeat(readerReturning([]) as never)).toBeNull();
    expect(
      await getFreshExecutorHeartbeat(readerReturning(null, { message: "x" }) as never),
    ).toBeNull();
    expect(await getFreshExecutorHeartbeat({} as never)).toBeNull();
  });
});

describe("TASK-117 getMailerCronStatus com pulse externo", () => {
  const fresh = [{ executor: "hetzner-pulse", last_seen_at: new Date().toISOString() }];

  it("pulse recente ativa a rede de segurança mesmo sem pg_cron", async () => {
    const r = readerReturning(fresh);
    const rpc = vi.fn().mockResolvedValue({
      data: { enabled: false, active: false, schedule: null },
      error: null,
    });
    const status = await getMailerCronStatus({ rpc, from: r.from } as never);
    expect(status).toMatchObject({
      enabled: true,
      active: true,
      source: "external_pulse",
      schedule: "pulse externo (hetzner-pulse)",
    });
  });

  it("pulse recente vale mesmo se o RPC de status do pg_cron falhar", async () => {
    const r = readerReturning(fresh);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "no function" } });
    const status = await getMailerCronStatus({ rpc, from: r.from } as never);
    expect(status.enabled).toBe(true);
    expect(status.error).toBeUndefined();
  });

  it("sem pulse e sem pg_cron continua inativa", async () => {
    const r = readerReturning([]);
    const rpc = vi.fn().mockResolvedValue({
      data: { enabled: false, active: false, schedule: null },
      error: null,
    });
    const status = await getMailerCronStatus({ rpc, from: r.from } as never);
    expect(status.enabled).toBe(false);
    expect(status.source).toBeNull();
  });

  it("pg_cron ativo mantém a origem pg_cron", async () => {
    vi.stubEnv("MAILER_CRON_ENABLED", "true");
    vi.stubEnv("MAILER_CRON_SECRET", "fixture");
    const r = readerReturning([]);
    const rpc = vi.fn().mockResolvedValue({
      data: { enabled: true, active: true, schedule: "* * * * *" },
      error: null,
    });
    const status = await getMailerCronStatus({ rpc, from: r.from } as never);
    expect(status).toMatchObject({ enabled: true, source: "pg_cron", schedule: "* * * * *" });
  });
});

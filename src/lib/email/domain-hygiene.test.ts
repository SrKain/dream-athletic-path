import { beforeEach, describe, expect, it, vi } from "vitest";

const dnsMock = vi.hoisted(() => ({
  resolveMx: vi.fn(),
  resolve4: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  default: dnsMock,
  resolveMx: dnsMock.resolveMx,
  resolve4: dnsMock.resolve4,
}));

import { checkDomainHygiene, checkDomainsWithCache } from "./domain-hygiene.server";

function dnsError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe("Domain Hygiene & DNS MX Resolution (RFC 5321) — hermético, sem rede", () => {
  beforeEach(() => {
    dnsMock.resolveMx.mockReset();
    dnsMock.resolve4.mockReset();
  });

  it("resolves valid domains with MX records", async () => {
    dnsMock.resolveMx.mockResolvedValue([{ exchange: "mx.example.com", priority: 10 }]);
    const result = await checkDomainHygiene("example.com", { timeoutMs: 2000 });
    expect(result.deliverable).toBe(true);
    expect(result.hasMx).toBe(true);
    expect(result.unverified).toBeFalsy();
  });

  it("falls back to A record when there is no MX (RFC 5321)", async () => {
    dnsMock.resolveMx.mockRejectedValue(dnsError("ENODATA"));
    dnsMock.resolve4.mockResolvedValue(["203.0.113.10"]);
    const result = await checkDomainHygiene("a-only.example", { timeoutMs: 2000 });
    expect(result.deliverable).toBe(true);
  });

  it("identifies non-existent domains as undeliverable", async () => {
    dnsMock.resolveMx.mockRejectedValue(dnsError("ENOTFOUND"));
    dnsMock.resolve4.mockRejectedValue(dnsError("ENOTFOUND"));
    const result = await checkDomainHygiene("nonexistent-domain-1234567890.xyz");
    expect(result.deliverable).toBe(false);
    expect(result.hasMx).toBe(false);
    expect(result.reason).toBe("NXDOMAIN");
  });

  it.each(["ECONNREFUSED", "EAI_AGAIN", "ETIMEOUT", "ESERVFAIL", "ECONNRESET"])(
    "fail-open on transient resolver error %s (never drops a valid recipient)",
    async (code) => {
      dnsMock.resolveMx.mockRejectedValue(dnsError(code));
      dnsMock.resolve4.mockRejectedValue(dnsError(code));
      const result = await checkDomainHygiene("grand.edu");
      expect(result.deliverable).toBe(true);
      expect(result.unverified).toBe(true);
    },
  );

  it("handles empty or invalid domain input gracefully", async () => {
    const result = await checkDomainHygiene("", { timeoutMs: 1000 });
    expect(result.deliverable).toBe(false);
    expect(result.reason).toBe("INVALID_DOMAIN");
  });

  it("does not cache unverified (transient) results in the database", async () => {
    dnsMock.resolveMx.mockRejectedValue(dnsError("ECONNREFUSED"));
    dnsMock.resolve4.mockRejectedValue(dnsError("ECONNREFUSED"));
    const upsert = vi.fn(async () => ({ data: null, error: null }));
    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })),
        upsert,
      })),
    } as unknown as ReturnType<typeof import("@/lib/supabase/clients.server").getAdminClient>;

    const outcomes = await checkDomainsWithCache(["grand.edu"], mockAdmin);
    expect(outcomes.get("grand.edu")?.deliverable).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("caches definitive results in memory and database", async () => {
    dnsMock.resolveMx.mockResolvedValue([{ exchange: "mx.example.com", priority: 10 }]);
    const upsert = vi.fn(async () => ({ data: null, error: null }));
    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })),
        upsert,
      })),
    } as unknown as ReturnType<typeof import("@/lib/supabase/clients.server").getAdminClient>;

    const outcomes = await checkDomainsWithCache(["example.com"], mockAdmin);
    expect(outcomes.get("example.com")?.deliverable).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

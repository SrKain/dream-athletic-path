import { describe, expect, it, vi } from "vitest";
import { checkDomainHygiene, checkDomainsWithCache } from "./domain-hygiene.server";

describe("Domain Hygiene & DNS MX Resolution (RFC 5321)", () => {
  it("resolves valid domains with MX or A records", async () => {
    const result = await checkDomainHygiene("google.com", { timeoutMs: 2000 });
    expect(result.domain).toBe("google.com");
    expect(result.deliverable).toBe(true);
    expect(result.hasMx).toBe(true);
  });

  it("identifies non-existent domains as undeliverable", async () => {
    const fakeDomain = "this-is-a-definitely-nonexistent-domain-1234567890.xyz";
    const result = await checkDomainHygiene(fakeDomain, { timeoutMs: 2000 });
    expect(result.domain).toBe(fakeDomain);
    expect(result.deliverable).toBe(false);
    expect(result.hasMx).toBe(false);
    expect(result.reason).toBe("NXDOMAIN");
  });

  it("handles empty or invalid domain input gracefully", async () => {
    const result = await checkDomainHygiene("", { timeoutMs: 1000 });
    expect(result.deliverable).toBe(false);
    expect(result.reason).toBe("INVALID_DOMAIN");
  });

  it("checkDomainsWithCache caches results in memory and database", async () => {
    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn(async () => ({ data: [], error: null })),
        })),
        upsert: vi.fn(async () => ({ data: null, error: null })),
      })),
    } as unknown as ReturnType<typeof import("@/lib/supabase/clients.server").getAdminClient>;

    const outcomes = await checkDomainsWithCache(["google.com"], mockAdmin);
    expect(outcomes.has("google.com")).toBe(true);
    expect(outcomes.get("google.com")?.deliverable).toBe(true);
  });
});

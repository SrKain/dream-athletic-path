import { describe, expect, it, vi } from "vitest";
import {
  chunkIdempotencyKey,
  getRetryAfterSeconds,
  isAmbiguousProviderError,
  isRateLimitError,
  nextBurstSize,
} from "./mailer-burst";

describe("Mailer burst safeguards", () => {
  it("has deterministic chunk idempotency irrespective of input order", () => {
    const one = chunkIdempotencyKey("campaign", ["c", "b", "a"]);
    expect(one).toMatch(/^[a-f0-9]{64}$/);
    expect(one).toBe(chunkIdempotencyKey("campaign", ["a", "b", "c"]));
    expect(one).not.toBe(chunkIdempotencyKey("campaign", ["a", "b"]));
    expect(one).not.toBe(chunkIdempotencyKey("another", ["a", "b", "c"]));
  });

  it("respects Retry-After in seconds or HTTP dates with clamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    expect(getRetryAfterSeconds("3")).toBe(3);
    expect(getRetryAfterSeconds("Wed, 21 Oct 2026 12:00:12 GMT")).toBe(12);
    expect(getRetryAfterSeconds(null)).toBe(60);
    expect(getRetryAfterSeconds("99999")).toBe(3600);
    vi.useRealTimers();
  });

  it("separates rejection, 429 and ambiguous acceptance", () => {
    expect(isRateLimitError({ statusCode: 429 })).toBe(true);
    expect(isRateLimitError({ name: "rate_limit_exceeded" })).toBe(true);
    expect(isRateLimitError({ message: "Invalid recipient" })).toBe(false);
    expect(isAmbiguousProviderError(new Error("Network timeout"))).toBe(true);
    expect(isAmbiguousProviderError({ message: "Validation error" })).toBe(false);
    expect(nextBurstSize(300, true)).toBe(150);
    expect(nextBurstSize(150, true)).toBe(75);
    expect(nextBurstSize(1, true)).toBe(1);
    expect(nextBurstSize(300, false)).toBe(300);
  });
});

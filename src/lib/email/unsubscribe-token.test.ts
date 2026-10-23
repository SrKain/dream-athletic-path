import { describe, expect, it } from "vitest";
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  getUnsubscribeHeaders,
} from "./unsubscribe-token";

describe("Unsubscribe Token and RFC 8058 One-Click Headers", () => {
  it("generates and verifies HMAC-SHA256 tokens successfully", () => {
    const email = "coach@university.edu";
    const campaignId = "11111111-2222-3333-4444-555555555555";
    const token = generateUnsubscribeToken(email, campaignId);

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(30);

    const verified = verifyUnsubscribeToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.email).toBe(email);
    expect(verified?.campaignId).toBe(campaignId);
  });

  it("rejects tampered or forged tokens", () => {
    const valid = generateUnsubscribeToken("coach@university.edu");
    const tampered = valid.slice(0, -4) + "abcd";

    expect(verifyUnsubscribeToken(tampered)).toBeNull();
    expect(verifyUnsubscribeToken("not.a.valid.token")).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
  });

  it("builds correct URL and RFC 8058 headers", () => {
    const email = "coach@university.edu";
    const campaignId = "11111111-2222-3333-4444-555555555555";
    const url = buildUnsubscribeUrl(email, campaignId);

    expect(url).toContain("/api/unsubscribe?token=");

    const headers = getUnsubscribeHeaders(email, campaignId);
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).toContain("<");
    expect(headers["List-Unsubscribe"]).toContain("/api/unsubscribe?token=");
    expect(headers["List-Unsubscribe"]).toContain(">");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_HOST,
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  sanitizeIndexNowUrls,
  sendIndexNowRequest,
} from "./indexnow";

describe("IndexNow protocol helper", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exports valid protocol constants", () => {
    expect(INDEXNOW_KEY).toBe("1675dcaaacd2469b9461671a29b307e0");
    expect(INDEXNOW_HOST).toBe("portfolio.goteamgoagency.com");
    expect(INDEXNOW_KEY_LOCATION).toBe(
      "https://portfolio.goteamgoagency.com/1675dcaaacd2469b9461671a29b307e0.txt",
    );
    expect(INDEXNOW_ENDPOINT).toBe("https://api.indexnow.org/indexnow");
  });

  it("sanitizes, deduplicates and validates URLs", () => {
    const raw = [
      "https://portfolio.goteamgoagency.com/athlete/ana-silva",
      "https://portfolio.goteamgoagency.com/athlete/ana-silva",
      "  https://portfolio.goteamgoagency.com/  ",
      "invalid-url-string",
      "",
      null as unknown as string,
      "ftp://not-supported.com",
    ];

    const sanitized = sanitizeIndexNowUrls(raw);
    expect(sanitized).toEqual([
      "https://portfolio.goteamgoagency.com/athlete/ana-silva",
      "https://portfolio.goteamgoagency.com/",
    ]);
  });

  it("sends structured payload to IndexNow API", async () => {
    let capturedUrl = "";
    let capturedBody: unknown = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    const success = await sendIndexNowRequest([
      "https://portfolio.goteamgoagency.com/athlete/beatriz-souza",
    ]);

    expect(success).toBe(true);
    expect(capturedUrl).toBe("https://api.indexnow.org/indexnow");
    expect(capturedBody).toEqual({
      host: "portfolio.goteamgoagency.com",
      key: "1675dcaaacd2469b9461671a29b307e0",
      keyLocation: "https://portfolio.goteamgoagency.com/1675dcaaacd2469b9461671a29b307e0.txt",
      urlList: ["https://portfolio.goteamgoagency.com/athlete/beatriz-souza"],
    });
  });

  it("handles empty or invalid url lists gracefully without calling fetch", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const result = await sendIndexNowRequest([]);
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is resilient to network errors and never throws exceptions", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection timeout"));

    const result = await sendIndexNowRequest(["https://portfolio.goteamgoagency.com/"]);
    expect(result).toBe(false);
  });

  it("handles non-200 API responses gracefully", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Invalid key location", { status: 422 }));

    const result = await sendIndexNowRequest(["https://portfolio.goteamgoagency.com/"]);
    expect(result).toBe(false);
  });
});

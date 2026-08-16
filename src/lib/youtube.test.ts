import { describe, expect, it } from "vitest";

import { parseYoutubeId, youtubeEmbedUrl, youtubeThumbnail } from "./youtube";

describe("youtube helpers", () => {
  it.each([
    "https://www.youtube.com/watch?v=abc123XYZ_1",
    "https://youtu.be/abc123XYZ_1",
    "https://www.youtube.com/shorts/abc123XYZ_1",
    "https://www.youtube.com/embed/abc123XYZ_1",
  ])("parses %s", (url) => expect(parseYoutubeId(url)).toBe("abc123XYZ_1"));

  it("rejects non-YouTube URLs", () => expect(parseYoutubeId("https://example.com/video")).toBeNull());

  it("builds muted looping embed and thumbnail URLs", () => {
    expect(youtubeEmbedUrl("https://youtu.be/abc123XYZ_1", { autoplay: true, loop: true })).toContain("autoplay=1");
    expect(youtubeThumbnail("https://youtu.be/abc123XYZ_1")).toBe("https://i.ytimg.com/vi/abc123XYZ_1/hqdefault.jpg");
  });
});
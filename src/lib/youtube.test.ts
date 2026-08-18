import { describe, expect, it } from "vitest";

import { parseYoutubeId, youtubeEmbedUrl, youtubeThumbnail } from "./youtube";

describe("youtube helpers", () => {
  it.each([
    "https://www.youtube.com/watch?v=abc123XYZ_1",
    "https://www.youtube.com/watch?v=abc123XYZ_1&feature=shared",
    "https://www.youtube.com/watch?v=abc123XYZ_1&t=10s&ab_channel=Scout",
    "https://www.youtube.com/watch?feature=shared&v=abc123XYZ_1",
    "https://youtu.be/abc123XYZ_1",
    "https://youtu.be/abc123XYZ_1?si=abcdef12345",
    "https://www.youtube.com/shorts/abc123XYZ_1",
    "https://www.youtube.com/shorts/abc123XYZ_1?feature=share",
    "https://www.youtube.com/embed/abc123XYZ_1",
    "https://m.youtube.com/watch?v=abc123XYZ_1",
    "abc123XYZ_1",
  ])("parses %s", (url) => expect(parseYoutubeId(url)).toBe("abc123XYZ_1"));

  it("rejects non-YouTube URLs", () => {
    expect(parseYoutubeId("https://example.com/video")).toBeNull();
    expect(parseYoutubeId("https://example.com/abc123XYZ_1")).toBeNull();
    expect(parseYoutubeId("https://notyoutube.com/watch?v=abc123XYZ_1")).toBeNull();
  });

  it("builds embed and thumbnail URLs", () => {
    const embed = youtubeEmbedUrl("https://youtu.be/abc123XYZ_1", {
      autoplay: true,
      loop: true,
      muted: true,
    });
    expect(embed).toContain("https://www.youtube.com/embed/abc123XYZ_1");
    expect(embed).toContain("autoplay=1");
    expect(embed).toContain("mute=1");
    expect(embed).toContain("loop=1");
    expect(embed).toContain("playlist=abc123XYZ_1");
    expect(youtubeThumbnail("https://youtu.be/abc123XYZ_1")).toBe(
      "https://img.youtube.com/vi/abc123XYZ_1/hqdefault.jpg",
    );
  });
});

import { describe, expect, it } from "vitest";

import { groupPublicVideos } from "./public-videos";
import type { AthleteVideo } from "@/types/db";

const video = (
  id: string,
  kind: AthleteVideo["kind"],
  sort_order: number,
  youtube_url = "https://youtu.be/abc123XYZ_1",
): AthleteVideo => ({
  id,
  athlete_id: "athlete-id",
  kind,
  sort_order,
  youtube_url,
  title: null,
});

describe("groupPublicVideos", () => {
  it("keeps every valid video in its category and honors sort order", () => {
    const groups = groupPublicVideos([
      video("presentation-later", "presentation", 2),
      video("highlight", "highlight", 0),
      video("presentation-first", "presentation", 1),
      video("in-court", "in_court", 0),
      video("feature", "feature", 0),
    ]);

    expect(groups.feature?.id).toBe("feature");
    expect(groups.presentations.map((item) => item.id)).toEqual([
      "presentation-first",
      "presentation-later",
    ]);
    expect(groups.highlights.map((item) => item.id)).toEqual(["highlight"]);
    expect(groups.inCourt.map((item) => item.id)).toEqual(["in-court"]);
    expect(groups.heroUrl).toBe("https://youtu.be/abc123XYZ_1");
  });

  it("excludes invalid links and uses the legacy profile highlight as a hero fallback", () => {
    const groups = groupPublicVideos(
      [video("invalid", "highlight", 0, "https://example.com/abc123XYZ_1")],
      "https://youtu.be/abc123XYZ_1",
    );

    expect(groups.highlights).toEqual([]);
    expect(groups.heroUrl).toBe("https://youtu.be/abc123XYZ_1");
  });
});

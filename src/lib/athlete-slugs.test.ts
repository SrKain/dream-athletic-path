import { describe, expect, it } from "vitest";

import { buildAthleteSlug } from "./athlete-slugs";

describe("buildAthleteSlug", () => {
  it("creates a slug from the athlete name", () => {
    expect(buildAthleteSlug("João Silva", undefined, [])).toBe("joao-silva");
  });

  it("adds the position when the base slug already exists", () => {
    expect(buildAthleteSlug("João Silva", "Oposto", ["joao-silva"])).toBe("joao-silva-oposto");
  });

  it("avoids collisions with suffixes", () => {
    expect(buildAthleteSlug("Ana Paula", "Levantadora", ["ana-paula", "ana-paula-levantadora"])).toBe(
      "ana-paula-levantadora-2",
    );
  });
});

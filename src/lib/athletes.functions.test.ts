import { describe, expect, it } from "vitest";

import { PUBLIC_ATHLETE_SELECT } from "./athletes.functions";

describe("public athlete projection", () => {
  it("never selects private identity fields", () => {
    expect(PUBLIC_ATHLETE_SELECT).not.toMatch(/\bemail\b/);
    expect(PUBLIC_ATHLETE_SELECT).not.toMatch(/\buser_id\b/);
    expect(PUBLIC_ATHLETE_SELECT).not.toMatch(/\bagency_id\b/);
    expect(PUBLIC_ATHLETE_SELECT).not.toMatch(/\bdeleted_at\b/);
  });

  it("contains the fields required by the catalog", () => {
    expect(PUBLIC_ATHLETE_SELECT).toContain("full_name");
    expect(PUBLIC_ATHLETE_SELECT).toContain("slug");
    expect(PUBLIC_ATHLETE_SELECT).toContain("is_public");
  });

  it("contains physical fields required by the public profile", () => {
    expect(PUBLIC_ATHLETE_SELECT).toContain("birth_date");
    expect(PUBLIC_ATHLETE_SELECT).toContain("height_cm");
    expect(PUBLIC_ATHLETE_SELECT).toContain("weight_kg");
  });
});

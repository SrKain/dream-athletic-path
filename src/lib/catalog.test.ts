import { describe, expect, it } from "vitest";

import { buildAthleteShelves, calculateAge, filterAthletes, pickAceAthletes } from "./catalog";
import type { AthleteCard } from "@/types/db";

const athletes = [
  athlete("1", "ana", "Ana", "Levantador", true, "2008-04-01"),
  athlete("2", "bia", "Bia", "Ponteiro", false, "2005-01-01"),
  athlete("3", "clara", "Clara", "Líbero", false, "2003-01-01"),
];

describe("catalog helpers", () => {
  it("groups athletes by the manually configured position order", () => {
    const shelves = buildAthleteShelves(athletes, ["position-1", "position-2", "position-3"]);
    expect(shelves.map((shelf) => shelf.title)).toEqual(["Setters", "Outside Hitters", "Liberos"]);
    expect(shelves[0].athletes[0].full_name).toBe("Ana");
  });

  it("filters by search, position and age", () => {
    const result = filterAthletes(
      athletes,
      { ageRange: "under18", position: "Levantador", search: "ana" },
      new Date("2026-03-01"),
    );
    expect(result.map((item) => item.slug)).toEqual(["ana"]);
  });

  it("uses featured athletes for the aces shelf", () => {
    expect(pickAceAthletes(athletes).map((item) => item.slug)).toEqual(["ana"]);
  });

  it("calculates age before the birthday in the current year", () => {
    expect(calculateAge("2008-04-01", new Date("2026-03-01"))).toBe(17);
  });
});

function athlete(
  id: string,
  slug: string,
  fullName: string,
  position: string,
  featured: boolean,
  birthDate: string,
): AthleteCard {
  return {
    birth_date: birthDate,
    cover_url: null,
    created_at: "2026-01-01",
    current_stage_id: null,
    full_name: fullName,
    height_cm: 180,
    id,
    is_featured: featured,
    is_public: true,
    nationality: "BR",
    photo_url: null,
    position: { abbreviation: null, name_en: position, name_pt: position },
    position_id: `position-${id}`,
    slug,
    sport: { name_en: "Volleyball", name_pt: "Vôlei", slug: "volleyball" },
    sport_id: null,
    weight_kg: 70,
  };
}

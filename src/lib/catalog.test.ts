import { describe, expect, it } from "vitest";

import {
  buildAthleteShelves,
  filterAthletes,
  getAthleteCountryEn,
  getAthletePositionEn,
  pickAceAthletes,
  translateCountryToEn,
  translatePositionToEn,
} from "./catalog";
import type { AthleteCard, AthleteStatus } from "@/types/db";

const athletes: AthleteCard[] = [
  athlete("1", "ana", "Ana", "Levantadora", true, "2008-04-01", "Brasil", 2026, "Freshman"),
  athlete(
    "2",
    "bia",
    "Bia",
    "Ponteira",
    false,
    "2005-01-01",
    "Estados Unidos",
    2025,
    "High School",
  ),
  athlete("3", "clara", "Clara", "Líbero", false, "2003-01-01", "Argentina", 2024, "Junior"),
];

describe("catalog helpers", () => {
  it("translates positions and countries accurately to US English", () => {
    expect(translatePositionToEn("Levantadora")).toBe("Setter");
    expect(translatePositionToEn("Ponteira")).toBe("Outside Hitter");
    expect(translatePositionToEn("Central")).toBe("Middle Blocker");
    expect(translatePositionToEn("Oposta")).toBe("Opposite");
    expect(translatePositionToEn("Líbero")).toBe("Libero");

    expect(translateCountryToEn("Brasil")).toBe("Brazil");
    expect(translateCountryToEn("BR")).toBe("Brazil");
    expect(translateCountryToEn("Estados Unidos")).toBe("United States");
    expect(translateCountryToEn("USA")).toBe("United States");

    expect(getAthletePositionEn(athletes[0])).toBe("Setter");
    expect(getAthleteCountryEn(athletes[0])).toBe("Brazil");
  });

  it("groups athletes by the manually configured position order using translated names", () => {
    const shelves = buildAthleteShelves(athletes, ["position-1", "position-2", "position-3"]);
    expect(shelves.map((shelf) => shelf.title)).toEqual(["Setters", "Outside Hitters", "Liberos"]);
    expect(shelves[0].athletes[0].full_name).toBe("Ana");
  });

  it("filters by search, position, gradYear, country, and studentStatus", () => {
    const resultPosition = filterAthletes(athletes, { positions: ["Setter"] });
    expect(resultPosition.map((item) => item.slug)).toEqual(["ana"]);

    const resultGrad = filterAthletes(athletes, { gradYears: ["2025"] });
    expect(resultGrad.map((item) => item.slug)).toEqual(["bia"]);

    const resultCountry = filterAthletes(athletes, { countries: ["Brazil"] });
    expect(resultCountry.map((item) => item.slug)).toEqual(["ana"]);

    const resultStatus = filterAthletes(athletes, { studentStatuses: ["Junior"] });
    expect(resultStatus.map((item) => item.slug)).toEqual(["clara"]);

    const resultCombined = filterAthletes(athletes, {
      countries: ["Brazil"],
      gradYears: ["2026"],
      positions: ["Setter"],
      search: "ana",
      studentStatuses: ["Freshman"],
    });
    expect(resultCombined.map((item) => item.slug)).toEqual(["ana"]);
  });

  it("uses featured athletes for the aces shelf", () => {
    expect(pickAceAthletes(athletes).map((item) => item.slug)).toEqual(["ana"]);
  });
});

function athlete(
  id: string,
  slug: string,
  fullName: string,
  positionPt: string,
  featured: boolean,
  birthDate: string,
  countryPt: string,
  gradYear: number,
  status: AthleteStatus,
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
    nationality: countryPt,
    photo_url: null,
    position: { abbreviation: null, name_en: null, name_pt: positionPt },
    position_id: `position-${id}`,
    profile: {
      athlete_status: status,
      graduation_year: gradYear,
      high_school_graduation: `Class of ${gradYear}`,
      highlight_video_url: null,
    },
    slug,
    sport: { name_en: "Volleyball", name_pt: "Vôlei", slug: "volleyball" },
    sport_id: null,
    weight_kg: 70,
  };
}

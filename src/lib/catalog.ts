import type { AthleteCard } from "@/types/db";

export type AthleteShelf = {
  key: string;
  title: string;
  description: string;
  athletes: AthleteCard[];
};

const volleyballOrder = ["levantador", "ponteiro", "central", "líbero", "libero", "oposto"];

export function calculateAge(birthDate?: string | null, now = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function filterAthletes(
  athletes: AthleteCard[],
  filters: { search?: string; position?: string; country?: string; ageRange?: string },
  now = new Date(),
) {
  const term = filters.search?.trim().toLocaleLowerCase() ?? "";
  return athletes.filter((athlete) => {
    const positionPt = athlete.position?.name_pt?.toLowerCase() ?? "";
    const positionEn = athlete.position?.name_en?.toLowerCase() ?? "";
    const selectedPosition = filters.position?.toLowerCase() ?? "";

    const matchesPosition =
      !selectedPosition ||
      positionPt === selectedPosition ||
      positionEn === selectedPosition ||
      athlete.position_id === filters.position;

    const countryPt = athlete.country?.name_pt?.toLowerCase() ?? "";
    const countryEn = athlete.country?.name_en?.toLowerCase() ?? "";
    const selectedCountry = filters.country?.toLowerCase() ?? "";

    const matchesCountry =
      !selectedCountry ||
      countryPt === selectedCountry ||
      countryEn === selectedCountry ||
      athlete.nationality?.toLowerCase() === selectedCountry;

    const age = calculateAge(athlete.birth_date, now);
    const matchesAge =
      !filters.ageRange ||
      age === null ||
      (filters.ageRange === "under18"
        ? age <= 18
        : filters.ageRange === "19-22"
          ? age >= 19 && age <= 22
          : age >= 23);

    const haystack = [
      athlete.full_name,
      athlete.position?.name_pt,
      athlete.position?.name_en,
      athlete.country?.name_pt,
      athlete.country?.name_en,
      athlete.nationality,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();

    return matchesPosition && matchesCountry && matchesAge && (!term || haystack.includes(term));
  });
}

export function buildAthleteShelves(
  athletes: AthleteCard[],
  positionOrder: string[] = [],
): AthleteShelf[] {
  const groups = new Map<
    string,
    { position: string; positionId: string; athletes: AthleteCard[] }
  >();
  for (const athlete of athletes) {
    const position = athlete.position?.name_en ?? athlete.position?.name_pt ?? "Other positions";
    const positionId = athlete.position_id ?? position;
    const current = groups.get(positionId) ?? { athletes: [], position, positionId };
    current.athletes.push(athlete);
    groups.set(positionId, current);
  }

  const manualRank = (positionId: string) => {
    const index = positionOrder.indexOf(positionId);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return [...groups.values()]
    .sort(
      (a, b) =>
        manualRank(a.positionId) - manualRank(b.positionId) ||
        shelfRank(a.position) - shelfRank(b.position) ||
        a.position.localeCompare(b.position, "en-US"),
    )
    .map((group) => ({
      key: slugify(group.positionId),
      title: pluralizePosition(group.position),
      description: `${group.athletes.length} ${
        group.athletes.length === 1 ? "published profile" : "published profiles"
      }`,
      athletes: group.athletes,
    }));
}

export function pickAceAthletes(athletes: AthleteCard[], limit = 8) {
  const featured = athletes.filter((athlete) => athlete.is_featured);
  return (featured.length ? featured : athletes).slice(0, limit);
}

function shelfRank(title: string) {
  const normalized = title.toLocaleLowerCase();
  const index = volleyballOrder.findIndex((item) => normalized.includes(item));
  return index === -1 ? volleyballOrder.length : index;
}

function pluralizePosition(title: string) {
  const normalized = title.toLocaleLowerCase();
  if (normalized.includes("setter") || normalized.includes("levantador")) return "Setters";
  if (normalized.includes("outside") || normalized.includes("ponteiro")) return "Outside Hitters";
  if (normalized.includes("middle") || normalized.includes("central")) return "Middle Blockers";
  if (normalized.includes("libero") || normalized.includes("líbero")) return "Liberos";
  if (normalized.includes("opposite") || normalized.includes("oposto")) return "Opposites";
  return title;
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

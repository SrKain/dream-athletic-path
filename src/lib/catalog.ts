import type { AthleteCard } from "@/types/db";

export type AthleteShelf = {
  key: string;
  title: string;
  description: string;
  athletes: AthleteCard[];
};

export const POSITION_PT_TO_EN: Record<string, string> = {
  // Volleyball
  levantador: "Setter",
  levantadora: "Setter",
  levantadores: "Setters",
  levantadoras: "Setters",
  setter: "Setter",
  setters: "Setters",
  ponteiro: "Outside Hitter",
  ponteira: "Outside Hitter",
  ponteiros: "Outside Hitters",
  ponteiras: "Outside Hitters",
  ponta: "Outside Hitter",
  pontas: "Outside Hitters",
  outside: "Outside Hitter",
  "outside hitter": "Outside Hitter",
  "outside hitters": "Outside Hitters",
  central: "Middle Blocker",
  centrais: "Middle Blockers",
  middle: "Middle Blocker",
  "middle blocker": "Middle Blocker",
  "middle blockers": "Middle Blockers",
  oposto: "Opposite",
  oposta: "Opposite",
  opostos: "Opposites",
  opostas: "Opposites",
  opposite: "Opposite",
  "opposite hitter": "Opposite",
  opposites: "Opposites",
  líbero: "Libero",
  libero: "Libero",
  liberos: "Liberos",
  líberos: "Liberos",
  defensor: "Defensive Specialist",
  defensora: "Defensive Specialist",
  "defensive specialist": "Defensive Specialist",
  "right side hitter": "Right Side Hitter",
  "right side": "Right Side Hitter",

  // Soccer / Football
  goleiro: "Goalkeeper",
  goleira: "Goalkeeper",
  goalkeeper: "Goalkeeper",
  zagueiro: "Center Back",
  zagueira: "Center Back",
  "center back": "Center Back",
  lateral: "Fullback",
  fullback: "Fullback",
  volante: "Defensive Midfielder",
  "meio-campo": "Midfielder",
  meio_campo: "Midfielder",
  meia: "Midfielder",
  midfielder: "Midfielder",
  atacante: "Forward",
  forward: "Forward",
  striker: "Striker",
  ponta_esquerda: "Left Wing",
  ponta_direita: "Right Wing",

  // Basketball
  armador: "Point Guard",
  "point guard": "Point Guard",
  "ala-armador": "Shooting Guard",
  "shooting guard": "Shooting Guard",
  ala: "Small Forward",
  "small forward": "Small Forward",
  "ala-pivô": "Power Forward",
  "power forward": "Power Forward",
  pivô: "Center",
  center: "Center",
};

export const COUNTRY_PT_TO_EN: Record<string, string> = {
  brasil: "Brazil",
  brazil: "Brazil",
  brasileiro: "Brazil",
  brasileira: "Brazil",
  br: "Brazil",
  bra: "Brazil",
  "estados unidos": "United States",
  "estados unidos da américa": "United States",
  "united states": "United States",
  "united states of america": "United States",
  usa: "United States",
  us: "United States",
  americano: "United States",
  americana: "United States",
  argentina: "Argentina",
  argentino: "Argentina",
  argentina_fem: "Argentina",
  ar: "Argentina",
  arg: "Argentina",
  portugal: "Portugal",
  português: "Portugal",
  portuguesa: "Portugal",
  pt: "Portugal",
  prt: "Portugal",
  canadá: "Canada",
  canada: "Canada",
  canadense: "Canada",
  ca: "Canada",
  can: "Canada",
  méxico: "Mexico",
  mexico: "Mexico",
  mexicano: "Mexico",
  mexicana: "Mexico",
  mx: "Mexico",
  mex: "Mexico",
  colômbia: "Colombia",
  colombia: "Colombia",
  colombiano: "Colombia",
  colombiana: "Colombia",
  co: "Colombia",
  col: "Colombia",
  chile: "Chile",
  chileno: "Chile",
  chilena: "Chile",
  cl: "Chile",
  chl: "Chile",
  peru: "Peru",
  peruano: "Peru",
  peruana: "Peru",
  pe: "Peru",
  per: "Peru",
  uruguai: "Uruguay",
  uruguay: "Uruguay",
  uruguaio: "Uruguay",
  uruguaia: "Uruguay",
  uy: "Uruguay",
  ury: "Uruguay",
  paraguai: "Paraguay",
  paraguay: "Paraguay",
  paraguaio: "Paraguay",
  paraguaia: "Paraguay",
  py: "Paraguay",
  pry: "Paraguay",
  venezuela: "Venezuela",
  venezuelano: "Venezuela",
  venezuelana: "Venezuela",
  ve: "Venezuela",
  ven: "Venezuela",
  espanha: "Spain",
  spain: "Spain",
  espanhol: "Spain",
  espanhola: "Spain",
  es: "Spain",
  esp: "Spain",
  itália: "Italy",
  italy: "Italy",
  italiano: "Italy",
  italiana: "Italy",
  it: "Italy",
  ita: "Italy",
  alemanha: "Germany",
  germany: "Germany",
  alemão: "Germany",
  alemã: "Germany",
  de: "Germany",
  deu: "Germany",
  frança: "France",
  france: "France",
  francês: "France",
  francesa: "France",
  fr: "France",
  fra: "France",
  "reino unido": "United Kingdom",
  "united kingdom": "United Kingdom",
  inglaterra: "United Kingdom",
  england: "United Kingdom",
  gb: "United Kingdom",
  gbr: "United Kingdom",
  uk: "United Kingdom",
  japão: "Japan",
  japan: "Japan",
  japonês: "Japan",
  japonesa: "Japan",
  jp: "Japan",
  jpn: "Japan",
  austrália: "Australia",
  australia: "Australia",
  australiano: "Australia",
  australiana: "Australia",
  au: "Australia",
  aus: "Australia",
};

const volleyballOrder = [
  "setter",
  "outside hitter",
  "outside",
  "middle blocker",
  "middle",
  "libero",
  "opposite",
];

export function calculateAge(birthDate?: string | null, now = new Date()): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function translatePositionToEn(position?: string | null): string {
  if (!position) return "";
  const trimmed = position.trim();
  const normalized = trimmed.toLowerCase();
  return POSITION_PT_TO_EN[normalized] || trimmed;
}

export function translateCountryToEn(country?: string | null): string {
  if (!country) return "";
  const trimmed = country.trim();
  const normalized = trimmed.toLowerCase();
  return COUNTRY_PT_TO_EN[normalized] || trimmed;
}

export function getAthletePositionEn(athlete: AthleteCard): string {
  if (athlete.position?.name_en) {
    return translatePositionToEn(athlete.position.name_en);
  }
  if (athlete.position?.name_pt) {
    return translatePositionToEn(athlete.position.name_pt);
  }
  return translatePositionToEn(athlete.position_id) || "Athlete";
}

export function getAthleteCountryEn(athlete: AthleteCard): string {
  if (athlete.country?.name_en) {
    return translateCountryToEn(athlete.country.name_en);
  }
  if (athlete.country?.name_pt) {
    return translateCountryToEn(athlete.country.name_pt);
  }
  if (athlete.nationality) {
    return translateCountryToEn(athlete.nationality);
  }
  return "";
}

export function getAthleteGradYear(athlete: AthleteCard): string | null {
  if (athlete.profile?.graduation_year) {
    return String(athlete.profile.graduation_year);
  }
  if (athlete.profile?.high_school_graduation) {
    const match = athlete.profile.high_school_graduation.match(/\b(20\d{2})\b/);
    if (match) return match[1];
    const cleaned = athlete.profile.high_school_graduation.trim();
    return cleaned || null;
  }
  return null;
}

export function getAthleteStatus(athlete: AthleteCard): string | null {
  const status = athlete.profile?.athlete_status;
  return status ? status.trim() : null;
}

export type CatalogFilters = {
  search?: string;
  positions?: string | string[];
  gradYears?: string | string[];
  countries?: string | string[];
  studentStatuses?: string | string[];
  /** @deprecated Removed in TASK-042 */
  position?: string | string[];
  /** @deprecated Removed in TASK-042 */
  country?: string | string[];
  /** @deprecated Removed in TASK-042 */
  ageRange?: string;
};

export function filterAthletes(athletes: AthleteCard[], filters: CatalogFilters) {
  const term = filters.search?.trim().toLowerCase() ?? "";

  const rawPositions = filters.positions ?? filters.position;
  const selectedPositions = Array.isArray(rawPositions)
    ? rawPositions.map((p) => p.toLowerCase()).filter(Boolean)
    : rawPositions
      ? [rawPositions.toLowerCase()]
      : [];

  const rawGradYears = filters.gradYears;
  const selectedGradYears = Array.isArray(rawGradYears)
    ? rawGradYears.map((g) => g.toLowerCase()).filter(Boolean)
    : rawGradYears
      ? [rawGradYears.toLowerCase()]
      : [];

  const rawCountries = filters.countries ?? filters.country;
  const selectedCountries = Array.isArray(rawCountries)
    ? rawCountries.map((c) => c.toLowerCase()).filter(Boolean)
    : rawCountries
      ? [rawCountries.toLowerCase()]
      : [];

  const rawStatuses = filters.studentStatuses;
  const selectedStatuses = Array.isArray(rawStatuses)
    ? rawStatuses.map((s) => s.toLowerCase()).filter(Boolean)
    : rawStatuses
      ? [rawStatuses.toLowerCase()]
      : [];

  return athletes.filter((athlete) => {
    const positionEn = getAthletePositionEn(athlete).toLowerCase();
    const positionRaw = (athlete.position_id ?? "").toLowerCase();

    const matchesPosition =
      selectedPositions.length === 0 ||
      selectedPositions.some(
        (pos) =>
          pos === positionEn ||
          pos === positionRaw ||
          positionEn.includes(pos) ||
          pos.includes(positionEn),
      );

    const gradYear = (getAthleteGradYear(athlete) ?? "").toLowerCase();
    const matchesGradYear =
      selectedGradYears.length === 0 ||
      selectedGradYears.some(
        (year) => gradYear === year || gradYear.includes(year) || year.includes(gradYear),
      );

    const countryEn = getAthleteCountryEn(athlete).toLowerCase();
    const nationality = (athlete.nationality ?? "").toLowerCase();
    const matchesCountry =
      selectedCountries.length === 0 ||
      selectedCountries.some(
        (cntry) =>
          cntry === countryEn ||
          cntry === nationality ||
          countryEn.includes(cntry) ||
          cntry.includes(countryEn),
      );

    const status = (getAthleteStatus(athlete) ?? "").toLowerCase();
    const matchesStatus =
      selectedStatuses.length === 0 ||
      selectedStatuses.some((st) => st === status || status.includes(st) || st.includes(status));

    const haystack = [
      athlete.full_name,
      positionEn,
      countryEn,
      gradYear,
      status,
      athlete.position?.name_en,
      athlete.country?.name_en,
      athlete.nationality,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      matchesPosition &&
      matchesGradYear &&
      matchesCountry &&
      matchesStatus &&
      (!term || haystack.includes(term))
    );
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
    const position = getAthletePositionEn(athlete) || "Other positions";
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
  const normalized = title.toLowerCase();
  const index = volleyballOrder.findIndex((item) => normalized.includes(item));
  return index === -1 ? volleyballOrder.length : index;
}

function pluralizePosition(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("setter")) return "Setters";
  if (normalized.includes("outside")) return "Outside Hitters";
  if (normalized.includes("middle")) return "Middle Blockers";
  if (normalized.includes("libero")) return "Liberos";
  if (normalized.includes("opposite")) return "Opposites";
  return title;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

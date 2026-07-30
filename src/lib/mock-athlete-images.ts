import type { AthleteCard } from "@/types/db";

const MOCK_BASE_PATH = "/assets/mock-athletes";

const slugImages: Record<string, string> = {
  "marina-alves": `${MOCK_BASE_PATH}/marina-alves.png`,
};

const positionImages = [
  { patterns: ["levantador", "setter"], src: `${MOCK_BASE_PATH}/volleyball-setter.png` },
  { patterns: ["libero", "líbero"], src: `${MOCK_BASE_PATH}/volleyball-libero.png` },
  {
    patterns: ["central", "middle", "oposto", "opposite"],
    src: `${MOCK_BASE_PATH}/volleyball-middle.png`,
  },
  { patterns: ["ponteiro", "outside"], src: `${MOCK_BASE_PATH}/marina-alves.png` },
];

const fallbackImages = [
  `${MOCK_BASE_PATH}/marina-alves.png`,
  `${MOCK_BASE_PATH}/volleyball-setter.png`,
  `${MOCK_BASE_PATH}/volleyball-libero.png`,
  `${MOCK_BASE_PATH}/volleyball-middle.png`,
];

export const catalogHeroImage = `${MOCK_BASE_PATH}/hero-volleyball.png`;

export function getAthleteDisplayImage(
  athlete: Pick<AthleteCard, "photo_url" | "slug" | "full_name" | "position">,
) {
  if (athlete.photo_url) return athlete.photo_url;
  if (slugImages[athlete.slug]) return slugImages[athlete.slug];

  const position = [
    athlete.position?.name_pt,
    athlete.position?.name_en,
    athlete.position?.abbreviation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const matched = positionImages.find((item) =>
    item.patterns.some((pattern) => position.includes(pattern)),
  );
  if (matched) return matched.src;

  return fallbackImages[stableIndex(athlete.slug || athlete.full_name, fallbackImages.length)];
}

function stableIndex(value: string, modulo: number) {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) % modulo;
}

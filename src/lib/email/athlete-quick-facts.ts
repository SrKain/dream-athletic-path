import { cmToFeetAndInches, formatGpa } from "@/lib/units";
import { EMAIL_ASSETS } from "./email-brand";
import type { RecruitEmailAthlete } from "./recruit-email";

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

export function formatBoardHeight(heightCm?: number | null): string {
  if (!heightCm || heightCm <= 0) return "";
  const imperial = cmToFeetAndInches(heightCm);
  return imperial ? `${imperial.feet}'${imperial.inches}" (${heightCm} cm)` : `${heightCm} cm`;
}

function formatQuickFactsGpa(value: unknown): string {
  if (!clean(value)) return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? (formatGpa(numeric) ?? "") : "";
}

/** Approved order, labels and icons shared by every HTML/plain-text card. */
export const QUICK_FACTS_ROWS = [
  {
    label: "POSITION",
    icon: EMAIL_ASSETS.icons.star,
    value: (a: RecruitEmailAthlete) => clean(a.positionEn),
  },
  {
    label: "HEIGHT",
    icon: EMAIL_ASSETS.icons.height,
    value: (a: RecruitEmailAthlete) => formatBoardHeight(a.heightCm),
  },
  {
    label: "GPA",
    icon: EMAIL_ASSETS.icons.gradCap,
    value: (a: RecruitEmailAthlete) => formatQuickFactsGpa(a.gpa),
  },
  {
    label: "CURRENT SCHOOL",
    icon: EMAIL_ASSETS.icons.academic,
    value: (a: RecruitEmailAthlete) => clean(a.currentSchool),
  },
  {
    label: "STATUS",
    icon: EMAIL_ASSETS.icons.arrowGold,
    value: (a: RecruitEmailAthlete) => clean(a.athleteStatus),
  },
  {
    label: "AVAILABLE",
    icon: EMAIL_ASSETS.icons.film,
    value: (a: RecruitEmailAthlete) => clean(a.seekingOpportunities),
  },
  {
    label: "INTENDED MAJOR",
    icon: EMAIL_ASSETS.icons.academic,
    value: (a: RecruitEmailAthlete) => clean(a.courseOfInterest),
  },
  {
    label: "FROM",
    icon: EMAIL_ASSETS.icons.globe,
    value: (a: RecruitEmailAthlete) => clean(a.countryEn),
  },
] as const;

export function getAthleteQuickFacts(athlete: RecruitEmailAthlete) {
  return QUICK_FACTS_ROWS.flatMap((row) => {
    const value = row.value(athlete);
    return value
      ? [
          {
            label: row.label,
            value,
            icon: row.icon,
            flag: row.label === "FROM" ? clean(athlete.countryFlag) : "",
          },
        ]
      : [];
  });
}

export function renderQuickFactsPlainText(athlete: RecruitEmailAthlete): string {
  const rows = getAthleteQuickFacts(athlete);
  return rows.length
    ? [
        "QUICK FACTS",
        ...rows.map((row) => `${row.label}: ${row.flag ? `${row.flag} ` : ""}${row.value}`),
      ].join("\n")
    : "";
}

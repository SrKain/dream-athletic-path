import type { RecruitEmailAthlete } from "../recruit-email";

/** Demonstration data supplied in the Quick Facts request; no database lookup. */
export const ANA_CAROLINA: RecruitEmailAthlete = {
  id: "a91c8400-e29b-41d4-a716-446655440001",
  name: "Ana Carolina Martins",
  slug: "ana-carolina-martins",
  positionEn: "Setter",
  heightCm: 170,
  gpa: 3.31,
  currentSchool: "Eastern Wyoming College",
  athleteStatus: "Sophomore",
  seekingOpportunities: "Fall 2025",
  courseOfInterest: "Computer Engineering",
  countryEn: "Brazil",
  countryFlag: "🇧🇷",
  highSchoolGraduation: "2022",
  collegeStartDate: "Fall 2023",
  aboutHer: "Demonstration biography for preview validation.",
  teamContribution: "Strong communication; Court awareness",
};

/** Independent expected values: do not derive these from QUICK_FACTS_ROWS. */
export const ANA_QUICK_FACTS = [
  ["POSITION", "Setter"],
  ["HEIGHT", "5'7\" (170 cm)"],
  ["GPA", "3.31"],
  ["CURRENT SCHOOL", "Eastern Wyoming College"],
  ["STATUS", "Sophomore"],
  ["AVAILABLE", "Fall 2025"],
  ["INTENDED MAJOR", "Computer Engineering"],
  ["FROM", "🇧🇷 Brazil"],
] as const;

/** Same input shape used by admin/dialog previews and send/queue templates. */
export const ANA_EMAIL_DATA = {
  athleteId: ANA_CAROLINA.id,
  athleteName: ANA_CAROLINA.name,
  athleteSlug: ANA_CAROLINA.slug,
  positionName: ANA_CAROLINA.positionEn,
  heightCm: ANA_CAROLINA.heightCm,
  gpa: ANA_CAROLINA.gpa,
  currentSchool: ANA_CAROLINA.currentSchool,
  athleteStatus: ANA_CAROLINA.athleteStatus,
  seekingOpportunities: ANA_CAROLINA.seekingOpportunities,
  courseOfInterest: ANA_CAROLINA.courseOfInterest,
  nationality: ANA_CAROLINA.countryEn,
  countryFlag: ANA_CAROLINA.countryFlag,
  aboutHer: ANA_CAROLINA.aboutHer,
  teamContribution: ANA_CAROLINA.teamContribution,
  highSchoolGraduation: ANA_CAROLINA.highSchoolGraduation,
  collegeStartDate: ANA_CAROLINA.collegeStartDate,
};

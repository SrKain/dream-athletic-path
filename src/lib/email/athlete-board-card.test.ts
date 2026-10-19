import { describe, expect, it } from "vitest";
import { ANA_CAROLINA, ANA_QUICK_FACTS } from "./__fixtures__/ana-carolina";
import { getAthleteQuickFacts, renderQuickFactsPlainText } from "./athlete-quick-facts";
import { EMAIL_ASSETS, EMAIL_COLORS } from "./email-brand";
import { escapeHtml, renderAthleteCard as renderLayoutCard } from "./email-layout";
import { renderAthleteCard as renderLegacyCard, type RecruitEmailAthlete } from "./recruit-email";
import { renderAthleteBoardCard, buildFitReasons } from "./athlete-board-card";
import { getMissingAthleteEmailFields, assertAthleteEmailFields } from "./athlete-email-quality";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail,
  type RecruitEmailData,
} from "./recruit-email-template";
import { generateRecruitEmailPlainText, generateMultiAthletePlainText } from "./recruit-email";

const athlete: RecruitEmailData = {
  athleteId: "a91c8400-e29b-41d4-a716-446655440001",
  athleteName: "Mariana Ribeiro",
  athleteSlug: "mariana-ribeiro",
  photoUrl: "https://example.edu/photo.jpg",
  heightCm: 184,
  nationality: "Brazil",
  countryFlag: "🇧🇷",
  positionName: "Setter",
  gpa: 3.85,
  athleteStatus: "Freshman",
  currentSchool: "Central High",
  seekingOpportunities: "Fall 2026",
  courseOfInterest: "Biology",
  highSchoolGraduation: "2025",
  graduationYear: 2025,
  collegeStartDate: "Fall 2026",
  highlightNote: "Fallback reason only",
  aboutHer:
    "First paragraph & hard work <script>alert(1)</script>.\nAnother line.\n\nSecond paragraph on leadership.",
  teamContribution: "Creative <setter> & leader; Strong court vision",
  stats: { season: "2025", kills: 17 },
  videos: [
    { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", kind: "highlight", title: "Highlights" },
  ],
};

const cardAthlete = {
  id: athlete.athleteId!,
  name: athlete.athleteName,
  slug: athlete.athleteSlug,
  photoUrl: athlete.photoUrl,
  positionEn: athlete.positionName,
  heightCm: athlete.heightCm,
  countryEn: athlete.nationality,
  countryFlag: athlete.countryFlag,
  gpa: athlete.gpa,
  athleteStatus: athlete.athleteStatus,
  currentSchool: athlete.currentSchool,
  seekingOpportunities: athlete.seekingOpportunities,
  courseOfInterest: athlete.courseOfInterest,
  highSchoolGraduation: athlete.highSchoolGraduation,
  graduationYear: athlete.graduationYear,
  collegeStartDate: athlete.collegeStartDate,
  highlightNote: athlete.highlightNote,
  aboutHer: athlete.aboutHer,
  teamContribution: athlete.teamContribution,
  stats: athlete.stats,
  videos: athlete.videos,
};

describe("Approved Ana Carolina Quick Facts", () => {
  it("renders exactly the eight rows, labels, values and icons in the approved order", () => {
    const rows = getAthleteQuickFacts(ANA_CAROLINA);
    expect(rows.map((row) => [row.label, `${row.flag ? row.flag + " " : ""}${row.value}`])).toEqual(ANA_QUICK_FACTS);
    expect(rows.map((row) => row.icon)).toEqual([
      EMAIL_ASSETS.icons.star, EMAIL_ASSETS.icons.height, EMAIL_ASSETS.icons.gradCap,
      EMAIL_ASSETS.icons.academic, EMAIL_ASSETS.icons.arrowGold, EMAIL_ASSETS.icons.film,
      EMAIL_ASSETS.icons.academic, EMAIL_ASSETS.icons.globe,
    ]);
    const html = renderAthleteBoardCard(ANA_CAROLINA);
    const indices = ANA_QUICK_FACTS.map(([label]) => html.indexOf(`>${label}</td>`));
    expect(indices.every((index) => index > 0)).toBe(true);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    for (const row of rows) {
      expect(html.split(`>${row.label}</td>`)).toHaveLength(2);
      expect(html).toContain(`>${escapeHtml(row.value)}</td>`);
    }
    expect(html).toContain('>🇧🇷</td>');
    expect(html).not.toContain(EMAIL_ASSETS.icons.globe);
    expect(html).not.toMatch(/High School Graduation|College Start Date|AVAILABLE:|GPA <strong/);
    expect(html).toContain(">TRANSFER</span>");
  });

  it.each([[3.31, "3.31"], [4, "4.0"], ["3.31", "3.31"], ["4", "4.0"]])(
    "keeps numeric or string GPA %s as %s without rounding",
    (gpa, expected) => {
      const input = { ...ANA_CAROLINA, gpa } as unknown as RecruitEmailAthlete;
      expect(getAthleteQuickFacts(input).find((row) => row.label === "GPA")?.value).toBe(expected);
      expect(renderAthleteBoardCard(input)).toContain(`>${expected}</td>`);
    },
  );

  it.each([NaN, Infinity, "not a number", " ", null])("omits invalid GPA %s", (gpa) => {
    const input = { ...ANA_CAROLINA, gpa } as unknown as RecruitEmailAthlete;
    expect(getAthleteQuickFacts(input).some((row) => row.label === "GPA")).toBe(false);
  });

  it("omits absent fields, uses globe without a flag and escapes malicious school names", () => {
    const sparse = { ...ANA_CAROLINA, currentSchool: " ", countryFlag: null, athleteStatus: "Graduate Transfer" };
    const html = renderAthleteBoardCard(sparse);
    expect(html).not.toContain(">CURRENT SCHOOL</td>");
    expect(html).not.toContain(">TRANSFER</span>");
    expect(html).toContain(EMAIL_ASSETS.icons.globe);
    expect(renderQuickFactsPlainText(sparse)).toContain("FROM: Brazil");
    expect(renderQuickFactsPlainText(sparse)).not.toContain("CURRENT SCHOOL:");
    const malicious = renderAthleteBoardCard({ ...ANA_CAROLINA, currentSchool: "<script>alert(1)</script>" });
    expect(malicious).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(malicious).not.toContain("<script>");
    expect(malicious).not.toContain("<svg");
  });

  it("reuses the same card through both legacy adapters", () => {
    const canonical = renderAthleteBoardCard(ANA_CAROLINA);
    expect(renderLegacyCard(ANA_CAROLINA)).toBe(canonical);
    expect(renderLayoutCard({
      athleteId: ANA_CAROLINA.id, athleteName: ANA_CAROLINA.name, athleteSlug: ANA_CAROLINA.slug,
      positionName: ANA_CAROLINA.positionEn, heightCm: ANA_CAROLINA.heightCm,
      gpa: ANA_CAROLINA.gpa, currentSchool: ANA_CAROLINA.currentSchool,
      athleteStatus: ANA_CAROLINA.athleteStatus, seekingOpportunities: ANA_CAROLINA.seekingOpportunities,
      courseOfInterest: ANA_CAROLINA.courseOfInterest, nationality: ANA_CAROLINA.countryEn,
      countryFlag: ANA_CAROLINA.countryFlag, aboutHer: ANA_CAROLINA.aboutHer,
      teamContribution: ANA_CAROLINA.teamContribution,
    }, 0)).toBe(canonical);
  });

  it("keeps labels at 12px and textMuted over boardPanel above WCAG 4.5:1", () => {
    function luminance(hex: string) {
      const values = hex.slice(1).match(/../g)!.map((channel) => parseInt(channel, 16) / 255)
        .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    }
    const ratio = (luminance(EMAIL_COLORS.boardPanel) + 0.05) / (luminance(EMAIL_COLORS.textMuted) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(renderAthleteBoardCard(ANA_CAROLINA)).toContain(`font-size:12px;letter-spacing:0.6px;color:${EMAIL_COLORS.textMuted}`);
  });
});

describe("Athlete Mailer Board — mandatory data and single source mapping", () => {
  it("includes the complete biography and manual reasons in the required order", () => {
    const html = renderAthleteBoardCard(cardAthlete);
    const titles = [
      "ABOUT HER",
      "SEASON STATS",
      "WATCH HER IN ACTION",
      "WHY SHE COULD FIT YOUR PROGRAM",
    ];
    const indexes = titles.map((title) => html.indexOf(title));
    expect(indexes.every((index) => index > 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(html).toContain("Second paragraph on leadership.");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Creative &lt;setter&gt; &amp; leader");
    expect(html).not.toContain("<setter>");
  });

  it("uses distinct paragraphs and preserves within-paragraph line breaks", () => {
    const html = renderAthleteBoardCard(cardAthlete);
    expect(html).toMatch(
      /First paragraph[\s\S]*?Another line\.[\s\S]*?<\/p>\s*<p[\s\S]*?Second paragraph/,
    );
    expect(html).toContain("Another line.");
    expect(html).toContain("<br>Another line.");
  });

  it("shows approved quick facts without graduation rows or duplicate chips", () => {
    const html = renderAthleteBoardCard(cardAthlete);
    const labels = ["POSITION", "HEIGHT", "GPA", "CURRENT SCHOOL", "STATUS", "AVAILABLE", "INTENDED MAJOR", "FROM"];
    const indices = labels.map((label) => html.indexOf(`>${label}</td>`));
    expect(indices.every((index) => index > 0)).toBe(true);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    for (const label of labels) expect(html.split(`>${label}</td>`)).toHaveLength(2);
    expect(html).not.toMatch(/High School Graduation|College Start Date/);
    expect(html).not.toContain("AVAILABLE: <strong");
    expect(html).not.toContain("GPA <strong");
    expect(html).toContain(">3.85</td>");
    expect(html).toContain(">TRANSFER</span>");
    expect(html).not.toContain("N/A");
  });

  it("uses the agency's reasons exclusively when provided; derived reasons only as fallback", () => {
    expect(buildFitReasons(cardAthlete)).toEqual([
      "Creative <setter> & leader",
      "Strong court vision",
    ]);
    const fallback = buildFitReasons({ ...cardAthlete, teamContribution: " " });
    expect(fallback).toContain("Fallback reason only");
    expect(fallback).not.toContain("Creative <setter> & leader");
  });

  it("never displays the transfer badge for Graduate Transfer", () => {
    const html = renderAthleteBoardCard({ ...cardAthlete, athleteStatus: "Graduate Transfer" });
    expect(html).not.toContain(">TRANSFER</span>");
    expect(html).toContain("Graduate Transfer");
  });

  it("is reused verbatim in personal single and multi previews/sends", () => {
    const rendered = renderAthleteBoardCard(cardAthlete);
    const single = renderRecruitEmail(athlete);
    const multi = renderMultiAthleteRecruitEmail({ athletes: [athlete] });
    expect(single.html).toContain(rendered);
    expect(multi.html).toContain(rendered);
  });

  it("includes both sections per athlete in personal and legacy plain-text bodies", () => {
    const single = renderRecruitEmail(athlete);
    const multi = renderMultiAthleteRecruitEmail({ athletes: [athlete] });
    const legacySingle = generateRecruitEmailPlainText({ athlete: cardAthlete });
    const legacyMulti = generateMultiAthletePlainText({ athletes: [cardAthlete] });
    for (const text of [single.text, multi.text, legacySingle, legacyMulti]) {
      expect(text).toContain("ABOUT HER");
      expect(text).toContain("First paragraph & hard work");
      expect(text).toContain("WHY SHE COULD FIT YOUR PROGRAM");
      expect(text).toContain("Creative <setter> & leader");
    }
  });

  it("blocks empty bio and team contribution independently and names affected athletes", () => {
    const bad = [
      { ...athlete, aboutHer: " " },
      { ...athlete, athleteId: "id-other", athleteName: "Ana Costa", teamContribution: "" },
    ];
    const missing = getMissingAthleteEmailFields(bad);
    expect(missing).toEqual([
      { athleteId: athlete.athleteId, athleteName: athlete.athleteName, fields: ["ABOUT HER"] },
      {
        athleteId: "id-other",
        athleteName: "Ana Costa",
        fields: ["WHY SHE COULD FIT YOUR PROGRAM"],
      },
    ]);
    expect(() => assertAthleteEmailFields(bad, [athlete.athleteId!, "id-other"])).toThrow(
      /Mariana Ribeiro.*ABOUT HER.*Ana Costa.*WHY SHE COULD FIT YOUR PROGRAM/,
    );
    expect(() => assertAthleteEmailFields([athlete], [athlete.athleteId!, "missing-id"])).toThrow(
      /missing-id/,
    );
    expect(() => assertAthleteEmailFields([athlete], [athlete.athleteId!])).not.toThrow();
  });
});


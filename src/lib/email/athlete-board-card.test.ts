import { describe, expect, it } from "vitest";
import { renderAthleteBoardCard, buildFitReasons } from "./athlete-board-card";
import { getMissingAthleteEmailFields, assertAthleteEmailFields } from "./athlete-email-quality";
import { renderRecruitEmail, renderMultiAthleteRecruitEmail, type RecruitEmailData } from "./recruit-email-template";
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
  aboutHer: "First paragraph & hard work <script>alert(1)</script>.\nAnother line.\n\nSecond paragraph on leadership.",
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

describe("Athlete Mailer Board — mandatory data and single source mapping", () => {
  it("includes the complete biography and manual reasons in the required order", () => {
    const html = renderAthleteBoardCard(cardAthlete);
    const titles = ["ABOUT HER", "SEASON STATS", "WATCH HER IN ACTION", "WHY SHE COULD FIT YOUR PROGRAM"];
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
    expect(html).toMatch(/First paragraph[\s\S]*?Another line\.[\s\S]*?<\/p>\s*<p[\s\S]*?Second paragraph/);
    expect(html).toContain("Another line.");
    expect(html).toContain("<br>Another line.");
  });

  it("shows every quick fact once without repeated chips or header facts", () => {
    const html = renderAthleteBoardCard(cardAthlete);
    for (const label of ["GPA", "Current School", "Status", "Available", "Intended Major", "High School Graduation", "College Start Date"]) {
      expect(html.match(new RegExp(`>${label}<`, "g"))).toHaveLength(1);
    }
    expect(html).not.toContain("AVAILABLE: <strong");
    expect(html).not.toContain("GPA <strong");
    expect(html).not.toContain('>Position<');
    expect(html).not.toContain('>Height<');
    expect(html).not.toContain('>From<');
    expect(html).toContain(">3.9</td>");
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
      { athleteId: "id-other", athleteName: "Ana Costa", fields: ["WHY SHE COULD FIT YOUR PROGRAM"] },
    ]);
    expect(() => assertAthleteEmailFields(bad, [athlete.athleteId!, "id-other"])).toThrow(
      /Mariana Ribeiro.*ABOUT HER.*Ana Costa.*WHY SHE COULD FIT YOUR PROGRAM/,
    );
    expect(() => assertAthleteEmailFields([athlete], [athlete.athleteId!, "missing-id"])).toThrow(/missing-id/);
    expect(() => assertAthleteEmailFields([athlete], [athlete.athleteId!])).not.toThrow();
  });
});

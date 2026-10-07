import { describe, expect, it } from "vitest";

import {
  buildAthleteSpecsLine,
  buildInterestedMailtoUrl,
  buildNotAFitUrl,
  generateMultiAthletePlainText,
  generateRecruitEmailPlainText,
  isTransferEligible,
  renderAthleteCard,
  renderCatalogRecruitEmail,
  renderMultiAthleteRecruitEmail,
  renderSingleAthleteRecruitEmail,
  type RecruitEmailAthlete,
} from "./recruit-email";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail as renderMultiLegacy,
  type RecruitEmailData,
} from "./recruit-email-template";
import { renderCatalogEmail } from "./recruit-email-catalog-template";
import { escapeHtml } from "./email-brand";

describe("5-Second Scan Email Redesign Suite (Athletes First, Text Last)", () => {
  const athlete1: RecruitEmailAthlete = {
    id: "ath-1",
    name: "Mariana Silva",
    slug: "mariana-silva",
    photoUrl: "https://example.com/photo1.jpg",
    positionEn: "Setter",
    heightCm: 185, // 6'1" (185 cm)
    graduationYear: 2027,
    gpa: 3.85,
    athleteStatus: "Sophomore",
    countryEn: "Brazil",
    countryFlag: "🇧🇷",
    highlightNote: "All-state MVP setter with high volleyball IQ.",
    highlightVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  };

  const athlete2: RecruitEmailAthlete = {
    id: "ath-2",
    name: "Beatriz Santos",
    slug: "beatriz-santos",
    photoUrl: "https://example.com/photo2.jpg",
    positionEn: "Outside Hitter",
    heightCm: 188,
    graduationYear: 2026,
    gpa: 4.0,
    athleteStatus: "Freshman",
    countryEn: "Brazil",
    countryFlag: "🇧🇷",
    highlightNote: "",
  };

  const transferAthlete: RecruitEmailAthlete = {
    id: "ath-3",
    name: "Camila Rocha",
    slug: "camila-rocha",
    photoUrl: "https://example.com/photo3.jpg",
    positionEn: "Middle Blocker",
    heightCm: 190,
    graduationYear: 2025,
    gpa: 3.7,
    athleteStatus: "Transfer",
    countryEn: "Colombia",
    countryFlag: "🇨🇴",
  };

  const gradTransferAthlete: RecruitEmailAthlete = {
    id: "ath-4",
    name: "Luciana Lima",
    slug: "luciana-lima",
    positionEn: "Libero",
    heightCm: 172,
    graduationYear: 2025,
    athleteStatus: "Graduate Transfer",
  };

  describe("1. Spec Line Builder & Badges", () => {
    it("formats specs in order: POSITION · HEIGHT · CLASS OF · GPA · COUNTRY", () => {
      const specs = buildAthleteSpecsLine(athlete1);
      expect(specs).toContain("Setter");
      expect(specs).toContain("6'1\" (185 cm)");
      expect(specs).toContain("Class of 2027");
      expect(specs).toContain("GPA 3.85");
      expect(specs).toContain("🇧🇷 Brazil");
    });

    it("applies TRANSFER badge only to eligible statuses (Freshman/Sophomore/Junior/Senior/Transfer)", () => {
      expect(isTransferEligible("Freshman")).toBe(true);
      expect(isTransferEligible("Sophomore")).toBe(true);
      expect(isTransferEligible("Junior")).toBe(true);
      expect(isTransferEligible("Senior")).toBe(true);
      expect(isTransferEligible("Transfer")).toBe(true);

      // Nunca para Graduate Transfer ou High School ou vazio
      expect(isTransferEligible("Graduate Transfer")).toBe(false);
      expect(isTransferEligible("High School")).toBe(false);
      expect(isTransferEligible(null)).toBe(false);
      expect(isTransferEligible(undefined)).toBe(false);
    });
  });

  describe("2. Quick Action Buttons & Mailto URLs", () => {
    it("builds mailto url for 'I'M INTERESTED' with prefilled subject and body", () => {
      const mailto = buildInterestedMailtoUrl(athlete1, "Smith");
      expect(mailto).toContain("mailto:fabiana@goteamgoagency.com");
      expect(mailto).toContain("%5BInterested%5D%20Mariana%20Silva");
      expect(mailto).toContain("Coach%20Smith");
    });

    it("builds discrete 'NOT A FIT' url with specific athleteId", () => {
      const notFitUrl = buildNotAFitUrl("ath-1", {
        appUrl: "https://portfolio.goteamgoagency.com",
        coachEmail: "coach@stanford.edu",
      });
      expect(notFitUrl).toContain("/feedback?sentiment=not_fit");
      expect(notFitUrl).toContain("athleteId=ath-1");
      expect(notFitUrl).toContain("coach=coach%40stanford.edu");
    });

    it("renders athlete card with photo, name, specs, TRANSFER badge and 4 buttons", () => {
      const cardHtml = renderAthleteCard(athlete1, {
        appUrl: "https://portfolio.goteamgoagency.com",
        coachName: "Smith",
      });

      expect(cardHtml).toContain("Mariana Silva");
      expect(cardHtml).toContain("Setter");
      expect(cardHtml).toContain("TRANSFER");
      expect(cardHtml).toContain("WATCH FILM");
      expect(cardHtml).toContain("I'M INTERESTED");
      expect(cardHtml).toContain("FULL PROFILE");
      expect(cardHtml).toContain("Not a fit");
      expect(cardHtml).toContain("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    });

    it("omits highlight note when empty", () => {
      const cardHtml = renderAthleteCard(athlete2);
      expect(cardHtml).toContain("Beatriz Santos");
      expect(cardHtml).not.toContain('class="highlight-note"');
    });
  });

  describe("3. Single Athlete Email Render", () => {
    it("renders lean header, 1-line greeting, athlete card first, and institutional block at the end", () => {
      const { subject, html } = renderSingleAthleteRecruitEmail({
        athlete: athlete1,
        coachName: "Dave",
        sportName: "volleyball",
      });

      // Subject has specs in front
      expect(subject).toContain("Setter · 6'1\" · Class of 2027: Mariana Silva (Brazil)");

      // Greeting of 1 line
      expect(html).toContain("Hi Coach Dave, verified volleyball prospect, Class of 2027:");

      // Athlete comes before "About Go Team Go Agency"
      const athleteIndex = html.indexOf("Mariana Silva");
      const aboutIndex = html.indexOf("About Go Team Go Agency");
      expect(athleteIndex).toBeGreaterThan(0);
      expect(aboutIndex).toBeGreaterThan(athleteIndex);

      // CTA Request More Athletes
      expect(html).toContain("REQUEST MORE ATHLETES");
      expect(html).toContain("REQUEST MORE ATHLETES");
    });
  });

  describe("4. Multi Athlete Email Render (Full Width Stack)", () => {
    it("renders full-width stacked rows (1 athlete per row) with specs in preheader", () => {
      const { subject, preheader, html } = renderMultiAthleteRecruitEmail({
        athletes: [athlete1, athlete2, transferAthlete],
        coachName: "Smith",
        sportName: "volleyball",
        gradYear: "2027",
      });

      expect(subject).toBe("3 verified volleyball prospects, Class of 2027");
      expect(preheader).toContain("Mariana Silva");
      expect(html).toContain("Hi Coach Smith, 3 verified volleyball prospects, Class of 2027:");
      expect(html).toContain("Mariana Silva");
      expect(html).toContain("Beatriz Santos");
      expect(html).toContain("Camila Rocha");
      expect(html).toContain("REQUEST MORE ATHLETES");
    });
  });

  describe("5. Catalog Mode Email Render", () => {
    it("renders quick actions at top and institutional block at bottom", () => {
      const { subject, html } = renderCatalogRecruitEmail({
        coachName: "Johnson",
      });

      expect(subject).toContain("Go Team Go — Active US College Recruiting Portfolio");
      expect(html).toContain(
        "Hi Coach Johnson, explore our full active volleyball recruiting portfolio:",
      );
      expect(html).toContain("VIEW FULL PORTFOLIO →");
      expect(html).toContain("REQUEST BY POSITION");

      // Quick action buttons come before institutional block
      const portfolioBtnIndex = html.indexOf("VIEW FULL PORTFOLIO");
      const aboutIndex = html.indexOf("About Go Team Go Agency");
      expect(portfolioBtnIndex).toBeLessThan(aboutIndex);
    });
  });

  describe("6. Plain Text Generators", () => {
    it("generates plain text with specs first and action links included", () => {
      const singleText = generateRecruitEmailPlainText({
        athlete: athlete1,
        coachName: "Smith",
      });

      expect(singleText).toContain("Hi Coach Smith,");
      expect(singleText).toContain("PROSPECT: Mariana Silva");
      expect(singleText).toContain(
        "SPECS: Setter · 6'1\" (185 cm) · Class of 2027 · GPA 3.85 · 🇧🇷 Brazil",
      );
      expect(singleText).toContain("WATCH FILM: https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(singleText).toContain("NOT A FIT:");
      expect(singleText).toContain("ABOUT GO TEAM GO AGENCY");

      const multiText = generateMultiAthletePlainText({
        athletes: [athlete1, athlete2],
        coachName: "Smith",
      });

      expect(multiText).toContain("Hi Coach Smith,");
      expect(multiText).toContain("2 VERIFIED PROSPECTS:");
      expect(multiText).toContain("1. Mariana Silva");
      expect(multiText).toContain("2. Beatriz Santos");
      expect(multiText).toContain("REQUEST MORE ATHLETES:");
    });
  });

  describe("7. Backward-Compatible Template Adapters (RecruitEmailData)", () => {
    it("supports legacy data structure mapping smoothly to new 5-second layout", () => {
      const legacyData: RecruitEmailData = {
        athleteId: "ath-legacy",
        athleteName: "Laura Souza",
        athleteSlug: "laura-souza",
        photoUrl: "https://example.com/laura.jpg",
        positionName: "Libero",
        sportName: "Volleyball",
        heightCm: 175,
        nationality: "Brazil",
        countryFlag: "🇧🇷",
        graduationYear: 2026,
        gpa: 3.9,
        athleteStatus: "Junior",
        highlightNote: "Elite defensive specialist.",
        recipientEmail: "coach@stanford.edu",
        coachName: "Dave",
      };

      const res = renderRecruitEmail(legacyData);
      expect(res.subject).toContain("Libero · 5'9\" · Class of 2026: Laura Souza (Brazil)");
      expect(res.html).toContain("Hi Coach Dave, verified Volleyball prospect, Class of 2026:");
      expect(res.html).toContain("Laura Souza");
      expect(res.html).toContain("WATCH FILM");
      expect(res.html).toContain("I'M INTERESTED");
      expect(res.text).toContain("Laura Souza");

      const multiRes = renderMultiLegacy({
        athletes: [legacyData],
        coachName: "Dave",
        recipientEmail: "coach@stanford.edu",
      });
      expect(multiRes.subject).toContain("1 verified Volleyball prospects, Class of 2026");
      expect(multiRes.html).toContain("Laura Souza");

      const catalogRes = renderCatalogEmail({
        coachName: "Dave",
        recipientEmail: "coach@stanford.edu",
      });
      expect(catalogRes.subject).toContain("Go Team Go");
      expect(catalogRes.html).toContain("VIEW FULL PORTFOLIO");
    });
  });

  describe("8. Security & Size Constraints", () => {
    it("escapes malicious HTML inputs", () => {
      const malicious: RecruitEmailAthlete = {
        id: "ath-xss",
        name: '<script>alert("xss")</script>',
        slug: "safe-slug",
        positionEn: "<b>Setter</b>",
        highlightNote: '<img src=x onerror="alert(1)">',
      };

      const card = renderAthleteCard(malicious);
      expect(card).not.toContain("<script>");
      expect(card).toContain("&lt;script&gt;");
      expect(card).not.toContain("<img src=x");
    });

    it("keeps HTML weight under 100KB even with 8 athletes", () => {
      const eightAthletes: RecruitEmailAthlete[] = Array.from({ length: 8 }, (_, i) => ({
        ...athlete1,
        id: `ath-${i + 1}`,
        name: `Athlete Prospect ${i + 1}`,
        slug: `athlete-prospect-${i + 1}`,
      }));

      const res = renderMultiAthleteRecruitEmail({
        athletes: eightAthletes,
        coachName: "Coach",
      });

      const size = Buffer.byteLength(res.html, "utf8");
      expect(size).toBeLessThan(102400); // 100KB
    });
  });
});

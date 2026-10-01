import { describe, expect, it } from "vitest";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail,
  renderEmailFooterHtml,
  type RecruitEmailData,
} from "./recruit-email-template";
import { renderCatalogEmail } from "./recruit-email-catalog-template";
import { escapeHtml } from "./email-layout";

describe("Recruiting Board Email Layout Suite (Poster 2027)", () => {
  const athlete1: RecruitEmailData = {
    athleteId: "ath-1",
    athleteName: "Mariana Silva",
    athleteSlug: "mariana-silva",
    photoUrl: "https://example.com/photo1.jpg",
    positionName: "Setter",
    sportName: "Volleyball",
    heightCm: 182,
    nationality: "Brazil",
    countryFlag: "🇧🇷",
    highSchoolGraduation: "2027",
    graduationYear: 2027,
    gpa: 3.8,
    athleteStatus: "Sophomore",
    highlightNote: "All-state MVP setter with high volleyball IQ.",
    budget: "$15,000/yr",
    recipientEmail: "coach@stanford.edu",
    coachId: "coach-123",
  };

  const athlete2: RecruitEmailData = {
    athleteId: "ath-2",
    athleteName: "Beatriz Santos",
    athleteSlug: "beatriz-santos",
    photoUrl: "https://example.com/photo2.jpg",
    positionName: "Outside Hitter",
    sportName: "Volleyball",
    heightCm: 188,
    nationality: "BR",
    highSchoolGraduation: "2027",
    graduationYear: 2027,
    gpa: 4.0,
    athleteStatus: "Freshman",
    highlightNote: "Explosive terminal attacker with 10'2\" approach jump.",
    budget: null, // Test omission of budget
    recipientEmail: "coach@stanford.edu",
    coachId: "coach-123",
  };

  function createDummyAthletes(count: number): RecruitEmailData[] {
    return Array.from({ length: count }, (_, i) => ({
      athleteId: `ath-${i + 1}`,
      athleteName: `Prospect Athlete ${i + 1}`,
      athleteSlug: `prospect-athlete-${i + 1}`,
      photoUrl: `https://example.com/photo${i + 1}.jpg`,
      positionName: i % 2 === 0 ? "Outside Hitter" : "Middle Blocker",
      sportName: "Volleyball",
      heightCm: 180 + (i % 10),
      nationality: "BR",
      highSchoolGraduation: "2027",
      gpa: 3.5 + (i % 5) * 0.1,
      athleteStatus: "Junior",
      highlightNote: `Dynamic performance profile #${i + 1}`,
      budget: i % 2 === 0 ? "$10,000/yr" : null,
      recipientEmail: "coach@stanford.edu",
    }));
  }

  it("renders multi-athlete email with 1, 2, 4, 5, and 8 athletes cleanly", () => {
    for (const count of [1, 2, 4, 5, 8]) {
      const list = createDummyAthletes(count);
      const res = renderMultiAthleteRecruitEmail({
        athletes: list,
        coachName: "Smith",
        institutionName: "Stanford Athletics",
        recipientEmail: "coach@stanford.edu",
      });

      expect(res.subject).toContain(`${count} Verified International Prospects`);
      expect(res.html).toContain("RECRUITING BOARD");
      expect(res.html).toContain("FEATURED ATHLETES");
      expect(res.html).toContain("REQUEST MORE ATHLETES");

      for (let i = 0; i < count; i++) {
        expect(res.html).toContain(`PROSPECT ATHLETE ${i + 1}`);
      }
    }
  });

  it("renders single athlete email ('ATHLETE SPOTLIGHT') with full branding", () => {
    const res = renderRecruitEmail(athlete1);

    expect(res.subject).toContain("[Go Team Go Prospect] Mariana Silva — Setter (2027)");
    expect(res.html).toContain("ATHLETE SPOTLIGHT");
    expect(res.html).toContain("OFFICIAL SCOUTING REPORT");
    expect(res.html).toContain("MARIANA SILVA");
    expect(res.html).toContain("SETTER");
    expect(res.html).toContain("Financial: $15,000/yr");
    expect(res.html).toContain("/feedback?email=coach%40stanford.edu");
    expect(res.html).toContain("/unsubscribe?email=coach%40stanford.edu");
    expect(res.text).toContain("Mariana Silva");
    expect(res.text).toContain("Setter");
  });

  it("omits the financial line when budget is empty or null (per user approval)", () => {
    const res = renderRecruitEmail(athlete2);

    expect(res.html).toContain("BEATRIZ SANTOS");
    expect(res.html).not.toContain("Financial:");
  });

  it("handles missing optional fields gracefully without breaking layout", () => {
    const sparseAthlete: RecruitEmailData = {
      athleteName: "Minimal Athlete",
      athleteSlug: "minimal-athlete",
      photoUrl: null,
      gpa: null,
      budget: null,
      highlightNote: null,
      nationality: null,
      heightCm: null,
      highSchoolGraduation: null,
      graduationYear: null,
      positionName: null,
      recipientEmail: "coach@college.edu",
    };

    const res = renderRecruitEmail(sparseAthlete);

    expect(res.html).toContain("MINIMAL ATHLETE");
    expect(res.html).toContain("GPA: Verified on Profile");
    expect(res.html).toContain("Class of 2027");
    expect(res.html).not.toContain("Financial:");
  });

  it("sanitizes dynamic fields against XSS via escapeHtml", () => {
    const maliciousName = '<script>alert("xss")</script> & "Dangerous"';
    const escaped = escapeHtml(maliciousName);

    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
    expect(escaped).toContain("&amp;");
    expect(escaped).toContain("&quot;Dangerous&quot;");

    const res = renderRecruitEmail({
      athleteName: maliciousName,
      athleteSlug: "safe-slug",
      positionName: "<b>Hitter</b>",
      highlightNote: '<img src=x onerror="alert(1)">',
      recipientEmail: "coach@test.edu",
    });

    expect(res.html).not.toContain("<script>");
    expect(res.html).not.toContain("<img src=x");
  });

  it("includes mandatory /unsubscribe and /feedback links in all 3 templates", () => {
    // 1. Multi
    const multi = renderMultiAthleteRecruitEmail({
      athletes: [athlete1, athlete2],
      recipientEmail: "recruiting@vanderbilt.edu",
      coachId: "coach-999",
    });
    expect(multi.html).toContain("/unsubscribe?email=recruiting%40vanderbilt.edu");
    expect(multi.html).toContain("/feedback?email=recruiting%40vanderbilt.edu");
    expect(multi.text).toContain("/unsubscribe?email=recruiting%40vanderbilt.edu");

    // 2. Single
    const single = renderRecruitEmail({
      ...athlete1,
      recipientEmail: "recruiting@vanderbilt.edu",
      coachId: "coach-999",
    });
    expect(single.html).toContain("/unsubscribe?email=recruiting%40vanderbilt.edu");
    expect(single.html).toContain("/feedback?email=recruiting%40vanderbilt.edu");
    expect(single.text).toContain("/unsubscribe?email=recruiting%40vanderbilt.edu");

    // 3. Catalog
    const catalog = renderCatalogEmail({
      recipientEmail: "recruiting@vanderbilt.edu",
      coachId: "coach-999",
    });
    expect(catalog.html).toContain("/unsubscribe?email=recruiting%40vanderbilt.edu");
    expect(catalog.html).toContain("/feedback?email=recruiting%40vanderbilt.edu");
    expect(catalog.text).toContain("/unsubscribe?email=recruiting%40vanderbilt.edu");
  });

  it("strictly avoids emoji flags, inline SVGs, and base64 images in output HTML", () => {
    const res = renderMultiAthleteRecruitEmail({
      athletes: [athlete1, athlete2],
      recipientEmail: "coach@usc.edu",
    });

    // Sem SVGs inline (incompatíveis com Gmail/Outlook)
    expect(res.html).not.toContain("<svg");
    // Sem data URLs em base64 (causa corte pelo Gmail)
    expect(res.html).not.toContain("data:image/");
    // Sem emojis de bandeiras brasileiras no card (usam PNG oficial)
    expect(res.html).not.toContain("🇧🇷");
    // Contém assets PNG locais
    expect(res.html).toContain("/email/flags/bra.png");
    expect(res.html).toContain("/email/icons/");
  });

  it("maintains total email HTML size under 100 KB even with 8 athletes", () => {
    const eightAthletes = createDummyAthletes(8);
    const res = renderMultiAthleteRecruitEmail({
      athletes: eightAthletes,
      recipientEmail: "coach@ucla.edu",
    });

    const byteLength = Buffer.byteLength(res.html, "utf8");
    // 100 KB = 102400 bytes
    expect(byteLength).toBeLessThan(102400);
  });

  it("formats coach greeting with first name and provides robust fallback", () => {
    // Com nome completo
    const withName = renderMultiAthleteRecruitEmail({
      athletes: [athlete1],
      coachName: "Coach Dave",
      recipientEmail: "dave@ncaa.org",
    });
    expect(withName.html).toContain("Hi Coach Dave,");

    // Sem nome (fallback)
    const withoutName = renderMultiAthleteRecruitEmail({
      athletes: [athlete1],
      coachName: null,
      recipientEmail: "coach@ncaa.org",
    });
    expect(withoutName.html).toContain("Hi Coach,");
  });

  it("renders email footer helper cleanly for legacy invocation", () => {
    const footer = renderEmailFooterHtml({
      recipientEmail: "coach@pennstate.edu",
      coachId: "c-1",
      athleteId: "a-1",
      position: "Setter",
    });

    expect(footer).toContain("Fabiana Andrade");
    expect(footer).toContain("/feedback?email=coach%40pennstate.edu");
    expect(footer).toContain("/unsubscribe?email=coach%40pennstate.edu");
    expect(footer).toContain("COLLEGE RECRUITING · ACADEMIC SUCCESS · GLOBAL OPPORTUNITIES");
  });
});

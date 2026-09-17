import { describe, expect, it } from "bun:test";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail,
  renderEmailFooterHtml,
  type RecruitEmailData,
} from "./recruit-email-template";

describe("Recruit Email Multi-Athlete & Feedback Template", () => {
  const sampleAthlete1: RecruitEmailData = {
    athleteId: "ath-1",
    athleteName: "Mariana Silva",
    athleteSlug: "mariana-silva",
    photoUrl: "https://example.com/photo1.jpg",
    positionName: "Setter",
    sportName: "Volleyball",
    heightCm: 182,
    nationality: "Brazil",
    countryFlag: "🇧🇷",
    highSchoolGraduation: "2024",
    graduationYear: 2025,
    gpa: 3.8,
    athleteStatus: "ready_to_transfer",
    highlightNote: "All-state MVP setter with great leadership.",
    recipientEmail: "coach@stanford.edu",
    coachId: "coach-123",
  };

  const sampleAthlete2: RecruitEmailData = {
    athleteId: "ath-2",
    athleteName: "Beatriz Santos",
    athleteSlug: "beatriz-santos",
    photoUrl: "https://example.com/photo2.jpg",
    positionName: "Outside Hitter",
    sportName: "Volleyball",
    heightCm: 188,
    nationality: "Brazil",
    countryFlag: "🇧🇷",
    highSchoolGraduation: "2025",
    graduationYear: 2026,
    gpa: 3.5,
    athleteStatus: "incoming_freshman",
    highlightNote: "Explosive attacker with 10'2\" approach jump.",
    recipientEmail: "coach@stanford.edu",
    coachId: "coach-123",
  };

  it("renders a unified multi-athlete email with all athletes stacked", () => {
    const result = renderMultiAthleteRecruitEmail({
      athletes: [sampleAthlete1, sampleAthlete2],
      coachName: "Coach Johnson",
      institutionName: "Stanford Athletics",
      recipientEmail: "coach@stanford.edu",
    });

    expect(result.subject).toContain("2 Verified International Prospects");
    expect(result.subject).toContain("Stanford Athletics");
    expect(result.html).toContain("Mariana Silva");
    expect(result.html).toContain("Beatriz Santos");
    expect(result.html).toContain("SETTER");
    expect(result.html).toContain("OUTSIDE HITTER");
    expect(result.html).toContain("GO TEAM GO • MULTI-ATHLETE SHOWCASE");
    expect(result.html).toContain("/feedback?email=coach%40stanford.edu");
    expect(result.html).toContain("/unsubscribe?email=coach%40stanford.edu");
  });

  it("renders single athlete email with feedback link", () => {
    const result = renderRecruitEmail(sampleAthlete1);

    expect(result.subject).toContain("Mariana Silva");
    expect(result.html).toContain("Mariana Silva");
    expect(result.html).toContain("/feedback?email=coach%40stanford.edu");
    expect(result.html).toContain("coachId=coach-123");
    expect(result.html).toContain("/unsubscribe?email=coach%40stanford.edu");
  });

  it("renders reusable email footer with calibrated preference link", () => {
    const footerHtml = renderEmailFooterHtml({
      recipientEmail: "recruiting@college.edu",
      coachId: "coach-123",
      athleteId: "ath-456",
      position: "Libero",
    });

    expect(footerHtml).toContain("/feedback?email=recruiting%40college.edu");
    expect(footerHtml).toContain("coachId=coach-123");
    expect(footerHtml).toContain("athleteId=ath-456");
    expect(footerHtml).toContain("position=Libero");
    expect(footerHtml).toContain("/unsubscribe?email=recruiting%40college.edu");
    expect(footerHtml).toContain("manage email preferences");
    expect(footerHtml).toContain("Not interested in this position or roster full?");
  });
});

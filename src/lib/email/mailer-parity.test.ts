import { describe, expect, it } from "vitest";
import { createCampaignSnapshot, renderQueuedEmail } from "./mailer-snapshot";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail,
  type RecruitEmailData,
} from "./recruit-email-template";
import { renderCatalogEmail } from "./recruit-email-catalog-template";
import { assertEmailIntegrity } from "./email-blocks";

describe("Mailer Parity Test: Snapshot Rendering vs Legacy Rendering (T1)", () => {
  const sampleAthlete: RecruitEmailData = {
    athleteId: "b0000000-0000-4000-8000-000000000001",
    athleteName: "Ana Carolina Silva",
    athleteSlug: "ana-carolina-silva",
    sportName: "Volleyball",
    positionName: "Outside Hitter",
    nationality: "Brazil",
    countryFlag: "🇧🇷",
    heightCm: 185,
    highSchoolGraduation: "Class of 2026",
    graduationYear: 2026,
    gpa: 3.8,
    highlightVideoUrl: "https://youtube.com/watch?v=sample1",
    recipientEmail: "coach@university.edu",
    coachName: "Coach Bob",
    coachLastName: "Bob",
    institutionName: "Grand University",
  };

  it("produces identical or structurally equivalent output in single athlete mode", () => {
    // 1. Legacy render
    const legacy = renderRecruitEmail(sampleAthlete);

    // 2. Snapshot render
    const snapshot = createCampaignSnapshot({
      mode: "single_athlete",
      athlete: sampleAthlete,
    });
    const fromSnapshot = renderQueuedEmail(snapshot, {
      recipientEmail: sampleAthlete.recipientEmail ?? "",
      recipientName: sampleAthlete.coachName ?? "",
      coachLastName: sampleAthlete.coachLastName,
      institutionName: sampleAthlete.institutionName,
      coachId: sampleAthlete.coachId ?? undefined,
    });

    // Integrity checks
    expect(fromSnapshot.expectedAthleteIds).toEqual([sampleAthlete.athleteId]);
    expect(fromSnapshot.renderedAthleteIds).toEqual([sampleAthlete.athleteId]);
    expect(fromSnapshot.subject).toBe(legacy.subject);
    expect(fromSnapshot.html).toContain("QUICK FACTS");
    expect(fromSnapshot.html).toContain("VIEW FULL PROFILE");
    expect(fromSnapshot.html).toContain(sampleAthlete.athleteName);

    // Fail-closed verification
    assertEmailIntegrity({
      mode: "single_athlete",
      expectedAthleteIds: fromSnapshot.expectedAthleteIds,
      renderedAthleteIds: fromSnapshot.renderedAthleteIds,
      missingAthleteIds: [],
      html: fromSnapshot.html,
      text: fromSnapshot.text,
    });
  });

  it("produces identical or structurally equivalent output in multi athlete mode", () => {
    const athlete2: RecruitEmailData = {
      ...sampleAthlete,
      athleteId: "b0000000-0000-4000-8000-000000000002",
      athleteName: "Beatriz Oliveira",
      athleteSlug: "beatriz-oliveira",
      positionName: "Setter",
    };

    const athletes = [sampleAthlete, athlete2];

    const legacy = renderMultiAthleteRecruitEmail({
      athletes,
      coachName: "Coach Bob",
      coachLastName: "Bob",
      institutionName: "Grand University",
    });

    const snapshot = createCampaignSnapshot({
      mode: "multi_athlete",
      athletes,
    });

    const fromSnapshot = renderQueuedEmail(snapshot, {
      recipientEmail: "coach@university.edu",
      recipientName: "Coach Bob",
      coachLastName: "Bob",
      institutionName: "Grand University",
    });

    expect(fromSnapshot.renderedAthleteIds).toEqual([sampleAthlete.athleteId, athlete2.athleteId]);
    expect(fromSnapshot.subject).toBe(legacy.subject);
    expect(fromSnapshot.html).toContain(sampleAthlete.athleteName);
    expect(fromSnapshot.html).toContain(athlete2.athleteName);
    expect(fromSnapshot.html).toContain("QUICK FACTS");
    expect(fromSnapshot.html).toContain("VIEW FULL PROFILE");

    assertEmailIntegrity({
      mode: "multi_athlete",
      expectedAthleteIds: fromSnapshot.expectedAthleteIds,
      renderedAthleteIds: fromSnapshot.renderedAthleteIds,
      missingAthleteIds: [],
      html: fromSnapshot.html,
      text: fromSnapshot.text,
    });
  });

  it("renders catalog mode successfully with brand links and headline", () => {
    const legacy = renderCatalogEmail({
      coachName: "Coach Bob",
      coachLastName: "Bob",
      institutionName: "Grand University",
      customHeadline: "GO TEAM GO SCOUTING SHOWCASE",
    });

    const snapshot = createCampaignSnapshot({
      mode: "catalog",
      customHeadline: "GO TEAM GO SCOUTING SHOWCASE",
    });

    const fromSnapshot = renderQueuedEmail(snapshot, {
      recipientEmail: "coach@university.edu",
      recipientName: "Coach Bob",
      coachLastName: "Bob",
      institutionName: "Grand University",
    });

    expect(fromSnapshot.subject).toBe(legacy.subject);
    expect(fromSnapshot.html).toContain("GO TEAM GO SCOUTING SHOWCASE");
    expect(fromSnapshot.html).toContain("Hi Coach");
  });
});

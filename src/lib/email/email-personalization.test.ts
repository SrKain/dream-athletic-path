import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildCoachGreeting, resolveEmailSubject } from "./email-personalization";
import { buildInterestedMailtoUrl, buildNotAFitUrl } from "./recruit-email";
import { buildBoardCardUrls } from "./athlete-board-card";
import { buildDefaultEmailBlocks, buildNotRightFitUrl, personalizeEmailGreeting } from "./personal-email-renderer";
import { renderRecruitEmail, renderMultiAthleteRecruitEmail } from "./recruit-email-template";
import { renderCatalogEmail } from "./recruit-email-catalog-template";

const athlete = { id: "alice", name: "Alice Cardoso", slug: "alice-cardoso", positionEn: "Middle Blocker", graduationYear: 2026 };
const data = { athleteId: athlete.id, athleteName: athlete.name, athleteSlug: athlete.slug, positionName: athlete.positionEn, graduationYear: athlete.graduationYear };
const interested = "Hi Fabi,\n\nI’m interested in recruiting Alice Cardoso (Middle Blocker) and would love to learn more about the next steps.\n\nPlease let me know how we can move forward.\n\nThank you!";
const notFit = "Hi Fabi,\n\nAlice Cardoso (Middle Blocker) is not the right fit for us at this time. Please keep us posted on future players.\n\nThank you!";

function body(url: string) { return new URL(url).searchParams.get("body"); }

describe("Mailer personalization", () => {
  it("uses exactly the approved interest response without a year or coach signature", () => {
    assert.equal(body(buildInterestedMailtoUrl(athlete, "Fabiana Andrade")), interested);
  });
  it("uses exactly the approved Not a Fit response in card and footer links", () => {
    assert.equal(body(buildBoardCardUrls(athlete).notFit), notFit);
    assert.equal(body(buildNotRightFitUrl({ athleteId: athlete.id, athleteName: athlete.name, position: athlete.positionEn })), notFit);
  });
  it("generates separate replies for each athlete and handles special characters", () => {
    const second = { ...athlete, id: "two", name: "Ana O’Neil & Silva", positionEn: "Setter" };
    const urls = buildBoardCardUrls(second);
    assert.ok(body(urls.recruit)?.includes("Ana O’Neil & Silva (Setter)"));
    assert.ok(body(urls.notFit)?.includes("Ana O’Neil & Silva (Setter)"));
    assert.ok(!body(urls.notFit)?.includes("Alice Cardoso"));
  });
  it("omits parentheses when the athlete has no position", () => {
    assert.ok(body(buildInterestedMailtoUrl({ ...athlete, positionEn: null }))?.includes("Alice Cardoso and would"));
    assert.ok(body(buildNotAFitUrl("alice", { athleteName: athlete.name }))?.includes("Alice Cardoso is not"));
  });
  it("uses only the stored surname and keeps compound surnames", () => {
    assert.equal(buildCoachGreeting("Van Dijk"), "Hi Coach Van Dijk,");
    assert.equal(buildCoachGreeting("  Smith  "), "Hi Coach Smith,");
    assert.equal(buildCoachGreeting(null), "Hi Coach,");
  });
  it("replaces an old greeting without losing the introduction or mutating its input", () => {
    const blocks = buildDefaultEmailBlocks(["alice"]);
    const original = JSON.stringify(blocks);
    const personalized = personalizeEmailGreeting(blocks, "Smith");
    assert.equal(JSON.stringify(blocks), original);
    assert.equal(personalized[0].type, "text");
    assert.ok(personalized[0].type === "text" && personalized[0].content.startsWith("Hi Coach Smith,\n\nI hope"));
  });
  it("adds one greeting when custom blocks begin with an introduction or a card", () => {
    for (const blocks of [[{ type: "text", content: "A prospect for your team." }], [{ type: "athlete", athleteId: "alice" }]]) {
      const output = renderRecruitEmail({ ...data, coachLastName: "Smith", blocks: blocks as ReturnType<typeof buildDefaultEmailBlocks> });
      assert.equal(output.text.split("Hi Coach Smith,").length - 1, 1);
      assert.ok(output.text.startsWith("Hi Coach Smith,"));
    }
  });
  it("uses the chosen subject and personalized greeting in HTML and text for all modes", () => {
    const outputs = [
      renderRecruitEmail({ ...data, customSubject: "Next season & opportunities", coachLastName: "Smith" }),
      renderMultiAthleteRecruitEmail({ athletes: [data, { ...data, athleteId: "two", athleteName: "Ana" }], customSubject: "Next season & opportunities", coachLastName: "Smith" }),
      renderCatalogEmail({ customSubject: "Next season & opportunities", coachLastName: "Smith" }),
    ];
    for (const output of outputs) {
      assert.equal(output.subject, "Next season & opportunities");
      assert.ok(output.html.includes("<title>Next season &amp; opportunities</title>"));
      assert.ok(output.html.includes("Hi Coach Smith,"));
      assert.ok(output.text.startsWith("Hi Coach Smith,"));
    }
  });
  it("renders a distinct greeting per coach rather than guessing from full names", () => {
    for (const lastName of ["Smith", "Van Dijk", null]) {
      const output = renderRecruitEmail({ ...data, coachName: "Fabiana Andrade", coachLastName: lastName });
      assert.ok(output.text.startsWith(buildCoachGreeting(lastName)));
      assert.ok(!output.text.startsWith("Hi Coach Fabiana"));
      assert.ok(!output.text.startsWith("Hi Coach Andrade"));
    }
  });
  it("retains automatic subjects when no custom subject is supplied", () => {
    const defaultSubject = renderRecruitEmail(data).subject;
    assert.equal(renderRecruitEmail({ ...data, customSubject: "   " }).subject, defaultSubject);
    assert.equal(renderCatalogEmail({ customHeadline: "Existing catalog headline" }).subject, "Existing catalog headline");
    assert.equal(renderCatalogEmail({ customHeadline: "Old", customSubject: "New" }).subject, "New");
  });
  it("rejects header injection and oversized subjects, preserving international text", () => {
    for (const subject of ["Hello\r\nBcc: other@example.edu", "Hello\nWorld", "x".repeat(201), 123]) {
      assert.throws(() => resolveEmailSubject(subject, "Fallback"));
    }
    assert.equal(resolveEmailSubject("  Próxima temporada 🏐  ", "Fallback"), "Próxima temporada 🏐");
    assert.doesNotThrow(() => resolveEmailSubject("x".repeat(200), "Fallback"));
  });
});

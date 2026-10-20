import { describe, expect, it } from "vitest";
import { ANA_EMAIL_DATA } from "./__fixtures__/ana-carolina";
import { composeEmailBlocks, assertEmailIntegrity } from "./email-blocks";
import { buildDefaultEmailBlocks } from "./personal-email-renderer";
import { renderRecruitEmail, renderMultiAthleteRecruitEmail } from "./recruit-email-template";
import { renderCatalogEmail } from "./recruit-email-catalog-template";

const A = ANA_EMAIL_DATA.athleteId!;
const B = "b91c8400-e29b-41d4-a716-446655440002";
const second = {
  ...ANA_EMAIL_DATA,
  athleteId: B,
  athleteName: "Prospect B",
  athleteSlug: "prospect-b",
};
const coach = {
  coachName: "Coach Davis",
  coachLastName: "Davis",
  recipientEmail: "davis@college.edu",
};
const opening = "TEXTO-ABERTURA-123";
const closing = "TEXTO-FECHAMENTO-456";

describe("TASK-105 — Mailer personalized text contract", () => {
  it.each(["single", "multi"] as const)(
    "renders custom inputs in correct slots and HTML/text (%s)",
    (mode) => {
      const athleteIds = mode === "single" ? [A] : [A, B];
      const blocks = composeEmailBlocks({
        opening: `  ${opening}  `,
        closing: `  ${closing}  `,
        athleteIds,
      });
      const result =
        mode === "single"
          ? renderRecruitEmail({
              ...ANA_EMAIL_DATA,
              ...coach,
              customSubject: "ASSUNTO-789",
              blocks,
            })
          : renderMultiAthleteRecruitEmail({
              athletes: [ANA_EMAIL_DATA, second],
              ...coach,
              customSubject: "ASSUNTO-789",
              blocks,
            });
      expect(result.subject).toBe("ASSUNTO-789");
      for (const output of [result.html, result.text]) {
        expect(output).toContain(opening);
        expect(output).toContain(closing);
        expect(output.indexOf("Hi Coach Davis,")).toBeLessThan(output.indexOf(opening));
        expect(output.indexOf(opening)).toBeLessThan(output.indexOf("QUICK FACTS"));
        expect(output.lastIndexOf("VIEW FULL PROFILE")).toBeLessThan(output.indexOf(closing));
        expect(output.indexOf(closing)).toBeLessThan(output.indexOf("Fabiana Andrade"));
        expect(output).not.toContain("I hope you're doing well.");
        expect(output).not.toContain("Let me know what you think.");
      }
      expect(result.renderedAthleteIds).toEqual(athleteIds);
      expect(() =>
        assertEmailIntegrity({
          mode: mode === "single" ? "single_athlete" : "multi_athlete",
          expectedAthleteIds: athleteIds,
          renderedAthleteIds: result.renderedAthleteIds,
          missingAthleteIds: result.missingAthleteIds,
          expectedOpeningText: opening,
          expectedClosingText: closing,
          html: result.html,
          text: result.text,
        }),
      ).not.toThrow();
    },
  );

  it("uses the default opening/closing only for empty fields", () => {
    const blocks = composeEmailBlocks({ athleteIds: [A], opening: "  ", closing: "" });
    expect(blocks[1]).toMatchObject({
      type: "text",
      content: expect.stringContaining("I hope you're doing well."),
    });
    expect(blocks.at(-1)).toEqual({ type: "text", content: "Let me know what you think." });
    const rendered = renderRecruitEmail({ ...ANA_EMAIL_DATA, ...coach, blocks });
    expect(rendered.html).toContain("I hope you're doing well.");
    expect(rendered.text).toContain("Let me know what you think.");
    expect(rendered.subject).toBeTruthy();
  });

  it("ignores stale client text while preserving only valid card order", () => {
    const stale = buildDefaultEmailBlocks(["outdated-a"]);
    const blocks = composeEmailBlocks({
      athleteIds: [B, A],
      cardOrder: [A, "outdated-a", B, A],
      opening,
      closing,
    });
    expect(blocks.filter((b) => b.type === "athlete")).toEqual([
      { type: "athlete", athleteId: A },
      { type: "athlete", athleteId: B },
    ]);
    expect(
      blocks
        .filter((b) => b.type === "text")
        .map((b) => b.content)
        .join("|"),
    ).not.toContain(stale[0].type === "text" ? stale[0].content : "unknown");
    const withForm = renderRecruitEmail({
      ...ANA_EMAIL_DATA,
      ...coach,
      blocks: stale,
      customHook: opening,
      customIntroduction: closing,
    });
    expect(withForm.html).toContain(opening);
    expect(withForm.text).toContain(closing);
    expect(withForm.renderedAthleteIds).toEqual([A]);
  });

  it("keeps custom inputs when switching A → B and single ↔ multi ↔ catalog", () => {
    const renderA = renderRecruitEmail({
      ...ANA_EMAIL_DATA,
      ...coach,
      blocks: composeEmailBlocks({ athleteIds: [A], opening, closing }),
    });
    const renderB = renderRecruitEmail({
      ...second,
      ...coach,
      blocks: composeEmailBlocks({ athleteIds: [B], opening, closing }),
    });
    const renderMulti = renderMultiAthleteRecruitEmail({
      athletes: [ANA_EMAIL_DATA, second],
      ...coach,
      blocks: composeEmailBlocks({ athleteIds: [A, B], opening, closing }),
    });
    const catalog = renderCatalogEmail({
      ...coach,
      customHeadline: "HEADLINE-1",
      customHook: "HOOK-2",
      customMessage: "MESSAGE-3",
    });
    for (const rendered of [renderA, renderB, renderMulti]) {
      expect(rendered.html).toContain(opening);
      expect(rendered.text).toContain(closing);
    }
    expect(renderB.renderedAthleteIds).toEqual([B]);
    expect(renderMulti.renderedAthleteIds).toEqual([A, B]);
    expect(catalog.html).toContain("HOOK-2");
    expect(catalog.html).not.toContain(closing);
  });

  it("catalog headline/hook/message are visible and unrelated introduction cannot leak", () => {
    const inherited = { customIntroduction: "SHOULD-NOT-LEAK" };
    const data = {
      ...coach,
      ...inherited,
      customHeadline: "HEADLINE-1",
      customHook: "HOOK-2",
      customMessage: "MESSAGE-3",
    };
    const result = renderCatalogEmail(data);
    for (const output of [result.html, result.text]) {
      expect(output).toContain("HEADLINE-1");
      expect(output).toContain("HOOK-2");
      expect(output).toContain("MESSAGE-3");
      expect(output).not.toContain(inherited.customIntroduction);
      expect(output.indexOf("HEADLINE-1")).toBeLessThan(output.indexOf("HOOK-2"));
    }
    expect(result.subject).toBe("HEADLINE-1");
    expect(renderCatalogEmail({ ...data, customSubject: "ASSUNTO-789" }).subject).toBe(
      "ASSUNTO-789",
    );
    expect(() =>
      assertEmailIntegrity({
        mode: "catalog",
        html: result.html,
        text: result.text,
        expectedHeadline: "HEADLINE-1",
        expectedHook: "HOOK-2",
        expectedMessage: "MESSAGE-3",
      }),
    ).not.toThrow();
  });

  it("escapes untrusted HTML, quotes and ampersands without removing mandatory footer", () => {
    const unsafe = `<script>alert("x" & 'y')</script>`;
    const result = renderRecruitEmail({
      ...ANA_EMAIL_DATA,
      ...coach,
      customHook: unsafe,
      customIntroduction: closing,
      blocks: composeEmailBlocks({ athleteIds: [A], opening: unsafe, closing }),
    });
    expect(result.html).toContain(
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;",
    );
    expect(result.html).not.toContain("<script>");
    expect(result.text).toContain(unsafe);
    expect(result.html).toContain("Unsubscribe");
    expect(result.html).toContain("Not the right fit");
    expect(result.html).toContain("Go to catalog");
    expect(result.html).toContain("Fabiana Andrade");
  });

  it("fails closed whenever effective text is absent in HTML or plain text", () => {
    for (const tampered of [
      { html: "<div>OTHER</div>", text: opening },
      { html: `<div>${opening}</div>`, text: "OTHER" },
    ]) {
      expect(() =>
        assertEmailIntegrity({
          mode: "catalog",
          ...tampered,
          expectedHook: opening,
        }),
      ).toThrow(/Missing effective hook/);
    }
  });
});

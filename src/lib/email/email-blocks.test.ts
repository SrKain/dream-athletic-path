import { describe, expect, it } from "vitest";
import { ANA_EMAIL_DATA } from "./__fixtures__/ana-carolina";
import { assertEmailIntegrity, reconcileEmailBlocks } from "./email-blocks";
import { buildDefaultEmailBlocks, type EmailBlock } from "./personal-email-renderer";
import { renderRecruitEmail } from "./recruit-email-template";

describe("reconcileEmailBlocks", () => {
  const athleteA = "athlete-uuid-a";
  const athleteB = "athlete-uuid-b";
  const athleteC = "athlete-uuid-c";

  it("substitui atleta A por B no mesmo lugar mantendo textos editados em modo individual", () => {
    const customGreeting = "Hello Coach Davis, I hope everything is going well.";
    const customClosing = "Please reach out to me directly if you need transcripts.";

    const initialBlocks: EmailBlock[] = [
      { type: "text", content: customGreeting },
      { type: "athlete", athleteId: athleteA },
      { type: "text", content: customClosing },
    ];

    const reconciled = reconcileEmailBlocks(initialBlocks, [athleteB]);

    expect(reconciled).toEqual([
      { type: "text", content: customGreeting },
      { type: "athlete", athleteId: athleteB },
      { type: "text", content: customClosing },
    ]);
  });

  it("sincroniza selecao no modo multi (remove A, mantem B, adiciona C)", () => {
    const initialBlocks: EmailBlock[] = [
      { type: "text", content: "Hi Coach," },
      { type: "athlete", athleteId: athleteA },
      { type: "text", content: "Middle note between prospects" },
      { type: "athlete", athleteId: athleteB },
      { type: "text", content: "Best regards," },
    ];

    const reconciled = reconcileEmailBlocks(initialBlocks, [athleteB, athleteC]);

    expect(reconciled).toEqual([
      { type: "text", content: "Hi Coach," },
      { type: "text", content: "Middle note between prospects" },
      { type: "athlete", athleteId: athleteB },
      { type: "athlete", athleteId: athleteC },
      { type: "text", content: "Best regards," },
    ]);
  });

  it("reconstroi blocos padrao se entrada for nula ou vazia", () => {
    const reconciled = reconcileEmailBlocks(null, [athleteA]);
    expect(reconciled.length).toBeGreaterThan(1);
    expect(reconciled.some((b) => b.type === "athlete" && b.athleteId === athleteA)).toBe(true);
  });

  it("remove cards se selecao estiver vazia mantendo textos", () => {
    const blocks: EmailBlock[] = [
      { type: "text", content: "Intro" },
      { type: "athlete", athleteId: athleteA },
      { type: "text", content: "Closing" },
    ];
    const reconciled = reconcileEmailBlocks(blocks, []);
    expect(reconciled).toEqual([
      { type: "text", content: "Intro" },
      { type: "text", content: "Closing" },
    ]);
  });

  it("deduplica IDs repetidos na selecao", () => {
    const reconciled = reconcileEmailBlocks([], [athleteA, athleteA, athleteA]);
    const athleteBlocks = reconciled.filter((b) => b.type === "athlete");
    expect(athleteBlocks).toHaveLength(1);
    expect(athleteBlocks[0]).toEqual({ type: "athlete", athleteId: athleteA });
  });
});

describe("assertEmailIntegrity", () => {
  const athleteBId = ANA_EMAIL_DATA.athleteId!;
  const athleteAId = "outdated-athlete-a";

  it("falha quando os blocos passados estao defasados (reproducao do bug C1)", () => {
    // Cenário do bug: dados de B, mas blocos contendo apenas A
    const outdatedBlocks = buildDefaultEmailBlocks([athleteAId]);
    const renderResult = renderRecruitEmail({
      ...ANA_EMAIL_DATA,
      blocks: outdatedBlocks,
    });

    // O renderer legado nao conseguiu renderizar A porque so recebeu os dados de B
    expect(renderResult.renderedAthleteIds).toEqual([]);
    expect(renderResult.missingAthleteIds).toContain(athleteAId);

    // assertEmailIntegrity DEVE lançar erro claro bloqueando o envio
    expect(() =>
      assertEmailIntegrity({
        mode: "single_athlete",
        expectedAthleteIds: [athleteBId],
        renderedAthleteIds: renderResult.renderedAthleteIds,
        missingAthleteIds: renderResult.missingAthleteIds,
        html: renderResult.html,
        text: renderResult.text,
      }),
    ).toThrowError(/Email integrity failure/);
  });

  it("tem sucesso quando os blocos sao reconciliados para a atleta correta", () => {
    const outdatedBlocks = buildDefaultEmailBlocks([athleteAId]);
    const reconciledBlocks = reconcileEmailBlocks(outdatedBlocks, [athleteBId]);

    const renderResult = renderRecruitEmail({
      ...ANA_EMAIL_DATA,
      blocks: reconciledBlocks,
    });

    expect(renderResult.renderedAthleteIds).toEqual([athleteBId]);
    expect(renderResult.missingAthleteIds).toEqual([]);
    expect(renderResult.html).toContain("QUICK FACTS");
    expect(renderResult.html).toContain("VIEW FULL PROFILE");
    expect(renderResult.text).toContain("VIEW FULL PROFILE");

    expect(() =>
      assertEmailIntegrity({
        mode: "single_athlete",
        expectedAthleteIds: [athleteBId],
        renderedAthleteIds: renderResult.renderedAthleteIds,
        missingAthleteIds: renderResult.missingAthleteIds,
        html: renderResult.html,
        text: renderResult.text,
      }),
    ).not.toThrow();
  });

  it("permite modo catalog sem atletas contanto que html e texto nao sejam vazios", () => {
    expect(() =>
      assertEmailIntegrity({
        mode: "catalog",
        html: "<html><body>Hello Coaches</body></html>",
        text: "Hello Coaches",
      }),
    ).not.toThrow();
  });

  it("lanca erro se HTML ou texto estiverem vazios", () => {
    expect(() =>
      assertEmailIntegrity({
        mode: "single_athlete",
        expectedAthleteIds: ["id1"],
        renderedAthleteIds: ["id1"],
        html: "",
        text: "valid text",
      }),
    ).toThrowError(/Generated HTML is empty/);
  });

  it("falha no modo multi se alguma atleta esperada nao for renderizada", () => {
    expect(() =>
      assertEmailIntegrity({
        mode: "multi_athlete",
        expectedAthleteIds: ["ath-1", "ath-2"],
        renderedAthleteIds: ["ath-1"],
        missingAthleteIds: ["ath-2"],
        html: "<div>QUICK FACTS VIEW FULL PROFILE</div>",
        text: "VIEW FULL PROFILE",
      }),
    ).toThrowError(/Missing athlete data for \[ath-2\]/);
  });

  it("falha se o HTML nao contiver marcadores obrigatorios do card", () => {
    expect(() =>
      assertEmailIntegrity({
        mode: "single_athlete",
        expectedAthleteIds: ["ath-1"],
        renderedAthleteIds: ["ath-1"],
        html: "<div>Hi Coach, let me know what you think.</div>",
        text: "VIEW FULL PROFILE",
      }),
    ).toThrowError(/missing mandatory athlete card markers/);
  });
});

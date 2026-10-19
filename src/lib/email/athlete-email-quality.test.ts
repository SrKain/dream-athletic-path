import { describe, expect, it } from "vitest";
import {
  ATHLETE_EMAIL_STATE_MESSAGES,
  getAthleteEmailPanelState,
  getMissingAthleteEmailFields,
} from "./athlete-email-quality";

const ready = {
  mode: "single" as const,
  loading: false,
  error: null,
  requestedCount: 1,
  receivedCount: 1,
  missingFieldCount: 0,
};

describe("Mailer athlete validation panel", () => {
  it("shows loading without blaming required fields or stale errors", () => {
    const state = getAthleteEmailPanelState({
      ...ready,
      loading: true,
      error: "Previous request failed",
      missingFieldCount: 2,
    });
    expect(state).toBe("loading");
    expect(ATHLETE_EMAIL_STATE_MESSAGES[state]).toBe("Carregando e validando fichas completas...");
    expect(ATHLETE_EMAIL_STATE_MESSAGES[state]).not.toContain("obrigatórios");
  });

  it("distinguishes a technical error from missing mandatory data", () => {
    const state = getAthleteEmailPanelState({
      ...ready,
      error: "column achievements.created_at does not exist",
      missingFieldCount: 2,
    });
    expect(state).toBe("error");
    expect(ATHLETE_EMAIL_STATE_MESSAGES[state]).toBe(
      "Não foi possível carregar os dados das atletas",
    );
    expect(ATHLETE_EMAIL_STATE_MESSAGES[state]).not.toMatch(/created_at|obrigatórios/);
  });

  it("reports names and only missing fields once the complete response is available", () => {
    const missing = getMissingAthleteEmailFields([
      { athleteId: "athlete-1", athleteName: "Ana", aboutHer: "Biography", teamContribution: " " },
    ]);
    expect(missing).toEqual([
      { athleteId: "athlete-1", athleteName: "Ana", fields: ["WHY SHE COULD FIT YOUR PROGRAM"] },
    ]);
    const state = getAthleteEmailPanelState({ ...ready, missingFieldCount: missing.length });
    expect(state).toBe("missing");
    expect(ATHLETE_EMAIL_STATE_MESSAGES[state]).toContain("são obrigatórios");
  });

  it("keeps retry blocked while loading, then allows sending after successful recovery", () => {
    expect(getAthleteEmailPanelState({ ...ready, error: "Database unavailable" })).toBe("error");
    expect(getAthleteEmailPanelState({ ...ready, loading: true })).toBe("loading");
    expect(getAthleteEmailPanelState(ready)).toBe("ready");
  });

  it("blocks an incomplete response as an error instead of waiting forever or enabling send", () => {
    expect(getAthleteEmailPanelState({ ...ready, receivedCount: 0 })).toBe("error");
  });

  it("requests a selection when empty and preserves the catalog exemption", () => {
    expect(getAthleteEmailPanelState({ ...ready, requestedCount: 0, receivedCount: 0 })).toBe(
      "empty",
    );
    expect(
      getAthleteEmailPanelState({ ...ready, mode: "catalog", loading: true, requestedCount: 0 }),
    ).toBe("ready");
  });
});

import type { RecruitEmailData } from "./recruit-email-template";

export type AthleteEmailPanelState = "ready" | "empty" | "loading" | "error" | "missing";

export function getAthleteEmailPanelState(input: {
  mode: "single" | "multi" | "catalog";
  loading: boolean;
  error: string | null;
  requestedCount: number;
  receivedCount: number;
  missingFieldCount: number;
}): AthleteEmailPanelState {
  if (input.mode === "catalog") return "ready";
  if (input.requestedCount === 0) return "empty";
  if (input.loading) return "loading";
  if (input.error || input.receivedCount !== input.requestedCount) return "error";
  if (input.missingFieldCount > 0) return "missing";
  return "ready";
}

export const ATHLETE_EMAIL_STATE_MESSAGES: Record<AthleteEmailPanelState, string> = {
  ready: "",
  empty: "Selecione ao menos uma atleta.",
  loading: "Carregando e validando fichas completas...",
  error: "Não foi possível carregar os dados das atletas",
  missing: "Envio bloqueado: ABOUT HER e WHY SHE COULD FIT YOUR PROGRAM são obrigatórios.",
};

export type MissingAthleteField = "ABOUT HER" | "WHY SHE COULD FIT YOUR PROGRAM";
export interface AthleteEmailMissingFields {
  athleteId: string;
  athleteName: string;
  fields: MissingAthleteField[];
}

export function getMissingAthleteEmailFields(
  athletes: Array<
    Pick<RecruitEmailData, "athleteId" | "athleteName" | "aboutHer" | "teamContribution">
  >,
): AthleteEmailMissingFields[] {
  return athletes.flatMap((athlete) => {
    const fields: MissingAthleteField[] = [];
    if (!athlete.aboutHer?.trim()) fields.push("ABOUT HER");
    if (!athlete.teamContribution?.trim()) fields.push("WHY SHE COULD FIT YOUR PROGRAM");
    return fields.length
      ? [{ athleteId: athlete.athleteId || "", athleteName: athlete.athleteName, fields }]
      : [];
  });
}

export function assertAthleteEmailFields(
  athletes: RecruitEmailData[],
  requestedIds: string[],
): void {
  const present = new Set(athletes.map((athlete) => athlete.athleteId));
  const absent = requestedIds.filter((id) => !present.has(id));
  const missing = getMissingAthleteEmailFields(athletes);
  if (absent.length || missing.length) {
    const details = [
      ...absent.map((id) => `Athlete ${id}: not found`),
      ...missing.map(
        (entry) => `${entry.athleteName} (${entry.athleteId}): ${entry.fields.join(", ")}`,
      ),
    ];
    throw new Error(
      `Mailer blocked — missing required athlete data: ${details.join("; ")}. Edit each athlete in /admin/athletes/:id before sending.`,
    );
  }
}

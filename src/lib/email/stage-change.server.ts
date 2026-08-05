import { getAdminClient } from "@/lib/supabase/clients.server";
import { sendEmail } from "./email.server";
import { replacePlaceholders, getFirstName, type PlaceholderData } from "./placeholders";

export interface StageCelebrationInput {
  athleteId: string;
  previousStageId: string | null;
  newStageId: string;
}

export type StageCelebrationResult =
  | { success: true; skipped: true; reason: string }
  | { success: true; skipped: false; scheduled: false }
  | {
      success: true;
      skipped: false;
      scheduled: true;
      scheduledFor?: string;
      windowDescription?: string;
    }
  | { success: false; error: string };

const CELEBRATION_TEMPLATE = "stage_advancement_celebration";

/**
 * Envia (ou agenda) o e-mail de celebração quando o atleta conclui uma etapa.
 * Server-only: usa service role e as chaves do Resend.
 */
export async function sendStageCelebration(
  input: StageCelebrationInput,
): Promise<StageCelebrationResult> {
  const admin = getAdminClient();

  const { data: athlete, error: athleteError } = await admin
    .from("athletes")
    .select("id, full_name, email, agency_id")
    .eq("id", input.athleteId)
    .single();

  if (athleteError || !athlete) {
    console.error("[celebration] atleta não encontrado:", athleteError?.message);
    return { success: false, error: "athlete_not_found" };
  }
  if (!athlete.email) {
    return { success: true, skipped: true, reason: "no_email" };
  }

  const { data: newStage, error: stageError } = await admin
    .from("pipeline_stages")
    .select("id, name_en, name_pt, celebration_message_en")
    .eq("id", input.newStageId)
    .single();

  if (stageError || !newStage) {
    console.error("[celebration] etapa não encontrada:", stageError?.message);
    return { success: false, error: "stage_not_found" };
  }

  const message = (newStage.celebration_message_en ?? "").trim();
  if (!message) {
    return { success: true, skipped: true, reason: "no_message_configured" };
  }

  // Anti-duplicidade: já enviamos/agendamos esta etapa para este atleta?
  const { data: alreadySent } = await admin
    .from("email_log")
    .select("id")
    .eq("template", CELEBRATION_TEMPLATE)
    .in("status", ["sent", "scheduled"])
    .eq("payload->>athleteId", input.athleteId)
    .eq("payload->>stageId", input.newStageId)
    .limit(1);

  if (alreadySent && alreadySent.length > 0) {
    return { success: true, skipped: true, reason: "already_sent" };
  }

  let previousStageName = "Etapa anterior";
  if (input.previousStageId) {
    const { data: prevStage } = await admin
      .from("pipeline_stages")
      .select("name_en, name_pt")
      .eq("id", input.previousStageId)
      .single();
    if (prevStage) previousStageName = prevStage.name_pt ?? prevStage.name_en;
  }

  const { data: agency } = await admin
    .from("agencies")
    .select("name")
    .eq("id", athlete.agency_id)
    .single();

  const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const portalLink = `${baseUrl}/portal?celebrate=true`;
  const newStageName = newStage.name_pt ?? newStage.name_en;

  const placeholderData: PlaceholderData = {
    athlete_name: athlete.full_name,
    athlete_first_name: getFirstName(athlete.full_name),
    previous_stage: previousStageName,
    new_stage: newStageName,
    agency_name: agency?.name ?? "Go Team Go",
    portal_link: portalLink,
  };

  const result = await sendEmail({
    template: CELEBRATION_TEMPLATE,
    to: athlete.email,
    data: {
      name: athlete.full_name,
      previousStage: previousStageName,
      newStage: newStageName,
      customMessage: replacePlaceholders(message, placeholderData),
      portalLink,
      athleteId: athlete.id,
      stageId: newStage.id,
    },
    respectSendingWindow: true,
  });

  if (!result.sent) {
    return { success: false, error: result.reason };
  }

  if (result.scheduled) {
    return {
      success: true,
      skipped: false,
      scheduled: true,
      scheduledFor: result.scheduledFor,
      windowDescription: result.windowDescription,
    };
  }

  return { success: true, skipped: false, scheduled: false };
}

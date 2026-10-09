import { createServerFn } from "@tanstack/react-start";
import { requireAgency } from "@/lib/supabase/auth-middleware";
import type { SendMailerInput, CoachInterestSignalInput, AdminCoachPreferenceInput } from "./recruit-email.server";
import type { SuppressionType } from "@/types/db";

// 1. Envio do Mailer (Requer agência)
export const sendMailerServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: SendMailerInput) => data)
  .handler(async ({ data }) => {
    const { sendMailerEmails } = await import("./recruit-email.server");
    return sendMailerEmails(data);
  });

// 2. Consulta de E-mails Suprimidos (Requer agência)
export const getSuppressedEmailsServerFn = createServerFn({ method: "GET" })
  .middleware([requireAgency])
  .handler(async () => {
    const { getSuppressedEmailSet } = await import("./recruit-email.server");
    const set = await getSuppressedEmailSet();
    return Array.from(set);
  });

// 3. Descadastro Público (Aberto para o link do e-mail com suporte a 2 níveis)
export const unsubscribeServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { email: string; reason?: string; suppressionType?: SuppressionType }) => data,
  )
  .handler(async ({ data }) => {
    const { unsubscribeEmailAddress } = await import("./recruit-email.server");
    return unsubscribeEmailAddress(data.email, data.reason, data.suppressionType);
  });

// 4. Submissão Pública de Sinal de Interesse / Feedback do Treinador (Validade de 6 meses)
export const submitInterestSignalServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: CoachInterestSignalInput) => data)
  .handler(async ({ data }) => {
    const { recordCoachInterestSignal } = await import("./recruit-email.server");
    return recordCoachInterestSignal(data);
  });

// 5. Consulta de Sinais de Interesse Ativos (Requer agência)
export const getActiveInterestSignalsServerFn = createServerFn({ method: "GET" })
  .middleware([requireAgency])
  .handler(async () => {
    const { getActiveCoachInterestSignals } = await import("./recruit-email.server");
    return getActiveCoachInterestSignals();
  });

// Gestão manual de preferências dos coaches (somente agência autenticada)
export const getCoachPreferencesServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { coachEmail: string; coachId?: string }) => data)
  .handler(async ({ data }) => {
    const { getCoachPreferenceRecords } = await import("./recruit-email.server");
    return getCoachPreferenceRecords(data.coachEmail, data.coachId);
  });

export const addCoachPreferenceSignalServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: AdminCoachPreferenceInput) => data)
  .handler(async ({ data }) => {
    const validReasons = [
      "position_not_needed",
      "fully_recruited",
      "other_positions_only",
      "specific_athlete_dislike",
    ];
    if (!validReasons.includes(data.reason)) {
      return { success: false, message: "Invalid coach preference reason." };
    }
    const { recordCoachInterestSignal } = await import("./recruit-email.server");
    return recordCoachInterestSignal(data);
  });

export const setCoachSuppressionServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { email: string; suppressionType: SuppressionType }) => data)
  .handler(async ({ data }) => {
    const { setCoachSuppression } = await import("./recruit-email.server");
    return setCoachSuppression(data.email, data.suppressionType);
  });

export const closeCoachPreferenceSignalServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { id: string; coachEmail: string; coachId: string }) => data)
  .handler(async ({ data }) => {
    const { closeCoachPreferenceSignal } = await import("./recruit-email.server");
    return closeCoachPreferenceSignal(data.id, data.coachEmail, data.coachId);
  });

export const removeManualCoachSuppressionServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const { removeManualCoachSuppression } = await import("./recruit-email.server");
    return removeManualCoachSuppression(data.email);
  });

// 6. Histórico de Envios (Requer agência)
export const getMailerHistoryServerFn = createServerFn({ method: "GET" })
  .middleware([requireAgency])
  .handler(async () => {
    const { getAdminClient } = await import("@/lib/supabase/clients.server");
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("recruit_email_logs")
      .select(
        "id, athlete_id, coach_id, subject, status, error_message, sent_at, email_type, recipient_email, recipient_name, university_name, provider_id",
      )
      .order("sent_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[recruit-email] Error fetching history logs:", error.message);
      return [];
    }
    return data || [];
  });

// 7. Métricas Analíticas do Mailer (Requer agência)
export const getMailerMetricsServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator(
    (data?: {
      days?: number;
      range?: "7d" | "30d" | "90d" | "all" | "custom";
      campaignId?: string;
      athleteId?: string;
      division?: string;
      startDate?: string;
      endDate?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { getMailerMetricsReport } = await import("./mailer-metrics.server");
    return getMailerMetricsReport(data);
  });

// 8. Linha do Tempo de Eventos de E-mail (Requer agência)
export const getEmailEventTimelineServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator(
    (data: { providerEmailId?: string | null; recipientEmail?: string | null }) => data,
  )
  .handler(async ({ data }) => {
    const { getEmailEventTimeline } = await import("./mailer-metrics.server");
    return getEmailEventTimeline(data.providerEmailId, data.recipientEmail);
  });

// 9. Retrocompatibilidade para chamadas legadas
export const sendRecruitEmailServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { athleteId: string; coachIds: string[] }) => data)
  .handler(async ({ data }) => {
    const { sendRecruitEmailToCoaches } = await import("./recruit-email.server");
    return sendRecruitEmailToCoaches(data);
  });

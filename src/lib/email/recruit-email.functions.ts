import { createServerFn } from "@tanstack/react-start";
import { requireAgency } from "@/lib/supabase/auth-middleware";
import type { SendMailerInput, CoachInterestSignalInput } from "./recruit-email.server";
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

// 6. Histórico de Envios (Requer agência)
export const getMailerHistoryServerFn = createServerFn({ method: "GET" })
  .middleware([requireAgency])
  .handler(async () => {
    const { getAdminClient } = await import("@/lib/supabase/clients.server");
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("recruit_email_logs")
      .select(
        "id, athlete_id, coach_id, subject, status, error_message, sent_at, email_type, recipient_email, recipient_name, university_name",
      )
      .order("sent_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[recruit-email] Error fetching history logs:", error.message);
      return [];
    }
    return data || [];
  });

// 7. Retrocompatibilidade para chamadas legadas
export const sendRecruitEmailServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { athleteId: string; coachIds: string[] }) => data)
  .handler(async ({ data }) => {
    const { sendRecruitEmailToCoaches } = await import("./recruit-email.server");
    return sendRecruitEmailToCoaches(data);
  });

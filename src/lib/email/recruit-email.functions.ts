import { createServerFn } from "@tanstack/react-start";
import { requireAgency } from "@/lib/supabase/auth-middleware";
import type { SendMailerInput } from "./recruit-email.server";

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

// 3. Descadastro Público (Aberto para o link do e-mail)
export const unsubscribeServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; reason?: string }) => data)
  .handler(async ({ data }) => {
    const { unsubscribeEmailAddress } = await import("./recruit-email.server");
    return unsubscribeEmailAddress(data.email, data.reason);
  });

// 4. Histórico de Envios (Requer agência)
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

// 5. Retrocompatibilidade para chamadas legadas
export const sendRecruitEmailServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { athleteId: string; coachIds: string[] }) => data)
  .handler(async ({ data }) => {
    const { sendRecruitEmailToCoaches } = await import("./recruit-email.server");
    return sendRecruitEmailToCoaches(data);
  });

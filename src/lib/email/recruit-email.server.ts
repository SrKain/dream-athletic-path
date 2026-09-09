import { Resend } from "resend";
import { getAdminClient } from "@/lib/supabase/clients.server";
import { renderRecruitEmail, type RecruitEmailData } from "./recruit-email-template";
import { renderCatalogEmail } from "./recruit-email-catalog-template";

export interface MailerRecipient {
  coachId?: string;
  email: string;
  name: string;
  universityName?: string;
}

export interface SendMailerInput {
  mode: "single_athlete" | "multi_athlete" | "catalog";
  athleteIds?: string[];
  recipients: MailerRecipient[];
  catalogOptions?: {
    customHeadline?: string;
    customMessage?: string;
  };
}

export interface SendMailerResult {
  success: boolean;
  totalSent: number;
  totalFailed: number;
  totalSuppressed: number;
  message?: string;
  errors?: string[];
}

// Obter Set de e-mails suprimidos (em caixa baixa)
export async function getSuppressedEmailSet(): Promise<Set<string>> {
  const admin = getAdminClient();
  const { data, error } = await admin.from("email_suppressions").select("email");
  if (error || !data) {
    console.error("[recruit-email] Error reading email_suppressions:", error?.message);
    return new Set();
  }
  return new Set(data.map((item) => item.email.toLowerCase().trim()));
}

// Registrar descadastro
export async function unsubscribeEmailAddress(
  email: string,
  reason = "user_unsubscribed",
): Promise<{ success: boolean; message?: string }> {
  const cleanEmail = (email || "").toLowerCase().trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { success: false, message: "Invalid email address format." };
  }

  const admin = getAdminClient();
  const { error } = await admin
    .from("email_suppressions")
    .upsert({ email: cleanEmail, reason }, { onConflict: "email" });

  if (error) {
    console.error("[recruit-email] Error unsubscribing email:", error.message);
    return { success: false, message: error.message };
  }

  return { success: true };
}

// Carregar dados de um atleta formatados para o template
async function loadAthleteEmailData(athleteId: string): Promise<RecruitEmailData | null> {
  const admin = getAdminClient();

  const { data: athlete, error: athleteError } = await admin
    .from("athletes")
    .select("id, slug, full_name, photo_url, height_cm, nationality, sport_id, position_id")
    .eq("id", athleteId)
    .single();

  if (athleteError || !athlete) {
    console.error("[recruit-email] Athlete not found:", athleteError?.message);
    return null;
  }

  const [profileRes, sportRes, posRes, countryRes] = await Promise.all([
    admin.from("athlete_profiles").select("*").eq("athlete_id", athleteId).maybeSingle(),
    athlete.sport_id
      ? admin.from("sports").select("name_en").eq("id", athlete.sport_id).maybeSingle()
      : Promise.resolve({ data: null }),
    athlete.position_id
      ? admin.from("positions").select("name_en").eq("id", athlete.position_id).maybeSingle()
      : Promise.resolve({ data: null }),
    athlete.nationality
      ? admin
          .from("countries")
          .select("name_en, flag_emoji")
          .eq("code", athlete.nationality)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const profile = profileRes.data;
  const sportName = sportRes.data?.name_en ?? null;
  const positionName = posRes.data?.name_en ?? null;
  const countryFlag = countryRes.data?.flag_emoji ?? null;
  const nationalityName = countryRes.data?.name_en ?? athlete.nationality ?? null;

  return {
    athleteName: athlete.full_name,
    athleteSlug: athlete.slug,
    photoUrl: athlete.photo_url,
    positionName,
    sportName,
    heightCm: athlete.height_cm,
    nationality: nationalityName,
    countryFlag,
    highSchoolGraduation: profile?.high_school_graduation,
    graduationYear: profile?.graduation_year,
    gpa: profile?.gpa,
    athleteStatus: profile?.athlete_status,
    highlightNote: profile?.highlight_note,
  };
}

export async function sendMailerEmails(input: SendMailerInput): Promise<SendMailerResult> {
  const { mode, athleteIds = [], recipients = [], catalogOptions } = input;

  if (recipients.length === 0) {
    return {
      success: false,
      totalSent: 0,
      totalFailed: 0,
      totalSuppressed: 0,
      message: "No recipients selected.",
    };
  }

  const admin = getAdminClient();
  const suppressedSet = await getSuppressedEmailSet();

  // Filtrar suprimidos
  const activeRecipients: MailerRecipient[] = [];
  const suppressedRecipients: MailerRecipient[] = [];

  for (const r of recipients) {
    const cleanEmail = (r.email || "").toLowerCase().trim();
    if (!cleanEmail) continue;
    if (suppressedSet.has(cleanEmail)) {
      suppressedRecipients.push(r);
    } else {
      activeRecipients.push(r);
    }
  }

  // Registrar imediatamente logs de supressão
  if (suppressedRecipients.length > 0) {
    const now = new Date().toISOString();
    const suppressedLogs = suppressedRecipients.flatMap((rec) => {
      if (mode === "catalog" || athleteIds.length === 0) {
        return [
          {
            athlete_id: null,
            coach_id: rec.coachId ?? null,
            subject: "Suppressed Email Recipient",
            status: "suppressed" as const,
            error_message: "Recipient is on the unsubscribe suppression list.",
            sent_at: now,
            email_type: "catalog_general",
            recipient_email: rec.email,
            recipient_name: rec.name,
            university_name: rec.universityName ?? null,
          },
        ];
      }
      return athleteIds.map((athId) => ({
        athlete_id: athId,
        coach_id: rec.coachId ?? null,
        subject: "Suppressed Email Recipient",
        status: "suppressed" as const,
        error_message: "Recipient is on the unsubscribe suppression list.",
        sent_at: now,
        email_type: "athlete_teaser",
        recipient_email: rec.email,
        recipient_name: rec.name,
        university_name: rec.universityName ?? null,
      }));
    });

    await admin
      .from("recruit_email_logs")
      .insert(suppressedLogs as unknown as Record<string, unknown>[]);
  }

  if (activeRecipients.length === 0) {
    return {
      success: false,
      totalSent: 0,
      totalFailed: 0,
      totalSuppressed: suppressedRecipients.length,
      message: "All selected recipients are on the unsubscribe suppression list.",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Go Team Go <contact@goteamgoagency.com>";

  if (!apiKey) {
    console.warn("[recruit-email] RESEND_API_KEY missing. Simulating failures for audit logs.");
    const now = new Date().toISOString();
    const failureLogs = activeRecipients.flatMap((rec) => {
      const isCatalog = mode === "catalog" || athleteIds.length === 0;
      if (isCatalog) {
        return [
          {
            athlete_id: null,
            coach_id: rec.coachId ?? null,
            subject: "Recruit Mailer Showcase",
            status: "failed" as const,
            error_message: "RESEND_API_KEY is not configured.",
            sent_at: now,
            email_type: "catalog_general",
            recipient_email: rec.email,
            recipient_name: rec.name,
            university_name: rec.universityName ?? null,
          },
        ];
      }
      return athleteIds.map((athId) => ({
        athlete_id: athId,
        coach_id: rec.coachId ?? null,
        subject: "Recruit Mailer Showcase",
        status: "failed" as const,
        error_message: "RESEND_API_KEY is not configured.",
        sent_at: now,
        email_type: "athlete_teaser",
        recipient_email: rec.email,
        recipient_name: rec.name,
        university_name: rec.universityName ?? null,
      }));
    });

    await admin
      .from("recruit_email_logs")
      .insert(failureLogs as unknown as Record<string, unknown>[]);

    return {
      success: false,
      totalSent: 0,
      totalFailed: failureLogs.length,
      totalSuppressed: suppressedRecipients.length,
      message: "RESEND_API_KEY environment variable is not configured.",
    };
  }

  const resend = new Resend(apiKey);
  let totalSent = 0;
  let totalFailed = 0;
  const errors: string[] = [];

  // Preparar os payloads de e-mail de acordo com o modo
  type PreparedMessage = {
    to: string;
    subject: string;
    html: string;
    athleteId: string | null;
    coachId: string | null;
    recipientEmail: string;
    recipientName: string;
    universityName: string | null;
    emailType: "athlete_teaser" | "catalog_general";
  };

  const messagesToSend: PreparedMessage[] = [];

  if (mode === "catalog") {
    for (const rec of activeRecipients) {
      const { subject, html } = renderCatalogEmail({
        coachName: rec.name,
        institutionName: rec.universityName,
        customHeadline: catalogOptions?.customHeadline,
        customMessage: catalogOptions?.customMessage,
        recipientEmail: rec.email,
      });

      messagesToSend.push({
        to: rec.email,
        subject,
        html,
        athleteId: null,
        coachId: rec.coachId ?? null,
        recipientEmail: rec.email,
        recipientName: rec.name,
        universityName: rec.universityName ?? null,
        emailType: "catalog_general",
      });
    }
  } else {
    // single_athlete ou multi_athlete
    for (const athId of athleteIds) {
      const emailData = await loadAthleteEmailData(athId);
      if (!emailData) continue;

      for (const rec of activeRecipients) {
        const { subject, html } = renderRecruitEmail({
          ...emailData,
          recipientEmail: rec.email,
        });

        messagesToSend.push({
          to: rec.email,
          subject,
          html,
          athleteId: athId,
          coachId: rec.coachId ?? null,
          recipientEmail: rec.email,
          recipientName: rec.name,
          universityName: rec.universityName ?? null,
          emailType: "athlete_teaser",
        });
      }
    }
  }

  // Disparo em lotes de até 100 itens via Resend Batch API
  const BATCH_SIZE = 100;
  for (let i = 0; i < messagesToSend.length; i += BATCH_SIZE) {
    const chunk = messagesToSend.slice(i, i + BATCH_SIZE);
    const batchPayload = chunk.map((item) => ({
      from,
      to: item.to,
      subject: item.subject,
      html: item.html,
    }));

    try {
      const batchResponse = await resend.batch.send(batchPayload);

      if (batchResponse.error) {
        throw new Error(batchResponse.error.message);
      }

      const responseItems = batchResponse.data?.data ?? [];
      const now = new Date().toISOString();

      const logsToInsert = chunk.map((item, index) => {
        const itemResult = responseItems[index];
        const isSuccess = !!itemResult && !("error" in itemResult && itemResult.error);
        if (isSuccess) {
          totalSent++;
          return {
            athlete_id: item.athleteId,
            coach_id: item.coachId,
            subject: item.subject,
            status: "sent" as const,
            error_message: null,
            sent_at: now,
            email_type: item.emailType,
            recipient_email: item.recipientEmail,
            recipient_name: item.recipientName,
            university_name: item.universityName,
          };
        } else {
          totalFailed++;
          const err =
            itemResult && "error" in itemResult && itemResult.error
              ? String(itemResult.error)
              : "Batch item send failed";
          return {
            athlete_id: item.athleteId,
            coach_id: item.coachId,
            subject: item.subject,
            status: "failed" as const,
            error_message: err,
            sent_at: now,
            email_type: item.emailType,
            recipient_email: item.recipientEmail,
            recipient_name: item.recipientName,
            university_name: item.universityName,
          };
        }
      });

      await admin
        .from("recruit_email_logs")
        .insert(logsToInsert as unknown as Record<string, unknown>[]);
    } catch (batchErr) {
      const errorMsg =
        batchErr instanceof Error ? batchErr.message : "Unknown error in Resend batch";
      console.error("[recruit-email] Batch send exception:", errorMsg);
      errors.push(errorMsg);
      totalFailed += chunk.length;

      const now = new Date().toISOString();
      const failureLogs = chunk.map((item) => ({
        athlete_id: item.athleteId,
        coach_id: item.coachId,
        subject: item.subject,
        status: "failed" as const,
        error_message: errorMsg,
        sent_at: now,
        email_type: item.emailType,
        recipient_email: item.recipientEmail,
        recipient_name: item.recipientName,
        university_name: item.universityName,
      }));
      await admin
        .from("recruit_email_logs")
        .insert(failureLogs as unknown as Record<string, unknown>[]);
    }
  }

  return {
    success: totalSent > 0,
    totalSent,
    totalFailed,
    totalSuppressed: suppressedRecipients.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// Retrocompatibilidade para o método anterior caso algum código ainda chame
export async function sendRecruitEmailToCoaches(input: {
  athleteId: string;
  coachIds: string[];
}): Promise<{
  success: boolean;
  totalSent: number;
  totalFailed: number;
  message?: string;
  errors?: string[];
}> {
  const admin = getAdminClient();
  const { data: coaches } = await admin
    .from("coaches")
    .select("id, name, email, institution")
    .in("id", input.coachIds);

  const recipients: MailerRecipient[] = (coaches || []).map((c) => ({
    coachId: c.id,
    name: c.name,
    email: c.email,
    universityName: c.institution || undefined,
  }));

  const res = await sendMailerEmails({
    mode: "single_athlete",
    athleteIds: [input.athleteId],
    recipients,
  });

  return {
    success: res.success,
    totalSent: res.totalSent,
    totalFailed: res.totalFailed,
    message: res.message,
    errors: res.errors,
  };
}

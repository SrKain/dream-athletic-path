import { getAdminClient } from "@/lib/supabase/clients.server";
import { getResendClient, getResendConfig } from "./resend-client.server";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail,
  type RecruitEmailData,
} from "./recruit-email-template";
import { renderCatalogEmail } from "./recruit-email-catalog-template";
import type { CoachInterestSignal, InterestSignalReason, SuppressionType } from "@/types/db";

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
  customOptions?: {
    greeting?: string;
    introduction?: string;
    hook?: string;
    headline?: string;
    message?: string;
  };
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

export interface CoachInterestSignalInput {
  coachId?: string | null;
  coachEmail: string;
  reason: InterestSignalReason;
  athleteId?: string | null;
  athleteName?: string | null;
  position?: string | null;
  notes?: string | null;
}

// Obter Set de e-mails suprimidos (em caixa baixa) considerando expiração
export async function getSuppressedEmailSet(): Promise<Set<string>> {
  const admin = getAdminClient();
  const { data, error } = await admin.from("email_suppressions").select("email, expires_at");

  if (error || !data) {
    console.error("[recruit-email] Error reading email_suppressions:", error?.message);
    return new Set();
  }

  const now = new Date();
  const activeSuppressed = data.filter((item) => {
    if (!item.expires_at) return true; // Permanente
    return new Date(item.expires_at) > now; // Temporário ainda ativo
  });

  return new Set(activeSuppressed.map((item) => item.email.toLowerCase().trim()));
}

// Registrar descadastro com suporte a 2 níveis (Pausa temporária de 6 meses vs Permanente)
export async function unsubscribeEmailAddress(
  email: string,
  reason = "user_unsubscribed",
  suppressionType: SuppressionType = "permanent",
): Promise<{ success: boolean; message?: string }> {
  const cleanEmail = (email || "").toLowerCase().trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { success: false, message: "Invalid email address format." };
  }

  const admin = getAdminClient();
  let expiresAt: string | null = null;

  if (suppressionType === "temporary_6m") {
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    expiresAt = sixMonthsLater.toISOString();
  }

  const { error } = await admin.from("email_suppressions").upsert(
    {
      email: cleanEmail,
      reason,
      suppression_type: suppressionType,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    },
    { onConflict: "email" },
  );

  if (error) {
    console.error("[recruit-email] Error unsubscribing email:", error.message);
    return { success: false, message: error.message };
  }

  return { success: true };
}

// Registrar sinal de interesse do coach (validade de 6 meses)
export async function recordCoachInterestSignal(
  input: CoachInterestSignalInput,
): Promise<{ success: boolean; message?: string }> {
  const cleanEmail = (input.coachEmail || "").toLowerCase().trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { success: false, message: "Invalid coach email format." };
  }

  const admin = getAdminClient();
  const now = new Date();
  const sixMonthsLater = new Date(now);
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

  const { error } = await admin.from("coach_interest_signals").insert({
    coach_id: input.coachId || null,
    coach_email: cleanEmail,
    reason: input.reason,
    athlete_id: input.athleteId || null,
    athlete_name: input.athleteName || null,
    position: input.position || null,
    notes: input.notes || null,
    created_at: now.toISOString(),
    expires_at: sixMonthsLater.toISOString(),
  });

  if (error) {
    console.error("[recruit-email] Error recording interest signal:", error.message);
    return { success: false, message: error.message };
  }

  return { success: true };
}

// Buscar todos os sinais de interesse de coaches ativos (não expirados)
export async function getActiveCoachInterestSignals(): Promise<CoachInterestSignal[]> {
  const admin = getAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("coach_interest_signals")
    .select("*")
    .gt("expires_at", now)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[recruit-email] Error fetching interest signals:", error?.message);
    return [];
  }

  return data as CoachInterestSignal[];
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

  const [profileRes, sportRes, posRes, countryRes, videoRes, achievementRes] = await Promise.all([
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
    admin
      .from("athlete_videos")
      .select("youtube_url")
      .eq("athlete_id", athleteId)
      .eq("kind", "highlight")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("achievements")
      .select("title_en")
      .eq("athlete_id", athleteId)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const sportName = sportRes.data?.name_en ?? null;
  const positionName = posRes.data?.name_en ?? null;
  const countryFlag = countryRes.data?.flag_emoji ?? null;
  const nationalityName = countryRes.data?.name_en ?? athlete.nationality ?? null;
  const highlightVideoUrl = videoRes.data?.youtube_url ?? profile?.highlight_video_url ?? null;
  const achievementTitle = achievementRes.data?.title_en ?? null;

  return {
    athleteId: athlete.id,
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
    achievementTitle,
    budget: profile?.budget,
    highlightVideoUrl,
  };
}

export async function sendMailerEmails(input: SendMailerInput): Promise<SendMailerResult> {
  const { mode, athleteIds = [], recipients = [], customOptions, catalogOptions } = input;

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
  const [suppressedSet, visualRes] = await Promise.all([
    getSuppressedEmailSet(),
    admin
      .from("agency_visual_settings")
      .select("logo_url, hero_background_url")
      .limit(1)
      .maybeSingle(),
  ]);

  const logoUrl = visualRes.data?.logo_url ?? null;
  const heroBackgroundUrl = visualRes.data?.hero_background_url ?? null;

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
    const suppressedLogs: Array<{
      athlete_id: string | null;
      coach_id: string | null;
      subject: string;
      status: "suppressed";
      error_message: string;
      sent_at: string;
      email_type: "catalog_general" | "athlete_teaser_multi" | "athlete_teaser";
      recipient_email: string;
      recipient_name: string;
      university_name: string | null;
    }> = [];

    for (const rec of suppressedRecipients) {
      if (mode === "catalog" || athleteIds.length === 0) {
        suppressedLogs.push({
          athlete_id: null,
          coach_id: rec.coachId ?? null,
          subject: "[Catalog] Go Team Go Scouting Showcase",
          status: "suppressed",
          error_message: "Recipient is in suppression list (opted out or paused)",
          sent_at: now,
          email_type: "catalog_general",
          recipient_email: rec.email,
          recipient_name: rec.name,
          university_name: rec.universityName ?? null,
        });
      } else if (mode === "multi_athlete") {
        suppressedLogs.push({
          athlete_id: athleteIds[0] ?? null,
          coach_id: rec.coachId ?? null,
          subject: `[Multi-Athlete] Showcase with ${athleteIds.length} athletes`,
          status: "suppressed",
          error_message: "Recipient is in suppression list (opted out or paused)",
          sent_at: now,
          email_type: "athlete_teaser_multi",
          recipient_email: rec.email,
          recipient_name: rec.name,
          university_name: rec.universityName ?? null,
        });
      } else {
        for (const athId of athleteIds) {
          suppressedLogs.push({
            athlete_id: athId,
            coach_id: rec.coachId ?? null,
            subject: "[Prospect] Teaser Email",
            status: "suppressed",
            error_message: "Recipient is in suppression list (opted out or paused)",
            sent_at: now,
            email_type: "athlete_teaser",
            recipient_email: rec.email,
            recipient_name: rec.name,
            university_name: rec.universityName ?? null,
          });
        }
      }
    }

    await admin.from("recruit_email_logs").insert(suppressedLogs);
  }

  if (activeRecipients.length === 0) {
    return {
      success: false,
      totalSent: 0,
      totalFailed: 0,
      totalSuppressed: suppressedRecipients.length,
      message: "All selected recipients are in the suppression list.",
    };
  }

  // Inicializar Resend
  const resendClient = getResendClient();
  const resendConfig = getResendConfig();
  const from = resendConfig.from;

  if (!resendClient || !resendConfig.isConfigured) {
    console.error("[recruit-email] Resend not configured or missing RESEND_API_KEY.");
    return {
      success: false,
      totalSent: 0,
      totalFailed: 0,
      totalSuppressed: suppressedRecipients.length,
      message: "Failed to initialize Resend client. Check RESEND_API_KEY.",
    };
  }

  // Preparar os payloads de e-mail de acordo com o modo
  type PreparedMessage = {
    to: string;
    subject: string;
    html: string;
    text: string;
    athleteId: string | null;
    coachId: string | null;
    recipientEmail: string;
    recipientName: string;
    universityName: string | null;
    emailType: "athlete_teaser" | "athlete_teaser_multi" | "catalog_general";
  };

  const messagesToSend: PreparedMessage[] = [];

  if (mode === "catalog") {
    const headline = customOptions?.headline || catalogOptions?.customHeadline;
    const message =
      customOptions?.message || customOptions?.introduction || catalogOptions?.customMessage;

    for (const rec of activeRecipients) {
      const { subject, html, text } = renderCatalogEmail({
        coachName: rec.name,
        institutionName: rec.universityName,
        customHeadline: headline,
        customMessage: message,
        customGreeting: customOptions?.greeting,
        customIntroduction: customOptions?.introduction,
        customHook: customOptions?.hook,
        recipientEmail: rec.email,
        coachId: rec.coachId,
        logoUrl,
        heroBackgroundUrl,
      });

      messagesToSend.push({
        to: rec.email,
        subject,
        html,
        text,
        athleteId: null,
        coachId: rec.coachId ?? null,
        recipientEmail: rec.email,
        recipientName: rec.name,
        universityName: rec.universityName ?? null,
        emailType: "catalog_general",
      });
    }
  } else if (mode === "multi_athlete") {
    const loadedAthletes: RecruitEmailData[] = [];
    for (const athId of athleteIds) {
      const emailData = await loadAthleteEmailData(athId);
      if (emailData) loadedAthletes.push(emailData);
    }

    if (loadedAthletes.length > 0) {
      for (const rec of activeRecipients) {
        const { subject, html, text } = renderMultiAthleteRecruitEmail({
          athletes: loadedAthletes,
          coachName: rec.name,
          institutionName: rec.universityName,
          recipientEmail: rec.email,
          coachId: rec.coachId,
          customGreeting: customOptions?.greeting,
          customIntroduction: customOptions?.introduction,
          customHook: customOptions?.hook,
          logoUrl,
          heroBackgroundUrl,
        });

        messagesToSend.push({
          to: rec.email,
          subject,
          html,
          text,
          athleteId: loadedAthletes[0]?.athleteId ?? null,
          coachId: rec.coachId ?? null,
          recipientEmail: rec.email,
          recipientName: rec.name,
          universityName: rec.universityName ?? null,
          emailType: "athlete_teaser_multi",
        });
      }
    }
  } else {
    // single_athlete
    for (const athId of athleteIds) {
      const emailData = await loadAthleteEmailData(athId);
      if (!emailData) continue;

      for (const rec of activeRecipients) {
        const { subject, html, text } = renderRecruitEmail({
          ...emailData,
          recipientEmail: rec.email,
          coachId: rec.coachId,
          coachName: rec.name,
          institutionName: rec.universityName,
          customGreeting: customOptions?.greeting,
          customIntroduction: customOptions?.introduction,
          customHook: customOptions?.hook,
          logoUrl,
          heroBackgroundUrl,
        });

        messagesToSend.push({
          to: rec.email,
          subject,
          html,
          text,
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

  let totalSent = 0;
  let totalFailed = 0;
  const errors: string[] = [];

  // Envio via Resend Batch API em blocos de até 100 mensagens
  const BATCH_SIZE = 100;
  for (let offset = 0; offset < messagesToSend.length; offset += BATCH_SIZE) {
    const chunk = messagesToSend.slice(offset, offset + BATCH_SIZE);
    const now = new Date().toISOString();

    const batchPayload = chunk.map((item) => ({
      from,
      to: [item.to],
      subject: item.subject,
      html: item.html,
      text: item.text,
    }));

    try {
      const batchResult = await resendClient.batch.send(batchPayload);

      if (batchResult.error) {
        throw new Error(batchResult.error.message || "Resend batch send error");
      }

      const responseList = batchResult.data?.data || [];

      // Mapear logs individuais de envio
      const insertLogs = chunk.map((item, idx) => {
        const resendId = responseList[idx]?.id;
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
          provider_id: resendId ?? null,
        };
      });

      await admin.from("recruit_email_logs").insert(insertLogs);
    } catch (batchErr) {
      // Fallback para envio individual se o lote inteiro falhar
      const batchErrorMsg = batchErr instanceof Error ? batchErr.message : "Batch send failed";
      console.warn(
        `[recruit-email] Batch failed (${batchErrorMsg}). Retrying chunk individually...`,
      );

      for (const item of chunk) {
        try {
          const singleRes = await resendClient.emails.send({
            from,
            to: [item.to],
            subject: item.subject,
            html: item.html,
            text: item.text,
          });

          if (singleRes.error) {
            throw new Error(singleRes.error.message || "Individual send failed");
          }

          totalSent++;
          await admin.from("recruit_email_logs").insert({
            athlete_id: item.athleteId,
            coach_id: item.coachId,
            subject: item.subject,
            status: "sent",
            error_message: null,
            sent_at: now,
            email_type: item.emailType,
            recipient_email: item.recipientEmail,
            recipient_name: item.recipientName,
            university_name: item.universityName,
            provider_id: singleRes.data?.id ?? null,
          });
        } catch (individualErr) {
          totalFailed++;
          const errText = individualErr instanceof Error ? individualErr.message : "Send failed";
          console.error(`[recruit-email] Failed to send email to ${item.to}:`, errText);
          errors.push(errText);

          await admin.from("recruit_email_logs").insert({
            athlete_id: item.athleteId,
            coach_id: item.coachId,
            subject: item.subject,
            status: "failed",
            error_message: errText,
            sent_at: now,
            email_type: item.emailType,
            recipient_email: item.recipientEmail,
            recipient_name: item.recipientName,
            university_name: item.universityName,
          });
        }
      }
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

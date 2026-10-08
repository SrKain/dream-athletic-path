import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/clients.server";
import { getResendClient, getResendConfig } from "./resend-client.server";
import { type EmailBlock } from "./personal-email-renderer";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail,
  type RecruitEmailData,
} from "./recruit-email-template";
import { renderCatalogEmail } from "./recruit-email-catalog-template";
import { buildResendMailerTags, type ResendTag } from "./mailer-metrics-quality";
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
  createdBy?: string | null;
  filters?: Record<string, unknown>;
  blocks?: EmailBlock[];
  customOptions?: {
    greeting?: string;
    introduction?: string;
    hook?: string;
    headline?: string;
    message?: string;
    blocks?: EmailBlock[];
  };
  catalogOptions?: {
    customHeadline?: string;
    customMessage?: string;
  };
}

export interface SendMailerResult {
  success: boolean;
  campaignId?: string;
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function filterValidUuids(ids: string[]): string[] {
  return ids.map((id) => id.trim()).filter((id) => UUID_REGEX.test(id));
}

/**
 * Insere linhas em `recruit_email_logs` verificando `error` explicitamente.
 * Caso o banco ainda não possua as colunas novas da migration 0022 (`campaign_id`, `athlete_ids`),
 * realiza fallback gracioso sem as duas colunas para nunca perder o `provider_id`.
 */
async function insertRecruitEmailLogsSafe(
  admin: ReturnType<typeof getAdminClient>,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  if (!rows || rows.length === 0) return;

  const res = await admin.from("recruit_email_logs").insert(rows);
  if (!res?.error) return;

  console.error("[recruit-email] Error inserting into recruit_email_logs:", res.error.message);

  // Se falhou por coluna inexistente (migration 0022 pendente no ambiente), tenta salvar sem campaign_id/athlete_ids
  if (res.error.message.includes("campaign_id") || res.error.message.includes("athlete_ids")) {
    const fallbackRows = rows.map((row) => {
      const copy = { ...row };
      delete copy.campaign_id;
      delete copy.athlete_ids;
      return copy;
    });
    const retryRes = await admin.from("recruit_email_logs").insert(fallbackRows);
    if (retryRes?.error) {
      console.error(
        "[recruit-email] Fallback insert into recruit_email_logs also failed:",
        retryRes.error.message,
      );
    }
  }
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
    .select(
      "id, coach_id, coach_email, reason, athlete_id, athlete_name, position, notes, created_at, expires_at",
    )
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
    admin
      .from("athlete_profiles")
      .select(
        "high_school_graduation, graduation_year, gpa, athlete_status, highlight_note, budget, highlight_video_url",
      )
      .eq("athlete_id", athleteId)
      .maybeSingle(),
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
  const {
    mode,
    athleteIds = [],
    recipients = [],
    createdBy = null,
    filters = {},
    blocks,
    customOptions,
    catalogOptions,
  } = input;

  const emailBlocks = blocks?.length ? blocks : customOptions?.blocks?.length ? customOptions.blocks : [];

  if (recipients.length === 0) {
    return {
      success: false,
      totalSent: 0,
      totalFailed: 0,
      totalSuppressed: 0,
      message: "No recipients selected.",
    };
  }

  const campaignId = crypto.randomUUID();
  const validUuidAthleteIds = filterValidUuids(athleteIds);

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

  // Registrar imediatamente logs de supressão (checando erro)
  if (suppressedRecipients.length > 0) {
    const now = new Date().toISOString();
    const suppressedLogs: Array<Record<string, unknown>> = [];

    for (const rec of suppressedRecipients) {
      if (mode === "catalog" || athleteIds.length === 0) {
        suppressedLogs.push({
          campaign_id: campaignId,
          athlete_id: null,
          athlete_ids: [],
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
          campaign_id: campaignId,
          athlete_id: athleteIds[0] ?? null,
          athlete_ids: validUuidAthleteIds,
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
            campaign_id: campaignId,
            athlete_id: athId,
            athlete_ids: UUID_REGEX.test(athId) ? [athId] : [],
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

    await insertRecruitEmailLogsSafe(admin, suppressedLogs);
  }

  if (activeRecipients.length === 0) {
    return {
      success: false,
      campaignId,
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
      campaignId,
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
    athleteIds: string[];
    coachId: string | null;
    recipientEmail: string;
    recipientName: string;
    universityName: string | null;
    emailType: "athlete_teaser" | "athlete_teaser_multi" | "catalog_general";
    tags: ResendTag[];
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
        campaignId,
      });

      messagesToSend.push({
        to: rec.email,
        subject,
        html,
        text,
        athleteId: null,
        athleteIds: [],
        coachId: rec.coachId ?? null,
        recipientEmail: rec.email,
        recipientName: rec.name,
        universityName: rec.universityName ?? null,
        emailType: "catalog_general",
        tags: buildResendMailerTags({
          campaignId,
          emailType: "catalog_general",
        }),
      });
    }
  } else if (mode === "multi_athlete") {
    const loadedAthletes: RecruitEmailData[] = [];
    for (const athId of athleteIds) {
      const emailData = await loadAthleteEmailData(athId);
      if (emailData) loadedAthletes.push(emailData);
    }

    const loadedAthleteIds = filterValidUuids(
      loadedAthletes.map((a) => a.athleteId).filter((id): id is string => Boolean(id)),
    );

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
          blocks: emailBlocks.length > 0 ? emailBlocks : undefined,
          logoUrl,
          heroBackgroundUrl,
          campaignId,
        });

        messagesToSend.push({
          to: rec.email,
          subject,
          html,
          text,
          athleteId: loadedAthletes[0]?.athleteId ?? null,
          athleteIds: loadedAthleteIds.length > 0 ? loadedAthleteIds : validUuidAthleteIds,
          coachId: rec.coachId ?? null,
          recipientEmail: rec.email,
          recipientName: rec.name,
          universityName: rec.universityName ?? null,
          emailType: "athlete_teaser_multi",
          tags: buildResendMailerTags({
            campaignId,
            emailType: "athlete_teaser_multi",
          }),
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
          blocks: emailBlocks.length > 0 ? emailBlocks : undefined,
          logoUrl,
          heroBackgroundUrl,
          campaignId,
        });

        messagesToSend.push({
          to: rec.email,
          subject,
          html,
          text,
          athleteId: athId,
          athleteIds: UUID_REGEX.test(athId) ? [athId] : validUuidAthleteIds,
          coachId: rec.coachId ?? null,
          recipientEmail: rec.email,
          recipientName: rec.name,
          universityName: rec.universityName ?? null,
          emailType: "athlete_teaser",
          tags: buildResendMailerTags({
            campaignId,
            emailType: "athlete_teaser",
            athleteId: athId,
          }),
        });
      }
    }
  }

  // Registrar a campanha em `mailer_campaigns` antes do disparo
  const campaignSubject =
    messagesToSend[0]?.subject ||
    (mode === "catalog"
      ? "Go Team Go — Active US College Recruiting Portfolio"
      : mode === "multi_athlete"
        ? `Multi-Athlete Showcase (${athleteIds.length} athletes)`
        : "Prospect Spotlight");

  const campaignInsertRes = await admin.from("mailer_campaigns").insert({
    id: campaignId,
    created_by: createdBy,
    mode,
    subject: campaignSubject,
    athlete_ids: validUuidAthleteIds,
    recipients_count: activeRecipients.length,
    filters: filters ?? {},
  });

  if (campaignInsertRes?.error) {
    console.error(
      "[recruit-email] Error inserting mailer_campaigns:",
      campaignInsertRes.error.message,
    );
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
      tags: item.tags,
    }));

    try {
      const batchResult = await resendClient.batch.send(batchPayload);

      if (batchResult.error) {
        throw new Error(batchResult.error.message || "Resend batch send error");
      }

      const responseList = batchResult.data?.data || [];

      // Mapear logs individuais de envio com campaign_id e athlete_ids completos
      const insertLogs = chunk.map((item, idx) => {
        const resendId = responseList[idx]?.id;
        totalSent++;

        return {
          campaign_id: campaignId,
          athlete_id: item.athleteId,
          athlete_ids: item.athleteIds,
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

      await insertRecruitEmailLogsSafe(admin, insertLogs);
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
            tags: item.tags,
          });

          if (singleRes.error) {
            throw new Error(singleRes.error.message || "Individual send failed");
          }

          totalSent++;
          await insertRecruitEmailLogsSafe(admin, [
            {
              campaign_id: campaignId,
              athlete_id: item.athleteId,
              athlete_ids: item.athleteIds,
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
            },
          ]);
        } catch (individualErr) {
          totalFailed++;
          const errText = individualErr instanceof Error ? individualErr.message : "Send failed";
          console.error(`[recruit-email] Failed to send email to ${item.to}:`, errText);
          errors.push(errText);

          await insertRecruitEmailLogsSafe(admin, [
            {
              campaign_id: campaignId,
              athlete_id: item.athleteId,
              athlete_ids: item.athleteIds,
              coach_id: item.coachId,
              subject: item.subject,
              status: "failed",
              error_message: errText,
              sent_at: now,
              email_type: item.emailType,
              recipient_email: item.recipientEmail,
              recipient_name: item.recipientName,
              university_name: item.universityName,
            },
          ]);
        }
      }
    }
  }

  return {
    success: totalSent > 0,
    campaignId,
    totalSent,
    totalFailed,
    totalSuppressed: suppressedRecipients.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// Função legada (singular) utilizada pelo modal SendRecruitEmailDialog na página do atleta:
// delega integralmente para sendMailerEmails, criando campanha, enviando tags, gravando campaign_id/athlete_ids e checando erros.
export async function sendRecruitEmailToCoaches(input: {
  athleteId: string;
  coachIds: string[];
  createdBy?: string | null;
}): Promise<{
  success: boolean;
  campaignId?: string;
  totalSent: number;
  totalFailed: number;
  message?: string;
  errors?: string[];
}> {
  const admin = getAdminClient();
  const { data: coaches, error: coachesErr } = await admin
    .from("coaches")
    .select("id, name, email, institution")
    .in("id", input.coachIds);

  if (coachesErr) {
    console.error(
      "[recruit-email] Error loading coaches in sendRecruitEmailToCoaches:",
      coachesErr.message,
    );
  }

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
    createdBy: input.createdBy ?? null,
    filters: { source: "athlete_profile_dialog", coachCount: recipients.length },
  });

  return {
    success: res.success,
    campaignId: res.campaignId,
    totalSent: res.totalSent,
    totalFailed: res.totalFailed,
    message: res.message,
    errors: res.errors,
  };
}

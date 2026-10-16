import { resolveEmailSubject } from "./email-personalization";
import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/clients.server";
import { getResendClient, getResendConfig } from "./resend-client.server";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail,
  type RecruitEmailData,
} from "./recruit-email-template";
import { renderCatalogEmail } from "./recruit-email-catalog-template";
import { buildResendMailerTags, type ResendTag } from "./mailer-metrics-quality";
import { getSuppressedEmailSet, type SendMailerInput } from "./recruit-email.server";
import { EMAIL_SIGNATURE } from "./email-brand";
import type { MailerCampaign, MailerCampaignStatus, MailerQueueItem } from "@/types/db";

export const QUEUE_CONFIG = {
  DEFAULT_BATCH_SIZE: 150,
  DEFAULT_MICRO_BATCH_SIZE: 2,
  PAUSE_BETWEEN_BATCHES_SEC: 60,
  ITEM_SPACING_MS: 0,
  MAX_ATTEMPTS: 3,
  LOCK_DURATION_SEC: 120,
} as const;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function filterValidUuids(ids: Array<string | null | undefined>): string[] {
  return ids
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim())
    .filter((id) => UUID_REGEX.test(id));
}

export interface EnqueueResult {
  success: boolean;
  campaignId: string;
  totalRecipients: number;
  totalEnqueued: number;
  totalSuppressed: number;
  totalBatches: number;
  batchSize: number;
  status: MailerCampaignStatus;
  message?: string;
  errors?: string[];
}

export interface CampaignProgress {
  campaignId: string;
  status: MailerCampaignStatus;
  subject: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
  pendingCount: number;
  processingCount: number;
  cancelledCount: number;
  currentBatch: number;
  totalBatches: number;
  batchSize: number;
  percentComplete: number;
  nextBatchAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  estimatedRemainingSeconds: number;
  lastError: string | null;
}

export interface ProcessQueueOptions {
  campaignId: string;
  workerId?: string;
  maxBatchSize?: number;
  clientId?: string;
  customAdmin?: ReturnType<typeof getAdminClient>;
}

export interface ProcessQueueResult {
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  rateLimited: boolean;
  cooldownActive?: boolean;
  cooldownRemainingSec?: number;
  campaignCompleted?: boolean;
  activeCampaignId?: string;
  campaignStatus?: MailerCampaignStatus;
  progress?: CampaignProgress | null;
  message?: string;
  controllerConflict?: boolean;
}

/**
 * Cria a campanha e enfileira atomicamente todos os envios em `mailer_queue`.
 * Garante:
 * 1. Deduplicação estrita de destinatários por e-mail normalizado.
 * 2. Higienização de UUIDs de coaches.
 * 3. Idempotência por chave SHA-256 única `${campaignId}:${recipientEmail}`.
 */
export async function enqueueCampaignDispatches(
  input: SendMailerInput,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<EnqueueResult> {
  resolveEmailSubject(input.customOptions?.subject, "");
  const admin = customAdmin || getAdminClient();
  const campaignId = crypto.randomUUID();
  const now = new Date().toISOString();

  const athleteIds = input.athleteIds || [];
  const validUuidAthleteIds = filterValidUuids(athleteIds);
  const mode = input.mode;

  // 1. Deduplicar destinatários por e-mail normalizado e checar lista de supressão
  const suppressedSet = await getSuppressedEmailSet();
  const seenEmails = new Set<string>();
  const activeRecipients: typeof input.recipients = [];
  const suppressedRecipients: typeof input.recipients = [];

  for (const r of input.recipients) {
    const cleanEmail = (r.email || "").toLowerCase().trim();
    if (!cleanEmail || seenEmails.has(cleanEmail)) {
      continue;
    }
    seenEmails.add(cleanEmail);

    const validCoachId = r.coachId && UUID_REGEX.test(r.coachId.trim()) ? r.coachId.trim() : null;
    const sanitizedRecipient = { ...r, email: cleanEmail, coachId: validCoachId };

    if (suppressedSet.has(cleanEmail)) {
      suppressedRecipients.push(sanitizedRecipient);
    } else {
      activeRecipients.push(sanitizedRecipient);
    }
  }

  // Universities store coach contacts in their own JSON, not necessarily in public.coaches.
  // A syntactically valid UUID is not evidence that a foreign key target exists.
  // Keep the recipient email/university data and persist coach_id only for real coach rows.
  const proposedCoachIds = Array.from(
    new Set(
      [...activeRecipients, ...suppressedRecipients]
        .map((recipient) => recipient.coachId)
        .filter((id): id is string => typeof id === "string" && UUID_REGEX.test(id)),
    ),
  );
  const persistedCoachIds = new Set<string>();
  for (let offset = 0; offset < proposedCoachIds.length; offset += 100) {
    const { data: existingCoaches, error: coachLookupError } = await admin
      .from("coaches")
      .select("id")
      .in("id", proposedCoachIds.slice(offset, offset + 100));

    if (coachLookupError) {
      console.error("[mailer-queue] Coach ID lookup failed:", coachLookupError.message);
      return {
        success: false,
        campaignId,
        totalRecipients: input.recipients.length,
        totalEnqueued: 0,
        totalSuppressed: suppressedRecipients.length,
        totalBatches: 0,
        batchSize: QUEUE_CONFIG.DEFAULT_BATCH_SIZE,
        status: "failed",
        message: "Não foi possível validar os contatos da campanha. Tente novamente.",
      };
    }
    for (const coach of existingCoaches || []) {
      if (coach?.id) persistedCoachIds.add(coach.id.toLowerCase());
    }
  }

  for (const recipient of [...activeRecipients, ...suppressedRecipients]) {
    if (!recipient.coachId || !persistedCoachIds.has(recipient.coachId.toLowerCase())) {
      recipient.coachId = null;
    }
  }

  // 2. Registrar logs para destinatários suprimidos de saída
  if (suppressedRecipients.length > 0) {
    const suppressedLogs = suppressedRecipients.map((rec) => ({
      campaign_id: campaignId,
      athlete_id: athleteIds[0] ?? null,
      athlete_ids: validUuidAthleteIds,
      coach_id: rec.coachId,
      subject:
        mode === "catalog"
          ? "[Catalog] Go Team Go Scouting Showcase"
          : mode === "multi_athlete"
            ? `[Multi-Athlete] Showcase with ${athleteIds.length} athletes`
            : "[Prospect] Teaser Email",
      status: "suppressed" as const,
      error_message: "Recipient is in suppression list (opted out or paused)",
      sent_at: now,
      email_type:
        mode === "catalog"
          ? ("catalog_general" as const)
          : mode === "multi_athlete"
            ? ("athlete_teaser_multi" as const)
            : ("athlete_teaser" as const),
      recipient_email: rec.email,
      recipient_name: rec.name,
      university_name: rec.universityName ?? null,
    }));

    await admin.from("recruit_email_logs").insert(suppressedLogs);
  }

  const batchSize = QUEUE_CONFIG.DEFAULT_BATCH_SIZE;
  const totalBatches = Math.max(1, Math.ceil(activeRecipients.length / batchSize));

  // 3. Obter configurações visuais
  const { data: visualData } = await admin
    .from("agency_visual_settings")
    .select("logo_url, hero_background_url")
    .limit(1)
    .maybeSingle();

  const logoUrl = visualData?.logo_url ?? null;
  const heroBackgroundUrl = visualData?.hero_background_url ?? null;

  // 4. Preparar payloads prontos de envio
  type PreparedQueuePayload = {
    coachId: string | null;
    recipientEmail: string;
    recipientName: string;
    universityName: string | null;
    emailType: "athlete_teaser" | "athlete_teaser_multi" | "catalog_general";
    subject: string;
    html: string;
    text: string;
    athleteId: string | null;
    athleteIds: string[];
    tags: ResendTag[];
  };

  const queueItemsToInsert: PreparedQueuePayload[] = [];
  const customOptions = input.customOptions;
  const catalogOptions = input.catalogOptions;
  const emailBlocks = input.blocks || [];

  if (mode === "catalog") {
    const headline = customOptions?.headline || catalogOptions?.customHeadline;
    const message =
      customOptions?.message || customOptions?.introduction || catalogOptions?.customMessage;

    for (const rec of activeRecipients) {
      const { subject, html, text } = renderCatalogEmail({
        coachName: rec.name,
        coachLastName: rec.lastName,
        customSubject: customOptions?.subject,
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

      queueItemsToInsert.push({
        coachId: rec.coachId ?? null,
        recipientEmail: rec.email,
        recipientName: rec.name,
        universityName: rec.universityName ?? null,
        emailType: "catalog_general",
        subject,
        html,
        text,
        athleteId: null,
        athleteIds: [],
        tags: buildResendMailerTags({
          campaignId,
          emailType: "catalog_general",
        }),
      });
    }
  } else if (mode === "multi_athlete") {
    const athletesData: RecruitEmailData[] = [];

    for (const athId of athleteIds) {
      const { data: athlete } = await admin
        .from("athletes")
        .select("id, slug, full_name, photo_url, height_cm, nationality, sport_id, position_id")
        .eq("id", athId)
        .maybeSingle();

      if (!athlete) continue;

      const [profileRes, sportRes, posRes, countryRes, videoRes] = await Promise.all([
        admin
          .from("athlete_profiles")
          .select(
            "high_school_graduation, graduation_year, gpa, athlete_status, highlight_note, budget, highlight_video_url",
          )
          .eq("athlete_id", athId)
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
          .eq("athlete_id", athId)
          .eq("kind", "highlight")
          .limit(1)
          .maybeSingle(),
      ]);

      athletesData.push({
        athleteId: athlete.id,
        athleteName: athlete.full_name,
        athleteSlug: athlete.slug,
        photoUrl: athlete.photo_url,
        positionName: posRes.data?.name_en || null,
        sportName: sportRes.data?.name_en || null,
        heightCm: athlete.height_cm,
        nationality: athlete.nationality,
        countryFlag: countryRes.data?.flag_emoji || null,
        highSchoolGraduation: profileRes.data?.high_school_graduation || null,
        graduationYear: profileRes.data?.graduation_year || null,
        gpa: profileRes.data?.gpa || null,
        athleteStatus: profileRes.data?.athlete_status || null,
        highlightNote: profileRes.data?.highlight_note || null,
        budget: profileRes.data?.budget || null,
        highlightVideoUrl:
          videoRes.data?.youtube_url || profileRes.data?.highlight_video_url || null,
        recipientEmail: "",
      });
    }

    const { data: athletesWithRelations } = await admin
      .from("athletes")
      .select("id, slug, full_name, photo_url, height_cm, nationality, sport_id, position_id")
      .in("id", athleteIds);

    const loadedAthleteIds = filterValidUuids(athletesWithRelations?.map((a) => a.id) ?? []);

    const loadedAthletes: RecruitEmailData[] = (athletesWithRelations || []).map((a) => {
      const existing = athletesData.find((ad) => ad.athleteId === a.id);
      return (
        existing || {
          athleteId: a.id,
          athleteName: a.full_name,
          athleteSlug: a.slug,
          photoUrl: a.photo_url,
          positionName: null,
          sportName: null,
          heightCm: a.height_cm,
          nationality: a.nationality,
          countryFlag: null,
          highSchoolGraduation: null,
          graduationYear: null,
          gpa: null,
          athleteStatus: null,
          highlightNote: null,
          budget: null,
          highlightVideoUrl: null,
          recipientEmail: "",
        }
      );
    });

    for (const rec of activeRecipients) {
      const { subject, html, text } = renderMultiAthleteRecruitEmail({
        athletes: loadedAthletes,
        recipientEmail: rec.email,
        coachId: rec.coachId,
        coachName: rec.name,
        coachLastName: rec.lastName,
        customSubject: customOptions?.subject,
        institutionName: rec.universityName,
        customGreeting: customOptions?.greeting,
        customIntroduction: customOptions?.introduction,
        customHook: customOptions?.hook,
        blocks: emailBlocks.length > 0 ? emailBlocks : undefined,
        logoUrl,
        heroBackgroundUrl,
        campaignId,
      });

      queueItemsToInsert.push({
        coachId: rec.coachId ?? null,
        recipientEmail: rec.email,
        recipientName: rec.name,
        universityName: rec.universityName ?? null,
        emailType: "athlete_teaser_multi",
        subject,
        html,
        text,
        athleteId: loadedAthletes[0]?.athleteId ?? null,
        athleteIds: loadedAthleteIds.length > 0 ? loadedAthleteIds : validUuidAthleteIds,
        tags: buildResendMailerTags({
          campaignId,
          emailType: "athlete_teaser_multi",
        }),
      });
    }
  } else {
    // single_athlete
    for (const athId of athleteIds) {
      const { data: athlete } = await admin
        .from("athletes")
        .select("id, slug, full_name, photo_url, height_cm, nationality, sport_id, position_id")
        .eq("id", athId)
        .maybeSingle();

      if (!athlete) continue;

      const [profileRes, sportRes, posRes, countryRes, videoRes] = await Promise.all([
        admin
          .from("athlete_profiles")
          .select(
            "high_school_graduation, graduation_year, gpa, athlete_status, highlight_note, budget, highlight_video_url",
          )
          .eq("athlete_id", athId)
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
          .eq("athlete_id", athId)
          .eq("kind", "highlight")
          .limit(1)
          .maybeSingle(),
      ]);

      const singleData: RecruitEmailData = {
        athleteId: athlete.id,
        athleteName: athlete.full_name,
        athleteSlug: athlete.slug,
        photoUrl: athlete.photo_url,
        positionName: posRes.data?.name_en || null,
        sportName: sportRes.data?.name_en || null,
        heightCm: athlete.height_cm,
        nationality: athlete.nationality,
        countryFlag: countryRes.data?.flag_emoji || null,
        highSchoolGraduation: profileRes.data?.high_school_graduation || null,
        graduationYear: profileRes.data?.graduation_year || null,
        gpa: profileRes.data?.gpa || null,
        athleteStatus: profileRes.data?.athlete_status || null,
        highlightNote: profileRes.data?.highlight_note || null,
        budget: profileRes.data?.budget || null,
        highlightVideoUrl:
          videoRes.data?.youtube_url || profileRes.data?.highlight_video_url || null,
        recipientEmail: "",
      };

      for (const rec of activeRecipients) {
        const { subject, html, text } = renderRecruitEmail({
          ...singleData,
          recipientEmail: rec.email,
          coachId: rec.coachId,
          coachName: rec.name,
          coachLastName: rec.lastName,
          customSubject: customOptions?.subject,
          institutionName: rec.universityName,
          customGreeting: customOptions?.greeting,
          customIntroduction: customOptions?.introduction,
          customHook: customOptions?.hook,
          blocks: emailBlocks.length > 0 ? emailBlocks : undefined,
          logoUrl,
          heroBackgroundUrl,
          campaignId,
        });

        queueItemsToInsert.push({
          coachId: rec.coachId ?? null,
          recipientEmail: rec.email,
          recipientName: rec.name,
          universityName: rec.universityName ?? null,
          emailType: "athlete_teaser",
          subject,
          html,
          text,
          athleteId: athId,
          athleteIds: UUID_REGEX.test(athId) ? [athId] : validUuidAthleteIds,
          tags: buildResendMailerTags({
            campaignId,
            emailType: "athlete_teaser",
            athleteId: athId,
          }),
        });
      }
    }
  }

  const campaignSubject =
    queueItemsToInsert[0]?.subject ||
    (mode === "catalog"
      ? "Go Team Go — Active US College Recruiting Portfolio"
      : mode === "multi_athlete"
        ? `Multi-Athlete Showcase (${athleteIds.length} athletes)`
        : "Prospect Spotlight");

  // 5. Inserir a campanha em `mailer_campaigns`
  const initialStatus: MailerCampaignStatus = activeRecipients.length > 0 ? "queued" : "completed";

  const campaignInsert = await admin.from("mailer_campaigns").insert({
    id: campaignId,
    created_by: input.createdBy || null,
    mode,
    subject: campaignSubject,
    athlete_ids: validUuidAthleteIds,
    recipients_count: activeRecipients.length,
    filters: input.filters ?? {},
    status: initialStatus,
    total_recipients: activeRecipients.length,
    sent_count: 0,
    failed_count: 0,
    suppressed_count: suppressedRecipients.length,
    current_batch: 1,
    total_batches: totalBatches,
    batch_size: batchSize,
    delay_between_batches_sec: QUEUE_CONFIG.PAUSE_BETWEEN_BATCHES_SEC,
    delay_between_items_ms: QUEUE_CONFIG.ITEM_SPACING_MS,
    started_at: now,
    next_batch_at: now,
  });

  if (campaignInsert?.error) {
    console.error("[mailer-queue] Failed to insert campaign:", campaignInsert.error.message);
    return {
      success: false,
      campaignId,
      totalRecipients: input.recipients.length,
      totalEnqueued: 0,
      totalSuppressed: suppressedRecipients.length,
      totalBatches: 0,
      batchSize,
      status: "failed",
      message: campaignInsert.error.message,
    };
  }

  // 6. Inserir os itens em `mailer_queue`
  if (queueItemsToInsert.length > 0) {
    const queueRows = queueItemsToInsert.map((item, index) => {
      const idempotencyKey = crypto
        .createHash("sha256")
        .update(`${campaignId}:${item.recipientEmail.toLowerCase().trim()}`)
        .digest("hex");

      const batchNumber = Math.floor(index / batchSize) + 1;

      return {
        campaign_id: campaignId,
        coach_id: item.coachId,
        recipient_email: item.recipientEmail,
        recipient_name: item.recipientName,
        university_name: item.universityName,
        email_type: item.emailType,
        subject: item.subject,
        payload: {
          html: item.html,
          text: item.text,
          tags: item.tags,
          athleteId: item.athleteId,
          athleteIds: item.athleteIds,
        },
        idempotency_key: idempotencyKey,
        status: "pending",
        batch_number: batchNumber,
        attempts: 0,
        max_attempts: QUEUE_CONFIG.MAX_ATTEMPTS,
        created_at: now,
      };
    });

    const INSERT_CHUNK_SIZE = 100;
    for (let i = 0; i < queueRows.length; i += INSERT_CHUNK_SIZE) {
      const chunk = queueRows.slice(i, i + INSERT_CHUNK_SIZE);
      const res = await admin.from("mailer_queue").insert(chunk);
      if (res?.error) {
        console.error("[mailer-queue] Error inserting queue chunk:", res.error.message);
        const failureMessage = `Failed to create campaign queue: ${res.error.message}`;
        // Fail closed: a partially inserted queue must never be dispatched.
        const { error: stopError } = await admin
          .from("mailer_campaigns")
          .update({
            status: "failed",
            last_error: failureMessage,
            completed_at: new Date().toISOString(),
          })
          .eq("id", campaignId);
        if (stopError)
          console.error("[mailer-queue] Failed to quarantine incomplete campaign:", stopError);
        return {
          success: false,
          campaignId,
          totalRecipients: input.recipients.length,
          totalEnqueued: 0,
          totalSuppressed: suppressedRecipients.length,
          totalBatches,
          batchSize,
          status: "failed",
          message: failureMessage,
        };
      }
    }
  }

  // Only activate the campaign after every queue chunk has been persisted.
  if (queueItemsToInsert.length > 0) {
    const { error: activationError } = await admin
      .from("mailer_campaigns")
      .update({ status: "running", next_batch_at: new Date().toISOString() })
      .eq("id", campaignId);
    if (activationError) {
      const failureMessage = `Failed to activate complete campaign: ${activationError.message}`;
      const { error: stopError } = await admin
        .from("mailer_campaigns")
        .update({ status: "failed", last_error: failureMessage })
        .eq("id", campaignId);
      if (stopError)
        console.error("[mailer-queue] Failed to quarantine inactive campaign:", stopError);
      return {
        success: false,
        campaignId,
        totalRecipients: input.recipients.length,
        totalEnqueued: 0,
        totalSuppressed: suppressedRecipients.length,
        totalBatches,
        batchSize,
        status: "failed",
        message: failureMessage,
      };
    }
  }

  return {
    success: true,
    campaignId,
    totalRecipients: input.recipients.length,
    totalEnqueued: queueItemsToInsert.length,
    totalSuppressed: suppressedRecipients.length,
    totalBatches,
    batchSize,
    status: queueItemsToInsert.length > 0 ? "running" : initialStatus,
  };
}

/**
 * Worker autenticado de execução de micro-lote (até 2 e-mails) acionado pelo navegador.
 * Garante:
 * 1. campaignId obrigatório e restrição de escopo SQL sem mistura de campanhas.
 * 2. maxBatchSize estritamente limitado a no máximo 2.
 * 3. Validação de lease de sessão/aba controladora.
 * 4. Reply-To institucional unificado (contact@goteamgoagency.com).
 * 5. Cabeçalhos oficiais de idempotência (Idempotency-Key e X-Entity-Ref-ID).
 * 6. Eliminação de sleeps na função serverless (a espera de 1s ocorre no cliente).
 * 7. Retorno do progresso consolidado na resposta (evitando polling duplo).
 */
export async function processMailerQueue(
  options: ProcessQueueOptions,
): Promise<ProcessQueueResult> {
  const admin = options?.customAdmin || getAdminClient();

  if (!options?.campaignId || !UUID_REGEX.test(options.campaignId.trim())) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: false,
      message: "Valid campaignId is required.",
    };
  }

  const campaignId = options.campaignId.trim();
  const workerId = options?.workerId || `browser-${crypto.randomBytes(4).toString("hex")}`;
  const maxBatchSize = Math.min(2, Math.max(1, Number(options?.maxBatchSize) || 2));
  const now = new Date();

  // An unavailable/missing lease must never permit dispatching.
  const controllerId = options.clientId?.trim() || workerId;
  try {
    const { data: leaseAcquired, error: leaseErr } = await admin.rpc(
      "acquire_mailer_campaign_lease",
      {
        p_campaign_id: campaignId,
        p_controller_id: controllerId,
        p_lease_seconds: 15,
      },
    );
    if (leaseErr || leaseAcquired !== true) {
      return {
        processed: 0,
        sent: 0,
        failed: 0,
        retried: 0,
        rateLimited: false,
        activeCampaignId: campaignId,
        controllerConflict: leaseAcquired === false && !leaseErr,
        message: leaseErr
          ? `Campaign lease unavailable: ${leaseErr.message}`
          : "Another session controls the campaign, or its lease cannot be acquired.",
      };
    }
  } catch (err) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: false,
      activeCampaignId: campaignId,
      message: `Campaign lease request failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  // 2. Recuperar itens órfãos expirados (stale processing)
  try {
    await admin.rpc("recover_stale_mailer_queue_reservations");
  } catch {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await admin
      .from("mailer_queue")
      .update({
        status: "retry",
        reserved_by: null,
        reserved_at: null,
        reservation_expires_at: null,
        next_retry_at: new Date(Date.now() + 30 * 1000).toISOString(),
        last_error: "Recovered stale reservation",
      })
      .eq("status", "processing")
      .lt("reservation_expires_at", fiveMinutesAgo);
  }

  // 3. Verificar limite global do provedor (mailer_rate_limits)
  const { data: rateLimit } = await admin
    .from("mailer_rate_limits")
    .select("locked_until")
    .eq("id", "global_resend_limit")
    .maybeSingle();

  if (rateLimit?.locked_until && new Date(rateLimit.locked_until) > now) {
    const lockWaitSec = Math.ceil(
      (new Date(rateLimit.locked_until).getTime() - now.getTime()) / 1000,
    );
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: true,
      cooldownActive: true,
      cooldownRemainingSec: lockWaitSec,
      activeCampaignId: campaignId,
      message: `Global rate limit active until ${rateLimit.locked_until}`,
    };
  }

  // 4. Buscar a campanha em execução
  const { data: specificCamp, error: campErr } = await admin
    .from("mailer_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (campErr || !specificCamp) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: false,
      message: campErr?.message || "Campaign not found.",
    };
  }

  const activeCampaign = specificCamp as MailerCampaign;

  if (
    activeCampaign.status === "paused" ||
    activeCampaign.status === "cancelled" ||
    activeCampaign.status === "completed"
  ) {
    const progress = await getCampaignQueueProgress(campaignId, admin);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: false,
      campaignCompleted: activeCampaign.status === "completed",
      campaignStatus: activeCampaign.status,
      activeCampaignId: activeCampaign.id,
      progress,
      message: `Campaign is in state: ${activeCampaign.status}`,
    };
  }

  // 5. Verificar se a janela de cooldown está ativa (sem permissão para cliente burlar)
  if (activeCampaign.next_batch_at && new Date(activeCampaign.next_batch_at) > now) {
    const waitSeconds = Math.ceil(
      (new Date(activeCampaign.next_batch_at).getTime() - now.getTime()) / 1000,
    );
    const progress = await getCampaignQueueProgress(campaignId, admin);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: false,
      cooldownActive: true,
      cooldownRemainingSec: waitSeconds,
      activeCampaignId: activeCampaign.id,
      campaignStatus: "running",
      progress,
      message: `Waiting for cooldown window (${waitSeconds}s remaining).`,
    };
  }

  // 6. Reservar atomicamente itens da fila ESCOPADOS para esta campanha via RPC com SKIP LOCKED
  let claimedItems: MailerQueueItem[] = [];

  try {
    const { data: rpcClaimed, error: rpcErr } = await admin.rpc("claim_mailer_queue_batch", {
      p_worker_id: workerId,
      p_batch_size: maxBatchSize,
      p_lock_duration_sec: QUEUE_CONFIG.LOCK_DURATION_SEC,
      p_campaign_id: campaignId,
    });

    if (rpcErr) {
      console.error("[mailer-queue] RPC claim_mailer_queue_batch returned error:", rpcErr.message);
      return {
        processed: 0,
        sent: 0,
        failed: 0,
        retried: 0,
        rateLimited: false,
        activeCampaignId: activeCampaign.id,
        message: `Reservation error: ${rpcErr.message}`,
      };
    }

    if (rpcClaimed && Array.isArray(rpcClaimed)) {
      claimedItems = rpcClaimed as MailerQueueItem[];
    }
  } catch (err) {
    console.error("[mailer-queue] Exception invoking claim_mailer_queue_batch:", err);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: false,
      activeCampaignId: activeCampaign.id,
      message: "Exception during atomic reservation.",
    };
  }

  // 7. Se nenhum item foi reservado, verificar se a campanha já concluiu
  if (claimedItems.length === 0) {
    const { count: pendingCount, error: countErr } = await admin
      .from("mailer_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", activeCampaign.id)
      .in("status", ["pending", "processing", "retry"]);

    if (countErr) {
      return {
        processed: 0,
        sent: 0,
        failed: 0,
        retried: 0,
        rateLimited: false,
        activeCampaignId: activeCampaign.id,
        message: `Error verifying queue completion: ${countErr.message}`,
      };
    }

    if (!pendingCount || pendingCount === 0) {
      await admin
        .from("mailer_campaigns")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          next_batch_at: null,
        })
        .eq("id", activeCampaign.id);

      const progress = await getCampaignQueueProgress(activeCampaign.id, admin);

      return {
        processed: 0,
        sent: 0,
        failed: 0,
        retried: 0,
        rateLimited: false,
        campaignCompleted: true,
        campaignStatus: "completed",
        activeCampaignId: activeCampaign.id,
        progress,
        message: "Campaign completed. All items processed.",
      };
    }

    const progress = await getCampaignQueueProgress(activeCampaign.id, admin);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: false,
      activeCampaignId: activeCampaign.id,
      campaignStatus: "running",
      progress,
      message: "No claimable items at this time.",
    };
  }

  // 8. Envio imediato dos itens do micro-lote via Resend com verificação de idempotência
  const resendClient = getResendClient();
  const resendConfig = getResendConfig();
  const from = resendConfig.from;

  let sentCount = 0;
  let failedCount = 0;
  let retriedCount = 0;
  let rateLimited = false;

  for (const item of claimedItems) {
    if (rateLimited) {
      await admin
        .from("mailer_queue")
        .update({
          status: "retry",
          reserved_by: null,
          reserved_at: null,
          reservation_expires_at: null,
          next_retry_at: new Date(Date.now() + 60 * 1000).toISOString(),
          error_code: "429_circuit_breaker",
        })
        .eq("id", item.id);
      retriedCount++;
      continue;
    }

    // Verificação de idempotência: se a mensagem já tem provider_message_id, pular envio
    if (item.provider_message_id) {
      const { error: confirmedError } = await admin
        .from("mailer_queue")
        .update({ status: "sent", reserved_by: null, reservation_expires_at: null })
        .eq("id", item.id);
      if (confirmedError) {
        return {
          processed: 0,
          sent: sentCount,
          failed: failedCount,
          retried: retriedCount,
          rateLimited: false,
          campaignStatus: "paused",
          activeCampaignId: campaignId,
          message: `Unable to persist provider-confirmed delivery: ${confirmedError.message}`,
        };
      }
      sentCount++;
      continue;
    }

    const payload = (item.payload || {}) as {
      html?: string;
      text?: string;
      tags?: ResendTag[];
      athleteId?: string | null;
      athleteIds?: string[];
    };

    try {
      if (!resendClient || !resendConfig.isConfigured) {
        throw new Error("Resend client not configured.");
      }

      const resendRes = await resendClient.emails.send(
        {
          from,
          to: [item.recipient_email],
          subject: item.subject,
          html: payload.html || "",
          text: payload.text || "",
          replyTo: EMAIL_SIGNATURE.email, // contact@goteamgoagency.com
          tags: payload.tags || [],
          headers: {
            "X-Entity-Ref-ID": item.idempotency_key,
          },
        },
        { idempotencyKey: item.idempotency_key },
      );

      if (resendRes.error) {
        throw new Error(resendRes.error.message || "Failed to send email via Resend");
      }

      const providerId = resendRes.data?.id || null;
      const processedAt = new Date().toISOString();

      // Sucesso: registrar status 'sent' e ID do provedor
      const { error: persistError } = await admin
        .from("mailer_queue")
        .update({
          status: "sent",
          provider_message_id: providerId,
          processed_at: processedAt,
          reserved_by: null,
          reservation_expires_at: null,
          last_error: null,
        })
        .eq("id", item.id);

      if (persistError) {
        // The provider accepted the message. Do not retry blindly or continue this campaign.
        const message = `Resend accepted ${item.recipient_email} (${providerId ?? "no id"}) but queue persistence failed: ${persistError.message}. Manual reconciliation required.`;
        console.error("[mailer-queue]", message);
        const { error: pauseError } = await admin
          .from("mailer_campaigns")
          .update({ status: "paused", last_error: message, next_batch_at: null })
          .eq("id", campaignId);
        if (pauseError)
          console.error("[mailer-queue] Unable to pause after uncertain persistence:", pauseError);
        return {
          processed: 0,
          sent: sentCount,
          failed: failedCount,
          retried: retriedCount,
          rateLimited: false,
          activeCampaignId: campaignId,
          campaignStatus: "paused",
          progress: await getCampaignQueueProgress(campaignId, admin),
          message,
        };
      }

      // Inserir log correspondente de forma resiliente
      try {
        await admin.from("recruit_email_logs").insert({
          campaign_id: item.campaign_id,
          athlete_id: payload.athleteId || null,
          athlete_ids: payload.athleteIds || [],
          coach_id: item.coach_id && UUID_REGEX.test(item.coach_id) ? item.coach_id : null,
          subject: item.subject,
          status: "sent",
          error_message: null,
          sent_at: processedAt,
          email_type: item.email_type,
          recipient_email: item.recipient_email,
          recipient_name: item.recipient_name,
          university_name: item.university_name,
          provider_id: providerId,
        });
      } catch (logErr) {
        console.error("[mailer-queue] Non-fatal log insertion error:", logErr);
      }

      sentCount++;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown send error";
      const is429 =
        errorMessage.includes("429") ||
        errorMessage.toLowerCase().includes("rate limit") ||
        errorMessage.toLowerCase().includes("too many requests");

      if (is429) {
        rateLimited = true;
        const retryAfterSec = 60;
        const lockUntil = new Date(Date.now() + retryAfterSec * 1000).toISOString();

        await admin
          .from("mailer_rate_limits")
          .update({
            locked_until: lockUntil,
            updated_at: new Date().toISOString(),
          })
          .eq("id", "global_resend_limit");

        await admin
          .from("mailer_queue")
          .update({
            status: "retry",
            next_retry_at: lockUntil,
            last_error: errorMessage,
            error_code: "429",
            reserved_by: null,
            reservation_expires_at: null,
          })
          .eq("id", item.id);

        retriedCount++;
      } else {
        const nextAttempts = item.attempts || 1;
        if (nextAttempts >= item.max_attempts) {
          const processedAt = new Date().toISOString();
          await admin
            .from("mailer_queue")
            .update({
              status: "failed",
              last_error: errorMessage,
              processed_at: processedAt,
              reserved_by: null,
              reservation_expires_at: null,
            })
            .eq("id", item.id);

          try {
            await admin.from("recruit_email_logs").insert({
              campaign_id: item.campaign_id,
              athlete_id: payload.athleteId || null,
              athlete_ids: payload.athleteIds || [],
              coach_id: item.coach_id && UUID_REGEX.test(item.coach_id) ? item.coach_id : null,
              subject: item.subject,
              status: "failed",
              error_message: errorMessage,
              sent_at: processedAt,
              email_type: item.email_type,
              recipient_email: item.recipient_email,
              recipient_name: item.recipient_name,
              university_name: item.university_name,
            });
          } catch (logErr) {
            console.error("[mailer-queue] Non-fatal failed log insertion error:", logErr);
          }

          failedCount++;
        } else {
          const delaySec = Math.min(300, Math.pow(2, nextAttempts) * 2 + Math.random() * 2);
          const nextRetryAt = new Date(Date.now() + delaySec * 1000).toISOString();

          await admin
            .from("mailer_queue")
            .update({
              status: "retry",
              next_retry_at: nextRetryAt,
              last_error: errorMessage,
              reserved_by: null,
              reservation_expires_at: null,
            })
            .eq("id", item.id);

          retriedCount++;
        }
      }
    }
  }

  // 9. Atualizar contadores da campanha e checar milestone de cooldown
  const previousSent = activeCampaign.sent_count || 0;
  const previousBatch = activeCampaign.current_batch || 1;
  const newSent = previousSent + sentCount;
  const batchThreshold = activeCampaign.batch_size || 150;

  const crossedBatchMilestone =
    batchThreshold > 0 &&
    Math.floor(newSent / batchThreshold) > Math.floor(previousSent / batchThreshold);

  const { count: remainingPending, error: remainingCountError } = await admin
    .from("mailer_queue")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", activeCampaign.id)
    .in("status", ["pending", "processing", "retry"]);

  if (remainingCountError || remainingPending === null) {
    return {
      processed: claimedItems.length,
      sent: sentCount,
      failed: failedCount,
      retried: retriedCount,
      rateLimited,
      activeCampaignId: campaignId,
      message: `Unable to verify campaign completion: ${remainingCountError?.message ?? "missing count"}`,
    };
  }
  const isCompleted = remainingPending === 0;

  let nextBatchTime: string | null = null;
  let cooldownActive = false;
  let cooldownRemainingSec = 0;

  if (isCompleted) {
    nextBatchTime = null;
  } else if (crossedBatchMilestone) {
    cooldownActive = true;
    cooldownRemainingSec = QUEUE_CONFIG.PAUSE_BETWEEN_BATCHES_SEC;
    nextBatchTime = new Date(Date.now() + cooldownRemainingSec * 1000).toISOString();
  }

  const newCurrentBatch = crossedBatchMilestone ? previousBatch + 1 : previousBatch;

  await admin
    .from("mailer_campaigns")
    .update({
      sent_count: newSent,
      failed_count: (activeCampaign.failed_count || 0) + failedCount,
      current_batch: newCurrentBatch,
      status: isCompleted ? "completed" : "running",
      completed_at: isCompleted ? new Date().toISOString() : null,
      next_batch_at: nextBatchTime,
    })
    .eq("id", activeCampaign.id);

  if (crossedBatchMilestone) {
    await admin
      .from("mailer_rate_limits")
      .update({
        last_batch_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", "global_resend_limit");
  }

  // Retornar progresso consolidado diretamente nesta resposta
  const progress = await getCampaignQueueProgress(activeCampaign.id, admin);

  return {
    processed: claimedItems.length,
    sent: sentCount,
    failed: failedCount,
    retried: retriedCount,
    rateLimited,
    cooldownActive,
    cooldownRemainingSec,
    campaignCompleted: isCompleted,
    campaignStatus: isCompleted ? "completed" : "running",
    activeCampaignId: activeCampaign.id,
    progress,
  };
}

/**
 * Consulta progresso e status detalhado de uma campanha.
 * Utiliza agregação SQL compacta em O(1) sem carregar todas as linhas da tabela.
 */
export async function getCampaignQueueProgress(
  campaignId: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<CampaignProgress | null> {
  const admin = customAdmin || getAdminClient();

  // 1. Tentar agregação compacta via RPC SQL get_mailer_campaign_progress_summary
  try {
    const { data: summary, error: rpcErr } = await admin.rpc(
      "get_mailer_campaign_progress_summary",
      { p_campaign_id: campaignId },
    );

    if (!rpcErr && summary) {
      const s = summary as Record<string, unknown>;
      const total = Number(s.total_recipients) || 0;
      const sent = Number(s.sent_count) || 0;
      const failed = Number(s.failed_count) || 0;
      const pending = Number(s.pending_count) || 0;
      const processing = Number(s.processing_count) || 0;
      const cancelled = Number(s.cancelled_count) || 0;
      const suppressed = Number(s.suppressed_count) || 0;

      const processed = sent + failed + cancelled;
      const percentComplete = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

      const remainingItems = pending + processing;
      const remainingMicroBatches = Math.ceil(remainingItems / 2);
      const activeSeconds = remainingMicroBatches * 1.5;
      const itemsInCurrentBatch = sent % 150;
      const itemsToNextPause = 150 - itemsInCurrentBatch;
      const remainingPauses =
        remainingItems > itemsToNextPause
          ? Math.floor((remainingItems - itemsToNextPause) / 150) + 1
          : 0;
      const estimatedRemainingSeconds = Math.round(activeSeconds + remainingPauses * 60);

      return {
        campaignId: String(s.campaign_id),
        status: s.status as MailerCampaignStatus,
        subject: String(s.subject || ""),
        totalRecipients: total,
        sentCount: sent,
        failedCount: failed,
        suppressedCount: suppressed,
        pendingCount: pending,
        processingCount: processing,
        cancelledCount: cancelled,
        currentBatch: Number(s.current_batch) || 1,
        totalBatches: Number(s.total_batches) || 1,
        batchSize: Number(s.batch_size) || 150,
        percentComplete,
        nextBatchAt: (s.next_batch_at as string) || null,
        startedAt: (s.started_at as string) || null,
        completedAt: (s.completed_at as string) || null,
        estimatedRemainingSeconds,
        lastError: (s.last_error as string) || null,
      };
    }
  } catch {
    // Continua para fallback de contagens head
  }

  // 2. Fallback: contagens HEAD compactas (sem transportar dados de linhas)
  const { data: campaign, error } = await admin
    .from("mailer_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !campaign) {
    return null;
  }

  const [
    { count: sentCount },
    { count: failedCount },
    { count: pendingCount },
    { count: processingCount },
    { count: cancelledCount },
  ] = await Promise.all([
    admin
      .from("mailer_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "sent"),
    admin
      .from("mailer_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "failed"),
    admin
      .from("mailer_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "retry"]),
    admin
      .from("mailer_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "processing"),
    admin
      .from("mailer_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "cancelled"),
  ]);

  const sent = sentCount || 0;
  const failed = failedCount || 0;
  const pending = pendingCount || 0;
  const processing = processingCount || 0;
  const cancelled = cancelledCount || 0;

  const total = campaign.total_recipients || sent + failed + pending + processing + cancelled;
  const processed = sent + failed + cancelled;
  const percentComplete = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  const remainingItems = pending + processing;
  const remainingMicroBatches = Math.ceil(remainingItems / 2);
  const activeSeconds = remainingMicroBatches * 1.5;
  const itemsInCurrentBatch = sent % 150;
  const itemsToNextPause = 150 - itemsInCurrentBatch;
  const remainingPauses =
    remainingItems > itemsToNextPause
      ? Math.floor((remainingItems - itemsToNextPause) / 150) + 1
      : 0;
  const estimatedRemainingSeconds = Math.round(activeSeconds + remainingPauses * 60);

  return {
    campaignId: campaign.id,
    status: campaign.status as MailerCampaignStatus,
    subject: campaign.subject,
    totalRecipients: total,
    sentCount: sent,
    failedCount: failed,
    suppressedCount: campaign.suppressed_count || 0,
    pendingCount: pending,
    processingCount: processing,
    cancelledCount: cancelled,
    currentBatch: campaign.current_batch || 1,
    totalBatches: campaign.total_batches || 1,
    batchSize: campaign.batch_size || 150,
    percentComplete,
    nextBatchAt: campaign.next_batch_at,
    startedAt: campaign.started_at,
    completedAt: campaign.completed_at,
    estimatedRemainingSeconds,
    lastError: campaign.last_error,
  };
}

/**
 * Pausa uma campanha ativa sem perder itens já enviados.
 */
export async function pauseCampaign(
  campaignId: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<{ success: boolean; message?: string }> {
  const admin = customAdmin || getAdminClient();
  const { error } = await admin
    .from("mailer_campaigns")
    .update({
      status: "paused",
      paused_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  if (error) return { success: false, message: error.message };
  return { success: true };
}

/**
 * Retoma uma campanha pausada imediatamente.
 */
export async function resumeCampaign(
  campaignId: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<{ success: boolean; message?: string }> {
  const admin = customAdmin || getAdminClient();
  const { data: campaign, error: readError } = await admin
    .from("mailer_campaigns")
    .select("status, last_error")
    .eq("id", campaignId)
    .maybeSingle();

  if (readError || !campaign) {
    return { success: false, message: readError?.message || "Campaign not found." };
  }
  if (campaign.status !== "paused") {
    return { success: false, message: "Only paused campaigns can be resumed." };
  }
  // A delivery accepted by Resend but not persisted cannot be replayed safely.
  if (campaign.last_error?.includes("Manual reconciliation required")) {
    return {
      success: false,
      message: "Manual reconciliation required before resuming this campaign.",
    };
  }

  const { error } = await admin
    .from("mailer_campaigns")
    .update({
      status: "running",
      paused_at: null,
      next_batch_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  if (error) return { success: false, message: error.message };
  return { success: true };
}

/**
 * Cancela uma campanha em andamento e todos os itens pendentes na fila.
 */
export async function cancelCampaign(
  campaignId: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<{ success: boolean; message?: string }> {
  const admin = customAdmin || getAdminClient();
  const now = new Date().toISOString();

  const { error: campErr } = await admin
    .from("mailer_campaigns")
    .update({
      status: "cancelled",
      cancelled_at: now,
    })
    .eq("id", campaignId);

  if (campErr) return { success: false, message: campErr.message };

  await admin
    .from("mailer_queue")
    .update({
      status: "cancelled",
      processed_at: now,
    })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "retry", "processing"]);

  return { success: true };
}

/**
 * Busca a campanha mais recente em andamento ou pausada (running, queued, paused) para restauração de UI.
 */
export async function getLatestActiveCampaign(
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<CampaignProgress | null> {
  const admin = customAdmin || getAdminClient();
  const { data: campaign } = await admin
    .from("mailer_campaigns")
    .select("id")
    .in("status", ["running", "queued", "paused"])
    .gt("total_recipients", 0)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!campaign) return null;
  return getCampaignQueueProgress(campaign.id, admin);
}

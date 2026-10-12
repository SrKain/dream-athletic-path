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
import type {
  MailerCampaign,
  MailerCampaignStatus,
  MailerQueueItem,
} from "@/types/db";

export const QUEUE_CONFIG = {
  DEFAULT_BATCH_SIZE: 150,
  PAUSE_BETWEEN_BATCHES_SEC: 60,
  ITEM_SPACING_MS: 400,
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

export interface ProcessQueueResult {
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  rateLimited: boolean;
  campaignCompleted?: boolean;
  activeCampaignId?: string;
  message?: string;
}

/**
 * Cria a campanha e enfileira atomicamente todos os envios em `mailer_queue`.
 * Garante idempotência por chave única `${campaignId}:${recipientEmail}`.
 */
export async function enqueueCampaignDispatches(
  input: SendMailerInput,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<EnqueueResult> {
  const admin = customAdmin || getAdminClient();
  const campaignId = crypto.randomUUID();
  const now = new Date().toISOString();

  const athleteIds = input.athleteIds || [];
  const validUuidAthleteIds = filterValidUuids(athleteIds);
  const mode = input.mode;

  // 1. Verificar lista de supressão (descadastros e pausas)
  const suppressedSet = await getSuppressedEmailSet();
  const activeRecipients: typeof input.recipients = [];
  const suppressedRecipients: typeof input.recipients = [];

  for (const r of input.recipients) {
    const cleanEmail = (r.email || "").toLowerCase().trim();
    if (suppressedSet.has(cleanEmail)) {
      suppressedRecipients.push(r);
    } else {
      activeRecipients.push(r);
    }
  }

  // 2. Registrar logs para destinatários suprimidos de saída
  if (suppressedRecipients.length > 0) {
    const suppressedLogs = suppressedRecipients.map((rec) => ({
      campaign_id: campaignId,
      athlete_id: athleteIds[0] ?? null,
      athlete_ids: validUuidAthleteIds,
      coach_id: rec.coachId ?? null,
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

  // 4. Carregar dados de atletas se necessário
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
    // Carregar atletas
    const loadedAthletes: RecruitEmailData[] = [];
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
          ? admin.from("countries").select("name_en, flag_emoji").eq("code", athlete.nationality).maybeSingle()
          : Promise.resolve({ data: null }),
        admin
          .from("athlete_videos")
          .select("youtube_url")
          .eq("athlete_id", athId)
          .eq("kind", "highlight")
          .limit(1)
          .maybeSingle(),
      ]);

      loadedAthletes.push({
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
        highlightVideoUrl: videoRes.data?.youtube_url || profileRes.data?.highlight_video_url || null,
        recipientEmail: "",
      });
    }

    const loadedAthleteIds = filterValidUuids(loadedAthletes.map((a) => a.athleteId));

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
          ? admin.from("countries").select("name_en, flag_emoji").eq("code", athlete.nationality).maybeSingle()
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
        highlightVideoUrl: videoRes.data?.youtube_url || profileRes.data?.highlight_video_url || null,
        recipientEmail: "",
      };

      for (const rec of activeRecipients) {
        const { subject, html, text } = renderRecruitEmail({
          ...singleData,
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
  const initialStatus: MailerCampaignStatus = activeRecipients.length > 0 ? "running" : "completed";

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
    next_batch_at: now, // Começa imediatamente
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
      }
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
    status: initialStatus,
  };
}

/**
 * Worker do backend responsável por reservar e processar itens da fila com controle de taxa global.
 */
export async function processMailerQueue(options?: {
  workerId?: string;
  maxBatchSize?: number;
  itemSpacingMs?: number;
  ignoreCooldown?: boolean;
  customAdmin?: ReturnType<typeof getAdminClient>;
}): Promise<ProcessQueueResult> {
  const admin = options?.customAdmin || getAdminClient();
  const workerId = options?.workerId || `worker-${crypto.randomBytes(4).toString("hex")}`;
  const maxBatchSize = options?.maxBatchSize || QUEUE_CONFIG.DEFAULT_BATCH_SIZE;
  const spacingMs =
    options?.itemSpacingMs !== undefined ? options.itemSpacingMs : QUEUE_CONFIG.ITEM_SPACING_MS;

  // 1. Recuperar itens órfãos (stale processing)
  try {
    await admin.rpc("recover_stale_mailer_queue_reservations");
  } catch {
    // Fallback gracioso se a RPC não existir ainda no banco
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

  // 2. Verificar limite global do provedor (mailer_rate_limits)
  const { data: rateLimit } = await admin
    .from("mailer_rate_limits")
    .select("*")
    .eq("id", "global_resend_limit")
    .maybeSingle();

  const now = new Date();

  if (rateLimit?.locked_until && new Date(rateLimit.locked_until) > now) {
    console.warn(`[mailer-queue] Global rate limit locked until ${rateLimit.locked_until}. Skipping tick.`);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: true,
      message: `Global rate limit active until ${rateLimit.locked_until}`,
    };
  }

  // 3. Buscar primeira campanha em execução (running)
  const { data: activeCampaign, error: campErr } = await admin
    .from("mailer_campaigns")
    .select("*")
    .eq("status", "running")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (campErr || !activeCampaign) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: false,
      message: "No active running campaigns found.",
    };
  }

  // 4. Verificar se a pausa de 60s entre lotes foi respeitada
  if (!options?.ignoreCooldown && activeCampaign.next_batch_at && new Date(activeCampaign.next_batch_at) > now) {
    const waitSeconds = Math.ceil((new Date(activeCampaign.next_batch_at).getTime() - now.getTime()) / 1000);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: false,
      activeCampaignId: activeCampaign.id,
      message: `Waiting for cooldown window (${waitSeconds}s remaining).`,
    };
  }

  // 5. Reservar atomicamente itens da fila
  let claimedItems: MailerQueueItem[] = [];

  try {
    const { data: rpcClaimed, error: rpcErr } = await admin.rpc("claim_mailer_queue_batch", {
      p_worker_id: workerId,
      p_batch_size: maxBatchSize,
      p_lock_duration_sec: QUEUE_CONFIG.LOCK_DURATION_SEC,
    });

    if (!rpcErr && rpcClaimed && Array.isArray(rpcClaimed)) {
      claimedItems = rpcClaimed as MailerQueueItem[];
    }
  } catch {
    // Fallback se a RPC falhar
  }

  if (!claimedItems || claimedItems.length === 0) {
    // Tentar reserva direta se a RPC não estiver disponível
    const { data: pendingItems } = await admin
      .from("mailer_queue")
      .select("*")
      .eq("campaign_id", activeCampaign.id)
      .in("status", ["pending", "retry"])
      .order("batch_number", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(maxBatchSize);

    if (pendingItems && pendingItems.length > 0) {
      const itemIds = pendingItems.map((p) => p.id);
      const lockUntil = new Date(Date.now() + QUEUE_CONFIG.LOCK_DURATION_SEC * 1000).toISOString();

      const { data: updated } = await admin
        .from("mailer_queue")
        .update({
          status: "processing",
          reserved_by: workerId,
          reserved_at: now.toISOString(),
          reservation_expires_at: lockUntil,
        })
        .in("id", itemIds)
        .select("*");

      if (updated) {
        claimedItems = updated as MailerQueueItem[];
      }
    }
  }

  // Se não houver itens para processar, verificar se a campanha já foi concluída
  if (claimedItems.length === 0) {
    const { count: pendingCount } = await admin
      .from("mailer_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", activeCampaign.id)
      .in("status", ["pending", "processing", "retry"]);

    if (!pendingCount || pendingCount === 0) {
      await admin
        .from("mailer_campaigns")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", activeCampaign.id);

      return {
        processed: 0,
        sent: 0,
        failed: 0,
        retried: 0,
        rateLimited: false,
        campaignCompleted: true,
        activeCampaignId: activeCampaign.id,
        message: "Campaign completed. All items processed.",
      };
    }

    return {
      processed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      rateLimited: false,
      activeCampaignId: activeCampaign.id,
      message: "No claimable items at this time.",
    };
  }

  // 6. Envio dos itens reservados via Resend com controle de taxa e retry
  const resendClient = getResendClient();
  const resendConfig = getResendConfig();
  const from = resendConfig.from;

  let sentCount = 0;
  let failedCount = 0;
  let retriedCount = 0;
  let rateLimited = false;

  for (const item of claimedItems) {
    if (rateLimited) {
      // Liberar itens restantes para 'retry' se entramos em rate limit
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

      // Espaçamento nominal de segurança entre itens
      if (spacingMs > 0 && claimedItems.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, spacingMs));
      }


      const resendRes = await resendClient.emails.send({
        from,
        to: [item.recipient_email],
        subject: item.subject,
        html: payload.html || "",
        text: payload.text || "",
        tags: payload.tags || [],
      });

      if (resendRes.error) {
        throw new Error(resendRes.error.message || "Failed to send email via Resend");
      }

      const providerId = resendRes.data?.id || null;
      const processedAt = new Date().toISOString();

      // Sucesso: marcar como 'sent' em mailer_queue
      await admin
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

      // Inserir log correspondente em recruit_email_logs
      await admin.from("recruit_email_logs").insert({
        campaign_id: item.campaign_id,
        athlete_id: payload.athleteId || null,
        athlete_ids: payload.athleteIds || [],
        coach_id: item.coach_id,
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

        // Travar limite global
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
        const nextAttempts = (item.attempts || 1);
        if (nextAttempts >= item.max_attempts) {
          // Falha definitiva
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

          await admin.from("recruit_email_logs").insert({
            campaign_id: item.campaign_id,
            athlete_id: payload.athleteId || null,
            athlete_ids: payload.athleteIds || [],
            coach_id: item.coach_id,
            subject: item.subject,
            status: "failed",
            error_message: errorMessage,
            sent_at: processedAt,
            email_type: item.email_type,
            recipient_email: item.recipient_email,
            recipient_name: item.recipient_name,
            university_name: item.university_name,
          });

          failedCount++;
        } else {
          // Retry com backoff exponencial e jitter
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

  // 7. Atualizar contadores da campanha
  const { data: updatedCounts } = await admin
    .from("mailer_queue")
    .select("status")
    .eq("campaign_id", activeCampaign.id);

  let newSent = 0;
  let newFailed = 0;
  let newPending = 0;

  if (updatedCounts) {
    for (const c of updatedCounts) {
      if (c.status === "sent") newSent++;
      else if (c.status === "failed") newFailed++;
      else if (c.status === "pending" || c.status === "retry" || c.status === "processing") {
        newPending++;
      }
    }
  }

  const isCompleted = newPending === 0;
  const nextBatchTime = isCompleted
    ? null
    : new Date(Date.now() + QUEUE_CONFIG.PAUSE_BETWEEN_BATCHES_SEC * 1000).toISOString();

  await admin
    .from("mailer_campaigns")
    .update({
      sent_count: newSent,
      failed_count: newFailed,
      current_batch: (activeCampaign.current_batch || 1) + 1,
      status: isCompleted ? "completed" : "running",
      completed_at: isCompleted ? new Date().toISOString() : null,
      next_batch_at: nextBatchTime,
    })
    .eq("id", activeCampaign.id);

  // Atualizar último batch no rate limits
  await admin
    .from("mailer_rate_limits")
    .update({
      last_batch_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", "global_resend_limit");

  return {
    processed: claimedItems.length,
    sent: sentCount,
    failed: failedCount,
    retried: retriedCount,
    rateLimited,
    campaignCompleted: isCompleted,
    activeCampaignId: activeCampaign.id,
  };
}

/**
 * Consulta progresso e status detalhado de uma campanha.
 */
export async function getCampaignQueueProgress(
  campaignId: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<CampaignProgress | null> {
  const admin = customAdmin || getAdminClient();

  const { data: campaign, error } = await admin
    .from("mailer_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !campaign) {
    return null;
  }

  // Obter contagem exata por status na fila
  const { data: queueItems } = await admin
    .from("mailer_queue")
    .select("status")
    .eq("campaign_id", campaignId);

  let sent = 0;
  let failed = 0;
  let pending = 0;
  let processing = 0;
  let cancelled = 0;

  if (queueItems) {
    for (const item of queueItems) {
      if (item.status === "sent") sent++;
      else if (item.status === "failed") failed++;
      else if (item.status === "pending" || item.status === "retry") pending++;
      else if (item.status === "processing") processing++;
      else if (item.status === "cancelled") cancelled++;
    }
  }

  const total = campaign.total_recipients || sent + failed + pending + processing + cancelled;
  const processed = sent + failed + cancelled;
  const percentComplete = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  // Estimativa de tempo restante
  const remainingItems = pending + processing;
  const remainingBatches = Math.ceil(remainingItems / (campaign.batch_size || 150));
  const estimatedRemainingSeconds = remainingBatches * (campaign.delay_between_batches_sec || 60);

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
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!campaign) return null;
  return getCampaignQueueProgress(campaign.id, admin);
}

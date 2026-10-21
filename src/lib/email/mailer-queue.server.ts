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
import { loadAthletesEmailData, assertAthleteEmailFields } from "./athlete-email-data.server";
import {
  composeEmailBlocks,
  getEmailBlockText,
  reconcileEmailBlocks,
  assertEmailIntegrity,
} from "./email-blocks";
import { EMAIL_SIGNATURE } from "./email-brand";
import {
  chunkIdempotencyKey,
  getRetryAfterSeconds,
  isRateLimitError,
  isAmbiguousProviderError,
  nextBurstSize,
} from "./mailer-burst";
import type { MailerCampaign, MailerCampaignStatus, MailerQueueItem } from "@/types/db";

function boundedEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    console.warn(`[mailer-queue] Invalid ${name}; using safe default.`);
    return fallback;
  }
  return value;
}

export const QUEUE_CONFIG = {
  BURST_SIZE: boundedEnvInt("MAILER_BURST_SIZE", 300, 1, 300),
  BURST_PAUSE_MS: boundedEnvInt("MAILER_BURST_PAUSE_MS", 1000, 1000, 60000),
  MAX_ATTEMPTS: 3,
  LOCK_DURATION_SEC: 360,
  LEASE_DURATION_SEC: 360,
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
  effectiveBurstSize?: number;
  burstPauseMs?: number;
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

  // Validate all athletes before writing logs, campaigns or queue rows.
  // Load once for the entire campaign, independently of recipient count.
  let loadedAthleteData: RecruitEmailData[] = [];
  if (mode !== "catalog") {
    try {
      if (athleteIds.length === 0) throw new Error("Select at least one athlete.");
      loadedAthleteData = await loadAthletesEmailData(athleteIds, admin);
      assertAthleteEmailFields(loadedAthleteData, athleteIds);
    } catch (error) {
      return {
        success: false,
        campaignId,
        totalRecipients: input.recipients.length,
        totalEnqueued: 0,
        totalSuppressed: 0,
        totalBatches: 0,
        batchSize: QUEUE_CONFIG.BURST_SIZE,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to validate athlete fields.",
      };
    }
  }

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
        batchSize: QUEUE_CONFIG.BURST_SIZE,
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

  const batchSize = QUEUE_CONFIG.BURST_SIZE;
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

  try {
    if (mode === "catalog") {
      const headline = customOptions?.headline || catalogOptions?.customHeadline;
      const message = customOptions?.message ?? catalogOptions?.customMessage;

      for (const rec of activeRecipients) {
        const { subject, html, text } = renderCatalogEmail({
          coachName: rec.name,
          coachLastName: rec.lastName,
          customSubject: customOptions?.subject,
          institutionName: rec.universityName,
          customHeadline: headline,
          customMessage: message,
          customGreeting: customOptions?.greeting,
          customHook: customOptions?.hook,
          recipientEmail: rec.email,
          coachId: rec.coachId,
          logoUrl,
          heroBackgroundUrl,
          campaignId,
        });

        assertEmailIntegrity({
          mode: "catalog",
          html,
          text,
          expectedHeadline:
            headline?.trim() || "GO TEAM GO AGENCY — VERIFIED INTERNATIONAL RECRUITS",
          expectedHook: customOptions?.hook,
          expectedMessage:
            message?.trim() ||
            "Go Team Go connects verified international volleyball prospects with top US college programs, ensuring complete athletic and academic qualification.",
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
      const loadedAthletes = loadedAthleteData;
      const loadedAthleteIds = filterValidUuids(loadedAthletes.map((athlete) => athlete.athleteId));
      const cardOrder = reconcileEmailBlocks(emailBlocks, loadedAthleteIds)
        .filter((block) => block.type === "athlete")
        .map((block) => (block.type === "athlete" ? block.athleteId : ""));
      const reconciledBlocks = composeEmailBlocks({
        opening: customOptions?.hook,
        closing: customOptions?.introduction,
        athleteIds: loadedAthleteIds,
        cardOrder,
      });

      for (const rec of activeRecipients) {
        const renderResult = renderMultiAthleteRecruitEmail({
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
          blocks: reconciledBlocks.length > 0 ? reconciledBlocks : undefined,
          logoUrl,
          heroBackgroundUrl,
          campaignId,
        });

        assertEmailIntegrity({
          mode: "multi_athlete",
          expectedAthleteIds: loadedAthleteIds,
          renderedAthleteIds: renderResult.renderedAthleteIds,
          missingAthleteIds: renderResult.missingAthleteIds,
          expectedOpeningText:
            reconciledBlocks[1]?.type === "text" ? reconciledBlocks[1].content : null,
          expectedClosingText: getEmailBlockText(reconciledBlocks[reconciledBlocks.length - 1]),
          html: renderResult.html,
          text: renderResult.text,
        });

        const { subject, html, text } = renderResult;

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
      for (const singleData of loadedAthleteData) {
        const athId = singleData.athleteId!;
        const reconciledBlocks = composeEmailBlocks({
          opening: customOptions?.hook,
          closing: customOptions?.introduction,
          athleteIds: [athId],
        });

        for (const rec of activeRecipients) {
          const renderResult = renderRecruitEmail({
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
            blocks: reconciledBlocks.length > 0 ? reconciledBlocks : undefined,
            logoUrl,
            heroBackgroundUrl,
            campaignId,
          });

          assertEmailIntegrity({
            mode: "single_athlete",
            expectedAthleteIds: [athId],
            renderedAthleteIds: renderResult.renderedAthleteIds,
            missingAthleteIds: renderResult.missingAthleteIds,
            expectedOpeningText:
              reconciledBlocks[1]?.type === "text" ? reconciledBlocks[1].content : null,
            expectedClosingText: getEmailBlockText(reconciledBlocks[reconciledBlocks.length - 1]),
            html: renderResult.html,
            text: renderResult.text,
          });

          const { subject, html, text } = renderResult;

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
  } catch (error) {
    return {
      success: false,
      campaignId,
      totalRecipients: input.recipients.length,
      totalEnqueued: 0,
      totalSuppressed: suppressedRecipients.length,
      totalBatches: 0,
      batchSize: QUEUE_CONFIG.BURST_SIZE,
      status: "failed",
      message:
        error instanceof Error ? error.message : "Failed email integrity check before enqueueing.",
    };
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
    delay_between_batches_sec: QUEUE_CONFIG.BURST_PAUSE_MS / 1000,
    delay_between_items_ms: 0,
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

  // Integrity verified while rendering/enqueueing; no additional pre-send database scan.
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
 * Cancela preventivamente itens da fila pendentes ou em retry que estejam corrompidos
 * (sem o card de atleta / QUICK FACTS no payload HTML).
 */
export async function sanitizePendingQueueItemsMissingCards(
  campaignId?: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<number> {
  const admin = customAdmin || getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = admin
    .from("mailer_queue")
    .select("id, payload, email_type")
    .in("status", ["pending", "retry"]);

  if (typeof query.neq === "function") {
    query = query.neq("email_type", "catalog_general");
  }

  if (campaignId && UUID_REGEX.test(campaignId.trim())) {
    if (typeof query.eq === "function") {
      query = query.eq("campaign_id", campaignId.trim());
    }
  }

  const { data: items, error } = await query;
  if (error || !items) return 0;

  const corruptedIds: string[] = [];
  for (const item of items) {
    if (item.email_type === "catalog_general") continue;
    const payload = (item.payload || {}) as { html?: string };
    if (!payload.html?.includes("QUICK FACTS") || !payload.html?.includes("VIEW FULL PROFILE")) {
      corruptedIds.push(item.id);
    }
  }

  if (corruptedIds.length === 0) return 0;

  const { error: updateError } = await admin
    .from("mailer_queue")
    .update({
      status: "cancelled",
      last_error: "cancelled_missing_card",
      error_code: "INTEGRITY_MISSING_CARD",
      processed_at: new Date().toISOString(),
    })
    .in("id", corruptedIds);

  if (updateError) {
    console.error("[mailer-queue] Failed to cancel corrupted queue items:", updateError);
    return 0;
  }

  console.info(
    `[mailer-queue] Cancelled ${corruptedIds.length} corrupted queue items missing athlete cards.`,
  );
  return corruptedIds.length;
}

/** Executes one bounded, campaign-scoped burst. No Resend call may be made by a test. */
export async function processMailerQueue(
  options: ProcessQueueOptions,
): Promise<ProcessQueueResult> {
  const admin = options?.customAdmin || getAdminClient();
  const campaignId = options?.campaignId?.trim();
  const empty = (extra: Partial<ProcessQueueResult> = {}): ProcessQueueResult => ({
    processed: 0,
    sent: 0,
    failed: 0,
    retried: 0,
    rateLimited: false,
    effectiveBurstSize: QUEUE_CONFIG.BURST_SIZE,
    burstPauseMs: QUEUE_CONFIG.BURST_PAUSE_MS,
    activeCampaignId: campaignId,
    ...extra,
  });
  if (!campaignId || !UUID_REGEX.test(campaignId))
    return empty({ message: "Valid campaignId is required." });

  const workerId = options?.workerId || `browser-${crypto.randomBytes(8).toString("hex")}`;
  const controllerId = options?.clientId?.trim() || workerId;
  const requestedSize = Math.max(
    1,
    Math.min(
      QUEUE_CONFIG.BURST_SIZE,
      Math.floor(Number(options?.maxBatchSize) || QUEUE_CONFIG.BURST_SIZE),
    ),
  );

  // Lease must be acquired before ANY provider work. Long enough for a full burst/fallback.
  const lease = await admin.rpc("acquire_mailer_campaign_lease", {
    p_campaign_id: campaignId,
    p_controller_id: controllerId,
    p_lease_seconds: QUEUE_CONFIG.LEASE_DURATION_SEC,
  });
  if (lease.error || lease.data !== true) {
    return empty({
      controllerConflict: lease.data === false && !lease.error,
      message: lease.error?.message || "Another tab controls this campaign.",
    });
  }

  const { data: campaign, error: campaignError } = await admin
    .from("mailer_campaigns")
    .select("id,status,batch_size,next_batch_at,total_recipients")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError || !campaign)
    return empty({ message: campaignError?.message || "Campaign not found." });
  const effectiveSize = Math.min(
    requestedSize,
    Math.max(1, Number(campaign.batch_size) || QUEUE_CONFIG.BURST_SIZE),
  );
  const stopped = ["paused", "cancelled", "completed", "failed"].includes(campaign.status);
  if (stopped) {
    return empty({
      effectiveBurstSize: effectiveSize,
      campaignStatus: campaign.status,
      campaignCompleted: campaign.status === "completed",
      progress: await getCampaignQueueProgress(campaignId, admin),
    });
  }

  const { data: limit, error: limitError } = await admin
    .from("mailer_rate_limits")
    .select("locked_until")
    .eq("id", "global_resend_limit")
    .maybeSingle();
  if (limitError)
    return empty({ message: `Cannot verify provider rate limit: ${limitError.message}` });
  const now = Date.now();
  const notBefore = Math.max(
    limit?.locked_until ? new Date(limit.locked_until).getTime() : 0,
    campaign.next_batch_at ? new Date(campaign.next_batch_at).getTime() : 0,
  );
  if (notBefore > now) {
    const wait = Math.ceil((notBefore - now) / 1000);
    return empty({
      effectiveBurstSize: effectiveSize,
      rateLimited: !!limit?.locked_until && new Date(limit.locked_until).getTime() > now,
      cooldownActive: true,
      cooldownRemainingSec: wait,
      campaignStatus: campaign.status,
    });
  }

  const claim = await admin.rpc("claim_mailer_queue_batch", {
    p_worker_id: workerId,
    p_batch_size: effectiveSize,
    p_lock_duration_sec: QUEUE_CONFIG.LOCK_DURATION_SEC,
    p_campaign_id: campaignId,
  });
  if (claim.error || !Array.isArray(claim.data)) {
    return empty({
      effectiveBurstSize: effectiveSize,
      message: claim.error?.message || "Invalid queue reservation.",
    });
  }
  const items = claim.data as MailerQueueItem[];
  if (!items.length) {
    const progress = await getCampaignQueueProgress(campaignId, admin);
    if (!progress) return empty({ message: "Could not read campaign progress." });
    if (progress.pendingCount + progress.processingCount === 0) {
      const { error } = await admin
        .from("mailer_campaigns")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          next_batch_at: null,
        })
        .eq("id", campaignId)
        .eq("status", "running");
      if (error) return empty({ message: error.message });
      return empty({
        campaignStatus: "completed",
        campaignCompleted: true,
        progress: await getCampaignQueueProgress(campaignId, admin),
        effectiveBurstSize: effectiveSize,
      });
    }
    // Recovery is only needed when there is no claimable work, not once per burst.
    if (progress.processingCount > 0) await admin.rpc("recover_stale_mailer_queue_reservations");
    return empty({
      progress,
      campaignStatus: "running",
      effectiveBurstSize: effectiveSize,
      cooldownActive: true,
      cooldownRemainingSec: 1,
    });
  }

  type ResultRow = {
    id: string;
    status: "sent" | "retry" | "failed" | "cancelled";
    provider_id: string | null;
    error_code: string | null;
    error_message: string | null;
    next_retry_at: string | null;
  };
  type ReadyItem = {
    item: MailerQueueItem;
    payload: {
      html?: string;
      text?: string;
      tags?: ResendTag[];
    };
  };
  const results: ResultRow[] = [];
  const ready: ReadyItem[] = [];
  const record = (
    item: MailerQueueItem,
    status: ResultRow["status"],
    providerId: string | null = null,
    message: string | null = null,
    code: string | null = null,
    retryAt: string | null = null,
  ) => {
    results.push({
      id: item.id,
      status,
      provider_id: providerId,
      error_message: message,
      error_code: code,
      next_retry_at: retryAt,
    });
  };
  const retry = (item: MailerQueueItem, error: string, code: string, nextAt?: string) => {
    if (item.attempts >= item.max_attempts && code !== "429") {
      record(item, "failed", null, error, code);
    } else {
      const delayMs = Math.min(300000, Math.pow(2, item.attempts || 1) * 2000);
      record(
        item,
        "retry",
        null,
        error,
        code,
        nextAt || new Date(Date.now() + delayMs).toISOString(),
      );
    }
  };

  for (const item of items) {
    const payload = (item.payload || {}) as ReadyItem["payload"];
    if (item.provider_message_id) {
      record(item, "sent", item.provider_message_id);
    } else if (
      item.email_type !== "catalog_general" &&
      (!payload.html?.includes("QUICK FACTS") || !payload.html?.includes("VIEW FULL PROFILE"))
    ) {
      record(item, "cancelled", null, "cancelled_missing_card", "INTEGRITY_MISSING_CARD");
    } else if (!payload.html || !item.recipient_email) {
      record(item, "cancelled", null, "Invalid email snapshot", "INVALID_PAYLOAD");
    } else {
      ready.push({ item, payload });
    }
  }

  const resendClient = getResendClient();
  const config = getResendConfig();
  let rateLimited = false;
  let retryAfterSec = 0;
  let quarantineReason: string | null = null;

  // SDK errors may expose Retry-After in different shapes; conservative 60s fallback.
  const rateLimit = (error: unknown) => {
    rateLimited = true;
    const err = error as {
      retryAfter?: string | number;
      headers?: { get?: (name: string) => string | null };
      message?: string;
    };
    retryAfterSec = Math.max(
      retryAfterSec,
      getRetryAfterSeconds(
        err?.headers?.get?.("retry-after") ??
          err?.retryAfter ??
          err?.message?.match(/retry.after[^0-9]*(\\d+)/i)?.[1],
        60,
      ),
    );
  };

  if (!resendClient || !config.isConfigured) {
    for (const { item } of ready) retry(item, "Resend not configured", "CONFIG_ERROR");
  } else {
    const sorted = [...ready].sort((a, b) =>
      a.item.idempotency_key.localeCompare(b.item.idempotency_key),
    );
    const chunks: ReadyItem[][] = [];
    for (let i = 0; i < sorted.length; i += 100) chunks.push(sorted.slice(i, i + 100));

    await Promise.all(
      chunks.map(async (chunk) => {
        const payload = chunk.map(({ item, payload: body }) => ({
          from: config.from,
          to: [item.recipient_email],
          subject: item.subject,
          html: body.html || "",
          text: body.text || "",
          replyTo: EMAIL_SIGNATURE.email,
          tags: body.tags || [],
          headers: { "X-Entity-Ref-ID": item.idempotency_key },
        }));
        const key = chunkIdempotencyKey(
          campaignId,
          chunk.map(({ item }) => item.idempotency_key),
        );

        try {
          const response = await resendClient.batch.send(payload, { idempotencyKey: key });
          if (response.error) throw response.error;
          const ids = response.data?.data;
          if (
            !Array.isArray(ids) ||
            ids.length !== chunk.length ||
            ids.some((entry) => !entry?.id)
          ) {
            quarantineReason =
              "Batch response did not confirm every provider message. Manual reconciliation required.";
            for (const { item } of chunk) retry(item, quarantineReason, "PROVIDER_AMBIGUOUS");
            return;
          }
          chunk.forEach(({ item }, i) => record(item, "sent", ids[i].id));
          return;
        } catch (error) {
          if (isRateLimitError(error)) {
            rateLimit(error);
            for (const { item } of chunk)
              retry(
                item,
                "Resend 429 rate limit",
                "429",
                new Date(Date.now() + retryAfterSec * 1000).toISOString(),
              );
            return;
          }
          if (isAmbiguousProviderError(error)) {
            quarantineReason = "Ambiguous Resend batch acceptance. Manual reconciliation required.";
            for (const { item } of chunk) retry(item, quarantineReason, "PROVIDER_AMBIGUOUS");
            return;
          }
          // Explicitly rejected batch: bounded individual fallback with per-item keys.
          for (const { item, payload: body } of chunk) {
            if (rateLimited || quarantineReason) {
              retry(
                item,
                "Dispatch suspended",
                "429",
                new Date(Date.now() + Math.max(1, retryAfterSec) * 1000).toISOString(),
              );
              continue;
            }
            try {
              const individual = await resendClient.emails.send(
                {
                  from: config.from,
                  to: [item.recipient_email],
                  subject: item.subject,
                  html: body.html || "",
                  text: body.text || "",
                  replyTo: EMAIL_SIGNATURE.email,
                  tags: body.tags || [],
                  headers: { "X-Entity-Ref-ID": item.idempotency_key },
                },
                { idempotencyKey: item.idempotency_key },
              );
              if (individual.error) throw individual.error;
              if (!individual.data?.id) {
                quarantineReason =
                  "Individual provider acceptance ambiguous. Manual reconciliation required.";
                retry(item, quarantineReason, "PROVIDER_AMBIGUOUS");
                continue;
              }
              record(item, "sent", individual.data.id);
            } catch (individualError) {
              if (isRateLimitError(individualError)) {
                rateLimit(individualError);
                retry(
                  item,
                  "Resend 429 rate limit",
                  "429",
                  new Date(Date.now() + retryAfterSec * 1000).toISOString(),
                );
              } else if (isAmbiguousProviderError(individualError)) {
                quarantineReason =
                  "Ambiguous individual provider acceptance. Manual reconciliation required.";
                retry(item, quarantineReason, "PROVIDER_AMBIGUOUS");
              } else {
                retry(
                  item,
                  individualError instanceof Error
                    ? individualError.message
                    : String((individualError as { message?: string })?.message || "Send failed"),
                  "SEND_ERROR",
                );
              }
            }
          }
        }
      }),
    );
  }

  const reducedSize = nextBurstSize(effectiveSize, rateLimited);
  const confirmed = results.filter((r) => r.status === "sent").length;
  const { data: completed, error: persistenceError } = await admin.rpc("complete_mailer_burst", {
    p_campaign_id: campaignId,
    p_worker_id: workerId,
    p_results: results,
    p_next_size: reducedSize,
    p_pause_ms: QUEUE_CONFIG.BURST_PAUSE_MS,
    p_lock_until: rateLimited ? new Date(Date.now() + retryAfterSec * 1000).toISOString() : null,
  });
  if (persistenceError || !completed || Number(completed.updated) !== items.length) {
    const message = `Resend may have accepted ${confirmed} messages, but burst persistence failed. Manual reconciliation required. ${persistenceError?.message || ""}`;
    await admin
      .from("mailer_campaigns")
      .update({
        status: "paused",
        last_error: message,
        next_batch_at: null,
      })
      .eq("id", campaignId);
    return empty({
      sent: confirmed,
      processed: items.length,
      effectiveBurstSize: reducedSize,
      campaignStatus: "paused",
      message,
    });
  }
  if (quarantineReason) {
    await admin
      .from("mailer_campaigns")
      .update({
        status: "paused",
        last_error: quarantineReason,
        next_batch_at: null,
      })
      .eq("id", campaignId);
  }

  const progress = await getCampaignQueueProgress(campaignId, admin);
  const campaignStatus = quarantineReason ? "paused" : progress?.status;
  return {
    processed: items.length,
    sent: confirmed,
    failed: results.filter((r) => r.status === "failed").length,
    retried: results.filter((r) => r.status === "retry").length,
    rateLimited,
    effectiveBurstSize: reducedSize,
    burstPauseMs: QUEUE_CONFIG.BURST_PAUSE_MS,
    cooldownActive: rateLimited,
    cooldownRemainingSec: rateLimited ? retryAfterSec : undefined,
    campaignStatus,
    campaignCompleted: campaignStatus === "completed",
    activeCampaignId: campaignId,
    progress,
    message:
      quarantineReason ||
      (rateLimited ? `Resend 429: next burst reduced to ${reducedSize}.` : undefined),
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
      const remainingBursts = Math.ceil(
        remainingItems / Math.max(1, Number(s.batch_size) || QUEUE_CONFIG.BURST_SIZE),
      );
      const elapsed = s.started_at
        ? (Date.now() - new Date(String(s.started_at)).getTime()) / 1000
        : 0;
      const priorBursts = Math.max(1, (Number(s.current_batch) || 1) - 1);
      const secondsPerBurst = sent > 0 ? Math.max(0.5, elapsed / priorBursts) : 1.5;
      const estimatedRemainingSeconds = Math.ceil(
        remainingBursts * secondsPerBurst +
          (Math.max(0, remainingBursts - 1) * QUEUE_CONFIG.BURST_PAUSE_MS) / 1000,
      );

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
        batchSize: Number(s.batch_size) || QUEUE_CONFIG.BURST_SIZE,
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
  const remainingBursts = Math.ceil(
    remainingItems / Math.max(1, campaign.batch_size || QUEUE_CONFIG.BURST_SIZE),
  );
  const elapsed = campaign.started_at
    ? (Date.now() - new Date(campaign.started_at).getTime()) / 1000
    : 0;
  const priorBursts = Math.max(1, (campaign.current_batch || 1) - 1);
  const secondsPerBurst = sent > 0 ? Math.max(0.5, elapsed / priorBursts) : 1.5;
  const estimatedRemainingSeconds = Math.ceil(
    remainingBursts * secondsPerBurst +
      (Math.max(0, remainingBursts - 1) * QUEUE_CONFIG.BURST_PAUSE_MS) / 1000,
  );

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
    batchSize: campaign.batch_size || QUEUE_CONFIG.BURST_SIZE,
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

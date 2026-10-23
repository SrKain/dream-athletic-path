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
import { getMailProvider, type BatchEmailItem } from "./mail-provider.server";
import { isDeliverableEmailSyntax } from "./email-syntax";
import { checkDomainsWithCache } from "./domain-hygiene.server";
import {
  createCampaignSnapshot,
  renderQueuedEmail,
  type MailerCampaignSnapshot,
} from "./mailer-snapshot";
import { getUnsubscribeHeaders } from "./unsubscribe-token";
import type { MailerCampaign, MailerCampaignStatus, MailerQueueItem } from "@/types/db";
import { canEstimateMailerEta, deriveCampaignSubstate } from "./mailer-health";
import { isMailerWorkerEnabled } from "./mailer-worker-auth";

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
  BROWSER_BATCH_SIZE: boundedEnvInt("MAILER_BROWSER_BATCH_SIZE", 100, 1, 300),
  BURST_PAUSE_MS: boundedEnvInt("MAILER_BURST_PAUSE_MS", 1000, 1000, 60000),
  MAX_ATTEMPTS: 3,
  LOCK_DURATION_SEC: 60,
  LEASE_DURATION_SEC: 30,
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
  estimatedRemainingSeconds: number | null;
  lastError: string | null;
  substate?: string;
  substateLabel?: string;
  substateDescription?: string;
  lastProgressAt?: string | null;
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
export interface CreateCampaignDraftInput {
  mode: "single_athlete" | "multi_athlete" | "catalog";
  athleteIds?: string[];
  customOptions?: SendMailerInput["customOptions"];
  catalogOptions?: SendMailerInput["catalogOptions"];
  blocks?: SendMailerInput["blocks"];
  createdBy?: string;
  filters?: Record<string, unknown>;
}

export interface CreateCampaignDraftResult {
  success: boolean;
  campaignId: string;
  mode: "single_athlete" | "multi_athlete" | "catalog";
  subject: string;
  status: "draft";
  message?: string;
}

export interface AppendRecipientsInput {
  campaignId: string;
  recipients: Array<{
    email: string;
    name: string;
    lastName?: string;
    universityName?: string;
    coachId?: string;
  }>;
}

export interface AppendRecipientsResult {
  success: boolean;
  campaignId: string;
  appended: number;
  suppressed: number;
  invalidSyntax: number;
  totalNow: number;
  message?: string;
}

export interface ActivateCampaignResult {
  success: boolean;
  campaignId: string;
  status: MailerCampaignStatus;
  totalRecipients: number;
  message?: string;
}

/**
 * Fase 1 da criação de campanha: Cria o rascunho com snapshot imutável e valida integridade.
 * Executa em < 1 segundo e consome < 10 MB de memória mesmo para campanhas gigantes.
 */
export async function createCampaignDraft(
  input: CreateCampaignDraftInput,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<CreateCampaignDraftResult> {
  const admin = customAdmin || getAdminClient();
  const campaignId = crypto.randomUUID();
  const now = new Date().toISOString();
  const mode = input.mode;
  const athleteIds = input.athleteIds || [];
  const validUuidAthleteIds = filterValidUuids(athleteIds);

  let loadedAthletes: RecruitEmailData[] = [];
  if (mode !== "catalog") {
    if (athleteIds.length === 0) {
      throw new Error("Select at least one athlete.");
    }
    loadedAthletes = await loadAthletesEmailData(athleteIds, admin);
    assertAthleteEmailFields(loadedAthletes, athleteIds);
  }

  // Obter configurações visuais da agência
  const { data: visualData } = await admin
    .from("agency_visual_settings")
    .select("logo_url, hero_background_url")
    .limit(1)
    .maybeSingle();

  const logoUrl = visualData?.logo_url ?? null;
  const heroBackgroundUrl = visualData?.hero_background_url ?? null;

  const canonicalBlocks =
    mode !== "catalog" && (input.customOptions?.hook || input.customOptions?.introduction)
      ? composeEmailBlocks({
          opening: input.customOptions?.hook,
          closing: input.customOptions?.introduction,
          athleteIds: validUuidAthleteIds,
        })
      : input.blocks || null;

  // Montar snapshot imutável da campanha
  const snapshot = createCampaignSnapshot({
    mode,
    subjectTemplate: input.customOptions?.subject || null,
    customGreeting: input.customOptions?.greeting || null,
    customIntroduction: input.customOptions?.introduction || null,
    customHook: input.customOptions?.hook || null,
    customHeadline: input.customOptions?.headline || input.catalogOptions?.customHeadline || null,
    customMessage: input.customOptions?.message ?? input.catalogOptions?.customMessage ?? null,
    blocks: canonicalBlocks,
    athlete: mode === "single_athlete" ? loadedAthletes[0] || null : null,
    athletes: mode === "multi_athlete" || mode === "catalog" ? loadedAthletes : null,
    logoUrl,
    heroBackgroundUrl,
  });

  // Testar integridade com renderização de sonda (fail-closed)
  const probeRender = renderQueuedEmail(
    snapshot,
    {
      recipientEmail: "probe@gotteamgo.internal",
      recipientName: "Probe Coach",
      coachLastName: "Coach",
      institutionName: "Probe University",
    },
    campaignId,
  );

  const campaignSubject =
    probeRender.subject ||
    (mode === "catalog"
      ? "Go Team Go — Active US College Recruiting Portfolio"
      : mode === "multi_athlete"
        ? `Multi-Athlete Showcase (${validUuidAthleteIds.length} athletes)`
        : "Prospect Spotlight");

  // Inserir snapshot na tabela dedicada (0028)
  const { error: snapErr } = await admin.from("mailer_campaign_snapshots").insert({
    campaign_id: campaignId,
    version: 1,
    mode,
    subject_template: snapshot.subjectTemplate,
    snapshot_data: snapshot as unknown as Record<string, unknown>,
    created_at: now,
  });

  if (snapErr) {
    console.error("[mailer-queue] Failed to save campaign snapshot:", snapErr.message);
    throw new Error(`Failed to save campaign snapshot: ${snapErr.message}`);
  }

  // Inserir registro inicial da campanha com status 'draft'
  const { error: campErr } = await admin.from("mailer_campaigns").insert({
    id: campaignId,
    created_by: input.createdBy || null,
    mode,
    subject: campaignSubject,
    athlete_ids: validUuidAthleteIds,
    recipients_count: 0,
    total_recipients: 0,
    sent_count: 0,
    failed_count: 0,
    suppressed_count: 0,
    current_batch: 1,
    total_batches: 0,
    batch_size: QUEUE_CONFIG.BURST_SIZE,
    delay_between_batches_sec: QUEUE_CONFIG.BURST_PAUSE_MS / 1000,
    delay_between_items_ms: 0,
    status: "draft",
    filters: input.filters || {},
    created_at: now,
  });

  if (campErr) {
    console.error("[mailer-queue] Failed to create campaign draft:", campErr.message);
    throw new Error(`Failed to create campaign draft: ${campErr.message}`);
  }

  return {
    success: true,
    campaignId,
    mode,
    subject: campaignSubject,
    status: "draft",
  };
}

/**
 * Fase 2 da criação de campanha: Anexa destinatários em pedaços (streaming / chunked)
 * Valida sintaxe RFC 5322, supressão, e insere payloads compactos com render === 'at_send'.
 */
export async function appendCampaignRecipients(
  campaignId: string,
  recipients: SendMailerInput["recipients"],
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<AppendRecipientsResult> {
  const admin = customAdmin || getAdminClient();
  const now = new Date().toISOString();

  // 1. Obter campanha existente e validar status
  const { data: campaign, error: campErr } = await admin
    .from("mailer_campaigns")
    .select(
      "id, status, total_recipients, recipients_count, suppressed_count, mode, subject, athlete_ids",
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (campErr || !campaign) {
    throw new Error(`Campaign not found: ${campErr?.message || "Invalid ID"}`);
  }

  if (campaign.status !== "draft" && campaign.status !== "queued") {
    throw new Error(`Cannot append recipients to campaign in '${campaign.status}' state.`);
  }

  // 2. Filtrar sintaxe RFC 5322 estrita
  let invalidSyntaxCount = 0;
  const syntaxValidRecipients: typeof recipients = [];
  const seenEmails = new Set<string>();

  for (const r of recipients) {
    const raw = (r.email || "").trim();
    if (!isDeliverableEmailSyntax(raw)) {
      invalidSyntaxCount++;
      continue;
    }
    const clean = raw.toLowerCase();
    if (seenEmails.has(clean)) continue;
    seenEmails.add(clean);
    syntaxValidRecipients.push({ ...r, email: clean });
  }

  if (syntaxValidRecipients.length === 0) {
    return {
      success: true,
      campaignId,
      appended: 0,
      suppressed: 0,
      invalidSyntax: invalidSyntaxCount,
      totalNow: campaign.total_recipients || 0,
    };
  }

  // 3. Checar supressão em lote via filter_suppressed_emails RPC
  const cleanEmails = syntaxValidRecipients.map((r) => r.email);
  const suppressedEmailsSet = new Set<string>();

  try {
    const { data: suppRows, error: suppRpcErr } = await admin.rpc("filter_suppressed_emails", {
      p_emails: cleanEmails,
    });
    if (!suppRpcErr && Array.isArray(suppRows)) {
      for (const row of suppRows as Array<{ email?: string }>) {
        if (row.email) suppressedEmailsSet.add(row.email.toLowerCase().trim());
      }
    }
  } catch (err) {
    console.warn(
      "[mailer-queue] Failed to call filter_suppressed_emails RPC, using local fallback:",
      err,
    );
    const set = await getSuppressedEmailSet();
    for (const e of cleanEmails) {
      if (set.has(e)) suppressedEmailsSet.add(e);
    }
  }

  const activeRecipients: typeof recipients = [];
  const suppressedRecipients: typeof recipients = [];

  for (const r of syntaxValidRecipients) {
    if (suppressedEmailsSet.has(r.email)) {
      suppressedRecipients.push(r);
    } else {
      activeRecipients.push(r);
    }
  }

  // 4. Validar coach IDs contra a tabela coaches
  const proposedCoachIds = Array.from(
    new Set(
      [...activeRecipients, ...suppressedRecipients]
        .map((r) => r.coachId)
        .filter((id): id is string => typeof id === "string" && UUID_REGEX.test(id)),
    ),
  );
  const persistedCoachIds = new Set<string>();
  for (let offset = 0; offset < proposedCoachIds.length; offset += 100) {
    const { data: coachesData } = await admin
      .from("coaches")
      .select("id")
      .in("id", proposedCoachIds.slice(offset, offset + 100));
    for (const coach of coachesData || []) {
      if (coach?.id) persistedCoachIds.add(coach.id.toLowerCase());
    }
  }

  for (const rec of [...activeRecipients, ...suppressedRecipients]) {
    if (!rec.coachId || !persistedCoachIds.has(rec.coachId.toLowerCase())) {
      rec.coachId = undefined;
    }
  }

  // 5. Registrar logs para destinatários suprimidos
  if (suppressedRecipients.length > 0) {
    const suppressedLogs = suppressedRecipients.map((rec) => ({
      campaign_id: campaignId,
      athlete_id: (campaign.athlete_ids && campaign.athlete_ids[0]) || null,
      athlete_ids: campaign.athlete_ids || [],
      coach_id: rec.coachId || null,
      subject: campaign.subject || "Go Team Go Recruiting Showcase",
      status: "suppressed" as const,
      error_message: "Recipient is in suppression list (opted out or paused)",
      sent_at: now,
      email_type:
        campaign.mode === "catalog"
          ? ("catalog_general" as const)
          : campaign.mode === "multi_athlete"
            ? ("athlete_teaser_multi" as const)
            : ("athlete_teaser" as const),
      recipient_email: rec.email,
      recipient_name: rec.name,
      university_name: rec.universityName ?? null,
    }));

    await admin.from("recruit_email_logs").insert(suppressedLogs);
  }

  // 6. Inserir itens ativos em mailer_queue com payload compacto ({ render: 'at_send' })
  const emailType =
    campaign.mode === "catalog"
      ? "catalog_general"
      : campaign.mode === "multi_athlete"
        ? "athlete_teaser_multi"
        : "athlete_teaser";

  let appendedCount = 0;
  if (activeRecipients.length > 0) {
    let campaignSnapshot: MailerCampaignSnapshot | null = null;
    const { data: snapshotRow } = await admin
      .from("mailer_campaign_snapshots")
      .select("snapshot_data")
      .eq("campaign_id", campaignId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapshotRow?.snapshot_data) {
      campaignSnapshot = snapshotRow.snapshot_data as MailerCampaignSnapshot;
    }

    const currentTotal = campaign.total_recipients || 0;
    const batchSize = QUEUE_CONFIG.BURST_SIZE;

    const queueRows = activeRecipients.map((rec, idx) => {
      const idempotencyKey = crypto
        .createHash("sha256")
        .update(`${campaignId}:${rec.email}`)
        .digest("hex");
      const overallIndex = currentTotal + idx;
      const batchNumber = Math.floor(overallIndex / batchSize) + 1;

      let renderedHtml: string | undefined;
      let renderedText: string | undefined;
      let renderedSubject = campaign.subject;

      if (campaignSnapshot) {
        try {
          const rendered = renderQueuedEmail(
            campaignSnapshot,
            {
              recipientEmail: rec.email,
              recipientName: rec.name,
              coachLastName: rec.lastName,
              institutionName: rec.universityName,
              coachId: rec.coachId,
            },
            campaignId,
          );
          renderedHtml = rendered.html;
          renderedText = rendered.text;
          renderedSubject = rendered.subject || renderedSubject;
        } catch (e) {
          console.warn("[mailer-queue] Failed to pre-render recipient:", e);
        }
      }

      return {
        campaign_id: campaignId,
        coach_id: rec.coachId || null,
        recipient_email: rec.email,
        recipient_name: rec.name,
        university_name: rec.universityName || null,
        email_type: emailType,
        subject: renderedSubject,
        payload: {
          render: "at_send",
          html: renderedHtml,
          text: renderedText,
          coachLastName: rec.lastName,
          athleteId: (campaign.athlete_ids && campaign.athlete_ids[0]) || null,
          athleteIds: campaign.athlete_ids || [],
        },
        idempotency_key: idempotencyKey,
        status: "pending",
        batch_number: batchNumber,
        attempts: 0,
        max_attempts: QUEUE_CONFIG.MAX_ATTEMPTS,
        created_at: now,
      };
    });

    const INSERT_CHUNK = 100;
    for (let i = 0; i < queueRows.length; i += INSERT_CHUNK) {
      const slice = queueRows.slice(i, i + INSERT_CHUNK);
      const { error: insErr } = await admin.from("mailer_queue").insert(slice);
      if (insErr) {
        console.error("[mailer-queue] Failed to insert queue slice:", insErr.message);
        throw new Error(`Failed to insert queue rows: ${insErr.message}`);
      }
      appendedCount += slice.length;
    }
  }

  // 7. Atualizar contadores na tabela mailer_campaigns
  const newTotal = (campaign.total_recipients || 0) + appendedCount;
  const newSuppressed = (campaign.suppressed_count || 0) + suppressedRecipients.length;
  const totalBatches = Math.max(1, Math.ceil(newTotal / QUEUE_CONFIG.BURST_SIZE));

  await admin
    .from("mailer_campaigns")
    .update({
      total_recipients: newTotal,
      recipients_count: newTotal,
      suppressed_count: newSuppressed,
      total_batches: totalBatches,
    })
    .eq("id", campaignId);

  return {
    success: true,
    campaignId,
    appended: appendedCount,
    suppressed: suppressedRecipients.length,
    invalidSyntax: invalidSyntaxCount,
    totalNow: newTotal,
  };
}

/**
 * Fase 3 da criação de campanha: Ativa a campanha para execução.
 * Valida o Bounce Guard estrito para campanhas com > 1.000 destinatários.
 */
export async function activateCampaign(
  campaignId: string,
  options?: { dryRun?: boolean },
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<ActivateCampaignResult> {
  const admin = customAdmin || getAdminClient();
  const now = new Date().toISOString();

  const { data: campaign, error } = await admin
    .from("mailer_campaigns")
    .select("id, status, total_recipients, filters")
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !campaign) {
    throw new Error(`Campaign not found: ${error?.message || "Invalid ID"}`);
  }

  if (campaign.status !== "draft" && campaign.status !== "queued") {
    throw new Error(`Cannot activate campaign with status '${campaign.status}'`);
  }

  const totalRecipients = campaign.total_recipients || 0;
  if (totalRecipients === 0) {
    await admin
      .from("mailer_campaigns")
      .update({
        status: "completed",
        completed_at: now,
      })
      .eq("id", campaignId);

    return {
      success: true,
      campaignId,
      status: "completed",
      totalRecipients: 0,
      message: "Campaign completed with 0 active recipients.",
    };
  }

  // Trava Obrigatória de Bounce Guard para campanhas > 1.000 destinatários
  if (totalRecipients > 1000 && !options?.dryRun) {
    try {
      const { data: recentCampaigns } = await admin
        .from("mailer_campaigns")
        .select("id")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(3);

      if (Array.isArray(recentCampaigns) && recentCampaigns.length > 0) {
        for (const recent of recentCampaigns) {
          const { data: bounceStats } = await admin.rpc("mailer_campaign_bounce_stats", {
            p_campaign_id: recent.id,
          });
          if (Array.isArray(bounceStats) && bounceStats[0]?.bounce_guard_triggered) {
            throw new Error(
              `Bounce guard: Recent campaign bounce rate (${Number(bounceStats[0].bounce_rate).toFixed(1)}%) exceeded 3.0%. High-volume campaigns (>1,000) are blocked until deliverability issues are resolved.`,
            );
          }
        }
      }
    } catch (guardErr) {
      if (guardErr instanceof Error && guardErr.message.includes("Bounce guard:")) {
        throw guardErr;
      }
      console.warn("[mailer-queue] Non-fatal error while checking recent bounce stats:", guardErr);
    }
  }

  const currentFilters =
    campaign.filters && typeof campaign.filters === "object"
      ? (campaign.filters as Record<string, unknown>)
      : {};

  const updatedFilters = {
    ...currentFilters,
    dryRun: Boolean(options?.dryRun),
  };

  const { error: actErr } = await admin
    .from("mailer_campaigns")
    .update({
      status: "running",
      started_at: now,
      next_batch_at: now,
      filters: updatedFilters,
    })
    .eq("id", campaignId);

  if (actErr) {
    throw new Error(`Failed to activate campaign: ${actErr.message}`);
  }

  return {
    success: true,
    campaignId,
    status: "running",
    totalRecipients,
  };
}

/**
 * Limpa rascunhos abandonados com mais de 2 horas.
 */
export async function cleanupAbandonedCampaignDrafts(
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<number> {
  const admin = customAdmin || getAdminClient();
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: staleDrafts, error } = await admin
    .from("mailer_campaigns")
    .select("id")
    .eq("status", "draft")
    .lt("created_at", cutoff);

  if (error || !Array.isArray(staleDrafts) || staleDrafts.length === 0) {
    return 0;
  }

  const staleIds = staleDrafts.map((d) => d.id);
  await admin
    .from("mailer_campaigns")
    .update({
      status: "cancelled",
      last_error: "Draft expired after 2 hours without activation.",
    })
    .in("id", staleIds);

  return staleIds.length;
}

/**
 * Enfileira atomicamente a campanha utilizando a arquitetura em 3 fases:
 * 1. createCampaignDraft (snapshot imutável + integridade fail-closed)
 * 2. appendCampaignRecipients (em fatias de 500, com payload compacto)
 * 3. activateCampaign (com trava de bounce)
 */
export async function enqueueCampaignDispatches(
  input: SendMailerInput,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<EnqueueResult> {
  resolveEmailSubject(input.customOptions?.subject, "");
  const admin = customAdmin || getAdminClient();

  try {
    // 1. Fase 1: Criar rascunho
    const draft = await createCampaignDraft(
      {
        mode: input.mode,
        athleteIds: input.athleteIds,
        customOptions: input.customOptions,
        catalogOptions: input.catalogOptions,
        blocks: input.blocks,
        createdBy: input.createdBy ?? undefined,
        filters: input.filters,
      },
      admin,
    );

    // 2. Fase 2: Anexar destinatários em fatias de 500
    const recipients = input.recipients || [];
    const CHUNK_SIZE = 500;
    let totalAppended = 0;
    let totalSuppressed = 0;

    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const slice = recipients.slice(i, i + CHUNK_SIZE);
      const res = await appendCampaignRecipients(draft.campaignId, slice, admin);
      totalAppended += res.appended;
      totalSuppressed += res.suppressed;
    }

    // 3. Fase 3: Ativar campanha
    const isDryRun = Boolean(input.filters?.dryRun);
    const act = await activateCampaign(draft.campaignId, { dryRun: isDryRun }, admin);

    return {
      success: true,
      campaignId: draft.campaignId,
      totalRecipients: recipients.length,
      totalEnqueued: totalAppended,
      totalSuppressed,
      totalBatches: Math.max(1, Math.ceil(totalAppended / QUEUE_CONFIG.BURST_SIZE)),
      batchSize: QUEUE_CONFIG.BURST_SIZE,
      status: act.status,
    };
  } catch (error) {
    return {
      success: false,
      campaignId: "",
      totalRecipients: input.recipients?.length || 0,
      totalEnqueued: 0,
      totalSuppressed: 0,
      totalBatches: 0,
      batchSize: QUEUE_CONFIG.BURST_SIZE,
      status: "failed",
      message: error instanceof Error ? error.message : "Failed to enqueue campaign dispatches.",
    };
  }
}

/**
 * Cancela preventivamente itens da fila pendentes ou em retry que estejam corrompidos
 * (sem o card de atleta / QUICK FACTS no payload HTML).
 */
export async function sanitizePendingQueueItemsMissingCards(
  campaignId?: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<number> {
  if (!campaignId || !UUID_REGEX.test(campaignId.trim()))
    throw new Error("Invalid campaign for sanitation.");
  const admin = customAdmin || getAdminClient();
  const corruptedIds: string[] = [];
  // Read all pages BEFORE updating any rows: changing status during offset
  // pagination would otherwise skip rows in subsequent pages.
  for (let from = 0; ; from += 1000) {
    const { data: items, error } = await admin
      .from("mailer_queue")
      .select("id,payload,email_type")
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "retry"])
      .neq("email_type", "catalog_general")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error || !items)
      throw new Error(
        `Cannot inspect campaign cards at offset ${from}: ${error?.message || "missing page"}`,
      );
    for (const item of items) {
      const payload = (item.payload || {}) as { html?: string };
      if (!payload.html?.includes("QUICK FACTS") || !payload.html?.includes("VIEW FULL PROFILE")) {
        corruptedIds.push(item.id);
      }
    }
    if (items.length < 1000) break;
  }
  for (let i = 0; i < corruptedIds.length; i += 100) {
    const { error } = await admin
      .from("mailer_queue")
      .update({
        status: "cancelled",
        last_error: "cancelled_missing_card",
        error_code: "INTEGRITY_MISSING_CARD",
        processed_at: new Date().toISOString(),
      })
      .in("id", corruptedIds.slice(i, i + 100));
    if (error) throw new Error(`Cannot quarantine corrupted cards: ${error.message}`);
  }
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
    .select("id,status,batch_size,next_batch_at,total_recipients,filters,sent_count,current_batch")
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

  // Never touch Resend until the atomic-completion migration is installed.
  const readiness = await admin.rpc("mailer_burst_ready");
  if (readiness.error || readiness.data !== true) {
    return empty({
      effectiveBurstSize: effectiveSize,
      message:
        "A migration 0027/0028 do Mailer não está aplicada no banco. Aplique a migration 0027/0028 no Supabase SQL Editor para liberar os disparos.",
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

  // Reconciliar reservas expiradas em 'processing' antes de reservar o lote,
  // verificando recruit_email_logs e email_events para nunca duplicar envios já aceitos.
  await reconcileStaleProcessingQueueItems(campaignId, admin);

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
    let progress = await getCampaignQueueProgress(campaignId, admin);
    if (!progress) return empty({ message: "Could not read campaign progress." });
    if (progress.processingCount > 0) {
      const rec = await reconcileStaleProcessingQueueItems(campaignId, admin);
      if (rec.recoveredToPending > 0 || rec.confirmedSent > 0) {
        progress = (await getCampaignQueueProgress(campaignId, admin)) || progress;
      }
    }
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

  const results: ResultRow[] = [];
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

  // 1. Verificar modo Dry-Run a partir dos filtros da campanha
  const campaignFilters = (campaign.filters || {}) as Record<string, unknown>;
  const isDryRun = Boolean(campaignFilters.dryRun);
  const mailProvider = getMailProvider({ dryRun: isDryRun });

  // 2. Pre-filtro de Supressão Defensivo (Defense-in-depth antes de chamar provedor)
  const candidateEmails = Array.from(
    new Set(items.map((i) => (i.recipient_email || "").toLowerCase().trim()).filter(Boolean)),
  );
  const suppressedInBatch = new Set<string>();
  try {
    const { data: suppressedRows, error: suppErr } = await admin.rpc("filter_suppressed_emails", {
      p_emails: candidateEmails,
    });
    if (!suppErr && Array.isArray(suppressedRows)) {
      for (const row of suppressedRows as Array<{ email?: string }>) {
        if (row.email) suppressedInBatch.add(row.email.toLowerCase().trim());
      }
    }
  } catch (err) {
    console.warn("[mailer-queue] Failed to run filter_suppressed_emails pre-filter:", err);
  }

  // 3. Carregar snapshot se houver itens que renderizam sob demanda ('at_send')
  let campaignSnapshot: MailerCampaignSnapshot | null = null;
  const needsSnapshot = items.some((item) => {
    const p = (item.payload || {}) as { render?: string; html?: string };
    return p.render === "at_send" || !p.html;
  });

  if (needsSnapshot) {
    const { data: snapshotRow, error: snapErr } = await admin
      .from("mailer_campaign_snapshots")
      .select("snapshot_data")
      .eq("campaign_id", campaignId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapErr || !snapshotRow?.snapshot_data) {
      console.warn("[mailer-queue] Missing snapshot for campaign:", campaignId, snapErr?.message);
    } else {
      campaignSnapshot = snapshotRow.snapshot_data as MailerCampaignSnapshot;
    }
  }

  // 4. Preparar itens prontos e cancelar itens suprimidos ou corrompidos
  type ReadyBurstItem = {
    item: MailerQueueItem;
    html: string;
    text: string;
    subject: string;
    tags: Array<{ name: string; value: string }>;
  };
  const ready: ReadyBurstItem[] = [];

  for (const item of items) {
    const cleanEmail = (item.recipient_email || "").toLowerCase().trim();
    if (item.provider_message_id) {
      record(item, "sent", item.provider_message_id);
      continue;
    }

    if (suppressedInBatch.has(cleanEmail)) {
      record(
        item,
        "cancelled",
        null,
        "Recipient is suppressed (pre-send filter)",
        "SUPPRESSED_PRE_SEND",
      );
      continue;
    }

    const payload = (item.payload || {}) as {
      html?: string;
      text?: string;
      tags?: Array<{ name: string; value: string }>;
      render?: string;
    };

    let renderedHtml = payload.html || "";
    let renderedText = payload.text || "";
    let renderedSubject = item.subject || "";

    if (payload.render === "at_send" || !renderedHtml) {
      if (!campaignSnapshot) {
        retry(item, "Missing campaign snapshot for on-the-fly rendering", "MISSING_SNAPSHOT");
        continue;
      }

      try {
        const rendered = renderQueuedEmail(
          campaignSnapshot,
          {
            recipientEmail: item.recipient_email,
            recipientName: item.recipient_name,
            coachLastName: (payload as { coachLastName?: string }).coachLastName,
            institutionName: item.university_name,
            coachId: item.coach_id,
          },
          campaignId,
        );
        renderedHtml = rendered.html;
        renderedText = rendered.text;
        renderedSubject = rendered.subject || renderedSubject;
      } catch (renderError) {
        record(
          item,
          "cancelled",
          null,
          renderError instanceof Error
            ? renderError.message
            : "Email render integrity check failed",
          "RENDER_INTEGRITY_FAILED",
        );
        continue;
      }
    }

    if (
      item.email_type !== "catalog_general" &&
      (!renderedHtml.includes("QUICK FACTS") || !renderedHtml.includes("VIEW FULL PROFILE"))
    ) {
      record(item, "cancelled", null, "cancelled_missing_card", "INTEGRITY_MISSING_CARD");
      continue;
    }

    if (!renderedHtml || !item.recipient_email) {
      record(item, "cancelled", null, "Invalid email snapshot", "INVALID_PAYLOAD");
      continue;
    }

    ready.push({
      item,
      html: renderedHtml,
      text: renderedText,
      subject: renderedSubject,
      tags:
        payload.tags ||
        buildResendMailerTags({
          campaignId,
          emailType: item.email_type as
            "athlete_teaser" | "athlete_teaser_multi" | "catalog_general",
        }),
    });
  }

  let rateLimited = false;
  let retryAfterSec = 0;
  let quarantineReason: string | null = null;

  // 5. Envio em lotes via MailProvider
  if (ready.length > 0) {
    const sorted = [...ready].sort((a, b) =>
      a.item.idempotency_key.localeCompare(b.item.idempotency_key),
    );
    const chunks: ReadyBurstItem[][] = [];
    for (let i = 0; i < sorted.length; i += 100) chunks.push(sorted.slice(i, i + 100));

    const chunkPromises = chunks.map(async (chunk) => {
      const batchItems: BatchEmailItem[] = chunk.map(({ item, html, text, subject, tags }) => {
        const unsubHeaders = getUnsubscribeHeaders(item.recipient_email, campaignId);
        return {
          id: item.id,
          to: item.recipient_email,
          replyTo: "contact@goteamgoagency.com",
          subject,
          html,
          text,
          tags,
          headers: {
            ...unsubHeaders,
            "X-Entity-Ref-ID": item.idempotency_key,
          },
        };
      });

      const key = chunkIdempotencyKey(
        campaignId,
        chunk.map(({ item }) => item.idempotency_key),
      );

      const outcome = await mailProvider.sendBatch(batchItems, {
        idempotencyKey: key,
        dryRun: isDryRun,
      });

      return { chunk, outcome };
    });

    const chunkResults = await Promise.all(chunkPromises);

    for (const { chunk, outcome } of chunkResults) {
      if (outcome.rateLimited) {
        rateLimited = true;
        retryAfterSec = Math.max(retryAfterSec, outcome.retryAfterSeconds || 2);
      }

      if (outcome.circuitBreak) {
        quarantineReason = outcome.circuitBreakReason || "Provider circuit breaker triggered.";
      }

      if (outcome.ambiguous) {
        quarantineReason = "Ambiguous provider acceptance. Manual reconciliation required.";
        for (const { item } of chunk) retry(item, quarantineReason, "PROVIDER_AMBIGUOUS");
        continue;
      }

      const sentMap = new Map<string, string>();
      for (const sentItem of outcome.sent) {
        sentMap.set(sentItem.id, sentItem.providerId);
      }

      const failedMap = new Map<string, { code: string; message: string }>();
      for (const failItem of outcome.failed) {
        failedMap.set(failItem.id, { code: failItem.errorCode, message: failItem.errorMessage });
      }

      for (const { item } of chunk) {
        if (sentMap.has(item.id)) {
          record(item, "sent", sentMap.get(item.id)!);
        } else if (failedMap.has(item.id)) {
          const f = failedMap.get(item.id)!;
          if (f.code === "429" || rateLimited) {
            retry(
              item,
              f.message,
              "429",
              new Date(Date.now() + Math.max(1, retryAfterSec) * 1000).toISOString(),
            );
          } else {
            record(item, "failed", null, f.message, f.code);
          }
        } else {
          if (rateLimited) {
            retry(
              item,
              "Dispatch suspended due to rate limit",
              "429",
              new Date(Date.now() + Math.max(1, retryAfterSec) * 1000).toISOString(),
            );
          } else {
            retry(item, "Unacknowledged batch item", "PROVIDER_UNACKNOWLEDGED");
          }
        }
      }
    }
  }

  // 6. Verificação do Bounce Guard após envios reais (se enviados >= 20)
  if (!isDryRun) {
    try {
      const { data: bounceRows } = await admin.rpc("mailer_campaign_bounce_stats", {
        p_campaign_id: campaignId,
      });
      if (Array.isArray(bounceRows) && bounceRows[0]?.bounce_guard_triggered) {
        quarantineReason = `Bounce rate (${Number(bounceRows[0].bounce_rate).toFixed(1)}%) exceeded 3% threshold. Dispatch suspended to protect sender reputation.`;
      }
    } catch (err) {
      console.warn("[mailer-queue] Failed to verify bounce stats:", err);
    }
  }

  const reducedSize = nextBurstSize(effectiveSize, rateLimited);
  const confirmed = results.filter((r) => r.status === "sent").length;

  // 7. Persistência atômica via complete_mailer_burst
  const { data: completed, error: persistenceError } = await admin.rpc("complete_mailer_burst", {
    p_campaign_id: campaignId,
    p_worker_id: workerId,
    p_results: results,
    p_next_size: reducedSize,
    p_pause_ms: QUEUE_CONFIG.BURST_PAUSE_MS,
    p_lock_until: rateLimited ? new Date(Date.now() + retryAfterSec * 1000).toISOString() : null,
    p_dry_run: isDryRun,
  });

  if (persistenceError || !completed || Number(completed.updated) !== items.length) {
    const message = `Provider accepted ${confirmed} messages, but burst persistence failed. Manual reconciliation required. ${persistenceError?.message || ""}`;
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
      const estimatedRemainingSeconds = canEstimateMailerEta({
        status: s.status as MailerCampaignStatus,
        sentCount: sent,
        currentBatch: Number(s.current_batch) || 1,
        nextBatchAt: (s.next_batch_at as string) || null,
        lastError: (s.last_error as string) || null,
      })
        ? Math.ceil(
            remainingBursts * secondsPerBurst +
              (Math.max(0, remainingBursts - 1) * QUEUE_CONFIG.BURST_PAUSE_MS) / 1000,
          )
        : null;

      const health = deriveCampaignSubstate(
        {
          status: s.status as MailerCampaignStatus,
          last_error: (s.last_error as string) || null,
          next_batch_at: (s.next_batch_at as string) || null,
          started_at: (s.started_at as string) || null,
        },
        {
          pendingCount: pending,
          processingCount: processing,
        },
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
        substate: health.substate,
        substateLabel: health.label,
        substateDescription: health.description,
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
  const estimatedRemainingSeconds = canEstimateMailerEta({
    status: campaign.status as MailerCampaignStatus,
    sentCount: sent,
    currentBatch: Number(campaign.current_batch) || 1,
    nextBatchAt: campaign.next_batch_at,
    lastError: campaign.last_error,
  })
    ? Math.ceil(
        remainingBursts * secondsPerBurst +
          (Math.max(0, remainingBursts - 1) * QUEUE_CONFIG.BURST_PAUSE_MS) / 1000,
      )
    : null;

  const fallbackHealth = deriveCampaignSubstate(
    {
      status: campaign.status as MailerCampaignStatus,
      last_error: campaign.last_error,
      next_batch_at: campaign.next_batch_at,
      started_at: campaign.started_at,
    },
    {
      pendingCount: pending,
      processingCount: processing,
    },
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
    substate: fallbackHealth.substate,
    substateLabel: fallbackHealth.label,
    substateDescription: fallbackHealth.description,
  };
}

/**
 * Reconcilia de forma segura itens presos em `status = 'processing'` cuja reserva expirou
 * (por exemplo, quando uma Serverless Function da Vercel sofre timeout antes de `complete_mailer_burst`).
 *
 * Para garantir zero duplicidade:
 * - Verifica `provider_message_id` na própria linha, `recruit_email_logs` (`status = 'sent'`) e `email_events`.
 * - Destinatários já aceitos pelo provedor são marcados como `sent`.
 * - Destinatários sem evidência de envio são devolvidos para `pending` para conclusão pelo navegador.
 */
export async function reconcileStaleProcessingQueueItems(
  campaignId: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
  options?: { forceAll?: boolean },
): Promise<{ recoveredToPending: number; confirmedSent: number }> {
  if (!campaignId || !UUID_REGEX.test(campaignId.trim())) {
    return { recoveredToPending: 0, confirmedSent: 0 };
  }
  const admin = customAdmin || getAdminClient();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const { data: processingRows, error: procErr } = await admin
    .from("mailer_queue")
    .select(
      "id, recipient_email, provider_message_id, attempts, reservation_expires_at, reserved_at, created_at",
    )
    .eq("campaign_id", campaignId)
    .eq("status", "processing")
    .limit(1000);

  if (procErr) {
    console.error(
      "[mailer-queue] Error reading processing queue items for reconciliation:",
      procErr.message,
    );
    return { recoveredToPending: 0, confirmedSent: 0 };
  }

  if (!Array.isArray(processingRows) || processingRows.length === 0) {
    return { recoveredToPending: 0, confirmedSent: 0 };
  }

  const staleRows = (
    processingRows as Array<{
      id: string;
      recipient_email?: string | null;
      provider_message_id?: string | null;
      attempts?: number | null;
      reservation_expires_at?: string | null;
      reserved_at?: string | null;
      created_at?: string | null;
    }>
  ).filter((row) => {
    // Nunca quebra leases ativas: somente reservas comprovadamente expiradas
    if (row.reservation_expires_at) {
      return new Date(row.reservation_expires_at).getTime() <= nowMs;
    }
    const startedAt = row.reserved_at || row.created_at;
    if (startedAt) {
      return nowMs - new Date(startedAt).getTime() >= QUEUE_CONFIG.LOCK_DURATION_SEC * 1000;
    }
    // Se está em processing sem reservation_expires_at nem timestamp ativo, reconciliar
    return true;
  });

  if (staleRows.length === 0) {
    return { recoveredToPending: 0, confirmedSent: 0 };
  }

  const sentEmailsSet = new Set<string>();
  try {
    const { data: logsData, error: logsErr } = await admin
      .from("recruit_email_logs")
      .select("recipient_email, status")
      .eq("campaign_id", campaignId)
      .eq("status", "sent");

    if (logsErr) {
      console.warn(
        "[mailer-queue] Error querying recruit_email_logs during reconciliation:",
        logsErr.message,
      );
    }
    if (Array.isArray(logsData)) {
      for (const log of logsData as Array<{
        recipient_email?: string | null;
        status?: string | null;
      }>) {
        if (log.status && log.status !== "sent") continue;
        const clean = (log.recipient_email || "").toLowerCase().trim();
        if (clean) sentEmailsSet.add(clean);
      }
    }
  } catch (err) {
    console.warn("[mailer-queue] Exception reading recruit_email_logs during reconciliation:", err);
  }

  try {
    const staleEmails = Array.from(
      new Set(staleRows.map((r) => (r.recipient_email || "").toLowerCase().trim()).filter(Boolean)),
    );
    for (let i = 0; i < staleEmails.length; i += 100) {
      const slice = staleEmails.slice(i, i + 100);
      const { data: evData, error: evErr } = await admin
        .from("email_events")
        .select("recipient_email, tags")
        .in("recipient_email", slice);

      if (evErr) {
        console.warn(
          "[mailer-queue] Error querying email_events during reconciliation:",
          evErr.message,
        );
      }
      if (Array.isArray(evData)) {
        for (const ev of evData as Array<{
          recipient_email?: string | null;
          tags?: Record<string, unknown> | null;
        }>) {
          const tagCampId =
            ev.tags && typeof ev.tags === "object"
              ? String((ev.tags as Record<string, unknown>).campaign_id || "")
              : "";
          // Casamento estrito por ID de campanha (E2)
          if (tagCampId === campaignId) {
            const clean = (ev.recipient_email || "").toLowerCase().trim();
            if (clean) sentEmailsSet.add(clean);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[mailer-queue] Exception reading email_events during reconciliation:", err);
  }

  const confirmedSentIds: string[] = [];
  const recoverToPendingIds: string[] = [];

  for (const row of staleRows) {
    const cleanEmail = (row.recipient_email || "").toLowerCase().trim();
    if (row.provider_message_id || sentEmailsSet.has(cleanEmail)) {
      confirmedSentIds.push(row.id);
    } else {
      recoverToPendingIds.push(row.id);
    }
  }

  for (let i = 0; i < confirmedSentIds.length; i += 100) {
    const { error: updSentErr } = await admin
      .from("mailer_queue")
      .update({
        status: "sent",
        processed_at: nowIso,
        reserved_by: null,
        reservation_expires_at: null,
        last_error: null,
        error_code: null,
      })
      .eq("campaign_id", campaignId)
      .in("id", confirmedSentIds.slice(i, i + 100));

    if (updSentErr) {
      console.error("[mailer-queue] Failed to confirm sent queue rows:", updSentErr.message);
    }
  }

  for (let i = 0; i < recoverToPendingIds.length; i += 100) {
    const { error: updPendingErr } = await admin
      .from("mailer_queue")
      .update({
        status: "pending",
        reserved_by: null,
        reserved_at: null,
        reservation_expires_at: null,
        next_retry_at: null,
        last_error: null,
        error_code: null,
      })
      .eq("campaign_id", campaignId)
      .in("id", recoverToPendingIds.slice(i, i + 100));

    if (updPendingErr) {
      console.error(
        "[mailer-queue] Failed to recover stale items to pending:",
        updPendingErr.message,
      );
    }
  }

  return {
    recoveredToPending: recoverToPendingIds.length,
    confirmedSent: confirmedSentIds.length,
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
      controller_id: null,
      controller_lease_expires_at: null,
    })
    .eq("id", campaignId);

  if (error) return { success: false, message: error.message };
  return { success: true };
}

/**
 * Retoma uma campanha pausada imediatamente e reconcilia eventuais itens órfãos em processing.
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
  if (
    campaign.last_error?.includes("Manual reconciliation required") ||
    campaign.last_error?.includes("ambiguous") ||
    campaign.last_error?.includes("PROVIDER_AMBIGUOUS")
  ) {
    return {
      success: false,
      message: "Manual reconciliation required before resuming this campaign.",
    };
  }

  await reconcileStaleProcessingQueueItems(campaignId, admin, { forceAll: true });

  const { error } = await admin
    .from("mailer_campaigns")
    .update({
      status: "running",
      paused_at: null,
      controller_id: null,
      controller_lease_expires_at: null,
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

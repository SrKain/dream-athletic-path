import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/clients.server";
import type {
  CampaignProgress,
  EnqueueResult,
  MailerCampaignExclusion,
  MailerCampaignFinalReport,
  MailerCampaignMode,
  MailerCampaignStatus,
  MailerExclusionReason,
  MailerNonSentReportItem,
  MailerPreflightResult,
} from "@/types/db";
import { loadAthletesEmailData } from "./athlete-email-data.server";
import { composeEmailBlocks } from "./email-blocks";
import { isDeliverableEmailSyntax, normalizeEmail } from "./email-syntax";
import {
  sendResendBatchV2,
  type BatchEmailItem,
  type V2BatchItemOutcome,
} from "./mail-provider.server";
import {
  createCampaignSnapshot,
  renderQueuedEmail,
  type MailerCampaignSnapshot,
  type RecipientRenderVariables,
} from "./mailer-snapshot";
import { getSuppressedEmailSet, type SendMailerInput } from "./recruit-email.server";
import { getUnsubscribeHeaders } from "./unsubscribe-token";

const SLICE_SIZE = 1000;
const RESEND_BATCH_MAX = 100;
const DEFAULT_TICK_BUDGET_MS = 8000;
const DEFAULT_BATCH_GAP_MS = 1500;
const DEFAULT_MONTHLY_QUOTA = 20000;
const DEFAULT_QUOTA_CYCLE_DAY = 1;
const DEFAULT_LEASE_SECONDS = 90;

export function getMailerEngineMode(): "v2" | "legacy" {
  const raw = (process.env.MAILER_ENGINE || "v2").trim().toLowerCase();
  return raw === "legacy" ? "legacy" : "v2";
}

export function getMailerTickConfig() {
  const tickBudgetMs = Math.min(
    Math.max(Number(process.env.MAILER_TICK_BUDGET_MS) || DEFAULT_TICK_BUDGET_MS, 1000),
    25_000,
  );
  const batchGapMs = Math.min(
    Math.max(Number(process.env.MAILER_BATCH_GAP_MS) || DEFAULT_BATCH_GAP_MS, 0),
    30_000,
  );
  const monthlyQuota = Math.max(
    Number(process.env.MAILER_MONTHLY_QUOTA) || DEFAULT_MONTHLY_QUOTA,
    100,
  );
  const cycleStartDay = Math.min(
    Math.max(Number(process.env.MAILER_QUOTA_CYCLE_START_DAY) || DEFAULT_QUOTA_CYCLE_DAY, 1),
    28,
  );

  return {
    tickBudgetMs,
    batchGapMs,
    monthlyQuota,
    cycleStartDay,
  };
}

export interface PreflightRecipientInput {
  coachId?: string | null;
  name: string;
  lastName?: string;
  email: string;
  universityName?: string;
  blockedFit?: boolean;
  excludedReason?: string;
}

export interface RunMailerPreflightInput {
  recipients: PreflightRecipientInput[];
  mode?: MailerCampaignMode;
  athleteIds?: string[];
  monthlyQuota?: number;
  cycleStartDay?: number;
}

/**
 * Classificação determinística pura (também usada como fallback caso a RPC
 * `mailer_preflight` não esteja disponível em ambientes de mock/teste).
 * Garante 1 motivo primário mutuamente exclusivo por item selecionado:
 *   `eligible` | `duplicate` | `invalid` | `suppressed` | `blocked_fit` | `other`
 * Invariante estrita:
 *   selecionados = elegíveis + duplicados + inválidos + suprimidos + outros
 */
export function classifyRecipientsDeterministic(
  recipients: PreflightRecipientInput[],
  suppressedSet: Set<string>,
  quotaStats: {
    monthlyQuota: number;
    cycleStartDay: number;
    cycleStartsAt: string;
    usedThisMonth: number;
  },
): MailerPreflightResult {
  const seenValidEmails = new Set<string>();
  const eligibleRecipients: MailerPreflightResult["eligibleRecipients"] = [];
  const excludedRecipients: MailerCampaignExclusion[] = [];

  let duplicateCount = 0;
  let invalidCount = 0;
  let suppressedCount = 0;
  let blockedFitCount = 0;
  let otherExcludedCount = 0;

  for (const item of recipients) {
    const rawEmail = String(item.email ?? "");
    const emailNormalized = normalizeEmail(rawEmail);
    const coachName = (item.name || "Coach").trim() || "Coach";
    const universityName = (item.universityName || "").trim();

    // 1. Inválido (sintaxe RFC 5322 / deliverable)
    if (!isDeliverableEmailSyntax(emailNormalized)) {
      invalidCount++;
      excludedRecipients.push({
        coachId: item.coachId ?? null,
        email: rawEmail,
        emailNormalized: emailNormalized || rawEmail.trim().toLowerCase(),
        name: coachName,
        universityName,
        reason: "invalid",
        details: "Sintaxe de e-mail inválida (RFC 5322)",
      });
      continue;
    }

    // 2. Duplicado na seleção (mantém somente a 1ª ocorrência)
    if (seenValidEmails.has(emailNormalized)) {
      duplicateCount++;
      excludedRecipients.push({
        coachId: item.coachId ?? null,
        email: rawEmail,
        emailNormalized,
        name: coachName,
        universityName,
        reason: "duplicate",
        details: "E-mail duplicado na seleção (mantida apenas a 1ª ocorrência)",
      });
      continue;
    }
    seenValidEmails.add(emailNormalized);

    // 3. Suprimido (opt-out, bounce permanente ou temporário ativo)
    if (suppressedSet.has(emailNormalized)) {
      suppressedCount++;
      excludedRecipients.push({
        coachId: item.coachId ?? null,
        email: rawEmail,
        emailNormalized,
        name: coachName,
        universityName,
        reason: "suppressed",
        details: "Contato na lista de supressão (opt-out ou bounce prévio)",
      });
      continue;
    }

    // 4. Conflito de fit sinalizado pelo coach
    if (item.blockedFit) {
      blockedFitCount++;
      excludedRecipients.push({
        coachId: item.coachId ?? null,
        email: rawEmail,
        emailNormalized,
        name: coachName,
        universityName,
        reason: "blocked_fit",
        details: "Conflito de interesse sinalizado pelo coach",
      });
      continue;
    }

    // 5. Outro motivo explícito
    if (item.excludedReason && item.excludedReason.trim()) {
      otherExcludedCount++;
      excludedRecipients.push({
        coachId: item.coachId ?? null,
        email: rawEmail,
        emailNormalized,
        name: coachName,
        universityName,
        reason: "other",
        details: item.excludedReason.trim(),
      });
      continue;
    }

    // 6. Elegível
    eligibleRecipients.push({
      coachId: item.coachId ?? null,
      name: coachName,
      lastName: item.lastName,
      universityName,
      email: emailNormalized,
      emailNormalized,
    });
  }

  const selectedCount = recipients.length;
  const eligibleCount = eligibleRecipients.length;
  const excludedTotalCount =
    duplicateCount + invalidCount + suppressedCount + blockedFitCount + otherExcludedCount;
  const invariantValid = selectedCount === eligibleCount + excludedTotalCount;

  const sortedEligibleEmails = eligibleRecipients
    .map((r) => r.emailNormalized)
    .slice()
    .sort()
    .join(",");
  const manifestFingerprint = crypto.createHash("md5").update(sortedEligibleEmails).digest("hex");

  const { monthlyQuota, cycleStartDay, cycleStartsAt, usedThisMonth } = quotaStats;
  const remainingBeforeSend = Math.max(0, monthlyQuota - usedThisMonth);
  const remainingAfterSend = Math.max(0, monthlyQuota - (usedThisMonth + eligibleCount));
  const projectedUsagePercent = Number(
    (((usedThisMonth + eligibleCount) / Math.max(monthlyQuota, 1)) * 100).toFixed(2),
  );
  const blocked = usedThisMonth + eligibleCount > monthlyQuota;
  const warning80Percent = usedThisMonth + eligibleCount >= monthlyQuota * 0.8;

  return {
    selectedCount,
    eligibleCount,
    duplicateCount,
    invalidCount,
    suppressedCount,
    blockedFitCount,
    otherExcludedCount,
    excludedTotalCount,
    invariantValid,
    manifestFingerprint,
    quota: {
      monthlyQuota,
      cycleStartDay,
      cycleStartsAt,
      usedThisMonth,
      remainingBeforeSend,
      remainingAfterSend,
      projectedUsagePercent,
      warning80Percent,
      blocked,
    },
    eligibleRecipients,
    excludedRecipients,
  };
}

export function computeCycleStartDateIso(cycleStartDay: number, now = new Date()): string {
  const safeDay = Math.min(Math.max(cycleStartDay, 1), 28);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const currentDay = now.getUTCDate();

  if (currentDay >= safeDay) {
    return new Date(Date.UTC(year, month, safeDay, 0, 0, 0, 0)).toISOString();
  }
  return new Date(Date.UTC(year, month - 1, safeDay, 0, 0, 0, 0)).toISOString();
}

/**
 * Executa a pré-checagem autoritativa no servidor (`mailer_preflight`).
 */
export async function runMailerPreflight(
  input: RunMailerPreflightInput,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<MailerPreflightResult> {
  const admin = customAdmin ?? getAdminClient();
  const config = getMailerTickConfig();
  const monthlyQuota = input.monthlyQuota ?? config.monthlyQuota;
  const cycleStartDay = input.cycleStartDay ?? config.cycleStartDay;
  const cycleStartsAt = computeCycleStartDateIso(cycleStartDay);

  if (admin && typeof admin.rpc === "function") {
    try {
      const rpcRes = await admin.rpc("mailer_preflight", {
        p_recipients: input.recipients,
        p_mode: input.mode || "single_athlete",
        p_athlete_ids: input.athleteIds || [],
        p_monthly_quota: monthlyQuota,
        p_cycle_start_day: cycleStartDay,
      });

      if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === "object") {
        const d = rpcRes.data as Record<string, unknown>;
        if (typeof d.selectedCount === "number" && typeof d.eligibleCount === "number") {
          return d as unknown as MailerPreflightResult;
        }
      }
    } catch {
      // Fallback para classificação determinística local + consulta de supressões
    }
  }

  let suppressedSet = new Set<string>();
  let usedThisMonth = 0;

  if (admin) {
    suppressedSet = await getSuppressedEmailSet();

    try {
      const logsRes = await admin
        .from("recruit_email_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", cycleStartsAt);
      if (typeof logsRes?.count === "number") {
        usedThisMonth = logsRes.count;
      }
    } catch {
      usedThisMonth = 0;
    }
  }

  return classifyRecipientsDeterministic(input.recipients, suppressedSet, {
    monthlyQuota,
    cycleStartDay,
    cycleStartsAt,
    usedThisMonth,
  });
}

const VALID_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveExistingCoachIdsV2(
  admin: NonNullable<ReturnType<typeof getAdminClient>>,
  candidates: Array<string | null | undefined>,
): Promise<Set<string>> {
  const validCandidates = Array.from(
    new Set(
      candidates
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id && VALID_UUID_REGEX.test(id))),
    ),
  );
  if (validCandidates.length === 0) return new Set();

  const existingIds = new Set<string>();
  for (let i = 0; i < validCandidates.length; i += 500) {
    const chunk = validCandidates.slice(i, i + 500);
    try {
      const { data, error } = await admin.from("coaches").select("id").in("id", chunk);
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (row && typeof (row as { id?: unknown }).id === "string") {
            existingIds.add((row as { id: string }).id);
          }
        }
      }
    } catch {
      // Ignora erro de resolução opcional de FK
    }
  }
  return existingIds;
}

export function buildCampaignPreparationIdempotencyKey(params: {
  explicitKey?: string;
  userId?: string | null;
  mode: MailerCampaignMode;
  subject: string;
  athleteIds: string[];
  manifestFingerprint: string;
}): string {
  if (params.explicitKey && params.explicitKey.trim()) {
    return params.explicitKey.trim();
  }
  // Janela de 1 hora para absorver cliques repetidos ou retentativas da mesma preparação
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  const raw = JSON.stringify({
    u: params.userId || "anon",
    m: params.mode,
    s: params.subject.trim(),
    a: params.athleteIds.slice().sort(),
    fp: params.manifestFingerprint,
    hb: hourBucket,
  });
  return `prep_${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 40)}`;
}

/**
 * Preparação atômica e deduplicação global no servidor (V2):
 * 1. Executa `runMailerPreflight` (1 motivo primário por item, invariante selecionados = elegíveis + exclusões).
 * 2. Verifica cota mensal (bloqueia se ultrapassar 100% da cota mensal, salvo dryRun).
 * 3. Valida dados de atletas e integridade do template antes de criar registros.
 * 4. Cria ou reutiliza campanha via `idempotency_key` (em `preparing`).
 * 5. Persiste snapshot (`mailer_campaign_snapshots`), exclusões (`mailer_campaign_exclusions`)
 *    e fila (`mailer_queue`) em fatias de 1.000 com `ON CONFLICT DO NOTHING`.
 * 6. Ativa a campanha (`activate_mailer_campaign`) SOMENTE se a contagem na fila e o
 *    fingerprint baterem com o manifesto elegível.
 */
export async function prepareAndActivateCampaignV2(
  input: SendMailerInput & { idempotencyKey?: string },
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<EnqueueResult> {
  const admin = customAdmin ?? getAdminClient();
  if (!admin) {
    return {
      success: false,
      campaignId: "",
      totalRecipients: 0,
      totalEnqueued: 0,
      totalSuppressed: 0,
      totalBatches: 0,
      batchSize: RESEND_BATCH_MAX,
      status: "failed",
      message: "Supabase Service Role client is not configured.",
    };
  }

  const isDryRun = Boolean(input.filters?.dryRun);
  const targetAthleteIds = input.athleteIds && input.athleteIds.length > 0 ? input.athleteIds : [];

  // 1. Executar preflight autoritativo no servidor
  const preflight = await runMailerPreflight(
    {
      recipients: input.recipients.map((r) => ({
        coachId: r.coachId,
        name: r.name,
        lastName: r.lastName ?? undefined,
        email: r.email,
        universityName: r.universityName,
      })),
      mode: input.mode,
      athleteIds: targetAthleteIds,
    },
    admin,
  );

  if (preflight.quota.blocked && !isDryRun) {
    return {
      success: false,
      campaignId: "",
      totalRecipients: preflight.selectedCount,
      totalEnqueued: 0,
      totalSuppressed: preflight.suppressedCount,
      totalBatches: 0,
      batchSize: RESEND_BATCH_MAX,
      status: "failed",
      preflight,
      message: `Envio bloqueado: a campanha (${preflight.eligibleCount} elegíveis) excede a cota mensal restante (${preflight.quota.remainingBeforeSend} disponíveis de ${preflight.quota.monthlyQuota}).`,
    };
  }

  if (preflight.eligibleCount === 0) {
    return {
      success: false,
      campaignId: "",
      totalRecipients: preflight.selectedCount,
      totalEnqueued: 0,
      totalSuppressed: preflight.suppressedCount,
      totalBatches: 0,
      batchSize: RESEND_BATCH_MAX,
      status: "cancelled",
      preflight,
      message:
        "Nenhum destinatário elegível após a pré-checagem (todos os selecionados são duplicados, inválidos ou suprimidos).",
    };
  }

  // 2. Validar fichas de atletas e construir snapshot determinístico ANTES de gravar no banco
  let snapshot: MailerCampaignSnapshot;
  try {
    const loadedAthletes =
      input.mode !== "catalog" && targetAthleteIds.length > 0
        ? await loadAthletesEmailData(targetAthleteIds, admin)
        : [];
    const canonicalBlocks =
      input.mode !== "catalog" && (input.customOptions?.hook || input.customOptions?.introduction)
        ? composeEmailBlocks({
            opening: input.customOptions?.hook,
            closing: input.customOptions?.introduction,
            athleteIds: targetAthleteIds,
          })
        : input.blocks || null;
    snapshot = createCampaignSnapshot({
      mode: input.mode,
      subjectTemplate: input.customOptions?.subject || null,
      customGreeting: input.customOptions?.greeting || null,
      customIntroduction: input.customOptions?.introduction || null,
      customHook: input.customOptions?.hook || null,
      customHeadline: input.customOptions?.headline || input.catalogOptions?.customHeadline || null,
      customMessage: input.customOptions?.message ?? input.catalogOptions?.customMessage ?? null,
      blocks: canonicalBlocks,
      athlete: input.mode === "single_athlete" ? loadedAthletes[0] || null : null,
      athletes: input.mode === "multi_athlete" || input.mode === "catalog" ? loadedAthletes : null,
    });
  } catch (snapErr) {
    return {
      success: false,
      campaignId: "",
      totalRecipients: preflight.selectedCount,
      totalEnqueued: 0,
      totalSuppressed: preflight.suppressedCount,
      totalBatches: 0,
      batchSize: RESEND_BATCH_MAX,
      status: "failed",
      preflight,
      message:
        snapErr instanceof Error
          ? snapErr.message
          : "Falha ao carregar dados dos atletas para o snapshot da campanha.",
    };
  }

  // Testar renderização de 1º destinatário elegível para garantir integridade antes de criar campanha
  const firstEligible = preflight.eligibleRecipients[0];
  let defaultSubject = snapshot.subjectTemplate || "Go Team Go — Verified Prospects";
  try {
    const sampleRender = renderQueuedEmail(
      snapshot,
      {
        recipientName: firstEligible.name,
        coachLastName: firstEligible.lastName ?? null,
        coachId: firstEligible.coachId ?? null,
        recipientEmail: firstEligible.emailNormalized,
        institutionName: firstEligible.universityName || "University Athletics",
      },
      "00000000-0000-4000-8000-000000000000",
    );
    defaultSubject = sampleRender.subject || defaultSubject;
  } catch (renderErr) {
    return {
      success: false,
      campaignId: "",
      totalRecipients: preflight.selectedCount,
      totalEnqueued: 0,
      totalSuppressed: preflight.suppressedCount,
      totalBatches: 0,
      batchSize: RESEND_BATCH_MAX,
      status: "failed",
      preflight,
      message:
        renderErr instanceof Error
          ? renderErr.message
          : "Falha de integridade na renderização do template.",
    };
  }

  const prepIdempotencyKey = buildCampaignPreparationIdempotencyKey({
    explicitKey: input.idempotencyKey,
    userId: input.createdBy,
    mode: input.mode,
    subject: defaultSubject,
    athleteIds: targetAthleteIds,
    manifestFingerprint: preflight.manifestFingerprint,
  });

  const exclusionsSummary = {
    duplicate: preflight.duplicateCount,
    invalid: preflight.invalidCount,
    suppressed: preflight.suppressedCount,
    blocked_fit: preflight.blockedFitCount,
    other: preflight.otherExcludedCount,
  };

  const totalBatches = Math.max(1, Math.ceil(preflight.eligibleCount / RESEND_BATCH_MAX));

  // 3. Criar ou retomar campanha em `preparing`
  let campaignId = "";
  let reusedCampaign = false;
  let currentStatus: MailerCampaignStatus = "preparing";

  try {
    const createRpc = await admin.rpc("create_mailer_campaign", {
      p_idempotency_key: prepIdempotencyKey,
      p_created_by: input.createdBy ?? null,
      p_mode: input.mode,
      p_subject: defaultSubject,
      p_athlete_ids: targetAthleteIds,
      p_selected_count: preflight.selectedCount,
      p_eligible_count: preflight.eligibleCount,
      p_suppressed_count: preflight.suppressedCount,
      p_manifest_fingerprint: preflight.manifestFingerprint,
      p_exclusions_summary: exclusionsSummary,
      p_filters: { ...(input.filters || {}), engineVersion: "v2" },
      p_batch_size: RESEND_BATCH_MAX,
    });

    if (!createRpc.error && createRpc.data && typeof createRpc.data === "object") {
      const d = createRpc.data as {
        campaignId?: string;
        status?: MailerCampaignStatus;
        reused?: boolean;
      };
      if (d.campaignId) {
        campaignId = d.campaignId;
        reusedCampaign = Boolean(d.reused);
        currentStatus = d.status || "preparing";
      }
    }
  } catch {
    // Fallback direto para tabela caso RPC ainda não esteja instalada no mock
  }

  if (!campaignId) {
    // Verificar se já existe campanha com a mesma idempotency_key
    try {
      const existingRes = await admin
        .from("mailer_campaigns")
        .select("id, status")
        .eq("idempotency_key", prepIdempotencyKey)
        .maybeSingle();
      if (existingRes?.data && (existingRes.data as { id?: string }).id) {
        campaignId = (existingRes.data as { id: string }).id;
        currentStatus =
          ((existingRes.data as { status?: MailerCampaignStatus })
            .status as MailerCampaignStatus) || "preparing";
        reusedCampaign = true;
      }
    } catch {
      // Prossegue para insert
    }
  }

  if (!campaignId) {
    campaignId = crypto.randomUUID();
    const { error: campErr } = await admin.from("mailer_campaigns").insert({
      id: campaignId,
      idempotency_key: prepIdempotencyKey,
      created_by: input.createdBy ?? null,
      mode: input.mode,
      subject: defaultSubject,
      athlete_ids: targetAthleteIds,
      recipients_count: preflight.selectedCount,
      selected_count: preflight.selectedCount,
      eligible_count: preflight.eligibleCount,
      manifest_count: preflight.eligibleCount,
      manifest_fingerprint: preflight.manifestFingerprint,
      total_recipients: preflight.eligibleCount,
      sent_count: 0,
      accepted_count: 0,
      failed_count: 0,
      failed_permanent_count: 0,
      failed_retryable_count: 0,
      unconfirmed_count: 0,
      cancelled_count: 0,
      suppressed_count: preflight.suppressedCount,
      exclusions_summary: exclusionsSummary,
      filters: { ...(input.filters || {}), engineVersion: "v2" },
      status: "preparing",
      current_batch: 0,
      total_batches: totalBatches,
      batch_size: RESEND_BATCH_MAX,
      delay_between_batches_sec: 2,
      delay_between_items_ms: 0,
      engine_version: "v2",
    });

    if (campErr) {
      return {
        success: false,
        campaignId: "",
        totalRecipients: preflight.selectedCount,
        totalEnqueued: 0,
        totalSuppressed: preflight.suppressedCount,
        totalBatches: 0,
        batchSize: RESEND_BATCH_MAX,
        status: "failed",
        preflight,
        message: `Erro ao criar campanha: ${campErr.message}`,
      };
    }
  }

  // Se foi um clique repetido e a campanha já está ativa/concluída, retornar imediatamente sem duplicar
  if (reusedCampaign && (currentStatus === "running" || currentStatus === "completed")) {
    return {
      success: true,
      campaignId,
      totalRecipients: preflight.selectedCount,
      totalEnqueued: preflight.eligibleCount,
      totalSuppressed: preflight.suppressedCount,
      totalBatches,
      batchSize: RESEND_BATCH_MAX,
      status: currentStatus,
      preflight,
      reusedCampaign: true,
    };
  }

  // 4. Persistir snapshot de forma idempotente
  try {
    const snapTable = admin.from("mailer_campaign_snapshots") as unknown as {
      upsert?: (row: unknown, opts?: unknown) => Promise<{ error?: { message: string } | null }>;
      insert: (row: unknown) => Promise<{ error?: { message: string } | null }>;
    };
    if (typeof snapTable.upsert === "function") {
      await snapTable.upsert(
        {
          campaign_id: campaignId,
          schema_version: 1,
          snapshot,
        },
        { onConflict: "campaign_id" },
      );
    } else {
      await snapTable.insert({
        campaign_id: campaignId,
        schema_version: 1,
        snapshot,
      });
    }
  } catch {
    // Caso já exista no retry de preparação
  }

  // 5. Persistir exclusões da pré-checagem em fatias de 1.000 para auditoria no relatório final
  if (preflight.excludedRecipients.length > 0) {
    for (let i = 0; i < preflight.excludedRecipients.length; i += SLICE_SIZE) {
      const slice = preflight.excludedRecipients.slice(i, i + SLICE_SIZE).map((ex) => ({
        campaign_id: campaignId,
        coach_id: ex.coachId && VALID_UUID_REGEX.test(ex.coachId.trim()) ? ex.coachId.trim() : null,
        email: ex.email,
        email_normalized: ex.emailNormalized,
        coach_name: ex.name || "Coach",
        university_name: ex.universityName || null,
        reason: ex.reason,
        details: ex.details || null,
      }));

      try {
        const exclTable = admin.from("mailer_campaign_exclusions") as unknown as {
          upsert?: (
            rows: unknown,
            opts?: unknown,
          ) => Promise<{ error?: { message: string } | null }>;
          insert: (rows: unknown) => Promise<{ error?: { message: string } | null }>;
        };
        if (typeof exclTable.upsert === "function") {
          await exclTable.upsert(slice, {
            onConflict: "campaign_id,email_normalized,reason",
            ignoreDuplicates: true,
          });
        } else {
          await exclTable.insert(slice);
        }
      } catch {
        // Tabela de exclusões é informativa; continua preparação
      }
    }
  }

  // 6. Resolver coach_ids existentes e inserir elegíveis na `mailer_queue` em fatias de 1.000
  const validCoachIds = await resolveExistingCoachIdsV2(
    admin,
    preflight.eligibleRecipients.map((r) => r.coachId),
  );

  const emailType: "athlete_teaser" | "athlete_teaser_multi" | "catalog_general" =
    input.mode === "single_athlete"
      ? "athlete_teaser"
      : input.mode === "multi_athlete"
        ? "athlete_teaser_multi"
        : "catalog_general";

  for (let i = 0; i < preflight.eligibleRecipients.length; i += SLICE_SIZE) {
    const slice = preflight.eligibleRecipients.slice(i, i + SLICE_SIZE);
    const queueRows = slice.map((rec, localIdx) => {
      const globalIdx = i + localIdx;
      const batchNumber = Math.floor(globalIdx / RESEND_BATCH_MAX) + 1;
      const rawCoachId = rec.coachId?.trim();
      const safeCoachId = rawCoachId && validCoachIds.has(rawCoachId) ? rawCoachId : null;
      const itemIdemKey = crypto
        .createHash("sha256")
        .update(`${campaignId}:${rec.emailNormalized}`)
        .digest("hex");

      return {
        campaign_id: campaignId,
        coach_id: safeCoachId,
        recipient_email: rec.emailNormalized,
        email_normalized: rec.emailNormalized,
        recipient_name: rec.name || "Coach",
        university_name: rec.universityName || null,
        email_type: emailType,
        subject: defaultSubject,
        payload: {
          coach_name: rec.name || "Coach",
          coach_last_name: rec.lastName || undefined,
          coach_id: safeCoachId,
          university_name: rec.universityName || "University Athletics",
          email_type: emailType,
          mode: input.mode,
          athlete_ids: targetAthleteIds,
          dry_run: isDryRun,
        },
        idempotency_key: itemIdemKey,
        status: "pending" as const,
        batch_number: batchNumber,
        attempts: 0,
        max_attempts: 3,
      };
    });

    const queueTable = admin.from("mailer_queue") as unknown as {
      upsert?: (rows: unknown, opts?: unknown) => Promise<{ error?: { message: string } | null }>;
      insert: (rows: unknown) => Promise<{ error?: { message: string } | null }>;
    };

    const writeRes =
      typeof queueTable.upsert === "function"
        ? await queueTable.upsert(queueRows, {
            onConflict: "campaign_id,email_normalized",
            ignoreDuplicates: true,
          })
        : await queueTable.insert(queueRows);

    if (writeRes?.error) {
      return {
        success: false,
        campaignId,
        totalRecipients: preflight.selectedCount,
        totalEnqueued: i,
        totalSuppressed: preflight.suppressedCount,
        totalBatches,
        batchSize: RESEND_BATCH_MAX,
        status: "preparing",
        preflight,
        message: `Falha ao persistir fatia ${Math.floor(i / SLICE_SIZE) + 1} da fila (${writeRes.error.message}). Clique novamente para retomar exatamente de onde parou.`,
      };
    }
  }

  // 7. Ativar campanha SOMENTE se a contagem na fila == eligibleCount e o fingerprint bater
  let activated = false;
  let activationErrorMsg = "";

  try {
    const actRpc = await admin.rpc("activate_mailer_campaign", {
      p_campaign_id: campaignId,
      p_expected_count: preflight.eligibleCount,
      p_expected_fingerprint: preflight.manifestFingerprint,
      p_dry_run: isDryRun,
    });

    if (!actRpc.error && actRpc.data && typeof actRpc.data === "object") {
      const actData = actRpc.data as { activated?: boolean; message?: string };
      if (actData.activated) {
        activated = true;
      } else {
        activationErrorMsg = actData.message || "Falha na verificação do manifesto da fila.";
      }
    }
  } catch {
    // Fallback de verificação caso RPC não exista no mock
  }

  if (!activated && !activationErrorMsg) {
    const countRes = await admin
      .from("mailer_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);
    const actualCount = countRes?.count ?? 0;

    if (actualCount !== preflight.eligibleCount) {
      activationErrorMsg = `Ativação bloqueada: a fila contém ${actualCount} itens, mas o manifesto exige ${preflight.eligibleCount}.`;
    } else {
      await admin
        .from("mailer_campaigns")
        .update({
          status: "running",
          eligible_count: actualCount,
          manifest_count: actualCount,
          manifest_fingerprint: preflight.manifestFingerprint,
          total_recipients: actualCount,
          total_batches: totalBatches,
          started_at: new Date().toISOString(),
          next_batch_at: new Date().toISOString(),
        })
        .eq("id", campaignId);
      activated = true;
    }
  }

  if (!activated) {
    return {
      success: false,
      campaignId,
      totalRecipients: preflight.selectedCount,
      totalEnqueued: 0,
      totalSuppressed: preflight.suppressedCount,
      totalBatches,
      batchSize: RESEND_BATCH_MAX,
      status: "preparing",
      preflight,
      message: activationErrorMsg || "Não foi possível ativar a campanha com fila incompleta.",
    };
  }

  return {
    success: true,
    campaignId,
    totalRecipients: preflight.selectedCount,
    totalEnqueued: preflight.eligibleCount,
    totalSuppressed: preflight.suppressedCount,
    totalBatches,
    batchSize: RESEND_BATCH_MAX,
    status: "running",
    preflight,
    reusedCampaign,
  };
}

export interface CampaignTickResult {
  success: boolean;
  campaignId: string;
  campaignStatus: MailerCampaignStatus;
  batchesProcessed: number;
  itemsProcessed: number;
  acceptedInTick: number;
  failedInTick: number;
  unconfirmedInTick: number;
  nextTickInMs: number | null;
  leaseHeldByOther?: boolean;
  rateLimited?: boolean;
  safetyPaused?: boolean;
  safetyPauseReason?: string | null;
  lastIdempotencyKey?: string | null;
  progress: CampaignProgress | null;
  message?: string;
}

interface ClaimedBatchItemRow {
  id: string;
  campaign_id: string;
  coach_id?: string | null;
  recipient_email: string;
  email_normalized: string;
  recipient_name: string;
  university_name?: string | null;
  email_type: "athlete_teaser" | "athlete_teaser_multi" | "catalog_general";
  subject: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  status: string;
  batch_number: number;
  attempts: number;
  max_attempts: number;
}

/**
 * Motor único idempotente no servidor (`runCampaignTick`).
 * - Orçamento de tempo `MAILER_TICK_BUDGET_MS` (default 8000ms).
 * - Processa lotes sequenciais de até 100 e-mails com intervalo mínimo `MAILER_BATCH_GAP_MS` (default 1500ms).
 * - Sem paralelismo entre lotes.
 * - Renova lease de 90s a cada lote.
 * - Aplica matriz fechada de falhas (Seção 4.4) com chave imutável `mc:{campaign_id}:b{seq}`.
 * - Retorna `nextTickInMs` para guiar o relógio único da UI (`useCampaignRunner`).
 */
export async function runCampaignTick(
  campaignId: string,
  options?: {
    controllerId?: string;
    tickBudgetMs?: number;
    batchGapMs?: number;
    customAdmin?: ReturnType<typeof getAdminClient>;
    customResendClient?: {
      batch: {
        send: (payload: unknown, opts: unknown) => Promise<unknown>;
      };
    } | null;
  },
): Promise<CampaignTickResult> {
  const admin = options?.customAdmin ?? getAdminClient();
  const config = getMailerTickConfig();
  const tickBudgetMs = options?.tickBudgetMs ?? config.tickBudgetMs;
  const batchGapMs = options?.batchGapMs ?? config.batchGapMs;
  const controllerId = options?.controllerId || `srv_${crypto.randomUUID().slice(0, 12)}`;
  const tickStartedAt = Date.now();

  if (!admin) {
    return {
      success: false,
      campaignId,
      campaignStatus: "failed",
      batchesProcessed: 0,
      itemsProcessed: 0,
      acceptedInTick: 0,
      failedInTick: 0,
      unconfirmedInTick: 0,
      nextTickInMs: null,
      progress: null,
      message: "Supabase Service Role client is not configured.",
    };
  }

  // Carregar dados da campanha e snapshot
  const campRes = await admin
    .from("mailer_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (campRes?.error || !campRes?.data) {
    return {
      success: false,
      campaignId,
      campaignStatus: "failed",
      batchesProcessed: 0,
      itemsProcessed: 0,
      acceptedInTick: 0,
      failedInTick: 0,
      unconfirmedInTick: 0,
      nextTickInMs: null,
      progress: null,
      message: "Campanha não encontrada.",
    };
  }

  const campaignRow = campRes.data as Record<string, unknown>;
  const initialStatus = (campaignRow.status as MailerCampaignStatus) || "paused";
  const isDryRun = Boolean((campaignRow.filters as Record<string, unknown> | undefined)?.dryRun);

  if (initialStatus !== "running") {
    const progress = await getCampaignProgressV2(campaignId, admin);
    return {
      success: true,
      campaignId,
      campaignStatus: initialStatus,
      batchesProcessed: 0,
      itemsProcessed: 0,
      acceptedInTick: 0,
      failedInTick: 0,
      unconfirmedInTick: 0,
      nextTickInMs: null,
      safetyPaused: Boolean(campaignRow.safety_pause_reason),
      safetyPauseReason: (campaignRow.safety_pause_reason as string | null) ?? null,
      progress,
      message: `Campanha em estado '${initialStatus}'.`,
    };
  }

  // Verificar Bounce Guard antes de iniciar o lote
  try {
    const bounceRes = await admin.rpc("mailer_campaign_bounce_stats", {
      p_campaign_id: campaignId,
    });
    const bounceData = Array.isArray(bounceRes?.data) ? bounceRes.data[0] : bounceRes?.data;
    if (bounceData && (bounceData as { bounce_guard_triggered?: boolean }).bounce_guard_triggered) {
      const pauseReason =
        "Pausada por segurança: taxa de bounce acima do limite de 3% (Bounce Guard acionado).";
      await admin
        .from("mailer_campaigns")
        .update({
          status: "paused",
          paused_at: new Date().toISOString(),
          safety_pause_reason: pauseReason,
          last_error: pauseReason,
          controller_id: null,
          controller_lease_expires_at: null,
        })
        .eq("id", campaignId);

      const progress = await getCampaignProgressV2(campaignId, admin);
      return {
        success: true,
        campaignId,
        campaignStatus: "paused",
        batchesProcessed: 0,
        itemsProcessed: 0,
        acceptedInTick: 0,
        failedInTick: 0,
        unconfirmedInTick: 0,
        nextTickInMs: null,
        safetyPaused: true,
        safetyPauseReason: pauseReason,
        progress,
        message: pauseReason,
      };
    }
  } catch {
    // Continua se consulta de bounce stats não estiver disponível
  }

  // Carregar snapshot da campanha uma única vez por tick
  let snapshot: MailerCampaignSnapshot | null = null;
  try {
    const snapRes = await admin
      .from("mailer_campaign_snapshots")
      .select("snapshot")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (snapRes?.data && (snapRes.data as { snapshot?: MailerCampaignSnapshot }).snapshot) {
      snapshot = (snapRes.data as { snapshot: MailerCampaignSnapshot }).snapshot;
    }
  } catch {
    snapshot = null;
  }

  let batchesProcessed = 0;
  let itemsProcessed = 0;
  let acceptedInTick = 0;
  let failedInTick = 0;
  let unconfirmedInTick = 0;
  let currentCampaignStatus: MailerCampaignStatus = "running";
  let nextTickInMs: number | null = batchGapMs;
  let leaseHeldByOther = false;
  let rateLimited = false;
  let safetyPaused = false;
  let safetyPauseReason: string | null = null;
  let lastIdempotencyKey: string | null = null;
  let tickMessage: string | undefined;

  while (Date.now() - tickStartedAt < tickBudgetMs) {
    // 1. Reservar lote via `claim_mailer_batch`
    const claimRpc = await admin.rpc("claim_mailer_batch", {
      p_campaign_id: campaignId,
      p_controller_id: controllerId,
      p_batch_size: RESEND_BATCH_MAX,
      p_lease_seconds: DEFAULT_LEASE_SECONDS,
    });

    if (claimRpc.error || !claimRpc.data) {
      tickMessage = claimRpc.error?.message || "Falha ao reservar lote na fila.";
      nextTickInMs = 3000;
      break;
    }

    const claim = claimRpc.data as {
      claimed: boolean;
      reusedBatch?: boolean;
      reason?: string;
      batchId?: string;
      seq?: number;
      idempotencyKey?: string;
      attempts?: number;
      previousStatus?: string;
      campaignStatus?: MailerCampaignStatus;
      waitMs?: number;
      safetyPauseReason?: string | null;
      items?: ClaimedBatchItemRow[];
    };

    if (!claim.claimed) {
      currentCampaignStatus = claim.campaignStatus || currentCampaignStatus;
      if (claim.reason === "LEASE_HELD_BY_OTHER") {
        leaseHeldByOther = true;
        nextTickInMs = 5000;
        tickMessage = "Outro controlador detém o lease ativo desta campanha.";
      } else if (claim.reason === "COOLDOWN_ACTIVE") {
        nextTickInMs = Math.max(250, Number(claim.waitMs) || batchGapMs);
        tickMessage = "Aguardando janela de intervalo entre lotes.";
      } else if (claim.reason === "QUEUE_DRAINED" || currentCampaignStatus === "completed") {
        currentCampaignStatus = "completed";
        nextTickInMs = null;
        tickMessage = "Todos os lotes da campanha foram processados.";
      } else if (currentCampaignStatus !== "running") {
        nextTickInMs = null;
        safetyPauseReason = claim.safetyPauseReason ?? null;
        safetyPaused = Boolean(safetyPauseReason);
      } else {
        nextTickInMs = batchGapMs;
      }
      break;
    }

    const batchId = claim.batchId!;
    const batchIdempotencyKey = claim.idempotencyKey!;
    const batchItems = Array.isArray(claim.items) ? claim.items : [];
    const isReplayingAmbiguous = Boolean(claim.reusedBatch) && claim.previousStatus === "ambiguous";
    lastIdempotencyKey = batchIdempotencyKey;

    if (batchItems.length === 0) {
      await admin.rpc("finalize_mailer_batch", {
        p_campaign_id: campaignId,
        p_batch_id: batchId,
        p_controller_id: controllerId,
        p_batch_status: "accepted",
        p_http_status: 200,
        p_provider_response: { emptyBatch: true },
        p_outcomes: [],
        p_pause_reason: null,
        p_next_tick_ms: batchGapMs,
        p_dry_run: isDryRun,
      });
      continue;
    }

    // 2. Se NÃO for replay de lote ambíguo, revalidar supressões surgidas entre preflight e envio
    //    (Em replay ambíguo, o payload DEVE permanecer 100% idêntico para a mesma Idempotency-Key!)
    let newlySuppressedSet = new Set<string>();
    if (!isReplayingAmbiguous && !claim.reusedBatch) {
      newlySuppressedSet = await getSuppressedEmailSet();
    }

    const preCancelledOutcomes: V2BatchItemOutcome[] = [];
    const renderableItems: ClaimedBatchItemRow[] = [];

    for (const item of batchItems) {
      const norm = item.email_normalized || normalizeEmail(item.recipient_email);
      if (newlySuppressedSet.has(norm)) {
        preCancelledOutcomes.push({
          id: item.id,
          status: "failed_permanent",
          providerMessageId: null,
          errorCode: "SUPPRESSED_BEFORE_SEND",
          errorMessage:
            "Contato entrou na lista de supressão entre a preparação e o momento do envio.",
          failureCategory: "suppressed_before_send",
        });
      } else {
        renderableItems.push(item);
      }
    }

    // 3. Renderizar determinísticamente os itens do lote a partir do snapshot
    const batchEmailsToSend: BatchEmailItem[] = [];
    const renderFailedOutcomes: V2BatchItemOutcome[] = [];

    for (const item of renderableItems) {
      try {
        const p = (item.payload || {}) as Record<string, unknown>;
        let html = typeof p.html === "string" ? p.html : "";
        let text = typeof p.text === "string" ? p.text : "";
        let subject = item.subject;

        if ((!html || !text) && snapshot) {
          const minimal: RecipientRenderVariables = {
            recipientName: String(p.coach_name || item.recipient_name || "Coach"),
            coachLastName: typeof p.coach_last_name === "string" ? p.coach_last_name : null,
            coachId: item.coach_id ?? null,
            recipientEmail: item.recipient_email,
            institutionName: String(
              p.university_name || item.university_name || "University Athletics",
            ),
          };
          const rendered = renderQueuedEmail(snapshot, minimal, campaignId);
          html = rendered.html;
          text = rendered.text;
          subject = rendered.subject || subject;
        }

        if (!html) {
          throw new Error("HTML body could not be rendered from campaign snapshot.");
        }

        const unsubHeaders = getUnsubscribeHeaders({
          email: item.recipient_email,
          campaignId,
          appUrl: snapshot?.appUrl,
        });
        // Garantir cabeçalho X-Entity-Ref-ID determinístico por item
        const headers: Record<string, string> = {
          ...unsubHeaders,
          "X-Entity-Ref-ID": item.idempotency_key,
        };

        const athleteIds = Array.isArray(p.athlete_ids) ? (p.athlete_ids as string[]) : [];
        const tags: Array<{ name: string; value: string }> = [
          { name: "campaign_id", value: campaignId },
          { name: "email_type", value: item.email_type },
        ];
        if (athleteIds.length === 1 && athleteIds[0]) {
          tags.push({ name: "athlete_id", value: athleteIds[0] });
        }

        batchEmailsToSend.push({
          id: item.id,
          to: item.recipient_email,
          subject,
          html,
          text,
          headers,
          tags,
        });
      } catch (renderErr) {
        renderFailedOutcomes.push({
          id: item.id,
          status: "failed_permanent",
          providerMessageId: null,
          errorCode: "RENDER_ERROR",
          errorMessage:
            renderErr instanceof Error
              ? renderErr.message
              : "Falha ao renderizar e-mail para o destinatário.",
          failureCategory: "render_error",
        });
      }
    }

    // Se todos os itens do lote foram suprimidos/falharam no render antes de chamar Resend
    if (batchEmailsToSend.length === 0) {
      const combinedOutcomes = [...preCancelledOutcomes, ...renderFailedOutcomes];
      const finRes = await admin.rpc("finalize_mailer_batch", {
        p_campaign_id: campaignId,
        p_batch_id: batchId,
        p_controller_id: controllerId,
        p_batch_status: "failed",
        p_http_status: 422,
        p_provider_response: { skippedBeforeProvider: true },
        p_outcomes: combinedOutcomes,
        p_pause_reason: null,
        p_next_tick_ms: batchGapMs,
        p_dry_run: isDryRun,
      });

      batchesProcessed++;
      itemsProcessed += batchItems.length;
      failedInTick += combinedOutcomes.length;
      const finData = (finRes?.data || {}) as { campaignStatus?: MailerCampaignStatus };
      if (finData.campaignStatus) currentCampaignStatus = finData.campaignStatus;
      if (currentCampaignStatus !== "running") {
        nextTickInMs = null;
        break;
      }
      continue;
    }

    // 4. Enviar o lote via Resend Batch API com `Idempotency-Key: mc:{campaign_id}:b{seq}`
    const sendResult = await sendResendBatchV2(batchEmailsToSend, {
      idempotencyKey: batchIdempotencyKey,
      dryRun: isDryRun || Boolean((batchItems[0]?.payload as { dry_run?: boolean })?.dry_run),
      customClient: options?.customResendClient,
    });

    // 5. Persistir desfecho do lote em UMA ÚNICA TRANSAÇÃO via `finalize_mailer_batch`
    if (sendResult.disposition === "retry_same_key") {
      rateLimited = sendResult.httpStatus === 429;
      const retryMs = sendResult.retryAfterMs || 2000;
      const finRes = await admin.rpc("finalize_mailer_batch", {
        p_campaign_id: campaignId,
        p_batch_id: batchId,
        p_controller_id: controllerId,
        p_batch_status: "claimed",
        p_http_status: sendResult.httpStatus,
        p_provider_response: {
          errorCode: sendResult.errorCode,
          message: sendResult.errorMessage,
          retryAfterMs: retryMs,
        },
        p_outcomes: [],
        p_pause_reason: null,
        p_next_tick_ms: retryMs,
        p_dry_run: isDryRun,
      });
      const finData = (finRes?.data || {}) as {
        campaignStatus?: MailerCampaignStatus;
        failedRetryableCount?: number;
      };
      if (finData.campaignStatus) currentCampaignStatus = finData.campaignStatus;
      nextTickInMs = currentCampaignStatus === "running" ? retryMs : null;
      tickMessage =
        sendResult.httpStatus === 429
          ? `Limite de taxa do provedor (429): aguardando ${Math.ceil(retryMs / 1000)}s para repetir lote ${batchIdempotencyKey} com a mesma chave.`
          : `Requisição idempotente concorrente (409): aguardando ${Math.ceil(retryMs / 1000)}s.`;
      break;
    }

    if (sendResult.disposition === "ambiguous_same_key") {
      const retryMs = sendResult.retryAfterMs || 1500;
      const finRes = await admin.rpc("finalize_mailer_batch", {
        p_campaign_id: campaignId,
        p_batch_id: batchId,
        p_controller_id: controllerId,
        p_batch_status: "ambiguous",
        p_http_status: sendResult.httpStatus,
        p_provider_response: {
          errorCode: sendResult.errorCode,
          message: sendResult.errorMessage,
        },
        p_outcomes: [],
        p_pause_reason: null,
        p_next_tick_ms: retryMs,
        p_dry_run: isDryRun,
      });
      const finData = (finRes?.data || {}) as { campaignStatus?: MailerCampaignStatus };
      if (finData.campaignStatus) currentCampaignStatus = finData.campaignStatus;
      nextTickInMs = currentCampaignStatus === "running" ? retryMs : null;
      tickMessage = `Resposta ambígua (${sendResult.httpStatus}): o próximo tick reenviará o mesmo lote com a mesma chave (${batchIdempotencyKey}).`;
      break;
    }

    if (sendResult.disposition === "pause_quota" || sendResult.disposition === "pause_config") {
      safetyPaused = true;
      safetyPauseReason =
        sendResult.pauseReason || "Campanha pausada preventivamente por limite ou configuração.";
      await admin.rpc("finalize_mailer_batch", {
        p_campaign_id: campaignId,
        p_batch_id: batchId,
        p_controller_id: controllerId,
        p_batch_status: "claimed",
        p_http_status: sendResult.httpStatus,
        p_provider_response: {
          errorCode: sendResult.errorCode,
          message: sendResult.errorMessage,
        },
        p_outcomes: [],
        p_pause_reason: safetyPauseReason,
        p_next_tick_ms: 0,
        p_dry_run: isDryRun,
      });
      currentCampaignStatus = "paused";
      nextTickInMs = null;
      tickMessage = safetyPauseReason;
      break;
    }

    if (sendResult.disposition === "unconfirmed_409") {
      safetyPaused = true;
      safetyPauseReason =
        sendResult.pauseReason ||
        "Pausada por segurança: conflito 409 de chave idempotente com payload divergente.";
      const allOutcomes = [
        ...preCancelledOutcomes,
        ...renderFailedOutcomes,
        ...sendResult.outcomes,
      ];
      await admin.rpc("finalize_mailer_batch", {
        p_campaign_id: campaignId,
        p_batch_id: batchId,
        p_controller_id: controllerId,
        p_batch_status: "failed",
        p_http_status: 409,
        p_provider_response: {
          errorCode: sendResult.errorCode,
          message: sendResult.errorMessage,
        },
        p_outcomes: allOutcomes,
        p_pause_reason: safetyPauseReason,
        p_next_tick_ms: 0,
        p_dry_run: isDryRun,
      });
      unconfirmedInTick += sendResult.outcomes.filter((o) => o.status === "unconfirmed").length;
      currentCampaignStatus = "paused";
      nextTickInMs = null;
      tickMessage = safetyPauseReason;
      break;
    }

    // Desfecho `accepted`, `partial` ou `failed_permanent`
    const allOutcomes = [...preCancelledOutcomes, ...renderFailedOutcomes, ...sendResult.outcomes];
    const batchAccepted = allOutcomes.filter((o) => o.status === "accepted").length;
    const batchFailed = allOutcomes.filter(
      (o) => o.status === "failed_permanent" || o.status === "failed_retryable",
    ).length;
    const batchUnconfirmed = allOutcomes.filter((o) => o.status === "unconfirmed").length;

    const dbBatchStatus =
      sendResult.disposition === "accepted" &&
      preCancelledOutcomes.length === 0 &&
      renderFailedOutcomes.length === 0
        ? "accepted"
        : batchAccepted > 0
          ? "partial"
          : "failed";

    const finRes = await admin.rpc("finalize_mailer_batch", {
      p_campaign_id: campaignId,
      p_batch_id: batchId,
      p_controller_id: controllerId,
      p_batch_status: dbBatchStatus,
      p_http_status: sendResult.httpStatus,
      p_provider_response: sendResult.rawResponse || { status: dbBatchStatus },
      p_outcomes: allOutcomes,
      p_pause_reason: null,
      p_next_tick_ms: batchGapMs,
      p_dry_run: isDryRun,
    });

    batchesProcessed++;
    itemsProcessed += allOutcomes.length;
    acceptedInTick += batchAccepted;
    failedInTick += batchFailed;
    unconfirmedInTick += batchUnconfirmed;

    const finData = (finRes?.data || {}) as {
      campaignStatus?: MailerCampaignStatus;
      pendingCount?: number;
      claimedCount?: number;
    };

    if (finData.campaignStatus) {
      currentCampaignStatus = finData.campaignStatus;
    }

    if (
      currentCampaignStatus !== "running" ||
      (finData.pendingCount === 0 && finData.claimedCount === 0)
    ) {
      currentCampaignStatus =
        currentCampaignStatus === "running" ? "completed" : currentCampaignStatus;
      nextTickInMs = null;
      break;
    }

    // Verificar se cabe mais um lote dentro do orçamento do tick respeitando `batchGapMs`
    const elapsedMs = Date.now() - tickStartedAt;
    if (elapsedMs + batchGapMs + 1500 >= tickBudgetMs) {
      nextTickInMs = Math.max(250, batchGapMs);
      break;
    }

    if (batchGapMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, batchGapMs));
    }
  }

  const progress = await getCampaignProgressV2(campaignId, admin);
  if (progress) {
    currentCampaignStatus = progress.status;
    if (currentCampaignStatus !== "running") {
      nextTickInMs = null;
    }
  }

  return {
    success: true,
    campaignId,
    campaignStatus: currentCampaignStatus,
    batchesProcessed,
    itemsProcessed,
    acceptedInTick,
    failedInTick,
    unconfirmedInTick,
    nextTickInMs,
    leaseHeldByOther,
    rateLimited,
    safetyPaused,
    safetyPauseReason,
    lastIdempotencyKey,
    progress,
    message: tickMessage,
  };
}

/**
 * Lê o progresso leve (~1 KB) da campanha via `mailer_campaign_progress`.
 */
export async function getCampaignProgressV2(
  campaignId: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<CampaignProgress | null> {
  const admin = customAdmin ?? getAdminClient();
  if (!admin || !campaignId) return null;

  try {
    const rpcRes = await admin.rpc("mailer_campaign_progress", {
      p_campaign_id: campaignId,
    });

    if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === "object") {
      const d = rpcRes.data as Record<string, unknown>;
      const eligible = Number(d.eligibleCount ?? d.totalRecipients ?? 0);
      const accepted = Number(d.acceptedCount ?? d.sentCount ?? 0);
      const failedPerm = Number(d.failedPermanentCount ?? 0);
      const failedRetry = Number(d.failedRetryableCount ?? 0);
      const unconfirmed = Number(d.unconfirmedCount ?? 0);
      const cancelled = Number(d.cancelledCount ?? 0);
      const pending = Number(d.pendingCount ?? 0);
      const claimed = Number(d.claimedCount ?? d.processingCount ?? 0);
      const suppressed = Number(d.suppressedCount ?? 0);
      const decided = Number(
        d.decidedCount ?? accepted + failedPerm + failedRetry + unconfirmed + cancelled,
      );
      const statesSum = Number(
        d.statesSum ??
          pending + claimed + accepted + failedPerm + failedRetry + unconfirmed + cancelled,
      );
      const submissionPercent =
        eligible > 0 ? Math.min(100, Math.round((decided / eligible) * 100)) : 100;
      const delivered = Number(d.deliveredCount ?? 0);
      const bounced = Number(d.bouncedCount ?? 0);
      const deliveryPercent =
        accepted > 0 ? Math.min(100, Math.round((delivered / accepted) * 100)) : 0;

      const status = (d.status as MailerCampaignStatus) || "running";
      const safetyPauseReason = (d.safetyPauseReason as string | null) ?? null;

      return {
        campaignId: String(d.campaignId || campaignId),
        status,
        subject: String(d.subject || "Campanha Mailer"),
        mode: (d.mode as MailerCampaignMode) || "single_athlete",
        engineVersion: String(d.engineVersion || "v2"),
        selectedCount: Number(d.selectedCount ?? eligible),
        eligibleCount: eligible,
        totalRecipients: eligible,
        sentCount: accepted,
        acceptedCount: accepted,
        failedCount: failedPerm + failedRetry,
        failedPermanentCount: failedPerm,
        failedRetryableCount: failedRetry,
        suppressedCount: suppressed,
        pendingCount: pending,
        processingCount: claimed,
        claimedCount: claimed,
        cancelledCount: cancelled,
        unconfirmedCount: unconfirmed,
        decidedCount: decided,
        statesSum,
        invariantValid:
          typeof d.invariantValid === "boolean" ? d.invariantValid : statesSum === eligible,
        submissionPercent,
        deliveryPercent,
        percentComplete: submissionPercent,
        deliveredCount: delivered,
        bouncedCount: bounced,
        complainedCount: Number(d.complainedCount ?? 0),
        openedCount: Number(d.openedCount ?? 0),
        clickedCount: Number(d.clickedCount ?? 0),
        awaitingDeliveryCount: Number(
          d.awaitingDeliveryCount ?? Math.max(0, accepted - delivered - bounced),
        ),
        currentBatch: Number(d.currentBatch ?? 0),
        totalBatches: Math.max(1, Number(d.totalBatches ?? Math.ceil(Math.max(eligible, 1) / 100))),
        batchSize: Number(d.batchSize ?? RESEND_BATCH_MAX),
        lastBatchStatus: (d.lastBatchStatus as string | null) ?? null,
        lastBatchAttempts: Number(d.lastBatchAttempts ?? 0),
        lastBatchIdempotencyKey: (d.lastBatchIdempotencyKey as string | null) ?? null,
        exclusionsSummary: (d.exclusionsSummary as Record<string, number>) || {},
        safetyPauseReason,
        nextBatchAt: (d.nextBatchAt as string | null) ?? null,
        startedAt: (d.startedAt as string | null) ?? null,
        completedAt: (d.completedAt as string | null) ?? null,
        pausedAt: (d.pausedAt as string | null) ?? null,
        throughputPerSec: Number(d.throughputPerSec ?? 0),
        estimatedRemainingSeconds:
          typeof d.estimatedRemainingSeconds === "number" ? d.estimatedRemainingSeconds : null,
        lastError: (d.lastError as string | null) ?? null,
        substate:
          unconfirmed > 0 || safetyPauseReason
            ? "reconciliation_required"
            : status === "completed"
              ? "completed"
              : status === "paused"
                ? "manual_pause"
                : "sending",
        asOf: String(d.asOf || new Date().toISOString()),
      };
    }
  } catch {
    // Fallback direto na tabela caso RPC não esteja instalada
  }

  const campRes = await admin
    .from("mailer_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campRes?.data) return null;
  const c = campRes.data as Record<string, unknown>;

  const queueRes = await admin.from("mailer_queue").select("status").eq("campaign_id", campaignId);
  const rows = Array.isArray(queueRes?.data) ? (queueRes.data as Array<{ status: string }>) : [];

  let pending = 0;
  let claimed = 0;
  let accepted = 0;
  let failedPerm = 0;
  let failedRetry = 0;
  let unconfirmed = 0;
  let cancelled = 0;

  for (const r of rows) {
    if (r.status === "pending") pending++;
    else if (r.status === "claimed" || r.status === "processing") claimed++;
    else if (r.status === "accepted" || r.status === "sent") accepted++;
    else if (r.status === "failed_permanent" || r.status === "failed") failedPerm++;
    else if (r.status === "failed_retryable" || r.status === "retry") failedRetry++;
    else if (r.status === "unconfirmed") unconfirmed++;
    else if (r.status === "cancelled") cancelled++;
  }

  const statesSum =
    pending + claimed + accepted + failedPerm + failedRetry + unconfirmed + cancelled;
  const eligible = Number(c.eligible_count || c.total_recipients || statesSum);
  const decided = accepted + failedPerm + failedRetry + unconfirmed + cancelled;
  const submissionPercent =
    eligible > 0 ? Math.min(100, Math.round((decided / eligible) * 100)) : 100;

  return {
    campaignId,
    status: (c.status as MailerCampaignStatus) || "running",
    subject: String(c.subject || "Campanha Mailer"),
    mode: (c.mode as MailerCampaignMode) || "single_athlete",
    engineVersion: String(c.engine_version || "v2"),
    selectedCount: Number(c.selected_count || c.recipients_count || eligible),
    eligibleCount: eligible,
    totalRecipients: eligible,
    sentCount: accepted,
    acceptedCount: accepted,
    failedCount: failedPerm + failedRetry,
    failedPermanentCount: failedPerm,
    failedRetryableCount: failedRetry,
    suppressedCount: Number(c.suppressed_count || 0),
    pendingCount: pending,
    processingCount: claimed,
    claimedCount: claimed,
    cancelledCount: cancelled,
    unconfirmedCount: unconfirmed,
    decidedCount: decided,
    statesSum,
    invariantValid: statesSum === eligible,
    submissionPercent,
    deliveryPercent: 0,
    percentComplete: submissionPercent,
    deliveredCount: Number(c.delivered_count || 0),
    bouncedCount: 0,
    complainedCount: 0,
    openedCount: 0,
    clickedCount: 0,
    awaitingDeliveryCount: Math.max(0, accepted - Number(c.delivered_count || 0)),
    currentBatch: Number(c.current_batch || 0),
    totalBatches: Math.max(1, Number(c.total_batches || Math.ceil(Math.max(eligible, 1) / 100))),
    batchSize: Number(c.batch_size || RESEND_BATCH_MAX),
    exclusionsSummary: (c.exclusions_summary as Record<string, number>) || {},
    safetyPauseReason: (c.safety_pause_reason as string | null) ?? null,
    nextBatchAt: (c.next_batch_at as string | null) ?? null,
    startedAt: (c.started_at as string | null) ?? null,
    completedAt: (c.completed_at as string | null) ?? null,
    pausedAt: (c.paused_at as string | null) ?? null,
    throughputPerSec: 0,
    estimatedRemainingSeconds: null,
    lastError: (c.last_error as string | null) ?? null,
    asOf: new Date().toISOString(),
  };
}

function mapExclusionReasonToPt(reason: MailerExclusionReason, details?: string | null) {
  switch (reason) {
    case "duplicate":
      return {
        categoryLabelPt: "Duplicado na Seleção",
        reasonPt: details || "E-mail repetido na lista selecionada (mantida a 1ª ocorrência).",
        suggestedActionPt: "Nenhuma ação necessária; o contato principal já foi incluído.",
      };
    case "invalid":
      return {
        categoryLabelPt: "E-mail com Sintaxe Inválida",
        reasonPt: details || "Endereço de e-mail fora do padrão RFC 5322.",
        suggestedActionPt: "Corrigir o e-mail no cadastro do coach antes de um novo envio.",
      };
    case "suppressed":
      return {
        categoryLabelPt: "Suprimido (Opt-out / Bounce)",
        reasonPt: details || "Contato na lista de descadastro ou bounce anterior.",
        suggestedActionPt:
          "Respeitar o opt-out ou verificar o endereço caso tenha sido substituído.",
      };
    case "blocked_fit":
      return {
        categoryLabelPt: "Conflito de Perfil (Sinal do Coach)",
        reasonPt: details || "Coach sinalizou elenco completo ou posição incompatível.",
        suggestedActionPt: "Selecionar outra universidade ou atleta compatível com a posição.",
      };
    default:
      return {
        categoryLabelPt: "Excluído na Pré-checagem",
        reasonPt: details || "Descartado pelas regras de pré-checagem.",
        suggestedActionPt: "Revisar cadastro do destinatário.",
      };
  }
}

function mapQueueNonSentToPt(status: string, errorCode?: string | null, lastError?: string | null) {
  if (status === "failed_retryable" || status === "retry") {
    return {
      categoryKey: "failed_retryable" as const,
      categoryLabelPt: "Falha Temporária Retentável",
      reasonPt:
        lastError ||
        "Limite de tentativas atingido após erro temporário de taxa (429) ou rede no provedor.",
      suggestedActionPt:
        'Clique em "Reenviar somente falhas retentáveis" para reenfileirar estes contatos.',
    };
  }
  if (status === "unconfirmed") {
    const isLegacy = errorCode === "LEGACY_UNCONFIRMED" || /legado/i.test(lastError || "");
    return {
      categoryKey: "unconfirmed" as const,
      categoryLabelPt: isLegacy
        ? "Não Confirmado (Legado)"
        : "Não Confirmado (Requer Decisão Humana)",
      reasonPt:
        lastError ||
        "Sem confirmação de ID de mensagem do provedor; bloqueado contra reenvio cego.",
      suggestedActionPt:
        'Use "Resolver não confirmados" após verificar no painel do provedor se a mensagem saiu.',
    };
  }
  if (status === "cancelled") {
    return {
      categoryKey: "cancelled" as const,
      categoryLabelPt: "Cancelado",
      reasonPt: lastError || "Envio cancelado antes da submissão ao provedor.",
      suggestedActionPt: "Se desejar enviar, crie uma nova campanha ou reative os contatos.",
    };
  }
  return {
    categoryKey: "failed_permanent" as const,
    categoryLabelPt: "Falha Permanente (Rejeitado pelo Provedor)",
    reasonPt: lastError || "Rejeitado definitivamente pelo provedor (4xx / validação / supressão).",
    suggestedActionPt: "Revisar endereço de e-mail do coach; não tente reenviar sem corrigir.",
  };
}

/**
 * Monta o Relatório Final Auditável da campanha (Seção 4.7), combinando:
 * - Resumo congelado de submissão + contadores vivos de entrega (webhooks)
 * - Lista explicada em português de todos os itens não enviados (exclusões + falhas + não confirmados)
 * - Status final honesto (`Concluída — tudo aceito`, `Concluída com ressalvas`, `Pausada por segurança`, `Interrompida — reabra para retomar`).
 */
export async function getCampaignFinalReport(
  campaignId: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<MailerCampaignFinalReport | null> {
  const admin = customAdmin ?? getAdminClient();
  if (!admin || !campaignId) return null;

  const progress = await getCampaignProgressV2(campaignId, admin);
  if (!progress) return null;

  const nonSentItems: MailerNonSentReportItem[] = [];

  // 1. Carregar exclusões da pré-checagem (`mailer_campaign_exclusions`)
  try {
    const exclRes = await admin
      .from("mailer_campaign_exclusions")
      .select("id, email, email_normalized, coach_name, university_name, reason, details")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .limit(2000);

    if (Array.isArray(exclRes?.data)) {
      for (const row of exclRes.data as Array<{
        id: string;
        email: string;
        email_normalized: string;
        coach_name?: string | null;
        university_name?: string | null;
        reason: MailerExclusionReason;
        details?: string | null;
      }>) {
        const mapped = mapExclusionReasonToPt(row.reason, row.details);
        nonSentItems.push({
          id: `excl_${row.id}`,
          email: row.email || row.email_normalized,
          coachName: row.coach_name || "Coach",
          universityName: row.university_name || "—",
          source: "preflight_exclusion",
          status: row.reason,
          categoryKey: row.reason === "other" ? "invalid" : row.reason,
          categoryLabelPt: mapped.categoryLabelPt,
          reasonPt: mapped.reasonPt,
          suggestedActionPt: mapped.suggestedActionPt,
          attempts: 0,
        });
      }
    }
  } catch {
    // Continua se tabela de exclusões estiver vazia
  }

  // 2. Carregar itens da fila que NÃO estão em `accepted`/`sent`
  try {
    const queueRes = await admin
      .from("mailer_queue")
      .select(
        "id, recipient_email, recipient_name, university_name, status, attempts, error_code, last_error",
      )
      .eq("campaign_id", campaignId)
      .in("status", [
        "failed_permanent",
        "failed_retryable",
        "unconfirmed",
        "cancelled",
        "failed",
        "retry",
        "suppressed",
      ])
      .order("batch_number", { ascending: true })
      .limit(2000);

    if (Array.isArray(queueRes?.data)) {
      for (const row of queueRes.data as Array<{
        id: string;
        recipient_email: string;
        recipient_name: string;
        university_name?: string | null;
        status: string;
        attempts: number;
        error_code?: string | null;
        last_error?: string | null;
      }>) {
        const mapped = mapQueueNonSentToPt(row.status, row.error_code, row.last_error);
        nonSentItems.push({
          id: row.id,
          email: row.recipient_email,
          coachName: row.recipient_name || "Coach",
          universityName: row.university_name || "—",
          source: "queue_item",
          status: row.status,
          categoryKey: mapped.categoryKey,
          categoryLabelPt: mapped.categoryLabelPt,
          reasonPt: mapped.reasonPt,
          suggestedActionPt: mapped.suggestedActionPt,
          attempts: row.attempts || 0,
        });
      }
    }
  } catch {
    // Ignora falha parcial de listagem
  }

  const eligibleCount = progress.eligibleCount ?? progress.totalRecipients;
  const exclusionsSummary = progress.exclusionsSummary || {};
  const excludedFromSummary = Object.values(exclusionsSummary).reduce(
    (acc, n) => acc + (Number(n) || 0),
    0,
  );
  const preflightExclusionsCount = Math.max(
    excludedFromSummary,
    nonSentItems.filter((i) => i.source === "preflight_exclusion").length,
  );
  const selectedCount = Math.max(
    progress.selectedCount ?? 0,
    eligibleCount + preflightExclusionsCount,
  );

  const acceptedCount = progress.acceptedCount ?? progress.sentCount;
  const failedPermanentCount = progress.failedPermanentCount ?? 0;
  const failedRetryableCount = progress.failedRetryableCount ?? 0;
  const unconfirmedCount = progress.unconfirmedCount ?? 0;
  const cancelledCount = progress.cancelledCount ?? 0;

  let finalBadgeLabelPt: MailerCampaignFinalReport["finalBadgeLabelPt"] = "Concluída — tudo aceito";
  let finalBadgeTone: MailerCampaignFinalReport["finalBadgeTone"] = "emerald";

  if (progress.status === "cancelled") {
    finalBadgeLabelPt = "Cancelada";
    finalBadgeTone = "rose";
  } else if (progress.status === "paused" && progress.safetyPauseReason) {
    finalBadgeLabelPt = "Pausada por segurança";
    finalBadgeTone = "rose";
  } else if (progress.status === "running" || progress.status === "paused") {
    finalBadgeLabelPt = "Interrompida — reabra para retomar";
    finalBadgeTone = "amber";
  } else if (
    failedPermanentCount > 0 ||
    failedRetryableCount > 0 ||
    unconfirmedCount > 0 ||
    cancelledCount > 0 ||
    preflightExclusionsCount > 0
  ) {
    finalBadgeLabelPt = "Concluída com ressalvas";
    finalBadgeTone = "amber";
  }

  return {
    campaignId,
    subject: progress.subject,
    mode: progress.mode || "single_athlete",
    status: progress.status,
    finalBadgeLabelPt,
    finalBadgeTone,
    selectedCount,
    eligibleCount,
    excludedCount: preflightExclusionsCount,
    acceptedCount,
    deliveredCount: progress.deliveredCount ?? 0,
    awaitingDeliveryCount: progress.awaitingDeliveryCount ?? 0,
    bouncedCount: progress.bouncedCount ?? 0,
    complainedCount: progress.complainedCount ?? 0,
    openedCount: progress.openedCount ?? 0,
    clickedCount: progress.clickedCount ?? 0,
    failedPermanentCount,
    failedRetryableCount,
    unconfirmedCount,
    cancelledCount,
    invariantSelectionValid: selectedCount === eligibleCount + preflightExclusionsCount,
    invariantQueueValid: Boolean(progress.invariantValid ?? true),
    asOf: progress.asOf || new Date().toISOString(),
    startedAt: progress.startedAt,
    completedAt: progress.completedAt,
    safetyPauseReason: progress.safetyPauseReason ?? null,
    nonSentItems,
  };
}

/**
 * Gera conteúdo CSV (UTF-8 com BOM para Excel) dos itens não enviados do relatório final.
 */
export function buildNonSentReportCsv(report: MailerCampaignFinalReport): string {
  const escapeCsv = (val: string) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const headers = [
    "E-mail",
    "Coach",
    "Universidade",
    "Origem",
    "Categoria",
    "Motivo em Português",
    "Ação Sugerida",
    "Tentativas",
  ];
  const lines = [headers.map(escapeCsv).join(",")];
  for (const item of report.nonSentItems) {
    lines.push(
      [
        item.email,
        item.coachName,
        item.universityName,
        item.source === "preflight_exclusion" ? "Pré-checagem" : "Fila de Envio",
        item.categoryLabelPt,
        item.reasonPt,
        item.suggestedActionPt,
        String(item.attempts),
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}`;
}

/**
 * Reenfileira SOMENTE os itens `failed_retryable` para `pending` e reabre a campanha.
 */
export async function retryFailedRetryableItems(
  campaignId: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<{ success: boolean; requeuedCount: number; message: string }> {
  const admin = customAdmin ?? getAdminClient();
  if (!admin) {
    return {
      success: false,
      requeuedCount: 0,
      message: "Supabase Service Role client is not configured.",
    };
  }

  try {
    const rpcRes = await admin.rpc("mailer_requeue_failed_retryable", {
      p_campaign_id: campaignId,
    });
    if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === "object") {
      const d = rpcRes.data as { requeuedCount?: number };
      const cnt = Number(d.requeuedCount || 0);
      return {
        success: cnt > 0,
        requeuedCount: cnt,
        message:
          cnt > 0
            ? `${cnt} destinatário(s) com falha temporária foram reenfileirados para novo envio.`
            : "Nenhum item com falha retentável encontrado nesta campanha.",
      };
    }
  } catch {
    // Fallback direto em tabela
  }

  const updRes = await admin
    .from("mailer_queue")
    .update({
      status: "pending",
      batch_id: null,
      batch_seq: null,
      attempts: 0,
      reserved_by: null,
      reserved_at: null,
      reservation_expires_at: null,
      next_retry_at: null,
      last_error: null,
      error_code: null,
      failure_category: null,
      processed_at: null,
    })
    .eq("campaign_id", campaignId)
    .in("status", ["failed_retryable", "retry"]);

  if (updRes?.error) {
    return {
      success: false,
      requeuedCount: 0,
      message: `Erro ao reenfileirar falhas retentáveis: ${updRes.error.message}`,
    };
  }

  await admin
    .from("mailer_campaigns")
    .update({
      status: "running",
      completed_at: null,
      paused_at: null,
      safety_pause_reason: null,
      last_error: null,
      failed_retryable_count: 0,
      next_batch_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return {
    success: true,
    requeuedCount: 1,
    message: "Itens com falha temporária reenfileirados com sucesso.",
  };
}

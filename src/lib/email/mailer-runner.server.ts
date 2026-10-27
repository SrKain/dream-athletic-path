import { getAdminClient } from "@/lib/supabase/clients.server";
import {
  processMailerQueue,
  reconcileStaleProcessingQueueItems,
  QUEUE_CONFIG,
  type ProcessQueueResult,
} from "./mailer-queue.server";
import type { MailerQueueStatus, MailerCampaignStatus } from "@/types/db";
import {
  deriveCampaignSubstate,
  type MailerSubstate,
  type CampaignHealthSummary,
} from "./mailer-health";

export { deriveCampaignSubstate, type MailerSubstate, type CampaignHealthSummary };

export interface CampaignHealth {
  campaignId: string;
  substate: MailerSubstate;
  substateLabel: string;
  substateDescription: string;
  isHealthy: boolean;
  canResume: boolean;
  canPause: boolean;
  canCancel: boolean;
  requiresReconciliation: boolean;
  lastProgressAt: string | null;
  nextAttemptAt: string | null;
}

export type WorkerOutcome =
  | { status: "idle"; batchesExecuted: 0; totalSent: 0 }
  | {
      status: "processed" | "blocked";
      campaignId: string;
      batchesExecuted: number;
      totalSent: number;
      reason: string | null;
    };

/**
 * One awaited, bounded invocation. A trusted external scheduler may call it again.
 * No detached promises or in-process timers: a serverless process can disappear
 * immediately after returning its HTTP response.
 *
 * Existing campaigns are never enrolled automatically. Only server-opted-in
 * campaigns with a due batch, running state and no quarantine are candidates.
 */
export async function runNextEligibleCampaignBurst(
  customAdmin?: ReturnType<typeof getAdminClient>,
  executeBurst: typeof processMailerQueue = processMailerQueue,
  now: Date = new Date(),
): Promise<WorkerOutcome> {
  const admin = customAdmin || getAdminClient();
  const { data, error } = await admin
    .from("mailer_campaigns")
    .select("id,status,last_error,filters,next_batch_at")
    .eq("status", "running")
    .contains("filters", { serverOrchestration: true })
    .lte("next_batch_at", now.toISOString())
    .order("next_batch_at", { ascending: true })
    .limit(10);

  if (error) throw new Error("Unable to read eligible mailer campaigns.");
  const candidates = (data || []) as Array<{
    id: string;
    status: string;
    last_error: string | null;
    filters: Record<string, unknown> | null;
  }>;
  const next = candidates.find(
    (c) =>
      c.status === "running" &&
      c.filters?.serverOrchestration === true &&
      !/manual reconciliation required|unconfirmed_delivery|unconfirmed|provider_ambiguous|ambiguous|quarantine/i.test(
        c.last_error || "",
      ),
  );

  if (!next) return { status: "idle", batchesExecuted: 0, totalSent: 0 };
  // Leases and queue claims inside TASK-106 remain the only send authority.
  const result: ProcessQueueResult = await executeBurst({
    campaignId: next.id,
    maxBatchSize: QUEUE_CONFIG.BURST_SIZE,
    workerId: `scheduled-${crypto.randomUUID()}`,
    clientId: `scheduler-${next.id}`,
    customAdmin: admin,
  });
  const blocked =
    (result.processed === 0 &&
      !result.cooldownActive &&
      !result.controllerConflict &&
      !result.campaignCompleted) ||
    result.campaignStatus === "paused";
  return {
    status: blocked ? "blocked" : "processed",
    campaignId: next.id,
    batchesExecuted: 1,
    totalSent: result.sent,
    reason: result.message || null,
  };
}

/**
 * Incident review intentionally does not clear quarantine or mutate queue rows
 * without an explicit human resolution tag:
 * - [MARKED_SENT]: Marks unconfirmed / ambiguous items as 'sent' (prevents re-send)
 * - [REQUEUE_PENDING]: Re-enqueues unconfirmed / ambiguous items to 'pending'
 * - [MARKED_FAILED]: Marks unconfirmed / ambiguous items as 'failed' (cancels re-send)
 */
export async function reconcileCampaignIncident(
  campaignId: string,
  adminNotes: string,
  _actorUserId?: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<{
  success: boolean;
  message: string;
  resolution?: "marked_sent" | "requeue_pending" | "marked_failed";
}> {
  const cleanNotes = (adminNotes || "").trim();
  if (cleanNotes.length < 5) {
    return {
      success: false,
      message:
        "É obrigatório fornecer uma nota explicativa da reconciliação com no mínimo 5 caracteres.",
    };
  }
  const admin = customAdmin || getAdminClient();
  const { data: campaign, error } = await admin
    .from("mailer_campaigns")
    .select("id,status,last_error")
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !campaign)
    return { success: false, message: "Não foi possível consultar a campanha." };

  const resolutionMatch = cleanNotes.match(/^\[(MARKED_SENT|REQUEUE_PENDING|MARKED_FAILED)\]/i);
  if (!resolutionMatch) {
    if (
      !/manual reconciliation required|unconfirmed_delivery|unconfirmed|provider_ambiguous|ambiguous|quarantine/i.test(
        campaign.last_error || "",
      )
    ) {
      return { success: false, message: "A campanha não possui incidente ambíguo a reconciliar." };
    }
    return {
      success: false,
      message:
        "Quarentena preservada. A anotação não comprova aceitação/rejeição pelo Resend. " +
        "Antes de liberar, é necessária reconciliação operacional, por destinatário, " +
        "com evidência do provedor e auditoria em transação autorizada.",
    };
  }

  const rawTag = resolutionMatch[1].toUpperCase();
  const resolution: "marked_sent" | "requeue_pending" | "marked_failed" =
    rawTag === "MARKED_SENT"
      ? "marked_sent"
      : rawTag === "REQUEUE_PENDING"
        ? "requeue_pending"
        : "marked_failed";

  const rec = await reconcileStaleProcessingQueueItems(campaignId, admin, { forceAll: true });
  const nowIso = new Date().toISOString();

  const targetUpdate =
    resolution === "marked_sent"
      ? {
          status: "sent",
          processed_at: nowIso,
          reserved_by: null,
          reserved_at: null,
          reservation_expires_at: null,
          last_error: null,
          error_code: null,
        }
      : resolution === "requeue_pending"
        ? {
            status: "pending",
            reserved_by: null,
            reserved_at: null,
            reservation_expires_at: null,
            next_retry_at: null,
            last_error: null,
            error_code: null,
          }
        : {
            status: "failed",
            processed_at: nowIso,
            reserved_by: null,
            reserved_at: null,
            reservation_expires_at: null,
            next_retry_at: null,
            last_error: `Marcado como falha pelo operador na reconciliação: ${cleanNotes}`,
            error_code: "RECONCILED_FAILED",
          };

  // 1. Aplicar decisão explícita do humano aos itens em status = 'unconfirmed'
  try {
    await admin
      .from("mailer_queue")
      .update(targetUpdate)
      .eq("campaign_id", campaignId)
      .eq("status", "unconfirmed");
  } catch {
    // Segue mesmo se o mock ou tabela não tiver linhas em status = 'unconfirmed'
  }

  // 2. Aplicar decisão explícita do humano aos itens com error_code = 'PROVIDER_AMBIGUOUS'
  try {
    await admin
      .from("mailer_queue")
      .update(targetUpdate)
      .eq("campaign_id", campaignId)
      .eq("error_code", "PROVIDER_AMBIGUOUS");
  } catch {
    // Segue mesmo se não houver itens com error_code = PROVIDER_AMBIGUOUS
  }

  await admin
    .from("mailer_campaigns")
    .update({
      last_error: null,
      controller_id: null,
      controller_lease_expires_at: null,
    })
    .eq("id", campaignId);

  const actionLabel =
    resolution === "marked_sent"
      ? "marcados como enviados"
      : resolution === "requeue_pending"
        ? "devolvidos para pending"
        : "marcados como falha/cancelados";

  return {
    success: true,
    resolution,
    message: `Campanha reconciliada (${rec.confirmedSent} confirmados automaticamente por evidência; itens não confirmados ${actionLabel}). Pronta para retomada no navegador.`,
  };
}

export interface RecentMailerCampaign {
  id: string;
  subject: string;
  status: MailerCampaignStatus;
  createdAt: string;
  totalRecipients: number;
  sentCount: number;
}

/** A read-only, bounded selector for restoring any recent campaign on another device. */
export async function getRecentMailerCampaigns(
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<RecentMailerCampaign[]> {
  const admin = customAdmin || getAdminClient();
  const { data, error } = await admin
    .from("mailer_campaigns")
    .select("id,subject,status,created_at,total_recipients,sent_count")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(20);
  if (error) throw new Error("Unable to load recent mailer campaigns.");
  return (data || [])
    .filter((row) => row.status !== "draft" && row.status !== "preparing")
    .map((row) => ({
      id: row.id,
      subject: row.subject || "Campanha sem assunto",
      status: row.status as MailerCampaignStatus,
      createdAt: row.created_at,
      totalRecipients: Number(row.total_recipients) || 0,
      sentCount: Number(row.sent_count) || 0,
    }));
}

export interface CampaignRecipientRow {
  id: string;
  recipientEmail: string;
  recipientName: string;
  universityName: string | null;
  status: MailerQueueStatus;
  attempts: number;
  lastError: string | null;
  processedAt: string | null;
  createdAt: string;
}

/**
 * Consulta paginada dos destinatários da fila de uma campanha específica para o dashboard operacional.
 */
export async function getCampaignRecipients(
  campaignId: string,
  page: number = 1,
  pageSize: number = 10,
  statusFilter?: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<{
  items: CampaignRecipientRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const admin = customAdmin || getAdminClient();
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(5, Math.min(100, pageSize));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = admin
    .from("mailer_queue")
    .select(
      "id, recipient_email, recipient_name, university_name, status, attempts, last_error, processed_at, created_at",
      { count: "exact" },
    )
    .eq("campaign_id", campaignId);

  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "pending") {
      query = query.in("status", ["pending", "retry"]);
    } else {
      query = query.eq("status", statusFilter);
    }
  }

  query = query.order("created_at", { ascending: true }).range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("[mailer-runner] Error fetching campaign recipients:", error.message);
    return { items: [], total: 0, page: safePage, pageSize: safePageSize, totalPages: 0 };
  }

  const items: CampaignRecipientRow[] = (data || []).map((row) => ({
    id: row.id,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name,
    universityName: row.university_name,
    status: row.status as MailerQueueStatus,
    attempts: row.attempts,
    lastError: row.last_error,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  }));

  const total = count || 0;
  const totalPages = Math.ceil(total / safePageSize);

  return { items, total, page: safePage, pageSize: safePageSize, totalPages };
}

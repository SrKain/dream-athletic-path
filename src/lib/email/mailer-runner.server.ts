import { getAdminClient } from "@/lib/supabase/clients.server";
import {
  processMailerQueue,
  QUEUE_CONFIG,
  type ProcessQueueResult,
} from "./mailer-queue.server";
import type { MailerQueueStatus } from "@/types/db";
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
      !/manual reconciliation required|provider_ambiguous|ambiguous|quarantine/i.test(
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
 * Incident review intentionally does not clear quarantine or mutate queue rows.
 * A note from a person does NOT prove whether Resend accepted a request.
 * Controlled row-level reconciliation, audit records and a new authorized RPC
 * are prerequisites to any subsequent resume. No silent state transitions.
 */
export async function reconcileCampaignIncident(
  campaignId: string,
  adminNotes: string,
  _actorUserId?: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<{ success: boolean; message: string }> {
  if ((adminNotes || "").trim().length < 5) {
    return {
      success: false,
      message: "É obrigatório fornecer uma nota explicativa da reconciliação com no mínimo 5 caracteres.",
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
  if (!/manual reconciliation required|provider_ambiguous|ambiguous|quarantine/i.test(
    campaign.last_error || "",
  )) {
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

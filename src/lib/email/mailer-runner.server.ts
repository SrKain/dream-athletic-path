import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/clients.server";
import {
  processMailerQueue,
  getCampaignQueueProgress,
  QUEUE_CONFIG,
  type CampaignProgress,
} from "./mailer-queue.server";
import type { MailerCampaignStatus, MailerQueueStatus } from "@/types/db";
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

/**
 * Executa o loop de trabalhador do servidor de forma durável e limitada por tempo (time budget).
 * Projetado para ser executado sem depender de conexão do navegador aberta.
 */
export async function runCampaignWorkerLoop(
  campaignId: string,
  maxDurationMs: number = 25_000,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<{
  batchesExecuted: number;
  totalSent: number;
  completed: boolean;
  stoppedReason?: string;
}> {
  const admin = customAdmin || getAdminClient();
  const startTime = Date.now();
  let batchesExecuted = 0;
  let totalSent = 0;
  const workerId = `server-worker-${crypto.randomBytes(4).toString("hex")}`;

  while (Date.now() - startTime < maxDurationMs) {
    const result = await processMailerQueue({
      campaignId,
      workerId,
      clientId: workerId,
      maxBatchSize: QUEUE_CONFIG.BURST_SIZE,
      customAdmin: admin,
    });

    batchesExecuted++;
    totalSent += result.sent;

    if (result.campaignCompleted || result.campaignStatus === "completed") {
      return { batchesExecuted, totalSent, completed: true };
    }

    if (
      result.campaignStatus === "paused" ||
      result.campaignStatus === "cancelled" ||
      result.campaignStatus === "failed"
    ) {
      return {
        batchesExecuted,
        totalSent,
        completed: false,
        stoppedReason: result.message || `Status changed to ${result.campaignStatus}`,
      };
    }

    if (result.controllerConflict) {
      return {
        batchesExecuted,
        totalSent,
        completed: false,
        stoppedReason: "Controller conflict with another active worker",
      };
    }

    if (result.rateLimited || result.cooldownActive) {
      // Cooldown ativo, não adiantar tentar de novo neste loop
      return {
        batchesExecuted,
        totalSent,
        completed: false,
        stoppedReason: `Cooldown active (${result.cooldownRemainingSec || 1}s remaining)`,
      };
    }

    if (result.processed === 0) {
      // Nenhum item disponível no momento
      break;
    }

    // Pequena pausa entre rajadas para respeitar taxa do provedor
    const pauseMs = result.burstPauseMs || QUEUE_CONFIG.BURST_PAUSE_MS;
    if (Date.now() - startTime + pauseMs >= maxDurationMs) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }

  return { batchesExecuted, totalSent, completed: false };
}

/**
 * Dispara o worker do servidor em segundo plano de forma desvinculada (fire-and-forget seguro).
 */
export function triggerServerCampaignWorker(
  campaignId: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): void {
  if (!campaignId || typeof campaignId !== "string") return;

  // Executa de forma assíncrona desacoplada da requisição HTTP
  setTimeout(() => {
    runCampaignWorkerLoop(campaignId, 25_000, customAdmin).catch((err) => {
      console.error(`[mailer-runner] Background worker error for ${campaignId}:`, err);
    });
  }, 100);
}

/**
 * Reconcilia manualmente uma campanha presa em quarentena (reconciliation_required).
 * Permite ao administrador revisar e limpar a trava de segurança sem disparos acidentais.
 */
export async function reconcileCampaignIncident(
  campaignId: string,
  adminNotes: string,
  actorUserId?: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<{ success: boolean; message: string }> {
  const sanitizedNotes = (adminNotes || "").trim();
  if (sanitizedNotes.length < 5) {
    return {
      success: false,
      message: "É obrigatório fornecer uma nota explicativa da reconciliação com no mínimo 5 caracteres.",
    };
  }

  const admin = customAdmin || getAdminClient();

  const { data: campaign, error: readError } = await admin
    .from("mailer_campaigns")
    .select("id, status, last_error")
    .eq("id", campaignId)
    .maybeSingle();

  // Registra auditoria da reconciliação e define status como paused seguro
  const auditMessage = `[Reconciliado por ${actorUserId || "admin"} em ${new Date().toISOString()}]: ${sanitizedNotes}`;

  const { error: updateError } = await admin
    .from("mailer_campaigns")
    .update({
      status: "paused",
      last_error: auditMessage,
      paused_at: new Date().toISOString(),
      next_batch_at: null,
    })
    .eq("id", campaignId);

  if (updateError) {
    return { success: false, message: updateError.message };
  }

  return {
    success: true,
    message: "Incidente reconciliado com sucesso. A campanha foi alterada para 'Pausada' e pode ser retomada com segurança.",
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

import type { MailerCampaignStatus } from "@/types/db";

export type MailerSubstate =
  | "scheduled"
  | "sending"
  | "waiting_provider"
  | "waiting_retry"
  | "waiting_lease"
  | "recovering"
  | "stalled"
  | "reconciliation_required"
  | "manual_pause"
  | "completed"
  | "cancelled";

export interface CampaignHealthSummary {
  substate: MailerSubstate;
  label: string;
  description: string;
  isHealthy: boolean;
  canResume: boolean;
  canPause: boolean;
  canCancel: boolean;
  requiresReconciliation: boolean;
}

/**
 * Função pura que deriva o subestado operacional detalhado da campanha
 * para garantir observabilidade honesta sem depender da presença do navegador.
 */
export function deriveCampaignSubstate(
  campaign: {
    status: MailerCampaignStatus;
    last_error?: string | null;
    next_batch_at?: string | null;
    started_at?: string | null;
    paused_at?: string | null;
    completed_at?: string | null;
    cancelled_at?: string | null;
  },
  options?: {
    cooldownActive?: boolean;
    controllerConflict?: boolean;
    pendingCount?: number;
    processingCount?: number;
  },
): CampaignHealthSummary {
  const status = campaign.status;
  const lastError = (campaign.last_error || "").trim();

  // 1. Quarentena / Reconciliação Manual tem máxima precedência
  const isQuarantine =
    lastError.includes("Manual reconciliation required") ||
    lastError.includes("ambiguous") ||
    lastError.includes("PROVIDER_AMBIGUOUS") ||
    lastError.includes("quarantine");

  if (isQuarantine) {
    return {
      substate: "reconciliation_required",
      label: "Requer Reconciliação",
      description:
        "O provedor respondeu de forma ambígua ou houve falha transacional. O envio foi bloqueado para prevenir duplicidade de e-mails.",
      isHealthy: false,
      canResume: false, // Bloqueado propositalmente até reconciliação explícita
      canPause: false,
      canCancel: true,
      requiresReconciliation: true,
    };
  }

  // 2. Concluída
  if (status === "completed") {
    return {
      substate: "completed",
      label: "Concluída",
      description: "Todos os destinatários ativos foram processados com sucesso.",
      isHealthy: true,
      canResume: false,
      canPause: false,
      canCancel: false,
      requiresReconciliation: false,
    };
  }

  // 3. Cancelada
  if (status === "cancelled") {
    return {
      substate: "cancelled",
      label: "Cancelada",
      description: "O envio foi cancelado e todos os itens restantes foram abortados.",
      isHealthy: false,
      canResume: false,
      canPause: false,
      canCancel: false,
      requiresReconciliation: false,
    };
  }

  // 4. Pausada Manualmente
  if (status === "paused") {
    return {
      substate: "manual_pause",
      label: "Pausada Manualmente",
      description: "A campanha está pausada pelo usuário e pode ser retomada a qualquer momento.",
      isHealthy: true,
      canResume: true,
      canPause: false,
      canCancel: true,
      requiresReconciliation: false,
    };
  }

  // 5. Conflito de Controle / Lease
  if (options?.controllerConflict) {
    return {
      substate: "waiting_lease",
      label: "Aguardando Liberação de Controle",
      description: "Outro processo ou aba possui a reserva desta campanha no momento.",
      isHealthy: true,
      canResume: false,
      canPause: true,
      canCancel: true,
      requiresReconciliation: false,
    };
  }

  // 6. Cooldown / Rate Limit do Provedor
  if (options?.cooldownActive) {
    return {
      substate: "waiting_retry",
      label: "Aguardando Rate Limit (429)",
      description:
        "Resend solicitou redução de taxa temporária; o próximo lote prosseguirá em breve.",
      isHealthy: true,
      canResume: false,
      canPause: true,
      canCancel: true,
      requiresReconciliation: false,
    };
  }

  // 7. Em Fila
  if (status === "queued") {
    return {
      substate: "scheduled",
      label: "Em Fila",
      description: "Campanha criada e aguardando processamento da primeira rajada.",
      isHealthy: true,
      canResume: false,
      canPause: true,
      canCancel: true,
      requiresReconciliation: false,
    };
  }

  // 8. Em Andamento
  if (status === "running") {
    const nextBatchTime = campaign.next_batch_at ? new Date(campaign.next_batch_at).getTime() : 0;
    const now = Date.now();

    if (nextBatchTime > now) {
      return {
        substate: "scheduled",
        label: "Aguardando Próxima Rajada",
        description: `Próximo lote programado para ${new Date(nextBatchTime).toLocaleTimeString("pt-BR")}.`,
        isHealthy: true,
        canResume: false,
        canPause: true,
        canCancel: true,
        requiresReconciliation: false,
      };
    }

    // Se o próximo lote já deveria ter rodado há mais de 120 segundos sem atualização
    if (nextBatchTime > 0 && now - nextBatchTime > 120_000) {
      return {
        substate: "stalled",
        label: "Possivelmente Estagnada",
        description:
          "O horário agendado expirou sem confirmação do worker. O sistema tentará recuperação segura.",
        isHealthy: false,
        canResume: false,
        canPause: true,
        canCancel: true,
        requiresReconciliation: false,
      };
    }

    return {
      substate: "sending",
      label: "Disparando Rajada",
      description: "O servidor está enviando mensagens em lotes e confirmando aceites de entrega.",
      isHealthy: true,
      canResume: false,
      canPause: true,
      canCancel: true,
      requiresReconciliation: false,
    };
  }

  // 9. Falha Geral
  if (status === "failed") {
    return {
      substate: "stalled",
      label: "Falha na Campanha",
      description: lastError || "Ocorreu um erro no processamento da campanha.",
      isHealthy: false,
      canResume: false,
      canPause: false,
      canCancel: true,
      requiresReconciliation: false,
    };
  }

  return {
    substate: "scheduled",
    label: "Aguardando",
    description: "Status em transição.",
    isHealthy: true,
    canResume: false,
    canPause: true,
    canCancel: true,
    requiresReconciliation: false,
  };
}

/** An ETA without repeated successful bursts is not evidence-based. */
export function canEstimateMailerEta(options: {
  status: MailerCampaignStatus;
  sentCount: number;
  currentBatch: number;
  nextBatchAt?: string | null;
  lastError?: string | null;
}): boolean {
  if (options.status !== "running" || options.sentCount <= 0 || options.currentBatch < 3)
    return false;
  if (/manual reconciliation required|provider_ambiguous|ambiguous|quarantine/i.test(options.lastError || ""))
    return false;
  if (options.nextBatchAt) {
    const next = Date.parse(options.nextBatchAt);
    if (!Number.isFinite(next) || next > Date.now()) return false;
  }
  return true;
}

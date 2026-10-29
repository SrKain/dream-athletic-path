import { createServerFn } from "@tanstack/react-start";
import { requireAgency } from "@/lib/supabase/auth-middleware";
import type {
  SendMailerInput,
  CoachInterestSignalInput,
  AdminCoachPreferenceInput,
} from "./recruit-email.server";
import type { SuppressionType } from "@/types/db";

// 1. Envio do Mailer (Requer agência)
export const sendMailerServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: SendMailerInput) => data)
  .handler(async ({ data }) => {
    const { sendMailerEmails } = await import("./recruit-email.server");
    return sendMailerEmails(data);
  });

// 2. Consulta de E-mails Suprimidos (Requer agência)
export const getSuppressedEmailsServerFn = createServerFn({ method: "GET" })
  .middleware([requireAgency])
  .handler(async () => {
    const { getSuppressedEmailSet } = await import("./recruit-email.server");
    const set = await getSuppressedEmailSet();
    return Array.from(set);
  });

// 3. Descadastro Público (Aberto para o link do e-mail com suporte a 2 níveis)
export const unsubscribeServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { email: string; reason?: string; suppressionType?: SuppressionType }) => data,
  )
  .handler(async ({ data }) => {
    const { unsubscribeEmailAddress } = await import("./recruit-email.server");
    return unsubscribeEmailAddress(data.email, data.reason, data.suppressionType);
  });

// 4. Submissão Pública de Sinal de Interesse / Feedback do Treinador (Validade de 6 meses)
export const submitInterestSignalServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: CoachInterestSignalInput) => data)
  .handler(async ({ data }) => {
    const { recordCoachInterestSignal } = await import("./recruit-email.server");
    return recordCoachInterestSignal(data);
  });

// 5. Consulta de Sinais de Interesse Ativos (Requer agência)
export const getActiveInterestSignalsServerFn = createServerFn({ method: "GET" })
  .middleware([requireAgency])
  .handler(async () => {
    const { getActiveCoachInterestSignals } = await import("./recruit-email.server");
    return getActiveCoachInterestSignals();
  });

// Gestão manual de preferências dos coaches (somente agência autenticada)
export const getCoachPreferencesServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { coachEmail: string; coachId?: string }) => data)
  .handler(async ({ data }) => {
    const { getCoachPreferenceRecords } = await import("./recruit-email.server");
    return getCoachPreferenceRecords(data.coachEmail, data.coachId);
  });

export const addCoachPreferenceSignalServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: AdminCoachPreferenceInput) => data)
  .handler(async ({ data }) => {
    const validReasons = [
      "position_not_needed",
      "fully_recruited",
      "other_positions_only",
      "specific_athlete_dislike",
    ];
    if (!validReasons.includes(data.reason)) {
      return { success: false, message: "Invalid coach preference reason." };
    }
    const { recordCoachInterestSignal } = await import("./recruit-email.server");
    return recordCoachInterestSignal(data);
  });

export const setCoachSuppressionServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { email: string; suppressionType: SuppressionType }) => data)
  .handler(async ({ data }) => {
    const { setCoachSuppression } = await import("./recruit-email.server");
    return setCoachSuppression(data.email, data.suppressionType);
  });

export const closeCoachPreferenceSignalServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { id: string; coachEmail: string; coachId: string }) => data)
  .handler(async ({ data }) => {
    const { closeCoachPreferenceSignal } = await import("./recruit-email.server");
    return closeCoachPreferenceSignal(data.id, data.coachEmail, data.coachId);
  });

export const removeManualCoachSuppressionServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const { removeManualCoachSuppression } = await import("./recruit-email.server");
    return removeManualCoachSuppression(data.email);
  });

// 6. Histórico de Envios (Requer agência)
export const getMailerHistoryServerFn = createServerFn({ method: "GET" })
  .middleware([requireAgency])
  .handler(async () => {
    const { getAdminClient } = await import("@/lib/supabase/clients.server");
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("recruit_email_logs")
      .select(
        "id, athlete_id, coach_id, subject, status, error_message, sent_at, email_type, recipient_email, recipient_name, university_name, provider_id",
      )
      .order("sent_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[recruit-email] Error fetching history logs:", error.message);
      return [];
    }
    return data || [];
  });

// 7. Métricas Analíticas do Mailer (Requer agência)
export const getMailerMetricsServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator(
    (data?: {
      days?: number;
      range?: "7d" | "30d" | "90d" | "all" | "custom";
      campaignId?: string;
      athleteId?: string;
      division?: string;
      startDate?: string;
      endDate?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { getMailerMetricsReport } = await import("./mailer-metrics.server");
    return getMailerMetricsReport(data);
  });

// 8. Linha do Tempo de Eventos de E-mail (Requer agência)
export const getEmailEventTimelineServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator(
    (data: { providerEmailId?: string | null; recipientEmail?: string | null }) => data,
  )
  .handler(async ({ data }) => {
    const { getEmailEventTimeline } = await import("./mailer-metrics.server");
    return getEmailEventTimeline(data.providerEmailId, data.recipientEmail);
  });

// 9. Retrocompatibilidade para chamadas legadas
export const sendRecruitEmailServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { athleteId: string; coachIds: string[] }) => data)
  .handler(async ({ data }) => {
    const { sendRecruitEmailToCoaches } = await import("./recruit-email.server");
    return sendRecruitEmailToCoaches(data);
  });

// 10. Enfileiramento Inteligente de Campanha do Mailer (Requer agência)
export const enqueueMailerCampaignServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: SendMailerInput & { idempotencyKey?: string }) => data)
  .handler(async ({ data, context }) => {
    const { getMailerEngineMode, prepareAndActivateCampaignV2 } =
      await import("./mailer-engine-v2.server");
    const userId = (context as { user?: { id?: string } })?.user?.id ?? data.createdBy;
    if (getMailerEngineMode() === "legacy") {
      const { enqueueCampaignDispatches } = await import("./mailer-queue.server");
      return enqueueCampaignDispatches({ ...data, createdBy: userId });
    }
    return prepareAndActivateCampaignV2({ ...data, createdBy: userId });
  });

// 11. Progresso em Tempo Real da Fila da Campanha (Requer agência)
export const getCampaignQueueProgressServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data }) => {
    const { getMailerEngineMode, getCampaignProgressV2 } =
      await import("./mailer-engine-v2.server");
    if (getMailerEngineMode() === "legacy") {
      const { getCampaignQueueProgress } = await import("./mailer-queue.server");
      return getCampaignQueueProgress(data.campaignId);
    }
    return getCampaignProgressV2(data.campaignId);
  });

// 12. Pausar Campanha em Andamento (Requer agência)
export const pauseMailerCampaignServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data }) => {
    const { pauseCampaign } = await import("./mailer-queue.server");
    return pauseCampaign(data.campaignId);
  });

// 13. Retomar Campanha Pausada (Requer agência)
export const resumeMailerCampaignServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data }) => {
    const { resumeCampaign } = await import("./mailer-queue.server");
    return resumeCampaign(data.campaignId);
  });

// 14. Cancelar Campanha (Requer agência)
export const cancelMailerCampaignServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data }) => {
    const { cancelCampaign } = await import("./mailer-queue.server");
    return cancelCampaign(data.campaignId);
  });

// 15. Processamento autenticado de lote via navegador (100 destinatários = 1 chamada batch à Resend por tick)
export const processMailerMicroBatchServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string; batchSize?: number; clientId?: string }) => {
    if (!data?.campaignId || typeof data.campaignId !== "string" || !data.campaignId.trim()) {
      throw new Error("campaignId is required.");
    }
    return {
      campaignId: data.campaignId.trim(),
      batchSize:
        Number.isSafeInteger(Number(data.batchSize)) && Number(data.batchSize) > 0
          ? Math.min(300, Number(data.batchSize))
          : 100,
      clientId: typeof data.clientId === "string" ? data.clientId.trim() : undefined,
    };
  })
  .handler(async ({ data }) => {
    const { processMailerQueue } = await import("./mailer-queue.server");
    return processMailerQueue({
      campaignId: data.campaignId,
      maxBatchSize: data.batchSize,
      clientId: data.clientId,
    });
  });

// 16. Buscar Campanha Ativa em Andamento (Requer agência)
export const getLatestActiveCampaignServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .handler(async () => {
    const { getLatestActiveCampaign } = await import("./mailer-queue.server");
    return getLatestActiveCampaign();
  });

// Preview usa exatamente o mesmo carregador em lote do envio e da fila.
export const getAthletesEmailDataServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { athleteIds: string[] }) => data)
  .handler(async ({ data }) => {
    const { loadAthletesEmailData } = await import("./athlete-email-data.server");
    return loadAthletesEmailData(data.athleteIds);
  });

// 17. Consulta de Destinatários da Fila de uma Campanha (Requer agência)
export const getCampaignRecipientsServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator(
    (data: { campaignId: string; page?: number; pageSize?: number; statusFilter?: string }) => data,
  )
  .handler(async ({ data }) => {
    const { getCampaignRecipients } = await import("./mailer-runner.server");
    return getCampaignRecipients(
      data.campaignId,
      data.page || 1,
      data.pageSize || 10,
      data.statusFilter,
    );
  });

// 18. Reconciliação Manual de Incidente de Campanha em Quarentena (Requer agência)
export const reconcileCampaignIncidentServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string; adminNotes: string }) => data)
  .handler(async ({ data, context }) => {
    const { reconcileCampaignIncident } = await import("./mailer-runner.server");
    const userEmail = (context as { user?: { email?: string } })?.user?.email;
    return reconcileCampaignIncident(data.campaignId, data.adminNotes, userEmail);
  });

// 19. Destravar e sincronizar fila para retomada pelo navegador (sem reenvio automático de unconfirmed)
export const triggerCampaignWorkerServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data }) => {
    const { getAdminClient } = await import("@/lib/supabase/clients.server");
    const { reconcileStaleProcessingQueueItems, getCampaignQueueProgress } =
      await import("./mailer-queue.server");
    const admin = getAdminClient();

    const rec = await reconcileStaleProcessingQueueItems(data.campaignId, admin, {
      forceAll: true,
    });

    const { data: campaign } = await admin
      .from("mailer_campaigns")
      .select("filters, status")
      .eq("id", data.campaignId)
      .maybeSingle();

    if (!campaign) {
      return {
        success: false as boolean,
        requiresReconciliation: false as boolean,
        unconfirmedCount: 0 as number,
        unconfirmedRecipients: [] as import("./mailer-queue.server").UnconfirmedRecipientSummary[],
        message: "Campaign not found.",
      };
    }

    if (["completed", "cancelled", "failed"].includes(campaign.status)) {
      return {
        success: false as boolean,
        requiresReconciliation: false as boolean,
        unconfirmedCount: 0 as number,
        unconfirmedRecipients: [] as import("./mailer-queue.server").UnconfirmedRecipientSummary[],
        message: `Campaign is in terminal state '${campaign.status}' and cannot be resumed.`,
      };
    }

    const progress = await getCampaignQueueProgress(data.campaignId, admin);
    const totalUnconfirmed = Math.max(rec.unconfirmedCount, progress?.unconfirmedCount || 0);

    // Se houver itens em 'unconfirmed' (sem evidência de entrega), NÃO retomar automaticamente
    // nem voltar para pending: pausar e exigir decisão explícita do humano.
    if (totalUnconfirmed > 0) {
      const pauseReason = `Manual reconciliation required: UNCONFIRMED_DELIVERY on ${totalUnconfirmed} recipient(s) without delivery confirmation.`;
      await admin
        .from("mailer_campaigns")
        .update({
          status: "paused",
          last_error: pauseReason,
          controller_id: null,
          controller_lease_expires_at: null,
          next_batch_at: null,
        })
        .eq("id", data.campaignId);

      return {
        success: true as boolean,
        requiresReconciliation: true as boolean,
        unconfirmedCount: totalUnconfirmed as number,
        unconfirmedRecipients: rec.unconfirmedRecipients,
        message: `Atenção: ${totalUnconfirmed} destinatário(s) estavam em processamento sem confirmação de entrega e foram marcados como 'unconfirmed' (${rec.confirmedSent} já enviados foram preservados). Decisão humana obrigatória antes de prosseguir.`,
      };
    }

    const currentFilters =
      campaign.filters && typeof campaign.filters === "object"
        ? (campaign.filters as Record<string, unknown>)
        : {};

    await admin
      .from("mailer_campaigns")
      .update({
        status: "running",
        paused_at: null,
        last_error: null,
        controller_id: null,
        controller_lease_expires_at: null,
        next_batch_at: new Date().toISOString(),
        filters: {
          ...currentFilters,
          serverOrchestration: false,
        },
      })
      .eq("id", data.campaignId);

    return {
      success: true as boolean,
      requiresReconciliation: false as boolean,
      unconfirmedCount: 0 as number,
      unconfirmedRecipients: [] as import("./mailer-queue.server").UnconfirmedRecipientSummary[],
      message: `Fila sincronizada (${rec.confirmedSent} já enviados preservados). Disparando pelo navegador!`,
    };
  });

// 19a. Criação de Rascunho de Campanha em 3 Fases (Requer agência)
export const createCampaignDraftServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: import("./mailer-queue.server").CreateCampaignDraftInput) => data)
  .handler(async ({ data }) => {
    const { createCampaignDraft } = await import("./mailer-queue.server");
    return createCampaignDraft(data);
  });

// 19b. Anexar Destinatários em Lote (Requer agência)
export const appendCampaignRecipientsServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string; recipients: SendMailerInput["recipients"] }) => data)
  .handler(async ({ data }) => {
    const { appendCampaignRecipients } = await import("./mailer-queue.server");
    return appendCampaignRecipients(data.campaignId, data.recipients);
  });

// 19c. Ativar Campanha (Requer agência)
export const activateCampaignServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string; dryRun?: boolean }) => data)
  .handler(async ({ data }) => {
    const { activateCampaign } = await import("./mailer-queue.server");
    return activateCampaign(data.campaignId, { dryRun: data.dryRun });
  });

// 19d. Consulta de Métricas de Bounce em Tempo Real (Requer agência)
export const getCampaignBounceStatsServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data }) => {
    const { getAdminClient } = await import("@/lib/supabase/clients.server");
    const admin = getAdminClient();
    const { parseCampaignBounceStats } = await import("./mailer-queue.server");
    const { data: rawData, error } = await admin.rpc("mailer_campaign_bounce_stats", {
      p_campaign_id: data.campaignId,
    });
    if (error || !rawData) {
      return {
        sentCount: 0,
        bounceCount: 0,
        complaintCount: 0,
        bounceRate: 0,
        bounceGuardTriggered: false,
      };
    }
    const parsed = parseCampaignBounceStats(rawData);
    return {
      sentCount: parsed.sentCount,
      bounceCount: parsed.permanentBounces,
      complaintCount: parsed.complaints,
      bounceRate: parsed.bounceRate,
      bounceGuardTriggered: parsed.bounceGuardTriggered,
    };
  });

// 19e. Histórico operacional recente, limitado e exclusivo da agência.
export const getRecentMailerCampaignsServerFn = createServerFn({ method: "GET" })
  .middleware([requireAgency])
  .handler(async () => {
    const { getRecentMailerCampaigns } = await import("./mailer-runner.server");
    return getRecentMailerCampaigns();
  });

// 19b. Retorna a autoridade de orquestração da campanha atual (somente leitura).
export const getMailerCampaignOrchestrationModeServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data }) => {
    const { getAdminClient } = await import("@/lib/supabase/clients.server");
    const { isMailerWorkerEnabled } = await import("./mailer-worker-auth");
    if (!isMailerWorkerEnabled()) {
      return { serverOrchestrated: false };
    }
    const { data: campaign, error } = await getAdminClient()
      .from("mailer_campaigns")
      .select("filters")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error || !campaign) return { serverOrchestrated: false };
    const filters = campaign.filters as Record<string, unknown> | null;
    return { serverOrchestrated: filters?.serverOrchestration === true };
  });

// 20. Histórico de Envios Paginado no Servidor (Requer agência)
export const getPaginatedMailerHistoryServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator(
    (data?: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
      campaignId?: string;
      athleteId?: string;
      universityName?: string;
      state?: string;
      league?: string;
      budgetLevel?: string;
      toeflLevel?: string;
      startDate?: string;
      endDate?: string;
    }) => data || {},
  )
  .handler(async ({ data }) => {
    const { getPaginatedMailerHistory } = await import("./mailer-history.server");
    return getPaginatedMailerHistory(data);
  });

// 21. Pré-checagem Autoritativa do Mailer V2 (selecionados = elegíveis + exclusões + cota mensal)
export const runMailerPreflightServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: import("./mailer-engine-v2.server").RunMailerPreflightInput) => data)
  .handler(async ({ data }) => {
    const { runMailerPreflight } = await import("./mailer-engine-v2.server");
    return runMailerPreflight(data);
  });

// 22. Tick Idempotente de Campanha no Servidor (`runCampaignTick`)
export const runCampaignTickServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string; controllerId?: string }) => {
    if (!data?.campaignId || typeof data.campaignId !== "string" || !data.campaignId.trim()) {
      throw new Error("campaignId is required.");
    }
    return {
      campaignId: data.campaignId.trim(),
      controllerId: typeof data.controllerId === "string" ? data.controllerId.trim() : undefined,
    };
  })
  .handler(async ({ data }) => {
    const { getMailerEngineMode, runCampaignTick, getCampaignProgressV2 } =
      await import("./mailer-engine-v2.server");
    if (getMailerEngineMode() === "legacy") {
      const { processMailerQueue, getCampaignQueueProgress } =
        await import("./mailer-queue.server");
      const res = await processMailerQueue({
        campaignId: data.campaignId,
        maxBatchSize: 100,
        clientId: data.controllerId,
      });
      const progress = await getCampaignQueueProgress(data.campaignId);
      return {
        success: true,
        campaignId: data.campaignId,
        campaignStatus: res.campaignStatus || progress?.status || "running",
        batchesProcessed: res.processed > 0 ? 1 : 0,
        itemsProcessed: res.processed,
        acceptedInTick: res.sent,
        failedInTick: res.failed,
        unconfirmedInTick: 0,
        nextTickInMs:
          (res.campaignStatus || progress?.status) === "running"
            ? (res.cooldownRemainingSec || 2) * 1000
            : null,
        leaseHeldByOther: Boolean(res.controllerConflict),
        rateLimited: res.rateLimited,
        progress: progress || null,
        message: res.message,
      };
    }
    const tickRes = await runCampaignTick(data.campaignId, {
      controllerId: data.controllerId,
    });
    if (!tickRes.progress) {
      tickRes.progress = await getCampaignProgressV2(data.campaignId);
    }
    return tickRes;
  });

// 23. Relatório Final Auditável da Campanha (resumo congelado + entrega viva + itens não enviados)
export const getCampaignFinalReportServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data }) => {
    const { getCampaignFinalReport } = await import("./mailer-engine-v2.server");
    return getCampaignFinalReport(data.campaignId);
  });

// 24. Reenviar Somente Falhas Retentáveis (`failed_retryable` -> `pending`)
export const retryFailedRetryableServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data }) => {
    const { retryFailedRetryableItems } = await import("./mailer-engine-v2.server");
    return retryFailedRetryableItems(data.campaignId);
  });

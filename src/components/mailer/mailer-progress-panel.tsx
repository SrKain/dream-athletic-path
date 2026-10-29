import React from "react";
import {
  Activity,
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sparkles,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import type { BounceStatsSummary } from "@/hooks/use-campaign-runner";
import type { CampaignRecipientRow } from "@/lib/email/mailer-runner.server";
import type { CampaignProgress } from "@/types/db";

export interface MailerProgressPanelProps {
  progress: CampaignProgress;
  bounceStats: BounceStatsSummary | null;
  isDryRun: boolean;
  isOffline: boolean;
  isTabHidden: boolean;
  isAnotherTabActive: boolean;
  isOperatingQueue: boolean;
  isTriggeringWorker: boolean;
  cooldownRemainingSec: number | null;
  lastTickElapsedSec: number | null;
  statusMessage: string | null;
  showQueueRecipients: boolean;
  onToggleQueueRecipients: () => void;
  queueStatusFilter: string;
  onChangeQueueStatusFilter: (status: string) => void;
  queueRecipients: CampaignRecipientRow[];
  queueRecipientsTotal: number;
  queuePage: number;
  onChangeQueuePage: (page: number) => void;
  queueLoading: boolean;
  onRefreshQueueRecipients: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onTriggerWorker: () => void;
  onOpenReconcileModal: () => void;
  onDismiss: () => void;
}

export function MailerProgressPanel({
  progress,
  bounceStats,
  isDryRun,
  isOffline,
  isTabHidden,
  isAnotherTabActive,
  isOperatingQueue,
  isTriggeringWorker,
  cooldownRemainingSec,
  lastTickElapsedSec,
  statusMessage,
  showQueueRecipients,
  onToggleQueueRecipients,
  queueStatusFilter,
  onChangeQueueStatusFilter,
  queueRecipients,
  queueRecipientsTotal,
  queuePage,
  onChangeQueuePage,
  queueLoading,
  onRefreshQueueRecipients,
  onPause,
  onResume,
  onCancel,
  onTriggerWorker,
  onOpenReconcileModal,
  onDismiss,
}: MailerProgressPanelProps) {
  const eligible = progress.eligibleCount ?? progress.totalRecipients ?? 0;
  const accepted = progress.acceptedCount ?? progress.sentCount ?? 0;
  const failedPerm = progress.failedPermanentCount ?? 0;
  const failedRetry = progress.failedRetryableCount ?? 0;
  const failedTotal = progress.failedCount ?? failedPerm + failedRetry;
  const unconfirmed = progress.unconfirmedCount ?? 0;
  const cancelled = progress.cancelledCount ?? 0;
  const pending = progress.pendingCount ?? 0;
  const claimed = progress.claimedCount ?? progress.processingCount ?? 0;
  const decided =
    progress.decidedCount ?? accepted + failedPerm + failedRetry + unconfirmed + cancelled;
  const statesSum =
    progress.statesSum ??
    pending + claimed + accepted + failedPerm + failedRetry + unconfirmed + cancelled;
  const invariantValid =
    typeof progress.invariantValid === "boolean" ? progress.invariantValid : statesSum === eligible;

  const submissionPercent =
    eligible > 0 ? Math.min(100, Math.round((decided / eligible) * 100)) : 100;

  const delivered = progress.deliveredCount ?? 0;
  const awaitingDelivery =
    progress.awaitingDeliveryCount ??
    Math.max(0, accepted - delivered - (progress.bouncedCount ?? 0));
  const bounced = progress.bouncedCount ?? 0;
  const deliveryPercent =
    accepted > 0 ? Math.min(100, Math.round((delivered / accepted) * 100)) : 0;

  const asOfFormatted = progress.asOf
    ? new Date(progress.asOf).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

  return (
    <div className="bg-card/90 backdrop-blur-md border border-primary/40 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
      {/* Cabeçalho Operacional */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-primary/10 text-foreground border border-primary/30">
              Motor Confiável V2 · Lotes Idempotentes (100/lote)
            </span>
            {isDryRun && (
              <span className="text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/40">
                DRY RUN
              </span>
            )}
            <span className="text-xs text-muted-foreground font-mono">
              ID: {progress.campaignId.slice(0, 8)}...
            </span>
            <span className="text-[11px] text-muted-foreground">
              Atualizado às <strong className="text-foreground">{asOfFormatted}</strong>
            </span>
          </div>
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary animate-pulse" />
            {progress.subject}
          </h3>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Badge Honesto de Estado */}
          {isOffline ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-900 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700">
              <AlertCircle className="w-3.5 h-3.5" />
              Sem Conexão (Reconectando...)
            </span>
          ) : isAnotherTabActive ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700">
              <ShieldAlert className="w-3.5 h-3.5" />
              Outra Aba em Execução
            </span>
          ) : progress.status === "running" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              {cooldownRemainingSec !== null && cooldownRemainingSec > 0
                ? `Respeitando limite do provedor — retomando em ${cooldownRemainingSec}s`
                : `Enviando lote ${Math.max(1, progress.currentBatch)} de ${progress.totalBatches}`}
            </span>
          ) : progress.status === "paused" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700">
              <Pause className="w-3.5 h-3.5" />
              {progress.safetyPauseReason ? "Pausada por segurança" : "Campanha Pausada"}
            </span>
          ) : progress.status === "completed" ? (
            failedTotal > 0 || unconfirmed > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700">
                <AlertCircle className="w-3.5 h-3.5" />
                Concluída com ressalvas ({failedTotal + unconfirmed} itens)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Concluída — tudo aceito
              </span>
            )
          ) : progress.status === "cancelled" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-900 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700">
              <Ban className="w-3.5 h-3.5" />
              Cancelada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-900 border border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600">
              <Clock className="w-3.5 h-3.5" />
              {progress.status}
            </span>
          )}

          {/* Controles Seguros */}
          {(progress.status === "running" || progress.status === "paused" || claimed > 0) && (
            <button
              type="button"
              disabled={isTriggeringWorker || isOperatingQueue}
              onClick={onTriggerWorker}
              title="Reconcilia itens presos e aciona tick imediato no servidor"
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-3 h-3" />
              {isTriggeringWorker
                ? "Sincronizando..."
                : claimed > 0
                  ? `Destravar Fila (${claimed})`
                  : "Sincronizar Agora"}
            </button>
          )}
          {progress.status === "running" && (
            <button
              type="button"
              disabled={isOperatingQueue}
              onClick={onPause}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Pause className="w-3 h-3" />
              Pausar
            </button>
          )}
          {progress.status === "paused" && (
            <button
              type="button"
              disabled={isOperatingQueue}
              onClick={onResume}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-950 border border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3 h-3" />
              Retomar
            </button>
          )}
          {(progress.status === "running" || progress.status === "paused") && (
            <button
              type="button"
              disabled={isOperatingQueue}
              onClick={onCancel}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-rose-100 text-rose-950 border border-rose-300 hover:bg-rose-200 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <XCircle className="w-3 h-3" />
              Cancelar
            </button>
          )}
          {(progress.status === "completed" || progress.status === "cancelled") && (
            <button
              type="button"
              onClick={onDismiss}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            >
              Ocultar
            </button>
          )}
        </div>
      </div>

      {/* Aviso explícito caso a soma dos estados divirja dos elegíveis (Seção 4.6) */}
      {!invariantValid && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-200 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            <strong>Atenção de Auditoria:</strong> A soma atual dos estados na fila ({statesSum})
            diverge do manifesto elegível ({eligible}). Clique em &ldquo;Sincronizar Agora&rdquo;
            para reconciliar.
          </span>
        </div>
      )}

      {/* Alerta de Pausa por Segurança ou Não Confirmados */}
      {(progress.safetyPauseReason || unconfirmed > 0) && (
        <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4 space-y-2 text-rose-950 dark:text-rose-200">
          <div className="flex items-center gap-2 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>
              {progress.safetyPauseReason ||
                `${unconfirmed} destinatário(s) em estado Não Confirmado (unconfirmed)`}
            </span>
          </div>
          <p className="text-xs leading-relaxed">
            Nenhum e-mail sem confirmação explícita é reenviado às cegas. Verifique a lista de
            afetados abaixo ou use o assistente de reconciliação para decidir o destino dos itens{" "}
            <code className="font-mono font-bold">unconfirmed</code>.
          </p>
          {unconfirmed > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onOpenReconcileModal}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer shadow-sm flex items-center gap-1.5 transition-all"
              >
                <Shield className="w-3.5 h-3.5" />
                Resolver Não Confirmados ({unconfirmed})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mensagem de Status Operacional Clara */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span className="text-foreground font-medium">
            {isTabHidden
              ? "Aba em segundo plano — envio retomado automaticamente ao voltar."
              : statusMessage ||
                (progress.status === "running"
                  ? `Enviando lote ${Math.max(1, progress.currentBatch)} de ${progress.totalBatches} — mantenha esta aba aberta para progresso em tempo real.`
                  : progress.status === "completed"
                    ? "Processamento da fila concluído. As confirmações de entrega continuam chegando via webhook."
                    : "Campanha pronta para operação.")}
          </span>
        </div>
        {isTabHidden && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700 shrink-0">
            <AlertCircle className="w-3.5 h-3.5" />
            Aba em segundo plano
          </span>
        )}
      </div>

      {/* DUAS BARRAS DE PROGRESSO HONESTAS (Seção 4.6) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Barra 1: Submissão ao Provedor */}
        <div className="rounded-xl border border-border bg-background/60 p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="font-semibold text-foreground">
              1. Submissão ao Provedor (Fila Decidida)
            </span>
            <span className="font-bold text-primary">{submissionPercent}%</span>
          </div>
          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden border border-border/50">
            <div
              className="h-full bg-linear-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, submissionPercent))}%`,
              }}
            />
          </div>
          <div className="text-[11px] text-muted-foreground flex justify-between flex-wrap gap-1">
            <span>
              <strong className="text-foreground">{decided}</strong> de {eligible} elegíveis
              processados ({accepted} aceitos · {failedTotal} falhas · {unconfirmed} não conf.)
            </span>
          </div>
        </div>

        {/* Barra 2: Entrega Confirmada pelo Servidor de Destino */}
        <div className="rounded-xl border border-border bg-background/60 p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="font-semibold text-foreground">
              2. Entrega Confirmada (Webhooks Resend)
            </span>
            <span className="font-bold text-sky-500">{deliveryPercent}%</span>
          </div>
          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden border border-border/50">
            <div
              className="h-full bg-linear-to-r from-sky-500 to-cyan-400 transition-all duration-500 rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, deliveryPercent))}%`,
              }}
            />
          </div>
          <div className="text-[11px] text-muted-foreground flex justify-between flex-wrap gap-1">
            <span>
              <strong className="text-foreground">{delivered}</strong> entregues confirmados de{" "}
              {accepted} aceitos ·{" "}
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {awaitingDelivery} aguardando confirmação
              </span>
              {bounced > 0 ? ` · ${bounced} bounces` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Telemetria Operacional de Vazão e ETA */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" role="status">
        <span>
          Tamanho do lote: <strong className="text-foreground">{progress.batchSize}</strong>{" "}
          e-mails/lote
        </span>
        <span>
          Vazão real:{" "}
          <strong className="text-foreground">
            {(progress.throughputPerSec ?? 0) > 0
              ? `${(progress.throughputPerSec ?? 0).toFixed(1)} e-mails/s`
              : "calculando..."}
          </strong>
        </span>
        <span>
          Último tick:{" "}
          <strong className="text-foreground font-mono">
            {lastTickElapsedSec !== null ? `há ${lastTickElapsedSec}s` : "sincronizado"}
          </strong>
        </span>
        <span>
          Tempo restante estimado:{" "}
          <strong className="text-foreground">
            {progress.estimatedRemainingSeconds === null ||
            progress.estimatedRemainingSeconds === undefined
              ? "Indisponível"
              : progress.estimatedRemainingSeconds === 0
                ? "Concluído"
                : progress.estimatedRemainingSeconds > 60
                  ? `~${Math.ceil(progress.estimatedRemainingSeconds / 60)} min (${progress.estimatedRemainingSeconds}s)`
                  : `${progress.estimatedRemainingSeconds}s`}
          </strong>
        </span>
      </div>

      {/* Semáforo de Bounce em Tempo Real */}
      {bounceStats && bounceStats.sentCount > 0 && (
        <div className="flex items-center justify-between p-2.5 rounded-xl border bg-muted/30 text-xs">
          <div className="flex items-center gap-2">
            {bounceStats.bounceRate < 2.0 ? (
              <span className="flex items-center gap-1.5 font-bold text-emerald-500">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Taxa de Bounce: {bounceStats.bounceRate.toFixed(1)}% (Saudável &lt; 2%)
              </span>
            ) : bounceStats.bounceRate <= 3.0 ? (
              <span className="flex items-center gap-1.5 font-bold text-amber-500">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Taxa de Bounce: {bounceStats.bounceRate.toFixed(1)}% (Atenção 2%-3%)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-bold text-rose-500">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                Taxa de Bounce: {bounceStats.bounceRate.toFixed(1)}% (Bounce Guard Acionado &gt; 3%)
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {bounceStats.bounceCount} bounces / {bounceStats.sentCount} enviados
            {bounceStats.bounceGuardTriggered && (
              <span className="ml-2 font-bold text-rose-500">· Disparos suspensos</span>
            )}
          </div>
        </div>
      )}

      {/* Grid dos Estados Fechados da Fila */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-1">
        <div className="bg-muted/40 border border-border/60 rounded-xl p-2.5 text-center">
          <div className="text-[11px] text-muted-foreground uppercase font-bold flex items-center justify-center gap-1">
            <Users className="w-3 h-3" /> Elegíveis
          </div>
          <div className="text-base font-black text-foreground mt-0.5">{eligible}</div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 rounded-xl p-2.5 text-center">
          <div className="text-[11px] text-emerald-900 dark:text-emerald-200 uppercase font-bold flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Aceitos Resend
          </div>
          <div className="text-base font-black text-emerald-950 dark:text-emerald-100 mt-0.5">
            {accepted}
          </div>
        </div>

        <div className="bg-sky-50 border border-sky-200 dark:bg-sky-950/40 dark:border-sky-800 rounded-xl p-2.5 text-center">
          <div className="text-[11px] text-sky-900 dark:text-sky-200 uppercase font-bold flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" /> Pendentes
          </div>
          <div className="text-base font-black text-sky-950 dark:text-sky-100 mt-0.5">
            {pending}
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800 rounded-xl p-2.5 text-center">
          <div className="text-[11px] text-indigo-900 dark:text-indigo-200 uppercase font-bold flex items-center justify-center gap-1">
            <Activity className="w-3 h-3" /> Reservados
          </div>
          <div className="text-base font-black text-indigo-950 dark:text-indigo-100 mt-0.5">
            {claimed}
          </div>
        </div>

        <div className="bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 rounded-xl p-2.5 text-center">
          <div className="text-[11px] text-rose-900 dark:text-rose-200 uppercase font-bold flex items-center justify-center gap-1">
            <AlertCircle className="w-3 h-3" /> Falhas ({failedPerm}P / {failedRetry}R)
          </div>
          <div className="text-base font-black text-rose-950 dark:text-rose-100 mt-0.5">
            {failedTotal}
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 rounded-xl p-2.5 text-center">
          <div className="text-[11px] text-amber-900 dark:text-amber-200 uppercase font-bold flex items-center justify-center gap-1">
            <ShieldAlert className="w-3 h-3" /> Não Conf.
          </div>
          <div className="text-base font-black text-amber-950 dark:text-amber-100 mt-0.5">
            {unconfirmed}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 rounded-xl p-2.5 text-center col-span-2 sm:col-span-1">
          <div className="text-[11px] text-slate-900 dark:text-slate-200 uppercase font-bold flex items-center justify-center gap-1">
            <Layers className="w-3 h-3" /> Lote Atual
          </div>
          <div className="text-base font-black text-slate-950 dark:text-slate-100 mt-0.5">
            {progress.currentBatch} / {progress.totalBatches}
          </div>
        </div>
      </div>

      {/* Tabela paginada de destinatários da fila */}
      <div className="pt-2 border-t border-border/40 space-y-2">
        <button
          type="button"
          onClick={onToggleQueueRecipients}
          className="w-full flex items-center justify-between text-xs font-semibold text-foreground py-1 px-2 rounded-lg hover:bg-muted/40 transition cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-primary" />
            Inspecionar Destinatários na Fila ({eligible})
          </span>
          {showQueueRecipients ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {showQueueRecipients && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filtrar estado:</span>
                <select
                  value={queueStatusFilter}
                  onChange={(e) => onChangeQueueStatusFilter(e.target.value)}
                  className="text-xs px-2 py-1 rounded-md border border-border bg-background cursor-pointer"
                >
                  <option value="all">Todos ({eligible})</option>
                  <option value="pending">Pendentes ({pending})</option>
                  <option value="claimed">Reservados ({claimed})</option>
                  <option value="accepted">Aceitos ({accepted})</option>
                  <option value="failed_retryable">Falhas Retentáveis ({failedRetry})</option>
                  <option value="failed_permanent">Falhas Permanentes ({failedPerm})</option>
                  <option value="unconfirmed">Não Confirmados ({unconfirmed})</option>
                  <option value="cancelled">Cancelados ({cancelled})</option>
                </select>
              </div>
              <button
                type="button"
                onClick={onRefreshQueueRecipients}
                className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${queueLoading ? "animate-spin" : ""}`} />
                Atualizar fila
              </button>
            </div>

            <div className="border border-border rounded-xl overflow-hidden bg-background">
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase sticky top-0">
                    <tr>
                      <th className="p-2.5">Coach</th>
                      <th className="p-2.5">Universidade</th>
                      <th className="p-2.5">Estado</th>
                      <th className="p-2.5">Tentativas</th>
                      <th className="p-2.5">Detalhe / Processado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {queueLoading && queueRecipients.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin inline-block mr-2 text-primary" />
                          Carregando destinatários da fila...
                        </td>
                      </tr>
                    ) : queueRecipients.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground">
                          Nenhum destinatário encontrado com o filtro selecionado.
                        </td>
                      </tr>
                    ) : (
                      queueRecipients.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/20">
                          <td className="p-2.5">
                            <div className="font-semibold text-foreground">
                              {item.recipientName}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {item.recipientEmail}
                            </div>
                          </td>
                          <td className="p-2.5 text-foreground">{item.universityName}</td>
                          <td className="p-2.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.status === "accepted" || item.status === "sent"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                  : item.status === "unconfirmed"
                                    ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                                    : item.status === "claimed" || item.status === "processing"
                                      ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
                                      : item.status === "failed_retryable" ||
                                          item.status === "failed_permanent" ||
                                          item.status === "failed"
                                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                                        : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-muted-foreground font-mono">{item.attempts}</td>
                          <td
                            className="p-2.5 text-muted-foreground text-[11px] max-w-xs truncate"
                            title={item.lastError || ""}
                          >
                            {item.lastError ||
                              (item.processedAt
                                ? `Processado às ${new Date(item.processedAt).toLocaleTimeString()}`
                                : "—")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {queueRecipientsTotal > 25 && (
                <div className="flex items-center justify-between p-2.5 border-t border-border bg-muted/20 text-xs">
                  <span className="text-muted-foreground">
                    Página {queuePage} de {Math.ceil(queueRecipientsTotal / 25)} (
                    {queueRecipientsTotal} itens)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={queuePage <= 1 || queueLoading}
                      onClick={() => onChangeQueuePage(Math.max(1, queuePage - 1))}
                      className="px-2 py-1 rounded border border-border bg-background disabled:opacity-40 cursor-pointer"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={queuePage >= Math.ceil(queueRecipientsTotal / 25) || queueLoading}
                      onClick={() => onChangeQueuePage(queuePage + 1)}
                      className="px-2 py-1 rounded border border-border bg-background disabled:opacity-40 cursor-pointer"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

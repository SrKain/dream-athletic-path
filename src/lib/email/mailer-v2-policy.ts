import type { CampaignProgress } from "@/types/db";

export const MAILER_STALE_SECONDS = 45;
export const MAILER_MAX_AMBIGUOUS = 8;
export const MAILER_KEY_WINDOW_MS = 23 * 60 * 60 * 1000;
export const MAILER_MAX_BACKOFF_MS = 300_000;
export const MAILER_PROVIDER_MARGIN_MS = 1000;

export type CampaignHealth =
  | "sending"
  | "waiting_provider"
  | "stalled"
  | "paused_manual"
  | "paused_safety"
  | "needs_reconciliation"
  | "completed"
  | "completed_with_issues"
  | "cancelled"
  | "failed"
  | "preparing";

export function deriveCampaignHealth(p: CampaignProgress, now = Date.now()): CampaignHealth {
  if (p.status === "cancelled" || p.status === "failed") return p.status;
  if (p.status === "paused" && p.safetyPauseReason) return "paused_safety";
  if ((p.unconfirmedCount ?? 0) > 0) return "needs_reconciliation";
  if (p.status === "paused") return "paused_manual";
  if (p.status === "completed") {
    if (p.pendingCount + (p.claimedCount ?? p.processingCount) > 0) return "needs_reconciliation";
    return p.failedCount + p.cancelledCount > 0 ? "completed_with_issues" : "completed";
  }
  if (p.status !== "running") return "preparing";
  const last = p.lastTickAt || p.startedAt;
  const stale = last ? (now - Date.parse(last)) / 1000 : (p.staleSeconds ?? 46);
  const leaseActive = p.controllerLeaseExpiresAt && Date.parse(p.controllerLeaseExpiresAt) > now;
  if (stale > MAILER_STALE_SECONDS && !leaseActive) return "stalled";
  if (
    p.nextBatchAt &&
    Date.parse(p.nextBatchAt) > now &&
    (p.lastProviderHttpStatus === 429 || p.lastProviderHttpStatus === 409)
  )
    return "waiting_provider";
  return "sending";
}

export const campaignHealthLabels: Record<CampaignHealth, string> = {
  sending: "Enviando",
  waiting_provider: "Aguardando o provedor",
  stalled: "Fila parada — nenhum executor ativo",
  paused_manual: "Pausada manualmente",
  paused_safety: "Pausada por segurança",
  needs_reconciliation: "Requer reconciliação",
  completed: "Concluída — tudo aceito",
  completed_with_issues: "Concluída com ressalvas",
  cancelled: "Cancelada",
  failed: "Falha",
  preparing: "Preparando",
};

export function tickRetryDelay(failures: number, leaseHeldByOther = false, nextTickInMs = 5000) {
  return leaseHeldByOther
    ? Math.max(5000, nextTickInMs)
    : Math.min(30_000, 3000 * 2 ** Math.max(0, failures - 1));
}

export function tickErrorMessage(error: unknown) {
  const detail =
    error && typeof error === "object"
      ? (error as { message?: string; status?: number; statusCode?: number })
      : null;
  if (detail?.status === 401 || detail?.statusCode === 401)
    return "Sessão expirada, entre de novo.";
  const message = error instanceof Error ? error.message : detail?.message || String(error);
  return /401|unauthorized|unauthenticated|sess[aã]o|session.*expir/i.test(message)
    ? "Sessão expirada, entre de novo."
    : message;
}

export function shouldPauseBounceGuard(accepted: number, hardBounces: number, override: boolean) {
  const rate = accepted > 0 ? (100 * hardBounces) / accepted : 0;
  return override ? rate > 8 : accepted >= 200 && hardBounces >= 5 && rate > 3;
}

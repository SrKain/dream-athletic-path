import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCampaignBounceStatsServerFn,
  getMailerCronStatusServerFn,
  getCampaignFinalReportServerFn,
  getCampaignQueueProgressServerFn,
  runCampaignTickServerFn,
} from "@/lib/email/recruit-email.functions";
import { tickRetryDelay, tickErrorMessage } from "@/lib/email/mailer-v2-policy";
import type { MailerCronStatus, CampaignProgress, MailerCampaignFinalReport } from "@/types/db";

const CHANNEL_NAME = "teamgo_mailer_campaign_runner_v2";
const RUNNING_POLL_MS = 2000;
const PAUSED_POLL_MS = 10000;

export interface BounceStatsSummary {
  sentCount: number;
  bounceCount: number;
  complaintCount: number;
  bounceRate: number;
  bounceGuardTriggered: boolean;
}

export interface UseCampaignRunnerOptions {
  campaignId: string | null;
  onCampaignCompleted?: (campaignId: string) => void;
}

export interface UseCampaignRunnerState {
  cronStatus: MailerCronStatus | null;
  progress: CampaignProgress | null;
  setProgress: React.Dispatch<React.SetStateAction<CampaignProgress | null>>;
  finalReport: MailerCampaignFinalReport | null;
  bounceStats: BounceStatsSummary | null;
  isTickInFlight: boolean;
  isTabHidden: boolean;
  isAnotherTabActive: boolean;
  isOffline: boolean;
  cooldownRemainingSec: number | null;
  lastTickElapsedSec: number | null;
  statusMessage: string | null;
  refreshProgress: () => Promise<CampaignProgress | null>;
  refreshFinalReport: () => Promise<MailerCampaignFinalReport | null>;
  triggerImmediateTick: () => void;
  stopRunner: () => void;
}

/**
 * Relógio único da UI (`useCampaignRunner`) para o Recruit Mailer V2.
 * - Utiliza `setTimeout` encadeado guiado pelo `nextTickInMs` retornado pelo servidor.
 * - Aba oculta mantém ticks; somente offline impede chamadas de envio.
 * - Coordena abas via `BroadcastChannel` para evitar chamadas concorrentes da mesma sessão.
 * - Aplica polling adaptativo:
 *   - 2s durante `running`
 *   - 10s durante `paused`
 *   - 0 ticks automáticos em estados terminais (`completed`, `cancelled`, `failed`).
 */
export function useCampaignRunner({
  campaignId,
  onCampaignCompleted,
}: UseCampaignRunnerOptions): UseCampaignRunnerState {
  const [progress, setProgress] = useState<CampaignProgress | null>(null);
  const [finalReport, setFinalReport] = useState<MailerCampaignFinalReport | null>(null);
  const [bounceStats, setBounceStats] = useState<BounceStatsSummary | null>(null);
  const [isTickInFlight, setIsTickInFlight] = useState(false);
  const [isTabHidden, setIsTabHidden] = useState(false);
  const [isAnotherTabActive, setIsAnotherTabActive] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState<number | null>(null);
  const [lastTickAtMs, setLastTickAtMs] = useState<number | null>(null);
  const [lastTickElapsedSec, setLastTickElapsedSec] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [cronStatus, setCronStatus] = useState<MailerCronStatus | null>(null);
  const completionRef = useRef(onCampaignCompleted);
  completionRef.current = onCampaignCompleted;
  const failuresRef = useRef(0);
  const generationRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    const read = async () => {
      try {
        const status = await getMailerCronStatusServerFn();
        if (!disposed) setCronStatus(status);
      } catch (error) {
        if (!disposed)
          setCronStatus({
            enabled: false,
            active: false,
            schedule: null,
            error: tickErrorMessage(error),
          });
      }
    };
    void read();
    const timer = setInterval(() => void read(), 30_000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  const clientIdRef = useRef<string>("");
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const completedNotifiedRef = useRef<string | null>(null);

  if (!clientIdRef.current && typeof window !== "undefined") {
    const stored = window.sessionStorage.getItem("teamgo_mailer_controller_id");
    if (stored) {
      clientIdRef.current = stored;
    } else {
      const generated = `tab_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      window.sessionStorage.setItem("teamgo_mailer_controller_id", generated);
      clientIdRef.current = generated;
    }
  }

  const clearTimers = useCallback(() => {
    if (tickTimerRef.current) {
      clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const stopRunner = useCallback(() => {
    generationRef.current++;
    clearTimers();
  }, [clearTimers]);

  const refreshFinalReport = useCallback(
    async (targetId = campaignId): Promise<MailerCampaignFinalReport | null> => {
      if (!targetId) {
        setFinalReport(null);
        return null;
      }
      try {
        const rep = await getCampaignFinalReportServerFn({ data: { campaignId: targetId } });
        if (rep) setFinalReport(rep);
        return rep;
      } catch {
        return null;
      }
    },
    [campaignId],
  );

  const refreshBounceStats = useCallback(
    async (targetId = campaignId) => {
      if (!targetId) return;
      try {
        const stats = await getCampaignBounceStatsServerFn({ data: { campaignId: targetId } });
        if (stats) setBounceStats(stats);
      } catch {
        // Ignora erro transitório
      }
    },
    [campaignId],
  );

  const refreshProgress = useCallback(
    async (targetId = campaignId): Promise<CampaignProgress | null> => {
      if (!targetId) {
        setProgress(null);
        return null;
      }
      try {
        const prog = await getCampaignQueueProgressServerFn({ data: { campaignId: targetId } });
        if (prog) {
          setProgress(prog);
          if (
            prog.status === "completed" ||
            prog.status === "cancelled" ||
            prog.status === "failed" ||
            prog.status === "paused"
          ) {
            void refreshFinalReport(targetId);
          }
        }
        return prog;
      } catch {
        return null;
      }
    },
    [campaignId, refreshFinalReport],
  );

  // Monitorar visibilidade da aba e conectividade de rede
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsTabHidden(document.visibilityState === "hidden");
    setIsOffline(!navigator.onLine);

    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      setIsTabHidden(hidden);
    };

    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // BroadcastChannel entre abas do mesmo navegador
  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined" || !campaignId) {
      return;
    }

    const bc = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = bc;

    bc.onmessage = (evt) => {
      const data = evt.data as {
        type?: string;
        campaignId?: string;
        controllerId?: string;
        progress?: CampaignProgress;
      };
      if (!data || data.campaignId !== campaignId) return;
      if (data.controllerId && data.controllerId !== clientIdRef.current) {
        if (data.type === "TICK_ACTIVE") {
          setIsAnotherTabActive(true);
          if (data.progress) {
            setProgress(data.progress);
          }
        } else if (data.type === "TAB_RELEASED") {
          setIsAnotherTabActive(false);
        }
      }
    };

    const onBeforeUnload = () => {
      try {
        bc.postMessage({
          type: "TAB_RELEASED",
          campaignId,
          controllerId: clientIdRef.current,
        });
      } catch {
        // Ignora
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      onBeforeUnload();
      bc.close();
      channelRef.current = null;
    };
  }, [campaignId]);

  // Contador visual leve de segundos desde o último tick e cooldown
  useEffect(() => {
    if (!campaignId || progress?.status !== "running") {
      setCooldownRemainingSec(null);
      return;
    }

    const interval = setInterval(() => {
      const last = progress.lastTickAt ? Date.parse(progress.lastTickAt) : lastTickAtMs;
      if (last) {
        setLastTickElapsedSec(Math.max(0, Math.floor((Date.now() - last) / 1000)));
      }
      if (progress?.nextBatchAt) {
        const rem = Math.ceil((new Date(progress.nextBatchAt).getTime() - Date.now()) / 1000);
        setCooldownRemainingSec(rem > 0 ? rem : null);
      } else {
        setCooldownRemainingSec(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [campaignId, progress?.status, progress?.nextBatchAt, progress?.lastTickAt, lastTickAtMs]);

  const executeTick = useCallback(
    async function runStep(delayMs: number) {
      if (!campaignId) return;
      if (tickTimerRef.current) {
        clearTimeout(tickTimerRef.current);
        tickTimerRef.current = null;
      }

      const generation = generationRef.current;
      tickTimerRef.current = setTimeout(
        async () => {
          if (generation !== generationRef.current) return;
          if (!campaignId) return;
          if (!navigator.onLine) {
            setStatusMessage("Sem conexão — aguardando conexão.");
            void runStep(RUNNING_POLL_MS);
            return;
          }
          if (inFlightRef.current) {
            void runStep(500);
            return;
          }
          inFlightRef.current = true;
          setIsTickInFlight(true);

          try {
            const res = await runCampaignTickServerFn({
              data: {
                campaignId,
                controllerId: clientIdRef.current || undefined,
              },
            });

            if (generation !== generationRef.current) return;
            if (!res.success) throw new Error(res.message || "Falha ao executar tick.");
            failuresRef.current = 0;
            setLastTickAtMs(Date.now());
            setLastTickElapsedSec(0);

            if (res.progress) {
              setProgress(res.progress);
            } else {
              await refreshProgress(campaignId);
            }

            void refreshBounceStats(campaignId);

            if (res.leaseHeldByOther) {
              setStatusMessage("Outro executor ativo (aba ou cron) — acompanhando");
            } else if (res.message) {
              setStatusMessage(res.message);
            } else if (res.campaignStatus === "running") {
              const batchNum = res.progress?.currentBatch || 1;
              const totalBatches = res.progress?.totalBatches || 1;
              setStatusMessage(
                `Enviando lote ${batchNum} de ${totalBatches} — acompanhando o envio.`,
              );
            }

            if (res.leaseHeldByOther) {
              setIsAnotherTabActive(true);
            } else {
              setIsAnotherTabActive(false);
              try {
                channelRef.current?.postMessage({
                  type: "TICK_ACTIVE",
                  campaignId,
                  controllerId: clientIdRef.current,
                  progress: res.progress || undefined,
                });
              } catch {
                // Ignora
              }
            }

            if (
              res.campaignStatus === "completed" ||
              res.campaignStatus === "cancelled" ||
              res.campaignStatus === "failed" ||
              res.campaignStatus === "paused"
            ) {
              await refreshFinalReport(campaignId);
              if (
                res.campaignStatus === "completed" &&
                completedNotifiedRef.current !== campaignId
              ) {
                completedNotifiedRef.current = campaignId;
                completionRef.current?.(campaignId);
              }
              return;
            }

            if (typeof res.nextTickInMs === "number" && res.nextTickInMs >= 0) {
              const nextDelay = res.leaseHeldByOther
                ? tickRetryDelay(0, true, res.nextTickInMs)
                : Math.max(250, res.nextTickInMs);
              void runStep(nextDelay);
            }
          } catch (error) {
            if (generation !== generationRef.current) return;
            failuresRef.current++;
            const delay = tickRetryDelay(failuresRef.current);
            setStatusMessage(`${tickErrorMessage(error)} Nova tentativa em ${delay / 1000}s.`);
            void runStep(delay);
          } finally {
            inFlightRef.current = false;
            setIsTickInFlight(false);
          }
        },
        Math.max(0, delayMs),
      );
    },
    [campaignId, refreshBounceStats, refreshFinalReport, refreshProgress],
  );

  useEffect(
    () => () => {
      generationRef.current++;
      clearTimers();
    },
    [campaignId, clearTimers],
  );

  useEffect(() => {
    if (!campaignId || progress?.status !== "running") return;
    const timer = setInterval(() => void refreshProgress(campaignId), RUNNING_POLL_MS);
    return () => clearInterval(timer);
  }, [campaignId, progress?.status, refreshProgress]);

  // Carregamento inicial quando campaignId muda
  useEffect(() => {
    clearTimers();
    setFinalReport(null);
    setBounceStats(null);
    setStatusMessage(null);
    setIsAnotherTabActive(false);

    if (!campaignId) {
      setProgress(null);
      return;
    }

    void refreshProgress(campaignId);
    void refreshBounceStats(campaignId);
  }, [campaignId, clearTimers, refreshBounceStats, refreshProgress]);

  const campaignStatus = progress?.status;

  // Orquestração adaptativa conforme status da campanha e visibilidade da aba
  useEffect(() => {
    clearTimers();
    if (!campaignId || !campaignStatus) return;

    if (campaignStatus === "running") {
      if (!isOffline) {
        void executeTick(250);
      } else {
        // Aba oculta ou secundária: polling de leitura a cada 2s
        const scheduleRunningPoll = () => {
          pollTimerRef.current = setTimeout(async () => {
            await refreshProgress(campaignId);
            scheduleRunningPoll();
          }, RUNNING_POLL_MS);
        };
        scheduleRunningPoll();
      }
      return clearTimers;
    }

    if (campaignStatus === "paused") {
      // Durante pausa: polling leve a cada 10s
      const schedulePausedPoll = () => {
        pollTimerRef.current = setTimeout(async () => {
          await refreshProgress(campaignId);
          schedulePausedPoll();
        }, PAUSED_POLL_MS);
      };
      schedulePausedPoll();
      return clearTimers;
    }

    // Estado terminal (`completed`, `cancelled`, `failed`): 0 polling automático
    return clearTimers;
  }, [campaignId, clearTimers, executeTick, isOffline, campaignStatus, refreshProgress]);

  const triggerImmediateTick = useCallback(() => {
    if (!campaignId) return;
    setIsAnotherTabActive(false);
    void executeTick(50);
  }, [campaignId, executeTick]);

  return {
    cronStatus,
    progress,
    setProgress,
    finalReport,
    bounceStats,
    isTickInFlight,
    isTabHidden,
    isAnotherTabActive,
    isOffline,
    cooldownRemainingSec,
    lastTickElapsedSec,
    statusMessage,
    refreshProgress,
    refreshFinalReport,
    triggerImmediateTick,
    stopRunner,
  };
}

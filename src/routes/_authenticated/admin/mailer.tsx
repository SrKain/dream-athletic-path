import { buildCoachGreeting, MAX_CUSTOM_SUBJECT_LENGTH } from "@/lib/email/email-personalization";
import { createFileRoute } from "@tanstack/react-router";
import {
  Mail,
  Users,
  Building2,
  Send,
  Eye,
  History,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Filter,
  Layers,
  FileText,
  DollarSign,
  GraduationCap,
  Ban,
  MessageSquareWarning,
  BarChart3,
  Activity,
  Play,
  Pause,
  XCircle,
  RefreshCw,
  Zap,
  ChevronDown,
  ChevronUp,
  Shield,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { buttonClass, secondaryButtonClass } from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
import { asQueryResult, fetchAllUniversities } from "@/lib/universities-fetch";
import {
  sendMailerServerFn,
  enqueueMailerCampaignServerFn,
  processMailerMicroBatchServerFn,
  getCampaignQueueProgressServerFn,
  getLatestActiveCampaignServerFn,
  pauseMailerCampaignServerFn,
  resumeMailerCampaignServerFn,
  cancelMailerCampaignServerFn,
  getSuppressedEmailsServerFn,
  getMailerHistoryServerFn,
  getActiveInterestSignalsServerFn,
  getEmailEventTimelineServerFn,
  getAthletesEmailDataServerFn,
  reconcileCampaignIncidentServerFn,
  getCampaignRecipientsServerFn,
  triggerCampaignWorkerServerFn,
  getMailerCampaignOrchestrationModeServerFn,
} from "@/lib/email/recruit-email.functions";
import { BudgetMultiSelect } from "@/components/mailer/budget-multi-select";
import { MailerHistorySection } from "@/components/mailer/mailer-history-section";
import { MailerMetricsDashboard } from "@/components/mailer-metrics-dashboard";
import type { EmailTimelineItem } from "@/lib/email/mailer-metrics.server";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail,
  type RecruitEmailData,
} from "@/lib/email/recruit-email-template";
import { renderCatalogEmail } from "@/lib/email/recruit-email-catalog-template";
import {
  getMissingAthleteEmailFields,
  getAthleteEmailPanelState,
  ATHLETE_EMAIL_STATE_MESSAGES,
} from "@/lib/email/athlete-email-quality";
import type { EmailBlock } from "@/lib/email/personal-email-renderer";
import {
  composeEmailBlocks,
  getEmailBlockText,
  reconcileEmailBlocks,
  assertEmailIntegrity,
} from "@/lib/email/email-blocks";
import type {
  University,
  UniversityCoach,
  RecruitEmailLog,
  UniversityLeague,
  UniversityBudgetLevel,
  UniversityToeflLevel,
  CoachInterestSignal,
  CampaignProgress,
} from "@/types/db";
import { LEAGUES, US_STATES, BUDGET_LEVELS, TOEFL_LEVELS } from "@/lib/universities-constants";

interface MailerSearch {
  mode?: "single" | "multi" | "catalog";
  athleteId?: string;
}

export const Route = createFileRoute("/_authenticated/admin/mailer")({
  validateSearch: (search: Record<string, unknown>): MailerSearch => {
    const rawMode = search.mode as string;
    const mode =
      rawMode === "single" || rawMode === "multi" || rawMode === "catalog" ? rawMode : "single";
    return {
      mode,
      athleteId: typeof search.athleteId === "string" ? search.athleteId : undefined,
    };
  },
  component: MailerPage,
});

interface RawAthleteRecord {
  id: string;
  slug: string;
  full_name: string;
  photo_url: string | null;
  height_cm: number | null;
  nationality: string | null;
  sport?: { name_en: string | null } | null;
  position?: { name_en: string | null } | null;
  profile?: {
    gpa: number | null;
    athlete_status: string | null;
    graduation_year: number | null;
    high_school_graduation: string | null;
    highlight_note: string | null;
    budget: string | null;
    highlight_video_url?: string | null;
  } | null;
}

interface AthleteSummary {
  id: string;
  slug: string;
  full_name: string;
  photo_url: string | null;
  height_cm: number | null;
  nationality: string | null;
  sport_name: string | null;
  position_name: string | null;
  country_flag: string | null;
  athlete_status?: string | null;
  gpa?: number | null;
  graduation_year?: number | null;
  high_school_graduation?: string | null;
  highlight_note?: string | null;
  budget?: string | null;
  highlight_video_url?: string | null;
}

interface RecipientItem {
  key: string;
  coachId?: string;
  name: string;
  lastName?: string | null;
  email: string;
  universityName: string;
  universityCity: string;
  universityState: string;
  league: UniversityLeague | null;
  isHbcu: boolean;
  budgetLevel: UniversityBudgetLevel | null;
  toeflLevel: UniversityToeflLevel | null;
  isSuppressed: boolean;
  signals: CoachInterestSignal[];
}

function MailerPage() {
  const searchParams = Route.useSearch();
  const [activeTab, setActiveTab] = useState<"compose" | "history" | "metrics">("compose");

  // Timeline Modal State
  const [selectedTimelineLog, setSelectedTimelineLog] = useState<{
    id: string;
    recipient_name?: string | null;
    recipient_email?: string | null;
    subject: string;
    sent_at: string;
    provider_id?: string | null;
  } | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<EmailTimelineItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Modo de Envio: single | multi | catalog
  const [sendMode, setSendMode] = useState<"single" | "multi" | "catalog">(
    searchParams.mode || "single",
  );

  // Dados do Banco
  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [emailAthletes, setEmailAthletes] = useState<RecruitEmailData[]>([]);
  const [emailAthletesLoading, setEmailAthletesLoading] = useState(false);
  const [emailAthletesError, setEmailAthletesError] = useState<string | null>(null);
  const [emailAthletesRequestKey, setEmailAthletesRequestKey] = useState<string | null>(null);
  const [emailAthletesRetry, setEmailAthletesRetry] = useState(0);
  const [universities, setUniversities] = useState<University[]>([]);
  const [suppressedEmails, setSuppressedEmails] = useState<Set<string>>(new Set());
  const [interestSignals, setInterestSignals] = useState<CoachInterestSignal[]>([]);
  const [historyLogs, setHistoryLogs] = useState<RecruitEmailLog[]>([]);
  const [visualSettings, setVisualSettings] = useState<{
    logo_url: string | null;
    hero_background_url: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Seleções
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(searchParams.athleteId || "");
  const [selectedMultiAthleteIds, setSelectedMultiAthleteIds] = useState<Set<string>>(
    new Set(searchParams.athleteId ? [searchParams.athleteId] : []),
  );
  const [selectedRecipientKeys, setSelectedRecipientKeys] = useState<Set<string>>(new Set());

  // Personalização Editorial (Single, Multi & Catalog)
  const [customSubject, setCustomSubject] = useState("");
  const [customIntroduction, setCustomIntroduction] = useState("");
  const [customHook, setCustomHook] = useState("");
  const [composerBlocks, setComposerBlocks] = useState<EmailBlock[]>([]);

  // Opções do Catálogo
  const [catalogHeadline, setCatalogHeadline] = useState(
    "Go Team Go — Active US College Recruiting Portfolio & Prospects",
  );
  const [catalogMessage, setCatalogMessage] = useState(
    "Go Team Go connects verified international volleyball prospects with top US college programs, ensuring complete athletic and academic qualification.",
  );

  // Filtros de Destinatários
  const [recipientSearch, setRecipientSearch] = useState("");
  const [filterState, setFilterState] = useState("all");
  const [filterLeague, setFilterLeague] = useState("all");
  const [filterHbcu, setFilterHbcu] = useState("all");
  const [selectedBudgets, setSelectedBudgets] = useState<UniversityBudgetLevel[]>([]);
  const [filterToefl, setFilterToefl] = useState("all");
  const [filterHideSignaled, setFilterHideSignaled] = useState(false);

  // TASK-107: Fila em Tempo Real & Reconciliação
  const [showQueueRecipients, setShowQueueRecipients] = useState(false);
  const [queueRecipients, setQueueRecipients] = useState<
    Array<{
      id: string;
      recipientName: string;
      recipientEmail: string;
      universityName: string | null;
      status: string;
      attempts: number;
      lastError: string | null;
      processedAt: string | null;
      createdAt: string;
    }>
  >([]);
  const [queueRecipientsTotal, setQueueRecipientsTotal] = useState(0);
  const [queuePage, setQueuePage] = useState(1);
  const [queueStatusFilter, setQueueStatusFilter] = useState<string>("all");
  const [queueLoading, setQueueLoading] = useState(false);

  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [reconcileResolution, setReconcileResolution] = useState<"marked_sent" | "marked_failed">(
    "marked_sent",
  );
  const [reconcileNotes, setReconcileNotes] = useState("");
  const [isReconciling, setIsReconciling] = useState(false);
  const [isTriggeringWorker, setIsTriggeringWorker] = useState(false);

  // Modal de Confirmação & Estado de Envio
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Fila Inteligente: Estado de Monitoramento em Tempo Real e Operações
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  // null until server confirms ownership; never race a scheduled worker from the browser.
  const [orchestrationMode, setOrchestrationMode] = useState<{
    campaignId: string;
    serverOrchestrated: boolean;
  } | null>(null);
  const [campaignProgress, setCampaignProgress] = useState<CampaignProgress | null>(null);
  const [isOperatingQueue, setIsOperatingQueue] = useState(false);
  const [isTabHidden, setIsTabHidden] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [isAnotherTabActive, setIsAnotherTabActive] = useState(false);

  // Orquestrador do Navegador: Refs de controle do loop assíncrono e concorrência
  const tabIdRef = React.useRef<string>(
    `tab_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`,
  );
  const isUnmountedRef = React.useRef(false);
  const isOrchestratorActiveRef = React.useRef(false);
  const isProcessingTickRef = React.useRef(false);
  const tickTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstSizeRef = React.useRef(300);
  const burstPauseRef = React.useRef(1000);
  const lastBurstAtRef = React.useRef<number | null>(null);
  const [sendRate, setSendRate] = useState(0);
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);

  // Carregar dados iniciais
  async function loadInitialData() {
    setLoading(true);
    try {
      const [
        athletesRes,
        uniRes,
        suppressedRes,
        historyRes,
        signalsRes,
        visualRes,
        videosRes,
        latestCampaignRes,
      ] = await Promise.all([
        supabase
          .from("athletes")
          .select(
            `
            id,
            slug,
            full_name,
            photo_url,
            height_cm,
            nationality,
            sport:sports(name_en),
            position:positions(name_en),
            profile:athlete_profiles(gpa, athlete_status, graduation_year, high_school_graduation, highlight_note, budget, highlight_video_url)
          `,
          )
          .eq("is_public", true)
          .is("deleted_at", null)
          .order("full_name", { ascending: true }),
        asQueryResult(
          fetchAllUniversities<University>(
            supabase,
            "id,name,city,state,league,is_hbcu,budget_level,toefl_level,coaches,source_url",
          ),
        ),
        getSuppressedEmailsServerFn().catch(() => []),
        getMailerHistoryServerFn().catch(() => []),
        getActiveInterestSignalsServerFn().catch(() => []),
        supabase
          .from("agency_visual_settings")
          .select("logo_url, hero_background_url")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("athlete_videos")
          .select("athlete_id, youtube_url, kind, sort_order")
          .eq("kind", "highlight")
          .order("sort_order", { ascending: true }),
        supabase
          .from("mailer_campaigns")
          .select("id, status")
          .in("status", ["running", "queued", "paused"])
          .gt("total_recipients", 0)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (visualRes.data) {
        setVisualSettings({
          logo_url: visualRes.data.logo_url ?? null,
          hero_background_url: visualRes.data.hero_background_url ?? null,
        });
      }

      if (latestCampaignRes?.data?.id) {
        const campId = latestCampaignRes.data.id;
        setActiveCampaignId(campId);
        const prog = await getCampaignQueueProgressServerFn({
          data: { campaignId: campId },
        }).catch(() => null);
        if (prog) {
          setCampaignProgress(prog);
        }
      }

      const videoMap = new Map<string, string>();
      if (videosRes.data) {
        for (const v of videosRes.data as Array<{
          athlete_id: string;
          youtube_url: string | null;
        }>) {
          if (v.athlete_id && v.youtube_url && !videoMap.has(v.athlete_id)) {
            videoMap.set(v.athlete_id, v.youtube_url);
          }
        }
      }

      if (athletesRes.error) {
        console.error("[mailer] Error loading athletes:", athletesRes.error);
        toast.error(`Failed to load athletes: ${athletesRes.error.message}`);
      } else if (athletesRes.data) {
        const rawList = athletesRes.data as unknown as RawAthleteRecord[];
        const formatted: AthleteSummary[] = rawList.map((a) => ({
          id: a.id,
          slug: a.slug,
          full_name: a.full_name,
          photo_url: a.photo_url,
          height_cm: a.height_cm,
          nationality: a.nationality,
          sport_name: a.sport?.name_en || null,
          position_name: a.position?.name_en || null,
          country_flag: null,
          gpa: a.profile?.gpa ?? null,
          athlete_status: a.profile?.athlete_status ?? null,
          graduation_year: a.profile?.graduation_year ?? null,
          high_school_graduation: a.profile?.high_school_graduation ?? null,
          highlight_note: a.profile?.highlight_note ?? null,
          budget: a.profile?.budget ?? null,
          highlight_video_url: videoMap.get(a.id) || a.profile?.highlight_video_url || null,
        }));
        setAthletes(formatted);

        // Se não houver atleta selecionado mas houver atletas na lista, seleciona o primeiro
        if (!selectedAthleteId && formatted.length > 0) {
          setSelectedAthleteId(formatted[0].id);
        }
      }

      if (uniRes.error) {
        console.error("[mailer] Error loading universities:", uniRes.error);
        toast.error(`Failed to load universities: ${uniRes.error.message}`);
      } else if (uniRes.data) {
        setUniversities((uniRes.data as University[]) || []);
      }

      if (suppressedRes) {
        setSuppressedEmails(new Set(suppressedRes.map((e: string) => e.toLowerCase().trim())));
      }

      if (historyRes) {
        setHistoryLogs((historyRes as RecruitEmailLog[]) || []);
      }

      if (signalsRes) {
        setInterestSignals((signalsRes as CoachInterestSignal[]) || []);
      }

      // Restaura monitoramento de campanha ativa (running/queued/paused), se houver
      const activeCamp = await getLatestActiveCampaignServerFn().catch(() => null);
      if (activeCamp) {
        setActiveCampaignId(activeCamp.campaignId);
        setCampaignProgress(activeCamp);
      }
    } catch (err) {
      console.error("[mailer] Error loading data:", err);
      toast.error("Failed to load mailer data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInitialData();
  }, []);

  // 0. Monitorar desmonte do componente para evitar vazamento de memória e chamadas fantasmas
  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      isOrchestratorActiveRef.current = false;
      if (tickTimeoutRef.current) {
        clearTimeout(tickTimeoutRef.current);
        tickTimeoutRef.current = null;
      }
    };
  }, []);

  // 1. Monitorar visibilidade da aba do navegador e conectividade de rede
  useEffect(() => {
    const handleVisibility = () => {
      setIsTabHidden(document.visibilityState === "hidden");
    };
    const onOnline = () => {
      setIsOffline(false);
      // Ao reconectar, aguardar 1s e retomar sem rajadas
      if (activeCampaignId && isOrchestratorActiveRef.current && !isUnmountedRef.current) {
        triggerOrchestratorTick(1000);
      }
    };
    const onOffline = () => {
      setIsOffline(true);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [activeCampaignId]);

  // 2. BroadcastChannel para coordenação entre abas locais no mesmo navegador
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined" || !activeCampaignId) return;
    const bc = new BroadcastChannel("gtg_mailer_orchestrator");
    bc.onmessage = (event) => {
      if (
        event.data?.type === "HEARTBEAT" &&
        event.data.campaignId === activeCampaignId &&
        event.data.tabId !== tabIdRef.current
      ) {
        // The server-side lease arbitrates ownership; do not permanently
        // disable recovery just because another tab emitted a heartbeat.
        setIsAnotherTabActive(true);
      }
    };
    return () => {
      bc.close();
    };
  }, [activeCampaignId]);

  // 3. Timer de contagem regressiva para cooldown de 60s
  useEffect(() => {
    if (cooldownRemaining === null || cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // 4. Orquestrador do Navegador: rajadas sequenciais de até 300 (chunks de 100 no servidor)
  const triggerOrchestratorTick = React.useCallback(
    (delayMs: number = 1000) => {
      if (tickTimeoutRef.current) {
        clearTimeout(tickTimeoutRef.current);
        tickTimeoutRef.current = null;
      }

      if (
        !isOrchestratorActiveRef.current ||
        isUnmountedRef.current ||
        orchestrationMode?.campaignId !== activeCampaignId ||
        orchestrationMode.serverOrchestrated
      )
        return;

      tickTimeoutRef.current = setTimeout(async () => {
        if (
          !isOrchestratorActiveRef.current ||
          isUnmountedRef.current ||
          isProcessingTickRef.current ||
          !activeCampaignId
        ) {
          return;
        }

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setIsOffline(true);
          triggerOrchestratorTick(3000);
          return;
        }

        isProcessingTickRef.current = true;

        try {
          const res = await processMailerMicroBatchServerFn({
            data: {
              campaignId: activeCampaignId,
              batchSize: burstSizeRef.current,
              clientId: tabIdRef.current,
            },
          });

          if (isUnmountedRef.current || !isOrchestratorActiveRef.current) return;

          if (res.effectiveBurstSize) burstSizeRef.current = res.effectiveBurstSize;
          if (res.burstPauseMs) burstPauseRef.current = res.burstPauseMs;
          if (res.rateLimited)
            setRateLimitNotice(
              res.message || `Resend limitou a velocidade; nova rajada: ${burstSizeRef.current}.`,
            );
          const tickNow = Date.now();
          if (res.sent > 0 && lastBurstAtRef.current) {
            setSendRate(res.sent / Math.max(1, (tickNow - lastBurstAtRef.current) / 1000));
          }
          lastBurstAtRef.current = tickNow;

          if (res.controllerConflict) {
            setIsAnotherTabActive(true);
            // An expired lease can be acquired later; do not leave the UI stuck.
            triggerOrchestratorTick(17000);
            return;
          }

          if (
            !res.progress &&
            res.processed === 0 &&
            !res.cooldownActive &&
            !res.campaignCompleted &&
            !res.campaignStatus
          ) {
            isOrchestratorActiveRef.current = false;
            toast.error(res.message || "Não foi possível validar a fila de envios.");
            return;
          }

          setIsAnotherTabActive(false);
          // Signal ownership only after an authenticated server response.
          try {
            if (typeof BroadcastChannel !== "undefined") {
              const bc = new BroadcastChannel("gtg_mailer_orchestrator");
              bc.postMessage({
                type: "HEARTBEAT",
                campaignId: activeCampaignId,
                tabId: tabIdRef.current,
              });
              bc.close();
            }
          } catch {
            // Broadcast is an advisory UI signal; the database lease is authoritative.
          }

          if (res.progress) {
            setCampaignProgress(res.progress);
          }

          if (res.campaignCompleted || res.campaignStatus === "completed") {
            isOrchestratorActiveRef.current = false;
            const hasFailures =
              (res.progress?.failedCount || 0) > 0 || (res.progress?.cancelledCount || 0) > 0;
            if (hasFailures) {
              toast.warning(
                `Campanha concluída: ${res.progress?.sentCount || 0} enviado(s), ${res.progress?.failedCount || 0} falha(s), ${res.progress?.cancelledCount || 0} cancelado(s).`,
              );
            } else {
              toast.success("Campanha de e-mails concluída com sucesso!");
            }
            const updatedLogs = await getMailerHistoryServerFn().catch(() => []);
            if (!isUnmountedRef.current) {
              setHistoryLogs((updatedLogs as RecruitEmailLog[]) || []);
            }
            return;
          }

          if (res.campaignStatus === "paused" || res.campaignStatus === "cancelled") {
            isOrchestratorActiveRef.current = false;
            if (res.message && res.campaignStatus === "paused") toast.warning(res.message);
            return;
          }

          if (res.cooldownActive && res.cooldownRemainingSec && res.cooldownRemainingSec > 0) {
            setCooldownRemaining(res.cooldownRemainingSec);
            // O cronômetro do provedor é autoritativo.
            triggerOrchestratorTick(res.cooldownRemainingSec * 1000 + 1000);
            return;
          }

          setCooldownRemaining(null);

          // A pausa começa após o término da resposta anterior.
          if (isOrchestratorActiveRef.current && !isUnmountedRef.current) {
            triggerOrchestratorTick(burstPauseRef.current);
          }
        } catch (err) {
          console.error("[mailer] Error during browser orchestrator micro-tick:", err);
          // Em caso de falha de conexão, aguardar 3s para retentar sem rajadas
          if (isOrchestratorActiveRef.current && !isUnmountedRef.current) {
            triggerOrchestratorTick(3000);
          }
        } finally {
          isProcessingTickRef.current = false;
        }
      }, delayMs);
    },
    [activeCampaignId, orchestrationMode],
  );

  // Authoritative server ownership must be resolved BEFORE browser ticks start.
  useEffect(() => {
    if (!activeCampaignId) return;
    let cancelled = false;
    setOrchestrationMode(null);
    getMailerCampaignOrchestrationModeServerFn({ data: { campaignId: activeCampaignId } })
      .then((mode) => {
        if (!cancelled)
          setOrchestrationMode({
            campaignId: activeCampaignId,
            serverOrchestrated: mode.serverOrchestrated,
          });
      })
      .catch(() => {
        // Fail closed: if ownership is unknown the browser must not send.
        if (!cancelled)
          setOrchestrationMode({
            campaignId: activeCampaignId,
            serverOrchestrated: true,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [activeCampaignId]);

  // In server mode polling is READ ONLY. A page refresh never starts a batch.
  useEffect(() => {
    if (
      !activeCampaignId ||
      orchestrationMode?.campaignId !== activeCampaignId ||
      !orchestrationMode.serverOrchestrated
    )
      return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const progress = await getCampaignQueueProgressServerFn({
          data: { campaignId: activeCampaignId },
        });
        if (!cancelled && progress) setCampaignProgress(progress);
      } catch {
        // Previous state remains visible until next successful poll.
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeCampaignId, orchestrationMode]);

  // 5. Iniciar ou pausar orquestrador conforme o estado da campanha
  useEffect(() => {
    if (
      activeCampaignId &&
      campaignProgress?.status === "running" &&
      orchestrationMode?.campaignId === activeCampaignId &&
      !orchestrationMode.serverOrchestrated
    ) {
      isOrchestratorActiveRef.current = true;
      triggerOrchestratorTick(300);
    } else {
      isOrchestratorActiveRef.current = false;
      if (tickTimeoutRef.current) {
        clearTimeout(tickTimeoutRef.current);
        tickTimeoutRef.current = null;
      }
    }

    return () => {
      if (tickTimeoutRef.current) {
        clearTimeout(tickTimeoutRef.current);
        tickTimeoutRef.current = null;
      }
    };
  }, [activeCampaignId, campaignProgress?.status, orchestrationMode, triggerOrchestratorTick]);

  // Mapeamento de sinais de interesse ativos agrupados por e-mail do coach
  const signalsByEmail = useMemo(() => {
    const map = new Map<string, CoachInterestSignal[]>();
    for (const sig of interestSignals) {
      const email = sig.coach_email.toLowerCase().trim();
      if (!map.has(email)) {
        map.set(email, []);
      }
      map.get(email)!.push(sig);
    }
    return map;
  }, [interestSignals]);

  // Normalizar lista de todos os coaches disponíveis
  const allRecipients = useMemo<RecipientItem[]>(() => {
    const list: RecipientItem[] = [];

    for (const uni of universities) {
      const coaches = Array.isArray(uni.coaches) ? uni.coaches : [];
      for (const coach of coaches) {
        const cleanEmail = (coach.email || "").toLowerCase().trim();
        if (!cleanEmail) continue;

        const coachFullName =
          `${coach.first_name || ""} ${coach.last_name || ""}`.trim() || "Coach";
        const key = `${uni.id}__${coach.id || cleanEmail}`;
        const isSuppressed = suppressedEmails.has(cleanEmail);
        const signals = signalsByEmail.get(cleanEmail) || [];

        list.push({
          key,
          coachId: coach.id,
          name: coachFullName,
          lastName: coach.last_name,
          email: cleanEmail,
          universityName: uni.name,
          universityCity: uni.city,
          universityState: uni.state,
          league: uni.league,
          isHbcu: !!uni.is_hbcu,
          budgetLevel: uni.budget_level,
          toeflLevel: uni.toefl_level,
          isSuppressed,
          signals,
        });
      }
    }

    return list;
  }, [universities, suppressedEmails, signalsByEmail]);

  // Destinatários filtrados pela busca e selects combinados via AND
  const filteredRecipients = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();

    return allRecipients.filter((item) => {
      const matchesText =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.universityName.toLowerCase().includes(q) ||
        item.universityCity.toLowerCase().includes(q) ||
        item.universityState.toLowerCase().includes(q);

      if (!matchesText) return false;

      if (filterState !== "all" && item.universityState !== filterState) return false;
      if (filterLeague !== "all" && item.league !== filterLeague) return false;
      if (filterHbcu === "hbcu" && !item.isHbcu) return false;
      if (
        selectedBudgets.length > 0 &&
        (!item.budgetLevel || !selectedBudgets.includes(item.budgetLevel))
      ) {
        return false;
      }
      if (filterToefl !== "all" && item.toeflLevel !== filterToefl) return false;
      if (filterHideSignaled && item.signals.length > 0) return false;

      return true;
    });
  }, [
    allRecipients,
    recipientSearch,
    filterState,
    filterLeague,
    filterHbcu,
    selectedBudgets,
    filterToefl,
    filterHideSignaled,
  ]);

  // Controles de seleção de coaches
  function toggleRecipient(key: string) {
    setSelectedRecipientKeys((prev) => {
      const copy = new Set(prev);
      if (copy.has(key)) copy.delete(key);
      else copy.add(key);
      return copy;
    });
  }

  function selectAllFiltered() {
    setSelectedRecipientKeys((prev) => {
      const copy = new Set(prev);
      for (const r of filteredRecipients) {
        if (!r.isSuppressed) copy.add(r.key);
      }
      return copy;
    });
  }

  function deselectAllFiltered() {
    setSelectedRecipientKeys((prev) => {
      const copy = new Set(prev);
      for (const r of filteredRecipients) {
        copy.delete(r.key);
      }
      return copy;
    });
  }

  // Controles de seleção multi-atleta
  function toggleMultiAthlete(athleteId: string) {
    setSelectedMultiAthleteIds((prev) => {
      const copy = new Set(prev);
      if (copy.has(athleteId)) copy.delete(athleteId);
      else copy.add(athleteId);
      return copy;
    });
  }

  function selectAllAthletes() {
    setSelectedMultiAthleteIds(new Set(athletes.map((a) => a.id)));
  }

  function deselectAllAthletes() {
    setSelectedMultiAthleteIds(new Set());
  }

  // Atleta selecionado no modo single
  const currentSingleAthlete = useMemo(() => {
    return athletes.find((a) => a.id === selectedAthleteId) || athletes[0] || null;
  }, [athletes, selectedAthleteId]);

  // Atletas selecionados no modo multi
  const selectedMultiAthletesList = useMemo(() => {
    return athletes.filter((a) => selectedMultiAthleteIds.has(a.id));
  }, [athletes, selectedMultiAthleteIds]);

  const activeComposerAthleteIds = useMemo(() => {
    if (sendMode === "catalog") return [];
    if (sendMode === "single") return currentSingleAthlete ? [currentSingleAthlete.id] : [];
    return selectedMultiAthletesList.map((athlete) => athlete.id);
  }, [currentSingleAthlete, selectedMultiAthletesList, sendMode]);

  // Shared authenticated bulk data used for the actual dispatch.
  useEffect(() => {
    let cancelled = false;
    setEmailAthletesRequestKey(activeComposerAthleteIds.join(","));
    if (activeComposerAthleteIds.length === 0) {
      setEmailAthletes([]);
      setEmailAthletesError(null);
      setEmailAthletesLoading(false);
      return;
    }
    setEmailAthletesLoading(true);
    setEmailAthletesError(null);
    void getAthletesEmailDataServerFn({ data: { athleteIds: activeComposerAthleteIds } })
      .then((data) => {
        if (!cancelled) setEmailAthletes(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setEmailAthletes([]);
          setEmailAthletesError(
            error instanceof Error ? error.message : "Failed loading athlete email data.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setEmailAthletesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeComposerAthleteIds, emailAthletesRetry]);

  // O composer conserva apenas a ordem dos cards; textos são derivados dos campos visíveis.
  const finalBlocks = useMemo(() => {
    if (sendMode === "catalog" || activeComposerAthleteIds.length === 0) return [];
    const cardOrder = reconcileEmailBlocks(composerBlocks, activeComposerAthleteIds)
      .filter((block) => block.type === "athlete")
      .map((block) => (block.type === "athlete" ? block.athleteId : ""));
    return composeEmailBlocks({
      opening: customHook,
      closing: customIntroduction,
      athleteIds: activeComposerAthleteIds,
      cardOrder,
    });
  }, [activeComposerAthleteIds, composerBlocks, customHook, customIntroduction, sendMode]);

  // Sincroniza o estado interno do composer preservando blocos de texto
  useEffect(() => {
    if (sendMode === "catalog") return;
    if (activeComposerAthleteIds.length === 0) {
      setComposerBlocks([]);
      return;
    }
    setComposerBlocks((prev) => reconcileEmailBlocks(prev, activeComposerAthleteIds));
  }, [activeComposerAthleteIds, sendMode]);

  // Editores de blocos mortos removidos: a UI usa somente os campos visíveis.

  const composerPreviewBlocks = useMemo(() => {
    if (sendMode === "catalog") return [];
    return finalBlocks;
  }, [finalBlocks, sendMode]);

  // Gera HTML de Preview dinâmico
  const previewCoach = useMemo(
    () =>
      allRecipients.find(
        (recipient) => selectedRecipientKeys.has(recipient.key) && !recipient.isSuppressed,
      ),
    [allRecipients, selectedRecipientKeys],
  );
  const previewLastName = previewCoach ? previewCoach.lastName : "Smith";
  const previewEmail = useMemo(() => {
    const logoUrl = visualSettings?.logo_url ?? null;
    const heroBackgroundUrl = visualSettings?.hero_background_url ?? null;

    if (sendMode === "catalog") {
      const res = renderCatalogEmail({
        coachName: previewCoach?.name || "Coach Smith",
        coachLastName: previewLastName,
        customSubject,
        institutionName: "University Showcase",
        customHeadline: catalogHeadline,
        customMessage: catalogMessage,

        customHook: customHook || null,
        recipientEmail: previewCoach?.email || "coach@example.edu",
        logoUrl,
        heroBackgroundUrl,
      });
      return {
        html: res.html,
        subject: res.subject,
        text: res.text || "",
        expectedAthleteIds: [] as string[],
        renderedAthleteIds: [] as string[],
        missingAthleteIds: [] as string[],
      };
    }

    if (sendMode === "multi") {
      const targets = activeComposerAthleteIds
        .map((id) => emailAthletes.find((athlete) => athlete.athleteId === id))
        .filter((athlete): athlete is RecruitEmailData => Boolean(athlete));
      if (
        targets.length === 0 ||
        targets.length !== activeComposerAthleteIds.length ||
        emailAthletesLoading ||
        emailAthletesError
      ) {
        return {
          html: "<p style='font-family:sans-serif;padding:20px;text-align:center;'>Carregando ficha completa das atletas para o preview.</p>",
          subject: "",
          text: "",
          expectedAthleteIds: activeComposerAthleteIds,
          renderedAthleteIds: [] as string[],
          missingAthleteIds: [] as string[],
        };
      }

      const res = renderMultiAthleteRecruitEmail({
        athletes: targets,
        coachName: previewCoach?.name || "Coach Smith",
        coachLastName: previewLastName,
        customSubject,
        institutionName: "University Athletics",
        recipientEmail: previewCoach?.email || "coach@example.edu",
        customIntroduction: customIntroduction || null,
        customHook: customHook || null,
        blocks: composerPreviewBlocks.length > 0 ? composerPreviewBlocks : undefined,
        logoUrl,
        heroBackgroundUrl,
      });
      return {
        html: res.html,
        subject: res.subject,
        text: res.text,
        expectedAthleteIds: res.expectedAthleteIds,
        renderedAthleteIds: res.renderedAthleteIds,
        missingAthleteIds: res.missingAthleteIds,
      };
    }

    // single mode
    if (!currentSingleAthlete) {
      return {
        html: "<p style='font-family:sans-serif;padding:20px;text-align:center;'>Nenhum atleta selecionado.</p>",
        subject: "",
        text: "",
        expectedAthleteIds: [] as string[],
        renderedAthleteIds: [] as string[],
        missingAthleteIds: [] as string[],
      };
    }

    const selectedData = emailAthletes.find(
      (athlete) => athlete.athleteId === currentSingleAthlete.id,
    );
    if (!selectedData || emailAthletesLoading || emailAthletesError) {
      return {
        html: "<p style='font-family:sans-serif;padding:20px;text-align:center;'>Carregando ficha completa da atleta para o preview.</p>",
        subject: "",
        text: "",
        expectedAthleteIds: [currentSingleAthlete.id],
        renderedAthleteIds: [] as string[],
        missingAthleteIds: [] as string[],
      };
    }
    const res = renderRecruitEmail({
      ...selectedData,
      coachName: previewCoach?.name || "Coach Smith",
      coachLastName: previewLastName,
      customSubject,
      recipientEmail: previewCoach?.email || "coach@example.edu",
      customIntroduction: customIntroduction || null,
      customHook: customHook || null,
      blocks: composerPreviewBlocks.length > 0 ? composerPreviewBlocks : undefined,
      logoUrl,
      heroBackgroundUrl,
    });
    return {
      html: res.html,
      subject: res.subject,
      text: res.text,
      profileUrl: res.profileUrl,
      expectedAthleteIds: res.expectedAthleteIds,
      renderedAthleteIds: res.renderedAthleteIds,
      missingAthleteIds: res.missingAthleteIds,
    };
  }, [
    sendMode,
    currentSingleAthlete,
    activeComposerAthleteIds,
    emailAthletes,
    emailAthletesLoading,
    emailAthletesError,
    catalogHeadline,
    catalogMessage,
    customSubject,
    previewCoach,
    previewLastName,
    customIntroduction,
    customHook,
    composerPreviewBlocks,
    visualSettings,
  ]);

  const previewIntegrityError = useMemo(() => {
    if (sendMode === "catalog") return null;
    if (activeComposerAthleteIds.length === 0) return "Nenhum atleta selecionado.";
    if (emailAthletesLoading) return null;
    if (emailAthletesError) return emailAthletesError;
    if (!previewEmail?.html) return "Preview não gerado.";
    try {
      assertEmailIntegrity({
        expectedOpeningText: finalBlocks[1]?.type === "text" ? finalBlocks[1].content : null,
        expectedClosingText: getEmailBlockText(finalBlocks[finalBlocks.length - 1]),
        mode: sendMode === "single" ? "single_athlete" : "multi_athlete",
        expectedAthleteIds: activeComposerAthleteIds,
        renderedAthleteIds: previewEmail.renderedAthleteIds,
        missingAthleteIds: previewEmail.missingAthleteIds,
        html: previewEmail.html,
        text: previewEmail.text || "",
      });
      return null;
    } catch (err) {
      return err instanceof Error
        ? err.message
        : "Inconsistência de integridade detectada no preview.";
    }
  }, [
    activeComposerAthleteIds,
    emailAthletesError,
    emailAthletesLoading,
    finalBlocks,
    previewEmail,
    sendMode,
  ]);

  const selectedEmailData = useMemo(
    () =>
      activeComposerAthleteIds
        .map((id) => emailAthletes.find((athlete) => athlete.athleteId === id))
        .filter((athlete): athlete is RecruitEmailData => Boolean(athlete)),
    [activeComposerAthleteIds, emailAthletes],
  );
  const missingAthleteFields = useMemo(
    () => getMissingAthleteEmailFields(selectedEmailData),
    [selectedEmailData],
  );
  const emailAthletesPanelState = getAthleteEmailPanelState({
    mode: sendMode,
    loading: emailAthletesLoading || emailAthletesRequestKey !== activeComposerAthleteIds.join(","),
    error: emailAthletesError,
    requestedCount: activeComposerAthleteIds.length,
    receivedCount: selectedEmailData.length,
    missingFieldCount: missingAthleteFields.length,
  });
  const emailAthletesReady =
    emailAthletesPanelState === "ready" || emailAthletesPanelState === "missing";

  function retryEmailAthletes() {
    setEmailAthletesLoading(true);
    setEmailAthletesError(null);
    setEmailAthletesRetry((value) => value + 1);
  }
  const previewSizeBytes = useMemo(
    () => new TextEncoder().encode(previewEmail.html).length,
    [previewEmail.html],
  );

  // Calcular contagens para o disparo
  const selectedRecipientsList = useMemo(() => {
    return allRecipients.filter((r) => selectedRecipientKeys.has(r.key));
  }, [allRecipients, selectedRecipientKeys]);

  const activeSelectedRecipients = useMemo(() => {
    return selectedRecipientsList.filter((r) => !r.isSuppressed);
  }, [selectedRecipientsList]);

  const suppressedSelectedCount = useMemo(() => {
    return selectedRecipientsList.filter((r) => r.isSuppressed).length;
  }, [selectedRecipientsList]);

  // FRENTE 1: No modo multi-atleta agora é 1 e-mail por coach contendo todos os cards empilhados
  const totalCalculatedDispatches = useMemo(() => {
    return activeSelectedRecipients.length;
  }, [activeSelectedRecipients]);

  // Helper para verificar sinais de interesse contextuais para cada coach
  function getCoachBadges(rec: RecipientItem) {
    if (!rec.signals || rec.signals.length === 0) return null;

    const badges: Array<{ label: string; color: string; tooltip: string }> = [];

    for (const sig of rec.signals) {
      if (sig.reason === "fully_recruited") {
        badges.push({
          label: "Already Full",
          color: "bg-rose-950/60 text-rose-300 border-rose-700/50",
          tooltip: "Coach sinalizou que o elenco está cheio para esta temporada.",
        });
      } else if (sig.reason === "position_not_needed") {
        const targetPositions =
          sendMode === "single"
            ? [currentSingleAthlete?.position_name].filter(Boolean)
            : sendMode === "multi"
              ? selectedMultiAthletesList.map((a) => a.position_name).filter(Boolean)
              : [];

        const isMatch =
          !sig.position ||
          targetPositions.some((pos) => pos?.toLowerCase() === sig.position?.toLowerCase());

        badges.push({
          label: sig.position ? `No ${sig.position}` : "Position not needed",
          color: isMatch
            ? "bg-amber-950/60 text-amber-300 border-amber-700/50"
            : "bg-zinc-800 text-zinc-400 border-zinc-700",
          tooltip: `Coach não busca a posição ${sig.position || "informada"}.`,
        });
      } else if (sig.reason === "specific_athlete_dislike") {
        const targetIds =
          sendMode === "single"
            ? [currentSingleAthlete?.id].filter(Boolean)
            : sendMode === "multi"
              ? Array.from(selectedMultiAthleteIds)
              : [];

        const isMatch = !!sig.athlete_id && targetIds.includes(sig.athlete_id);

        badges.push({
          label: "Athlete mismatch",
          color: isMatch
            ? "bg-red-950/60 text-red-300 border-red-700/50"
            : "bg-zinc-800 text-zinc-400 border-zinc-700",
          tooltip: "Coach sinalizou desinteresse neste perfil específico.",
        });
      } else if (sig.reason === "other_positions_only") {
        badges.push({
          label: "Other positions only",
          color: "bg-sky-950/60 text-sky-300 border-sky-700/50",
          tooltip: "Coach busca apenas outras posições específicas.",
        });
      }
    }

    return badges;
  }

  // Ação de Disparo
  async function handleSendMailer() {
    if (emailAthletesPanelState !== "ready") {
      toast.error(ATHLETE_EMAIL_STATE_MESSAGES[emailAthletesPanelState]);
      return;
    }
    if (activeSelectedRecipients.length === 0) {
      toast.error("Nenhum destinatário ativo selecionado.");
      return;
    }

    if (sendMode !== "catalog" && activeComposerAthleteIds.length === 0) {
      toast.error(sendMode === "single" ? "Selecione um atleta." : "Selecione ao menos um atleta.");
      return;
    }

    if (previewIntegrityError) {
      toast.error(`Envio bloqueado por integridade: ${previewIntegrityError}`);
      return;
    }

    const targetAthleteIds = activeComposerAthleteIds;

    setIsSending(true);

    try {
      const payloadRecipients = selectedRecipientsList.map((r) => ({
        coachId: r.coachId,
        name: r.name,
        lastName: r.lastName,
        email: r.email,
        universityName: r.universityName,
      }));

      const res = await enqueueMailerCampaignServerFn({
        data: {
          mode:
            sendMode === "single"
              ? "single_athlete"
              : sendMode === "multi"
                ? "multi_athlete"
                : "catalog",
          athleteIds: targetAthleteIds,
          recipients: payloadRecipients,
          filters: {
            state: filterState,
            league: filterLeague,
            hbcu: filterHbcu,
            budget: selectedBudgets.length > 0 ? selectedBudgets.join(",") : "all",
            budgetLevels: selectedBudgets,
            toefl: filterToefl,
            hideSignaled: filterHideSignaled,
          },
          blocks: sendMode === "catalog" ? [] : finalBlocks,
          customOptions: {
            subject: customSubject || undefined,
            introduction: customIntroduction || undefined,
            hook: customHook || undefined,
            headline: catalogHeadline || undefined,
            message: catalogMessage || undefined,
            blocks: sendMode === "catalog" ? [] : finalBlocks,
          },
          catalogOptions: {
            customHeadline: catalogHeadline,
            customMessage: catalogMessage,
          },
        },
      });

      if (res.success) {
        toast.success(
          `Campanha criada com ${res.totalEnqueued} destinatários na fila. Acompanhe o status operacional abaixo.`,
        );
        if (res.totalSuppressed > 0) {
          toast.info(
            `${res.totalSuppressed} contatos foram ignorados por estarem na lista de descadastro (unsubscribed/pausados).`,
          );
        }
        setConfirmModalOpen(false);
        setIsAnotherTabActive(false);
        setCooldownRemaining(null);
        setActiveCampaignId(res.campaignId);

        // Atualizar progresso imediatamente
        const initialProg = await getCampaignQueueProgressServerFn({
          data: { campaignId: res.campaignId },
        }).catch(() => null);
        if (initialProg) {
          setCampaignProgress(initialProg);
        }

        // O useEffect inicia o navegador SOMENTE após verificar o executor
        // da campanha. Uma campanha server-orchestrated nunca dispara aqui.

        // Atualizar histórico
        const updatedLogs = await getMailerHistoryServerFn().catch(() => []);
        setHistoryLogs((updatedLogs as RecruitEmailLog[]) || []);
      } else {
        toast.error(res.message || "Falha ao enfileirar e-mails.");
        if (res.errors && res.errors.length > 0) {
          console.error("Errors:", res.errors);
        }
      }
    } catch (err) {
      console.error("[mailer] Exception enqueueing emails:", err);
      toast.error("Erro inesperado ao enfileirar disparo de e-mails.");
    } finally {
      setIsSending(false);
    }
  }

  // Controles de Operação da Fila
  async function handlePauseCampaign() {
    if (!activeCampaignId) return;
    setIsOperatingQueue(true);
    // Parar orquestrador no navegador imediatamente
    isOrchestratorActiveRef.current = false;
    if (tickTimeoutRef.current) {
      clearTimeout(tickTimeoutRef.current);
      tickTimeoutRef.current = null;
    }
    try {
      const res = await pauseMailerCampaignServerFn({ data: { campaignId: activeCampaignId } });
      if (res.success) {
        toast.info("Campanha pausada. O servidor manterá o estado persistido.");
        const prog = await getCampaignQueueProgressServerFn({
          data: { campaignId: activeCampaignId },
        });
        if (prog) setCampaignProgress(prog);
      } else {
        toast.error(res.message || "Falha ao pausar campanha.");
      }
    } catch (err) {
      console.error("[mailer] Error pausing campaign:", err);
      toast.error("Erro ao pausar campanha.");
    } finally {
      setIsOperatingQueue(false);
    }
  }

  async function handleResumeCampaign() {
    if (!activeCampaignId) return;
    setIsOperatingQueue(true);
    try {
      const res = await resumeMailerCampaignServerFn({ data: { campaignId: activeCampaignId } });
      if (res.success) {
        toast.success("Campanha retomada, aguardando o executor autorizado.");
        const prog = await getCampaignQueueProgressServerFn({
          data: { campaignId: activeCampaignId },
        });
        if (prog) setCampaignProgress(prog);
        // O effect reativa apenas campanhas explicitamente browser-owned.
        setIsAnotherTabActive(false);
      } else {
        toast.error(res.message || "Falha ao retomar campanha.");
      }
    } catch (err) {
      console.error("[mailer] Error resuming campaign:", err);
      toast.error("Erro ao retomar campanha.");
    } finally {
      setIsOperatingQueue(false);
    }
  }

  async function handleCancelCampaign() {
    if (!activeCampaignId) return;
    if (
      !confirm(
        "Tem certeza que deseja cancelar esta campanha? Os e-mails pendentes na fila serão cancelados imediatamente.",
      )
    ) {
      return;
    }
    setIsOperatingQueue(true);
    // Parar orquestrador imediatamente
    isOrchestratorActiveRef.current = false;
    if (tickTimeoutRef.current) {
      clearTimeout(tickTimeoutRef.current);
      tickTimeoutRef.current = null;
    }
    try {
      const res = await cancelMailerCampaignServerFn({ data: { campaignId: activeCampaignId } });
      if (res.success) {
        toast.warning("Campanha cancelada.");
        const prog = await getCampaignQueueProgressServerFn({
          data: { campaignId: activeCampaignId },
        });
        if (prog) setCampaignProgress(prog);
        const updatedLogs = await getMailerHistoryServerFn().catch(() => []);
        setHistoryLogs((updatedLogs as RecruitEmailLog[]) || []);
      } else {
        toast.error(res.message || "Falha ao cancelar campanha.");
      }
    } catch (err) {
      console.error("[mailer] Error cancelling campaign:", err);
      toast.error("Erro ao cancelar campanha.");
    } finally {
      setIsOperatingQueue(false);
    }
  }

  async function loadQueueRecipients(pageToLoad = queuePage, statusToLoad = queueStatusFilter) {
    if (!activeCampaignId) return;
    setQueueLoading(true);
    try {
      const res = await getCampaignRecipientsServerFn({
        data: {
          campaignId: activeCampaignId,
          page: pageToLoad,
          pageSize: 25,
          statusFilter: statusToLoad === "all" ? undefined : statusToLoad,
        },
      });
      setQueueRecipients(res.items);
      setQueueRecipientsTotal(res.total);
      setQueuePage(res.page);
    } catch (err) {
      console.error("[mailer] Error loading campaign queue recipients:", err);
      toast.error("Erro ao carregar destinatários da fila.");
    } finally {
      setQueueLoading(false);
    }
  }

  async function handleReconcileIncident() {
    if (!activeCampaignId) return;
    if (reconcileNotes.trim().length < 5) {
      toast.error("A justificativa administrativa deve ter no mínimo 5 caracteres.");
      return;
    }
    setIsReconciling(true);
    try {
      const formattedNotes = `[${reconcileResolution.toUpperCase()}] ${reconcileNotes.trim()}`;
      const res = await reconcileCampaignIncidentServerFn({
        data: {
          campaignId: activeCampaignId,
          adminNotes: formattedNotes,
        },
      });
      if (res.success) {
        toast.success(res.message);
        setReconcileModalOpen(false);
        setReconcileNotes("");
        const prog = await getCampaignQueueProgressServerFn({
          data: { campaignId: activeCampaignId },
        });
        if (prog) setCampaignProgress(prog);
        void loadQueueRecipients(1, queueStatusFilter);
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      console.error("[mailer] Error reconciling incident:", err);
      toast.error("Erro ao reconciliar incidente.");
    } finally {
      setIsReconciling(false);
    }
  }

  async function handleTriggerWorker() {
    if (!activeCampaignId) return;
    setIsTriggeringWorker(true);
    try {
      const res = await triggerCampaignWorkerServerFn({
        data: { campaignId: activeCampaignId },
      });
      if (res.success) {
        toast.info("Worker gerenciado pelo agendador protegido.");
        const prog = await getCampaignQueueProgressServerFn({
          data: { campaignId: activeCampaignId },
        });
        if (prog) setCampaignProgress(prog);
      } else {
        toast.error(res.message || "Não foi possível acionar o worker.");
      }
    } catch (err) {
      console.error("[mailer] Error triggering worker:", err);
      toast.error("Erro ao acionar worker.");
    } finally {
      setIsTriggeringWorker(false);
    }
  }

  useEffect(() => {
    if (showQueueRecipients && activeCampaignId) {
      void loadQueueRecipients(queuePage, queueStatusFilter);
    }
  }, [showQueueRecipients, queuePage, queueStatusFilter, activeCampaignId]);

  const handleViewTimeline = async (log: {
    id: string;
    recipient_name?: string | null;
    recipient_email?: string | null;
    subject: string;
    sent_at: string;
    provider_id?: string | null;
  }) => {
    setSelectedTimelineLog(log);
    setLoadingTimeline(true);
    try {
      const events = await getEmailEventTimelineServerFn({
        data: {
          providerEmailId: log.provider_id,
          recipientEmail: log.recipient_email,
        },
      });
      setTimelineEvents(events);
    } catch (err) {
      console.error("[mailer] Error loading timeline:", err);
      toast.error("Failed to load email event timeline.");
      setTimelineEvents([]);
    } finally {
      setLoadingTimeline(false);
    }
  };

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Recruit Mailer">
        <div className="space-y-6">
          {/* Header Principal */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <Mail className="w-6 h-6 text-primary" />
                Recruit Mailer
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Dispare e-mails de recrutamento esportivo para coaches universitários com
                rastreamento, templates unificados multi-atleta e feedback de interesse.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {universities.length} universidades ·{" "}
                {universities.reduce(
                  (count, uni) => count + (Array.isArray(uni.coaches) ? uni.coaches.length : 0),
                  0,
                )}{" "}
                coaches cadastrados
              </p>
            </div>

            {/* Upper Tabs: Create Send | History | Metrics */}
            <div className="flex items-center gap-2 bg-muted/60 p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setActiveTab("compose")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === "compose"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                Create Send
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === "history"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                History ({historyLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("metrics")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === "metrics"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Metrics
              </button>
            </div>
          </div>

          {/* LIVE CAMPAIGN MONITOR */}
          {campaignProgress && (
            <div className="bg-card/90 backdrop-blur-md border border-primary/40 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-primary/10 text-foreground border border-primary/30">
                      Fila Inteligente de Disparos
                    </span>
                    {campaignProgress.substateLabel && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">
                        {campaignProgress.substateLabel}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground font-mono">
                      ID: {campaignProgress.campaignId.slice(0, 8)}...
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary animate-pulse" />
                    {campaignProgress.subject}
                  </h3>
                  {campaignProgress.substateDescription && (
                    <p className="text-xs text-muted-foreground">
                      {campaignProgress.substateDescription}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Status Badge Confiável */}
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
                  ) : campaignProgress.status === "running" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      {(cooldownRemaining !== null && cooldownRemaining > 0) ||
                      (campaignProgress.nextBatchAt &&
                        new Date(campaignProgress.nextBatchAt) > new Date())
                        ? `Aguardando Intervalo (${cooldownRemaining ?? 60}s)`
                        : `Enviando (Lote ${campaignProgress.currentBatch} de ${campaignProgress.totalBatches})`}
                    </span>
                  ) : campaignProgress.status === "paused" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700">
                      <Pause className="w-3.5 h-3.5" />
                      Campanha Pausada
                    </span>
                  ) : campaignProgress.status === "queued" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-900 border border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600">
                      <Clock className="w-3.5 h-3.5" />
                      Enfileirada
                    </span>
                  ) : campaignProgress.status === "completed" ? (
                    campaignProgress.failedCount > 0 ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-900 dark:text-amber-200" />
                        Concluída com {campaignProgress.failedCount} falha(s)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-900 dark:text-emerald-200" />
                        Concluída com Sucesso
                      </span>
                    )
                  ) : campaignProgress.status === "cancelled" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-900 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700">
                      <Ban className="w-3.5 h-3.5" />
                      Cancelada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-900 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Erro na Campanha
                    </span>
                  )}

                  {/* Controles de Ação Seguros */}
                  {campaignProgress.status === "running" && (
                    <button
                      type="button"
                      disabled
                      onClick={handleTriggerWorker}
                      title="Disponível somente após ativação autorizada do scheduler"
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Zap className="w-3 h-3" />
                      {isTriggeringWorker ? "Aguardando..." : "Worker via Scheduler"}
                    </button>
                  )}
                  {campaignProgress.status === "running" && (
                    <button
                      type="button"
                      disabled={isOperatingQueue}
                      onClick={handlePauseCampaign}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700 dark:hover:bg-amber-950 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Pause className="w-3 h-3" />
                      Pausar
                    </button>
                  )}
                  {campaignProgress.status === "paused" && (
                    <button
                      type="button"
                      disabled={isOperatingQueue}
                      onClick={handleResumeCampaign}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-950 border border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700 dark:hover:bg-emerald-950 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3 h-3" />
                      Retomar
                    </button>
                  )}
                  {(campaignProgress.status === "running" ||
                    campaignProgress.status === "paused") && (
                    <button
                      type="button"
                      disabled={isOperatingQueue}
                      onClick={handleCancelCampaign}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-rose-100 text-rose-950 border border-rose-300 hover:bg-rose-200 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700 dark:hover:bg-rose-950 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-3 h-3" />
                      Cancelar
                    </button>
                  )}
                  {(campaignProgress.status === "completed" ||
                    campaignProgress.status === "cancelled") && (
                    <button
                      type="button"
                      onClick={() => {
                        setCampaignProgress(null);
                        setActiveCampaignId(null);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                    >
                      Ocultar
                    </button>
                  )}
                </div>
              </div>

              {/* Alerta de Quarentena Anti-Duplicação */}
              {campaignProgress.substate === "reconciliation_required" && (
                <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4 space-y-2 text-rose-950 dark:text-rose-200">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>Disparos Pausados por Quarentena Anti-Duplicação</span>
                  </div>
                  <p className="text-xs leading-relaxed">
                    O provedor Resend respondeu com status ambíguo ou timeout de rede durante a
                    última rajada. Para garantir que nenhum coach receba e-mails duplicados, a
                    automação foi suspensa preventivamente. Cada destinatário precisa de
                    evidência do Resend antes de uma reconciliação autorizada e auditável.
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      disabled
                      title="Requer auditoria por destinatário e autorização operacional."
                      className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-xs opacity-60 cursor-not-allowed shadow-sm flex items-center gap-1.5"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      Reconciliação bloqueada até auditoria
                    </button>
                  </div>
                </div>
              )}

              {/* Orientação discreta da aba aberta e dispositivo ativo */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    <strong className="text-foreground">Execução:</strong>{" "}
                    {orchestrationMode?.campaignId !== activeCampaignId
                      ? "Validando executor antes de permitir disparos."
                      : orchestrationMode.serverOrchestrated
                        ? "Servidor controla as rajadas. A aba pode ser fechada; aqui são mostrados somente dados persistidos."
                        : "Campanha legada: mantenha esta aba e o dispositivo ativos durante os disparos."}
                  </span>
                </div>
                {isTabHidden && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700 shrink-0">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Aba em segundo plano detectada
                  </span>
                )}
              </div>

              {/* Barra de Progresso */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">
                    Progresso Global:{" "}
                    <strong className="text-foreground">{campaignProgress.sentCount}</strong> de{" "}
                    {campaignProgress.totalRecipients} e-mails
                  </span>
                  <span className="font-bold text-primary">
                    {campaignProgress.percentComplete}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden border border-border/50">
                  <div
                    className="h-full bg-linear-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, campaignProgress.percentComplete))}%`,
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" role="status">
                <span>
                  Rajada atual:{" "}
                  <strong className="text-foreground">{campaignProgress.batchSize}</strong> e-mails
                </span>
                <span>
                  Ritmo:{" "}
                  <strong className="text-foreground">
                    {orchestrationMode?.serverOrchestrated
                      ? "Controlado pelo servidor"
                      : `${sendRate.toFixed(1)} e-mails/s`}
                  </strong>
                </span>
                <span>
                  Tempo restante estimado:{" "}
                  <strong className="text-foreground">
                    {campaignProgress.estimatedRemainingSeconds === null
                      ? "Indisponível"
                      : `${campaignProgress.estimatedRemainingSeconds}s`}
                  </strong>
                </span>
              </div>
              {rateLimitNotice && (
                <p role="alert" className="text-xs text-amber-900 dark:text-amber-200">
                  {rateLimitNotice}
                </p>
              )}

              {/* Grid de Métricas da Fila */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-1">
                <div className="bg-muted/40 border border-border/60 rounded-xl p-2.5 text-center">
                  <div className="text-[11px] text-muted-foreground uppercase font-bold flex items-center justify-center gap-1">
                    <Users className="w-3 h-3 text-muted-foreground" /> Total
                  </div>
                  <div className="text-base font-black text-foreground mt-0.5">
                    {campaignProgress.totalRecipients}
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 rounded-xl p-2.5 text-center">
                  <div className="text-[11px] text-emerald-900 dark:text-emerald-200 uppercase font-bold flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Aceitos Resend
                  </div>
                  <div className="text-base font-black text-emerald-950 dark:text-emerald-100 mt-0.5">
                    {campaignProgress.sentCount}
                  </div>
                </div>

                <div className="bg-sky-50 border border-sky-200 dark:bg-sky-950/40 dark:border-sky-800 rounded-xl p-2.5 text-center">
                  <div className="text-[11px] text-sky-900 dark:text-sky-200 uppercase font-bold flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" /> Na Fila
                  </div>
                  <div className="text-base font-black text-sky-950 dark:text-sky-100 mt-0.5">
                    {campaignProgress.pendingCount}
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800 rounded-xl p-2.5 text-center">
                  <div className="text-[11px] text-indigo-900 dark:text-indigo-200 uppercase font-bold flex items-center justify-center gap-1">
                    <Activity className="w-3 h-3" /> Em Curso
                  </div>
                  <div className="text-base font-black text-indigo-950 dark:text-indigo-100 mt-0.5">
                    {campaignProgress.processingCount}
                  </div>
                </div>

                <div className="bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 rounded-xl p-2.5 text-center">
                  <div className="text-[11px] text-rose-900 dark:text-rose-200 uppercase font-bold flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Falhas
                  </div>
                  <div className="text-base font-black text-rose-950 dark:text-rose-100 mt-0.5">
                    {campaignProgress.failedCount}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 dark:bg-slate-950/40 dark:border-slate-800 rounded-xl p-2.5 text-center">
                  <div className="text-[11px] text-slate-900 dark:text-slate-200 uppercase font-bold flex items-center justify-center gap-1">
                    <Ban className="w-3 h-3" /> Suprimidos
                  </div>
                  <div className="text-base font-black text-slate-950 dark:text-slate-100 mt-0.5">
                    {campaignProgress.suppressedCount}
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 rounded-xl p-2.5 text-center col-span-2 sm:col-span-1">
                  <div className="text-[11px] text-amber-900 dark:text-amber-200 uppercase font-bold flex items-center justify-center gap-1">
                    <Layers className="w-3 h-3" /> Bloco
                  </div>
                  <div className="text-base font-black text-amber-950 dark:text-amber-100 mt-0.5">
                    {campaignProgress.currentBatch} / {campaignProgress.totalBatches}
                  </div>
                </div>
              </div>

              {/* Informações de Estimativa e Pausa */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30 gap-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span>
                    {campaignProgress.status === "completed"
                      ? campaignProgress.failedCount > 0
                        ? `Processamento concluído com ${campaignProgress.failedCount} falha(s).`
                        : "Todos os e-mails foram processados com sucesso."
                      : (campaignProgress.estimatedRemainingSeconds ?? 0) > 0
                        ? `Tempo estimado para conclusão: ~${Math.ceil(
                            (campaignProgress.estimatedRemainingSeconds ?? 0) / 60,
                          )} min`
                        : "Estimativa indisponível até o ritmo estabilizar."}
                  </span>
                </div>
                {campaignProgress.nextBatchAt &&
                  new Date(campaignProgress.nextBatchAt) > new Date() && (
                    <span className="text-amber-900 dark:text-amber-200 font-medium">
                      Pausa automática de segurança ativa até{" "}
                      {new Date(campaignProgress.nextBatchAt).toLocaleTimeString()}
                    </span>
                  )}
              </div>

              {/* TASK-107: Fila em Tempo Real de Destinatários */}
              <div className="pt-2 border-t border-border/40 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowQueueRecipients(!showQueueRecipients)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-foreground py-1 px-2 rounded-lg hover:bg-muted/40 transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    Destinatários Desta Campanha ({campaignProgress.totalRecipients})
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
                        <span className="text-xs text-muted-foreground">Filtrar status:</span>
                        <select
                          value={queueStatusFilter}
                          onChange={(e) => {
                            setQueueStatusFilter(e.target.value);
                            setQueuePage(1);
                          }}
                          className="text-xs px-2 py-1 rounded-md border border-border bg-background cursor-pointer"
                        >
                          <option value="all">Todos ({campaignProgress.totalRecipients})</option>
                          <option value="pending">Na Fila ({campaignProgress.pendingCount})</option>
                          <option value="processing">
                            Em Curso ({campaignProgress.processingCount})
                          </option>
                          <option value="sent">Enviados ({campaignProgress.sentCount})</option>
                          <option value="failed">Falhas ({campaignProgress.failedCount})</option>
                          <option value="suppressed">
                            Suprimidos ({campaignProgress.suppressedCount})
                          </option>
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadQueueRecipients(queuePage, queueStatusFilter)}
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
                              <th className="p-2.5">Status</th>
                              <th className="p-2.5">Tentativas</th>
                              <th className="p-2.5">Erro / Info</th>
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
                                        item.status === "sent"
                                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                          : item.status === "processing"
                                            ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
                                            : item.status === "failed"
                                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                                              : item.status === "suppressed"
                                                ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                                                : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {item.status}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-muted-foreground font-mono">
                                    {item.attempts}
                                  </td>
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

                      {/* Paginação da fila */}
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
                              onClick={() => setQueuePage((p) => Math.max(1, p - 1))}
                              className="px-2 py-1 rounded border border-border bg-background disabled:opacity-40 cursor-pointer"
                            >
                              Anterior
                            </button>
                            <button
                              type="button"
                              disabled={
                                queuePage >= Math.ceil(queueRecipientsTotal / 25) || queueLoading
                              }
                              onClick={() => setQueuePage((p) => p + 1)}
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
          )}

          {activeTab === "compose" ? (
            <div className="space-y-6">
              {/* 1. SELETOR DE MODO DE ENVIO */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Modo 1: Atleta Específico */}
                <button
                  type="button"
                  onClick={() => setSendMode("single")}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    sendMode === "single"
                      ? "bg-primary/10 border-primary ring-2 ring-primary/20"
                      : "bg-card border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-primary/15 text-primary">
                      <Users className="w-4 h-4" />
                    </div>
                    {sendMode === "single" && (
                      <span className="text-[11px] font-bold text-primary uppercase">Ativo</span>
                    )}
                  </div>
                  <div className="font-semibold text-sm text-foreground">Atleta Individual</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Envio focado do perfil completo e highlights de um único atleta selecionado.
                  </div>
                </button>

                {/* Modo 2: Multi-atleta (Unificado) */}
                <button
                  type="button"
                  onClick={() => setSendMode("multi")}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    sendMode === "multi"
                      ? "bg-primary/10 border-primary ring-2 ring-primary/20"
                      : "bg-card border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-primary/15 text-primary">
                      <Layers className="w-4 h-4" />
                    </div>
                    {sendMode === "multi" && (
                      <span className="text-[11px] font-bold text-primary uppercase">Ativo</span>
                    )}
                  </div>
                  <div className="font-semibold text-sm text-foreground">
                    Multi-atleta (Showcase Unificado)
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Envia 1 único e-mail por coach com os cartões de todas as atletas selecionadas
                    empilhados.
                  </div>
                </button>

                {/* Modo 3: Catálogo Geral */}
                <button
                  type="button"
                  onClick={() => setSendMode("catalog")}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    sendMode === "catalog"
                      ? "bg-primary/10 border-primary ring-2 ring-primary/20"
                      : "bg-card border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-primary/15 text-primary">
                      <Building2 className="w-4 h-4" />
                    </div>
                    {sendMode === "catalog" && (
                      <span className="text-[11px] font-bold text-primary uppercase">Ativo</span>
                    )}
                  </div>
                  <div className="font-semibold text-sm text-foreground">
                    Catálogo Institucional
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Apresentação da agência com CTA para a vitrine pública do portfólio.
                  </div>
                </button>
              </div>

              {/* 2. CONFIGURAÇÃO DO MODO SELECIONADO */}
              <div className="glass-panel p-4 sm:p-5 space-y-4 rounded-xl border border-border bg-card">
                <div className="space-y-2">
                  <label htmlFor="mailer-subject" className="text-sm font-medium text-foreground">
                    Assunto do e-mail (opcional)
                  </label>
                  <input
                    id="mailer-subject"
                    type="text"
                    maxLength={MAX_CUSTOM_SUBJECT_LENGTH}
                    value={customSubject}
                    onChange={(event) =>
                      setCustomSubject(event.target.value.replace(/[\r\n]+/g, " "))
                    }
                    placeholder="Digite o assunto que o coach receberá"
                    aria-describedby="mailer-subject-help"
                    className="w-full min-h-[44px] px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <p id="mailer-subject-help" className="text-xs text-muted-foreground">
                    Deixe vazio para usar o assunto automático. Até 200 caracteres.
                  </p>
                </div>
                {sendMode === "single" && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Selecione o Atleta Alvo
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                      <select
                        value={selectedAthleteId}
                        onChange={(e) => setSelectedAthleteId(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                      >
                        {athletes.map((ath) => (
                          <option key={ath.id} value={ath.id}>
                            {ath.full_name} ({ath.sport_name || "Geral"} •{" "}
                            {ath.position_name || "Atleta"})
                          </option>
                        ))}
                      </select>

                      {currentSingleAthlete && (
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 border border-border">
                          {currentSingleAthlete.photo_url ? (
                            <img
                              src={currentSingleAthlete.photo_url}
                              alt={currentSingleAthlete.full_name}
                              className="w-10 h-10 rounded-full object-cover border border-border"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                              {currentSingleAthlete.full_name[0]}
                            </div>
                          )}
                          <div className="text-xs">
                            <div className="font-bold text-foreground">
                              {currentSingleAthlete.full_name}
                            </div>
                            <div className="text-muted-foreground">
                              {currentSingleAthlete.sport_name} •{" "}
                              {currentSingleAthlete.position_name || "Atleta"}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Personalização Editorial Single */}
                    <div className="pt-2 border-t border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold uppercase tracking-wider text-foreground">
                          Personalização da Mensagem (Opcional)
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Altera em tempo real o preview e o e-mail real
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">
                            Saudação automática (por coach)
                          </label>
                          <input
                            type="text"
                            placeholder="Hi Coach [sobrenome],"
                            value={buildCoachGreeting(previewLastName)}
                            readOnly
                            aria-label="Saudação automática por sobrenome"
                            className="w-full min-h-[44px] px-3 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">
                            Chamada / Hook
                          </label>
                          <input
                            type="text"
                            placeholder="Explore verified match films & academic records below."
                            value={customHook}
                            onChange={(e) => setCustomHook(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          <p className="text-xs text-muted-foreground">
                            Aparece logo após a saudação, antes dos cards.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">
                          Texto Institucional (Bloco de Final de E-mail)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Go Team Go connects verified international prospects with top US college programs..."
                          value={customIntroduction}
                          onChange={(e) => setCustomIntroduction(e.target.value)}
                          className="w-full p-2.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <p className="text-xs text-muted-foreground">
                          Aparece depois dos cards, antes da assinatura.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {sendMode === "multi" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-foreground">
                          Selecione as Atletas para o E-mail Unificado
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {selectedMultiAthleteIds.size} de {athletes.length} atletas selecionadas
                          (1 atleta por linha em largura total)
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllAthletes}
                          className="text-xs text-primary font-semibold hover:underline cursor-pointer"
                        >
                          Selecionar Todas
                        </button>
                        <span className="text-muted-foreground text-xs">•</span>
                        <button
                          type="button"
                          onClick={deselectAllAthletes}
                          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Desmarcar
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 border border-border rounded-lg bg-background">
                      {athletes.map((ath) => {
                        const isChecked = selectedMultiAthleteIds.has(ath.id);
                        return (
                          <div
                            key={ath.id}
                            onClick={() => toggleMultiAthlete(ath.id)}
                            className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer text-xs transition-colors ${
                              isChecked
                                ? "bg-primary/10 text-foreground border border-primary/30"
                                : "hover:bg-muted/40 text-muted-foreground"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="rounded border-border text-primary focus:ring-primary/40 pointer-events-none"
                            />
                            <div className="truncate flex-1">
                              <span className="font-semibold text-foreground">{ath.full_name}</span>{" "}
                              <span className="text-[11px] text-muted-foreground">
                                ({ath.position_name || ath.sport_name || "Atleta"})
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Personalização Editorial Multi */}
                    <div className="pt-2 border-t border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold uppercase tracking-wider text-foreground">
                          Personalização da Mensagem (Opcional)
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Altera em tempo real o preview e o e-mail real
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">
                            Saudação automática (por coach)
                          </label>
                          <input
                            type="text"
                            placeholder="Hi Coach [sobrenome],"
                            value={buildCoachGreeting(previewLastName)}
                            readOnly
                            aria-label="Saudação automática por sobrenome"
                            className="w-full min-h-[44px] px-3 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">
                            Chamada / Hook
                          </label>
                          <input
                            type="text"
                            placeholder="Explore verified match films & academic records below."
                            value={customHook}
                            onChange={(e) => setCustomHook(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          <p className="text-xs text-muted-foreground">
                            Aparece logo após a saudação, antes dos cards.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">
                          Texto Institucional (Bloco de Final de E-mail)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Go Team Go connects verified international prospects with top US college programs..."
                          value={customIntroduction}
                          onChange={(e) => setCustomIntroduction(e.target.value)}
                          className="w-full p-2.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <p className="text-xs text-muted-foreground">
                          Aparece depois dos cards, antes da assinatura.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {sendMode === "catalog" && (
                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Conteúdo do E-mail Institucional de Apresentação
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">
                          Saudação automática (por coach)
                        </label>
                        <input
                          type="text"
                          placeholder="Hi Coach [sobrenome],"
                          value={buildCoachGreeting(previewLastName)}
                          readOnly
                          aria-label="Saudação automática por sobrenome"
                          className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">
                          Chamada / Hook
                        </label>
                        <input
                          type="text"
                          placeholder="Explore our complete verified athlete roster and match films online."
                          value={customHook}
                          onChange={(e) => setCustomHook(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">
                          Título Principal (Headline)
                        </label>
                        <input
                          type="text"
                          value={catalogHeadline}
                          onChange={(e) => setCatalogHeadline(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">
                          Mensagem Institucional (Bloco de Final de E-mail)
                        </label>
                        <textarea
                          rows={2}
                          value={catalogMessage}
                          onChange={(e) => setCatalogMessage(e.target.value)}
                          className="w-full p-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. GRID DUPLO: DESTINATÁRIOS (COACHES) & PREVIEW WYSIWYG */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* COLUNA ESQUERDA: LISTA DE DESTINATÁRIOS (7 cols) */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="glass-panel p-4 space-y-3 rounded-xl border border-border bg-card">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-primary" />
                        Destinatários (Coaches Universitários)
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <strong className="text-primary">{selectedRecipientKeys.size}</strong>{" "}
                        selecionados ({activeSelectedRecipients.length} ativos
                        {suppressedSelectedCount > 0 && (
                          <span className="text-amber-500 font-semibold">
                            {" "}
                            • {suppressedSelectedCount} pausados/suprimidos
                          </span>
                        )}
                        )
                      </div>
                    </div>

                    {/* FRENTE 2: FILTROS AVANÇADOS COMBINADOS VIA AND */}
                    <div className="space-y-2">
                      {/* Linha 1: Busca Textual + Estado + Liga */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="relative sm:col-span-6">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Buscar coach, universidade, cidade..."
                            value={recipientSearch}
                            onChange={(e) => setRecipientSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background"
                          />
                        </div>
                        <select
                          value={filterState}
                          onChange={(e) => setFilterState(e.target.value)}
                          className="sm:col-span-3 text-xs px-2 py-1.5 rounded-lg border border-border bg-background cursor-pointer"
                        >
                          <option value="all">Estado: Todos</option>
                          {US_STATES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                        <select
                          value={filterLeague}
                          onChange={(e) => setFilterLeague(e.target.value)}
                          className="sm:col-span-3 text-xs px-2 py-1.5 rounded-lg border border-border bg-background cursor-pointer"
                        >
                          <option value="all">Liga: Todas</option>
                          {LEAGUES.map((lg) => (
                            <option key={lg} value={lg}>
                              {lg}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Linha 2: HBCU + Budget Level + TOEFL Level */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <select
                          value={filterHbcu}
                          onChange={(e) => setFilterHbcu(e.target.value)}
                          className="sm:col-span-4 text-xs px-2 py-1.5 rounded-lg border border-border bg-background cursor-pointer"
                        >
                          <option value="all">HBCU: Todas</option>
                          <option value="hbcu">Somente HBCU</option>
                          <option value="non_hbcu">Sem HBCU</option>
                        </select>

                        <div className="sm:col-span-4">
                          <BudgetMultiSelect
                            selected={selectedBudgets}
                            onChange={setSelectedBudgets}
                          />
                        </div>

                        <select
                          value={filterToefl}
                          onChange={(e) => setFilterToefl(e.target.value)}
                          className="sm:col-span-4 text-xs px-2 py-1.5 rounded-lg border border-border bg-background cursor-pointer"
                        >
                          <option value="all">TOEFL: Todos</option>
                          {TOEFL_LEVELS.map((tf) => (
                            <option key={tf} value={tf}>
                              TOEFL: {tf}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Linha 3: Toggle Ocultar Sinais de Interesse */}
                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          <input
                            type="checkbox"
                            checked={filterHideSignaled}
                            onChange={(e) => setFilterHideSignaled(e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary/40"
                          />
                          <span>Ocultar coaches com sinais de interesse ativos</span>
                        </label>
                      </div>
                    </div>

                    {/* Barra de Seleção Rápida */}
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50 text-muted-foreground">
                      <div>
                        Exibindo <strong>{filteredRecipients.length}</strong> coaches
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllFiltered}
                          className="text-primary font-semibold hover:underline cursor-pointer"
                        >
                          Marcar Visíveis (
                          {filteredRecipients.filter((r) => !r.isSuppressed).length})
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={deselectAllFiltered}
                          className="hover:text-foreground cursor-pointer"
                        >
                          Desmarcar Visíveis
                        </button>
                      </div>
                    </div>

                    {/* Lista com Rolagem */}
                    <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
                      {filteredRecipients.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                          Nenhum coach encontrado com os filtros selecionados.
                        </div>
                      ) : (
                        filteredRecipients.map((rec) => {
                          const isChecked = selectedRecipientKeys.has(rec.key);
                          const badges = getCoachBadges(rec);

                          return (
                            <div
                              key={rec.key}
                              onClick={() => toggleRecipient(rec.key)}
                              className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                isChecked
                                  ? rec.isSuppressed
                                    ? "bg-amber-950/20 border-amber-600/40"
                                    : "bg-primary/10 border-primary/40 shadow-xs"
                                  : "bg-card border-border hover:bg-muted/30"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="rounded border-border text-primary focus:ring-primary/40 pointer-events-none"
                                />
                                <div className="min-w-0">
                                  <div className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                                    <span>{rec.name}</span>
                                    {rec.isSuppressed && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-slate-900 dark:text-slate-200 border border-zinc-700">
                                        <ShieldAlert className="w-3 h-3 text-amber-500" />
                                        Opt-out (Pausado)
                                      </span>
                                    )}
                                    {badges &&
                                      badges.map((b, bIdx) => (
                                        <span
                                          key={bIdx}
                                          title={b.tooltip}
                                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${b.color}`}
                                        >
                                          <MessageSquareWarning className="w-2.5 h-2.5 shrink-0" />
                                          {b.label}
                                        </span>
                                      ))}
                                  </div>
                                  <div className="text-muted-foreground truncate">{rec.email}</div>
                                </div>
                              </div>

                              <div className="text-right shrink-0 pl-2">
                                <div className="font-medium text-foreground truncate max-w-[160px]">
                                  {rec.universityName}
                                  {rec.isHbcu && (
                                    <span className="ml-1 text-[10px] text-amber-900 dark:text-amber-200 font-bold">
                                      [HBCU]
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {rec.universityState} {rec.league ? `• ${rec.league}` : ""}
                                  {rec.budgetLevel ? ` • $${rec.budgetLevel}` : ""}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* COLUNA DIREITA: PREVIEW WYSIWYG & DISPARO (5 cols) */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="glass-panel p-4 space-y-3 rounded-xl border border-border bg-card">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Eye className="w-4 h-4 text-primary" />
                        Preview do E-mail
                      </div>
                      <span className="text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                        Go Team Go Official
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground" aria-live="polite">
                      <p>
                        <span className="font-medium text-foreground">Assunto:</span>{" "}
                        {previewEmail.subject || "Selecione uma atleta"}
                      </p>
                      <p>
                        {previewCoach
                          ? `Prévia para ${previewCoach.name}`
                          : "Prévia com Coach Smith (exemplo). A saudação usa o sobrenome de cada destinatário."}
                      </p>
                    </div>

                    {previewIntegrityError && (
                      <div
                        role="alert"
                        className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2"
                      >
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-semibold">Aviso de Integridade do Card</p>
                          <p>{previewIntegrityError}</p>
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-border bg-[#f8faf5] p-1 shadow-inner h-[460px] overflow-hidden">
                      <iframe
                        title="Email Preview"
                        srcDoc={previewEmail.html}
                        className="w-full h-full rounded-lg border-0 bg-[#f8faf5]"
                      />
                    </div>

                    {/* Resumo de Disparo & Botão de Ação */}
                    <div className="pt-2 border-t border-border space-y-3">
                      <div className="bg-muted/40 border border-border rounded-lg p-3 text-xs space-y-1">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Modo:</span>
                          <strong className="text-foreground capitalize">
                            {sendMode === "single"
                              ? "Atleta Individual"
                              : sendMode === "multi"
                                ? "Multi-atleta (Unificado)"
                                : "Catálogo Institucional"}
                          </strong>
                        </div>
                        {sendMode === "multi" && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Atletas no E-mail:</span>
                            <strong className="text-foreground">
                              {selectedMultiAthleteIds.size} atletas empilhadas
                            </strong>
                          </div>
                        )}
                        <div className="flex justify-between text-muted-foreground">
                          <span>Destinatários Ativos:</span>
                          <strong className="text-emerald-500 font-semibold">
                            {activeSelectedRecipients.length} coaches
                          </strong>
                        </div>
                        {suppressedSelectedCount > 0 && (
                          <div className="flex justify-between text-amber-500">
                            <span>Ignorados (Opt-out):</span>
                            <strong>{suppressedSelectedCount} coaches</strong>
                          </div>
                        )}
                        <div className="flex justify-between text-muted-foreground pt-1 border-t border-border/40 font-semibold">
                          <span>Total de E-mails a Disparar:</span>
                          <span className="text-foreground">
                            {totalCalculatedDispatches}{" "}
                            {totalCalculatedDispatches === 1 ? "e-mail" : "e-mails"}
                          </span>
                        </div>
                      </div>

                      {emailAthletesPanelState !== "ready" && (
                        <div
                          role={emailAthletesPanelState === "loading" ? "status" : "alert"}
                          className={`rounded-lg border p-3 text-sm text-foreground space-y-2 ${
                            emailAthletesPanelState === "loading" ||
                            emailAthletesPanelState === "empty"
                              ? "border-border bg-muted/40"
                              : "border-destructive/60 bg-destructive/10"
                          }`}
                        >
                          <p className="font-semibold">
                            {ATHLETE_EMAIL_STATE_MESSAGES[emailAthletesPanelState]}
                          </p>
                          {emailAthletesPanelState === "error" && (
                            <>
                              <p>
                                O carregamento falhou. Tente novamente para validar as fichas antes
                                do envio.
                              </p>
                              <details className="text-xs text-foreground break-words">
                                <summary className="cursor-pointer underline">
                                  Detalhes técnicos
                                </summary>
                                <p className="mt-2">
                                  {emailAthletesError ||
                                    "A resposta não incluiu todas as atletas selecionadas."}
                                </p>
                              </details>
                              <button
                                type="button"
                                onClick={retryEmailAthletes}
                                disabled={emailAthletesLoading}
                                className="min-h-[44px] rounded-md border border-border bg-background px-3 py-2 font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                              >
                                Tentar novamente
                              </button>
                            </>
                          )}
                          {emailAthletesPanelState === "missing" &&
                            missingAthleteFields.map((entry) => (
                              <p key={entry.athleteId}>
                                <a
                                  className="underline font-semibold"
                                  href={`/admin/athletes/${encodeURIComponent(entry.athleteId)}`}
                                >
                                  {entry.athleteName}
                                </a>
                                : {entry.fields.join(" / ")}
                              </p>
                            ))}
                        </div>
                      )}
                      {sendMode === "multi" &&
                        emailAthletesReady &&
                        previewSizeBytes > 90 * 1024 && (
                          <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
                            Aviso: HTML estimado em {(previewSizeBytes / 1024).toFixed(1)} KB. O
                            Gmail pode cortar e-mails acima de ~102 KB.
                          </p>
                        )}
                      <button
                        type="button"
                        disabled={
                          !emailAthletesReady ||
                          missingAthleteFields.length > 0 ||
                          activeSelectedRecipients.length === 0 ||
                          (sendMode === "multi" && selectedMultiAthleteIds.size === 0) ||
                          Boolean(previewIntegrityError)
                        }
                        onClick={() => setConfirmModalOpen(true)}
                        className="w-full py-2.5 px-4 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-bold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        Disparar Mailer ({totalCalculatedDispatches})
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "history" ? (
            /* ABA HISTÓRICO DE DISPAROS PAGINADO COM SNAPSHOT */
            <MailerHistorySection onViewTimeline={handleViewTimeline} />
          ) : (
            /* ABA MÉTRICAS ANALÍTICAS */
            <MailerMetricsDashboard athletes={athletes} onRefreshHistory={loadInitialData} />
          )}
        </div>

        {/* MODAL DE TIMELINE DE EVENTOS DO E-MAIL */}
        {selectedTimelineLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-full bg-primary/10 text-primary">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">Email Event Timeline</h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedTimelineLog.recipient_name || "Coach"} (
                      {selectedTimelineLog.recipient_email})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTimelineLog(null)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="bg-muted/30 border border-border rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subject:</span>
                  <span className="font-medium text-foreground truncate max-w-xs">
                    {selectedTimelineLog.subject}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dispatched At:</span>
                  <span className="text-foreground">
                    {new Date(selectedTimelineLog.sent_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                {selectedTimelineLog.provider_id && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Resend Email ID:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-200">
                      {selectedTimelineLog.provider_id}
                    </span>
                  </div>
                )}
              </div>

              {/* Timeline Sequence */}
              <div className="space-y-2 pt-1 max-h-64 overflow-y-auto pr-1">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Lifecycle Events
                </h4>

                {loadingTimeline ? (
                  <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Loading event lifecycle...
                  </div>
                ) : timelineEvents.length === 0 ? (
                  <div className="py-6 px-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground space-y-1">
                    <Clock className="w-5 h-5 mx-auto text-zinc-500 mb-1" />
                    <div className="font-medium text-foreground">Dispatched to Resend</div>
                    <p className="text-[11px]">
                      Awaiting delivery receipts and webhook event synchronization.
                    </p>
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                    {timelineEvents.map((evt) => (
                      <div key={evt.id} className="relative text-xs">
                        <div
                          className={`absolute -left-[1.35rem] top-0.5 w-3 h-3 rounded-full border-2 border-card ${
                            evt.eventType === "delivered"
                              ? "bg-emerald-500"
                              : evt.eventType === "opened"
                                ? "bg-amber-500"
                                : evt.eventType === "clicked"
                                  ? "bg-sky-500"
                                  : evt.eventType === "bounced"
                                    ? "bg-red-500"
                                    : "bg-primary"
                          }`}
                        />
                        <div className="flex items-center justify-between font-semibold capitalize text-foreground">
                          <span>{evt.eventType}</span>
                          <span className="text-[10px] text-muted-foreground font-normal">
                            {new Date(evt.occurredAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                        </div>
                        {evt.details && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {evt.details}
                          </div>
                        )}
                        {evt.clickedLink && (
                          <div className="text-[11px] text-sky-900 dark:text-sky-200 truncate max-w-sm mt-0.5">
                            Link: {evt.clickedLink}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTimelineLog(null)}
                  className={buttonClass}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE CONFIRMAÇÃO DO DISPARO */}
        {confirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-primary/10 text-primary">
                  <Send className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Confirmar Disparo de Mailer</h3>
                  <p className="text-xs text-muted-foreground">
                    Revise o resumo antes de iniciar o envio.
                  </p>
                </div>
              </div>

              <div className="bg-muted/40 border border-border rounded-xl p-3.5 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Modo:</span>
                  <span className="font-bold text-foreground capitalize">
                    {sendMode === "single"
                      ? "Atleta Individual"
                      : sendMode === "multi"
                        ? "Multi-atleta (Unificado)"
                        : "Catálogo Institucional"}
                  </span>
                </div>
                {sendMode === "single" && currentSingleAthlete && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Atleta:</span>
                    <span className="font-bold text-foreground">
                      {currentSingleAthlete.full_name}
                    </span>
                  </div>
                )}
                {sendMode === "multi" && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Atletas Selecionadas:</span>
                    <span className="font-bold text-foreground">
                      {selectedMultiAthleteIds.size} atletas (empilhadas em 1 e-mail)
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Destinatários Ativos:</span>
                  <span className="font-bold text-emerald-500">
                    {activeSelectedRecipients.length} coaches
                  </span>
                </div>
                {suppressedSelectedCount > 0 && (
                  <div className="flex justify-between text-amber-500 font-medium">
                    <span>Bloqueados por Descadastro:</span>
                    <span>{suppressedSelectedCount} (serão pulados)</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assunto:</span>
                  <span
                    className="font-semibold text-foreground truncate max-w-[220px]"
                    title={previewEmail.subject}
                  >
                    {previewEmail.subject || "(Padrão)"}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border/40 font-bold">
                  <span>Total de E-mails a Disparar:</span>
                  <span className="text-primary text-sm">{totalCalculatedDispatches}</span>
                </div>
              </div>

              {previewIntegrityError && (
                <div
                  role="alert"
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
                >
                  <p className="font-semibold">Envio bloqueado por integridade:</p>
                  <p>{previewIntegrityError}</p>
                </div>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed">
                Cada e-mail incluirá automaticamente o rodapé com link de feedback de interesse e
                descadastro (unsubscribe) em conformidade.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => setConfirmModalOpen(false)}
                  className={secondaryButtonClass}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={
                    isSending ||
                    !emailAthletesReady ||
                    missingAthleteFields.length > 0 ||
                    Boolean(previewIntegrityError)
                  }
                  onClick={handleSendMailer}
                  className={buttonClass}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Disparando...
                    </>
                  ) : (
                    "Confirmar e Enviar"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE RECONCILIAÇÃO DE INCIDENTE DA FILA */}
        {reconcileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Reconciliar Incidente de Quarentena</h3>
                  <p className="text-xs text-muted-foreground">
                    Desbloqueie a campanha após auditar os disparos no Resend.
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Ação de Resolução:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setReconcileResolution("marked_sent")}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${
                        reconcileResolution === "marked_sent"
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 font-bold"
                          : "border-border bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <div>Marcar Enviado</div>
                      <div className="text-[10px] font-normal opacity-80 mt-0.5">
                        E-mail aceito pelo Resend Dashboard
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReconcileResolution("marked_failed")}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${
                        reconcileResolution === "marked_failed"
                          ? "border-rose-500 bg-rose-500/10 text-rose-950 dark:text-rose-200 font-bold"
                          : "border-border bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <div>Marcar Falha</div>
                      <div className="text-[10px] font-normal opacity-80 mt-0.5">
                        Não entregue, não reenviar automaticamente
                      </div>
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">
                    Justificativa Administrativa (Obrigatória, mín. 5 caracteres):
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Ex: Verificado no Resend Dashboard que o lote anterior foi entregue com sucesso aos destinatários."
                    value={reconcileNotes}
                    onChange={(e) => setReconcileNotes(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-border bg-background text-xs focus:ring-2 focus:ring-primary/40 focus:outline-none"
                  />
                  <div className="text-[10px] text-muted-foreground text-right">
                    {reconcileNotes.trim().length} / 5 caracteres mínimos
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isReconciling}
                  onClick={() => setReconcileModalOpen(false)}
                  className={secondaryButtonClass}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isReconciling || reconcileNotes.trim().length < 5}
                  onClick={handleReconcileIncident}
                  className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
                >
                  {isReconciling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Reconciliando...
                    </>
                  ) : (
                    "Autorizar e Desbloquear Fila"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </ProtectedPage>
  );
}

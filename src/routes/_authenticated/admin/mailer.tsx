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
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { buttonClass, secondaryButtonClass } from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
import {
  sendMailerServerFn,
  getSuppressedEmailsServerFn,
  getMailerHistoryServerFn,
  getActiveInterestSignalsServerFn,
} from "@/lib/email/recruit-email.functions";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail,
  type RecruitEmailData,
} from "@/lib/email/recruit-email-template";
import { renderCatalogEmail } from "@/lib/email/recruit-email-catalog-template";
import type {
  University,
  UniversityCoach,
  RecruitEmailLog,
  UniversityLeague,
  UniversityBudgetLevel,
  UniversityToeflLevel,
  CoachInterestSignal,
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
}

interface RecipientItem {
  key: string;
  coachId?: string;
  name: string;
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
  const [activeTab, setActiveTab] = useState<"compose" | "history">("compose");

  // Modo de Envio: single | multi | catalog
  const [sendMode, setSendMode] = useState<"single" | "multi" | "catalog">(
    searchParams.mode || "single",
  );

  // Dados do Banco
  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [suppressedEmails, setSuppressedEmails] = useState<Set<string>>(new Set());
  const [interestSignals, setInterestSignals] = useState<CoachInterestSignal[]>([]);
  const [historyLogs, setHistoryLogs] = useState<RecruitEmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Seleções
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(searchParams.athleteId || "");
  const [selectedMultiAthleteIds, setSelectedMultiAthleteIds] = useState<Set<string>>(
    new Set(searchParams.athleteId ? [searchParams.athleteId] : []),
  );
  const [selectedRecipientKeys, setSelectedRecipientKeys] = useState<Set<string>>(new Set());

  // Opções do Catálogo
  const [catalogHeadline, setCatalogHeadline] = useState(
    "Discover Verified International Recruits Ready for College Athletics",
  );
  const [catalogMessage, setCatalogMessage] = useState(
    "At Go Team Go Agency, we represent top-tier international student-athletes actively seeking competitive collegiate programs in the US. Each prospect in our portfolio undergoes rigorous athletic screening, academic credential verification, and highlight reel curation.",
  );

  // Filtros de Destinatários
  const [recipientSearch, setRecipientSearch] = useState("");
  const [filterState, setFilterState] = useState("all");
  const [filterLeague, setFilterLeague] = useState("all");
  const [filterHbcu, setFilterHbcu] = useState("all");
  const [filterBudget, setFilterBudget] = useState("all");
  const [filterToefl, setFilterToefl] = useState("all");
  const [filterHideSignaled, setFilterHideSignaled] = useState(false);

  // Modal de Confirmação & Estado de Envio
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Carregar dados iniciais
  async function loadInitialData() {
    setLoading(true);
    try {
      const [athletesRes, uniRes, suppressedRes, historyRes, signalsRes] = await Promise.all([
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
            profile:athlete_profiles(gpa, athlete_status, graduation_year, high_school_graduation, highlight_note)
          `,
          )
          .eq("is_public", true)
          .is("deleted_at", null)
          .order("full_name", { ascending: true }),
        supabase.from("universities").select("*").order("name", { ascending: true }),
        getSuppressedEmailsServerFn().catch(() => []),
        getMailerHistoryServerFn().catch(() => []),
        getActiveInterestSignalsServerFn().catch(() => []),
      ]);

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
      if (filterHbcu === "non_hbcu" && item.isHbcu) return false;
      if (filterBudget !== "all" && item.budgetLevel !== filterBudget) return false;
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
    filterBudget,
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

  // Gera HTML de Preview dinâmico
  const previewHtml = useMemo(() => {
    if (sendMode === "catalog") {
      const { html } = renderCatalogEmail({
        coachName: "Coach Smith",
        institutionName: "University Showcase",
        customHeadline: catalogHeadline,
        customMessage: catalogMessage,
        recipientEmail: "coach@example.edu",
      });
      return html;
    }

    if (sendMode === "multi") {
      const targets =
        selectedMultiAthletesList.length > 0 ? selectedMultiAthletesList : athletes.slice(0, 2);

      if (targets.length === 0) {
        return "<p style='font-family:sans-serif;padding:20px;text-align:center;'>Selecione ao menos um atleta para visualizar o preview.</p>";
      }

      const athletesData: RecruitEmailData[] = targets.map((ath) => ({
        athleteId: ath.id,
        athleteName: ath.full_name,
        athleteSlug: ath.slug,
        photoUrl: ath.photo_url,
        positionName: ath.position_name,
        sportName: ath.sport_name,
        heightCm: ath.height_cm,
        nationality: ath.nationality,
        countryFlag: ath.country_flag,
        highSchoolGraduation: ath.high_school_graduation,
        graduationYear: ath.graduation_year,
        gpa: ath.gpa,
        athleteStatus: ath.athlete_status,
        highlightNote: ath.highlight_note,
        recipientEmail: "coach@example.edu",
      }));

      const { html } = renderMultiAthleteRecruitEmail({
        athletes: athletesData,
        coachName: "Smith",
        institutionName: "University Athletics",
        recipientEmail: "coach@example.edu",
      });
      return html;
    }

    // single mode
    if (!currentSingleAthlete) {
      return "<p style='font-family:sans-serif;padding:20px;text-align:center;'>Nenhum atleta selecionado.</p>";
    }

    const { html } = renderRecruitEmail({
      athleteId: currentSingleAthlete.id,
      athleteName: currentSingleAthlete.full_name,
      athleteSlug: currentSingleAthlete.slug,
      photoUrl: currentSingleAthlete.photo_url,
      positionName: currentSingleAthlete.position_name,
      sportName: currentSingleAthlete.sport_name,
      heightCm: currentSingleAthlete.height_cm,
      nationality: currentSingleAthlete.nationality,
      countryFlag: currentSingleAthlete.country_flag,
      highSchoolGraduation: currentSingleAthlete.high_school_graduation,
      graduationYear: currentSingleAthlete.graduation_year,
      gpa: currentSingleAthlete.gpa,
      athleteStatus: currentSingleAthlete.athlete_status,
      highlightNote: currentSingleAthlete.highlight_note,
      recipientEmail: "coach@example.edu",
    });
    return html;
  }, [
    sendMode,
    currentSingleAthlete,
    selectedMultiAthletesList,
    athletes,
    catalogHeadline,
    catalogMessage,
  ]);

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
    if (activeSelectedRecipients.length === 0) {
      toast.error("Nenhum destinatário ativo selecionado.");
      return;
    }

    let targetAthleteIds: string[] = [];
    if (sendMode === "single") {
      if (!selectedAthleteId) {
        toast.error("Selecione um atleta.");
        return;
      }
      targetAthleteIds = [selectedAthleteId];
    } else if (sendMode === "multi") {
      if (selectedMultiAthleteIds.size === 0) {
        toast.error("Selecione ao menos um atleta.");
        return;
      }
      targetAthleteIds = Array.from(selectedMultiAthleteIds);
    }

    setIsSending(true);

    try {
      const payloadRecipients = selectedRecipientsList.map((r) => ({
        coachId: r.coachId,
        name: r.name,
        email: r.email,
        universityName: r.universityName,
      }));

      const res = await sendMailerServerFn({
        data: {
          mode:
            sendMode === "single"
              ? "single_athlete"
              : sendMode === "multi"
                ? "multi_athlete"
                : "catalog",
          athleteIds: targetAthleteIds,
          recipients: payloadRecipients,
          catalogOptions: {
            customHeadline: catalogHeadline,
            customMessage: catalogMessage,
          },
        },
      });

      if (res.success) {
        toast.success(`Disparo concluído! ${res.totalSent} e-mails enviados com sucesso.`);
        if (res.totalSuppressed > 0) {
          toast.info(
            `${res.totalSuppressed} contatos foram ignorados por estarem na lista de descadastro (unsubscribed/pausados).`,
          );
        }
        setConfirmModalOpen(false);
        // Atualizar histórico
        const updatedLogs = await getMailerHistoryServerFn().catch(() => []);
        setHistoryLogs((updatedLogs as RecruitEmailLog[]) || []);
      } else {
        toast.error(res.message || "Falha no envio de e-mails.");
        if (res.errors && res.errors.length > 0) {
          console.error("Errors:", res.errors);
        }
      }
    } catch (err) {
      console.error("[mailer] Exception sending emails:", err);
      toast.error("Erro inesperado ao processar disparo de e-mails.");
    } finally {
      setIsSending(false);
    }
  }

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
            </div>

            {/* Abas Superiores: Enviar / Histórico */}
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
                Criar Envio
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
                Histórico ({historyLogs.length})
              </button>
            </div>
          </div>

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
                          (serão empilhadas em 1 único e-mail por coach)
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
                  </div>
                )}

                {sendMode === "catalog" && (
                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Conteúdo do E-mail Institucional de Apresentação
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
                          Mensagem Institucional / Apresentação
                        </label>
                        <textarea
                          rows={3}
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

                        <select
                          value={filterBudget}
                          onChange={(e) => setFilterBudget(e.target.value)}
                          className="sm:col-span-4 text-xs px-2 py-1.5 rounded-lg border border-border bg-background cursor-pointer"
                        >
                          <option value="all">Budget: Todos</option>
                          {BUDGET_LEVELS.map((bg) => (
                            <option key={bg} value={bg}>
                              Budget: ${bg}
                            </option>
                          ))}
                        </select>

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
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
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
                                    <span className="ml-1 text-[10px] text-amber-400 font-bold">
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

                    <div className="rounded-xl border border-border bg-[#f8faf5] p-1 shadow-inner h-[460px] overflow-hidden">
                      <iframe
                        title="Email Preview"
                        srcDoc={previewHtml}
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

                      <button
                        type="button"
                        disabled={
                          activeSelectedRecipients.length === 0 ||
                          (sendMode === "multi" && selectedMultiAthleteIds.size === 0)
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
          ) : (
            /* ABA HISTÓRICO DE DISPAROS */
            <div className="space-y-4">
              <div className="glass-panel p-4 flex items-center justify-between rounded-xl border border-border bg-card">
                <div>
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" />
                    Histórico Geral de Envios
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Auditoria de todos os e-mails disparados aos treinadores, incluindo status de
                    entrega e bloqueios de descadastro.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const logs = await getMailerHistoryServerFn().catch(() => []);
                    setHistoryLogs((logs as RecruitEmailLog[]) || []);
                    toast.success("Histórico atualizado.");
                  }}
                  className="text-xs text-primary font-semibold hover:underline cursor-pointer"
                >
                  Atualizar Lista
                </button>
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
                      <tr>
                        <th className="p-3">Destinatário</th>
                        <th className="p-3">Universidade</th>
                        <th className="p-3">Tipo de E-mail</th>
                        <th className="p-3">Assunto</th>
                        <th className="p-3">Data/Hora</th>
                        <th className="p-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {historyLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-muted-foreground">
                            Nenhum registro de envio encontrado no log.
                          </td>
                        </tr>
                      ) : (
                        historyLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-muted/20">
                            <td className="p-3">
                              <div className="font-semibold text-foreground">
                                {log.recipient_name || "Coach"}
                              </div>
                              <div className="text-muted-foreground">
                                {log.recipient_email || "E-mail indisponível"}
                              </div>
                            </td>
                            <td className="p-3 text-foreground font-medium">
                              {log.university_name || "—"}
                            </td>
                            <td className="p-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-foreground">
                                {log.email_type === "catalog_general"
                                  ? "Catálogo Geral"
                                  : log.email_type === "athlete_teaser_multi"
                                    ? "Multi-Atleta (Unificado)"
                                    : "Teaser Atleta"}
                              </span>
                            </td>
                            <td className="p-3 text-muted-foreground max-w-xs truncate">
                              {log.subject}
                            </td>
                            <td className="p-3 text-muted-foreground whitespace-nowrap">
                              {new Date(log.sent_at).toLocaleString("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </td>
                            <td className="p-3 text-right">
                              {log.status === "sent" ? (
                                <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Enviado
                                </span>
                              ) : log.status === "suppressed" ? (
                                <span
                                  className="inline-flex items-center gap-1 text-zinc-400 font-semibold"
                                  title="Ignorado por descadastro (Suppressed)"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                                  Suprimido
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-destructive font-semibold"
                                  title={log.error_message || "Falha no envio"}
                                >
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  Falhou
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

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
                <div className="flex justify-between pt-1 border-t border-border/40 font-bold">
                  <span>Total de E-mails a Disparar:</span>
                  <span className="text-primary text-sm">{totalCalculatedDispatches}</span>
                </div>
              </div>

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
                  disabled={isSending}
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
      </AppShell>
    </ProtectedPage>
  );
}

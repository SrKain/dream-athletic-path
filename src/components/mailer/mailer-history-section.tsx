import React, { useEffect, useState } from "react";
import {
  History,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Activity,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Building2,
  DollarSign,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { getPaginatedMailerHistoryServerFn } from "@/lib/email/recruit-email.functions";
import type { MailerHistoryItem } from "@/lib/email/mailer-history.server";
import { LEAGUES, US_STATES, BUDGET_LEVELS } from "@/lib/universities-constants";
import { inputClass } from "@/components/admin-ui";

export interface MailerHistorySectionProps {
  onViewTimeline: (log: {
    id: string;
    recipient_name?: string | null;
    recipient_email?: string | null;
    subject: string;
    sent_at: string;
    provider_id?: string | null;
  }) => void;
}

export function MailerHistorySection({ onViewTimeline }: MailerHistorySectionProps) {
  const [logs, setLogs] = useState<MailerHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [state, setState] = useState("all");
  const [league, setLeague] = useState("all");
  const [budgetLevel, setBudgetLevel] = useState("all");

  async function loadHistory() {
    setLoading(true);
    try {
      const res = await getPaginatedMailerHistoryServerFn({
        data: {
          page,
          pageSize,
          search: search.trim() || undefined,
          status: status !== "all" ? status : undefined,
          state: state !== "all" ? state : undefined,
          league: league !== "all" ? league : undefined,
          budgetLevel: budgetLevel !== "all" ? budgetLevel : undefined,
        },
      });

      if (res) {
        setLogs(res.items || []);
        setTotal(res.total || 0);
      }
    } catch (err) {
      console.error("[mailer-history] Error loading history:", err);
      toast.error("Erro ao carregar histórico de envios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, [page, pageSize, status, state, league, budgetLevel]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      void loadHistory();
    }, 350);

    return () => clearTimeout(handler);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Header & Refresh */}
      <div className="glass-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Histórico Completo de Disparos
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Auditoria de todas as mensagens com paginação no servidor, características importadas e
            status de entrega.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadHistory();
            toast.success("Histórico atualizado.");
          }}
          className="text-xs text-primary font-semibold hover:underline cursor-pointer self-start sm:self-auto"
        >
          Atualizar Lista
        </button>
      </div>

      {/* Filters Bar */}
      <div className="glass-panel p-3.5 space-y-2.5 rounded-xl border border-border bg-card text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          {/* Search input */}
          <div className="relative sm:col-span-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por coach, email, universidade ou assunto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} pl-8 py-1.5 text-xs`}
            />
          </div>

          {/* Status */}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="sm:col-span-2 text-xs px-2 py-1.5 rounded-lg border border-border bg-background cursor-pointer"
          >
            <option value="all">Status: Todos</option>
            <option value="sent">Enviados</option>
            <option value="failed">Falhas</option>
            <option value="suppressed">Suprimidos</option>
          </select>

          {/* Estado */}
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(1);
            }}
            className="sm:col-span-2 text-xs px-2 py-1.5 rounded-lg border border-border bg-background cursor-pointer"
          >
            <option value="all">Estado: Todos</option>
            {US_STATES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Liga */}
          <select
            value={league}
            onChange={(e) => {
              setLeague(e.target.value);
              setPage(1);
            }}
            className="sm:col-span-2 text-xs px-2 py-1.5 rounded-lg border border-border bg-background cursor-pointer"
          >
            <option value="all">Liga: Todas</option>
            {LEAGUES.map((lg) => (
              <option key={lg} value={lg}>
                {lg}
              </option>
            ))}
          </select>

          {/* Budget */}
          <select
            value={budgetLevel}
            onChange={(e) => {
              setBudgetLevel(e.target.value);
              setPage(1);
            }}
            className="sm:col-span-2 text-xs px-2 py-1.5 rounded-lg border border-border bg-background cursor-pointer"
          >
            <option value="all">Budget: Todos</option>
            {BUDGET_LEVELS.map((bg) => (
              <option key={bg} value={bg}>
                ${bg}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-muted-foreground font-mono">
            Mostrando {startIdx}–{endIdx} de {total} registros
          </div>

          {(search ||
            status !== "all" ||
            state !== "all" ||
            league !== "all" ||
            budgetLevel !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setState("all");
                setLeague("all");
                setBudgetLevel("all");
                setPage(1);
              }}
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Destinatário</th>
                <th className="p-3">Universidade</th>
                <th className="p-3">Características Importadas</th>
                <th className="p-3">Tipo / Assunto</th>
                <th className="p-3">Data/Hora</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Carregando histórico paginado...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Nenhum registro encontrado no histórico para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const char = log.importedCharacteristics;
                  return (
                    <tr key={log.id} className="hover:bg-muted/20">
                      <td className="p-3">
                        <div className="font-semibold text-foreground">
                          {log.recipientName || "Coach"}
                        </div>
                        <div className="text-muted-foreground font-mono text-[11px] select-all">
                          {log.recipientEmail}
                        </div>
                      </td>
                      <td className="p-3 text-foreground font-medium">
                        {log.universityName || "—"}
                      </td>
                      <td className="p-3 text-[11px]">
                        <div className="space-y-0.5">
                          {char.provenance === "unavailable" ? (
                            <span className="text-neutral-400 italic">Não disponível</span>
                          ) : (
                            <>
                              <div className="text-neutral-700 dark:text-neutral-300">
                                <span className="font-mono">{char.state || "—"}</span>
                                {char.league && <span> · {char.league}</span>}
                                {char.budgetLevel && <span> · ${char.budgetLevel}</span>}
                              </div>
                              <div className="text-[10px] text-neutral-400 font-sans">
                                ({char.provenanceLabel})
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-foreground mb-1">
                          {log.emailType === "catalog_general"
                            ? "Catálogo Geral"
                            : log.emailType === "athlete_teaser_multi"
                              ? "Multi-Atleta"
                              : "Teaser Atleta"}
                        </span>
                        <div className="text-muted-foreground max-w-xs truncate">{log.subject}</div>
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                        {new Date(log.sentAt).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="p-3">
                        {log.status === "sent" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Enviado
                          </span>
                        ) : log.status === "suppressed" ? (
                          <span
                            className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-semibold"
                            title="Ignorado por descadastro ou pausa"
                          >
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                            Suprimido
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-rose-600 font-semibold"
                            title={log.errorMessage || "Falha"}
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            Falhou
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            onViewTimeline({
                              id: log.id,
                              recipient_name: log.recipientName,
                              recipient_email: log.recipientEmail,
                              subject: log.subject,
                              sent_at: log.sentAt,
                              provider_id: log.providerId,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-muted hover:bg-muted/80 text-foreground transition-all cursor-pointer"
                          title="Ver linha do tempo de eventos deste e-mail"
                        >
                          <Activity className="w-3 h-3 text-primary" />
                          Timeline
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs pt-2">
        <div className="flex items-center gap-2 text-neutral-500">
          <span>Itens por página:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value) as 25 | 50 | 100);
              setPage(1);
            }}
            className="p-1 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 cursor-pointer"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="font-mono">
            Página {currentPage} de {totalPages}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="p-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 disabled:opacity-40 hover:bg-neutral-50 cursor-pointer"
            title="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={currentPage >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="p-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 disabled:opacity-40 hover:bg-neutral-50 cursor-pointer"
            title="Próxima página"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

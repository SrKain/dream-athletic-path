import React, { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Mail,
  Phone,
  Building2,
  Calendar,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  XCircle,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getCoachPreferencesServerFn,
  addCoachPreferenceSignalServerFn,
  closeCoachPreferenceSignalServerFn,
  setCoachSuppressionServerFn,
  removeManualCoachSuppressionServerFn,
  getEmailEventTimelineServerFn,
} from "@/lib/email/recruit-email.functions";
import type {
  CoachInterestSignal,
  EmailSuppression,
  InterestSignalReason,
  SuppressionType,
} from "@/types/db";
import type { EmailTimelineItem } from "@/lib/email/mailer-metrics.server";
import { buttonClass, secondaryButtonClass, inputClass } from "@/components/admin-ui";

const REASONS: Record<InterestSignalReason, string> = {
  position_not_needed: "Posição já preenchida",
  fully_recruited: "Elenco já completo para o ciclo",
  other_positions_only: "Buscando apenas outras posições",
  specific_athlete_dislike: "Atleta específico não tem o perfil",
};

export interface CoachProfileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coach: {
    id: string;
    first_name?: string;
    last_name?: string;
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string | null;
    role?: string | null;
    universityId: string;
    universityName: string;
    universityState?: string;
    universityLeague?: string | null;
  } | null;
  onUpdated?: () => void;
}

export function CoachProfileDrawer({
  open,
  onOpenChange,
  coach,
  onUpdated,
}: CoachProfileDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<CoachInterestSignal[]>([]);
  const [suppression, setSuppression] = useState<EmailSuppression | null>(null);
  const [timeline, setTimeline] = useState<EmailTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Formulário de adição de preferência manual
  const [addingSignal, setAddingSignal] = useState(false);
  const [signalReason, setSignalReason] = useState<InterestSignalReason>("position_not_needed");
  const [signalPosition, setSignalPosition] = useState("");
  const [signalNotes, setSignalNotes] = useState("");
  const [savingSignal, setSavingSignal] = useState(false);

  const coachName = coach
    ? `${coach.first_name || coach.firstName || ""} ${coach.last_name || coach.lastName || ""}`.trim() ||
      coach.email
    : "";

  useEffect(() => {
    if (!open || !coach?.email) {
      setSignals([]);
      setSuppression(null);
      setTimeline([]);
      return;
    }

    let isCancelled = false;
    async function loadData() {
      if (!coach) return;
      setLoading(true);
      try {
        const prefRes = await getCoachPreferencesServerFn({
          data: { coachEmail: coach.email, coachId: coach.id },
        });
        if (!isCancelled && prefRes) {
          setSignals(prefRes.signals || []);
          setSuppression(prefRes.suppression || null);
        }
      } catch (err) {
        console.error("[coach-profile] Error loading preferences:", err);
      } finally {
        if (!isCancelled) setLoading(false);
      }

      setTimelineLoading(true);
      try {
        const timelineRes = await getEmailEventTimelineServerFn({
          data: { recipientEmail: coach.email },
        });
        if (!isCancelled && Array.isArray(timelineRes)) {
          setTimeline(timelineRes);
        }
      } catch (err) {
        console.error("[coach-profile] Error loading timeline:", err);
      } finally {
        if (!isCancelled) setTimelineLoading(false);
      }
    }

    void loadData();

    return () => {
      isCancelled = true;
    };
  }, [open, coach]);

  async function handleAddSignal(e: React.FormEvent) {
    e.preventDefault();
    if (!coach?.email) return;

    setSavingSignal(true);
    try {
      const res = await addCoachPreferenceSignalServerFn({
        data: {
          coachId: coach.id,
          coachEmail: coach.email,
          reason: signalReason,
          position: signalPosition.trim() || undefined,
          notes: signalNotes.trim() || undefined,
        },
      });

      if (res?.success) {
        toast.success("Sinal de preferência adicionado com sucesso.");
        setAddingSignal(false);
        setSignalPosition("");
        setSignalNotes("");
        // Recarregar
        const updated = await getCoachPreferencesServerFn({
          data: { coachEmail: coach.email, coachId: coach.id },
        });
        if (updated) {
          setSignals(updated.signals || []);
          setSuppression(updated.suppression || null);
        }
        onUpdated?.();
      } else {
        toast.error(res?.message || "Erro ao adicionar preferência.");
      }
    } catch (err) {
      toast.error("Erro inesperado ao salvar preferência.");
    } finally {
      setSavingSignal(false);
    }
  }

  async function handleCloseSignal(signalId: string) {
    if (!coach?.email) return;
    try {
      const res = await closeCoachPreferenceSignalServerFn({
        data: { id: signalId, coachEmail: coach.email, coachId: coach.id },
      });
      if (res?.success) {
        toast.success("Preferência encerrada.");
        const updated = await getCoachPreferencesServerFn({
          data: { coachEmail: coach.email, coachId: coach.id },
        });
        if (updated) {
          setSignals(updated.signals || []);
          setSuppression(updated.suppression || null);
        }
        onUpdated?.();
      } else {
        toast.error(res?.message || "Erro ao encerrar preferência.");
      }
    } catch {
      toast.error("Erro inesperado.");
    }
  }

  async function handleToggleSuppression(type: SuppressionType | "remove") {
    if (!coach?.email) return;
    try {
      if (type === "remove") {
        const res = await removeManualCoachSuppressionServerFn({
          data: { email: coach.email },
        });
        if (res?.success) {
          toast.success("Bloqueio de comunicação removido.");
        } else {
          toast.error(res?.message || "Não foi possível remover o bloqueio.");
        }
      } else {
        const res = await setCoachSuppressionServerFn({
          data: { email: coach.email, suppressionType: type },
        });
        if (res?.success) {
          toast.success(
            `Comunicação configurada como: ${type === "temporary_6m" ? "Pausa de 6 meses" : "Bloqueio permanente"}`,
          );
        } else {
          toast.error(res?.message || "Não foi possível atualizar o bloqueio.");
        }
      }
      const updated = await getCoachPreferencesServerFn({
        data: { coachEmail: coach.email, coachId: coach.id },
      });
      if (updated) {
        setSignals(updated.signals || []);
        setSuppression(updated.suppression || null);
      }
      onUpdated?.();
    } catch {
      toast.error("Erro inesperado ao atualizar status de supressão.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto p-6 bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800"
      >
        <SheetHeader className="pb-4 border-b border-neutral-100 dark:border-neutral-800">
          <SheetTitle className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            {coachName}
          </SheetTitle>
          <SheetDescription className="text-sm text-neutral-500 dark:text-neutral-400">
            {coach?.role || "Técnico Universitário"} · {coach?.universityName}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-neutral-400">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">Carregando perfil e histórico do treinador...</p>
          </div>
        ) : (
          <div className="space-y-6 pt-4">
            {/* Bloco 1: Contato e Afiliação */}
            <div className="rounded-lg p-4 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-700/80 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Informações de Contato
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                  <Mail className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="font-mono text-xs select-all truncate">{coach?.email}</span>
                </div>
                {coach?.phone && (
                  <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                    <Phone className="w-4 h-4 text-neutral-400 shrink-0" />
                    <span className="font-mono text-xs">{coach.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300 col-span-full">
                  <Building2 className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span>
                    {coach?.universityName}{" "}
                    {coach?.universityState ? `(${coach.universityState})` : ""}
                    {coach?.universityLeague ? ` · ${coach.universityLeague}` : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Bloco 2: Status de Comunicação e Supressão */}
            <div className="rounded-lg p-4 border border-neutral-200 dark:border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Status de Comunicação (Opt-Out / Supressão)
                </h4>
                {suppression ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {suppression.reason?.includes("temporary_6m")
                      ? "Pausa Temporária (6 Meses)"
                      : "Descadastrado / Bloqueado"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Ativo para Recebimento
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {suppression ? (
                  <button
                    type="button"
                    onClick={() => handleToggleSuppression("remove")}
                    className="text-xs px-3 py-1.5 font-medium rounded-md bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 transition-colors"
                  >
                    Remover Supressão Manual
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleToggleSuppression("temporary_6m")}
                      className="text-xs px-3 py-1.5 font-medium rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors"
                    >
                      Pausar por 6 Meses
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSuppression("permanent")}
                      className="text-xs px-3 py-1.5 font-medium rounded-md bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition-colors"
                    >
                      Bloquear Permanentemente
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Bloco 3: Preferências e Sinais de Recrutamento */}
            <div className="rounded-lg p-4 border border-neutral-200 dark:border-neutral-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Preferências de Recrutamento (Fit)
                </h4>
                <button
                  type="button"
                  onClick={() => setAddingSignal(!addingSignal)}
                  className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {addingSignal ? "Cancelar" : "Adicionar Preferência"}
                </button>
              </div>

              {addingSignal && (
                <form
                  onSubmit={handleAddSignal}
                  className="p-3 bg-neutral-50 dark:bg-neutral-800/80 rounded-md border border-neutral-200 dark:border-neutral-700 space-y-3 text-sm"
                >
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                      Motivo / Critério
                    </label>
                    <select
                      value={signalReason}
                      onChange={(e) => setSignalReason(e.target.value as InterestSignalReason)}
                      className="w-full text-xs p-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
                    >
                      {Object.entries(REASONS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                      Posição de Interesse / Não Necessária (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Setter, Outside Hitter, Libero"
                      value={signalPosition}
                      onChange={(e) => setSignalPosition(e.target.value)}
                      className="w-full text-xs p-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                      Notas Internas da Agência
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Informou por e-mail que o orçamento fechou para ponteiras"
                      value={signalNotes}
                      onChange={(e) => setSignalNotes(e.target.value)}
                      className="w-full text-xs p-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAddingSignal(false)}
                      className={secondaryButtonClass}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingSignal}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {savingSignal ? "Salvando..." : "Salvar Preferência"}
                    </button>
                  </div>
                </form>
              )}

              {signals.length === 0 ? (
                <p className="text-xs text-neutral-400 py-2">
                  Nenhuma restrição ou preferência ativa registrada para este treinador.
                </p>
              ) : (
                <div className="space-y-2">
                  {signals.map((sig) => {
                    const isExpired = new Date(sig.expires_at).getTime() < Date.now();
                    return (
                      <div
                        key={sig.id}
                        className="flex items-start justify-between p-2.5 rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                              {REASONS[sig.reason] || sig.reason}
                            </span>
                            {isExpired ? (
                              <span className="text-[10px] text-neutral-400">(Expirada)</span>
                            ) : (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                (Ativa)
                              </span>
                            )}
                          </div>
                          {sig.position && (
                            <p className="text-neutral-600 dark:text-neutral-400">
                              Posição: <span className="font-medium">{sig.position}</span>
                            </p>
                          )}
                          {sig.notes && <p className="text-neutral-500 italic">"{sig.notes}"</p>}
                          <p className="text-[10px] text-neutral-400">
                            Expira em: {new Date(sig.expires_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCloseSignal(sig.id)}
                          className="text-neutral-400 hover:text-rose-600 p-1 transition-colors"
                          title="Encerrar sinal"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bloco 4: Linha do Tempo de Interações */}
            <div className="rounded-lg p-4 border border-neutral-200 dark:border-neutral-800 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Histórico de Comunicações & Eventos
              </h4>

              {timelineLoading ? (
                <div className="py-6 flex items-center justify-center text-xs text-neutral-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Carregando linha do tempo...
                </div>
              ) : timeline.length === 0 ? (
                <p className="text-xs text-neutral-400 py-2">
                  Nenhum evento registrado para este endereço até o momento.
                </p>
              ) : (
                <div className="space-y-3 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-neutral-200 dark:before:bg-neutral-800">
                  {timeline.map((event, idx) => {
                    const isDelivered = event.eventType === "delivered";
                    const isOpened = event.eventType === "opened";
                    const isClicked = event.eventType === "clicked";
                    const isBounced = event.eventType === "bounced";
                    const isBot =
                      event.details?.includes("bot") || event.details?.includes("Automated");

                    return (
                      <div key={idx} className="relative pl-7 text-xs space-y-0.5">
                        <div
                          className={`absolute left-1.5 top-1 -translate-x-1/2 w-3 h-3 rounded-full border-2 bg-white dark:bg-neutral-900 ${
                            isClicked
                              ? "border-emerald-500"
                              : isOpened
                                ? "border-sky-500"
                                : isBounced
                                  ? "border-rose-500"
                                  : "border-neutral-400"
                          }`}
                        />
                        <div className="flex items-center justify-between text-neutral-700 dark:text-neutral-300">
                          <span className="font-semibold capitalize">
                            {isClicked
                              ? "Link Clicado"
                              : isOpened
                                ? "E-mail Aberto"
                                : isDelivered
                                  ? "Entregue"
                                  : isBounced
                                    ? "Rejeitado (Bounce)"
                                    : event.eventType}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            {event.occurredAt
                              ? new Date(event.occurredAt).toLocaleString("pt-BR")
                              : ""}
                          </span>
                        </div>
                        {event.details && (
                          <p className="text-neutral-500 dark:text-neutral-400 truncate">
                            {event.details}
                          </p>
                        )}
                        {isBot && (
                          <span className="inline-block text-[10px] text-amber-600 bg-amber-50 px-1.5 rounded">
                            Provável clique automatizado (bot de segurança)
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

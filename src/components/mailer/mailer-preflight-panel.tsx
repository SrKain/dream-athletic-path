import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { MailerPreflightResult } from "@/types/db";

export interface MailerPreflightPanelProps {
  preflight: MailerPreflightResult | null;
  loading: boolean;
  isDryRun: boolean;
}

const EXCLUSION_REASON_LABELS: Record<string, string> = {
  duplicate: "Duplicado na seleção",
  invalid: "Sintaxe de e-mail inválida",
  suppressed: "Suprimido (Opt-out / Bounce)",
  blocked_fit: "Conflito de interesse do coach",
  other: "Outro motivo",
};

export function MailerPreflightPanel({ preflight, loading, isDryRun }: MailerPreflightPanelProps) {
  const [showExclusions, setShowExclusions] = useState(false);

  if (loading && !preflight) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-3.5 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
        <span>Executando pré-checagem e deduplicação global no servidor...</span>
      </div>
    );
  }

  if (!preflight) return null;

  const {
    selectedCount,
    eligibleCount,
    duplicateCount,
    invalidCount,
    suppressedCount,
    blockedFitCount,
    otherExcludedCount,
    excludedTotalCount,
    invariantValid,
    quota,
    excludedRecipients,
  } = preflight;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-bold text-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Pré-checagem Autoritativa (Servidor)</span>
        </div>
        {invariantValid ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            {selectedCount} = {eligibleCount} elegíveis + {excludedTotalCount} descartados
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" />
            Inconsistência na soma da seleção
          </span>
        )}
      </div>

      {/* Breakdown de Invariante: selecionados = elegíveis + duplicados + inválidos + suprimidos + outros */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="rounded-lg border border-border/70 bg-background p-2 text-center">
          <div className="text-[10px] uppercase text-muted-foreground font-semibold">
            Selecionados
          </div>
          <div className="text-sm font-black text-foreground">{selectedCount}</div>
        </div>
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-center">
          <div className="text-[10px] uppercase text-emerald-800 dark:text-emerald-200 font-semibold">
            Elegíveis
          </div>
          <div className="text-sm font-black text-emerald-900 dark:text-emerald-100">
            {eligibleCount}
          </div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background p-2 text-center">
          <div className="text-[10px] uppercase text-muted-foreground font-semibold">
            Duplicados
          </div>
          <div className="text-sm font-bold text-foreground">{duplicateCount}</div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background p-2 text-center">
          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Inválidos</div>
          <div className="text-sm font-bold text-rose-600 dark:text-rose-400">{invalidCount}</div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background p-2 text-center col-span-2 sm:col-span-1">
          <div className="text-[10px] uppercase text-muted-foreground font-semibold">
            Suprimidos
          </div>
          <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
            {suppressedCount + blockedFitCount + otherExcludedCount}
          </div>
        </div>
      </div>

      {/* Barra de Cota Mensal (Resend 20k/mês) */}
      <div className="space-y-1.5 pt-1 border-t border-border/50">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground font-medium">
            Cota mensal após este envio:{" "}
            <strong className="text-foreground">
              {(quota.usedThisMonth + eligibleCount).toLocaleString("pt-BR")}
            </strong>{" "}
            / {quota.monthlyQuota.toLocaleString("pt-BR")} e-mails
          </span>
          <span
            className={`font-bold ${
              quota.blocked
                ? "text-rose-600 dark:text-rose-400"
                : quota.warning80Percent
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {quota.projectedUsagePercent.toFixed(1)}%
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden border border-border/50">
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              quota.blocked
                ? "bg-rose-500"
                : quota.warning80Percent
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            }`}
            style={{
              width: `${Math.max(0, Math.min(100, quota.projectedUsagePercent))}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Já enviados no ciclo: {quota.usedThisMonth.toLocaleString("pt-BR")}</span>
          <span>Restante após envio: {quota.remainingAfterSend.toLocaleString("pt-BR")}</span>
        </div>
      </div>

      {/* Alerta de 80% ou Bloqueio de 100% da cota mensal */}
      {quota.blocked && !isDryRun ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-2.5 text-rose-900 dark:text-rose-200 flex items-start gap-2"
        >
          <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Cota mensal insuficiente para esta campanha</div>
            <p className="text-[11px] mt-0.5">
              Restam {quota.remainingBeforeSend.toLocaleString("pt-BR")} envios no ciclo atual, mas
              foram apurados {eligibleCount.toLocaleString("pt-BR")} destinatários elegíveis. Reduza
              a seleção ou ative o Modo Ensaio (Dry Run).
            </p>
          </div>
        </div>
      ) : quota.warning80Percent ? (
        <div
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-900 dark:text-amber-200 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Atenção: uso da cota mensal acima de 80%</div>
            <p className="text-[11px] mt-0.5">
              Após este disparo, restarão {quota.remainingAfterSend.toLocaleString("pt-BR")} e-mails
              disponíveis até a renovação do ciclo (dia {quota.cycleStartDay}).
            </p>
          </div>
        </div>
      ) : null}

      {/* Lista expansível de descartados na pré-checagem */}
      {excludedRecipients.length > 0 && (
        <div className="pt-1 border-t border-border/50">
          <button
            type="button"
            onClick={() => setShowExclusions(!showExclusions)}
            className="w-full flex items-center justify-between text-[11px] font-semibold text-muted-foreground hover:text-foreground py-1 cursor-pointer"
          >
            <span>
              Ver {excludedRecipients.length} contato(s) descartado(s) na pré-checagem (serão
              registrados no relatório final)
            </span>
            {showExclusions ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showExclusions && (
            <div className="mt-1.5 max-h-36 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border">
              {excludedRecipients.slice(0, 100).map((ex, idx) => (
                <div
                  key={`${ex.emailNormalized}-${idx}`}
                  className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground truncate">
                      {ex.name || "Coach"} ·{" "}
                      <span className="font-normal text-muted-foreground">{ex.email}</span>
                    </div>
                    {ex.universityName && (
                      <div className="text-[10px] text-muted-foreground truncate">
                        {ex.universityName}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-muted text-foreground border border-border">
                    {EXCLUSION_REASON_LABELS[ex.reason] || ex.reason}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

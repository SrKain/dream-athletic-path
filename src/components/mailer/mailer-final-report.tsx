import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
} from "lucide-react";
import type { MailerCampaignFinalReport, MailerNonSentReportItem } from "@/types/db";

export interface MailerFinalReportProps {
  report: MailerCampaignFinalReport;
  onRefreshReport: () => Promise<unknown>;
  onRetryFailedRetryable: () => Promise<void>;
  onOpenReconcileModal: () => void;
  isRetryingRetryable: boolean;
}

function buildClientCsv(items: MailerNonSentReportItem[]): string {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const headers = [
    "E-mail",
    "Coach",
    "Universidade",
    "Origem",
    "Categoria",
    "Motivo em Português",
    "Ação Sugerida",
    "Tentativas",
  ];
  const rows = [headers.map(esc).join(",")];
  for (const item of items) {
    rows.push(
      [
        item.email,
        item.coachName,
        item.universityName,
        item.source === "preflight_exclusion" ? "Pré-checagem" : "Fila de Envio",
        item.categoryLabelPt,
        item.reasonPt,
        item.suggestedActionPt,
        String(item.attempts),
      ]
        .map(esc)
        .join(","),
    );
  }
  return `\uFEFF${rows.join("\n")}`;
}

export function MailerFinalReport({
  report,
  onRefreshReport,
  onRetryFailedRetryable,
  onOpenReconcileModal,
  isRetryingRetryable,
}: MailerFinalReportProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const groupedCounts = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const item of report.nonSentItems) {
      const existing = counts.get(item.categoryKey);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(item.categoryKey, {
          label: item.categoryLabelPt,
          count: 1,
        });
      }
    }
    return Array.from(counts.entries());
  }, [report.nonSentItems]);

  const filteredNonSent = useMemo(() => {
    if (selectedCategory === "all") return report.nonSentItems;
    return report.nonSentItems.filter((item) => item.categoryKey === selectedCategory);
  }, [report.nonSentItems, selectedCategory]);

  const handleDownloadCsv = () => {
    const csvContent = buildClientCsv(report.nonSentItems);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-nao-enviados-${report.campaignId.slice(0, 8)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshReport();
    } finally {
      setIsRefreshing(false);
    }
  };

  const badgeColors =
    report.finalBadgeTone === "emerald"
      ? "bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700"
      : report.finalBadgeTone === "amber"
        ? "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700"
        : "bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700";

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-md space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <FileText className="w-4 h-4" />
              Relatório Final Auditável da Campanha
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold border ${badgeColors}`}
            >
              {report.finalBadgeTone === "emerald" ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              {report.finalBadgeLabelPt}
              {report.nonSentItems.length > 0 &&
              report.finalBadgeLabelPt === "Concluída com ressalvas"
                ? ` (${report.nonSentItems.length} itens)`
                : ""}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Resumo congelado de submissão + confirmações de entrega ao vivo via webhooks do Resend
            (atualizado às{" "}
            {new Date(report.asOf).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
            ).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Atualizar Entregas
          </button>

          {report.failedRetryableCount > 0 && (
            <button
              type="button"
              onClick={() => void onRetryFailedRetryable()}
              disabled={isRetryingRetryable}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isRetryingRetryable ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              Reenviar somente falhas retentáveis ({report.failedRetryableCount})
            </button>
          )}

          {report.unconfirmedCount > 0 && (
            <button
              type="button"
              onClick={onOpenReconcileModal}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
              Resolver não confirmados ({report.unconfirmedCount})
            </button>
          )}

          {report.nonSentItems.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV ({report.nonSentItems.length})
            </button>
          )}
        </div>
      </div>

      {/* Resumo de Contagens: Submissão vs Entrega */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center text-xs">
        <div className="rounded-xl border border-border p-2.5 bg-muted/20">
          <div className="text-[10px] uppercase text-muted-foreground font-bold">Selecionados</div>
          <div className="text-sm font-black text-foreground mt-0.5">{report.selectedCount}</div>
        </div>
        <div className="rounded-xl border border-border p-2.5 bg-muted/20">
          <div className="text-[10px] uppercase text-muted-foreground font-bold">Excluídos Pré</div>
          <div className="text-sm font-bold text-foreground mt-0.5">{report.excludedCount}</div>
        </div>
        <div className="rounded-xl border border-border p-2.5 bg-muted/20">
          <div className="text-[10px] uppercase text-muted-foreground font-bold">Elegíveis</div>
          <div className="text-sm font-black text-foreground mt-0.5">{report.eligibleCount}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/40 p-2.5 bg-emerald-500/10">
          <div className="text-[10px] uppercase text-emerald-800 dark:text-emerald-200 font-bold">
            Aceitos Resend
          </div>
          <div className="text-sm font-black text-emerald-950 dark:text-emerald-100 mt-0.5">
            {report.acceptedCount}
          </div>
        </div>
        <div className="rounded-xl border border-sky-500/40 p-2.5 bg-sky-500/10">
          <div className="text-[10px] uppercase text-sky-800 dark:text-sky-200 font-bold">
            Entregues
          </div>
          <div className="text-sm font-black text-sky-950 dark:text-sky-100 mt-0.5">
            {report.deliveredCount}
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/40 p-2.5 bg-amber-500/10">
          <div className="text-[10px] uppercase text-amber-800 dark:text-amber-200 font-bold">
            Aguard. Conf.
          </div>
          <div className="text-sm font-bold text-amber-950 dark:text-amber-100 mt-0.5">
            {report.awaitingDeliveryCount}
          </div>
        </div>
        <div className="rounded-xl border border-rose-500/40 p-2.5 bg-rose-500/10">
          <div className="text-[10px] uppercase text-rose-800 dark:text-rose-200 font-bold">
            Falhas / Bounces
          </div>
          <div className="text-sm font-bold text-rose-950 dark:text-rose-100 mt-0.5">
            {report.failedPermanentCount + report.failedRetryableCount} / {report.bouncedCount}
          </div>
        </div>
        <div className="rounded-xl border border-border p-2.5 bg-muted/20">
          <div className="text-[10px] uppercase text-muted-foreground font-bold">Não Conf.</div>
          <div className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-0.5">
            {report.unconfirmedCount}
          </div>
        </div>
      </div>

      {/* Lista Auditável de Não Enviados agrupada por motivo em português */}
      {report.nonSentItems.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>
            100% dos destinatários selecionados foram aceitos pelo provedor sem nenhum descarte ou
            falha.
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <span>Destinatários Não Enviados ou com Ressalva ({report.nonSentItems.length})</span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer border ${
                  selectedCategory === "all"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                Todos ({report.nonSentItems.length})
              </button>
              {groupedCounts.map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedCategory(key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer border ${
                    selectedCategory === key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {info.label} ({info.count})
                </button>
              ))}
            </div>
          </div>

          <div className="border border-border rounded-xl overflow-hidden bg-background">
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase sticky top-0">
                  <tr>
                    <th className="p-2.5">Destinatário / E-mail</th>
                    <th className="p-2.5">Universidade</th>
                    <th className="p-2.5">Categoria</th>
                    <th className="p-2.5">Motivo em Português</th>
                    <th className="p-2.5">Ação Sugerida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredNonSent.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/20">
                      <td className="p-2.5">
                        <div className="font-semibold text-foreground">{item.coachName}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {item.email}
                        </div>
                      </td>
                      <td className="p-2.5 text-foreground">{item.universityName}</td>
                      <td className="p-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-foreground border border-border">
                          {item.categoryLabelPt}
                        </span>
                      </td>
                      <td className="p-2.5 text-muted-foreground max-w-xs">{item.reasonPt}</td>
                      <td className="p-2.5 text-foreground font-medium max-w-xs">
                        {item.suggestedActionPt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

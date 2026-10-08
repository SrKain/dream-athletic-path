import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Flame,
  HelpCircle,
  Layers,
  Loader2,
  MailCheck,
  MousePointerClick,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { getMailerMetricsServerFn } from "@/lib/email/recruit-email.functions";
import type {
  AthletePerformanceItem,
  EngagedCoachLeadItem,
  MailerCampaignRollupItem,
  MailerEventRow,
  MailerMetricsSummary,
} from "@/lib/email/mailer-metrics.server";
import { LEAGUES } from "@/lib/universities-constants";

export interface MailerMetricsDashboardProps {
  athletes?: Array<{ id: string; full_name: string }>;
  onRefreshHistory?: () => void;
}

type SubViewTab = "coaches" | "athletes" | "campaigns" | "events";

export function MailerMetricsDashboard({
  athletes: propAthletes = [],
  onRefreshHistory,
}: MailerMetricsDashboardProps) {
  const [days, setDays] = useState<number>(30);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("ALL");
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("ALL");
  const [selectedDivision, setSelectedDivision] = useState<string>("ALL");

  const [subTab, setSubTab] = useState<SubViewTab>("coaches");
  const [eventFilter, setEventFilter] = useState<string>("ALL");
  const [coachSearch, setCoachSearch] = useState<string>("");

  const [metrics, setMetrics] = useState<MailerMetricsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await getMailerMetricsServerFn({
        data: {
          days,
          campaignId: selectedCampaignId === "ALL" ? undefined : selectedCampaignId,
          athleteId: selectedAthleteId === "ALL" ? undefined : selectedAthleteId,
          division: selectedDivision === "ALL" ? undefined : selectedDivision,
        },
      });
      setMetrics(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load Mailer metrics.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [days, selectedCampaignId, selectedAthleteId, selectedDivision]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const athleteOptions = useMemo(() => {
    if (metrics?.filterOptions?.athletes && metrics.filterOptions.athletes.length > 0) {
      return metrics.filterOptions.athletes.map((a) => ({
        id: a.id,
        name: a.name,
      }));
    }
    return propAthletes.map((a) => ({
      id: a.id,
      name: a.full_name,
    }));
  }, [metrics?.filterOptions?.athletes, propAthletes]);

  const campaignOptions = useMemo(() => {
    return metrics?.filterOptions?.campaigns ?? [];
  }, [metrics?.filterOptions?.campaigns]);

  const filteredCoaches = useMemo(() => {
    const list = metrics?.engagedCoaches ?? [];
    const q = coachSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.coach_name.toLowerCase().includes(q) ||
        c.coach_email.toLowerCase().includes(q) ||
        c.university_name.toLowerCase().includes(q) ||
        c.division.toLowerCase().includes(q),
    );
  }, [metrics?.engagedCoaches, coachSearch]);

  const filteredEvents = useMemo(() => {
    if (!metrics) return [];
    if (eventFilter === "ALL") return metrics.recentEvents;
    if (eventFilter === "HUMAN_CLICK") {
      return metrics.recentEvents.filter(
        (ev) => ev.event_type === "email.clicked" && !ev.is_automated_click,
      );
    }
    if (eventFilter === "AUTOMATED_CLICK") {
      return metrics.recentEvents.filter(
        (ev) => ev.event_type === "email.clicked" && ev.is_automated_click,
      );
    }
    if (eventFilter === "ISSUES") {
      return metrics.recentEvents.filter((ev) =>
        [
          "email.bounced",
          "email.complained",
          "email.failed",
          "email.suppressed",
          "email.delivery_delayed",
        ].includes(ev.event_type),
      );
    }
    return metrics.recentEvents.filter((ev) => ev.event_type === eventFilter);
  }, [metrics, eventFilter]);

  function handleExportEngagedCoachesCsv() {
    if (filteredCoaches.length === 0) {
      toast.info("No engaged coaches to export for the current filters.");
      return;
    }

    const headers = [
      "Coach Name",
      "Coach Email",
      "University",
      "Division",
      "State",
      "Unique Human Clicks",
      "Total Human Clicks",
      "Unique Opens",
      "Total Opens",
      "Last Clicked At",
      "Last Opened At",
      "Clicked Links",
    ];

    const escapeCsv = (val: string | number | null | undefined) => {
      const str = String(val ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = filteredCoaches.map((c) => [
      escapeCsv(c.coach_name),
      escapeCsv(c.coach_email),
      escapeCsv(c.university_name),
      escapeCsv(c.division),
      escapeCsv(c.state),
      escapeCsv(c.unique_human_clicks),
      escapeCsv(c.total_human_clicks),
      escapeCsv(c.unique_opens),
      escapeCsv(c.total_opens),
      escapeCsv(c.last_clicked_at || ""),
      escapeCsv(c.last_opened_at || ""),
      escapeCsv((c.clicked_links || []).join(" | ")),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `gtg-engaged-coaches-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredCoaches.length} engaged coaches to CSV.`);
  }

  function handleCopyEmail(email: string) {
    void navigator.clipboard.writeText(email);
    toast.success(`Copied ${email} to clipboard`);
  }

  const t = metrics?.totals;

  return (
    <div className="space-y-6">
      {/* Global Filter Bar */}
      <div className="glass-panel p-4 rounded-xl border border-border bg-card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Mailer Intelligence &amp; Coach Engagement
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Unique attribution by dispatch ID with automated security scanner filtering (.edu bots).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period Filter */}
          <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border text-xs">
            {[
              { label: "7D", value: 7 },
              { label: "30D", value: 30 },
              { label: "90D", value: 90 },
              { label: "All", value: 0 },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDays(opt.value)}
                className={`min-h-[34px] px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  days === opt.value
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Campaign Select */}
          <select
            aria-label="Filter by Campaign"
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground max-w-[210px] truncate"
          >
            <option value="ALL">All Campaigns</option>
            {campaignOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {new Date(c.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {c.subject}
              </option>
            ))}
          </select>

          {/* Athlete Select */}
          <select
            aria-label="Filter by Athlete"
            value={selectedAthleteId}
            onChange={(e) => setSelectedAthleteId(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground max-w-[180px] truncate"
          >
            <option value="ALL">All Athletes</option>
            {athleteOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Division Select (Official LEAGUES from universities-constants.ts) */}
          <select
            aria-label="Filter by Division"
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground"
          >
            <option value="ALL">All Divisions</option>
            {LEAGUES.map((league) => (
              <option key={league} value={league}>
                {league}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              void loadMetrics();
              onRefreshHistory?.();
            }}
            disabled={loading}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-semibold text-foreground transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Webhook Status Banner */}
      {metrics && !metrics.webhookSecretConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-300">
              Resend Webhook Secret Configuration Recommended
            </div>
            <p className="text-amber-200/80 leading-relaxed">
              Configure your Resend webhook endpoint pointing to{" "}
              <code className="px-1.5 py-0.5 rounded bg-black/30 font-mono text-amber-200">
                /api/webhooks/resend
              </code>{" "}
              with events{" "}
              <code className="px-1 py-0.5 rounded bg-black/30 font-mono">
                email.sent, email.delivered, email.opened, email.clicked, email.bounced,
                email.complained, email.failed, email.suppressed, email.delivery_delayed
              </code>{" "}
              and set <code className="font-mono">RESEND_WEBHOOK_SECRET</code> in production.
            </p>
          </div>
        </div>
      )}

      {/* RPC Error Notice */}
      {metrics?.rpcError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 flex items-start gap-3 text-xs">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-destructive">
              Metrics RPC error: {metrics.rpcError}
            </div>
            <p className="text-muted-foreground leading-relaxed">
              The metrics database procedure encountered an error. A fallback query is being used to
              display available data.
            </p>
          </div>
        </div>
      )}

      {errorMessage ? (
        <div className="p-8 rounded-xl border border-destructive/40 bg-destructive/10 text-center space-y-3">
          <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
          <div className="text-sm font-bold text-foreground">Error loading Mailer metrics</div>
          <p className="text-xs text-muted-foreground">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void loadMetrics()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold cursor-pointer"
          >
            Try Again
          </button>
        </div>
      ) : loading && !metrics ? (
        <div className="p-16 rounded-xl border border-border bg-card flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs">Aggregating Mailer metrics in database...</span>
        </div>
      ) : t ? (
        <>
          {/* 6 Primary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
            {/* 1. Sent & Delivered */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span className="font-medium">Delivered / Sent</span>
                <MailCheck className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-foreground">
                  {t.delivered.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-emerald-500">{t.deliveryRate}%</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Sent: <strong className="text-foreground">{t.sent.toLocaleString()}</strong> ·
                Delayed: {t.delayed}
              </div>
            </div>

            {/* 2. Unique Opens (Indicative Tooltip) */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span
                  className="font-medium inline-flex items-center gap-1 cursor-help"
                  title="Indicative metric: Apple Mail Privacy Protection (MPP) and image proxies (GoogleImageProxy/Yahoo) pre-fetch tracking pixels automatically. Rely on Human Unique Clicks for high-confidence coach intent."
                >
                  Unique Opens (Indicative)
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/80" />
                </span>
                <Eye className="w-4 h-4 text-sky-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-foreground">
                  {t.opened.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-sky-400">{t.openRate}%</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Raw: {t.totalOpens.toLocaleString()} · Proxy: {t.proxyOpens.toLocaleString()}
              </div>
            </div>

            {/* 3. Human Unique Clicks (Primary Actionable KPI) */}
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-primary mb-1.5">
                <span
                  className="font-bold inline-flex items-center gap-1 cursor-help"
                  title="Unique emails with probable human clicks. Excludes security scanners (clicks <= 10s after delivery, bursts of >= 3 links in <= 5s, and known bot User-Agents)."
                >
                  Human Unique Clicks
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <MousePointerClick className="w-4 h-4 text-primary" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-foreground">
                  {t.clicked.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-primary">{t.clickRate}%</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Human total: {t.totalHumanClicks} · Bots filtered: {t.automatedClicks}
              </div>
            </div>

            {/* 4. Click-to-Open Rate (CTOR) */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span
                  className="font-medium cursor-help"
                  title="Unique Human Clicks divided by Unique Opens (capped at 100%). Measures how compelling the athlete roster is once opened."
                >
                  Click-to-Open (CTOR)
                </span>
                <Activity className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-foreground">
                  {t.clickToOpenRate}%
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {t.clicked} human clicks / {t.opened} unique opens
              </div>
            </div>

            {/* 5. Hot Coach Leads */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span className="font-medium">Hot Coach Leads</span>
                <Flame className="w-4 h-4 text-orange-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-foreground">
                  {t.hotCoachesCount.toLocaleString()}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Distinct coaches who clicked film/profile
              </div>
            </div>

            {/* 6. Bounces & Suppressions */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span className="font-medium">Bounces &amp; Blocks</span>
                <ShieldAlert className="w-4 h-4 text-rose-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-foreground">
                  {t.bounced.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-rose-400">{t.bounceRate}%</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Complained: {t.complained} · Suppressed: {t.suppressed}
              </div>
            </div>
          </div>

          {/* Daily Trend Area Chart */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Daily Engagement Timeline (Unique per Dispatch)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Comparison of Sent, Delivered, Unique Opens, and Human Unique Clicks
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Delivered
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                  Unique Opens
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#f69e00]" />
                  Human Clicks
                </span>
              </div>
            </div>

            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={metrics?.dailySeries ?? []}
                  margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradDelivered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradOpened" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradClicked" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f69e00" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#f69e00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#091910",
                      borderColor: "rgba(255,255,255,0.12)",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="delivered"
                    name="Delivered"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#gradDelivered)"
                  />
                  <Area
                    type="monotone"
                    dataKey="opened"
                    name="Unique Opens"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#gradOpened)"
                  />
                  <Area
                    type="monotone"
                    dataKey="clicked"
                    name="Human Clicks"
                    stroke="#f69e00"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#gradClicked)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Actionable Reports Navigation Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTab("coaches")}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  subTab === "coaches"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                Engaged Coaches ({metrics?.engagedCoaches.length ?? 0})
              </button>

              <button
                type="button"
                onClick={() => setSubTab("athletes")}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  subTab === "athletes"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                Athlete Interest ({metrics?.athletePerformance.length ?? 0})
              </button>

              <button
                type="button"
                onClick={() => setSubTab("campaigns")}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  subTab === "campaigns"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Campaigns ({metrics?.campaigns.length ?? 0})
              </button>

              <button
                type="button"
                onClick={() => setSubTab("events")}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  subTab === "events"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Live Webhook Feed ({metrics?.recentEvents.length ?? 0})
              </button>
            </div>

            {subTab === "coaches" && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search coach or university..."
                  value={coachSearch}
                  onChange={(e) => setCoachSearch(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground flex-1 sm:w-56"
                />
                <button
                  type="button"
                  onClick={handleExportEngagedCoachesCsv}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:opacity-90 text-xs font-bold transition-all cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  Export CSV
                </button>
              </div>
            )}
          </div>

          {/* SUB-TAB 1: ENGAGED COACHES (HOT LEADS) */}
          {subTab === "coaches" && (
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3.5">Coach &amp; Email</th>
                      <th className="p-3.5">University &amp; Division</th>
                      <th className="p-3.5 text-center">Human Clicks</th>
                      <th className="p-3.5 text-center">Unique Opens</th>
                      <th className="p-3.5">Clicked Content</th>
                      <th className="p-3.5">Last Activity</th>
                      <th className="p-3.5 text-right">Follow-Up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredCoaches.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-10 text-center text-muted-foreground">
                          No engaged coaches recorded for the selected filters yet.
                        </td>
                      </tr>
                    ) : (
                      filteredCoaches.map((coach: EngagedCoachLeadItem) => {
                        const lastActive = coach.last_clicked_at || coach.last_opened_at;
                        return (
                          <tr key={coach.coach_email} className="hover:bg-muted/20">
                            <td className="p-3.5">
                              <div className="font-bold text-foreground flex items-center gap-1.5">
                                {coach.unique_human_clicks > 0 && (
                                  <span
                                    title="Clicked athlete film or profile"
                                    className="inline-flex shrink-0"
                                  >
                                    <Flame className="w-3.5 h-3.5 text-primary" />
                                  </span>
                                )}
                                {coach.coach_name}
                              </div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                {coach.coach_email}
                              </div>
                            </td>
                            <td className="p-3.5">
                              <div className="font-medium text-foreground">
                                {coach.university_name || "—"}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {[coach.division, coach.state].filter(Boolean).join(" · ") || "—"}
                              </div>
                            </td>
                            <td className="p-3.5 text-center">
                              {coach.unique_human_clicks > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-primary/15 text-primary border border-primary/30">
                                  <MousePointerClick className="w-3 h-3" />
                                  {coach.unique_human_clicks}
                                  {coach.total_human_clicks > coach.unique_human_clicks && (
                                    <span className="text-[10px] font-normal opacity-80">
                                      ({coach.total_human_clicks})
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className="font-semibold text-foreground">
                                {coach.unique_opens}
                              </span>
                              {coach.total_opens > coach.unique_opens && (
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  ({coach.total_opens})
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 max-w-xs">
                              {coach.clicked_links && coach.clicked_links.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {coach.clicked_links.slice(0, 3).map((link, idx) => {
                                    const isYoutube =
                                      link.includes("youtube.com") || link.includes("youtu.be");
                                    const slugMatch = link.match(/\/athlete\/([^/?#]+)/i);
                                    const label = isYoutube
                                      ? "Match Film"
                                      : slugMatch?.[1]
                                        ? `Profile: ${slugMatch[1]}`
                                        : "Portfolio Link";
                                    return (
                                      <a
                                        key={`${link}-${idx}`}
                                        href={link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] font-semibold text-foreground truncate max-w-[160px]"
                                        title={link}
                                      >
                                        <ExternalLink className="w-2.5 h-2.5 text-primary shrink-0" />
                                        {label}
                                      </a>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-[11px]">
                                  Opened email only
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-muted-foreground whitespace-nowrap">
                              {lastActive
                                ? new Date(lastActive).toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleCopyEmail(coach.coach_email)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-[11px] font-semibold text-foreground transition-all cursor-pointer"
                                title="Copy coach email address"
                              >
                                <Copy className="w-3 h-3 text-primary" />
                                Copy Email
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
          )}

          {/* SUB-TAB 2: PERFORMANCE BY ATHLETE */}
          {subTab === "athletes" && (
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3.5">Athlete</th>
                      <th className="p-3.5">Position</th>
                      <th className="p-3.5 text-center">Campaigns</th>
                      <th className="p-3.5 text-center">Delivered</th>
                      <th className="p-3.5 text-center">Unique Opens</th>
                      <th className="p-3.5 text-center">Human Clicks</th>
                      <th className="p-3.5 text-center">Film / Profile</th>
                      <th className="p-3.5 text-center">Not a Fit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(metrics?.athletePerformance ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-10 text-center text-muted-foreground">
                          No athlete campaign data found for the selected period.
                        </td>
                      </tr>
                    ) : (
                      (metrics?.athletePerformance ?? []).map((ath: AthletePerformanceItem) => (
                        <tr key={ath.athlete_id} className="hover:bg-muted/20">
                          <td className="p-3.5">
                            <button
                              type="button"
                              onClick={() => setSelectedAthleteId(ath.athlete_id)}
                              className="font-bold text-foreground hover:text-primary transition-colors text-left cursor-pointer"
                            >
                              {ath.athlete_name}
                            </button>
                          </td>
                          <td className="p-3.5 text-muted-foreground">{ath.position}</td>
                          <td className="p-3.5 text-center font-semibold text-foreground">
                            {ath.campaigns_count}
                          </td>
                          <td className="p-3.5 text-center text-muted-foreground">
                            {ath.delivered.toLocaleString()} / {ath.emails_sent.toLocaleString()}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="font-semibold text-sky-400">{ath.unique_opens}</span>
                            <span className="text-[10px] text-muted-foreground ml-1">
                              ({ath.open_rate}%)
                            </span>
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-primary/15 text-primary">
                              {ath.unique_human_clicks} ({ath.click_rate}%)
                            </span>
                          </td>
                          <td className="p-3.5 text-center text-[11px] text-muted-foreground">
                            <span
                              className="inline-flex items-center gap-1 mr-2"
                              title="Watch Film"
                            >
                              <Video className="w-3 h-3 text-primary" />
                              {ath.film_clicks}
                            </span>
                            <span title="Full Profile">Profile: {ath.profile_clicks}</span>
                          </td>
                          <td className="p-3.5 text-center">
                            {ath.not_fit_signals > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-semibold">
                                {ath.not_fit_signals}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUB-TAB 3: CAMPAIGNS BREAKDOWN */}
          {subTab === "campaigns" && (
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5">Mode</th>
                      <th className="p-3.5">Subject</th>
                      <th className="p-3.5 text-center">Sent / Delivered</th>
                      <th className="p-3.5 text-center">Unique Opens</th>
                      <th className="p-3.5 text-center">Human Clicks</th>
                      <th className="p-3.5 text-center">CTOR</th>
                      <th className="p-3.5 text-right">Drill-Down</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(metrics?.campaigns ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-10 text-center text-muted-foreground">
                          No campaigns dispatched in this period yet.
                        </td>
                      </tr>
                    ) : (
                      (metrics?.campaigns ?? []).map((camp: MailerCampaignRollupItem) => (
                        <tr key={camp.id} className="hover:bg-muted/20">
                          <td className="p-3.5 whitespace-nowrap text-muted-foreground">
                            {new Date(camp.created_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded bg-muted text-[10px] font-bold uppercase text-foreground">
                              {camp.mode === "single_athlete"
                                ? "Single"
                                : camp.mode === "multi_athlete"
                                  ? "Multi-Athlete"
                                  : "Catalog"}
                            </span>
                          </td>
                          <td className="p-3.5 font-medium text-foreground max-w-xs truncate">
                            {camp.subject}
                          </td>
                          <td className="p-3.5 text-center text-muted-foreground">
                            <strong className="text-foreground">{camp.delivered}</strong> /{" "}
                            {camp.sent}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="font-semibold text-sky-400">{camp.unique_opens}</span>{" "}
                            <span className="text-[10px] text-muted-foreground">
                              ({camp.open_rate}%)
                            </span>
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="font-bold text-primary">
                              {camp.unique_human_clicks}
                            </span>{" "}
                            <span className="text-[10px] text-muted-foreground">
                              ({camp.click_rate}%)
                            </span>
                          </td>
                          <td className="p-3.5 text-center font-semibold text-foreground">
                            {camp.ctor}%
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCampaignId(camp.id);
                                setSubTab("coaches");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              Filter Coaches
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUB-TAB 4: LIVE WEBHOOK EVENT FEED */}
          {subTab === "events" && (
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">Webhook Event Stream</h3>
                </div>
                <select
                  aria-label="Filter Webhook Event Type"
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground"
                >
                  <option value="ALL">All Events ({metrics?.recentEvents.length ?? 0})</option>
                  <option value="HUMAN_CLICK">Human Clicks Only</option>
                  <option value="AUTOMATED_CLICK">Scanner / Bot Clicks Filtered</option>
                  <option value="email.opened">Opened</option>
                  <option value="email.delivered">Delivered</option>
                  <option value="ISSUES">Bounces, Complaints &amp; Failures</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Classification</th>
                      <th className="p-3">Coach Email</th>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Details / Target URL</th>
                      <th className="p-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredEvents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          No webhook events match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      filteredEvents.map((ev: MailerEventRow) => (
                        <tr key={ev.id} className="hover:bg-muted/20">
                          <td className="p-3 whitespace-nowrap">
                            <EventBadge event={ev} />
                          </td>
                          <td className="p-3 font-medium text-foreground">{ev.recipient_email}</td>
                          <td className="p-3 text-muted-foreground max-w-xs truncate">
                            {ev.subject || "—"}
                          </td>
                          <td className="p-3 text-muted-foreground max-w-xs truncate">
                            {ev.clicked_url || ev.clicked_link ? (
                              <a
                                href={ev.clicked_url || ev.clicked_link || "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline font-mono text-[11px]"
                              >
                                {ev.clicked_url || ev.clicked_link}
                              </a>
                            ) : ev.bounce_reason ? (
                              <span className="text-rose-400">{ev.bounce_reason}</span>
                            ) : ev.user_agent ? (
                              <span className="text-[10px] opacity-75">{ev.user_agent}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            {new Date(ev.occurred_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function EventBadge({ event }: { event: MailerEventRow }) {
  const type = event.event_type;

  if (type === "email.clicked") {
    if (event.is_automated_click) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-500/20 text-zinc-300 border border-zinc-500/30"
          title="Filtered out from primary KPIs: probable security scanner (<=10s after delivery, burst click, or bot User-Agent)."
        >
          <Bot className="w-3 h-3" />
          Scanner Filtered
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
        <MousePointerClick className="w-3 h-3" />
        Human Click
      </span>
    );
  }

  if (type === "email.opened") {
    if (event.is_privacy_proxy_open) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/25"
          title="Opened via image proxy (GoogleImageProxy / YahooMailProxy)"
        >
          <Eye className="w-3 h-3" />
          Proxy Open
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-400">
        <Eye className="w-3 h-3" />
        Opened
      </span>
    );
  }

  if (type === "email.delivered") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">
        <CheckCircle2 className="w-3 h-3" />
        Delivered
      </span>
    );
  }

  if (type === "email.bounced" || type === "email.failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400">
        <XCircle className="w-3 h-3" />
        {type === "email.failed" ? "Failed" : "Bounced"}
      </span>
    );
  }

  if (type === "email.complained" || type === "email.suppressed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400">
        <AlertTriangle className="w-3 h-3" />
        {type === "email.suppressed" ? "Suppressed" : "Complained"}
      </span>
    );
  }

  if (type === "email.delivery_delayed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300">
        <Clock className="w-3 h-3" />
        Delayed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-500/15 text-zinc-400">
      <Send className="w-3 h-3" />
      {type.replace(/^email\./, "")}
    </span>
  );
}

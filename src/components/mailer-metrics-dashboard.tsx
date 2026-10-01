import React, { useEffect, useState, useTransition } from "react";
import {
  Send,
  CheckCircle2,
  Eye,
  MousePointerClick,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  Calendar,
  Layers,
  TrendingUp,
  Inbox,
  Clock,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { getMailerMetricsServerFn } from "@/lib/email/recruit-email.functions";
import type { MailerMetricsReport } from "@/types/db";

interface MailerMetricsDashboardProps {
  onRefreshHistory?: () => void;
}

export function MailerMetricsDashboard({ onRefreshHistory }: MailerMetricsDashboardProps) {
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "custom">("30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [report, setReport] = useState<MailerMetricsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const fetchMetrics = React.useCallback(
    async (selectedRange: "7d" | "30d" | "90d" | "custom", start?: string, end?: string) => {
      setLoading(true);
      try {
        const data = await getMailerMetricsServerFn({
          data: {
            range: selectedRange,
            startDate: selectedRange === "custom" ? start : undefined,
            endDate: selectedRange === "custom" ? end : undefined,
          },
        });
        setReport(data);
      } catch (err) {
        console.error("[mailer-metrics] Failed to load metrics:", err);
        toast.error("Failed to load email performance metrics.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchMetrics(range, customStartDate, customEndDate);
  }, [fetchMetrics, range, customStartDate, customEndDate]);

  const handleRangeChange = (newRange: "7d" | "30d" | "90d" | "custom") => {
    setRange(newRange);
    if (newRange !== "custom") {
      startTransition(() => {
        fetchMetrics(newRange);
      });
    }
  };

  const handleApplyCustomDates = () => {
    if (!customStartDate || !customEndDate) {
      toast.error("Please specify both start and end dates.");
      return;
    }
    startTransition(() => {
      fetchMetrics("custom", customStartDate, customEndDate);
    });
  };

  const handleRefresh = () => {
    startTransition(() => {
      fetchMetrics(range, customStartDate, customEndDate);
      if (onRefreshHistory) {
        onRefreshHistory();
      }
    });
  };

  const totals = report?.totals || {
    sent: 0,
    delivered: 0,
    opened: 0,
    unique_opened: 0,
    clicked: 0,
    unique_clicked: 0,
    bounced: 0,
    bounced_permanent: 0,
    bounced_transient: 0,
    delivery_delayed: 0,
    unsubscribed: 0,
    complained: 0,
    failed: 0,
    suppressed: 0,
    delivery_rate: 0,
    open_rate: 0,
    click_rate: 0,
    bounce_rate: 0,
    complaint_rate: 0,
    unsubscribe_rate: 0,
  };

  // Format chart time-series data
  const chartData = (report?.timeSeries || []).map((point) => {
    const d = new Date(point.period);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return {
      name: label,
      Sent: point.sent,
      Delivered: point.delivered,
      Opened: point.opened,
      Clicked: point.clicked,
      Bounced: point.bounced,
    };
  });

  return (
    <div className="space-y-6">
      {/* Top Filter and Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card border border-border rounded-xl p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Period:
          </span>
          {(["7d", "30d", "90d", "custom"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleRangeChange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                range === r
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {r === "7d"
                ? "Last 7 Days"
                : r === "30d"
                  ? "Last 30 Days"
                  : r === "90d"
                    ? "Last 90 Days"
                    : "Custom"}
            </button>
          ))}

          {range === "custom" && (
            <div className="flex items-center gap-2 mt-2 sm:mt-0">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-md border border-border bg-background text-foreground"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-md border border-border bg-background text-foreground"
              />
              <button
                type="button"
                onClick={handleApplyCustomDates}
                className="px-2.5 py-1 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {report && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {report.dataSource === "resend_api" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  Live Resend Metrics API
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                  <Clock className="w-3 h-3" />
                  Local Event Logs
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={loading || isPending}
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-all cursor-pointer disabled:opacity-50"
            title="Refresh metrics data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (Positive Engagement) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sent */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Sent</span>
            <div className="p-2 rounded-lg bg-zinc-500/10 text-zinc-500">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">{totals.sent.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <span>Dispatched via Resend</span>
          </div>
        </div>

        {/* Delivered */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Delivered</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-foreground">
              {totals.delivered.toLocaleString()}
            </div>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {totals.delivery_rate}%
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Inbox receipt confirmed</div>
        </div>

        {/* Opened */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Opens</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-foreground">
              {totals.opened.toLocaleString()}
            </div>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {totals.open_rate}%
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {totals.unique_opened.toLocaleString()} unique recipient opens
          </div>
        </div>

        {/* Clicked */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Clicks</span>
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <MousePointerClick className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-foreground">
              {totals.clicked.toLocaleString()}
            </div>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400">
              {totals.click_rate}%
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {totals.unique_clicked.toLocaleString()} unique clickers
          </div>
        </div>
      </div>

      {/* Secondary KPI Grid (Reputation & Deliverability Health) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card/60 border border-border rounded-xl p-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center justify-between">
            <span>Bounces</span>
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
          </div>
          <div className="text-lg font-bold text-foreground mt-1">
            {totals.bounced.toLocaleString()}
            <span className="text-xs font-medium text-red-500 ml-1.5">({totals.bounce_rate}%)</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {totals.bounced_permanent > 0 && `${totals.bounced_permanent} permanent`}
            {totals.bounced_transient > 0 && ` • ${totals.bounced_transient} transient`}
            {totals.bounced === 0 && "Zero delivery bounces"}
          </div>
        </div>

        <div className="bg-card/60 border border-border rounded-xl p-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center justify-between">
            <span>Complaints</span>
            <AlertOctagon className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-lg font-bold text-foreground mt-1">
            {totals.complained.toLocaleString()}
            <span className="text-xs font-medium text-amber-500 ml-1.5">
              ({totals.complaint_rate}%)
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Spam reports recorded</div>
        </div>

        <div className="bg-card/60 border border-border rounded-xl p-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center justify-between">
            <span>Unsubscribed</span>
            <ShieldAlert className="w-3.5 h-3.5 text-zinc-500" />
          </div>
          <div className="text-lg font-bold text-foreground mt-1">
            {totals.unsubscribed.toLocaleString()}
            <span className="text-xs font-medium text-zinc-400 ml-1.5">
              ({totals.unsubscribe_rate}%)
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Suppressed automatically</div>
        </div>

        <div className="bg-card/60 border border-border rounded-xl p-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center justify-between">
            <span>Delayed / Failed</span>
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="text-lg font-bold text-foreground mt-1">
            {(totals.delivery_delayed + totals.failed).toLocaleString()}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {totals.delivery_delayed} delayed • {totals.failed} failed
          </div>
        </div>
      </div>

      {/* Time-Series Chart: Performance Over Time */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Performance Over Time
            </h3>
            <p className="text-xs text-muted-foreground">
              Trend of dispatched, delivered, opened, and clicked emails across the selected period.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            Granularity: {report?.granularity || "daily"}
          </div>
        </div>

        <div className="h-72 w-full pt-2">
          {chartData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs">
              <Inbox className="w-8 h-8 mb-2 opacity-40" />
              <span>No activity recorded in this period.</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#71717a" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#71717a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorClicked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    borderRadius: "0.5rem",
                    fontSize: "0.75rem",
                    color: "#f4f4f5",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }}
                  iconType="circle"
                />
                <Area
                  type="monotone"
                  dataKey="Sent"
                  stroke="#71717a"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSent)"
                />
                <Area
                  type="monotone"
                  dataKey="Delivered"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorDelivered)"
                />
                <Area
                  type="monotone"
                  dataKey="Opened"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorOpened)"
                />
                <Area
                  type="monotone"
                  dataKey="Clicked"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorClicked)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Grid: Conversion Funnel & Campaign Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email Conversion Funnel */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Conversion Funnel
            </h3>
            <p className="text-xs text-muted-foreground">
              Step-by-step engagement from send to link click.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {/* Step 1: Sent */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-zinc-400" />
                  1. Sent
                </span>
                <span className="text-foreground">{totals.sent.toLocaleString()} (100%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-zinc-500 rounded-full" style={{ width: "100%" }} />
              </div>
            </div>

            {/* Step 2: Delivered */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-emerald-500 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  2. Delivered
                </span>
                <span className="text-foreground">
                  {totals.delivered.toLocaleString()}{" "}
                  <span className="text-muted-foreground">({totals.delivery_rate}%)</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, totals.delivery_rate)}%` }}
                />
              </div>
            </div>

            {/* Step 3: Opened */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-amber-500 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  3. Opened
                </span>
                <span className="text-foreground">
                  {totals.opened.toLocaleString()}{" "}
                  <span className="text-muted-foreground">({totals.open_rate}%)</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, totals.open_rate)}%` }}
                />
              </div>
            </div>

            {/* Step 4: Clicked */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-sky-500 flex items-center gap-1.5">
                  <MousePointerClick className="w-3.5 h-3.5" />
                  4. Clicked
                </span>
                <span className="text-foreground">
                  {totals.clicked.toLocaleString()}{" "}
                  <span className="text-muted-foreground">({totals.click_rate}%)</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, totals.click_rate)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-[11px] text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground">Click-to-Open Ratio (CTOR)</div>
            <div>
              {totals.opened > 0
                ? `${((totals.clicked / totals.opened) * 100).toFixed(1)}% of openers clicked an athlete link.`
                : "Awaiting open data to calculate CTOR."}
            </div>
          </div>
        </div>

        {/* Campaign Mode Performance Table */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Campaign Performance by Mode
            </h3>
            <p className="text-xs text-muted-foreground">
              Compare effectiveness across Single Athlete, Multi-Athlete Roster, and General
              Catalog.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="pb-2 font-semibold">Campaign Mode</th>
                  <th className="pb-2 font-semibold text-right">Sent</th>
                  <th className="pb-2 font-semibold text-right">Delivered</th>
                  <th className="pb-2 font-semibold text-right">Opens</th>
                  <th className="pb-2 font-semibold text-right">Clicks</th>
                  <th className="pb-2 font-semibold text-right">Delivery %</th>
                  <th className="pb-2 font-semibold text-right">Open %</th>
                  <th className="pb-2 font-semibold text-right">Click %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(report?.campaigns || []).map((camp) => (
                  <tr key={camp.mode} className="hover:bg-muted/20">
                    <td className="py-2.5 font-semibold text-foreground">{camp.label}</td>
                    <td className="py-2.5 text-right font-medium">{camp.sent}</td>
                    <td className="py-2.5 text-right font-medium">{camp.delivered}</td>
                    <td className="py-2.5 text-right text-amber-500 font-medium">{camp.opened}</td>
                    <td className="py-2.5 text-right text-sky-500 font-medium">{camp.clicked}</td>
                    <td className="py-2.5 text-right font-semibold text-emerald-500">
                      {camp.delivery_rate}%
                    </td>
                    <td className="py-2.5 text-right font-semibold text-amber-500">
                      {camp.open_rate}%
                    </td>
                    <td className="py-2.5 text-right font-semibold text-sky-500">
                      {camp.click_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delivery Problems & Diagnostics */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Delivery Issues & Diagnostics
            </h3>
            <p className="text-xs text-muted-foreground">
              Review bounces, transient delivery delays, and failures captured via webhooks or
              dispatch logs.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">Showing up to 50 recent events</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="pb-2 font-semibold">Recipient</th>
                <th className="pb-2 font-semibold">Institution</th>
                <th className="pb-2 font-semibold">Event Type</th>
                <th className="pb-2 font-semibold">Reason / Details</th>
                <th className="pb-2 font-semibold text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(report?.deliveryProblems || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1 opacity-70" />
                    No delivery issues reported in this period. All emails healthy.
                  </td>
                </tr>
              ) : (
                (report?.deliveryProblems || []).map((prob) => (
                  <tr key={prob.id} className="hover:bg-muted/20">
                    <td className="py-2.5 font-semibold text-foreground">{prob.recipient}</td>
                    <td className="py-2.5 text-muted-foreground">{prob.university_name || "—"}</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          prob.event_type.includes("bounce")
                            ? "bg-red-500/10 text-red-500 border border-red-500/20"
                            : prob.event_type.includes("complaint")
                              ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                              : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                        }`}
                      >
                        {prob.event_type}
                      </span>
                    </td>
                    <td
                      className="py-2.5 text-muted-foreground max-w-sm truncate"
                      title={prob.reason || ""}
                    >
                      {prob.reason || "Delivery rejected"}
                    </td>
                    <td className="py-2.5 text-right text-muted-foreground whitespace-nowrap">
                      {new Date(prob.occurred_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

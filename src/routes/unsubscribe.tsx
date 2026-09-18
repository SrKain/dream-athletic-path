import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Clock, Mail, ShieldAlert, ShieldX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PublicHeader } from "@/components/public-header";
import { unsubscribeServerFn } from "@/lib/email/recruit-email.functions";
import type { SuppressionType } from "@/types/db";

interface UnsubscribeSearch {
  email?: string;
}

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (search: Record<string, unknown>): UnsubscribeSearch => {
    return {
      email: typeof search.email === "string" ? search.email : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Manage Email Preferences | Go Team Go" },
      {
        name: "description",
        content:
          "Manage collegiate recruiting email preferences and suppression settings with Go Team Go.",
      },
    ],
  }),
  component: UnsubscribePage,
});

export function UnsubscribePage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email || "");
  const [suppressionType, setSuppressionType] = useState<SuppressionType>("temporary_6m");
  const [reason, setReason] = useState("not_interested");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.error("Please provide a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await unsubscribeServerFn({
        data: {
          email: cleanEmail,
          reason,
          suppressionType,
        },
      });

      if (res.success) {
        setIsSuccess(true);
        toast.success(
          suppressionType === "temporary_6m"
            ? "Recruiting outreach paused for 6 months."
            : "You have been permanently unsubscribed.",
        );
      } else {
        toast.error(res.message || "Failed to process unsubscribe request.");
      }
    } catch (err) {
      console.error("[unsubscribe] Error:", err);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <PublicHeader showBackToCatalog backLabel="Return to Catalog" />

      <main className="container-edge flex flex-1 items-center justify-center py-10 sm:py-14">
        <div className="w-full max-w-lg glass-panel rounded-2xl p-6 sm:p-8 shadow-xl border border-border/80 relative overflow-hidden">
          {/* Accent Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/80 to-secondary" />

          {isSuccess ? (
            <div className="text-center py-4 space-y-5">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-secondary/15 border border-secondary/30 flex items-center justify-center text-secondary shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {suppressionType === "temporary_6m"
                    ? "Communications Paused"
                    : "Unsubscribed Permanently"}
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                  {suppressionType === "temporary_6m" ? (
                    <>
                      The address <strong className="text-foreground font-semibold">{email}</strong>{" "}
                      will be paused from receiving recruit evaluations and showcase messages for
                      the next <strong className="text-foreground">6 months</strong>.
                    </>
                  ) : (
                    <>
                      The address <strong className="text-foreground font-semibold">{email}</strong>{" "}
                      has been added to our permanent suppression list. You will no longer receive
                      any recruiting messages from Go Team Go Agency.
                    </>
                  )}
                </p>
              </div>

              <div className="pt-4 border-t border-border/70 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Return to Go Team Go Hub
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-center space-y-2">
                <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2 shadow-sm">
                  <Mail className="w-6 h-6" />
                </div>
                <div className="eyebrow text-primary tracking-widest text-[11px]">
                  Go Team Go Agency
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
                  Manage Email Preferences
                </h1>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Choose how you would like Go Team Go Agency to manage communications for your
                  program.
                </p>
              </div>

              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label
                    className="text-xs font-semibold text-foreground"
                    htmlFor="unsubscribe-email"
                  >
                    Coach / Recruiter Email
                  </label>
                  <input
                    id="unsubscribe-email"
                    type="email"
                    required
                    placeholder="coach@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl bg-background/80 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>

                {/* Escolha entre 2 Níveis de Descadastro */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">
                    Select your preference:
                  </label>
                  <div className="space-y-2.5">
                    <label
                      htmlFor="suppression-type-temp"
                      className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                        suppressionType === "temporary_6m"
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-card/60 border-border/70 hover:bg-muted/50 hover:border-border text-muted-foreground"
                      }`}
                    >
                      <input
                        type="radio"
                        id="suppression-type-temp"
                        name="suppression_type"
                        value="temporary_6m"
                        checked={suppressionType === "temporary_6m"}
                        onChange={() => setSuppressionType("temporary_6m")}
                        className="mt-0.5 h-4 w-4 accent-primary text-primary focus:ring-primary"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                          <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span>Pause for now (6 Months) — Recommended</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground leading-normal">
                          Temporarily pauses all recruit showcase emails during this recruiting
                          cycle. Automatically re-evaluates next season.
                        </div>
                      </div>
                    </label>

                    <label
                      htmlFor="suppression-type-perm"
                      className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                        suppressionType === "permanent"
                          ? "bg-destructive/10 border-destructive shadow-sm"
                          : "bg-card/60 border-border/70 hover:bg-muted/50 hover:border-border text-muted-foreground"
                      }`}
                    >
                      <input
                        type="radio"
                        id="suppression-type-perm"
                        name="suppression_type"
                        value="permanent"
                        checked={suppressionType === "permanent"}
                        onChange={() => setSuppressionType("permanent")}
                        className="mt-0.5 h-4 w-4 accent-destructive text-destructive focus:ring-destructive"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-destructive">
                          <ShieldX className="w-3.5 h-3.5 shrink-0" />
                          <span>Unsubscribe permanently</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground leading-normal">
                          Permanently adds this address to our suppression list. You will not
                          receive future athlete evaluations or spotlights.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    className="text-xs font-medium text-foreground"
                    htmlFor="unsubscribe-reason"
                  >
                    Optional Reason
                  </label>
                  <select
                    id="unsubscribe-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl bg-background/80 border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all cursor-pointer"
                  >
                    <option value="not_interested">
                      Not currently recruiting international prospects
                    </option>
                    <option value="wrong_sport">
                      Not the correct coach or department for this sport
                    </option>
                    <option value="too_many_emails">Receiving too many recruiting messages</option>
                    <option value="roster_full">
                      Roster already finalized for this academic year
                    </option>
                    <option value="other">Other reason</option>
                  </select>
                </div>

                <div className="bg-muted/60 border border-border/70 rounded-xl p-3 text-[11px] text-muted-foreground flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    All changes take effect immediately across our automated collegiate dispatch
                    system.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={
                    suppressionType === "temporary_6m"
                      ? "liquid-button w-full h-11 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      : "w-full h-11 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
                  }
                >
                  {isSubmitting ? (
                    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : suppressionType === "temporary_6m" ? (
                    "Confirm 6-Month Pause"
                  ) : (
                    "Confirm Permanent Unsubscribe"
                  )}
                </button>
              </div>

              <div className="text-center pt-2 flex items-center justify-center gap-4 text-xs">
                <Link
                  to="/feedback"
                  search={{ email }}
                  className="text-primary hover:underline transition-colors text-[11px] font-medium"
                >
                  Just need specific positions? Provide roster feedback instead
                </Link>
              </div>
            </form>
          )}
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-muted-foreground border-t border-border/40">
        © {new Date().getFullYear()} Go Team Go Agency. All rights reserved.
      </footer>
    </div>
  );
}

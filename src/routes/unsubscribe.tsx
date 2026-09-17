import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, CheckCircle2, ShieldAlert, ArrowLeft, Clock, ShieldX } from "lucide-react";
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
    <div className="min-h-screen bg-[#0b0b0c] text-[#f4f4f5] flex flex-col items-center justify-center p-4 selection:bg-emerald-500/30 selection:text-emerald-200">
      <div className="w-full max-w-lg bg-[#141416] border border-[#26262a] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400" />

        {isSuccess ? (
          <div className="text-center py-6 space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-600/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {suppressionType === "temporary_6m"
                  ? "Communications Paused"
                  : "Unsubscribed Permanently"}
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-md mx-auto">
                {suppressionType === "temporary_6m" ? (
                  <>
                    The address <strong className="text-zinc-200">{email}</strong> will be paused
                    from receiving recruit evaluations and showcase messages for the next{" "}
                    <strong>6 months</strong>.
                  </>
                ) : (
                  <>
                    The address <strong className="text-zinc-200">{email}</strong> has been added to
                    our permanent suppression list. You will no longer receive any recruiting
                    messages from Go Team Go Agency.
                  </>
                )}
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Return to Go Team Go Portfolio
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-center space-y-1.5">
              <div className="mx-auto w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 mb-3 shadow-inner">
                <Mail className="w-6 h-6" />
              </div>
              <div className="text-[11px] font-bold tracking-widest text-emerald-500 uppercase">
                Go Team Go Agency
              </div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Manage Email Preferences
              </h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Choose how you would like Go Team Go Agency to manage communications for your
                program.
              </p>
            </div>

            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300" htmlFor="unsubscribe-email">
                  Coach / Recruiter Email
                </label>
                <input
                  id="unsubscribe-email"
                  type="email"
                  required
                  placeholder="coach@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                />
              </div>

              {/* Escolha entre 2 Níveis de Descadastro */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300">
                  Select your preference:
                </label>
                <div className="space-y-2.5">
                  <label
                    htmlFor="suppression-type-temp"
                    className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                      suppressionType === "temporary_6m"
                        ? "bg-emerald-950/30 border-emerald-500/50 text-white"
                        : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                    }`}
                  >
                    <input
                      type="radio"
                      id="suppression-type-temp"
                      name="suppression_type"
                      value="temporary_6m"
                      checked={suppressionType === "temporary_6m"}
                      onChange={() => setSuppressionType("temporary_6m")}
                      className="mt-1 h-4 w-4 text-emerald-500 border-zinc-700 focus:ring-emerald-500"
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                        <Clock className="w-3.5 h-3.5" />
                        Pause for now (6 Months) — Recommended
                      </div>
                      <div className="text-[11px] text-zinc-400 leading-normal">
                        Temporarily pauses all recruit showcase emails during this recruiting cycle.
                        Automatically re-evaluates next season.
                      </div>
                    </div>
                  </label>

                  <label
                    htmlFor="suppression-type-perm"
                    className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                      suppressionType === "permanent"
                        ? "bg-rose-950/30 border-rose-500/50 text-white"
                        : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                    }`}
                  >
                    <input
                      type="radio"
                      id="suppression-type-perm"
                      name="suppression_type"
                      value="permanent"
                      checked={suppressionType === "permanent"}
                      onChange={() => setSuppressionType("permanent")}
                      className="mt-1 h-4 w-4 text-rose-500 border-zinc-700 focus:ring-rose-500"
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                        <ShieldX className="w-3.5 h-3.5" />
                        Unsubscribe permanently
                      </div>
                      <div className="text-[11px] text-zinc-400 leading-normal">
                        Permanently adds this address to our suppression list. You will not receive
                        future athlete evaluations or spotlights.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300" htmlFor="unsubscribe-reason">
                  Optional Reason
                </label>
                <select
                  id="unsubscribe-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all cursor-pointer"
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

              <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-3 text-[11px] text-zinc-400 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  All changes take effect immediately across our automated collegiate dispatch
                  system.
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-emerald-950/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                className="text-amber-400 hover:text-amber-300 underline transition-colors"
              >
                Just need specific positions? Provide roster feedback instead
              </Link>
            </div>
          </form>
        )}
      </div>

      <div className="mt-8 text-center text-xs text-zinc-600">
        © {new Date().getFullYear()} Go Team Go Agency. All rights reserved.
      </div>
    </div>
  );
}

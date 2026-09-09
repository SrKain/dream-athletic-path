import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, CheckCircle2, ShieldAlert, ArrowLeft } from "lucide-react";
import { unsubscribeServerFn } from "@/lib/email/recruit-email.functions";

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

function UnsubscribePage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email || "");
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
        },
      });

      if (res.success) {
        setIsSuccess(true);
        toast.success("You have been unsubscribed from recruiting emails.");
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
      <div className="w-full max-w-md bg-[#141416] border border-[#26262a] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400" />

        {isSuccess ? (
          <div className="text-center py-4 space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-950/60 border border-emerald-600/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-white tracking-tight">
                Unsubscribed Successfully
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                The address <strong className="text-zinc-200">{email}</strong> has been permanently
                added to our suppression list. You will no longer receive athlete recruiting
                evaluations or showcase emails from Go Team Go Agency.
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-800">
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
              <div className="mx-auto w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 mb-3">
                <Mail className="w-6 h-6" />
              </div>
              <div className="text-[11px] font-bold tracking-widest text-emerald-500 uppercase">
                Go Team Go Agency
              </div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Email Preferences & Unsubscribe
              </h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Enter your email address below to stop receiving athletic recruiting and scouting
                emails from our agency.
              </p>
            </div>

            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300" htmlFor="unsubscribe-email">
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

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300" htmlFor="unsubscribe-reason">
                  Optional Reason
                </label>
                <select
                  id="unsubscribe-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all cursor-pointer"
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
                  Unsubscribing will immediately block all automated recruit emails, athlete teaser
                  profiles, and showcase alerts for this email address.
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-emerald-950/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmitting ? "Processing..." : "Confirm Unsubscribe"}
              </button>
            </div>

            <div className="text-center pt-2">
              <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Cancel and return to portfolio
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { MessageSquareQuote, CheckCircle2, ArrowLeft, Send, Sparkles } from "lucide-react";
import { submitInterestSignalServerFn } from "@/lib/email/recruit-email.functions";
import type { InterestSignalReason } from "@/types/db";

interface FeedbackSearch {
  email?: string;
  coachId?: string;
  athleteId?: string;
  position?: string;
}

export const Route = createFileRoute("/feedback")({
  validateSearch: (search: Record<string, unknown>): FeedbackSearch => {
    return {
      email: typeof search.email === "string" ? search.email : undefined,
      coachId: typeof search.coachId === "string" ? search.coachId : undefined,
      athleteId: typeof search.athleteId === "string" ? search.athleteId : undefined,
      position: typeof search.position === "string" ? search.position : undefined,
    };
  },
  component: FeedbackPage,
});

const REASON_OPTIONS: Array<{
  id: InterestSignalReason;
  title: string;
  description: string;
}> = [
  {
    id: "position_not_needed",
    title: "I don't need athletes in this position",
    description: "Our roster is currently set for this specific position.",
  },
  {
    id: "fully_recruited",
    title: "I've already filled all the spots I needed",
    description: "Our roster is full for the upcoming collegiate season.",
  },
  {
    id: "other_positions_only",
    title: "I'm only interested in other positions",
    description: "We are actively recruiting, but only for different positions/roles.",
  },
  {
    id: "specific_athlete_dislike",
    title: "I'm not interested in this specific athlete",
    description: "This particular profile does not align with our team requirements.",
  },
];

function FeedbackPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email || "");
  const [selectedReason, setSelectedReason] = useState<InterestSignalReason>("position_not_needed");
  const [positionInput, setPositionInput] = useState(search.position || "");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.error("Please provide a valid coach email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitInterestSignalServerFn({
        data: {
          coachEmail: cleanEmail,
          coachId: search.coachId || null,
          athleteId: search.athleteId || null,
          reason: selectedReason,
          position: positionInput.trim() || search.position || null,
          notes: notes.trim() || null,
        },
      });

      if (res.success) {
        setIsSuccess(true);
        toast.success("Thank you! Your recruiting preferences have been saved.");
      } else {
        toast.error(res.message || "Failed to submit feedback.");
      }
    } catch (err) {
      console.error("[feedback] Error submitting signal:", err);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-[#f4f4f5] flex flex-col items-center justify-center p-4 selection:bg-amber-500/30 selection:text-amber-200">
      <div className="w-full max-w-lg bg-[#141416] border border-[#26262a] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500" />

        {isSuccess ? (
          <div className="text-center py-6 space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-600/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                <Sparkles className="w-3 h-3" />
                Active for 6 Months
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Feedback Registered</h1>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-md mx-auto">
                Thank you Coach. We have recorded your preferences for{" "}
                <strong className="text-zinc-200">{email}</strong>. Our team will tailor future
                outreach to align with your roster availability over the next 6 months.
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Return to Go Team Go Hub
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="text-center space-y-1.5">
              <div className="mx-auto w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 mb-3 shadow-inner">
                <MessageSquareQuote className="w-6 h-6" />
              </div>
              <div className="text-[11px] font-bold tracking-widest text-amber-400 uppercase">
                Go Team Go Agency • Coach Roster Feedback
              </div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Recruiting Interest & Needs
              </h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Help us calibrate future prospect emails to match your exact program needs. Your
                preference will remain active for 6 months.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300" htmlFor="feedback-email">
                  Coach / Recruiter Email
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  required
                  placeholder="coach@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
                />
              </div>

              {/* Opções de Sinalização */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300">
                  Select the reason that best applies:
                </label>
                <div className="space-y-2">
                  {REASON_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      htmlFor={`feedback-reason-${opt.id}`}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        selectedReason === opt.id
                          ? "bg-amber-500/10 border-amber-500/50 text-white"
                          : "bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                      }`}
                    >
                      <input
                        type="radio"
                        id={`feedback-reason-${opt.id}`}
                        name="interest_reason"
                        value={opt.id}
                        checked={selectedReason === opt.id}
                        onChange={() => setSelectedReason(opt.id)}
                        className="mt-1 h-4 w-4 text-amber-500 border-zinc-700 focus:ring-amber-500"
                      />
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-zinc-100">{opt.title}</div>
                        <div className="text-[11px] text-zinc-400 leading-normal">
                          {opt.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Campo adicional de posição quando aplicável */}
              {(selectedReason === "position_not_needed" ||
                selectedReason === "other_positions_only") && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-medium text-zinc-300" htmlFor="feedback-position">
                    Position (Optional / Specific):
                  </label>
                  <input
                    id="feedback-position"
                    type="text"
                    placeholder="e.g., Setter, Center Back, Point Guard"
                    value={positionInput}
                    onChange={(e) => setPositionInput(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
                  />
                </div>
              )}

              {/* Observações adicionais */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300" htmlFor="feedback-notes">
                  Additional Notes for our Recruiting Team (Optional)
                </label>
                <textarea
                  id="feedback-notes"
                  rows={2}
                  placeholder="e.g., Only recruiting Class of 2027 or looking for Left-Footed Wingers..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all resize-none"
                />
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-amber-500/20 active:scale-[0.99]"
              >
                {isSubmitting ? (
                  <span className="inline-block w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Submit Recruiting Feedback
                  </>
                )}
              </button>

              <div className="text-center">
                <Link
                  to="/unsubscribe"
                  search={{ email }}
                  className="text-[11px] text-zinc-500 hover:text-zinc-400 underline transition-colors"
                >
                  Looking to stop all recruiting emails completely? Manage unsubscribe here
                </Link>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

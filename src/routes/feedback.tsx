import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, MessageSquareQuote, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PublicHeader } from "@/components/public-header";
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
  head: () => ({
    meta: [
      { title: "Coach Recruiting Feedback | Go Team Go" },
      {
        name: "description",
        content: "Calibrate your roster recruiting preferences and position needs with Go Team Go.",
      },
    ],
  }),
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
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <PublicHeader showBackToCatalog backLabel="Return to Catalog" />

      <main className="container-edge flex flex-1 items-center justify-center py-10 sm:py-14">
        <div className="w-full max-w-lg glass-panel rounded-2xl p-6 sm:p-8 shadow-xl border border-border/80 relative overflow-hidden">
          {/* Subtle Top Accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/80 to-secondary" />

          {isSuccess ? (
            <div className="text-center py-4 space-y-5">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-secondary/15 border border-secondary/30 flex items-center justify-center text-secondary shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-[11px] font-bold text-primary eyebrow">
                  <Sparkles className="w-3.5 h-3.5" />
                  Active for 6 Months
                </div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                  Feedback Registered
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                  Thank you Coach. We have recorded your preferences for{" "}
                  <strong className="text-foreground font-semibold">{email}</strong>. Our team will
                  tailor future outreach to align with your roster availability over the next 6
                  months.
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
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="text-center space-y-2">
                <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2 shadow-sm">
                  <MessageSquareQuote className="w-6 h-6" />
                </div>
                <div className="eyebrow text-primary tracking-widest text-[11px]">
                  Go Team Go • Coach Roster Feedback
                </div>
                <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
                  Recruiting Interest & Needs
                </h1>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Help us calibrate future prospect emails to match your exact program needs. Your
                  preference will remain active for 6 months.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground" htmlFor="feedback-email">
                    Coach / Recruiter Email
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    required
                    placeholder="coach@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl bg-background/80 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>

                {/* Opções de Sinalização */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">
                    Select the reason that best applies:
                  </label>
                  <div className="space-y-2">
                    {REASON_OPTIONS.map((opt) => {
                      const isSelected = selectedReason === opt.id;
                      return (
                        <label
                          key={opt.id}
                          htmlFor={`feedback-reason-${opt.id}`}
                          className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? "bg-primary/10 border-primary shadow-sm"
                              : "bg-card/60 border-border/70 hover:bg-muted/50 hover:border-border text-muted-foreground"
                          }`}
                        >
                          <input
                            type="radio"
                            id={`feedback-reason-${opt.id}`}
                            name="interest_reason"
                            value={opt.id}
                            checked={isSelected}
                            onChange={() => setSelectedReason(opt.id)}
                            className="mt-0.5 h-4 w-4 accent-primary text-primary focus:ring-primary"
                          />
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-foreground">{opt.title}</div>
                            <div className="text-[11px] text-muted-foreground leading-normal">
                              {opt.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Campo adicional de posição quando aplicável */}
                {(selectedReason === "position_not_needed" ||
                  selectedReason === "other_positions_only") && (
                  <div className="space-y-1.5 pt-1">
                    <label
                      className="text-xs font-medium text-foreground"
                      htmlFor="feedback-position"
                    >
                      Position (Optional / Specific):
                    </label>
                    <input
                      id="feedback-position"
                      type="text"
                      placeholder="e.g., Setter, Outside Hitter, Libero"
                      value={positionInput}
                      onChange={(e) => setPositionInput(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl bg-background/80 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                    />
                  </div>
                )}

                {/* Observações adicionais */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground" htmlFor="feedback-notes">
                    Additional Notes for our Recruiting Team (Optional)
                  </label>
                  <textarea
                    id="feedback-notes"
                    rows={2}
                    placeholder="e.g., Only recruiting Class of 2027 or looking for Left-Footed Wingers..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-3 rounded-xl bg-background/80 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all resize-none"
                  />
                </div>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="liquid-button w-full h-11 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="inline-block w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
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
                    className="text-[11px] text-muted-foreground hover:text-foreground underline transition-colors"
                  >
                    Looking to stop all recruiting emails completely? Manage unsubscribe here
                  </Link>
                </div>
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

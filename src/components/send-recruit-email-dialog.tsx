import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  History,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { buttonClass, secondaryButtonClass, inputClass } from "@/components/admin-ui";
import { renderRecruitEmail } from "@/lib/email/recruit-email-template";
import { sendRecruitEmailServerFn } from "@/lib/email/recruit-email.functions";
import { supabase } from "@/lib/supabase/client";
import type { Athlete, AthleteProfile, Coach } from "@/types/db";

interface SendRecruitEmailDialogProps {
  athlete: Athlete;
  profile?: Partial<AthleteProfile> | null;
  sportName?: string | null;
  positionName?: string | null;
  countryFlag?: string | null;
  nationalityName?: string | null;
  open: boolean;
  onClose: () => void;
}

export function SendRecruitEmailDialog({
  athlete,
  profile,
  sportName,
  positionName,
  countryFlag,
  nationalityName,
  open,
  onClose,
}: SendRecruitEmailDialogProps) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previousSentMap, setPreviousSentMap] = useState<Map<string, string>>(new Map());
  const [isSending, setIsSending] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"coaches" | "preview">("coaches");

  // Carregar coaches e logs anteriores para este atleta
  const loadData = useCallback(async () => {
    setLoadingCoaches(true);
    setFetchError(null);
    try {
      const [coachesRes, logsRes] = await Promise.all([
        supabase.from("coaches").select("*").order("name", { ascending: true }),
        supabase
          .from("recruit_email_logs")
          .select("coach_id, sent_at, status")
          .eq("athlete_id", athlete.id)
          .eq("status", "sent")
          .order("sent_at", { ascending: false }),
      ]);

      if (coachesRes.error) {
        setFetchError(coachesRes.error.message);
        toast.error("Failed to load coaches: " + coachesRes.error.message);
      } else {
        setCoaches((coachesRes.data ?? []) as Coach[]);
      }

      if (logsRes.data) {
        const map = new Map<string, string>();
        for (const log of logsRes.data) {
          if (!map.has(log.coach_id)) {
            map.set(log.coach_id, log.sent_at);
          }
        }
        setPreviousSentMap(map);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load data";
      setFetchError(message);
    } finally {
      setLoadingCoaches(false);
    }
  }, [athlete.id]);

  useEffect(() => {
    if (!open) return;
    void loadData();
  }, [open, loadData]);

  // Coaches filtrados pela busca
  const filteredCoaches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coaches;
    return coaches.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.institution && c.institution.toLowerCase().includes(q)),
    );
  }, [coaches, search]);

  // Gerar dados do template WYSIWYG
  const emailTemplate = useMemo(() => {
    return renderRecruitEmail({
      athleteName: athlete.full_name,
      athleteSlug: athlete.slug,
      photoUrl: athlete.photo_url,
      positionName,
      sportName,
      heightCm: athlete.height_cm,
      nationality: nationalityName,
      countryFlag,
      highSchoolGraduation: profile?.high_school_graduation,
      graduationYear: profile?.graduation_year,
      gpa: profile?.gpa,
      athleteStatus: profile?.athlete_status,
      highlightNote: profile?.highlight_note,
    });
  }, [
    athlete.full_name,
    athlete.slug,
    athlete.photo_url,
    athlete.height_cm,
    positionName,
    sportName,
    nationalityName,
    countryFlag,
    profile?.high_school_graduation,
    profile?.graduation_year,
    profile?.gpa,
    profile?.athlete_status,
    profile?.highlight_note,
  ]);

  // Ações de seleção
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of filteredCoaches) {
        next.add(c.id);
      }
      return next;
    });
  }

  function handleDeselectAll() {
    setSelectedIds(new Set());
  }

  async function handleExecuteSend() {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one coach.");
      return;
    }

    setIsSending(true);
    setConfirmSendOpen(false);

    try {
      const coachIds = Array.from(selectedIds);
      const res = await sendRecruitEmailServerFn({
        data: {
          athleteId: athlete.id,
          coachIds,
        },
      });

      if (res.success) {
        if (res.totalFailed > 0) {
          toast.warning(`Sent teaser to ${res.totalSent} coaches, but ${res.totalFailed} failed.`, {
            duration: 6000,
          });
        } else {
          toast.success(`Successfully sent recruit teaser to all ${res.totalSent} coaches!`, {
            duration: 5000,
          });
        }
        onClose();
      } else {
        toast.error(res.message || "Failed to send email to selected coaches.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error sending recruit emails";
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  }

  if (!open) return null;

  const selectedCount = selectedIds.size;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Send Recruit Teaser to Coaches</h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                  {athlete.full_name}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Mass distribution showcase email linking directly to verified public profile.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/admin/coaches"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800/80 hover:bg-zinc-700 hover:text-white border border-zinc-700 transition-colors"
              title="Open Coaches Directory in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5 text-emerald-400" />
              Manage Coaches
            </a>

            {/* Mobile Tab Switcher */}
            <div className="flex lg:hidden rounded-lg bg-zinc-800 p-1 border border-zinc-700/60 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("coaches")}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  activeTab === "coaches" ? "bg-zinc-900 text-white shadow" : "text-zinc-400"
                }`}
              >
                Coaches ({selectedCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  activeTab === "preview" ? "bg-zinc-900 text-white shadow" : "text-zinc-400"
                }`}
              >
                Preview
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body - 2 Columns on Desktop */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* Left Column: Coaches Selector (7 cols) */}
          <div
            className={`lg:col-span-7 flex flex-col border-r border-zinc-800/80 bg-zinc-900/50 ${
              activeTab === "coaches" ? "flex" : "hidden lg:flex"
            }`}
          >
            {/* Filter & Selection Controls */}
            <div className="p-4 border-b border-zinc-800/80 space-y-3 bg-zinc-950/20">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter coaches by name, university or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${inputClass} pl-9 text-xs`}
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    disabled={filteredCoaches.length === 0}
                    className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Select All {search ? "Filtered" : ""} ({filteredCoaches.length})
                  </button>
                  <span className="text-zinc-600">•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    disabled={selectedCount === 0}
                    className="text-zinc-400 hover:text-zinc-300 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Deselect All
                  </button>
                </div>

                <div className="font-semibold text-zinc-300">
                  <span className="text-emerald-400 font-bold">{selectedCount}</span> of{" "}
                  {coaches.length} selected
                </div>
              </div>
            </div>

            {/* List of Coaches */}
            <div className="flex-1 overflow-y-auto p-2 divide-y divide-zinc-800/40">
              {fetchError ? (
                <div className="py-12 px-4 text-center">
                  <div className="w-10 h-10 rounded-full bg-red-950/50 border border-red-800/50 text-red-400 flex items-center justify-center mx-auto mb-2">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-white mb-1">Failed to load coaches</p>
                  <p className="text-xs text-zinc-400 mb-4">{fetchError}</p>
                  <button
                    type="button"
                    onClick={() => void loadData()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </button>
                </div>
              ) : loadingCoaches ? (
                <div className="py-20 text-center text-zinc-400">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-emerald-500 mb-2" />
                  <p className="text-xs">Loading coaches directory...</p>
                </div>
              ) : coaches.length === 0 ? (
                <div className="py-12 px-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center mx-auto mb-3 text-emerald-400">
                    <Users className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1">
                    No Coaches in Directory Yet
                  </h4>
                  <p className="text-xs text-zinc-400 max-w-xs mx-auto mb-5 leading-relaxed">
                    You have not added any collegiate coaches to your database yet. Import your
                    spreadsheet or add coaches manually in the coaches directory.
                  </p>
                  <a
                    href="/admin/coaches"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Manage &amp; Import Coaches
                  </a>
                </div>
              ) : filteredCoaches.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-medium">No coaches found</p>
                  {search && (
                    <p className="text-[11px] text-zinc-600 mt-1">
                      Try adjusting your search query
                    </p>
                  )}
                </div>
              ) : (
                filteredCoaches.map((coach) => {
                  const isSelected = selectedIds.has(coach.id);
                  const lastSentAt = previousSentMap.get(coach.id);

                  return (
                    <div
                      key={coach.id}
                      onClick={() => toggleSelect(coach.id)}
                      className={`p-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-emerald-950/20 border border-emerald-800/40"
                          : "hover:bg-zinc-800/40 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Custom Checkbox */}
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? "bg-emerald-500 text-white"
                              : "border border-zinc-600 bg-zinc-800/80"
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white truncate">
                              {coach.name}
                            </span>
                            {lastSentAt && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60"
                                title={`Already sent on ${new Date(lastSentAt).toLocaleDateString()}`}
                              >
                                <History className="h-2.5 w-2.5 text-zinc-400" />
                                Sent {new Date(lastSentAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-zinc-400 mt-0.5">
                            <span className="font-mono text-zinc-400 truncate">{coach.email}</span>
                            {coach.institution && (
                              <>
                                <span className="text-zinc-600">•</span>
                                <span className="truncate flex items-center gap-1 text-zinc-300">
                                  <Building2 className="h-3 w-3 text-zinc-500" />
                                  {coach.institution}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: WYSIWYG Email Preview (5 cols) */}
          <div
            className={`lg:col-span-5 flex flex-col bg-zinc-950/80 ${
              activeTab === "preview" ? "flex" : "hidden lg:flex"
            }`}
          >
            {/* Header com Subject */}
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-1">
                <Eye className="h-3.5 w-3.5" /> Email Preview
              </div>
              <div className="text-xs text-zinc-300 font-medium">
                <span className="text-zinc-500 font-normal">Subject: </span>
                {emailTemplate.subject}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-2">
                <span>
                  From: <strong>Go Team Go &lt;contact@goteamgoagency.com&gt;</strong>
                </span>
                <span>•</span>
                <span>
                  To: <strong>Individual Coach Email</strong>
                </span>
              </div>
            </div>

            {/* Email HTML Render Frame */}
            <div className="flex-1 p-3 overflow-hidden bg-black/40">
              <iframe
                title="Email Preview"
                srcDoc={emailTemplate.html}
                className="w-full h-full rounded-xl border border-zinc-800 bg-[#0b0b0c]"
                sandbox="allow-popups allow-popups-to-escape-sandbox"
              />
            </div>
          </div>
        </div>

        {/* Modal Bottom Bar */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-zinc-400 text-center sm:text-left">
            Recipient coaches will receive a clean teaser linking directly to{" "}
            <span className="text-zinc-300 font-mono">
              portfolio.goteamgoagency.com/athlete/{athlete.slug}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              disabled={isSending}
              onClick={onClose}
              className={secondaryButtonClass}
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isSending || selectedCount === 0}
              onClick={() => setConfirmSendOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-950 hover:bg-emerald-500 disabled:opacity-50 disabled:pointer-events-none transition-all"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending batch...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send to {selectedCount} {selectedCount === 1 ? "Coach" : "Coaches"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mini Confirm Dialog */}
      {confirmSendOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
              <Send className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Confirm Email Blast</h3>
            <p className="text-xs text-zinc-300 mb-4 leading-relaxed">
              You are about to send the recruit teaser for{" "}
              <strong className="text-white">{athlete.full_name}</strong> to{" "}
              <strong className="text-emerald-400">{selectedCount} collegiate coaches</strong>.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isSending}
                onClick={() => setConfirmSendOpen(false)}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSending}
                onClick={() => void handleExecuteSend()}
                className={buttonClass}
              >
                {isSending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Confirm and Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

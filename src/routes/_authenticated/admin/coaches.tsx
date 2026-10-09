import { createFileRoute } from "@tanstack/react-router";
import { Building2, GraduationCap, Loader2, Mail, Pencil, Plus, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { EmptyState, Panel, buttonClass, inputClass, secondaryButtonClass } from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
import {
  addCoachPreferenceSignalServerFn,
  closeCoachPreferenceSignalServerFn,
  getCoachPreferencesServerFn,
  removeManualCoachSuppressionServerFn,
  setCoachSuppressionServerFn,
} from "@/lib/email/recruit-email.functions";
import type { Coach, CoachInterestSignal, EmailSuppression, InterestSignalReason, SuppressionType, University, UniversityCoach } from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/coaches")({ component: CoachesPage });

type CoachRow = UniversityCoach & { universityId: string; universityName: string };
type CoachForm = { firstName: string; lastName: string; email: string; phone: string; role: string; universityId: string };
const EMPTY_FORM: CoachForm = { firstName: "", lastName: "", email: "", phone: "", role: "", universityId: "" };
const REASONS: Record<InterestSignalReason, string> = {
  position_not_needed: "Position not needed",
  fully_recruited: "Roster already full",
  other_positions_only: "Looking for other positions",
  specific_athlete_dislike: "Specific athlete is not a fit",
};

function CoachesPage() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [legacyCoaches, setLegacyCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUniversity, setSelectedUniversity] = useState("all");
  const [form, setForm] = useState<CoachForm>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CoachRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null);
  const [legacyUniversity, setLegacyUniversity] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const [universitiesRes, legacyRes] = await Promise.all([
      supabase.from("universities").select("*").order("name"),
      supabase.from("coaches").select("*").order("name"),
    ]);
    if (universitiesRes.error) toast.error(`Could not load universities: ${universitiesRes.error.message}`);
    else setUniversities((universitiesRes.data ?? []) as University[]);
    if (legacyRes.error) toast.error(`Could not load legacy contacts: ${legacyRes.error.message}`);
    else setLegacyCoaches((legacyRes.data ?? []) as Coach[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const coaches = useMemo<CoachRow[]>(() => universities.flatMap((university) =>
    (Array.isArray(university.coaches) ? university.coaches : []).map((coach) => ({
      ...coach,
      universityId: university.id,
      universityName: university.name,
    }))), [universities]);
  const registeredEmails = useMemo(() => new Set(coaches.map((coach) => coach.email.toLowerCase().trim())), [coaches]);
  const orphanedLegacy = useMemo(() => legacyCoaches.filter((coach) => !registeredEmails.has(coach.email.toLowerCase().trim())), [legacyCoaches, registeredEmails]);
  const visibleCoaches = useMemo(() => {
    const query = search.trim().toLowerCase();
    return coaches.filter((coach) =>
      (selectedUniversity === "all" || coach.universityId === selectedUniversity) &&
      (!query || `${coach.first_name} ${coach.last_name} ${coach.email} ${coach.universityName} ${coach.role ?? ""}`.toLowerCase().includes(query)));
  }, [coaches, search, selectedUniversity]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, universityId: selectedUniversity === "all" ? "" : selectedUniversity });
    setFormOpen(true);
  }
  function openEdit(coach: CoachRow) {
    setEditing(coach);
    setForm({ firstName: coach.first_name, lastName: coach.last_name, email: coach.email, phone: coach.phone ?? "", role: coach.role ?? "", universityId: coach.universityId });
    setFormOpen(true);
  }
  function closeForm() { setEditing(null); setForm(EMPTY_FORM); setFormOpen(false); }

  async function saveCoach(event: FormEvent) {
    event.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!form.universityId || !form.firstName.trim() || !email.includes("@")) {
      toast.error("Select a university, enter the coach's first name and a valid email.");
      return;
    }
    const destination = universities.find((item) => item.id === form.universityId);
    if (!destination) return;
    const source = editing ? universities.find((item) => item.id === editing.universityId) : destination;
    if (!source) return;
    if (editing && editing.email.toLowerCase() !== email && !window.confirm(`The coach email is changing from ${editing.email} to ${email}. Existing preference and suppression records will remain attached to the old address. Continue?`)) return;
    const sameEmail = coaches.find((item) => item.email.toLowerCase() === email && item.id !== editing?.id && item.universityId === form.universityId);
    if (sameEmail) { toast.error("This email is already registered for this university."); return; }
    const entry: UniversityCoach = {
      id: editing?.id ?? crypto.randomUUID(),
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email,
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.role.trim() ? { role: form.role.trim() } : {}),
    };
    setSaving(true);
    try {
      if (editing && editing.universityId !== form.universityId) {
        const destinationResult = await supabase.from("universities").update({ coaches: [...(destination.coaches ?? []), entry] }).eq("id", destination.id);
        if (destinationResult.error) throw new Error(destinationResult.error.message);
        const sourceCoaches = (source.coaches ?? []).filter((item) => item.id !== editing.id);
        const sourceResult = await supabase.from("universities").update({ coaches: sourceCoaches }).eq("id", source.id);
        if (sourceResult.error) throw new Error(`Coach was added to the new university but could not be removed from the old one: ${sourceResult.error.message}`);
      } else {
        const destinationCoaches = (destination.coaches ?? []).filter((item) => item.id !== entry.id);
        const result = await supabase.from("universities").update({ coaches: [...destinationCoaches, entry] }).eq("id", destination.id);
        if (result.error) throw new Error(result.error.message);
      }
      toast.success(editing ? "Coach updated." : "Coach added to the university.");
      closeForm();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save coach.");
    } finally { setSaving(false); }
  }

  async function adoptLegacy(coach: Coach) {
    const universityId = legacyUniversity[coach.id];
    const university = universities.find((item) => item.id === universityId);
    if (!university) { toast.error("Choose a university first."); return; }
    const [firstName, ...lastName] = coach.name.trim().split(/\s+/);
    const newCoach: UniversityCoach = { id: crypto.randomUUID(), first_name: firstName || coach.name, last_name: lastName.join(" "), email: coach.email.trim().toLowerCase() };
    const result = await supabase.from("universities").update({ coaches: [...(university.coaches ?? []), newCoach] }).eq("id", university.id);
    if (result.error) toast.error(`Could not associate contact: ${result.error.message}`);
    else { toast.success(`${coach.name} linked to ${university.name}. The original legacy record was preserved.`); await load(); }
  }

  async function removeCoach(coach: CoachRow) {
    if (!window.confirm(`Remove ${coach.first_name} ${coach.last_name} from ${coach.universityName}? Preference history and the legacy contact record will be preserved.`)) return;
    const university = universities.find((item) => item.id === coach.universityId);
    if (!university) return;
    const result = await supabase.from("universities").update({ coaches: (university.coaches ?? []).filter((item) => item.id !== coach.id) }).eq("id", university.id);
    if (result.error) toast.error(`Could not remove coach: ${result.error.message}`);
    else { toast.success("Coach removed from the university. Historical preferences were preserved."); await load(); }
  }

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Coaches">
        <div className="space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary"><GraduationCap className="h-5 w-5" /><h1 className="text-2xl font-bold tracking-tight text-foreground">Coach directory</h1></div>
              <p className="mt-1 text-sm text-muted-foreground">Manage university coaches, their contact details and recruiting preferences.</p>
            </div>
            <button type="button" onClick={openCreate} className={buttonClass}><Plus className="h-4 w-4" /> Add coach</button>
          </header>

          <div className="grid gap-3 md:grid-cols-[1fr_16rem]">
            <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label="Search coaches" className={`${inputClass} pl-9`} placeholder="Search name, email or university" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <select className={inputClass} aria-label="Filter by university" value={selectedUniversity} onChange={(event) => setSelectedUniversity(event.target.value)}><option value="all">All universities</option>{universities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </div>

          <Panel title={`University coaches · ${visibleCoaches.length}`}>
            {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading coaches…</div> : visibleCoaches.length === 0 ? <EmptyState>No university coaches found. Add one and link it to a university.</EmptyState> : (
              <div className="space-y-3">{visibleCoaches.map((coach) => {
                const key = `${coach.universityId}:${coach.id}`;
                return <article key={key} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0"><h2 className="font-semibold text-foreground">{coach.first_name} {coach.last_name}</h2><p className="mt-1 flex items-center gap-1.5 break-all text-sm text-muted-foreground"><Mail className="h-3.5 w-3.5 shrink-0" />{coach.email}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="h-3.5 w-3.5" />{coach.universityName}{coach.role ? ` · ${coach.role}` : ""}{coach.phone ? ` · ${coach.phone}` : ""}</p></div>
                    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openEdit(coach)} className={secondaryButtonClass}><Pencil className="h-4 w-4" /> Edit details</button><button type="button" onClick={() => setExpandedCoach(expandedCoach === key ? null : key)} className={secondaryButtonClass} aria-expanded={expandedCoach === key}><ShieldAlert className="h-4 w-4" /> Preferences</button><button type="button" onClick={() => void removeCoach(coach)} className={secondaryButtonClass} aria-label={`Remove ${coach.first_name} ${coach.last_name}`}><Trash2 className="h-4 w-4" /> Remove</button></div>
                  </div>
                  {expandedCoach === key && <CoachPreferences coach={coach} />}
                </article>;
              })}</div>
            )}
          </Panel>

          {orphanedLegacy.length > 0 && <Panel title={`Legacy contacts to associate · ${orphanedLegacy.length}`}>
            <p className="mb-3 text-sm text-muted-foreground">These records are preserved in the old contacts table and are not yet connected to a university. Linking copies the coach into the university directory without deleting the source record.</p>
            <div className="space-y-3">{orphanedLegacy.map((coach) => <div key={coach.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_16rem_auto] sm:items-center"><div><p className="font-medium text-foreground">{coach.name}</p><p className="text-xs text-muted-foreground">{coach.email}{coach.institution ? ` · ${coach.institution}` : ""}</p></div><select className={inputClass} value={legacyUniversity[coach.id] ?? ""} onChange={(event) => setLegacyUniversity((state) => ({ ...state, [coach.id]: event.target.value }))}><option value="">Choose university…</option>{universities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className={secondaryButtonClass} disabled={!legacyUniversity[coach.id]} onClick={() => void adoptLegacy(coach)}>Associate</button></div>)}</div>
          </Panel>}
        </div>

        {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <form onSubmit={saveCoach} className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="coach-form-title">
            <div className="flex items-start justify-between"><div><h2 id="coach-form-title" className="text-lg font-bold text-foreground">{editing ? "Edit coach" : "Add coach"}</h2><p className="text-sm text-muted-foreground">Coaches are always linked to a university.</p></div><button type="button" onClick={closeForm} className={secondaryButtonClass} aria-label="Close"><X className="h-4 w-4" /></button></div>
            <label className="block space-y-1 text-sm font-medium text-foreground">University<select required className={inputClass} value={form.universityId} onChange={(event) => setForm({ ...form, universityId: event.target.value })}><option value="">Select university…</option>{universities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm font-medium text-foreground">First name<input required className={inputClass} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label><label className="space-y-1 text-sm font-medium text-foreground">Last name<input className={inputClass} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label><label className="space-y-1 text-sm font-medium text-foreground">Email<input type="email" required className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="space-y-1 text-sm font-medium text-foreground">Phone<input type="tel" className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label className="space-y-1 text-sm font-medium text-foreground sm:col-span-2">Role / position<input className={inputClass} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="Head Coach, Assistant Coach…" /></label></div>
            <div className="flex justify-end gap-2 border-t border-border pt-3"><button type="button" className={secondaryButtonClass} onClick={closeForm}>Cancel</button><button type="submit" className={buttonClass} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editing ? "Save changes" : "Add coach"}</button></div>
          </form>
        </div>}
      </AppShell>
    </ProtectedPage>
  );
}

function CoachPreferences({ coach }: { coach: CoachRow }) {
  const [signals, setSignals] = useState<CoachInterestSignal[]>([]);
  const [suppression, setSuppression] = useState<EmailSuppression | null>(null);
  const [reason, setReason] = useState<InterestSignalReason>("position_not_needed");
  const [position, setPosition] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [notes, setNotes] = useState("");
  const [suppressionType, setSuppressionType] = useState<SuppressionType>("temporary_6m");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const email = coach.email.toLowerCase().trim();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCoachPreferencesServerFn({ data: { coachEmail: email, coachId: coach.id } });
      setSignals(data.signals as CoachInterestSignal[]);
      setSuppression((data.suppression as EmailSuppression | null) ?? null);
    } catch { toast.error("Could not load coach preferences."); }
    finally { setLoading(false); }
  }, [email, coach.id]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function addSignal() {
    setSaving(true);
    try {
      const result = await addCoachPreferenceSignalServerFn({ data: { coachId: coach.id, coachEmail: email, reason, position: position.trim() || null, athleteName: athleteName.trim() || null, notes: notes.trim() || null } });
      if (!result.success) { toast.error(result.message || "Could not save preference."); return; }
      toast.success("Fit preference saved for six months."); setPosition(""); setAthleteName(""); setNotes(""); await refresh();
    } finally { setSaving(false); }
  }
  async function toggleSuppression() {
    const active = !!suppression && (!suppression.expires_at || new Date(suppression.expires_at) > new Date());
    if (active && suppression?.reason === "admin_manual_preference") {
      if (!window.confirm(`Restore email communication for ${email}?`)) return;
      const result = await removeManualCoachSuppressionServerFn({ data: { email } });
      if (!result.success) toast.error(result.message || "Could not reactivate emails."); else toast.success("Email communication restored.");
    } else {
      if (active) { toast.error("This email has a suppression from another source and cannot be changed here."); return; }
      if (suppressionType === "permanent" && !window.confirm(`Block email communication permanently for ${email}?`)) return;
      const result = await setCoachSuppressionServerFn({ data: { email, suppressionType } });
      if (!result.success) toast.error(result.message || "Could not update communication preference."); else toast.success("Communication preference saved.");
    }
    await refresh();
  }

  const activeSuppression = !!suppression && (!suppression.expires_at || new Date(suppression.expires_at) > new Date());
  return <section className="mt-4 space-y-4 border-t border-border pt-4" aria-label="Coach preferences">
    <div><h3 className="font-semibold text-foreground">Fit and communication preferences</h3><p className="text-xs text-muted-foreground">Preferences are attached to {email} and applied by the Mailer.</p></div>
    {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading preferences…</p> : <>
      <div className="space-y-2">{signals.length === 0 ? <p className="text-sm text-muted-foreground">No fit preferences recorded.</p> : signals.map((signal) => { const active = new Date(signal.expires_at) > new Date(); return <div key={signal.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-medium text-foreground">{REASONS[signal.reason] ?? signal.reason} <span className="text-xs font-normal text-muted-foreground">· {active ? "Active" : "Expired"}</span></p>{(signal.position || signal.athlete_name) && <p className="text-xs text-muted-foreground">{[signal.position, signal.athlete_name].filter(Boolean).join(" · ")}</p>}{signal.notes && <p className="text-xs text-muted-foreground">{signal.notes}</p>}</div>{active && <button type="button" className={secondaryButtonClass} onClick={async () => { if (!window.confirm("End this fit preference now?")) return; const result = await closeCoachPreferenceSignalServerFn({ data: { id: signal.id, coachEmail: email, coachId: coach.id } }); if (!result.success) toast.error(result.message || "Could not end preference."); else { toast.success("Preference ended."); await refresh(); } }}>End preference</button>}</div>; })}</div>
      <div className="grid gap-3 rounded-lg bg-muted/30 p-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-medium text-foreground">Fit preference<select className={inputClass} value={reason} onChange={(event) => setReason(event.target.value as InterestSignalReason)}>{Object.entries(REASONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="space-y-1 text-xs font-medium text-foreground">Position, if applicable<input className={inputClass} value={position} onChange={(event) => setPosition(event.target.value)} placeholder="e.g. Setter" /></label>{reason === "specific_athlete_dislike" && <label className="space-y-1 text-xs font-medium text-foreground sm:col-span-2">Athlete name<input className={inputClass} value={athleteName} onChange={(event) => setAthleteName(event.target.value)} /></label>}<label className="space-y-1 text-xs font-medium text-foreground sm:col-span-2">Notes<input className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></label><button type="button" disabled={saving} className={`${buttonClass} sm:col-span-2 sm:justify-self-start`} onClick={() => void addSignal()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add fit preference · 6 months</button></div>
      <div className="space-y-2 rounded-lg border border-border p-3"><h4 className="text-sm font-semibold text-foreground">Email communication</h4>{activeSuppression && <p className="text-xs text-destructive">{suppression?.suppression_type === "permanent" ? "Permanent email block is active." : `Paused until ${new Date(suppression?.expires_at ?? "").toLocaleDateString()}.`}{suppression?.reason !== "admin_manual_preference" ? " This restriction came from another source and is preserved." : " Added manually."}</p>}{(!activeSuppression || suppression?.reason === "admin_manual_preference") && <div className="flex flex-col gap-2 sm:flex-row"><select aria-label="Email communication restriction" className={inputClass} value={suppressionType} onChange={(event) => setSuppressionType(event.target.value as SuppressionType)}><option value="temporary_6m">Pause for six months</option><option value="permanent">Block permanently</option></select><button type="button" className={secondaryButtonClass} onClick={() => void toggleSuppression()}><ShieldAlert className="h-4 w-4" />{activeSuppression ? "Restore email" : "Save restriction"}</button></div>}<p className="text-xs text-muted-foreground">Email restrictions block Mailer deliveries. Fit preferences are separate.</p></div>
    </>}
  </section>;
}

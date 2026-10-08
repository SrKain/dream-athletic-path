import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import {
  EmptyState,
  Panel,
  buttonClass,
  secondaryButtonClass,
  inputClass,
} from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
import type { Coach } from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/coaches")({
  component: CoachesPage,
});

interface ParsedCoachRow {
  name: string;
  email: string;
  institution?: string;
  status: "valid" | "duplicate" | "invalid";
  reason?: string;
}

function CoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modal Create / Edit
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formInstitution, setFormInstitution] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal Import
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ParsedCoachRow[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // Modal Delete
  const [deletingCoach, setDeletingCoach] = useState<Coach | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function loadCoaches() {
    setLoading(true);
    const { data, error } = await supabase
      .from("coaches")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      toast.error("Failed to load coaches: " + error.message);
    } else {
      setCoaches((data ?? []) as Coach[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadCoaches();
  }, []);

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

  function openCreateModal() {
    setEditingCoach(null);
    setFormName("");
    setFormEmail("");
    setFormInstitution("");
    setIsFormOpen(true);
  }

  function openEditModal(coach: Coach) {
    setEditingCoach(coach);
    setFormName(coach.name);
    setFormEmail(coach.email);
    setFormInstitution(coach.institution || "");
    setIsFormOpen(true);
  }

  async function handleSaveCoach(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = formEmail.trim().toLowerCase();
    const cleanName = formName.trim();
    const cleanInst = formInstitution.trim() || null;

    if (!cleanName) {
      toast.error("Please enter the coach's full name.");
      return;
    }

    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCoach) {
        // Atualizar
        const { error } = await supabase
          .from("coaches")
          .update({
            name: cleanName,
            email: cleanEmail,
            institution: cleanInst,
          })
          .eq("id", editingCoach.id);

        if (error) {
          if (error.message.includes("unique") || error.code === "23505") {
            toast.error("A coach with this email address already exists.");
          } else {
            toast.error(error.message);
          }
          return;
        }

        toast.success("Coach updated successfully.");
        setIsFormOpen(false);
        await loadCoaches();
      } else {
        // Criar
        const { error } = await supabase.from("coaches").insert({
          name: cleanName,
          email: cleanEmail,
          institution: cleanInst,
        });

        if (error) {
          if (error.message.includes("unique") || error.code === "23505") {
            toast.error("A coach with this email address already exists.");
          } else {
            toast.error(error.message);
          }
          return;
        }

        toast.success("Coach added successfully.");
        setIsFormOpen(false);
        await loadCoaches();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteCoach() {
    if (!deletingCoach) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("coaches").delete().eq("id", deletingCoach.id);

      if (error) {
        toast.error("Failed to delete coach: " + error.message);
      } else {
        toast.success("Coach deleted.");
        setDeletingCoach(null);
        await loadCoaches();
      }
    } finally {
      setIsDeleting(false);
    }
  }

  // File parsing for spreadsheets (CSV / XLSX)
  async function handleFileUpload(file: File) {
    setIsAnalyzing(true);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        toast.error("The uploaded spreadsheet is empty.");
        setIsAnalyzing(false);
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

      if (!rawRows || rawRows.length === 0) {
        toast.error("No data rows found in spreadsheet.");
        setIsAnalyzing(false);
        return;
      }

      // Buscar coaches já existentes para checagem de duplicidade
      const { data: existingCoaches } = await supabase.from("coaches").select("email");
      const existingEmailSet = new Set(
        (existingCoaches ?? []).map((c) => c.email.toLowerCase().trim()),
      );

      const parsed: ParsedCoachRow[] = [];
      const seenInFile = new Set<string>();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      for (const row of rawRows) {
        // Busca flexível de colunas
        const keys = Object.keys(row);

        // Nome
        const nameKey = keys.find((k) =>
          /^(name|full_name|coach|coach\s*name|nome|nome\s*completo)$/i.test(k.trim()),
        );
        // Email
        const emailKey = keys.find((k) =>
          /^(email|e-mail|mail|coach\s*email|contato)$/i.test(k.trim()),
        );
        // Instituição
        const instKey = keys.find((k) =>
          /^(institution|university|college|school|institui[cç][aã]o|universidade|faculdade)$/i.test(
            k.trim(),
          ),
        );

        const rawName = nameKey && row[nameKey] ? String(row[nameKey]).trim() : "";
        const rawEmail =
          emailKey && row[emailKey] ? String(row[emailKey]).trim().toLowerCase() : "";
        const rawInst = instKey && row[instKey] ? String(row[instKey]).trim() : "";

        if (!rawEmail || !emailRegex.test(rawEmail)) {
          parsed.push({
            name: rawName || "Unknown",
            email: rawEmail || "(missing email)",
            institution: rawInst || undefined,
            status: "invalid",
            reason: !rawEmail ? "Missing email" : "Invalid email format",
          });
          continue;
        }

        if (seenInFile.has(rawEmail)) {
          parsed.push({
            name: rawName || "Unknown",
            email: rawEmail,
            institution: rawInst || undefined,
            status: "duplicate",
            reason: "Duplicate email inside spreadsheet",
          });
          continue;
        }

        if (existingEmailSet.has(rawEmail)) {
          parsed.push({
            name: rawName || "Unknown",
            email: rawEmail,
            institution: rawInst || undefined,
            status: "duplicate",
            reason: "Already registered in system",
          });
          continue;
        }

        seenInFile.add(rawEmail);
        parsed.push({
          name: rawName || rawEmail.split("@")[0],
          email: rawEmail,
          institution: rawInst || undefined,
          status: "valid",
        });
      }

      setImportRows(parsed);
    } catch (err) {
      console.error("Spreadsheet parse error:", err);
      toast.error("Could not parse file. Please upload a valid CSV or XLSX.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function executeImport() {
    const validRows = importRows.filter((r) => r.status === "valid");
    if (validRows.length === 0) {
      toast.error("No valid coaches to import.");
      return;
    }

    setIsImporting(true);
    try {
      const recordsToInsert = validRows.map((r) => ({
        name: r.name,
        email: r.email,
        institution: r.institution || null,
      }));

      // Inserção em lotes de 100
      const BATCH = 100;
      let insertedCount = 0;
      for (let i = 0; i < recordsToInsert.length; i += BATCH) {
        const slice = recordsToInsert.slice(i, i + BATCH);
        const { error } = await supabase.from("coaches").insert(slice);
        if (error) {
          throw new Error(error.message);
        }
        insertedCount += slice.length;
      }

      toast.success(`Successfully imported ${insertedCount} coaches.`);
      setIsImportOpen(false);
      setImportRows([]);
      setFileName(null);
      await loadCoaches();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error during import";
      toast.error(msg);
    } finally {
      setIsImporting(false);
    }
  }

  // Contadores de importação
  const validCount = importRows.filter((r) => r.status === "valid").length;
  const duplicateCount = importRows.filter((r) => r.status === "duplicate").length;
  const invalidCount = importRows.filter((r) => r.status === "invalid").length;

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Coaches">
        <div className="space-y-6">
          {/* Top Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Coaches Directory</h1>
              </div>
              <p className="text-sm text-zinc-400 mt-1">
                Manage collegiate coaches and athletic directors for recruitment showcases.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setImportRows([]);
                  setFileName(null);
                  setIsImportOpen(true);
                }}
                className={secondaryButtonClass}
              >
                <UploadCloud className="h-4 w-4 mr-2 text-emerald-400" />
                Import Spreadsheet
              </button>
              <button type="button" onClick={openCreateModal} className={buttonClass}>
                <Plus className="h-4 w-4 mr-2" />
                Add Coach
              </button>
            </div>
          </div>

          {/* Search and Stats Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search by name, university or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputClass} pl-9`}
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 font-medium">
                {filteredCoaches.length} {filteredCoaches.length === 1 ? "Coach" : "Coaches"}
              </span>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-zinc-500 hover:text-white underline ml-2"
                >
                  Clear search
                </button>
              )}
            </div>
          </div>

          {/* Main List Panel */}
          <Panel title="Coaches Directory">
            {loading ? (
              <div className="py-16 text-center text-zinc-400">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-emerald-500 mb-3" />
                <p className="text-sm">Loading coaches directory...</p>
              </div>
            ) : filteredCoaches.length === 0 ? (
              search ? (
                <EmptyState>No coaches matched your search for &quot;{search}&quot;.</EmptyState>
              ) : (
                <div className="py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4 text-zinc-400">
                    <GraduationCap className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1">
                    No coaches registered yet
                  </h3>
                  <p className="text-sm text-zinc-400 max-w-md mx-auto mb-6">
                    Start building your scouting network by adding individual coaches or importing a
                    spreadsheet.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsImportOpen(true)}
                      className={secondaryButtonClass}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Import CSV / XLSX
                    </button>
                    <button type="button" onClick={openCreateModal} className={buttonClass}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Coach
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="bg-zinc-900/50 text-xs uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Coach Name</th>
                      <th className="py-3 px-4 font-semibold">Email</th>
                      <th className="py-3 px-4 font-semibold">University / Institution</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredCoaches.map((coach) => (
                      <tr key={coach.id} className="hover:bg-zinc-800/30 transition-colors group">
                        <td className="py-3.5 px-4 font-medium text-white flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center font-bold text-xs uppercase">
                            {coach.name.charAt(0)}
                          </div>
                          <span>{coach.name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-300 font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-zinc-500" />
                            <span>{coach.email}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-400">
                          {coach.institution ? (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                              <span>{coach.institution}</span>
                            </div>
                          ) : (
                            <span className="text-zinc-600 text-xs italic">Not informed</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(coach)}
                              className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                              title="Edit Coach"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingCoach(coach)}
                              className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                              title="Delete Coach"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* Modal: Add/Edit Coach */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
              <h2 className="text-lg font-bold text-white mb-1">
                {editingCoach ? "Edit Coach" : "Add Coach"}
              </h2>
              <p className="text-xs text-zinc-400 mb-5">
                {editingCoach
                  ? "Update coach details and institution."
                  : "Enter the coach's contact details to include in recruitment email distributions."}
              </p>

              <form onSubmit={handleSaveCoach} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Coach John Smith"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g. jsmith@university.edu"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    University / Institution
                  </label>
                  <input
                    type="text"
                    value={formInstitution}
                    onChange={(e) => setFormInstitution(e.target.value)}
                    placeholder="e.g. University of Florida"
                    className={inputClass}
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setIsFormOpen(false)}
                    className={secondaryButtonClass}
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting} className={buttonClass}>
                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {editingCoach ? "Save Changes" : "Create Coach"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Import Spreadsheet */}
        {isImportOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
              <div className="p-6 border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                      Import Coaches Spreadsheet
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Upload a CSV or Excel (.xlsx) file with columns for <strong>name</strong>,{" "}
                      <strong>email</strong>, and <strong>institution</strong>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsImportOpen(false)}
                    className="text-zinc-500 hover:text-white text-xl leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto space-y-5 flex-1">
                {/* Upload Box */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      void handleFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  className="border-2 border-dashed border-zinc-700 hover:border-emerald-500/70 rounded-xl p-6 text-center cursor-pointer transition-colors bg-zinc-950/40"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".csv, .xlsx, .xls";
                    input.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files;
                      if (files && files[0]) {
                        void handleFileUpload(files[0]);
                      }
                    };
                    input.click();
                  }}
                >
                  <UploadCloud className="h-10 w-10 text-emerald-500/80 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-white">
                    {fileName ? `Selected file: ${fileName}` : "Click or drag spreadsheet here"}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Supports .CSV, .XLSX, and .XLS files (up to 5,000 rows)
                  </p>
                </div>

                {isAnalyzing && (
                  <div className="py-8 text-center text-zinc-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-emerald-500 mb-2" />
                    <p className="text-xs">Analyzing and validating rows...</p>
                  </div>
                )}

                {/* Resumo Pré-Importação */}
                {!isAnalyzing && importRows.length > 0 && (
                  <div className="space-y-4">
                    {/* Badges de Resumo */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-emerald-400">{validCount}</div>
                        <div className="text-xs text-emerald-300/80 font-medium">
                          Ready to Import
                        </div>
                      </div>
                      <div className="bg-amber-950/30 border border-amber-800/30 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-amber-400">{duplicateCount}</div>
                        <div className="text-xs text-amber-300/80 font-medium">
                          Duplicates Skipped
                        </div>
                      </div>
                      <div className="bg-red-950/30 border border-red-800/30 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-red-400">{invalidCount}</div>
                        <div className="text-xs text-red-300/80 font-medium">Invalid Skipped</div>
                      </div>
                    </div>

                    {/* Pré-visualização das Linhas */}
                    <div className="border border-zinc-800 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                      <table className="w-full text-left text-xs text-zinc-300">
                        <thead className="bg-zinc-800/80 sticky top-0 text-zinc-400">
                          <tr>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3">Name</th>
                            <th className="py-2 px-3">Email</th>
                            <th className="py-2 px-3">Institution</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {importRows.slice(0, 100).map((row, idx) => (
                            <tr key={idx} className="hover:bg-zinc-800/20">
                              <td className="py-2 px-3 whitespace-nowrap">
                                {row.status === "valid" && (
                                  <span className="inline-flex items-center text-emerald-400 gap-1 font-medium">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                                  </span>
                                )}
                                {row.status === "duplicate" && (
                                  <span
                                    className="inline-flex items-center text-amber-400 gap-1"
                                    title={row.reason}
                                  >
                                    <AlertCircle className="h-3.5 w-3.5" /> Duplicate
                                  </span>
                                )}
                                {row.status === "invalid" && (
                                  <span
                                    className="inline-flex items-center text-red-400 gap-1"
                                    title={row.reason}
                                  >
                                    <XCircle className="h-3.5 w-3.5" /> Invalid
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-medium text-white">{row.name}</td>
                              <td className="py-2 px-3 font-mono text-zinc-400">{row.email}</td>
                              <td className="py-2 px-3 text-zinc-400">{row.institution || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {importRows.length > 100 && (
                      <p className="text-[11px] text-zinc-500 text-center">
                        Showing first 100 of {importRows.length} rows.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-zinc-800 flex items-center justify-between">
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => setIsImportOpen(false)}
                  className={secondaryButtonClass}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isImporting || validCount === 0}
                  onClick={() => void executeImport()}
                  className={buttonClass}
                >
                  {isImporting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {validCount > 0
                    ? `Confirm Import (${validCount} Coaches)`
                    : "Upload Valid File to Import"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Delete Confirmation */}
        {deletingCoach && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
              <h3 className="text-lg font-bold text-white mb-2">Delete Coach?</h3>
              <p className="text-sm text-zinc-400 mb-6">
                Are you sure you want to delete{" "}
                <strong className="text-white">{deletingCoach.name}</strong> ({deletingCoach.email}
                )? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeletingCoach(null)}
                  className={secondaryButtonClass}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void handleDeleteCoach()}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center"
                >
                  {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </ProtectedPage>
  );
}

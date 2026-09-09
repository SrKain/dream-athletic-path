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
  ExternalLink,
  History,
  Users,
  DollarSign,
  Languages,
  Award,
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
import { US_STATES, LEAGUES, BUDGET_LEVELS, TOEFL_LEVELS } from "@/lib/universities-constants";
import type {
  University,
  UniversityCoach,
  UniversityHistoryEntry,
  UniversityLeague,
  UniversityBudgetLevel,
  UniversityToeflLevel,
} from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/universities")({
  component: UniversitiesPage,
});

interface ParsedImportRow {
  universityName: string;
  city: string;
  state: string;
  league?: string;
  coachFirstName?: string;
  coachLastName?: string;
  coachEmail?: string;
  isHbcu?: boolean;
  budgetLevel?: string;
  toeflLevel?: string;
  status: "valid" | "invalid";
  reason?: string;
}

function UniversitiesPage() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterLeague, setFilterLeague] = useState<string>("all");
  const [filterHbcu, setFilterHbcu] = useState<string>("all");
  const [filterBudget, setFilterBudget] = useState<string>("all");
  const [filterToefl, setFilterToefl] = useState<string>("all");

  // Modal Create / Edit
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUni, setEditingUni] = useState<University | null>(null);
  const [formName, setFormName] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formState, setFormState] = useState<string>("CA");
  const [formLeague, setFormLeague] = useState<UniversityLeague | "">("");
  const [formSourceUrl, setFormSourceUrl] = useState("");
  const [formIsHbcu, setFormIsHbcu] = useState(false);
  const [formBudgetLevel, setFormBudgetLevel] = useState<UniversityBudgetLevel | "">("");
  const [formToeflLevel, setFormToeflLevel] = useState<UniversityToeflLevel | "">("");
  const [formCoaches, setFormCoaches] = useState<UniversityCoach[]>([]);
  const [formHistory, setFormHistory] = useState<UniversityHistoryEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal Import
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // Modal Delete
  const [deletingUni, setDeletingUni] = useState<University | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function loadUniversities() {
    setLoading(true);
    const { data, error } = await supabase
      .from("universities")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      toast.error("Failed to load universities: " + error.message);
    } else {
      setUniversities((data ?? []) as University[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadUniversities();
  }, []);

  const filteredUniversities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return universities.filter((u) => {
      // Busca textual
      const matchesSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.city.toLowerCase().includes(q) ||
        u.state.toLowerCase().includes(q) ||
        (u.coaches &&
          u.coaches.some(
            (c) =>
              c.first_name.toLowerCase().includes(q) ||
              c.last_name.toLowerCase().includes(q) ||
              c.email.toLowerCase().includes(q),
          ));

      if (!matchesSearch) return false;

      // Filtro de Estado
      if (filterState !== "all" && u.state !== filterState) return false;

      // Filtro de Liga
      if (filterLeague !== "all" && u.league !== filterLeague) return false;

      // Filtro de HBCU
      if (filterHbcu === "hbcu" && !u.is_hbcu) return false;
      if (filterHbcu === "non_hbcu" && u.is_hbcu) return false;

      // Filtro de Budget
      if (filterBudget !== "all" && u.budget_level !== filterBudget) return false;

      // Filtro de TOEFL
      if (filterToefl !== "all" && u.toefl_level !== filterToefl) return false;

      return true;
    });
  }, [universities, search, filterState, filterLeague, filterHbcu, filterBudget, filterToefl]);

  function openCreateModal() {
    setEditingUni(null);
    setFormName("");
    setFormCity("");
    setFormState("CA");
    setFormLeague("");
    setFormSourceUrl("");
    setFormIsHbcu(false);
    setFormBudgetLevel("");
    setFormToeflLevel("");
    setFormCoaches([]);
    setFormHistory([]);
    setIsFormOpen(true);
  }

  function openEditModal(uni: University) {
    setEditingUni(uni);
    setFormName(uni.name);
    setFormCity(uni.city);
    setFormState(uni.state || "CA");
    setFormLeague(uni.league || "");
    setFormSourceUrl(uni.source_url || "");
    setFormIsHbcu(!!uni.is_hbcu);
    setFormBudgetLevel(uni.budget_level || "");
    setFormToeflLevel(uni.toefl_level || "");
    setFormCoaches(Array.isArray(uni.coaches) ? [...uni.coaches] : []);
    setFormHistory(Array.isArray(uni.history) ? [...uni.history] : []);
    setIsFormOpen(true);
  }

  // Helpers para coaches do formulário
  function addCoachRow() {
    setFormCoaches((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        first_name: "",
        last_name: "",
        email: "",
        role: "Head Coach",
      },
    ]);
  }

  function updateCoachRow(index: number, field: keyof UniversityCoach, value: string) {
    setFormCoaches((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function removeCoachRow(index: number) {
    setFormCoaches((prev) => prev.filter((_, i) => i !== index));
  }

  // Helpers para histórico do formulário
  function addHistoryRow() {
    const today = new Date().toISOString().split("T")[0];
    setFormHistory((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        date: today,
        event: "",
      },
    ]);
  }

  function updateHistoryRow(index: number, field: keyof UniversityHistoryEntry, value: string) {
    setFormHistory((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function removeHistoryRow(index: number) {
    setFormHistory((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSaveUniversity(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error("University name is required.");
      return;
    }
    if (!formCity.trim()) {
      toast.error("City is required.");
      return;
    }

    // Validar coaches
    const validCoaches: UniversityCoach[] = [];
    for (const c of formCoaches) {
      const cleanEmail = c.email.trim().toLowerCase();
      if (cleanEmail && !cleanEmail.includes("@")) {
        toast.error(`Invalid email format for coach ${c.first_name || ""} ${c.last_name || ""}`);
        return;
      }
      if (cleanEmail || c.first_name.trim() || c.last_name.trim()) {
        validCoaches.push({
          id: c.id || crypto.randomUUID(),
          first_name: c.first_name.trim(),
          last_name: c.last_name.trim(),
          email: cleanEmail,
          role: c.role?.trim() || undefined,
        });
      }
    }

    // Validar history
    const validHistory: UniversityHistoryEntry[] = [];
    for (const h of formHistory) {
      if (h.event.trim()) {
        validHistory.push({
          id: h.id || crypto.randomUUID(),
          date: h.date || new Date().toISOString().split("T")[0],
          event: h.event.trim(),
        });
      }
    }

    setIsSubmitting(true);

    const payload = {
      name: formName.trim(),
      city: formCity.trim(),
      state: formState,
      league: formLeague || null,
      source_url: formSourceUrl.trim() || null,
      is_hbcu: formIsHbcu,
      budget_level: formBudgetLevel || null,
      toefl_level: formToeflLevel || null,
      coaches: validCoaches,
      history: validHistory,
      updated_at: new Date().toISOString(),
    };

    if (editingUni) {
      const { error } = await supabase.from("universities").update(payload).eq("id", editingUni.id);

      if (error) {
        toast.error("Failed to update university: " + error.message);
      } else {
        toast.success("University updated successfully.");
        setIsFormOpen(false);
        void loadUniversities();
      }
    } else {
      const { error } = await supabase.from("universities").insert([payload]);

      if (error) {
        toast.error("Failed to create university: " + error.message);
      } else {
        toast.success("University registered successfully.");
        setIsFormOpen(false);
        void loadUniversities();
      }
    }
    setIsSubmitting(false);
  }

  async function handleDeleteUniversity() {
    if (!deletingUni) return;
    setIsDeleting(true);
    const { error } = await supabase.from("universities").delete().eq("id", deletingUni.id);
    if (error) {
      toast.error("Failed to delete university: " + error.message);
    } else {
      toast.success("University deleted successfully.");
      setDeletingUni(null);
      void loadUniversities();
    }
    setIsDeleting(false);
  }

  // Importador de Planilha (XLSX / CSV)
  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsAnalyzing(true);
    setImportRows([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

        const parsed: ParsedImportRow[] = [];

        for (const row of rawJson) {
          const keys = Object.keys(row);

          const getVal = (targetNames: string[]) => {
            for (const t of targetNames) {
              const matchedKey = keys.find(
                (k) =>
                  k.toLowerCase().replace(/[^a-z0-9]/g, "") ===
                  t.toLowerCase().replace(/[^a-z0-9]/g, ""),
              );
              if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
                return String(row[matchedKey]).trim();
              }
            }
            return "";
          };

          const uniName = getVal([
            "university",
            "universityname",
            "institution",
            "college",
            "school",
            "name",
          ]);
          const city = getVal(["city", "cidade"]) || "Unknown";
          let state = getVal(["state", "estado", "uf"]).toUpperCase() || "CA";
          if (!US_STATES.includes(state as (typeof US_STATES)[number])) {
            state = "CA";
          }

          const leagueRaw = getVal(["league", "division", "divisao"]).toUpperCase();
          let league: string | undefined = undefined;
          if (leagueRaw.includes("NJCAA") && leagueRaw.includes("D1")) league = "NJCAA D1";
          else if (leagueRaw.includes("NJCAA") && leagueRaw.includes("D2")) league = "NJCAA D2";
          else if (leagueRaw.includes("NCAA") && leagueRaw.includes("D1")) league = "NCAA D1";
          else if (leagueRaw.includes("NCAA") && leagueRaw.includes("D2")) league = "NCAA D2";
          else if (leagueRaw.includes("NAIA")) league = "NAIA";

          const coachNameFull = getVal(["coachname", "coach", "coachfullname"]);
          let coachFirstName = getVal(["coachfirstname", "firstname", "first", "primeironome"]);
          let coachLastName = getVal(["coachlastname", "lastname", "last", "sobrenome"]);
          if (!coachFirstName && coachNameFull) {
            const parts = coachNameFull.split(" ");
            coachFirstName = parts[0] || "";
            coachLastName = parts.slice(1).join(" ") || "";
          }

          const coachEmail = getVal(["coachemail", "email", "mail"]).toLowerCase();
          const hbcuRaw = getVal(["hbcu", "ishbcu"]).toLowerCase();
          const isHbcu =
            hbcuRaw === "true" || hbcuRaw === "yes" || hbcuRaw === "sim" || hbcuRaw === "1";

          const budgetLevel = getVal(["budget", "budgetlevel"]);
          const toeflLevel = getVal(["toefl", "toefllevel"]);

          if (!uniName) {
            parsed.push({
              universityName: "(Missing Name)",
              city,
              state,
              status: "invalid",
              reason: "Missing university name.",
            });
            continue;
          }

          parsed.push({
            universityName: uniName,
            city,
            state,
            league,
            coachFirstName: coachFirstName || undefined,
            coachLastName: coachLastName || undefined,
            coachEmail: coachEmail || undefined,
            isHbcu,
            budgetLevel: budgetLevel || undefined,
            toeflLevel: toeflLevel || undefined,
            status: "valid",
          });
        }

        setImportRows(parsed);
      } catch (err) {
        console.error("Error parsing spreadsheet:", err);
        toast.error("Failed to parse spreadsheet file.");
      } finally {
        setIsAnalyzing(false);
      }
    };

    reader.readAsBinaryString(file);
  }

  async function handleConfirmImport() {
    const validRows = importRows.filter((r) => r.status === "valid");
    if (validRows.length === 0) {
      toast.error("No valid rows to import.");
      return;
    }

    setIsImporting(true);

    try {
      // Agrupar linhas por universidade (chave: nome em minúsculas + estado)
      const uniMap = new Map<
        string,
        {
          name: string;
          city: string;
          state: string;
          league: string | null;
          is_hbcu: boolean;
          budget_level: string | null;
          toefl_level: string | null;
          coaches: UniversityCoach[];
        }
      >();

      for (const row of validRows) {
        const key = `${row.universityName.toLowerCase().trim()}_${row.state.toUpperCase()}`;
        if (!uniMap.has(key)) {
          uniMap.set(key, {
            name: row.universityName,
            city: row.city,
            state: row.state,
            league: (row.league as UniversityLeague) || null,
            is_hbcu: !!row.isHbcu,
            budget_level: (row.budgetLevel as UniversityBudgetLevel) || null,
            toefl_level: (row.toeflLevel as UniversityToeflLevel) || null,
            coaches: [],
          });
        }

        const entry = uniMap.get(key)!;
        if (row.coachEmail) {
          const alreadyExists = entry.coaches.some(
            (c) => c.email.toLowerCase() === row.coachEmail!.toLowerCase(),
          );
          if (!alreadyExists) {
            entry.coaches.push({
              id: crypto.randomUUID(),
              first_name: row.coachFirstName || "Coach",
              last_name: row.coachLastName || "",
              email: row.coachEmail,
              role: "Head Coach",
            });
          }
        }
      }

      // Otimização I/O: Buscar todas as universidades existentes de uma única vez
      const { data: allExisting, error: fetchErr } = await supabase
        .from("universities")
        .select("id, name, state, coaches");

      if (fetchErr) {
        throw fetchErr;
      }

      // Indexação local em memória com a mesma chave canônica: nome_estado
      const existingMap = new Map<string, { id: string; coaches: UniversityCoach[] }>();
      for (const uni of allExisting || []) {
        const k = `${uni.name.toLowerCase().trim()}_${uni.state.toUpperCase().trim()}`;
        existingMap.set(k, {
          id: uni.id,
          coaches: (uni.coaches as UniversityCoach[]) || [],
        });
      }

      const toUpdate: { id: string; coaches: UniversityCoach[] }[] = [];
      const toInsert: Array<{
        name: string;
        city: string;
        state: string;
        league: string | null;
        is_hbcu: boolean;
        budget_level: string | null;
        toefl_level: string | null;
        coaches: UniversityCoach[];
        history: unknown[];
      }> = [];

      for (const [key, uniData] of uniMap.entries()) {
        const existing = existingMap.get(key);

        if (existing) {
          // Mesclar coaches sem duplicar e-mails
          const existingCoaches = existing.coaches;
          const existingEmails = new Set(existingCoaches.map((c) => c.email.toLowerCase()));

          const newCoaches = uniData.coaches.filter(
            (c) => !existingEmails.has(c.email.toLowerCase()),
          );
          const merged = [...existingCoaches, ...newCoaches];

          toUpdate.push({
            id: existing.id,
            coaches: merged,
          });
        } else {
          toInsert.push({
            name: uniData.name,
            city: uniData.city,
            state: uniData.state,
            league: uniData.league,
            is_hbcu: uniData.is_hbcu,
            budget_level: uniData.budget_level,
            toefl_level: uniData.toefl_level,
            coaches: uniData.coaches,
            history: [],
          });
        }
      }

      // Execução em lotes paralelos (chunks de 25 com Promise.all)
      const BATCH_SIZE = 25;

      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const chunk = toUpdate.slice(i, i + BATCH_SIZE);
        await Promise.all(
          chunk.map((item) =>
            supabase
              .from("universities")
              .update({
                coaches: item.coaches,
                updated_at: new Date().toISOString(),
              })
              .eq("id", item.id),
          ),
        );
      }

      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const chunk = toInsert.slice(i, i + BATCH_SIZE);
        const { error: insErr } = await supabase.from("universities").insert(chunk);
        if (insErr) {
          throw insErr;
        }
      }

      const insertedCount = toInsert.length;
      const updatedCount = toUpdate.length;

      toast.success(
        `Import complete! ${insertedCount} universities created, ${updatedCount} updated.`,
      );
      setIsImportOpen(false);
      setImportRows([]);
      setFileName(null);
      void loadUniversities();
    } catch (err) {
      console.error("Import execution error:", err);
      toast.error("An error occurred during import.");
    } finally {
      setIsImporting(false);
    }
  }

  function downloadTemplate() {
    const templateData = [
      {
        "University Name": "University of Central Florida",
        City: "Orlando",
        State: "FL",
        League: "NCAA D1",
        "Coach First Name": "Scott",
        "Coach Last Name": "Calabrese",
        "Coach Email": "scott.calabrese@ucf.edu",
        HBCU: "No",
        "Budget Level": "5000–10000",
        "TOEFL Level": "61+",
      },
      {
        "University Name": "Cowley College",
        City: "Arkansas City",
        State: "KS",
        League: "NJCAA D1",
        "Coach First Name": "Ruy",
        "Coach Last Name": "Vaz",
        "Coach Email": "ruy.vaz@cowley.edu",
        HBCU: "No",
        "Budget Level": "0–1000",
        "TOEFL Level": "0–61",
      },
      {
        "University Name": "Florida A&M University",
        City: "Tallahassee",
        State: "FL",
        League: "NCAA D1",
        "Coach First Name": "Marcus",
        "Coach Last Name": "Johnson",
        "Coach Email": "marcus.johnson@famu.edu",
        HBCU: "Yes",
        "Budget Level": "1000–5000",
        "TOEFL Level": "61+",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Universities_Template");
    XLSX.writeFile(wb, "universities_import_template.xlsx");
  }

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Universities Database">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <Building2 className="w-6 h-6 text-primary" />
                Universidades & Coaches
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Gerencie o cadastro institucional de universidades, faculdades parceiras e seus
                respectivos treinadores (coaches).
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground shadow-xs hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-muted-foreground" />
                Importar Planilha
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nova Universidade
              </button>
            </div>
          </div>

          {/* Search & Multifaceted Filters */}
          <div className="glass-panel p-4 space-y-3 rounded-xl border border-border bg-card">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por universidade, cidade, estado, coach ou e-mail..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {/* Estado */}
                <select
                  value={filterState}
                  onChange={(e) => setFilterState(e.target.value)}
                  className="px-2.5 py-2 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="all">Estado: Todos</option>
                  {US_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>

                {/* Liga */}
                <select
                  value={filterLeague}
                  onChange={(e) => setFilterLeague(e.target.value)}
                  className="px-2.5 py-2 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="all">Liga: Todas</option>
                  {LEAGUES.map((lg) => (
                    <option key={lg} value={lg}>
                      {lg}
                    </option>
                  ))}
                </select>

                {/* HBCU */}
                <select
                  value={filterHbcu}
                  onChange={(e) => setFilterHbcu(e.target.value)}
                  className="px-2.5 py-2 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="all">HBCU: Todos</option>
                  <option value="hbcu">Apenas HBCU</option>
                  <option value="non_hbcu">Não HBCU</option>
                </select>

                {/* Budget */}
                <select
                  value={filterBudget}
                  onChange={(e) => setFilterBudget(e.target.value)}
                  className="px-2.5 py-2 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="all">Budget: Todos</option>
                  {BUDGET_LEVELS.map((b) => (
                    <option key={b} value={b}>
                      ${b}
                    </option>
                  ))}
                </select>

                {/* TOEFL */}
                <select
                  value={filterToefl}
                  onChange={(e) => setFilterToefl(e.target.value)}
                  className="px-2.5 py-2 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="all">TOEFL: Todos</option>
                  {TOEFL_LEVELS.map((t) => (
                    <option key={t} value={t}>
                      TOEFL {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Badges / Contadores */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
              <div>
                Mostrando <strong className="text-foreground">{filteredUniversities.length}</strong>{" "}
                de {universities.length} universidades
              </div>
              {(filterState !== "all" ||
                filterLeague !== "all" ||
                filterHbcu !== "all" ||
                filterBudget !== "all" ||
                filterToefl !== "all" ||
                search) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilterState("all");
                    setFilterLeague("all");
                    setFilterHbcu("all");
                    setFilterBudget("all");
                    setFilterToefl("all");
                  }}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Limpar todos os filtros
                </button>
              )}
            </div>
          </div>

          {/* Table / List */}
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground mt-2">Carregando universidades...</p>
            </div>
          ) : filteredUniversities.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-border rounded-xl bg-card/40">
              <Building2 className="w-12 h-12 text-muted-foreground/60 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-foreground">
                Nenhuma universidade encontrada
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
                Cadastre manualmente ou importe uma planilha com a lista de universidades e coaches
                parceiros.
              </p>
              <button type="button" onClick={openCreateModal} className={buttonClass}>
                Cadastrar Universidade
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-3 px-4">Universidade / Local</th>
                      <th className="py-3 px-4">Liga / Categoria</th>
                      <th className="py-3 px-4">Requisitos (Budget / TOEFL)</th>
                      <th className="py-3 px-4">Coaches Vinculados</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredUniversities.map((uni) => {
                      const coachesCount = Array.isArray(uni.coaches) ? uni.coaches.length : 0;
                      const historyCount = Array.isArray(uni.history) ? uni.history.length : 0;

                      return (
                        <tr key={uni.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              {uni.name}
                              {uni.source_url && (
                                <a
                                  href={uni.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-primary transition-colors"
                                  title="Ver site / fonte da universidade"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {uni.city}, {uni.state}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {uni.league ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-800/50">
                                  {uni.league}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                              {uni.is_hbcu && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/40 text-amber-400 border border-amber-800/50">
                                  HBCU
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1">
                              <div className="text-xs text-foreground flex items-center gap-1">
                                <span className="text-muted-foreground text-[11px]">Budget:</span>
                                {uni.budget_level ? (
                                  <span className="font-medium">${uni.budget_level}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </div>
                              <div className="text-xs text-foreground flex items-center gap-1">
                                <span className="text-muted-foreground text-[11px]">TOEFL:</span>
                                {uni.toefl_level ? (
                                  <span className="font-medium">{uni.toefl_level}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  coachesCount > 0
                                    ? "bg-primary/10 text-primary border border-primary/20"
                                    : "bg-muted text-muted-foreground border border-border"
                                }`}
                              >
                                <Users className="w-3.5 h-3.5" />
                                {coachesCount} {coachesCount === 1 ? "coach" : "coaches"}
                              </span>

                              {historyCount > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground"
                                  title={`${historyCount} eventos no histórico`}
                                >
                                  <History className="w-3 h-3" />
                                  {historyCount}
                                </span>
                              )}
                            </div>

                            {coachesCount > 0 && (
                              <div className="text-[11px] text-muted-foreground mt-1 truncate max-w-xs">
                                {uni.coaches
                                  .map((c) => `${c.first_name} ${c.last_name || ""}`.trim())
                                  .filter(Boolean)
                                  .join(", ")}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditModal(uni)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                title="Editar universidade"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingUni(uni)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                title="Excluir universidade"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* MODAL / DRAWER: CREATE / EDIT UNIVERSITY */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-card border border-border rounded-2xl w-full max-w-2xl p-6 shadow-2xl my-8 space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      {editingUni ? "Editar Universidade" : "Nova Universidade"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Preencha os dados institucionais, requisitos e a lista de coaches vinculados.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveUniversity} className="space-y-6">
                {/* Seção 1: Dados Básicos */}
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary">
                    1. Dados Institucionais
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-medium text-foreground">
                        Nome da Universidade *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: University of Central Florida"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Estado (EUA) *</label>
                      <select
                        value={formState}
                        onChange={(e) => setFormState(e.target.value)}
                        className={inputClass}
                      >
                        {US_STATES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Cidade *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Orlando"
                        value={formCity}
                        onChange={(e) => setFormCity(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">
                        Link Fonte / Site Oficial
                      </label>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={formSourceUrl}
                        onChange={(e) => setFormSourceUrl(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 2: Classificação & Requisitos */}
                <div className="space-y-3 pt-2 border-t border-border/60">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary">
                    2. Classificação & Requisitos
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Liga Esportiva</label>
                      <select
                        value={formLeague}
                        onChange={(e) => setFormLeague(e.target.value as UniversityLeague | "")}
                        className={inputClass}
                      >
                        <option value="">Não especificada</option>
                        {LEAGUES.map((lg) => (
                          <option key={lg} value={lg}>
                            {lg}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Nível de Budget</label>
                      <select
                        value={formBudgetLevel}
                        onChange={(e) =>
                          setFormBudgetLevel(e.target.value as UniversityBudgetLevel | "")
                        }
                        className={inputClass}
                      >
                        <option value="">Não informado</option>
                        {BUDGET_LEVELS.map((b) => (
                          <option key={b} value={b}>
                            ${b}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Nível de TOEFL</label>
                      <select
                        value={formToeflLevel}
                        onChange={(e) =>
                          setFormToeflLevel(e.target.value as UniversityToeflLevel | "")
                        }
                        className={inputClass}
                      >
                        <option value="">Não informado</option>
                        {TOEFL_LEVELS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="form-is-hbcu"
                      checked={formIsHbcu}
                      onChange={(e) => setFormIsHbcu(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                    />
                    <label
                      htmlFor="form-is-hbcu"
                      className="text-xs font-medium text-foreground cursor-pointer select-none"
                    >
                      HBCU (Historically Black Colleges and Universities)
                    </label>
                  </div>
                </div>

                {/* Seção 3: Treinadores (Coaches) */}
                <div className="space-y-3 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      3. Treinadores (Coaches) Cadastrados ({formCoaches.length})
                    </div>
                    <button
                      type="button"
                      onClick={addCoachRow}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar Coach
                    </button>
                  </div>

                  {formCoaches.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                      Nenhum coach cadastrado nesta universidade. Clique em "Adicionar Coach" para
                      inserir o primeiro contato.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {formCoaches.map((coach, idx) => (
                        <div
                          key={coach.id || idx}
                          className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/20"
                        >
                          <div className="grid grid-cols-3 gap-2 flex-1">
                            <input
                              type="text"
                              placeholder="Nome"
                              value={coach.first_name}
                              onChange={(e) => updateCoachRow(idx, "first_name", e.target.value)}
                              className="px-2.5 py-1.5 text-xs rounded border border-border bg-background"
                            />
                            <input
                              type="text"
                              placeholder="Sobrenome"
                              value={coach.last_name}
                              onChange={(e) => updateCoachRow(idx, "last_name", e.target.value)}
                              className="px-2.5 py-1.5 text-xs rounded border border-border bg-background"
                            />
                            <input
                              type="email"
                              placeholder="E-mail (obrigatório para mailer)"
                              value={coach.email}
                              onChange={(e) => updateCoachRow(idx, "email", e.target.value)}
                              className="px-2.5 py-1.5 text-xs rounded border border-border bg-background"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCoachRow(idx)}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                            title="Remover coach"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Seção 4: Histórico & Timeline */}
                <div className="space-y-3 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                      <History className="w-4 h-4" />
                      4. Histórico de Contato / Acontecimentos ({formHistory.length})
                    </div>
                    <button
                      type="button"
                      onClick={addHistoryRow}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar Evento
                    </button>
                  </div>

                  {formHistory.length === 0 ? (
                    <div className="p-3 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                      Nenhum registro no histórico. Use este espaço para registrar contatos prévios,
                      reuniões ou preferências da comissão técnica.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {formHistory.map((hist, idx) => (
                        <div
                          key={hist.id || idx}
                          className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/20"
                        >
                          <input
                            type="date"
                            value={hist.date}
                            onChange={(e) => updateHistoryRow(idx, "date", e.target.value)}
                            className="w-32 px-2 py-1 text-xs rounded border border-border bg-background"
                          />
                          <input
                            type="text"
                            placeholder="Descreva o acontecimento (ex: Reunião com Head Coach sobre zagueiros)..."
                            value={hist.event}
                            onChange={(e) => updateHistoryRow(idx, "event", e.target.value)}
                            className="flex-1 px-2.5 py-1 text-xs rounded border border-border bg-background"
                          />
                          <button
                            type="button"
                            onClick={() => removeHistoryRow(idx)}
                            className="p-1 text-muted-foreground hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className={secondaryButtonClass}
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={isSubmitting} className={buttonClass}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : editingUni ? (
                      "Salvar Alterações"
                    ) : (
                      "Cadastrar Universidade"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: DELETE CONFIRMATION */}
        {deletingUni && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-destructive">
                <div className="p-2.5 rounded-full bg-destructive/10">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Excluir Universidade</h3>
                  <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita.</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Tem certeza que deseja excluir <strong>{deletingUni.name}</strong> (
                {deletingUni.city}, {deletingUni.state}) e seus{" "}
                {Array.isArray(deletingUni.coaches) ? deletingUni.coaches.length : 0} coaches
                associados?
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeletingUni(null)}
                  className={secondaryButtonClass}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteUniversity}
                  className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2"
                >
                  {isDeleting ? "Excluindo..." : "Confirmar Exclusão"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: IMPORT SPREADSHEET */}
        {isImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border border-border rounded-2xl w-full max-w-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      Importar Universidades & Coaches
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Carregue arquivos em formato .xlsx ou .csv com as colunas de universidades e
                      seus respectivos treinadores.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsImportOpen(false);
                    setImportRows([]);
                    setFileName(null);
                  }}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Upload Zone & Template Download */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-dashed border-border bg-muted/20">
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    Baixe o modelo oficial formatado
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Planilha pré-configurada com colunas: University Name, City, State, League,
                    Coach Name, Coach Email, etc.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted transition-colors cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4 text-primary" />
                  Baixar Modelo (.XLSX)
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-foreground">
                  Selecione seu arquivo (.xlsx, .csv):
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileSelected}
                  className="w-full text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
                />
              </div>

              {/* Preview Table */}
              {isAnalyzing ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary mb-2" />
                  Processando e validando linhas da planilha...
                </div>
              ) : importRows.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>
                      Pré-visualização:{" "}
                      <strong className="text-primary">{importRows.length}</strong> linhas lidas
                    </span>
                    <span className="text-muted-foreground">
                      {importRows.filter((r) => r.status === "valid").length} válidas /{" "}
                      {importRows.filter((r) => r.status === "invalid").length} com erros
                    </span>
                  </div>

                  <div className="max-h-60 overflow-y-auto rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/50 text-muted-foreground border-b border-border font-medium">
                        <tr>
                          <th className="p-2">Universidade</th>
                          <th className="p-2">Local</th>
                          <th className="p-2">Liga</th>
                          <th className="p-2">Coach</th>
                          <th className="p-2">E-mail</th>
                          <th className="p-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importRows.slice(0, 50).map((row, i) => (
                          <tr key={i} className="hover:bg-muted/20">
                            <td className="p-2 font-medium text-foreground">
                              {row.universityName}
                            </td>
                            <td className="p-2 text-muted-foreground">
                              {row.city}, {row.state}
                            </td>
                            <td className="p-2 text-muted-foreground">{row.league || "—"}</td>
                            <td className="p-2 text-foreground">
                              {row.coachFirstName || ""} {row.coachLastName || ""}
                            </td>
                            <td className="p-2 text-muted-foreground">{row.coachEmail || "—"}</td>
                            <td className="p-2 text-right">
                              {row.status === "valid" ? (
                                <span className="inline-flex items-center text-emerald-500 font-semibold gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Válido
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center text-destructive font-semibold gap-1"
                                  title={row.reason}
                                >
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  Inválido
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRows.length > 50 && (
                    <div className="text-[11px] text-muted-foreground text-center">
                      Exibindo primeiras 50 linhas de {importRows.length}. Todas as linhas válidas
                      serão importadas.
                    </div>
                  )}
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportOpen(false);
                    setImportRows([]);
                    setFileName(null);
                  }}
                  className={secondaryButtonClass}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={
                    isImporting || importRows.filter((r) => r.status === "valid").length === 0
                  }
                  onClick={handleConfirmImport}
                  className={buttonClass}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    `Confirmar Importação (${importRows.filter((r) => r.status === "valid").length})`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </ProtectedPage>
  );
}

import React, { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Mail,
  Phone,
  Building2,
  Pencil,
  Trash2,
  Eye,
  Filter,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { CoachProfileDrawer } from "./coach-profile-drawer";
import { CoachFormDialog, type CoachFormData } from "./coach-form-dialog";
import { deleteUniversityCoachServerFn } from "@/lib/coach-directory.functions";
import type { University, UniversityCoach, UniversityLeague } from "@/types/db";
import { LEAGUES, US_STATES } from "@/lib/universities-constants";
import { buttonClass, secondaryButtonClass, inputClass } from "@/components/admin-ui";

export interface FlatCoachRow {
  id: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string | null;
  role?: string | null;
  universityId: string;
  universityName: string;
  universityState?: string;
  universityCity?: string;
  universityLeague?: UniversityLeague | null;
}

export interface CoachDirectoryTableProps {
  universities: University[];
  onReload: () => void;
  loading?: boolean;
}

export function CoachDirectoryTable({
  universities,
  onReload,
  loading = false,
}: CoachDirectoryTableProps) {
  const [search, setSearch] = useState("");
  const [filterUniversity, setFilterUniversity] = useState<string>("all");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterLeague, setFilterLeague] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");

  // Paginação
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);

  // Modais
  const [profileCoach, setProfileCoach] = useState<FlatCoachRow | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingCoach, setEditingCoach] = useState<CoachFormData | null>(null);

  // Achatar coaches das universidades
  const allCoaches = useMemo<FlatCoachRow[]>(() => {
    const list: FlatCoachRow[] = [];
    for (const u of universities) {
      const coachesArray: UniversityCoach[] = Array.isArray(u.coaches) ? u.coaches : [];
      for (const c of coachesArray) {
        list.push({
          id: c.id,
          first_name: c.first_name || (c as any).firstName,
          last_name: c.last_name || (c as any).lastName,
          email: c.email,
          phone: c.phone,
          role: c.role,
          universityId: u.id,
          universityName: u.name,
          universityState: u.state,
          universityCity: u.city,
          universityLeague: u.league,
        });
      }
    }
    return list;
  }, [universities]);

  // Lista única de roles para o filtro
  const distinctRoles = useMemo(() => {
    const set = new Set<string>();
    for (const c of allCoaches) {
      if (c.role && c.role.trim()) {
        set.add(c.role.trim());
      }
    }
    return Array.from(set).sort();
  }, [allCoaches]);

  // Filtragem
  const filteredCoaches = useMemo(() => {
    const s = search.toLowerCase().trim();
    return allCoaches.filter((c) => {
      if (filterUniversity !== "all" && c.universityId !== filterUniversity) {
        return false;
      }
      if (filterState !== "all" && c.universityState !== filterState) {
        return false;
      }
      if (filterLeague !== "all" && c.universityLeague !== filterLeague) {
        return false;
      }
      if (filterRole !== "all" && (c.role || "").trim() !== filterRole) {
        return false;
      }
      if (s) {
        const fullName = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
        const matches =
          fullName.includes(s) ||
          c.email.toLowerCase().includes(s) ||
          (c.role || "").toLowerCase().includes(s) ||
          c.universityName.toLowerCase().includes(s);
        if (!matches) return false;
      }
      return true;
    });
  }, [allCoaches, search, filterUniversity, filterState, filterLeague, filterRole]);

  // Paginação
  const total = filteredCoaches.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const paginatedCoaches = filteredCoaches.slice(startIdx, startIdx + pageSize);

  function handleOpenCreate() {
    setEditingCoach(null);
    setFormOpen(true);
  }

  function handleOpenEdit(coach: FlatCoachRow) {
    setEditingCoach({
      id: coach.id,
      firstName: coach.first_name || "",
      lastName: coach.last_name || "",
      email: coach.email,
      phone: coach.phone || "",
      role: coach.role || "",
      universityId: coach.universityId,
    });
    setFormOpen(true);
  }

  function handleOpenProfile(coach: FlatCoachRow) {
    setProfileCoach(coach);
    setIsProfileOpen(true);
  }

  async function handleDelete(coach: FlatCoachRow) {
    const name = `${coach.first_name || ""} ${coach.last_name || ""}`.trim() || coach.email;
    if (!window.confirm(`Tem certeza que deseja remover o treinador ${name} da ${coach.universityName}?`)) {
      return;
    }

    try {
      const res = await deleteUniversityCoachServerFn({
        data: {
          universityId: coach.universityId,
          coachIdOrEmail: coach.id || coach.email,
        },
      });

      if (res?.success) {
        toast.success("Treinador removido com sucesso.");
        onReload();
      } else {
        toast.error(res?.message || "Não foi possível remover o treinador.");
      }
    } catch {
      toast.error("Erro inesperado ao remover treinador.");
    }
  }

  function handleFilterChange(callback: () => void) {
    callback();
    setPage(1);
  }

  return (
    <div className="space-y-4">
      {/* Top Controls: Search, Filters & Action Button */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar por nome, email, cargo ou universidade..."
              value={search}
              onChange={(e) => handleFilterChange(() => setSearch(e.target.value))}
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-emerald-700 hover:bg-emerald-800 text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              Adicionar Treinador
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <div className="flex items-center gap-1.5 text-neutral-500">
            <Filter className="w-3.5 h-3.5" />
            <span className="font-semibold uppercase tracking-wider text-[11px]">Filtros:</span>
          </div>

          {/* Universidade */}
          <select
            value={filterUniversity}
            onChange={(e) => handleFilterChange(() => setFilterUniversity(e.target.value))}
            className="p-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 max-w-[200px] truncate"
          >
            <option value="all">Todas as Universidades</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          {/* Estado */}
          <select
            value={filterState}
            onChange={(e) => handleFilterChange(() => setFilterState(e.target.value))}
            className="p-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          >
            <option value="all">Todos os Estados</option>
            {US_STATES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Liga */}
          <select
            value={filterLeague}
            onChange={(e) => handleFilterChange(() => setFilterLeague(e.target.value))}
            className="p-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          >
            <option value="all">Todas as Ligas</option>
            {LEAGUES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          {/* Cargo */}
          {distinctRoles.length > 0 && (
            <select
              value={filterRole}
              onChange={(e) => handleFilterChange(() => setFilterRole(e.target.value))}
              className="p-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 max-w-[150px] truncate"
            >
              <option value="all">Todos os Cargos</option>
              {distinctRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}

          {(search ||
            filterUniversity !== "all" ||
            filterState !== "all" ||
            filterLeague !== "all" ||
            filterRole !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilterUniversity("all");
                setFilterState("all");
                setFilterLeague("all");
                setFilterRole("all");
                setPage(1);
              }}
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 underline ml-2"
            >
              Limpar filtros
            </button>
          )}

          <div className="ml-auto text-xs text-neutral-500 font-mono">
            Mostrando {total > 0 ? startIdx + 1 : 0}–{Math.min(startIdx + pageSize, total)} de{" "}
            {total} treinadores
          </div>
        </div>
      </div>

      {/* Tabela de Coaches */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 font-medium">
            <tr>
              <th className="py-2.5 px-4">Treinador</th>
              <th className="py-2.5 px-4">Cargo / Função</th>
              <th className="py-2.5 px-4">Universidade</th>
              <th className="py-2.5 px-4">Estado / Liga</th>
              <th className="py-2.5 px-4">Contato</th>
              <th className="py-2.5 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/80">
            {paginatedCoaches.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-neutral-400">
                  Nenhum treinador encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              paginatedCoaches.map((coach) => {
                const name =
                  `${coach.first_name || ""} ${coach.last_name || ""}`.trim() || "Sem nome";
                return (
                  <tr
                    key={`${coach.universityId}-${coach.id || coach.email}`}
                    className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {name}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-neutral-600 dark:text-neutral-400">
                      {coach.role || "—"}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate max-w-[220px]">{coach.universityName}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-neutral-600 dark:text-neutral-400">
                      <span className="font-mono text-xs">{coach.universityState || "—"}</span>
                      {coach.universityLeague && (
                        <span className="text-neutral-400 ml-1.5 font-sans">
                          · {coach.universityLeague}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                      <div className="flex items-center gap-1 select-all">
                        <Mail className="w-3 h-3 text-neutral-400" />
                        <span>{coach.email}</span>
                      </div>
                      {coach.phone && (
                        <div className="flex items-center gap-1 text-neutral-400 mt-0.5">
                          <Phone className="w-3 h-3" />
                          <span>{coach.phone}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenProfile(coach)}
                          className="p-1.5 text-neutral-500 hover:text-emerald-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                          title="Ver Perfil, Preferências e Linha do Tempo"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(coach)}
                          className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                          title="Editar Treinador"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(coach)}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                          title="Remover Treinador"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs pt-2">
        <div className="flex items-center gap-2 text-neutral-500">
          <span>Itens por página:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value) as 25 | 50 | 100);
              setPage(1);
            }}
            className="p-1 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="font-mono">
            Página {currentPage} de {totalPages}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="p-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 disabled:opacity-40 hover:bg-neutral-50"
            title="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="p-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 disabled:opacity-40 hover:bg-neutral-50"
            title="Próxima página"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Profile Drawer */}
      <CoachProfileDrawer
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
        coach={profileCoach}
        onUpdated={onReload}
      />

      {/* Edit / Create Form Modal */}
      <CoachFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        universities={universities}
        editingCoach={editingCoach}
        onSuccess={onReload}
      />
    </div>
  );
}

import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { EmptyState, Panel, buttonClass, inputClass } from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
import type { Athlete } from "@/types/db";

export const Route = createFileRoute("/admin/athletes/")({ component: AthletesPage });

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function AthletesPage() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function load() {
    const { data, error } = await supabase
      .from("athletes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setAthletes((data ?? []) as Athlete[]);
  }
  useEffect(() => void load(), []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const { data: agency } = await supabase.from("agencies").select("id").limit(1).single();
    if (!agency) return toast.error("Crie a agência antes do primeiro atleta.");
    const { error } = await supabase.from("athletes").insert({
      agency_id: agency.id,
      full_name: name,
      email: email || null,
      slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Atleta criado.");
      setName("");
      setEmail("");
      setOpen(false);
      await load();
    }
  }
  const filtered = useMemo(
    () => athletes.filter((item) => item.full_name.toLowerCase().includes(search.toLowerCase())),
    [athletes, search],
  );

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Atletas">
        <Panel
          title="Todos os atletas"
          description={`${athletes.filter((item) => !item.deleted_at).length} atletas ativos`}
          action={
            <button className={buttonClass} onClick={() => setOpen(!open)}>
              <Plus className="mr-2 h-4 w-4" /> Novo atleta
            </button>
          }
        >
          {open && (
            <form
              onSubmit={create}
              className="grid gap-4 border-b bg-muted/40 p-5 md:grid-cols-[1fr_1fr_auto]"
            >
              <input
                className={inputClass}
                placeholder="Nome completo"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="E-mail do atleta"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className={buttonClass}>Criar perfil</button>
            </form>
          )}
          <div className="border-b p-4">
            <label className="flex max-w-sm items-center gap-2 rounded-md border bg-background px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                className="h-10 w-full bg-transparent text-sm outline-none"
                placeholder="Buscar atleta"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {filtered.length ? (
            <div className="divide-y">
              {filtered.map((athlete) => (
                <Link
                  key={athlete.id}
                  to="/admin/athletes/$id"
                  params={{ id: athlete.id }}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold">
                      {athlete.photo_url ? (
                        <img
                          src={athlete.photo_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        athlete.full_name[0]
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{athlete.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {athlete.email ?? "Sem convite"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {athlete.deleted_at && (
                      <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        Arquivado
                      </span>
                    )}
                    {athlete.is_public && (
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                        Publicado
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhum atleta encontrado.</EmptyState>
          )}
        </Panel>
      </AppShell>
    </ProtectedPage>
  );
}

import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileClock,
  Files,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import {
  EmptyState,
  Panel,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/admin-ui";
import { createDefaultProposalContent, proposalIsExpired } from "@/lib/proposals";
import { supabase } from "@/lib/supabase/client";
import type { Athlete, Proposal, ProposalLanguage } from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/proposals/")({
  component: ProposalsPage,
});

const statusLabel: Record<string, string> = {
  draft: "Rascunho",
  published: "Aguardando resposta",
  accepted: "Aceita",
  declined: "Recusada",
  archived: "Arquivada",
  expired: "Expirada",
};

function ProposalsPage() {
  const [items, setItems] = useState<Proposal[]>([]),
    [athletes, setAthletes] = useState<Athlete[]>([]),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [creating, setCreating] = useState(false);
  const [athleteId, setAthleteId] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [sport, setSport] = useState(""),
    [language, setLanguage] = useState<ProposalLanguage>("en");
  const navigate = useNavigate();
  async function load() {
    const [p, a] = await Promise.all([
      supabase.from("proposals").select("*").order("created_at", { ascending: false }),
      supabase.from("athletes").select("*").is("deleted_at", null).order("full_name"),
    ]);
    if (p.error) toast.error(p.error.message);
    else setItems((p.data ?? []) as Proposal[]);
    setAthletes((a.data ?? []) as Athlete[]);
  }
  useEffect(() => void load(), []);
  function selectAthlete(id: string) {
    setAthleteId(id);
    const a = athletes.find((x) => x.id === id);
    if (a) {
      setName(a.full_name);
      setEmail(a.email ?? "");
      setSport("");
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { data: agency } = await supabase.from("agencies").select("id").limit(1).single();
    const { data: user } = await supabase.auth.getUser();
    if (!agency) return toast.error("Agência não encontrada.");
    const athlete = athletes.find((x) => x.id === athleteId);
    const { data, error } = await supabase
      .from("proposals")
      .insert({
        agency_id: agency.id,
        athlete_id: athleteId || null,
        recipient_name: name,
        recipient_email: email,
        recipient_sport: sport || null,
        recipient_photo_url: athlete?.photo_url ?? null,
        title: language === "pt" ? "Proposta de bolsa" : "Scholarship Offer",
        language,
        draft_content: createDefaultProposalContent(language),
        created_by: user.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    await navigate({ to: "/admin/proposals/$id", params: { id: data.id } });
  }
  async function copyLink(p: Proposal) {
    await navigator.clipboard.writeText(`${window.location.origin}/proposal/${p.public_token}`);
    toast.success("Link copiado.");
  }
  async function archive(p: Proposal) {
    const { error } = await supabase
      .from("proposals")
      .update({ status: "archived" })
      .eq("id", p.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Proposta arquivada.");
      await load();
    }
  }
  async function duplicate(p: Proposal) {
    const { data: user } = await supabase.auth.getUser();
    const {
      id: _,
      public_token: __,
      active_version_id: ___,
      created_at: ____,
      updated_at: _____,
      ...copy
    } = p;
    void _;
    void __;
    void ___;
    void ____;
    void _____;
    const { data, error } = await supabase
      .from("proposals")
      .insert({
        ...copy,
        status: "draft",
        created_by: user.user?.id ?? null,
        title: `${p.title} · Cópia`,
      })
      .select("id")
      .single();
    if (error) toast.error(error.message);
    else await navigate({ to: "/admin/proposals/$id", params: { id: data.id } });
  }
  const visible = useMemo(
    () =>
      items.filter((p) => {
        const state =
          proposalIsExpired(p.expires_at) && p.status === "published" ? "expired" : p.status;
        return (
          (filter === "all" || state === filter) &&
          `${p.recipient_name} ${p.recipient_email} ${p.title}`
            .toLowerCase()
            .includes(search.toLowerCase())
        );
      }),
    [items, search, filter],
  );
  const metrics = [
    { label: "Total", value: items.filter((p) => p.status !== "archived").length, icon: Files },
    {
      label: "Rascunhos",
      value: items.filter((p) => p.status === "draft").length,
      icon: FileClock,
    },
    {
      label: "Aguardando",
      value: items.filter((p) => p.status === "published" && !proposalIsExpired(p.expires_at))
        .length,
      icon: ExternalLink,
    },
    {
      label: "Aceitas",
      value: items.filter((p) => p.status === "accepted").length,
      icon: FileCheck2,
    },
  ];
  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Propostas">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ label, value, icon: Icon }) => (
              <div key={label} className="glass-panel rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-4 font-display text-4xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <Panel
            title="Propostas personalizadas"
            description="Crie, publique e acompanhe ofertas em um único lugar."
            action={
              <button className={buttonClass} onClick={() => setCreating((v) => !v)}>
                <Plus className="mr-2 h-4 w-4" /> Nova proposta
              </button>
            }
          >
            {creating && (
              <form
                onSubmit={create}
                className="grid gap-3 border-b p-5 md:grid-cols-2 xl:grid-cols-5"
              >
                <select
                  className={inputClass}
                  value={athleteId}
                  onChange={(e) => selectAthlete(e.target.value)}
                >
                  <option value="">Prospect sem cadastro</option>
                  {athletes.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.full_name}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  required
                  placeholder="Nome do destinatário"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className={inputClass}
                  required
                  type="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className={inputClass}
                  placeholder="Esporte"
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                />
                <div className="flex gap-2">
                  <select
                    className={inputClass}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as ProposalLanguage)}
                  >
                    <option value="en">English</option>
                    <option value="pt">Português</option>
                  </select>
                  <button className={buttonClass}>Criar</button>
                </div>
              </form>
            )}
            <div className="flex flex-col gap-3 border-b p-4 md:flex-row">
              <label className="flex flex-1 items-center gap-2 rounded-md border bg-background/55 px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  className="h-10 w-full bg-transparent text-sm outline-none"
                  placeholder="Buscar por nome, e-mail ou título"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                className={inputClass + " md:max-w-56"}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Todos os status</option>
                {Object.entries(statusLabel).map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {visible.length ? (
              <div className="divide-y">
                {visible.map((p) => {
                  const state =
                    proposalIsExpired(p.expires_at) && p.status === "published"
                      ? "expired"
                      : p.status;
                  return (
                    <article
                      key={p.id}
                      className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center"
                    >
                      <Link
                        to="/admin/proposals/$id"
                        params={{ id: p.id }}
                        className="min-w-0 flex-1"
                      >
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            {statusLabel[state]}
                          </span>
                          <span className="text-xs uppercase tracking-wider text-muted-foreground">
                            {p.language}
                          </span>
                        </div>
                        <h3 className="mt-3 truncate font-display text-xl font-semibold">
                          {p.recipient_name}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {p.title} · {p.recipient_email}
                          {p.expires_at
                            ? ` · até ${new Date(`${p.expires_at}T12:00`).toLocaleDateString("pt-BR")}`
                            : ""}
                        </p>
                      </Link>
                      <div className="flex flex-wrap gap-2">
                        {p.status !== "draft" && p.status !== "archived" && (
                          <>
                            <button
                              className={secondaryButtonClass}
                              onClick={() => void copyLink(p)}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <a
                              className={secondaryButtonClass}
                              href={`/proposal/${p.public_token}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <a
                              className={secondaryButtonClass}
                              href={`/proposal/${p.public_token}/pdf`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </>
                        )}
                        <button className={secondaryButtonClass} onClick={() => void duplicate(p)}>
                          <Files className="mr-2 h-4 w-4" /> Duplicar
                        </button>
                        {p.status !== "archived" && (
                          <button className={secondaryButtonClass} onClick={() => void archive(p)}>
                            <Archive className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState>Nenhuma proposta encontrada.</EmptyState>
            )}
          </Panel>
        </div>
      </AppShell>
    </ProtectedPage>
  );
}

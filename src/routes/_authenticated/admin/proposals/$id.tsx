import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Eye,
  GripVertical,
  ImagePlus,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, PageLoading, ProtectedPage } from "@/components/app-shell";
import { ProposalExperience } from "@/components/proposal-experience";
import {
  buttonClass,
  inputClass,
  secondaryButtonClass,
  textareaClass,
} from "@/components/admin-ui";
import { createDefaultProposalContent, parseProposalContent } from "@/lib/proposals";
import { supabase } from "@/lib/supabase/client";
import type {
  Athlete,
  Proposal,
  ProposalBlock,
  ProposalContent,
  ProposalLanguage,
  ProposalRow,
} from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/proposals/$id")({
  component: ProposalEditor,
});
const steps = ["Destinatário", "Oportunidade", "Conteúdo", "Investimento", "Revisão"];

function ProposalEditor() {
  const id = Route.useParams().id;
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [athletes, setAthletes] = useState<Athlete[]>([]),
    [content, setContent] = useState<ProposalContent>(createDefaultProposalContent()),
    [step, setStep] = useState(0),
    [preview, setPreview] = useState(false),
    [saving, setSaving] = useState(false),
    [published, setPublished] = useState(false);
  useEffect(() => {
    void Promise.all([
      supabase.from("proposals").select("*").eq("id", id).single(),
      supabase.from("athletes").select("*").is("deleted_at", null).order("full_name"),
    ]).then(([p, a]) => {
      if (p.error) toast.error(p.error.message);
      else {
        const item = p.data as Proposal;
        setProposal(item);
        setContent(parseProposalContent(item.draft_content, item.language));
      }
      setAthletes((a.data ?? []) as Athlete[]);
    });
  }, [id]);
  const locked =
    proposal?.status === "accepted" ||
    proposal?.status === "declined" ||
    proposal?.status === "archived";
  const publicUrl = proposal
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/proposal/${proposal.public_token}`
    : "";
  function patchProposal(values: Partial<Proposal>) {
    setProposal((p) => (p ? { ...p, ...values } : p));
  }
  function patchBlock(blockId: string, values: Partial<ProposalBlock>) {
    setContent((c) => ({
      ...c,
      blocks: c.blocks.map((b) => (b.id === blockId ? { ...b, ...values } : b)),
    }));
  }
  function move(blockId: string, direction: number) {
    setContent((c) => {
      const blocks = [...c.blocks],
        i = blocks.findIndex((b) => b.id === blockId),
        j = i + direction;
      if (j < 0 || j >= blocks.length) return c;
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...c, blocks };
    });
  }
  function duplicateBlock(blockId: string) {
    setContent((current) => {
      const index = current.blocks.findIndex((block) => block.id === blockId);
      if (index < 0) return current;
      const source = current.blocks[index];
      const duplicate: ProposalBlock = {
        ...source,
        id: crypto.randomUUID(),
        title: `${source.title} · cópia`,
        rows: source.rows?.map((row) => ({ ...row, id: crypto.randomUUID() })),
      };
      const blocks = [...current.blocks];
      blocks.splice(index + 1, 0, duplicate);
      return { ...current, blocks };
    });
  }
  function setAthlete(id: string) {
    const a = athletes.find((x) => x.id === id);
    patchProposal({
      athlete_id: id || null,
      ...(a
        ? {
            recipient_name: a.full_name,
            recipient_email: a.email ?? proposal?.recipient_email ?? "",
            recipient_photo_url: a.photo_url,
          }
        : {}),
    });
  }
  async function upload(block: ProposalBlock, file?: File) {
    if (!file || !proposal) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg",
      path = `${proposal.id}/${block.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("proposal-assets").upload(path, file);
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("proposal-assets").getPublicUrl(path);
    patchBlock(block.id, { imageUrl: data.publicUrl });
    toast.success("Imagem adicionada.");
  }
  async function save(silent = false) {
    if (!proposal) return false;
    setSaving(true);
    const { error } = await supabase
      .from("proposals")
      .update({
        athlete_id: proposal.athlete_id,
        recipient_name: proposal.recipient_name,
        recipient_email: proposal.recipient_email,
        recipient_sport: proposal.recipient_sport,
        recipient_photo_url: proposal.recipient_photo_url,
        title: proposal.title,
        language: proposal.language,
        expires_at: proposal.expires_at,
        draft_content: content,
      })
      .eq("id", proposal.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    if (!silent) toast.success("Rascunho salvo.");
    return true;
  }
  async function publish() {
    if (!proposal || locked) return;
    if (!proposal.recipient_name || !proposal.recipient_email)
      return toast.error("Preencha nome e e-mail do destinatário.");
    if (!(await save(true))) return;
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const { data: last } = await supabase
      .from("proposal_versions")
      .select("version_number")
      .eq("proposal_id", proposal.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: version, error } = await supabase
      .from("proposal_versions")
      .insert({
        proposal_id: proposal.id,
        version_number: (last?.version_number ?? 0) + 1,
        language: proposal.language,
        content,
        created_by: user.user?.id ?? null,
      })
      .select("id,version_number")
      .single();
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    const update = await supabase
      .from("proposals")
      .update({ active_version_id: version.id, status: "published" })
      .eq("id", proposal.id);
    setSaving(false);
    if (update.error) return toast.error(update.error.message);
    patchProposal({ active_version_id: version.id, status: "published" });
    setPublished(true);
    toast.success(`Versão ${version.version_number} publicada.`);
  }
  async function copy() {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copiado.");
  }
  if (!proposal) return <PageLoading />;
  const experience = {
    recipientName: proposal.recipient_name,
    recipientSport: proposal.recipient_sport,
    recipientPhotoUrl: proposal.recipient_photo_url,
    title: proposal.title,
    language: proposal.language,
    expiresAt: proposal.expires_at,
    content,
  };
  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title={`Proposta · ${proposal.recipient_name}`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 overflow-x-auto">
            {steps.map((label, i) => (
              <button
                key={label}
                onClick={() => setStep(i)}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${i === step ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              className={secondaryButtonClass + " xl:hidden"}
              onClick={() => setPreview((v) => !v)}
            >
              <Eye className="mr-2 h-4 w-4" /> {preview ? "Editor" : "Prévia"}
            </button>
            <button
              disabled={saving || locked}
              className={secondaryButtonClass}
              onClick={() => void save()}
            >
              <Save className="mr-2 h-4 w-4" /> Salvar
            </button>
            <button
              disabled={saving || locked}
              className={buttonClass}
              onClick={() => void publish()}
            >
              <Send className="mr-2 h-4 w-4" /> Publicar
            </button>
          </div>
        </div>
        {locked && (
          <div className="mb-5 rounded-lg border border-primary/25 bg-primary/8 p-4 text-sm">
            Esta proposta foi respondida ou arquivada e está bloqueada para edição. Duplique-a para
            iniciar uma nova negociação.
          </div>
        )}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(520px,.9fr)]">
          <div className={preview ? "hidden xl:block" : "space-y-4"}>
            <div className="glass-panel rounded-lg p-5">
              {step === 0 && (
                <RecipientStep
                  proposal={proposal}
                  athletes={athletes}
                  patch={patchProposal}
                  setAthlete={setAthlete}
                  onLanguage={(lang) => {
                    patchProposal({ language: lang });
                    setContent(createDefaultProposalContent(lang));
                  }}
                />
              )}
              {step === 1 && <OpportunityStep proposal={proposal} patch={patchProposal} />}{" "}
              {step === 2 && (
                <BlocksStep
                  content={content}
                  patchBlock={patchBlock}
                  move={move}
                  duplicate={duplicateBlock}
                  upload={upload}
                />
              )}{" "}
              {step === 3 && (
                <FinanceStep content={content} setContent={setContent} patchBlock={patchBlock} />
              )}{" "}
              {step === 4 && <ReviewStep proposal={proposal} content={content} />}
            </div>
            <div className="flex justify-between">
              <button
                disabled={step === 0}
                className={secondaryButtonClass}
                onClick={() => setStep((s) => s - 1)}
              >
                Voltar
              </button>
              <button
                disabled={step === steps.length - 1}
                className={buttonClass}
                onClick={() => setStep((s) => s + 1)}
              >
                Continuar
              </button>
            </div>
          </div>
          <div className={!preview ? "hidden xl:block" : ""}>
            <div className="sticky top-24 overflow-hidden rounded-xl border border-white/15 shadow-2xl">
              <ProposalExperience compact data={experience} />
            </div>
          </div>
        </div>
        {published && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4">
            <div className="w-full max-w-lg rounded-xl bg-card p-7 shadow-2xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check />
              </div>
              <h2 className="mt-5 font-display text-3xl font-semibold">Proposta publicada</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                O link está pronto para ser compartilhado e sempre abrirá a versão mais recente.
              </p>
              <div className="mt-5 rounded-md bg-muted p-3 text-xs break-all">{publicUrl}</div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className={buttonClass} onClick={() => void copy()}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar link
                </button>
                <a
                  className={secondaryButtonClass}
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir
                </a>
                <a
                  className={secondaryButtonClass}
                  href={`${publicUrl}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Baixar PDF
                </a>
                <button className={secondaryButtonClass} onClick={() => setPublished(false)}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </ProtectedPage>
  );
}

function RecipientStep({
  proposal,
  athletes,
  patch,
  setAthlete,
  onLanguage,
}: {
  proposal: Proposal;
  athletes: Athlete[];
  patch: (p: Partial<Proposal>) => void;
  setAthlete: (id: string) => void;
  onLanguage: (l: ProposalLanguage) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Atleta cadastrado">
        <select
          className={inputClass}
          value={proposal.athlete_id ?? ""}
          onChange={(e) => setAthlete(e.target.value)}
        >
          <option value="">Prospect sem cadastro</option>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.full_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Idioma">
        <select
          className={inputClass}
          value={proposal.language}
          onChange={(e) => onLanguage(e.target.value as ProposalLanguage)}
        >
          <option value="en">English</option>
          <option value="pt">Português</option>
        </select>
      </Field>
      <Field label="Nome">
        <input
          className={inputClass}
          required
          value={proposal.recipient_name}
          onChange={(e) => patch({ recipient_name: e.target.value })}
        />
      </Field>
      <Field label="E-mail">
        <input
          className={inputClass}
          type="email"
          required
          value={proposal.recipient_email}
          onChange={(e) => patch({ recipient_email: e.target.value })}
        />
      </Field>
      <Field label="Esporte">
        <input
          className={inputClass}
          value={proposal.recipient_sport ?? ""}
          onChange={(e) => patch({ recipient_sport: e.target.value })}
        />
      </Field>
      <Field label="Foto do destinatário (URL)">
        <input
          className={inputClass}
          value={proposal.recipient_photo_url ?? ""}
          onChange={(e) => patch({ recipient_photo_url: e.target.value })}
        />
      </Field>
    </div>
  );
}
function OpportunityStep({
  proposal,
  patch,
}: {
  proposal: Proposal;
  patch: (p: Partial<Proposal>) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Título da proposta">
        <input
          className={inputClass}
          value={proposal.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </Field>
      <Field label="Validade">
        <input
          className={inputClass}
          type="date"
          value={proposal.expires_at ?? ""}
          onChange={(e) => patch({ expires_at: e.target.value || null })}
        />
      </Field>
      <p className="md:col-span-2 text-sm text-muted-foreground">
        Os detalhes da universidade, treinador, liga e início são configurados no bloco “Detalhes”
        da próxima etapa.
      </p>
    </div>
  );
}
function BlocksStep({
  content,
  patchBlock,
  move,
  duplicate,
  upload,
}: {
  content: ProposalContent;
  patchBlock: (id: string, p: Partial<ProposalBlock>) => void;
  move: (id: string, d: number) => void;
  duplicate: (id: string) => void;
  upload: (b: ProposalBlock, f?: File) => void;
}) {
  return (
    <div className="space-y-3">
      {content.blocks.map((b, i) => (
        <div key={b.id} className="rounded-lg border bg-background/45 p-4">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <input
              type="checkbox"
              checked={b.enabled}
              onChange={(e) => patchBlock(b.id, { enabled: e.target.checked })}
            />
            <input
              className={inputClass}
              value={b.title}
              onChange={(e) => patchBlock(b.id, { title: e.target.value })}
            />
            <button
              className={secondaryButtonClass}
              onClick={() => move(b.id, -1)}
              disabled={i === 0}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              className={secondaryButtonClass}
              onClick={() => move(b.id, 1)}
              disabled={i === content.blocks.length - 1}
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              className={secondaryButtonClass}
              onClick={() => duplicate(b.id)}
              title="Duplicar seção"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <textarea
              className={textareaClass}
              placeholder="Texto da seção"
              value={b.body ?? ""}
              onChange={(e) => patchBlock(b.id, { body: e.target.value })}
            />
            <div>
              <input
                className={inputClass}
                placeholder="Subtítulo"
                value={b.subtitle ?? ""}
                onChange={(e) => patchBlock(b.id, { subtitle: e.target.value })}
              />
              <label className={secondaryButtonClass + " mt-3 cursor-pointer"}>
                <ImagePlus className="mr-2 h-4 w-4" /> Imagem
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void upload(b, e.target.files?.[0])}
                />
              </label>
            </div>
          </div>
          {!["cover", "scholarship", "closing"].includes(b.type) && (
            <RowsEditor
              rows={b.rows ?? []}
              setRows={(rows) => patchBlock(b.id, { rows })}
              mode={
                ["school_costs", "general_costs"].includes(b.type)
                  ? "cost"
                  : b.type === "links"
                    ? "link"
                    : "generic"
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}
function FinanceStep({
  content,
  setContent,
  patchBlock,
}: {
  content: ProposalContent;
  setContent: (c: ProposalContent) => void;
  patchBlock: (id: string, p: Partial<ProposalBlock>) => void;
}) {
  const block = content.blocks.find((b) => b.type === "scholarship")!;
  return (
    <div className="space-y-5">
      <Field label="Moeda">
        <input
          className={inputClass}
          maxLength={3}
          value={content.currency}
          onChange={(e) => setContent({ ...content, currency: e.target.value.toUpperCase() })}
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Custo anual", "totalCost"],
          ["Bolsa", "scholarship"],
          ["Investimento estimado", "outOfPocket"],
        ].map(([label, key]) => (
          <Field key={key} label={label}>
            <input
              type="number"
              className={inputClass}
              value={Number(block.data?.[key] ?? 0)}
              onChange={(e) =>
                patchBlock(block.id, { data: { ...block.data, [key]: Number(e.target.value) } })
              }
            />
          </Field>
        ))}
      </div>
      <RowsEditor
        rows={block.rows ?? []}
        setRows={(rows) => patchBlock(block.id, { rows })}
        mode="cost"
      />
    </div>
  );
}
function ReviewStep({ proposal, content }: { proposal: Proposal; content: ProposalContent }) {
  const enabled = content.blocks.filter((b) => b.enabled);
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-semibold">Tudo pronto para revisar</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Summary
          label="Destinatário"
          value={`${proposal.recipient_name} · ${proposal.recipient_email}`}
        />
        <Summary label="Idioma" value={proposal.language.toUpperCase()} />
        <Summary
          label="Validade"
          value={
            proposal.expires_at
              ? new Date(`${proposal.expires_at}T12:00`).toLocaleDateString("pt-BR")
              : "Sem validade"
          }
        />
        <Summary label="Seções" value={`${enabled.length} blocos ativos`} />
      </div>
      <p className="text-sm text-muted-foreground">
        Publicar cria uma versão imutável. O link público só ficará acessível depois da publicação.
      </p>
    </div>
  );
}
function RowsEditor({
  rows,
  setRows,
  mode = "generic",
}: {
  rows: ProposalRow[];
  setRows: (r: ProposalRow[]) => void;
  mode?: "generic" | "cost" | "link";
}) {
  function patch(id: string, p: Partial<ProposalRow>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Itens da seção
        </p>
        <button
          className={secondaryButtonClass}
          onClick={() => setRows([...rows, { id: crypto.randomUUID(), label: "Novo item" }])}
        >
          <Plus className="mr-2 h-4 w-4" /> Item
        </button>
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          className="grid gap-2 rounded-md bg-muted/45 p-3 md:grid-cols-[1fr_1fr_1.5fr_auto]"
        >
          <input
            className={inputClass}
            placeholder="Nome"
            value={r.label}
            onChange={(e) => patch(r.id, { label: e.target.value })}
          />
          {mode === "cost" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.01"
                placeholder="Valor"
                value={r.amount ?? ""}
                onChange={(e) =>
                  patch(r.id, {
                    amount: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
              <input
                className={inputClass}
                placeholder="Frequência"
                value={r.frequency ?? ""}
                onChange={(e) => patch(r.id, { frequency: e.target.value })}
              />
            </div>
          ) : (
            <input
              className={inputClass}
              placeholder={mode === "link" ? "Descrição" : "Valor ou frequência"}
              value={r.value ?? ""}
              onChange={(e) => patch(r.id, { value: e.target.value })}
            />
          )}
          <input
            className={inputClass}
            placeholder={mode === "link" ? "https://..." : "Notas"}
            value={mode === "link" ? (r.url ?? "") : (r.notes ?? "")}
            onChange={(e) =>
              patch(r.id, mode === "link" ? { url: e.target.value } : { notes: e.target.value })
            }
          />
          <button
            className={secondaryButtonClass}
            onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/40 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-medium">{value}</p>
    </div>
  );
}

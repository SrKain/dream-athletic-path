import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { Panel, buttonClass, inputClass, secondaryButtonClass } from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
import { validateUpload } from "@/lib/uploads";
import type { AgencyVisualSettings, Position } from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/visual")({
  component: VisualSettingsPage,
});

type VisualDraft = Omit<AgencyVisualSettings, "agency_id" | "updated_at">;

const emptyDraft: VisualDraft = {
  catalog_heading_en: "",
  catalog_heading_pt: "",
  hero_subtitle_en: "",
  hero_subtitle_pt: "",
  hero_title_en: "",
  hero_title_pt: "",
  logo_url: "",
  hero_background_url: "",
};

function VisualSettingsPage() {
  const [draft, setDraft] = useState<VisualDraft>(emptyDraft);
  const [positions, setPositions] = useState<Position[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);

  const load = useCallback(async () => {
    const [visualResult, positionsResult, orderResult] = await Promise.all([
      supabase.from("agency_visual_settings").select("*").limit(1).maybeSingle(),
      supabase.from("positions").select("*").order("name_pt"),
      supabase.from("catalog_position_order").select("position_id, sort_order").order("sort_order"),
    ]);
    if (visualResult.data) {
      const value = visualResult.data as AgencyVisualSettings;
      setDraft({
        catalog_heading_en: value.catalog_heading_en ?? "",
        catalog_heading_pt: value.catalog_heading_pt ?? "",
        hero_subtitle_en: value.hero_subtitle_en ?? "",
        hero_subtitle_pt: value.hero_subtitle_pt ?? "",
        hero_title_en: value.hero_title_en ?? "",
        hero_title_pt: value.hero_title_pt ?? "",
        logo_url: value.logo_url ?? "",
        hero_background_url: value.hero_background_url ?? "",
      });
    }
    const allPositions = (positionsResult.data ?? []) as Position[];
    const order = ((orderResult.data ?? []) as { position_id: string }[]).map(
      (item) => item.position_id,
    );
    setPositions(
      [...allPositions].sort((a, b) => {
        const rankA = order.indexOf(a.id);
        const rankB = order.indexOf(b.id);
        return (
          (rankA === -1 ? Number.MAX_SAFE_INTEGER : rankA) -
            (rankB === -1 ? Number.MAX_SAFE_INTEGER : rankB) ||
          a.name_pt.localeCompare(b.name_pt, "pt-BR")
        );
      }),
    );
  }, []);
  useEffect(() => void load(), [load]);

  async function uploadImage(kind: "logo" | "hero", file?: File) {
    if (!file) return;
    const validation = validateUpload("photo", file);
    if (!validation.valid) return toast.error("Imagem inválida ou acima do limite permitido.");

    if (kind === "logo") setUploadingLogo(true);
    else setUploadingHero(true);

    const ext = file.name.split(".").pop() || "jpg";
    const path = `agency/branding/${kind}-${Date.now()}.${ext}`;
    const stored = await supabase.storage
      .from("athlete-media")
      .upload(path, file, { upsert: true });

    if (stored.error) {
      toast.error(stored.error.message);
    } else {
      const publicUrl = supabase.storage.from("athlete-media").getPublicUrl(path).data.publicUrl;
      if (kind === "logo") {
        setDraft((prev) => ({ ...prev, logo_url: publicUrl }));
        toast.success("Logo da agência carregada com sucesso.");
      } else {
        setDraft((prev) => ({ ...prev, hero_background_url: publicUrl }));
        toast.success("Imagem de fundo do hero carregada com sucesso.");
      }
    }

    if (kind === "logo") setUploadingLogo(false);
    else setUploadingHero(false);
  }

  async function saveTexts() {
    setSaving(true);
    const { data: agency } = await supabase.from("agencies").select("id").limit(1).single();
    if (!agency) {
      setSaving(false);
      return toast.error("Agência não encontrada.");
    }
    const { error } = await supabase.from("agency_visual_settings").upsert(
      {
        agency_id: agency.id,
        ...draft,
        logo_url: draft.logo_url?.trim() || null,
        hero_background_url: draft.hero_background_url?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agency_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Configurações visuais salvas com sucesso.");
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...positions];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPositions(next);
  }

  async function saveOrder() {
    const payload = positions.map((item, index) => ({
      position_id: item.id,
      sort_order: index,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("catalog_position_order")
      .upsert(payload, { onConflict: "position_id" });
    if (error) toast.error(error.message);
    else toast.success("Ordem das categorias salva.");
  }

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Visual & Identidade">
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Identidade & Hero do Catálogo"
            description="Logotipo da agência, imagem de fundo e textos exibidos na página pública."
          >
            <div className="grid gap-5 p-5">
              {/* Logo da Agência */}
              <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Logo da Agência (Header & Footer)</span>
                  {draft.logo_url && (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, logo_url: "" })}
                      className="text-xs text-destructive hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" /> Remover logo
                    </button>
                  )}
                </div>
                {draft.logo_url ? (
                  <div className="flex items-center gap-4 bg-muted/60 p-3 rounded-md">
                    <img
                      src={draft.logo_url}
                      alt="Logo preview"
                      className="h-10 max-w-[160px] object-contain rounded"
                    />
                    <span className="text-xs text-muted-foreground truncate">{draft.logo_url}</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sem logo personalizada. O texto &ldquo;Go Team Go&rdquo; será usado.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <label className={secondaryButtonClass + " cursor-pointer text-xs"}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {uploadingLogo ? "Enviando..." : "Fazer upload de logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => void uploadImage("logo", e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>

              {/* Imagem de Fundo do Hero */}
              <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Imagem de Fundo do Hero (Home)</span>
                  {draft.hero_background_url && (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, hero_background_url: "" })}
                      className="text-xs text-destructive hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" /> Remover imagem
                    </button>
                  )}
                </div>
                {draft.hero_background_url ? (
                  <div className="relative h-28 w-full rounded-md overflow-hidden border">
                    <img
                      src={draft.hero_background_url}
                      alt="Hero background preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Usando a imagem padrão de voleibol de alta resolução com gradiente esmeralda.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <label className={secondaryButtonClass + " cursor-pointer text-xs"}>
                    <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                    {uploadingHero ? "Enviando..." : "Fazer upload de imagem do Hero"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => void uploadImage("hero", e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>

              <Field label="Título (EN) — Padrão US">
                <input
                  className={inputClass}
                  value={draft.hero_title_en ?? ""}
                  onChange={(e) => setDraft({ ...draft, hero_title_en: e.target.value })}
                  placeholder="Athletes ready to play, study, and compete in the USA."
                />
              </Field>
              <Field label="Título (PT)">
                <input
                  className={inputClass}
                  value={draft.hero_title_pt ?? ""}
                  onChange={(e) => setDraft({ ...draft, hero_title_pt: e.target.value })}
                  placeholder="Atletas prontos para jogar, estudar e competir nos EUA."
                />
              </Field>
              <Field label="Subtítulo (EN) — Padrão US">
                <textarea
                  className={inputClass + " min-h-20 py-2"}
                  value={draft.hero_subtitle_en ?? ""}
                  onChange={(e) => setDraft({ ...draft, hero_subtitle_en: e.target.value })}
                  placeholder="Explore athlete profiles by position, watch game film, and discover top Brazilian recruits with verified academic and athletic credentials."
                />
              </Field>
              <Field label="Subtítulo (PT)">
                <textarea
                  className={inputClass + " min-h-20 py-2"}
                  value={draft.hero_subtitle_pt ?? ""}
                  onChange={(e) => setDraft({ ...draft, hero_subtitle_pt: e.target.value })}
                />
              </Field>
              <Field label="Cabeçalho da lista (EN) — Padrão US">
                <input
                  className={inputClass}
                  value={draft.catalog_heading_en ?? ""}
                  onChange={(e) => setDraft({ ...draft, catalog_heading_en: e.target.value })}
                  placeholder="Our Athletes"
                />
              </Field>
              <Field label="Cabeçalho da lista (PT)">
                <input
                  className={inputClass}
                  value={draft.catalog_heading_pt ?? ""}
                  onChange={(e) => setDraft({ ...draft, catalog_heading_pt: e.target.value })}
                  placeholder="Nossos Atletas"
                />
              </Field>
              <div>
                <button className={buttonClass} disabled={saving} onClick={() => void saveTexts()}>
                  {saving ? "Salvando..." : "Salvar alterações visuais"}
                </button>
              </div>
              <div className="rounded-md border border-border/70 bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Preview dos Textos
                </p>
                <h3 className="mt-2 font-display text-2xl font-semibold leading-tight">
                  {draft.hero_title_en || "Athletes ready to play, study, and compete in the USA."}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {draft.hero_subtitle_en ||
                    "Explore athlete profiles by position, watch game film, and discover top recruits."}
                </p>
                <p className="mt-4 font-display text-lg font-semibold">
                  {draft.catalog_heading_en || "Our Athletes"}
                </p>
              </div>
            </div>
          </Panel>

          <Panel
            title="Ordem das categorias"
            description="Define a ordem das prateleiras por posição no catálogo público."
          >
            <div className="space-y-3 p-5">
              {positions.length ? (
                <ul className="space-y-2">
                  {positions.map((item, index) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/60 px-3 py-2"
                    >
                      <span className="text-sm font-medium">
                        {index + 1}. {item.name_en || item.name_pt}
                      </span>
                      <span className="flex gap-1">
                        <button
                          className={secondaryButtonClass + " h-8 w-8 p-0"}
                          aria-label="Mover para cima"
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          className={secondaryButtonClass + " h-8 w-8 p-0"}
                          aria-label="Mover para baixo"
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma posição cadastrada.</p>
              )}
              <button className={buttonClass} onClick={() => void saveOrder()}>
                Salvar ordem
              </button>
            </div>
          </Panel>
        </div>
      </AppShell>
    </ProtectedPage>
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

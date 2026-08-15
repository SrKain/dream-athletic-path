import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { Panel, buttonClass, inputClass, secondaryButtonClass } from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
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
};

function VisualSettingsPage() {
  const [draft, setDraft] = useState<VisualDraft>(emptyDraft);
  const [positions, setPositions] = useState<Position[]>([]);
  const [saving, setSaving] = useState(false);

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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agency_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Textos do catálogo salvos.");
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
      <AppShell role="agency_admin" title="Visual">
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Hero do catálogo"
            description="Título e subtítulo exibidos no topo da página pública."
          >
            <div className="grid gap-4 p-5">
              <Field label="Título (PT)">
                <input
                  className={inputClass}
                  value={draft.hero_title_pt ?? ""}
                  onChange={(e) => setDraft({ ...draft, hero_title_pt: e.target.value })}
                  placeholder="Atletas prontos para jogar, estudar e competir nos EUA."
                />
              </Field>
              <Field label="Título (EN)">
                <input
                  className={inputClass}
                  value={draft.hero_title_en ?? ""}
                  onChange={(e) => setDraft({ ...draft, hero_title_en: e.target.value })}
                />
              </Field>
              <Field label="Subtítulo (PT)">
                <textarea
                  className={inputClass + " min-h-20 py-2"}
                  value={draft.hero_subtitle_pt ?? ""}
                  onChange={(e) => setDraft({ ...draft, hero_subtitle_pt: e.target.value })}
                />
              </Field>
              <Field label="Subtítulo (EN)">
                <textarea
                  className={inputClass + " min-h-20 py-2"}
                  value={draft.hero_subtitle_en ?? ""}
                  onChange={(e) => setDraft({ ...draft, hero_subtitle_en: e.target.value })}
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
              <Field label="Cabeçalho da lista (EN)">
                <input
                  className={inputClass}
                  value={draft.catalog_heading_en ?? ""}
                  onChange={(e) => setDraft({ ...draft, catalog_heading_en: e.target.value })}
                  placeholder="Our Athletes"
                />
              </Field>
              <div>
                <button className={buttonClass} disabled={saving} onClick={() => void saveTexts()}>
                  {saving ? "Salvando..." : "Salvar textos"}
                </button>
              </div>
              <div className="rounded-md border border-border/70 bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
                <h3 className="mt-2 font-display text-2xl font-semibold leading-tight">
                  {draft.hero_title_pt || "Atletas prontos para jogar, estudar e competir nos EUA."}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {draft.hero_subtitle_pt || "Explore perfis por posição e descubra destaques."}
                </p>
                <p className="mt-4 font-display text-lg font-semibold">
                  {draft.catalog_heading_pt || "Nossos Atletas"}
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
                        {index + 1}. {item.name_pt}
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

import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { EmptyState, Panel, buttonClass, inputClass } from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
import type { ChecklistItem, PipelineStage } from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [stageName, setStageName] = useState("");

  async function load() {
    const [s, i] = await Promise.all([
      supabase.from("pipeline_stages").select("*").order("order_index"),
      supabase.from("checklist_items").select("*").order("sort_order"),
    ]);
    if (s.error) toast.error(s.error.message);
    if (i.error) toast.error(i.error.message);
    setStages((s.data ?? []) as PipelineStage[]);
    setItems((i.data ?? []) as ChecklistItem[]);
  }
  useEffect(() => void load(), []);

  async function addStage(event: React.FormEvent) {
    event.preventDefault();
    const { data: agency } = await supabase.from("agencies").select("id").limit(1).single();
    if (!agency) return toast.error("Crie a agência antes de configurar o pipeline.");
    const key = stageName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const { error } = await supabase.from("pipeline_stages").insert({
      agency_id: agency.id,
      key,
      name_en: stageName,
      name_pt: stageName,
      order_index: (stages.length + 1) * 10,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Etapa adicionada.");
      setStageName("");
      await load();
    }
  }

  async function addChecklist(stageId: string) {
    const label = window.prompt("Nome do item solicitado");
    if (!label) return;
    const { error } = await supabase.from("checklist_items").insert({
      stage_id: stageId,
      label_en: label,
      label_pt: label,
      sort_order: items.filter((item) => item.stage_id === stageId).length * 10,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Item adicionado.");
      await load();
    }
  }

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Configurações">
        <Panel
          title="Etapas do pipeline"
          description="Configure as etapas e os checklists que estruturam a jornada dos atletas."
        >
          <form onSubmit={addStage} className="flex gap-3 border-b border-white/40 p-4">
            <input
              className={inputClass}
              placeholder="Nova etapa"
              required
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
            />
            <button className={buttonClass}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </button>
          </form>
          {stages.length ? (
            <div className="divide-y divide-border/70">
              {stages.map((stage) => (
                <div key={stage.id} className="flex items-start justify-between gap-5 p-4">
                  <div>
                    <h3 className="font-display text-lg font-semibold">
                      {stage.name_pt ?? stage.name_en}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {items
                        .filter((item) => item.stage_id === stage.id)
                        .map((item) => item.label_pt ?? item.label_en)
                        .join(" · ") || "Sem itens"}
                    </p>
                  </div>
                  <button
                    className="text-sm font-medium text-primary"
                    onClick={() => addChecklist(stage.id)}
                  >
                    + Checklist
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhuma etapa configurada.</EmptyState>
          )}
        </Panel>
      </AppShell>
    </ProtectedPage>
  );
}

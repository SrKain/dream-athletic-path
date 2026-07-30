import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { EmptyState, Panel, StatusBadge, buttonClass, inputClass } from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
import type {
  Athlete,
  AthleteStageProgress,
  ChecklistItem,
  PipelineStage,
  StageStatus,
} from "@/types/db";

export const Route = createFileRoute("/admin/pipeline")({ component: PipelinePage });

function PipelinePage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [progress, setProgress] = useState<AthleteStageProgress[]>([]);
  const [stageName, setStageName] = useState("");

  async function load() {
    const [s, i, a, p] = await Promise.all([
      supabase.from("pipeline_stages").select("*").order("order_index"),
      supabase.from("checklist_items").select("*").order("sort_order"),
      supabase.from("athletes").select("*").is("deleted_at", null).order("full_name"),
      supabase.from("athlete_stage_progress").select("*"),
    ]);
    setStages((s.data ?? []) as PipelineStage[]);
    setItems((i.data ?? []) as ChecklistItem[]);
    setAthletes((a.data ?? []) as Athlete[]);
    setProgress((p.data ?? []) as AthleteStageProgress[]);
  }
  useEffect(() => void load(), []);

  async function addStage(event: React.FormEvent) {
    event.preventDefault();
    const { data: agency } = await supabase.from("agencies").select("id").limit(1).single();
    if (!agency) return;
    const key = stageName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-");
    const { error } = await supabase.from("pipeline_stages").insert({
      agency_id: agency.id,
      key,
      name_pt: stageName,
      name_en: stageName,
      order_index: (stages.length + 1) * 10,
    });
    if (error) toast.error(error.message);
    else {
      setStageName("");
      await load();
    }
  }
  async function addChecklist(stageId: string) {
    const label = window.prompt("Nome do item solicitado");
    if (!label) return;
    const { error } = await supabase.from("checklist_items").insert({
      stage_id: stageId,
      label_pt: label,
      label_en: label,
      sort_order: items.filter((item) => item.stage_id === stageId).length * 10,
    });
    if (error) toast.error(error.message);
    else await load();
  }
  async function updateProgress(athleteId: string, stageId: string, status: StageStatus) {
    const existing = progress.find(
      (item) => item.athlete_id === athleteId && item.stage_id === stageId,
    );
    const payload = {
      athlete_id: athleteId,
      stage_id: stageId,
      status,
      started_at:
        status === "in_progress" ? new Date().toISOString() : (existing?.started_at ?? null),
      completed_at: status === "completed" ? new Date().toISOString() : null,
    };
    const { error } = await supabase
      .from("athlete_stage_progress")
      .upsert(payload, { onConflict: "athlete_id,stage_id" });
    if (error) toast.error(error.message);
    else {
      toast.success("Pipeline atualizado.");
      await load();
    }
  }

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Pipeline">
        <div className="space-y-6">
          <Panel
            title="Etapas"
            description="O pipeline é dinâmico e compartilhado por todos os atletas."
          >
            <form onSubmit={addStage} className="flex gap-3 border-b p-4">
              <input
                className={inputClass}
                placeholder="Nova etapa"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
              />
              <button className={buttonClass}>
                <Plus className="mr-2 h-4 w-4" /> Adicionar
              </button>
            </form>
            <div className="divide-y">
              {stages.map((stage) => (
                <div key={stage.id} className="flex items-start justify-between gap-5 p-4">
                  <div>
                    <h3 className="font-medium">{stage.name_pt ?? stage.name_en}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {items
                        .filter((item) => item.stage_id === stage.id)
                        .map((item) => item.label_pt ?? item.label_en)
                        .join(" · ") || "Sem itens"}
                    </p>
                  </div>
                  <button className="text-sm text-primary" onClick={() => addChecklist(stage.id)}>
                    + Checklist
                  </button>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Acompanhamento por atleta">
            {athletes.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-4">Atleta</th>
                      {stages.map((stage) => (
                        <th className="p-4" key={stage.id}>
                          {stage.name_pt ?? stage.name_en}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {athletes.map((athlete) => (
                      <tr className="border-b last:border-0" key={athlete.id}>
                        <td className="p-4 font-medium">{athlete.full_name}</td>
                        {stages.map((stage) => {
                          const current =
                            progress.find(
                              (item) =>
                                item.athlete_id === athlete.id && item.stage_id === stage.id,
                            )?.status ?? "not_started";
                          return (
                            <td className="p-4" key={stage.id}>
                              <select
                                className={inputClass}
                                value={current}
                                onChange={(e) =>
                                  updateProgress(
                                    athlete.id,
                                    stage.id,
                                    e.target.value as StageStatus,
                                  )
                                }
                              >
                                <option value="not_started">Não iniciado</option>
                                <option value="in_progress">Em andamento</option>
                                <option value="blocked">Bloqueado</option>
                                <option value="completed">Concluído</option>
                              </select>
                              <div className="mt-2">
                                <StatusBadge value={current} />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Nenhum atleta cadastrado.</EmptyState>
            )}
          </Panel>
        </div>
      </AppShell>
    </ProtectedPage>
  );
}

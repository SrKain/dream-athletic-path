import { createFileRoute } from "@tanstack/react-router";
import { GripVertical, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { EmptyState, Panel, buttonClass, inputClass } from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
import type {
  Athlete,
  AthleteStageProgress,
  ChecklistItem,
  PipelineStage,
  StageStatus,
} from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/pipeline")({ component: PipelinePage });

function PipelinePage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [progress, setProgress] = useState<AthleteStageProgress[]>([]);
  const [stageName, setStageName] = useState("");
  const [draggedAthleteId, setDraggedAthleteId] = useState<string | null>(null);

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

  async function moveAthleteToStage(athleteId: string, stageId: string) {
    const existing = progress.find((item) => item.athlete_id === athleteId && item.stage_id === stageId);
    const payload = {
      athlete_id: athleteId,
      stage_id: stageId,
      status: (existing?.status ?? "in_progress") as StageStatus,
      started_at: existing?.started_at ?? new Date().toISOString(),
      completed_at: existing?.completed_at ?? null,
    };
    const [progressError, athleteError] = await Promise.all([
      supabase.from("athlete_stage_progress").upsert(payload, { onConflict: "athlete_id,stage_id" }),
      supabase.from("athletes").update({ current_stage_id: stageId }).eq("id", athleteId),
    ]);
    if (progressError.error) toast.error(progressError.error.message);
    else if (athleteError.error) toast.error(athleteError.error.message);
    else {
      toast.success("Atleta movido no pipeline.");
      await load();
    }
  }

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Pipeline">
        <div className="space-y-6">
          <Panel
            title="Etapas"
            description="Adicione etapas e mantenha o acompanhamento visual por colunas."
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

          <Panel title="Acompanhamento em Kanban">
            {stages.length ? (
              <div className="grid gap-4 p-5 xl:grid-cols-4">
                {stages.map((stage) => {
                  const stageAthletes = athletes.filter((athlete) => athlete.current_stage_id === stage.id);

                  return (
                    <div
                      key={stage.id}
                      className="min-h-80 rounded-2xl border bg-muted/20 p-3"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (draggedAthleteId) {
                          void moveAthleteToStage(draggedAthleteId, stage.id);
                          setDraggedAthleteId(null);
                        }
                      }}
                    >
                      <div className="mb-3 border-b pb-3">
                        <h3 className="font-semibold">{stage.name_pt ?? stage.name_en}</h3>
                        <p className="text-xs text-muted-foreground">Arraste atletas para esta coluna</p>
                      </div>
                      <div className="space-y-2">
                        {stageAthletes.length ? (
                          stageAthletes.map((athlete) => {
                            const current = progress.find(
                              (item) => item.athlete_id === athlete.id && item.stage_id === stage.id,
                            )?.status ?? "not_started";
                            return (
                              <div
                                key={athlete.id}
                                draggable
                                onDragStart={() => setDraggedAthleteId(athlete.id)}
                                className="cursor-grab rounded-xl border bg-background p-3 shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium">{athlete.full_name}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{current}</p>
                                  </div>
                                  <GripVertical className="mt-1 h-4 w-4 text-muted-foreground" />
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                            Nenhum atleta aqui.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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

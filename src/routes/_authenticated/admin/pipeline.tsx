import { Link, createFileRoute } from "@tanstack/react-router";
import { GripVertical, Plus, UserPlus } from "lucide-react";
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
import { buildAthleteSlug } from "@/lib/athlete-slugs";
import { buildStageProgressPayload, getFirstActiveStage } from "@/lib/pipeline.helpers";
import { supabase } from "@/lib/supabase/client";
import type { Athlete, AthleteStageProgress, PipelineStage, StageStatus } from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/pipeline")({ component: PipelinePage });

function PipelinePage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [progress, setProgress] = useState<AthleteStageProgress[]>([]);
  const [draggedAthleteId, setDraggedAthleteId] = useState<string | null>(null);
  const [openQuickAdd, setOpenQuickAdd] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function load() {
    const [s, a, p] = await Promise.all([
      supabase.from("pipeline_stages").select("*").eq("is_active", true).order("order_index"),
      supabase.from("athletes").select("*").is("deleted_at", null).order("full_name"),
      supabase.from("athlete_stage_progress").select("*"),
    ]);
    if (s.error) toast.error(s.error.message);
    if (a.error) toast.error(a.error.message);
    if (p.error) toast.error(p.error.message);
    setStages((s.data ?? []) as PipelineStage[]);
    setAthletes((a.data ?? []) as Athlete[]);
    setProgress((p.data ?? []) as AthleteStageProgress[]);
  }
  useEffect(() => void load(), []);

  const firstStage = useMemo(() => getFirstActiveStage(stages), [stages]);
  const athletesWithoutStage = athletes.filter((athlete) => !athlete.current_stage_id);

  async function createAthlete(event: React.FormEvent) {
    event.preventDefault();
    const { data: agency } = await supabase.from("agencies").select("id").limit(1).single();
    if (!agency) return toast.error("Create the agency before adding the first athlete.");

    const existingSlugs = athletes.map((item) => item.slug);
    const { data, error } = await supabase
      .from("athletes")
      .insert({
        agency_id: agency.id,
        current_stage_id: firstStage?.id ?? null,
        email: email || null,
        full_name: name,
        slug: buildAthleteSlug(name, null, existingSlugs),
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);

    if (firstStage && data?.id) {
      const { error: progressError } = await supabase
        .from("athlete_stage_progress")
        .upsert(buildStageProgressPayload({ athleteId: data.id, stageId: firstStage.id }), {
          onConflict: "athlete_id,stage_id",
        });
      if (progressError) return toast.error(progressError.message);
    }

    toast.success("Athlete created in the first stage.");
    setName("");
    setEmail("");
    setOpenQuickAdd(false);
    await load();
  }

  async function moveAthleteToStage(athleteId: string, stageId: string) {
    const existing = progress.find(
      (item) => item.athlete_id === athleteId && item.stage_id === stageId,
    );
    const [progressResult, athleteResult] = await Promise.all([
      supabase
        .from("athlete_stage_progress")
        .upsert(buildStageProgressPayload({ athleteId, stageId, existing }), {
          onConflict: "athlete_id,stage_id",
        }),
      supabase.from("athletes").update({ current_stage_id: stageId }).eq("id", athleteId),
    ]);
    if (progressResult.error) toast.error(progressResult.error.message);
    else if (athleteResult.error) toast.error(athleteResult.error.message);
    else {
      toast.success("Athlete moved in the pipeline.");
      await load();
    }
  }

  async function updateProgress(athleteId: string, stageId: string, status: StageStatus) {
    const existing = progress.find(
      (item) => item.athlete_id === athleteId && item.stage_id === stageId,
    );
    const { error } = await supabase
      .from("athlete_stage_progress")
      .upsert(buildStageProgressPayload({ athleteId, stageId, existing, status }), {
        onConflict: "athlete_id,stage_id",
      });
    if (error) toast.error(error.message);
    else {
      toast.success("Pipeline updated.");
      await load();
    }
  }

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Pipeline">
        <Panel
          title="Kanban tracking"
          description="Drag athletes between stages and track the operational journey."
          action={
            <button className={buttonClass} onClick={() => setOpenQuickAdd((value) => !value)}>
              <UserPlus className="mr-2 h-4 w-4" /> Add athlete
            </button>
          }
        >
          {openQuickAdd && (
            <form
              onSubmit={createAthlete}
              className="grid gap-4 border-b border-white/40 bg-background/30 p-5 md:grid-cols-[1fr_1fr_auto]"
            >
              <input
                className={inputClass}
                placeholder="Full name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="Athlete email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className={buttonClass}>
                <Plus className="mr-2 h-4 w-4" /> Create
              </button>
            </form>
          )}

          {stages.length ? (
            <div className="grid gap-4 p-5 xl:grid-cols-4">
              {stages.map((stage) => {
                const stageAthletes = athletes.filter(
                  (athlete) => athlete.current_stage_id === stage.id,
                );

                return (
                  <div
                    key={stage.id}
                    className="min-h-80 rounded-md border border-white/45 bg-background/35 p-3 backdrop-blur"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedAthleteId) {
                        void moveAthleteToStage(draggedAthleteId, stage.id);
                        setDraggedAthleteId(null);
                      }
                    }}
                  >
                    <div className="mb-3 border-b border-border/70 pb-3">
                      <h3 className="font-display text-lg font-semibold">
                        {stage.name_pt ?? stage.name_en}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {stageAthletes.length} athletes
                      </p>
                    </div>
                    <div className="space-y-2">
                      {stageAthletes.length ? (
                        stageAthletes.map((athlete) => {
                          const current =
                            progress.find(
                              (item) =>
                                item.athlete_id === athlete.id && item.stage_id === stage.id,
                            )?.status ?? "not_started";
                          return (
                            <div
                              key={athlete.id}
                              draggable
                              onDragStart={() => setDraggedAthleteId(athlete.id)}
                              className="cursor-grab rounded-md border border-white/45 bg-background/70 p-3 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <Link
                                    to="/admin/athletes/$id"
                                    params={{ id: athlete.id }}
                                    className="font-medium hover:text-primary"
                                  >
                                    {athlete.full_name}
                                  </Link>
                                  <p className="mt-1 text-xs text-muted-foreground">{current}</p>
                                </div>
                                <GripVertical className="mt-1 h-4 w-4 text-muted-foreground" />
                              </div>
                              <select
                                className={`${inputClass} mt-3 h-9`}
                                value={current}
                                onChange={(event) =>
                                  void updateProgress(
                                    athlete.id,
                                    stage.id,
                                    event.target.value as StageStatus,
                                  )
                                }
                              >
                                <option value="not_started">Not started</option>
                                <option value="in_progress">In progress</option>
                                <option value="blocked">Blocked</option>
                                <option value="completed">Completed</option>
                              </select>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                          No athletes here.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {athletesWithoutStage.length > 0 && (
                <div className="min-h-80 rounded-md border border-dashed border-primary/50 bg-primary/5 p-3">
                  <div className="mb-3 border-b border-primary/20 pb-3">
                    <h3 className="font-display text-lg font-semibold">No stage</h3>
                    <p className="text-xs text-muted-foreground">Send to the first stage.</p>
                  </div>
                  <div className="space-y-2">
                    {athletesWithoutStage.map((athlete) => (
                      <div key={athlete.id} className="rounded-md border bg-background/70 p-3">
                        <p className="font-medium">{athlete.full_name}</p>
                        {firstStage && (
                          <button
                            className={`${secondaryButtonClass} mt-3 w-full`}
                            onClick={() => void moveAthleteToStage(athlete.id, firstStage.id)}
                          >
                            Move to {firstStage.name_pt ?? firstStage.name_en}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState>Set up pipeline stages before adding athletes.</EmptyState>
          )}
        </Panel>
      </AppShell>
    </ProtectedPage>
  );
}

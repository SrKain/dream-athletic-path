import { Check, CircleDot, Lock, Minus, RotateCcw, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { buildStageProgressPayload } from "@/lib/pipeline.helpers";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  AthleteChecklistItem,
  AthleteStageProgress,
  ChecklistItem,
  PipelineStage,
  StageStatus,
} from "@/types/db";

type PhaseState = "completed" | "current" | "blocked" | "upcoming";

const statusLabel: Record<StageStatus, string> = {
  not_started: "Não iniciada",
  in_progress: "Em andamento",
  blocked: "Bloqueada",
  completed: "Concluída",
};

export function StageTimeline({
  athleteId,
  stages,
  progress,
  checklistDefinitions = [],
  athleteChecklist = [],
  currentStageId = null,
  editable = false,
  onChanged,
}: {
  athleteId: string;
  stages: PipelineStage[];
  progress: AthleteStageProgress[];
  checklistDefinitions?: ChecklistItem[];
  athleteChecklist?: AthleteChecklistItem[];
  currentStageId?: string | null;
  editable?: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...stages].sort((a, b) => a.order_index - b.order_index),
    [stages],
  );

  const phases = ordered.map((stage, index) => {
    const record = progress.find((item) => item.stage_id === stage.id) ?? null;
    const status: StageStatus = record?.status ?? "not_started";
    const isCurrent = currentStageId ? stage.id === currentStageId : status === "in_progress";
    const state: PhaseState =
      status === "completed"
        ? "completed"
        : status === "blocked"
          ? "blocked"
          : isCurrent
            ? "current"
            : "upcoming";
    return { stage, record, status, state, index };
  });

  const completed = phases.filter((phase) => phase.state === "completed").length;
  const total = phases.length || 1;
  const percent = Math.round((completed / total) * 100);
  const activePhase = phases.find((phase) => phase.state === "current") ?? null;

  async function persist(
    stageId: string,
    patch: { status?: StageStatus; due_date?: string | null; notes?: string | null },
  ) {
    setSaving(stageId);
    const existing = progress.find((item) => item.stage_id === stageId) ?? null;
    const status = patch.status ?? existing?.status ?? "not_started";
    const payload = {
      ...buildStageProgressPayload({ athleteId, stageId, existing, status }),
      due_date: patch.due_date !== undefined ? patch.due_date : (existing?.due_date ?? null),
      notes: patch.notes !== undefined ? patch.notes : (existing?.notes ?? null),
    };
    const upserted = await supabase
      .from("athlete_stage_progress")
      .upsert(payload, { onConflict: "athlete_id,stage_id" });
    if (upserted.error) {
      setSaving(null);
      return toast.error(upserted.error.message);
    }
    if (patch.status === "in_progress" || patch.status === "blocked") {
      const moved = await supabase
        .from("athletes")
        .update({ current_stage_id: stageId })
        .eq("id", athleteId);
      if (moved.error) {
        setSaving(null);
        return toast.error(moved.error.message);
      }
    }
    setSaving(null);
    toast.success("Fase atualizada.");
    await onChanged?.();
  }

  if (!phases.length) {
    return (
      <div className="glass-panel rounded-2xl p-10 text-center text-sm text-muted-foreground">
        Nenhuma fase configurada no pipeline.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="glass-panel overflow-hidden rounded-2xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 p-6 sm:flex sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow text-primary">Jornada do atleta</p>
            <h2 className="mt-2 truncate font-display text-2xl font-semibold sm:text-3xl">
              {activePhase
                ? (activePhase.stage.name_pt ?? activePhase.stage.name_en)
                : completed === phases.length
                  ? "Jornada concluída"
                  : "Jornada não iniciada"}
            </h2>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-4xl leading-none font-semibold tabular-nums">
              {completed}
              <span className="text-xl text-muted-foreground">/{phases.length}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">fases concluídas</p>
          </div>
        </div>
        <div className="px-6 pb-6">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">{percent}% completo</p>
        </div>
      </header>

      <ol className="relative space-y-4 pl-10 sm:pl-14">
        <span
          aria-hidden
          className="absolute top-4 bottom-4 left-[19px] w-px bg-border sm:left-[27px]"
        />
        <span
          aria-hidden
          className="absolute top-4 left-[19px] w-px bg-primary transition-[height] duration-700 ease-out motion-reduce:transition-none sm:left-[27px]"
          style={{ height: `calc((100% - 2rem) * ${completed / phases.length})` }}
        />
        {phases.map((phase) => {
          const items = checklistDefinitions.filter((item) => item.stage_id === phase.stage.id);
          return (
            <li
              key={phase.stage.id}
              className="relative animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none"
              style={{ animationDelay: `${phase.index * 70}ms`, animationFillMode: "backwards" }}
            >
              <span
                className={cn(
                  "absolute top-5 -left-10 grid h-10 w-10 place-items-center rounded-full border text-xs font-semibold sm:-left-14",
                  phase.state === "completed" &&
                    "border-primary bg-primary text-primary-foreground",
                  phase.state === "current" &&
                    "border-primary bg-background text-primary ring-4 ring-primary/15",
                  phase.state === "blocked" &&
                    "border-destructive/50 bg-background text-destructive",
                  phase.state === "upcoming" && "border-border bg-background text-muted-foreground",
                )}
              >
                {phase.state === "completed" ? (
                  <Check className="h-4 w-4" />
                ) : phase.state === "blocked" ? (
                  <Lock className="h-4 w-4" />
                ) : phase.state === "current" ? (
                  <CircleDot className="h-4 w-4" />
                ) : (
                  String(phase.index + 1).padStart(2, "0")
                )}
              </span>

              <article
                className={cn(
                  "glass-panel rounded-2xl p-5 transition-transform duration-300 motion-reduce:transition-none",
                  phase.state === "current" && "border-primary/60 shadow-lg -translate-y-0.5",
                  phase.state === "upcoming" && "opacity-75",
                  phase.state === "blocked" && "border-destructive/40",
                )}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow text-muted-foreground">
                      Fase {String(phase.index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-1 font-display text-xl font-semibold">
                      {phase.stage.name_pt ?? phase.stage.name_en}
                    </h3>
                    {(phase.stage.description_pt ?? phase.stage.description_en) && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {phase.stage.description_pt ?? phase.stage.description_en}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
                      phase.state === "completed" && "bg-primary/15 text-primary",
                      phase.state === "current" && "bg-primary text-primary-foreground",
                      phase.state === "blocked" && "bg-destructive/15 text-destructive",
                      phase.state === "upcoming" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {phase.state === "current" && phase.status !== "in_progress"
                      ? "Fase atual"
                      : statusLabel[phase.status]}
                  </span>
                </div>

                {phase.record?.due_date && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Prazo: {new Date(phase.record.due_date).toLocaleDateString("pt-BR")}
                  </p>
                )}

                {items.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t pt-4 text-sm">
                    {items.map((item) => {
                      const done =
                        athleteChecklist.find((entry) => entry.checklist_item_id === item.id)
                          ?.status === "approved";
                      return (
                        <li key={item.id} className="flex items-center gap-2">
                          {done ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className={cn("min-w-0 truncate", done && "text-muted-foreground")}>
                            {item.label_pt ?? item.label_en}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {!phase.record?.notes || editable ? null : (
                  <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                    {phase.record.notes}
                  </p>
                )}

                {editable && (
                  <div className="mt-5 space-y-3 border-t pt-4">
                    <div className="flex flex-wrap gap-2">
                      <PhaseAction
                        label="Em andamento"
                        icon={<CircleDot className="h-3.5 w-3.5" />}
                        active={phase.status === "in_progress"}
                        disabled={saving === phase.stage.id}
                        onClick={() => void persist(phase.stage.id, { status: "in_progress" })}
                      />
                      <PhaseAction
                        label="Concluir"
                        icon={<Check className="h-3.5 w-3.5" />}
                        active={phase.status === "completed"}
                        disabled={saving === phase.stage.id}
                        onClick={() => void persist(phase.stage.id, { status: "completed" })}
                      />
                      <PhaseAction
                        label="Bloquear"
                        icon={<TriangleAlert className="h-3.5 w-3.5" />}
                        active={phase.status === "blocked"}
                        disabled={saving === phase.stage.id}
                        onClick={() => void persist(phase.stage.id, { status: "blocked" })}
                      />
                      <PhaseAction
                        label="Reiniciar"
                        icon={<RotateCcw className="h-3.5 w-3.5" />}
                        active={phase.status === "not_started"}
                        disabled={saving === phase.stage.id}
                        onClick={() => void persist(phase.stage.id, { status: "not_started" })}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                      <label className="block text-xs font-medium text-muted-foreground">
                        Prazo
                        <input
                          type="date"
                          className="mt-1 h-9 w-full rounded-md border border-white/45 bg-background/55 px-2 text-sm outline-none focus:border-primary"
                          defaultValue={phase.record?.due_date ?? ""}
                          onBlur={(event) =>
                            void persist(phase.stage.id, {
                              due_date: event.target.value || null,
                            })
                          }
                        />
                      </label>
                      <label className="block text-xs font-medium text-muted-foreground">
                        Notas
                        <input
                          className="mt-1 h-9 w-full rounded-md border border-white/45 bg-background/55 px-2 text-sm outline-none focus:border-primary"
                          placeholder="Observações da fase"
                          defaultValue={phase.record?.notes ?? ""}
                          onBlur={(event) =>
                            void persist(phase.stage.id, { notes: event.target.value || null })
                          }
                        />
                      </label>
                    </div>
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PhaseAction({
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-50",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background/60 hover:border-primary hover:text-primary",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

import type { AthleteStageProgress, PipelineStage, StageStatus } from "@/types/db";

export function sortStages(stages: PipelineStage[]) {
  return [...stages].sort((a, b) => a.order_index - b.order_index);
}

export function getFirstActiveStage(stages: PipelineStage[]) {
  return sortStages(stages).find((stage) => stage.is_active) ?? null;
}

export function buildStageProgressPayload({
  athleteId,
  stageId,
  existing,
  status = "in_progress",
  now = new Date().toISOString(),
}: {
  athleteId: string;
  stageId: string;
  existing?: AthleteStageProgress | null;
  status?: StageStatus;
  now?: string;
}) {
  return {
    athlete_id: athleteId,
    stage_id: stageId,
    status,
    started_at:
      status === "in_progress" ? (existing?.started_at ?? now) : (existing?.started_at ?? null),
    completed_at: status === "completed" ? now : null,
  };
}

import { createFileRoute } from "@tanstack/react-router";
import { AppShell, ProtectedPage } from "@/components/app-shell";
import { StageTimeline } from "@/components/stage-timeline";
import { StageCelebrationDialog } from "@/components/stage-celebration-dialog";
import { usePortalData } from "@/hooks/use-portal-data";
import { useStageAnnouncement } from "@/hooks/use-stage-announcement";

export const Route = createFileRoute("/_authenticated/portal/pipeline")({
  component: PortalPipeline,
});
function PortalPipeline() {
  const { data } = usePortalData();
  const { announcement, dismiss } = useStageAnnouncement({
    athlete: data.athlete,
    stages: data.stages,
    progress: data.progress,
  });
  return (
    <ProtectedPage role="athlete">
      <AppShell role="athlete" title="Meu pipeline">
        {announcement && (
          <StageCelebrationDialog
            open
            title={announcement.stage.name_pt ?? announcement.stage.name_en}
            message={announcement.message}
            images={announcement.images}
            onClose={() => void dismiss()}
          />
        )}
        <div className="mx-auto max-w-3xl">
          <StageTimeline
            athleteId={data.athlete?.id ?? ""}
            stages={data.stages}
            progress={data.progress}
            checklistDefinitions={data.checklistDefinitions}
            athleteChecklist={data.checklist}
            currentStageId={data.athlete?.current_stage_id ?? null}
          />
        </div>
      </AppShell>
    </ProtectedPage>
  );
}

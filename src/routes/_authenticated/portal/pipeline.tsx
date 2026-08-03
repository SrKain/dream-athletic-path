import { createFileRoute } from "@tanstack/react-router";
import { AppShell, ProtectedPage } from "@/components/app-shell";
import { StageTimeline } from "@/components/stage-timeline";
import { usePortalData } from "@/hooks/use-portal-data";

export const Route = createFileRoute("/_authenticated/portal/pipeline")({
  component: PortalPipeline,
});
function PortalPipeline() {
  const { data } = usePortalData();
  return (
    <ProtectedPage role="athlete">
      <AppShell role="athlete" title="Meu pipeline">
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

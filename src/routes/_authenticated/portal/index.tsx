import { createFileRoute } from "@tanstack/react-router";
import { Bell, CheckCircle2, Clock, FileText } from "lucide-react";
import { AppShell, ProtectedPage } from "@/components/app-shell";
import { Panel, StatusBadge } from "@/components/admin-ui";
import { usePortalData } from "@/hooks/use-portal-data";
import { ConfettiCelebration } from "@/components/confetti-celebration";
import { StageCelebrationDialog } from "@/components/stage-celebration-dialog";
import { useStageAnnouncement } from "@/hooks/use-stage-announcement";

export const Route = createFileRoute("/_authenticated/portal/")({ component: PortalDashboard });
function PortalDashboard() {
  const { data } = usePortalData();
  const { announcement, dismiss } = useStageAnnouncement({
    athlete: data.athlete,
    stages: data.stages,
    progress: data.progress,
  });
  const current =
    data.progress.find((item) => item.status === "in_progress") ??
    data.progress.find((item) => item.status !== "completed");
  const stage = data.stages.find((item) => item.id === current?.stage_id);
  const pending = data.checklist.filter((item) => !["approved"].includes(item.status)).length;
  const unread = data.notifications.filter((item) => !item.read_at).length;
  return (
    <ProtectedPage role="athlete">
      <ConfettiCelebration />
      {announcement && (
        <StageCelebrationDialog
          open
          title={announcement.stage.name_pt ?? announcement.stage.name_en}
          message={announcement.message}
          images={announcement.images}
          onClose={() => void dismiss()}
        />
      )}
      <AppShell
        role="athlete"
        title={`Hello${data.athlete ? `, ${data.athlete.full_name.split(" ")[0]}` : ""}`}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Metric
            icon={Clock}
            label="Current stage"
            value={stage?.name_pt ?? stage?.name_en ?? "Waiting"}
          />
          <Metric icon={FileText} label="Pending items" value={pending} />
          <Metric icon={Bell} label="Notifications" value={unread} />
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Panel title="Your progress">
            <div className="p-5">
              <p className="text-sm text-muted-foreground">Current stage</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">
                {stage?.name_pt ?? stage?.name_en ?? "In preparation"}
              </h2>
              {current && (
                <div className="mt-4">
                  <StatusBadge value={current.status} />
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Upcoming items">
            <div className="divide-y">
              {data.checklist.slice(0, 4).map((item) => {
                const definition = data.checklistDefinitions.find(
                  (entry) => entry.id === item.checklist_item_id,
                );
                return (
                  <div className="flex items-center justify-between p-4" key={item.id}>
                    <span className="text-sm">{definition?.label_pt ?? definition?.label_en}</span>
                    {item.status === "approved" ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <StatusBadge value={item.status} />
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </AppShell>
    </ProtectedPage>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border bg-card p-5">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-5 text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}

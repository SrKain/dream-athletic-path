import { createFileRoute } from "@tanstack/react-router";
import { Bell, CheckCircle2, Clock, FileText } from "lucide-react";
import { AppShell, ProtectedPage } from "@/components/app-shell";
import { Panel, StatusBadge } from "@/components/admin-ui";
import { usePortalData } from "@/hooks/use-portal-data";

export const Route = createFileRoute("/_authenticated/portal/")({ component: PortalDashboard });
function PortalDashboard() {
  const { data } = usePortalData();
  const current =
    data.progress.find((item) => item.status === "in_progress") ??
    data.progress.find((item) => item.status !== "completed");
  const stage = data.stages.find((item) => item.id === current?.stage_id);
  const pending = data.checklist.filter((item) => !["approved"].includes(item.status)).length;
  const unread = data.notifications.filter((item) => !item.read_at).length;
  return (
    <ProtectedPage role="athlete">
      <AppShell
        role="athlete"
        title={`Olá${data.athlete ? `, ${data.athlete.full_name.split(" ")[0]}` : ""}`}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Metric
            icon={Clock}
            label="Etapa atual"
            value={stage?.name_pt ?? stage?.name_en ?? "Aguardando"}
          />
          <Metric icon={FileText} label="Pendências" value={pending} />
          <Metric icon={Bell} label="Notificações" value={unread} />
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Panel title="Seu progresso">
            <div className="p-5">
              <p className="text-sm text-muted-foreground">Etapa atual</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">
                {stage?.name_pt ?? stage?.name_en ?? "Em preparação"}
              </h2>
              {current && (
                <div className="mt-4">
                  <StatusBadge value={current.status} />
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Próximas pendências">
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

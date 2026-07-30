import { createFileRoute } from "@tanstack/react-router";
import { Check, Circle } from "lucide-react";
import { AppShell, ProtectedPage } from "@/components/app-shell";
import { StatusBadge } from "@/components/admin-ui";
import { usePortalData } from "@/hooks/use-portal-data";

export const Route = createFileRoute("/_authenticated/portal/pipeline")({ component: PortalPipeline });
function PortalPipeline() {
  const { data } = usePortalData();
  return (
    <ProtectedPage role="athlete">
      <AppShell role="athlete" title="Meu pipeline">
        <div className="mx-auto max-w-3xl rounded-md border bg-card">
          {data.stages.map((stage, index) => {
            const progress = data.progress.find((item) => item.stage_id === stage.id);
            const status = progress?.status ?? "not_started";
            return (
              <article key={stage.id} className="flex gap-5 border-b p-6 last:border-0">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${status === "completed" ? "border-primary bg-primary text-primary-foreground" : ""}`}
                >
                  {status === "completed" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                </div>
                <div className="flex-1">
                  <span className="font-display text-xs text-primary">0{index + 1}</span>
                  <h2 className="mt-1 font-display text-xl font-semibold">
                    {stage.name_pt ?? stage.name_en}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {stage.description_pt ?? stage.description_en}
                  </p>
                  <div className="mt-3">
                    <StatusBadge value={status} />
                  </div>
                  {progress?.due_date && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Prazo: {new Date(progress.due_date).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </AppShell>
    </ProtectedPage>
  );
}

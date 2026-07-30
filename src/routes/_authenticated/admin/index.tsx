import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, FileClock, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/")({ component: AdminDashboard });

function AdminDashboard() {
  const [metrics, setMetrics] = useState({ athletes: 0, published: 0, documents: 0, blocked: 0 });
  useEffect(() => {
    void Promise.all([
      supabase.from("athletes").select("*", { count: "exact", head: true }).is("deleted_at", null),
      supabase
        .from("athletes")
        .select("*", { count: "exact", head: true })
        .eq("is_public", true)
        .is("deleted_at", null),
      supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .in("status", ["submitted", "resubmit"])
        .is("deleted_at", null),
      supabase
        .from("athlete_stage_progress")
        .select("*", { count: "exact", head: true })
        .eq("status", "blocked"),
    ]).then(([athletes, published, documents, blocked]) =>
      setMetrics({
        athletes: athletes.count ?? 0,
        published: published.count ?? 0,
        documents: documents.count ?? 0,
        blocked: blocked.count ?? 0,
      }),
    );
  }, []);
  const cards = [
    ["Atletas ativos", metrics.athletes, Users],
    ["Perfis publicados", metrics.published, CheckCircle2],
    ["Documentos pendentes", metrics.documents, FileClock],
    ["Etapas bloqueadas", metrics.blocked, AlertTriangle],
  ] as const;
  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Visão geral">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value, Icon]) => (
            <div key={label} className="rounded-md border bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-4 font-display text-4xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </AppShell>
    </ProtectedPage>
  );
}

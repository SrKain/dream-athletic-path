import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, ProtectedPage } from "@/components/app-shell";
import { EmptyState, Panel } from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
import type { AppNotification } from "@/types/db";

export const Route = createFileRoute("/admin/notifications")({ component: AdminNotifications });
function AdminNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  useEffect(() => {
    void supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setItems((data ?? []) as AppNotification[]));
  }, []);
  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Notificações">
        <Panel title="Atividade recente">
          {items.length ? (
            <div className="divide-y">
              {items.map((item) => (
                <article className="p-5" key={item.id}>
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                  <time className="mt-2 block text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString("pt-BR")}
                  </time>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhuma notificação.</EmptyState>
          )}
        </Panel>
      </AppShell>
    </ProtectedPage>
  );
}

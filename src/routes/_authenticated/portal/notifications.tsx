import { createFileRoute } from "@tanstack/react-router";
import { AppShell, ProtectedPage } from "@/components/app-shell";
import { EmptyState, Panel } from "@/components/admin-ui";
import { usePortalData } from "@/hooks/use-portal-data";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/_authenticated/portal/notifications")({
  component: PortalNotifications,
});
function PortalNotifications() {
  const { data, reload } = usePortalData();
  async function read(id: string) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    await reload();
  }
  return (
    <ProtectedPage role="athlete">
      <AppShell role="athlete" title="Notifications">
        <Panel title="Updates">
          {data.notifications.length ? (
            <div className="divide-y">
              {data.notifications.map((item) => (
                <button
                  onClick={() => read(item.id)}
                  key={item.id}
                  className={`block w-full p-5 text-left ${item.read_at ? "opacity-60" : "bg-primary/[0.03]"}`}
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                  <time className="mt-2 block text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString("pt-BR")}
                  </time>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState>No notifications.</EmptyState>
          )}
        </Panel>
      </AppShell>
    </ProtectedPage>
  );
}

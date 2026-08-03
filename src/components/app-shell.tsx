import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  ClipboardList,
  FileText,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Send,
  Users,
} from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/providers/auth-provider";
import type { AppRole } from "@/types/db";

const adminLinks = [
  { to: "/admin", label: "Visão geral", icon: LayoutDashboard },
  { to: "/admin/athletes", label: "Atletas", icon: Users },
  { to: "/admin/pipeline", label: "Pipeline", icon: ClipboardList },
  { to: "/admin/documents", label: "Documentos", icon: FileText },
  { to: "/admin/proposals", label: "Propostas", icon: Send },
  { to: "/admin/notifications", label: "Notificações", icon: Bell },
  { to: "/admin/settings", label: "Configurações", icon: Settings },
] as const;

const athleteLinks = [
  { to: "/portal", label: "Visão geral", icon: LayoutDashboard },
  { to: "/portal/pipeline", label: "Pipeline", icon: ClipboardList },
  { to: "/portal/documents", label: "Documentos", icon: FileText },
  { to: "/portal/media", label: "Mídia", icon: Images },
  { to: "/portal/notifications", label: "Notificações", icon: Bell },
] as const;

export function ProtectedPage({ role, children }: { role: AppRole; children: React.ReactNode }) {
  void role;
  const { loading, user } = useAuth();
  if (loading || !user) return <PageLoading />;
  return <>{children}</>;
}

export function AppShell({
  role,
  title,
  children,
}: {
  role: "agency_admin" | "athlete";
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const links = role === "agency_admin" ? adminLinks : athleteLinks;

  async function logout() {
    await signOut();
    await navigate({ to: "/login", search: { redirect: undefined } });
  }

  return (
    <div className="min-h-screen bg-muted/35">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-surface text-surface-foreground transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-20 items-center border-b border-white/10 px-6">
          <Link to="/" className="font-display text-xl font-semibold tracking-tight">
            Go Team Go
          </Link>
        </div>
        <nav className="space-y-1 p-4">
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/admin" || to === "/portal" }}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-white/65 transition hover:bg-white/10 hover:text-white"
              activeProps={{ className: "bg-white/10 !text-white" }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-white/10 p-4">
          <p className="truncate px-3 text-xs text-white/45">{user?.email}</p>
          <button
            onClick={logout}
            className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/65 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>
      {open && (
        <button
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-border/70 bg-background/80 px-4 backdrop-blur-xl md:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

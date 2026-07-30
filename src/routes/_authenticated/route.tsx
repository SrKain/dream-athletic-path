import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/lib/supabase/client";

/**
 * Portão único das áreas restritas.
 * `ssr: false` porque a sessão do Supabase vive no localStorage — renderizar
 * o HTML da área restrita no servidor não teria sessão e vazaria shell logado.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login", search: { redirect: location.pathname } });
    }
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();
    return { user: data.user, role: (roleRow?.role ?? null) as string | null };
  },
  component: () => <Outlet />,
});

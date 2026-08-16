import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/lib/supabase/client";

/**
 * Single gateway for restricted areas.
 * `ssr: false` because the Supabase session lives in localStorage — rendering
 * the restricted area's HTML on the server would have no session and would leak a logged-out shell.
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

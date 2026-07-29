import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { getUserServerClient } from "./clients.server";
import type { AppRole } from "@/types/db";

/** Exige um usuário autenticado. Injeta `supabase` (RLS como o usuário), `userId` e `role`. */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const header = getRequestHeader("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const client = getUserServerClient(token);
  if (!client) throw new Response("Supabase não configurado", { status: 503 });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Response("Unauthorized", { status: 401 });

  const { data: roleRow } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return next({
    context: {
      supabase: client,
      userId: data.user.id,
      email: data.user.email ?? "",
      role: (roleRow?.role ?? null) as AppRole | null,
    },
  });
});

/** Exige papel de administrador da agência. */
export const requireAgency = createMiddleware({ type: "function" })
  .middleware([requireAuth])
  .server(async ({ next, context }) => {
    if (context.role !== "agency_admin") throw new Response("Forbidden", { status: 403 });
    return next({ context });
  });
import { createMiddleware } from "@tanstack/react-start";

import { supabase } from "./client";

/**
 * Anexa o access token do Supabase externo a toda chamada de server function.
 * O servidor revalida o token — o header sozinho não concede nada.
 */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
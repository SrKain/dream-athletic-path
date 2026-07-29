import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, publicSupabaseAnonKey, publicSupabaseUrl } from "./env";

/**
 * Cliente de navegador. Sessão persistida em localStorage.
 * Toda a segurança real vem das políticas RLS no Supabase externo.
 */
function createBrowserClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    // Stub inofensivo: evita quebrar o build/SSR antes das credenciais existirem.
    return createClient("http://localhost:54321", "public-anon-key-placeholder", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient(publicSupabaseUrl, publicSupabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
}

export const supabase = createBrowserClient();
export { isSupabaseConfigured };

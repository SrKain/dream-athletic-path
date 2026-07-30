import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Clientes SERVER-ONLY do Supabase externo.
 * Este arquivo nunca entra no bundle do browser (sufixo `.server.ts`).
 */

function serverUrl() {
  return process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
}

function anonKey() {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    ""
  );
}

export function serverSupabaseConfigured() {
  return Boolean(serverUrl() && anonKey());
}

/** Leitura pública (anon). Respeita RLS. Use para feed e perfis públicos no SSR. */
export function getPublicServerClient(): SupabaseClient | null {
  if (!serverSupabaseConfigured()) return null;
  return createClient(serverUrl(), anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente atuando como o usuário autenticado (bearer token). Respeita RLS. */
export function getUserServerClient(accessToken: string): SupabaseClient | null {
  if (!serverSupabaseConfigured()) return null;
  return createClient(serverUrl(), anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Service role. IGNORA RLS. Somente operações privilegiadas já autorizadas. */
export function getAdminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !serverUrl()) {
    throw new Error("SUPABASE_SECRET_KEY / SUPABASE_URL ausentes. Configure o Supabase externo.");
  }
  return createClient(serverUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

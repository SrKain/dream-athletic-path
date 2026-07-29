/**
 * Configuração do Supabase EXTERNO.
 *
 * Nenhum recurso do Lovable Cloud é utilizado. As variáveis abaixo apontam
 * para o projeto Supabase próprio do cliente e são lidas de `.env`.
 *
 * Browser: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * Servidor: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 */
export const publicSupabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
export const publicSupabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "";

/** Permite que a aplicação renderize mesmo antes das credenciais existirem. */
export const isSupabaseConfigured = Boolean(publicSupabaseUrl && publicSupabaseAnonKey);

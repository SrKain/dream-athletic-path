import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { AppRole } from "@/types/db";

type AuthState = {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  configured: boolean;
  refreshRole: () => Promise<AppRole | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  const loadRole = useCallback(async (nextUser: User | null) => {
    setUser(nextUser);
    if (!nextUser) {
      setRole(null);
      return null;
    }
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", nextUser.id)
      .maybeSingle();
    const nextRole = (data?.role ?? null) as AppRole | null;
    setRole(nextRole);
    return nextRole;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    void supabase.auth.getUser().then(async ({ data }) => {
      await loadRole(data.user);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadRole(session?.user ?? null).finally(() => setLoading(false));
    });
    return () => data.subscription.unsubscribe();
  }, [loadRole]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      role,
      loading,
      configured: isSupabaseConfigured,
      refreshRole: async () => loadRole(user),
      signOut: async () => {
        await supabase.auth.signOut();
        setUser(null);
        setRole(null);
      },
    }),
    [loadRole, loading, role, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return value;
}

import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AuthCard, fieldClass, primaryButtonClass } from "@/components/auth-card";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/auth-provider";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { refreshRole } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("Não foi possível entrar", { description: error.message });
      setLoading(false);
      return;
    }
    const role = await refreshRole();
    await navigate({ to: role === "agency_admin" ? "/admin" : "/portal" });
  }

  return (
    <AuthCard title="Acessar plataforma" subtitle="Área restrita para agência e atletas.">
      <form onSubmit={submit} className="space-y-5">
        <label className="block text-sm font-medium">
          E-mail
          <input className={fieldClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          Senha
          <input className={fieldClass} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className={primaryButtonClass} disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <Link to="/forgot-password" className="mt-5 block text-center text-sm text-primary">
        Esqueci minha senha
      </Link>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Contas de atletas são criadas exclusivamente pela agência.
      </p>
    </AuthCard>
  );
}

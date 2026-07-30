import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthCard, fieldClass, primaryButtonClass } from "@/components/auth-card";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error(error.message);
    else {
      toast.success("Senha atualizada.");
      await navigate({ to: "/login", search: { redirect: undefined } });
    }
  }
  return (
    <AuthCard
      title="Definir nova senha"
      subtitle="Escolha uma senha com pelo menos oito caracteres."
    >
      <form onSubmit={submit} className="space-y-5">
        <label className="block text-sm font-medium">
          Nova senha
          <input
            className={fieldClass}
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className={primaryButtonClass}>Salvar senha</button>
      </form>
    </AuthCard>
  );
}

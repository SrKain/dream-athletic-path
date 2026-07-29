import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthCard, fieldClass, primaryButtonClass } from "@/components/auth-card";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPassword });

function ForgotPassword() {
  const [email, setEmail] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) toast.error(error.message);
    else toast.success("Se a conta existir, o link foi enviado.");
  }
  return (
    <AuthCard title="Recuperar senha" subtitle="Enviaremos um link para redefinir seu acesso.">
      <form onSubmit={submit} className="space-y-5">
        <label className="block text-sm font-medium">
          E-mail
          <input className={fieldClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className={primaryButtonClass}>Enviar link</button>
      </form>
      <Link to="/login" className="mt-5 block text-center text-sm text-primary">Voltar ao login</Link>
    </AuthCard>
  );
}

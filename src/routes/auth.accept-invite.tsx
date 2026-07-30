import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthCard, primaryButtonClass } from "@/components/auth-card";
import { finalizeAthleteInvite } from "@/lib/auth.functions";
import { useAuth } from "@/providers/auth-provider";

export const Route = createFileRoute("/auth/accept-invite")({ component: AcceptInvite });

function AcceptInvite() {
  const navigate = useNavigate();
  const { user, loading, refreshRole } = useAuth();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!loading && !user)
      void navigate({ to: "/login", search: { redirect: "/auth/accept-invite" } });
  }, [loading, navigate, user]);

  async function accept() {
    setWorking(true);
    setError("");
    try {
      await finalizeAthleteInvite();
      await refreshRole();
      await navigate({ to: "/portal" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível aceitar o convite.");
      setWorking(false);
    }
  }

  return (
    <AuthCard
      title="Ativar acesso"
      subtitle="Confirme para vincular sua conta ao perfil de atleta."
    >
      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <button className={primaryButtonClass} onClick={accept} disabled={working || !user}>
        {working ? "Ativando..." : "Ativar minha conta"}
      </button>
    </AuthCard>
  );
}

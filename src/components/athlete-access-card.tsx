import { useState } from "react";
import { toast } from "sonner";

import { Panel, buttonClass, inputClass, secondaryButtonClass } from "@/components/admin-ui";
import { revokeAthleteAccess, setAthleteAccess } from "@/lib/auth.functions";

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";

function generatePassword(length = 14) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => ALPHABET[value % ALPHABET.length]).join("");
}

export function AthleteAccessCard({
  athleteId,
  athleteEmail,
  hasAccess,
  onChanged,
}: {
  athleteId: string;
  athleteEmail: string | null;
  hasAccess: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [email, setEmail] = useState(athleteEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!email.trim()) return toast.error("Informe o e-mail de acesso.");
    if (password.length < 8) return toast.error("A senha precisa ter ao menos 8 caracteres.");
    if (password !== confirmation) return toast.error("As senhas não coincidem.");
    setSaving(true);
    try {
      await setAthleteAccess({ data: { athleteId, email: email.trim(), password } });
      setPassword("");
      setConfirmation("");
      setReveal(false);
      toast.success(hasAccess ? "Senha redefinida." : "Acesso criado.");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar o acesso.");
    }
    setSaving(false);
  }

  async function revoke() {
    setSaving(true);
    try {
      await revokeAthleteAccess({ data: { athleteId } });
      toast.success("Acesso revogado.");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao revogar o acesso.");
    }
    setSaving(false);
  }

  function generate() {
    const next = generatePassword();
    setPassword(next);
    setConfirmation(next);
    setReveal(true);
  }

  return (
    <Panel
      title="Acesso ao portal"
      description={
        hasAccess
          ? `Acesso ativo${athleteEmail ? ` — ${athleteEmail}` : ""}`
          : "Sem acesso. Defina e-mail e senha para liberar o portal."
      }
    >
      <div className="space-y-4 p-5">
        <label className="block text-sm font-medium">
          E-mail de acesso
          <input
            className={`${inputClass} mt-1.5`}
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Senha
          <input
            className={`${inputClass} mt-1.5`}
            type={reveal ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Confirmar senha
          <input
            className={`${inputClass} mt-1.5`}
            type={reveal ? "text" : "password"}
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-3 text-sm">
          <button type="button" className={secondaryButtonClass} onClick={generate}>
            Gerar senha forte
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => setReveal((value) => !value)}
          >
            {reveal ? "Ocultar" : "Exibir"}
          </button>
        </div>
        <button
          type="button"
          className={`${buttonClass} w-full`}
          disabled={saving}
          onClick={submit}
        >
          {hasAccess ? "Redefinir senha" : "Criar acesso"}
        </button>
        {hasAccess && (
          <button
            type="button"
            className={`${secondaryButtonClass} w-full`}
            disabled={saving}
            onClick={revoke}
          >
            Revogar acesso
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          A senha aparece apenas nesta tela — copie e repasse ao atleta. Ela não fica armazenada em
          texto no sistema.
        </p>
      </div>
    </Panel>
  );
}

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { saveUniversityCoachServerFn } from "@/lib/coach-directory.functions";
import type { University } from "@/types/db";
import { buttonClass, secondaryButtonClass, inputClass } from "@/components/admin-ui";

import { isDeliverableEmailSyntax } from "@/lib/email/email-syntax";

export interface CoachFormData {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  universityId: string;
}

export interface CoachFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  universities: University[];
  editingCoach: CoachFormData | null;
  onSuccess: () => void;
}

export function CoachFormDialog({
  open,
  onOpenChange,
  universities,
  editingCoach,
  onSuccess,
}: CoachFormDialogProps) {
  const [form, setForm] = useState<CoachFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "",
    universityId: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingCoach) {
      setForm(editingCoach);
    } else {
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        role: "",
        universityId: universities[0]?.id || "",
      });
    }
  }, [editingCoach, universities, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = form.email.trim().toLowerCase();

    if (!form.universityId) {
      toast.error("Selecione uma universidade.");
      return;
    }
    if (!form.firstName.trim()) {
      toast.error("Informe o primeiro nome do treinador.");
      return;
    }
    if (!isDeliverableEmailSyntax(cleanEmail)) {
      toast.error("Informe um e-mail válido com domínio entregável (ex.: coach@university.edu).");
      return;
    }

    setSaving(true);
    try {
      const res = await saveUniversityCoachServerFn({
        data: {
          universityId: form.universityId,
          coach: {
            id: form.id,
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            email: cleanEmail,
            phone: form.phone.trim() || undefined,
            role: form.role.trim() || undefined,
          },
        },
      });

      if (res?.success) {
        toast.success(
          form.id ? "Treinador atualizado com sucesso." : "Treinador cadastrado com sucesso.",
        );
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(res?.message || "Não foi possível salvar o treinador.");
      }
    } catch (err) {
      console.error("[coach-form] Error saving coach:", err);
      toast.error("Erro inesperado ao salvar treinador.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {form.id ? "Editar Treinador" : "Adicionar Novo Treinador"}
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-500">
            Preencha os dados de contato do coach universitário.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Universidade / Instituição <span className="text-rose-500">*</span>
            </label>
            <select
              value={form.universityId}
              onChange={(e) => setForm({ ...form, universityId: e.target.value })}
              className="w-full text-xs p-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
              required
            >
              <option value="">Selecione uma universidade...</option>
              {universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.state}) {u.league ? `· ${u.league}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Primeiro Nome <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: John"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Sobrenome
              </label>
              <input
                type="text"
                placeholder="Ex: Smith"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              E-mail Oficial <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              placeholder="Ex: coach.smith@university.edu"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Cargo / Função
              </label>
              <input
                type="text"
                placeholder="Ex: Head Coach, Assistant"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Telefone (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: +1 555 123-4567"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={secondaryButtonClass}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium rounded-md bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 transition-colors"
            >
              {saving ? "Salvando..." : form.id ? "Atualizar Treinador" : "Adicionar Treinador"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

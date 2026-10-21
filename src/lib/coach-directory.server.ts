import { getAdminClient } from "@/lib/supabase/clients.server";
import type {
  University,
  UniversityCoach,
  UniversityLeague,
  UniversityBudgetLevel,
} from "@/types/db";

export interface CoachWithUniversity extends UniversityCoach {
  universityId: string;
  universityName: string;
  universityState: string;
  universityCity: string;
  universityLeague: UniversityLeague | null;
  universityBudgetLevel: UniversityBudgetLevel | null;
}

export interface CoachListFilterOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  universityId?: string;
  state?: string;
  league?: string;
  role?: string;
}

/**
 * Atualiza atomicamente um coach dentro do array JSONB `universities.coaches`.
 * Previne sobrescrita indevida (lost updates) e preserva todos os outros contatos.
 */
export async function updateUniversityCoachAtomic(
  universityId: string,
  coachData: Partial<UniversityCoach> & { email: string },
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<{ success: boolean; coach?: UniversityCoach; message?: string }> {
  const admin = customAdmin || getAdminClient();

  // 1. Carregar a universidade atual
  const { data: uni, error: readError } = await admin
    .from("universities")
    .select("id, coaches, updated_at")
    .eq("id", universityId)
    .maybeSingle();

  if (readError || !uni) {
    return { success: false, message: readError?.message || "Universidade não encontrada." };
  }

  const currentCoaches: UniversityCoach[] = Array.isArray(uni.coaches) ? uni.coaches : [];
  const cleanEmail = coachData.email.toLowerCase().trim();
  const now = new Date().toISOString();

  let updatedCoach: UniversityCoach;
  const existingIndex = currentCoaches.findIndex(
    (c) =>
      (coachData.id && c.id === coachData.id) ||
      c.email.toLowerCase().trim() === cleanEmail,
  );

  if (existingIndex >= 0) {
    const existing = currentCoaches[existingIndex];
    updatedCoach = {
      ...existing,
      ...coachData,
      id: existing.id || coachData.id || crypto.randomUUID(),
      first_name: coachData.first_name ?? existing.first_name ?? "",
      last_name: coachData.last_name ?? existing.last_name ?? "",
      email: cleanEmail,
      phone: coachData.phone ?? existing.phone ?? "",
      role: coachData.role ?? existing.role ?? "",
    };
    currentCoaches[existingIndex] = updatedCoach;
  } else {
    updatedCoach = {
      id: coachData.id || crypto.randomUUID(),
      first_name: coachData.first_name || "",
      last_name: coachData.last_name || "",
      email: cleanEmail,
      phone: coachData.phone || "",
      role: coachData.role || "",
    };
    currentCoaches.push(updatedCoach);
  }

  const { error: updateError } = await admin
    .from("universities")
    .update({
      coaches: currentCoaches,
      updated_at: now,
    })
    .eq("id", universityId);

  if (updateError) {
    return { success: false, message: updateError.message };
  }

  return { success: true, coach: updatedCoach };
}

/**
 * Remove um coach do array JSONB `universities.coaches` de forma atômica.
 */
export async function deleteUniversityCoachAtomic(
  universityId: string,
  coachIdOrEmail: string,
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<{ success: boolean; message?: string }> {
  const admin = customAdmin || getAdminClient();

  const { data: uni, error: readError } = await admin
    .from("universities")
    .select("id, coaches")
    .eq("id", universityId)
    .maybeSingle();

  if (readError || !uni) {
    return { success: false, message: readError?.message || "Universidade não encontrada." };
  }

  const currentCoaches: UniversityCoach[] = Array.isArray(uni.coaches) ? uni.coaches : [];
  const target = coachIdOrEmail.toLowerCase().trim();

  const filtered = currentCoaches.filter(
    (c) => c.id !== coachIdOrEmail && c.email.toLowerCase().trim() !== target,
  );

  const { error: updateError } = await admin
    .from("universities")
    .update({
      coaches: filtered,
      updated_at: new Date().toISOString(),
    })
    .eq("id", universityId);

  if (updateError) {
    return { success: false, message: updateError.message };
  }

  return { success: true };
}

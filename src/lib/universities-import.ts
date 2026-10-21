import { US_STATES } from "./universities-constants";
import type { UniversityCoach } from "@/types/db";

export const universityImportKey = (name: string, state: string) =>
  `${name.trim().replace(/\s+/g, " ").toLowerCase()}_${state.trim().toUpperCase()}`;

export function validateUniversityState(value: string): string | null {
  const state = value.trim().toUpperCase();
  return US_STATES.includes(state as (typeof US_STATES)[number]) ? state : null;
}

export function mergeCoachContacts(
  existing: UniversityCoach[],
  incoming: UniversityCoach[],
): { coaches: UniversityCoach[]; added: number; duplicates: number } {
  const seen = new Set(existing.map((c) => c.email.trim().toLowerCase()));
  const coaches = [...existing];
  let duplicates = 0;
  for (const coach of incoming) {
    const email = coach.email.trim().toLowerCase();
    if (!email || seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    coaches.push({ ...coach, email });
  }
  return { coaches, added: coaches.length - existing.length, duplicates };
}

export function evaluateImportUpdates<T extends { error: { message: string } | null }>(
  responses: T[],
): { succeeded: number; failures: Array<{ index: number; message: string }> } {
  return {
    succeeded: responses.filter((r) => !r.error).length,
    failures: responses.flatMap((r, index) => r.error ? [{ index, message: r.error.message }] : []),
  };
}

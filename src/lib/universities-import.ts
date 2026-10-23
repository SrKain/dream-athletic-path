import { US_STATES } from "./universities-constants";
import type { UniversityCoach } from "@/types/db";
import { isDeliverableEmailSyntax } from "./email/email-syntax";

export const universityImportKey = (name: string, state: string) =>
  `${name.trim().replace(/\s+/g, " ").toLowerCase()}_${state.trim().toUpperCase()}`;

export function validateUniversityState(value: string): string | null {
  const state = value.trim().toUpperCase();
  return US_STATES.includes(state as (typeof US_STATES)[number]) ? state : null;
}

export function mergeCoachContacts(
  existing: UniversityCoach[],
  incoming: UniversityCoach[],
): { coaches: UniversityCoach[]; added: number; duplicates: number; invalidSyntax: number } {
  const seen = new Set(existing.map((c) => c.email.trim().toLowerCase()));
  const coaches = [...existing];
  let duplicates = 0;
  let invalidSyntax = 0;
  for (const coach of incoming) {
    const raw = (coach.email || "").trim();
    if (!isDeliverableEmailSyntax(raw)) {
      invalidSyntax++;
      continue;
    }
    const email = raw.toLowerCase();
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    coaches.push({ ...coach, email });
  }
  return { coaches, added: coaches.length - existing.length, duplicates, invalidSyntax };
}

export function evaluateImportUpdates<T extends { error: { message: string } | null }>(
  responses: T[],
): { succeeded: number; failures: Array<{ index: number; message: string }> } {
  return {
    succeeded: responses.filter((r) => !r.error).length,
    failures: responses.flatMap((r, index) =>
      r.error ? [{ index, message: r.error.message }] : [],
    ),
  };
}

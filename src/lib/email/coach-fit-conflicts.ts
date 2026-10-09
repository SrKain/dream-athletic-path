import type { CoachInterestSignal } from "@/types/db";

export interface FitCheckAthlete {
  id: string;
  name: string;
  position: string | null;
}

export interface FitCheckRecipient {
  key: string;
  coachId?: string;
  name: string;
  email: string;
  universityName: string;
  signals: CoachInterestSignal[];
}

export interface CoachFitConflict {
  recipient: FitCheckRecipient;
  reason: CoachInterestSignal["reason"];
  athletes: string[];
  detail: string;
  reviewOnly?: boolean;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function parsePositions(value: string | null | undefined): string[] {
  return (value ?? "").split(/[,;/|\n]+/).map(normalize).filter(Boolean);
}

export function findCoachFitConflicts(
  recipients: FitCheckRecipient[],
  athletes: FitCheckAthlete[],
  signals: CoachInterestSignal[],
  now = new Date(),
): CoachFitConflict[] {
  const active = signals.filter((signal) => !signal.expires_at || new Date(signal.expires_at) > now);
  const byEmail = new Map<string, CoachInterestSignal[]>();
  for (const signal of active) {
    const email = normalize(signal.coach_email);
    byEmail.set(email, [...(byEmail.get(email) ?? []), signal]);
  }

  const conflicts: CoachFitConflict[] = [];
  for (const recipient of recipients) {
    for (const signal of byEmail.get(normalize(recipient.email)) ?? []) {
      if (signal.coach_id && recipient.coachId && signal.coach_id !== recipient.coachId) continue;
      let affected: FitCheckAthlete[] = [];
      let detail = "";
      let reviewOnly = false;
      if (signal.reason === "fully_recruited") {
        affected = athletes;
        detail = "Roster already full";
      } else if (signal.reason === "position_not_needed") {
        const target = normalize(signal.position);
        affected = !target ? athletes : athletes.filter((athlete) => normalize(athlete.position) === target);
        detail = signal.position ? `Position not needed: ${signal.position}` : "Coach marked positions as not needed";
      } else if (signal.reason === "other_positions_only") {
        const sought = parsePositions(signal.position);
        if (sought.length === 0) {
          affected = athletes;
          detail = "Other positions only (positions not specified)";
          reviewOnly = true;
        } else {
          affected = athletes.filter((athlete) => !normalize(athlete.position) || !sought.includes(normalize(athlete.position)));
          detail = `Only seeking: ${signal.position}`;
          if (affected.some((athlete) => !normalize(athlete.position))) reviewOnly = true;
        }
      } else if (signal.reason === "specific_athlete_dislike") {
        affected = signal.athlete_id
          ? athletes.filter((athlete) => athlete.id === signal.athlete_id)
          : athletes.filter((athlete) => normalize(athlete.name) === normalize(signal.athlete_name));
        detail = signal.athlete_name ? `Specific athlete: ${signal.athlete_name}` : "Specific athlete marked as not a fit";
      }
      if (affected.length) conflicts.push({ recipient, reason: signal.reason, athletes: affected.map((athlete) => athlete.name), detail, reviewOnly });
    }
  }
  return conflicts;
}

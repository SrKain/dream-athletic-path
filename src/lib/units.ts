/**
 * Utilitários para conversão e formatação de medidas no sistema imperial (EUA).
 * Converte cm para pés/polegadas e kg para libras.
 */

export function cmToFeetAndInches(
  cm: number | null | undefined,
): { feet: number; inches: number } | null {
  if (cm == null || Number.isNaN(cm) || cm <= 0) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet, inches };
}

export function formatHeightImperial(cm: number | null | undefined): string | null {
  const converted = cmToFeetAndInches(cm);
  if (!converted) return null;
  return `${converted.feet}'${converted.inches}"`;
}

export function kgToLbs(kg: number | null | undefined): number | null {
  if (kg == null || Number.isNaN(kg) || kg <= 0) return null;
  return Math.round(kg * 2.20462);
}

export function formatWeightImperial(kg: number | null | undefined): string | null {
  const lbs = kgToLbs(kg);
  if (lbs == null) return null;
  return `${lbs} lbs`;
}

export function buildAthleteSlug(
  fullName: string,
  positionName?: string | null,
  existingSlugs: string[] = [],
) {
  const base = fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const variants = [base, positionName ? `${base}-${positionName}` : null].filter(Boolean) as string[];
  const normalizedPosition = positionName
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const candidateBase = normalizedPosition ? `${base}-${normalizedPosition}` : base;
  const candidates = [base, candidateBase];

  for (const candidate of candidates) {
    if (!existingSlugs.includes(candidate)) {
      return candidate;
    }
  }

  let index = 2;
  while (true) {
    const next = `${candidateBase}-${index}`;
    if (!existingSlugs.includes(next)) {
      return next;
    }
    index += 1;
  }
}

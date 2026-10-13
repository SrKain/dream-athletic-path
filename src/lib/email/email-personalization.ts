/** Shared personalization for previews, direct sends and queued messages. */
export const MAX_CUSTOM_SUBJECT_LENGTH = 200;

export function resolveEmailSubject(customSubject: unknown, fallback: string): string {
  if (customSubject == null || customSubject === "") return fallback.replace(/[\r\n]+/g, " ").trim();
  if (typeof customSubject !== "string" || /[\r\n]/.test(customSubject)) {
    throw new Error("Email subject must be a single line of text.");
  }
  const subject = customSubject.trim();
  if (subject.length > MAX_CUSTOM_SUBJECT_LENGTH) {
    throw new Error(`Email subject must be at most ${MAX_CUSTOM_SUBJECT_LENGTH} characters.`);
  }
  return subject || fallback.replace(/[\r\n]+/g, " ").trim();
}

export function buildCoachGreeting(lastName?: string | null): string {
  const surname = lastName?.replace(/[\r\n]+/g, " ").trim();
  return surname ? `Hi Coach ${surname},` : "Hi Coach,";
}

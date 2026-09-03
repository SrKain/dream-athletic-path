export const RECRUIT_WHATSAPP_NUMBER = "5511999239490";

/**
 * Endereço de e-mail oficial para contato com a agência.
 * Pode ser sobrescrito via variável de ambiente pública VITE_AGENCY_CONTACT_EMAIL.
 */
export const AGENCY_CONTACT_EMAIL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_AGENCY_CONTACT_EMAIL
    ? String(import.meta.env.VITE_AGENCY_CONTACT_EMAIL).trim()
    : "") || "contact@goteamgoagency.com";

export function buildRecruitWhatsappUrl(athleteName: string) {
  const message = `Hello! I'm interested in recruiting ${athleteName} through Go Team Go Agency. I'd love to learn more about her and discuss her availability and recruiting profile.`;
  return `https://wa.me/${RECRUIT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export type ContactEmailContext =
  | { type: "hero" }
  | { type: "catalog" }
  | { type: "athlete"; athleteName: string; athleteSlug?: string; profileUrl?: string }
  | { type: "footer" }
  | { type: "general"; note?: string };

export interface MailtoParams {
  to?: string;
  subject: string;
  body: string;
}

/**
 * Constrói uma URL mailto: sanitizada e codificada com segurança via encodeURIComponent.
 */
export function buildMailtoUrl({ to = AGENCY_CONTACT_EMAIL, subject, body }: MailtoParams): string {
  const cleanTo = to.trim();
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  return `mailto:${cleanTo}?subject=${encodedSubject}&body=${encodedBody}`;
}

/**
 * Gera URLs mailto: contextuais para cada ponto de contato da aplicação.
 */
export function buildContactEmailUrl(context: ContactEmailContext): string {
  switch (context.type) {
    case "hero":
      return buildMailtoUrl({
        subject: "I'm interested in working with Go Team Go",
        body: [
          "Hello Go Team Go team,",
          "",
          "I am contacting you through your website and would like to learn more about your recruitment agency and how we can work together.",
          "",
          "Best regards,",
        ].join("\n"),
      });

    case "catalog":
      return buildMailtoUrl({
        subject: "Athlete recruitment inquiry",
        body: [
          "Hello Go Team Go team,",
          "",
          "I am reaching out through your athlete catalog to inquire about prospect recruitment and player availability for US college programs.",
          "",
          "Best regards,",
        ].join("\n"),
      });

    case "athlete": {
      const cleanName = context.athleteName.trim();
      const profileUrl =
        context.profileUrl ||
        (context.athleteSlug
          ? `https://portfolio.goteamgoagency.com/athlete/${context.athleteSlug}`
          : "");

      const bodyLines = [
        "Hello Go Team Go team,",
        "",
        `I am interested in recruiting ${cleanName} and am reaching out directly from her athlete profile${
          profileUrl ? `:\n${profileUrl}` : "."
        }`,
        "",
        "I would like to request full match film, academic records, and discuss recruitment availability.",
        "",
        "Best regards,",
      ];

      return buildMailtoUrl({
        subject: `Interest in ${cleanName}`,
        body: bodyLines.join("\n"),
      });
    }

    case "footer":
      return buildMailtoUrl({
        subject: "Contact through website",
        body: [
          "Hello Go Team Go team,",
          "",
          "I am getting in touch through your website to learn more about your athletic recruitment services.",
          "",
          "Best regards,",
        ].join("\n"),
      });

    case "general":
      return buildMailtoUrl({
        subject: "General inquiry",
        body: [
          "Hello Go Team Go team,",
          "",
          `I am contacting you through your website regarding ${context.note ?? "athletic recruitment opportunities"}.`,
          "",
          "Best regards,",
        ].join("\n"),
      });
  }
}

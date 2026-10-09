/**
 * Personal Email Renderer — Individual Athlete + Multi-Athlete.
 *
 * Renderer puro e determinístico usado TANTO no preview do Mailer QUANTO no HTML
 * enviado pelo Resend. Não é usado pelo modo Catalog (que segue intacto em
 * `renderCatalogRecruitEmail`).
 *
 * Camadas de confiança:
 *  - USER CONTENT (blocos de texto): sempre escapado; nenhum HTML é interpretado.
 *  - TRUSTED ATHLETE CARD HTML: gerado a partir dos dados reais do atleta.
 *  - TRUSTED FOOTER HTML: assinatura da Fabiana + 3 ações obrigatórias, sempre anexadas.
 */
import { EMAIL_BASE_URL, EMAIL_COLORS } from "./email-brand";
import { escapeHtml, renderSignature } from "./email-layout";
import { appendMailerUtmParams } from "./mailer-metrics-quality";
import { buildBoardCardUrls, renderAthleteBoardCard } from "./athlete-board-card";
import type { RecruitEmailAthlete } from "./recruit-email";

export type EmailBlock =
  | { type: "text"; content: string }
  | { type: "athlete"; athleteId: string };

export interface PersonalEmailInput {
  blocks: EmailBlock[];
  athletes: RecruitEmailAthlete[];
  subject: string;
  preheader?: string;
  coachName?: string;
  coachEmail?: string | null;
  coachId?: string | null;
  campaignId?: string | null;
  appUrl?: string;
  logoUrl?: string | null;
}

export interface FixedEmailComposition {
  greeting: string;
  introduction: string;
  athleteOrder: string[];
  closing: string;
}

export interface PersonalEmailOutput {
  html: string;
  text: string;
  /** IDs de atletas referenciados por blocos mas inexistentes (ignorados). */
  missingAthleteIds: string[];
  /** Ordem final dos atletas efetivamente renderizados. */
  renderedAthleteIds: string[];
}

const MAX_TEXT_LENGTH = 5000;
const MAX_BLOCKS = 60;

/** Normaliza/valida blocos vindos do cliente. Descarta tudo que não for válido. */
export function sanitizeEmailBlocks(input: unknown): EmailBlock[] {
  if (!Array.isArray(input)) return [];
  const out: EmailBlock[] = [];
  for (const raw of input.slice(0, MAX_BLOCKS)) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Record<string, unknown>;
    if (block.type === "text" && typeof block.content === "string") {
      out.push({ type: "text", content: block.content.slice(0, MAX_TEXT_LENGTH) });
    } else if (
      block.type === "athlete" &&
      typeof block.athleteId === "string" &&
      block.athleteId.trim()
    ) {
      out.push({ type: "athlete", athleteId: block.athleteId.trim().slice(0, 64) });
    }
  }
  return out;
}

/** Blocos padrão editáveis: saudação, cards na ordem da seleção, fechamento. */
export function buildDefaultEmailBlocks(athleteIds: string[]): EmailBlock[] {
  const blocks: EmailBlock[] = [
    {
      type: "text",
      content:
        athleteIds.length > 1
          ? "Hi Coach,\n\nI hope you're doing well. I selected a few athletes I believe could be a good fit for your program."
          : "Hi Coach,\n\nI hope you're doing well. I found an athlete who I believe could be a great fit for what you're currently looking for.",
    },
  ];
  for (const id of athleteIds) blocks.push({ type: "athlete", athleteId: id });
  blocks.push({ type: "text", content: "Let me know what you think." });
  return blocks;
}

/** Keeps the editable text regions fixed and only allows athlete cards to reorder. */
export function buildFixedEmailBlocks(
  composition: FixedEmailComposition,
  allowedAthleteIds: string[],
): EmailBlock[] {
  const allowedIds = [...new Set(allowedAthleteIds.filter((id) => typeof id === "string"))].slice(
    0,
    MAX_BLOCKS - 3,
  );
  const allowed = new Set(allowedIds);
  const requestedOrder = Array.isArray(composition?.athleteOrder)
    ? composition.athleteOrder.filter((id): id is string => typeof id === "string")
    : [];
  const ordered = requestedOrder.filter((id, index, ids) =>
    allowed.has(id) && ids.indexOf(id) === index,
  );
  for (const id of allowedIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }

  return sanitizeEmailBlocks([
    { type: "text", content: typeof composition?.greeting === "string" ? composition.greeting : "" },
    { type: "text", content: typeof composition?.introduction === "string" ? composition.introduction : "" },
    ...ordered.map((athleteId) => ({ type: "athlete" as const, athleteId })),
    { type: "text", content: typeof composition?.closing === "string" ? composition.closing : "" },
  ]);
}

/** Texto do usuário → parágrafos HTML seguros (linha em branco = novo parágrafo). */
export function renderUserTextHtml(content: string): string {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split("\n").map((line) => escapeHtml(line));
      return `<p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${EMAIL_COLORS.textDark};">${lines.join("<br>")}</p>`;
    })
    .join("");
}

export function buildUnsubscribeUrl(recipientEmail?: string | null): string {
  return recipientEmail
    ? `${EMAIL_BASE_URL}/unsubscribe?email=${encodeURIComponent(recipientEmail)}`
    : `${EMAIL_BASE_URL}/unsubscribe`;
}

export function buildNotRightFitUrl(params: {
  recipientEmail?: string | null;
  coachId?: string | null;
  athleteId?: string | null;
  position?: string | null;
}): string {
  const query = new URLSearchParams();
  if (params.recipientEmail) query.set("email", params.recipientEmail);
  if (params.coachId) query.set("coachId", params.coachId);
  if (params.athleteId) query.set("athleteId", params.athleteId);
  if (params.position) query.set("position", params.position);
  const qs = query.toString();
  return qs ? `${EMAIL_BASE_URL}/feedback?${qs}` : `${EMAIL_BASE_URL}/feedback`;
}

export function buildCatalogUrl(options: { appUrl?: string; campaignId?: string | null }): string {
  const baseUrl = options.appUrl || EMAIL_BASE_URL;
  return appendMailerUtmParams(baseUrl, {
    appUrl: baseUrl,
    campaignId: options.campaignId,
    content: "footer_go_to_catalog",
  });
}

function renderActionsRow(links: {
  unsubscribe: string;
  notFit: string;
  catalog: string;
}): string {
  const linkStyle = `font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:${EMAIL_COLORS.darkGreenPrimary};text-decoration:underline;`;
  const sep = `<span style="color:${EMAIL_COLORS.textMuted};padding:0 8px;">&middot;</span>`;
  return `
  <tr>
    <td align="center" style="padding:14px 24px 24px 24px;background-color:#ffffff;">
      <a href="${escapeHtml(links.unsubscribe)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">Unsubscribe</a>${sep}<a href="${escapeHtml(links.notFit)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">Not the right fit</a>${sep}<a href="${escapeHtml(links.catalog)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">Go to catalog</a>
    </td>
  </tr>`;
}

function renderPersonalShell(params: {
  title: string;
  preheader: string;
  body: string;
}): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" style="color-scheme: light only;">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>${escapeHtml(params.title)}</title>
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    @media only screen and (max-width: 640px) {
      .email-container { width:100% !important; max-width:100% !important; }
      .mobile-stack { display:block !important; width:100% !important; max-width:100% !important; text-align:left !important; }
      .mobile-stack-center { display:block !important; width:100% !important; text-align:center !important; }
      .mobile-hide { display:none !important; }
      .mobile-grid-2 { display:inline-block !important; width:48% !important; vertical-align:top !important; margin-bottom:12px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(params.preheader)}</div>
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff;width:100%;">
    <tr>
      <td align="center" valign="top" style="padding:16px 8px;">
        <table role="presentation" class="email-container" width="600" border="0" cellspacing="0" cellpadding="0" style="width:600px;max-width:600px;background-color:#ffffff;">
${params.body}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Renderiza o e-mail pessoal completo (preview === envio). */
export function renderPersonalEmail(input: PersonalEmailInput): PersonalEmailOutput {
  const appUrl = input.appUrl || EMAIL_BASE_URL;
  const byId = new Map(input.athletes.map((a) => [a.id, a]));
  const coachName = input.coachName ? input.coachName.replace(/^Coach\s+/i, "").trim() : "";
  const blocks = sanitizeEmailBlocks(input.blocks);

  const rows: string[] = [];
  const textParts: string[] = [];
  const missing: string[] = [];
  const rendered: string[] = [];

  for (const block of blocks) {
    if (block.type === "text") {
      const html = renderUserTextHtml(block.content);
      if (!html) continue;
      rows.push(`<tr><td style="padding:4px 24px 0 24px;">${html}</td></tr>`);
      textParts.push(block.content.trim());
      continue;
    }
    const athlete = byId.get(block.athleteId);
    if (!athlete) {
      missing.push(block.athleteId);
      continue;
    }
    rendered.push(athlete.id);
    const cardHtml = renderAthleteBoardCard(athlete, {
      appUrl,
      coachName,
      coachEmail: input.coachEmail || undefined,
      campaignId: input.campaignId,
    });
    rows.push(`<tr><td style="padding:6px 24px 18px 24px;">${cardHtml}</td></tr>`);
    const actionUrls = buildBoardCardUrls(athlete, {
      appUrl,
      coachName,
      coachEmail: input.coachEmail || undefined,
      campaignId: input.campaignId,
    });
    textParts.push(
      [
        `— ${athlete.name}`,
        athlete.positionEn,
        `VIEW FULL PROFILE: ${actionUrls.profile}`,
        `RECRUIT NOW: ${actionUrls.recruit}`,
        `NOT A FIT: ${actionUrls.notFit}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  const firstAthlete = rendered.length ? byId.get(rendered[0]) : input.athletes[0];
  const links = {
    unsubscribe: buildUnsubscribeUrl(input.coachEmail),
    notFit: buildNotRightFitUrl({
      recipientEmail: input.coachEmail,
      coachId: input.coachId,
      athleteId: firstAthlete?.id,
      position: firstAthlete?.positionEn,
    }),
    catalog: buildCatalogUrl({ appUrl, campaignId: input.campaignId }),
  };

  // TRUSTED FOOTER — sempre presente, fora do controle do usuário.
  rows.push(renderSignature({ logoUrl: input.logoUrl }));
  rows.push(renderActionsRow(links));

  const html = renderPersonalShell({
    title: input.subject,
    preheader: input.preheader || input.subject,
    body: rows.join("\n"),
  });

  const text = [
    ...textParts,
    "Best regards,\nFabiana Andrade\nFounder | Go Team Go Agency",
    `Unsubscribe: ${links.unsubscribe}`,
    `Not the right fit: ${links.notFit}`,
    `Go to catalog: ${links.catalog}`,
  ].join("\n\n");

  return { html, text, missingAthleteIds: missing, renderedAthleteIds: rendered };
}

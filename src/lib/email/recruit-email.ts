import { cmToFeetAndInches, formatGpa } from "@/lib/units";
import { EMAIL_ASSETS, EMAIL_BASE_URL, EMAIL_COLORS, EMAIL_SIGNATURE } from "./email-brand";
import { appendMailerUtmParams } from "./mailer-metrics-quality";
import {
  escapeHtml,
  renderBottomBar,
  renderEmailShell,
  renderFeedbackBlock,
  renderLegalFooter,
  renderRequestCtaBar,
  renderSignature,
} from "./email-layout";

export interface RecruitEmailAthlete {
  id: string;
  name: string;
  slug: string;
  photoUrl?: string | null;
  positionEn?: string | null;
  heightCm?: number | null;
  graduationYear?: number | null;
  gpa?: number | null;
  athleteStatus?: string | null;
  countryEn?: string | null;
  countryFlag?: string | null;
  highlightVideoUrl?: string | null;
  highlightNote?: string | null;
  profileUrl?: string | null;
  courseOfInterest?: string | null;
  collegeStartDate?: string | null;
  index?: number;
}

export interface RecruitEmailRenderOptions {
  coachName?: string;
  coachEmail?: string;
  feedbackToken?: string;
  agencyLogoUrl?: string | null;
  agencyName?: string;
  greetingText?: string;
  introductionText?: string;
  hookText?: string;
  sportName?: string;
  gradYear?: number | string;
  athletes?: RecruitEmailAthlete[];
  athlete?: RecruitEmailAthlete;
  appUrl?: string;
  unsubscribeToken?: string;
  campaignId?: string | null;
}

/**
 * Constrói a linha de specs resumida no padrão oficial da agência:
 * POSIÇÃO · ALTURA (imperial + cm) · CLASS OF {ano} · GPA · PAÍS (bandeira)
 */
export function buildAthleteSpecsLine(athlete: RecruitEmailAthlete): string {
  const parts: string[] = [];

  // 1. Posição
  if (athlete.positionEn && athlete.positionEn.trim()) {
    parts.push(athlete.positionEn.trim());
  }

  // 2. Altura (imperial + cm)
  if (athlete.heightCm && athlete.heightCm > 0) {
    const imperial = cmToFeetAndInches(athlete.heightCm);
    if (imperial) {
      parts.push(`${imperial.feet}'${imperial.inches}" (${athlete.heightCm} cm)`);
    } else {
      parts.push(`${athlete.heightCm} cm`);
    }
  }

  // 3. Class of
  if (athlete.graduationYear && athlete.graduationYear > 0) {
    parts.push(`Class of ${athlete.graduationYear}`);
  }

  // 4. GPA
  const formattedGpa = formatGpa(athlete.gpa);
  if (formattedGpa) {
    parts.push(`GPA ${formattedGpa}`);
  }

  // 5. País (bandeira + nome)
  const flag = athlete.countryFlag ? athlete.countryFlag.trim() : "";
  const country = athlete.countryEn ? athlete.countryEn.trim() : "";
  if (flag && country) {
    parts.push(`${flag} ${country}`);
  } else if (country) {
    parts.push(country);
  } else if (flag) {
    parts.push(flag);
  }

  return parts.join(" · ");
}

/**
 * Verifica se a atleta é elegível para exibição da badge TRANSFER.
 * Regra: Exibir exclusivamente para Freshman, Sophomore, Junior, Senior ou Transfer.
 * Nunca exibir para Graduate Transfer, High School, Graduate ou nulo.
 */
export function isTransferEligible(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return (
    s === "freshman" || s === "sophomore" || s === "junior" || s === "senior" || s === "transfer"
  );
}

/**
 * Gera o link mailto: pré-preenchido para o botão "I'M INTERESTED"
 */
export function buildInterestedMailtoUrl(athlete: RecruitEmailAthlete, coachName?: string): string {
  const cleanName = athlete.name.trim();
  const position = athlete.positionEn ? athlete.positionEn.trim() : "Athlete";
  const year = athlete.graduationYear ? `Class of ${athlete.graduationYear}` : "";
  const details = [position, year].filter(Boolean).join(", ");
  const subject = `[Interested] ${cleanName}${details ? ` (${details})` : ""}`;

  const body = [
    `Hi ${EMAIL_SIGNATURE.name},`,
    "",
    `I am interested in recruiting ${cleanName}${details ? ` (${details})` : ""}.`,
    "Please send more information, academic transcripts, and full match film.",
    "",
    "Best regards,",
    coachName ? `Coach ${coachName}` : "Coach",
  ].join("\n");

  return `mailto:${EMAIL_SIGNATURE.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Gera a URL para o botão discreto "NOT A FIT" com o athleteId específico
 */
export function buildNotAFitUrl(
  athleteId: string,
  options: { appUrl?: string; coachEmail?: string; feedbackToken?: string },
): string {
  const baseUrl = options.appUrl || EMAIL_BASE_URL;
  const coach = options.coachEmail ? encodeURIComponent(options.coachEmail) : "";
  const token = options.feedbackToken ? encodeURIComponent(options.feedbackToken) : "";
  const aId = encodeURIComponent(athleteId);
  return `${baseUrl}/feedback?sentiment=not_fit&athleteId=${aId}&coach=${coach}&token=${token}`;
}

/**
 * Renderiza uma ficha individual de atleta em tabela HTML de largura total (680px max).
 * Desktop: Foto à esquerda, specs e 4 botões de 44px à direita.
 * Mobile: Foto e botões empilham verticalmente.
 */
export function renderAthleteCard(
  athlete: RecruitEmailAthlete,
  options: {
    appUrl?: string;
    coachName?: string;
    coachEmail?: string;
    feedbackToken?: string;
    campaignId?: string | null;
  } = {},
): string {
  const baseUrl = options.appUrl || EMAIL_BASE_URL;
  const rawProfileUrl =
    athlete.profileUrl || `${baseUrl}/athlete/${encodeURIComponent(athlete.slug)}`;
  const profileUrl = appendMailerUtmParams(rawProfileUrl, {
    appUrl: baseUrl,
    campaignId: options.campaignId,
    content: `full_profile_${athlete.slug}`,
  });
  const rawVideoUrl =
    athlete.highlightVideoUrl && athlete.highlightVideoUrl.trim()
      ? athlete.highlightVideoUrl.trim()
      : rawProfileUrl;
  const videoUrl = appendMailerUtmParams(rawVideoUrl, {
    appUrl: baseUrl,
    campaignId: options.campaignId,
    content: `watch_film_${athlete.slug}`,
  });
  const interestedMailto = buildInterestedMailtoUrl(athlete, options.coachName);
  const notAFitUrl = buildNotAFitUrl(athlete.id, options);

  const specs = buildAthleteSpecsLine(athlete);
  const showTransferBadge = isTransferEligible(athlete.athleteStatus);
  const photoUrl =
    athlete.photoUrl && athlete.photoUrl.trim()
      ? athlete.photoUrl.trim()
      : `${baseUrl}/favicon.ico`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px; background-color: ${EMAIL_COLORS.cardBg}; border: 1px solid ${EMAIL_COLORS.cardBorder}; border-radius: 12px; overflow: hidden;">
      <tr>
        <td style="padding: 16px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <!-- Foto da Atleta (Esquerda no desktop) -->
              <td class="stack-column athlete-photo-cell" width="110" valign="top" style="padding-right: 16px;">
                <a href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: block;">
                  <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(athlete.name)}" width="110" height="138" style="display: block; width: 110px; height: 138px; object-fit: cover; border-radius: 8px; border: 1px solid ${EMAIL_COLORS.cardBorder}; background-color: ${EMAIL_COLORS.cardBg};" />
                </a>
              </td>

              <!-- Dados e Ações (Direita no desktop) -->
              <td class="stack-column athlete-info-cell" valign="top">
                <!-- Nome e Badge Transfer -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <a href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; font-family: Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 800; color: ${EMAIL_COLORS.textDark}; line-height: 1.25; text-transform: uppercase;">
                        ${escapeHtml(athlete.name)}
                      </a>
                      ${
                        showTransferBadge
                          ? `<span style="display: inline-block; padding: 2px 6px; font-family: Arial, Helvetica, sans-serif; font-size: 10px; font-weight: 800; color: ${EMAIL_COLORS.badgeGoldText}; background-color: ${EMAIL_COLORS.badgeGoldBg}; border: 1px solid ${EMAIL_COLORS.badgeGoldBorder}; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px; vertical-align: middle;">TRANSFER</span>`
                          : ""
                      }
                    </td>
                  </tr>
                </table>

                <!-- Linha de Specs em Destaque -->
                ${
                  specs
                    ? `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; font-weight: 700; color: ${EMAIL_COLORS.darkGreenPrimary}; line-height: 1.4; margin-top: 4px; margin-bottom: 6px;">
                        ${escapeHtml(specs)}
                      </div>`
                    : ""
                }

                <!-- Nota / Destaque Opcional -->
                ${
                  athlete.highlightNote && athlete.highlightNote.trim()
                    ? `<div class="highlight-note" style="font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; color: ${EMAIL_COLORS.textMuted}; line-height: 1.4; margin-bottom: 10px; font-style: italic;">
                        ${escapeHtml(athlete.highlightNote.trim())}
                      </div>`
                    : ""
                }

                <!-- 4 Botões de Ação Rápida (Touch Area >= 44px) -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top: 8px;">
                  <tr>
                    <td>
                      <!-- 1. WATCH FILM -->
                      <a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer" class="btn-action btn-watch-film" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 16px; background-color: ${EMAIL_COLORS.goldPrimary}; color: ${EMAIL_COLORS.darkGreenPrimary}; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 900; letter-spacing: 0.6px; text-transform: uppercase; text-decoration: none; border-radius: 24px; text-align: center; margin-right: 6px; margin-bottom: 6px; box-sizing: border-box;">
                        WATCH FILM →
                      </a>

                      <!-- 2. I'M INTERESTED -->
                      <a href="${escapeHtml(interestedMailto)}" class="btn-action btn-interested" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 16px; background-color: ${EMAIL_COLORS.darkGreenPrimary}; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 900; letter-spacing: 0.6px; text-transform: uppercase; text-decoration: none; border-radius: 24px; text-align: center; margin-right: 6px; margin-bottom: 6px; box-sizing: border-box;">
                        I'M INTERESTED
                      </a>

                      <!-- 3. FULL PROFILE -->
                      <a href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer" class="btn-action btn-profile" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 14px; background-color: ${EMAIL_COLORS.buttonSecondaryBg}; color: ${EMAIL_COLORS.darkGreenPrimary}; border: 1px solid ${EMAIL_COLORS.buttonSecondaryBorder}; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; text-decoration: none; border-radius: 24px; text-align: center; margin-right: 6px; margin-bottom: 6px; box-sizing: border-box;">
                        FULL PROFILE
                      </a>

                      <!-- 4. NOT A FIT -->
                      <a href="${escapeHtml(notAFitUrl)}" target="_blank" rel="noopener noreferrer" class="btn-action btn-not-fit" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 8px; background-color: transparent; color: ${EMAIL_COLORS.textMuted}; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 700; text-decoration: underline; text-align: center; margin-bottom: 6px; box-sizing: border-box;">
                        Not a fit
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Renderiza o Header Oficial compacto (logo GTG e linha dourada)
 */
function renderHeader(logoUrl?: string | null): string {
  const logoSrc = logoUrl && logoUrl.trim() ? logoUrl.trim() : EMAIL_ASSETS.logoUrl;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${EMAIL_COLORS.white}; padding: 18px 24px 12px 24px;">
      <tr>
        <td align="left" valign="middle">
          <img src="${escapeHtml(logoSrc)}" alt="Go Team Go Agency" width="130" style="display: block; width: 130px; height: auto; border: 0;" />
        </td>
        <td align="right" valign="middle">
          <span style="font-family: Arial, Helvetica, sans-serif; font-size: 10px; font-weight: 800; color: ${EMAIL_COLORS.darkGreenPrimary}; letter-spacing: 1.5px; text-transform: uppercase;">
            COLLEGE RECRUITING
          </span>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top: 10px;">
          <div style="height: 2px; width: 100%; background-color: ${EMAIL_COLORS.goldLine};"></div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Renderiza a linha de saudação concisa de 1 linha (Hi Coach [Name], [Specs]:)
 */
function renderGreetingLine(text: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${EMAIL_COLORS.white}; padding: 14px 24px 12px 24px;">
      <tr>
        <td>
          <p style="font-family: Arial, Helvetica, sans-serif; font-size: 14.5px; font-weight: 700; color: ${EMAIL_COLORS.textDark}; line-height: 1.4; margin: 0;">
            ${escapeHtml(text)}
          </p>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Bloco institucional compacto no final com padrões verificados e identidade GTG
 */
function renderInstitutionalBlock(customIntro?: string | null): string {
  const defaultText =
    "Go Team Go connects verified international volleyball prospects with top US college programs, ensuring complete academic qualification, highlight analysis, and direct coaching communication.";
  const text = customIntro && customIntro.trim() ? customIntro.trim() : defaultText;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 8px; margin-bottom: 16px; background-color: ${EMAIL_COLORS.cardBg}; border: 1px solid ${EMAIL_COLORS.cardBorder}; border-radius: 12px; padding: 18px 20px;">
      <tr>
        <td>
          <div style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: ${EMAIL_COLORS.darkGreenPrimary}; margin-bottom: 6px;">
            About Go Team Go Agency
          </div>
          <div style="font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; color: ${EMAIL_COLORS.textDark}; line-height: 1.5; margin-bottom: 12px;">
            ${escapeHtml(text)}
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid ${EMAIL_COLORS.cardBorder}; padding-top: 10px;">
            <tr>
              <td valign="top" style="font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; color: ${EMAIL_COLORS.textMuted}; line-height: 1.4;">
                <strong style="color: ${EMAIL_COLORS.darkGreenPrimary};">Verified Standards:</strong> Official Match Film &bull; Verified Academic Transcripts (GPA) &bull; Direct Athlete Scouting
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Renderiza o e-mail completo para um atleta individual (Single Mode)
 */
export function renderSingleAthleteRecruitEmail(options: RecruitEmailRenderOptions): {
  subject: string;
  preheader: string;
  html: string;
} {
  const athlete = options.athlete || (options.athletes && options.athletes[0]);
  if (!athlete) {
    throw new Error("renderSingleAthleteRecruitEmail requires an athlete object.");
  }

  const coachName = options.coachName ? options.coachName.replace(/^Coach\s+/i, "").trim() : "";
  const coachGreeting = coachName ? `Coach ${coachName}` : "Coach";
  const sport = options.sportName ? options.sportName.trim() : "volleyball";
  const gradYear = athlete.graduationYear ? `Class of ${athlete.graduationYear}` : "";
  const country = athlete.countryEn ? `(${athlete.countryEn})` : "";

  // Assunto com specs no início
  const specParts = [
    athlete.positionEn,
    athlete.heightCm
      ? `${cmToFeetAndInches(athlete.heightCm)?.feet}'${cmToFeetAndInches(athlete.heightCm)?.inches}"`
      : null,
    gradYear,
  ].filter(Boolean);
  const subjectPrefix = specParts.join(" · ");
  const subject = `${subjectPrefix}: ${athlete.name} ${country}`.trim();
  const preheader = `Verified prospect ${athlete.name} — ${buildAthleteSpecsLine(athlete)}`;

  const greetingLine = options.greetingText
    ? options.greetingText
    : `Hi ${coachGreeting}, verified ${sport} prospect${gradYear ? `, ${gradYear}` : ""}:`;

  const athleteCardHtml = renderAthleteCard(athlete, {
    appUrl: options.appUrl || EMAIL_BASE_URL,
    coachName,
    coachEmail: options.coachEmail,
    feedbackToken: options.feedbackToken,
    campaignId: options.campaignId,
  });

  const bodyContentHtml = `
    <!-- Top Lean Header -->
    <tr>
      <td style="padding: 0;">
        ${renderHeader(options.agencyLogoUrl)}
      </td>
    </tr>

    <!-- 1-Line Greeting -->
    <tr>
      <td style="padding: 0;">
        ${renderGreetingLine(greetingLine)}
      </td>
    </tr>

    <!-- ATHLETES FIRST: Athlete Spotlight Card -->
    <tr>
      <td style="padding: 4px 24px 8px 24px; background-color: ${EMAIL_COLORS.white};">
        ${athleteCardHtml}
      </td>
    </tr>

    <!-- Institutional Block (Compact at the end) -->
    <tr>
      <td style="padding: 0 24px 12px 24px; background-color: ${EMAIL_COLORS.white};">
        ${renderInstitutionalBlock(options.introductionText)}
      </td>
    </tr>

    <!-- CTA Bar: Request More Athletes -->
    ${renderRequestCtaBar({
      sportText: options.sportName || "Volleyball",
      coachName: coachName || "Coach",
    })}

    <!-- Signature Block -->
    ${renderSignature({ logoUrl: options.agencyLogoUrl })}

    <!-- Feedback Block -->
    ${renderFeedbackBlock({
      recipientEmail: options.coachEmail,
      athleteId: athlete.id,
      position: athlete.positionEn,
    })}

    <!-- Bottom Bar (2/3 Green + 1/3 Gold) -->
    ${renderBottomBar()}

    <!-- Legal Footer -->
    ${renderLegalFooter({ recipientEmail: options.coachEmail })}
  `;

  const html = renderEmailShell({
    title: subject,
    preheader,
    bodyContentHtml,
  });

  return { subject, preheader, html };
}

/**
 * Renderiza o e-mail completo para múltiplos atletas (Multi-Athlete Stacked Rows)
 */
export function renderMultiAthleteRecruitEmail(options: RecruitEmailRenderOptions): {
  subject: string;
  preheader: string;
  html: string;
} {
  const athletes = options.athletes || (options.athlete ? [options.athlete] : []);
  if (athletes.length === 0) {
    throw new Error("renderMultiAthleteRecruitEmail requires an array of athletes.");
  }

  const coachName = options.coachName ? options.coachName.replace(/^Coach\s+/i, "").trim() : "";
  const coachGreeting = coachName ? `Coach ${coachName}` : "Coach";
  const sport = options.sportName ? options.sportName.trim() : "volleyball";
  const gradYear = options.gradYear ? `Class of ${options.gradYear}` : "Class of 2027";

  const count = athletes.length;
  const subject = `${count} verified ${sport} prospects, ${gradYear}`;
  const firstNames = athletes
    .slice(0, 3)
    .map((a) => a.name)
    .join(", ");
  const preheader = `Review ${count} collegiate prospects: ${firstNames}`;

  const greetingLine = options.greetingText
    ? options.greetingText
    : `Hi ${coachGreeting}, ${count} verified ${sport} prospects, ${gradYear}:`;

  const cardsHtml = athletes
    .map((ath) =>
      renderAthleteCard(ath, {
        appUrl: options.appUrl || EMAIL_BASE_URL,
        coachName,
        coachEmail: options.coachEmail,
        feedbackToken: options.feedbackToken,
        campaignId: options.campaignId,
      }),
    )
    .join("");

  const bodyContentHtml = `
    <!-- Top Lean Header -->
    <tr>
      <td style="padding: 0;">
        ${renderHeader(options.agencyLogoUrl)}
      </td>
    </tr>

    <!-- 1-Line Greeting -->
    <tr>
      <td style="padding: 0;">
        ${renderGreetingLine(greetingLine)}
      </td>
    </tr>

    <!-- ATHLETES FIRST: Full-Width Stacked Cards -->
    <tr>
      <td style="padding: 4px 24px 8px 24px; background-color: ${EMAIL_COLORS.white};">
        ${cardsHtml}
      </td>
    </tr>

    <!-- Institutional Block (Compact at the end) -->
    <tr>
      <td style="padding: 0 24px 12px 24px; background-color: ${EMAIL_COLORS.white};">
        ${renderInstitutionalBlock(options.introductionText)}
      </td>
    </tr>

    <!-- CTA Bar: Request More Athletes -->
    ${renderRequestCtaBar({
      sportText: options.sportName || "Volleyball",
      coachName: coachName || "Coach",
    })}

    <!-- Signature Block -->
    ${renderSignature({ logoUrl: options.agencyLogoUrl })}

    <!-- Feedback Block -->
    ${renderFeedbackBlock({
      recipientEmail: options.coachEmail,
      athleteId: athletes[0]?.id,
    })}

    <!-- Bottom Bar (2/3 Green + 1/3 Gold) -->
    ${renderBottomBar()}

    <!-- Legal Footer -->
    ${renderLegalFooter({ recipientEmail: options.coachEmail })}
  `;

  const html = renderEmailShell({
    title: subject,
    preheader,
    bodyContentHtml,
  });

  return { subject, preheader, html };
}

/**
 * Renderiza o e-mail no formato Catálogo / Portfólio Geral
 */
export function renderCatalogRecruitEmail(options: RecruitEmailRenderOptions): {
  subject: string;
  preheader: string;
  html: string;
} {
  const coachName = options.coachName ? options.coachName.replace(/^Coach\s+/i, "").trim() : "";
  const coachGreeting = coachName ? `Coach ${coachName}` : "Coach";
  const sport = options.sportName ? options.sportName.trim() : "volleyball";
  const baseUrl = options.appUrl || EMAIL_BASE_URL;

  const subject = "Go Team Go — Active US College Recruiting Portfolio";
  const preheader = "Explore our active verified international college prospects roster.";

  const greetingLine = options.greetingText
    ? options.greetingText
    : `Hi ${coachGreeting}, explore our full active ${sport} recruiting portfolio:`;

  const portfolioCatalogUrl = appendMailerUtmParams(baseUrl, {
    appUrl: baseUrl,
    campaignId: options.campaignId,
    content: "view_portfolio_catalog",
  });
  const requestByPositionMailto = `mailto:${EMAIL_SIGNATURE.email}?subject=${encodeURIComponent("[Go Team Go] Position Roster Inquiry")}&body=${encodeURIComponent(`Hi ${EMAIL_SIGNATURE.name},\n\nI am looking for prospects in the following positions for our program:\n- Position(s):\n- Class Year:\n\nBest regards,\n${coachGreeting}`)}`;

  const quickActionsHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;">
      <tr>
        <td align="center" style="padding: 20px 18px; background-color: ${EMAIL_COLORS.cardBg}; border: 1px solid ${EMAIL_COLORS.cardBorder}; border-radius: 12px;">
          <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 800; color: ${EMAIL_COLORS.textDark}; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.8px;">
            Full International Prospect Database
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <a href="${escapeHtml(portfolioCatalogUrl)}" target="_blank" rel="noopener noreferrer" class="btn-action" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 20px; background-color: ${EMAIL_COLORS.goldPrimary}; color: ${EMAIL_COLORS.darkGreenPrimary}; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase; text-decoration: none; border-radius: 24px; text-align: center; margin-right: 8px; margin-bottom: 6px; box-sizing: border-box;">
                  VIEW FULL PORTFOLIO →
                </a>
                <a href="${escapeHtml(requestByPositionMailto)}" class="btn-action" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 18px; background-color: ${EMAIL_COLORS.darkGreenPrimary}; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase; text-decoration: none; border-radius: 24px; text-align: center; margin-bottom: 6px; box-sizing: border-box;">
                  REQUEST BY POSITION
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const bodyContentHtml = `
    <!-- Top Lean Header -->
    <tr>
      <td style="padding: 0;">
        ${renderHeader(options.agencyLogoUrl)}
      </td>
    </tr>

    <!-- 1-Line Greeting -->
    <tr>
      <td style="padding: 0;">
        ${renderGreetingLine(greetingLine)}
      </td>
    </tr>

    <!-- Quick Action Buttons First -->
    <tr>
      <td style="padding: 4px 24px 8px 24px; background-color: ${EMAIL_COLORS.white};">
        ${quickActionsHtml}
      </td>
    </tr>

    <!-- Institutional Block (Compact at the end) -->
    <tr>
      <td style="padding: 0 24px 12px 24px; background-color: ${EMAIL_COLORS.white};">
        ${renderInstitutionalBlock(options.introductionText)}
      </td>
    </tr>

    <!-- Signature Block -->
    ${renderSignature({ logoUrl: options.agencyLogoUrl })}

    <!-- Bottom Bar (2/3 Green + 1/3 Gold) -->
    ${renderBottomBar()}

    <!-- Legal Footer -->
    ${renderLegalFooter({ recipientEmail: options.coachEmail })}
  `;

  const html = renderEmailShell({
    title: subject,
    preheader,
    bodyContentHtml,
  });

  return { subject, preheader, html };
}

/**
 * Gera a versão em texto puro (Body.Text) do e-mail unitário (Specs e links primeiro).
 */
export function generateRecruitEmailPlainText(options: RecruitEmailRenderOptions): string {
  const athlete = options.athlete || (options.athletes && options.athletes[0]);
  if (!athlete) return "";

  const coachName = options.coachName ? options.coachName.replace(/^Coach\s+/i, "").trim() : "";
  const coachGreeting = coachName ? `Coach ${coachName}` : "Coach";
  const baseUrl = options.appUrl || EMAIL_BASE_URL;
  const profileUrl = athlete.profileUrl || `${baseUrl}/athlete/${encodeURIComponent(athlete.slug)}`;
  const videoUrl = athlete.highlightVideoUrl || profileUrl;
  const notAFitUrl = buildNotAFitUrl(athlete.id, {
    appUrl: baseUrl,
    coachEmail: options.coachEmail,
    feedbackToken: options.feedbackToken,
  });

  const lines = [
    `Hi ${coachGreeting},`,
    "",
    `PROSPECT: ${athlete.name}`,
    `SPECS: ${buildAthleteSpecsLine(athlete)}`,
    athlete.highlightNote ? `NOTE: ${athlete.highlightNote}` : null,
    "",
    `WATCH FILM: ${videoUrl}`,
    `FULL PROFILE: ${profileUrl}`,
    `NOT A FIT: ${notAFitUrl}`,
    "",
    "ABOUT GO TEAM GO AGENCY",
    options.introductionText ||
      "Go Team Go connects verified international prospects with US college programs.",
    "",
    "---",
    `${EMAIL_SIGNATURE.name}`,
    `${EMAIL_SIGNATURE.role}`,
    `${EMAIL_SIGNATURE.email} | ${EMAIL_SIGNATURE.website}`,
    "",
    `Unsubscribe: ${baseUrl}/unsubscribe?email=${encodeURIComponent(options.coachEmail || "")}`,
  ].filter((item): item is string => item !== null);

  return lines.join("\n");
}

/**
 * Gera a versão em texto puro (Body.Text) do e-mail multi-atleta.
 */
export function generateMultiAthletePlainText(options: RecruitEmailRenderOptions): string {
  const athletes = options.athletes || (options.athlete ? [options.athlete] : []);
  const coachName = options.coachName ? options.coachName.replace(/^Coach\s+/i, "").trim() : "";
  const coachGreeting = coachName ? `Coach ${coachName}` : "Coach";
  const baseUrl = options.appUrl || EMAIL_BASE_URL;

  const athleteLines = athletes.map((ath, i) => {
    const profileUrl = ath.profileUrl || `${baseUrl}/athlete/${encodeURIComponent(ath.slug)}`;
    const videoUrl = ath.highlightVideoUrl || profileUrl;
    return [
      `${i + 1}. ${ath.name}`,
      `   Specs: ${buildAthleteSpecsLine(ath)}`,
      `   Film: ${videoUrl}`,
      `   Profile: ${profileUrl}`,
    ].join("\n");
  });

  const lines = [
    `Hi ${coachGreeting},`,
    "",
    `${athletes.length} VERIFIED PROSPECTS:`,
    "",
    athleteLines.join("\n\n"),
    "",
    `REQUEST MORE ATHLETES: mailto:${EMAIL_SIGNATURE.email}`,
    "",
    "ABOUT GO TEAM GO AGENCY",
    options.introductionText ||
      "Go Team Go connects verified international prospects with US college programs.",
    "",
    "---",
    `${EMAIL_SIGNATURE.name}`,
    `${EMAIL_SIGNATURE.role}`,
    `${EMAIL_SIGNATURE.email} | ${EMAIL_SIGNATURE.website}`,
    "",
    `Unsubscribe: ${baseUrl}/unsubscribe?email=${encodeURIComponent(options.coachEmail || "")}`,
  ];

  return lines.join("\n");
}

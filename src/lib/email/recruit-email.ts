import { cmToFeetAndInches, formatGpa } from "@/lib/units";
import { EMAIL_BRAND, EMAIL_SIGNATURE, escapeHtml, getBaseAppUrl } from "./email-brand";

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
}

/**
 * Constrói a linha de specs resumida no padrão:
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
 * Regra: Exibir exclusivamente para Freshman, Sophomore, Junior ou Senior.
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
  const baseUrl = options.appUrl || getBaseAppUrl();
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
  } = {},
): string {
  const baseUrl = options.appUrl || getBaseAppUrl();
  const profileUrl = athlete.profileUrl || `${baseUrl}/athlete/${encodeURIComponent(athlete.slug)}`;
  const videoUrl =
    athlete.highlightVideoUrl && athlete.highlightVideoUrl.trim()
      ? athlete.highlightVideoUrl.trim()
      : profileUrl;
  const interestedMailto = buildInterestedMailtoUrl(athlete, options.coachName);
  const notAFitUrl = buildNotAFitUrl(athlete.id, options);

  const specs = buildAthleteSpecsLine(athlete);
  const showTransferBadge = isTransferEligible(athlete.athleteStatus);
  const photoUrl =
    athlete.photoUrl && athlete.photoUrl.trim()
      ? athlete.photoUrl.trim()
      : `${baseUrl}/favicon.ico`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px; background-color: ${EMAIL_BRAND.colors.cardBackground}; border: 1px solid ${EMAIL_BRAND.colors.border}; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
      <tr>
        <td style="padding: 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <!-- Foto do Atleta (Esquerda no desktop) -->
              <td class="stack-column athlete-photo-cell" width="110" valign="top" style="padding-right: 18px;">
                <a href="${escapeHtml(profileUrl)}" target="_blank" style="text-decoration: none; display: block;">
                  <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(athlete.name)}" width="110" height="138" style="display: block; width: 110px; height: 138px; object-fit: cover; border-radius: 8px; border: 1px solid ${EMAIL_BRAND.colors.borderLight}; background-color: #e2e8f0;" />
                </a>
              </td>

              <!-- Dados e Ações (Direita no desktop) -->
              <td class="stack-column athlete-info-cell" valign="top">
                <!-- Nome e Badge -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <a href="${escapeHtml(profileUrl)}" target="_blank" style="text-decoration: none; font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 20px; font-weight: 700; color: ${EMAIL_BRAND.colors.textPrimary}; line-height: 1.25;">
                        ${escapeHtml(athlete.name)}
                      </a>
                      ${
                        showTransferBadge
                          ? `<span style="display: inline-block; padding: 2px 8px; font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 11px; font-weight: 700; color: ${EMAIL_BRAND.colors.goldText}; background-color: ${EMAIL_BRAND.colors.goldLight}; border: 1px solid #fde68a; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; margin-left: 8px; vertical-align: middle;">TRANSFER</span>`
                          : ""
                      }
                    </td>
                  </tr>
                </table>

                <!-- Linha de Specs em Destaque -->
                ${
                  specs
                    ? `<div style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 13px; font-weight: 600; color: ${EMAIL_BRAND.colors.primaryDark}; line-height: 1.4; margin-top: 6px; margin-bottom: 6px;">
                        ${escapeHtml(specs)}
                      </div>`
                    : ""
                }

                <!-- Destaque / Conquista Opcional (Máx 1 linha) -->
                ${
                  athlete.highlightNote && athlete.highlightNote.trim()
                    ? `<div style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 12px; color: ${EMAIL_BRAND.colors.textSecondary}; line-height: 1.4; margin-bottom: 12px; font-style: italic;">
                        "${escapeHtml(athlete.highlightNote.trim())}"
                      </div>`
                    : '<div style="margin-bottom: 10px;"></div>'
                }

                <!-- Botões de Ação Rápida (44px min-height) -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 10px;">
                  <tr>
                    <td class="action-buttons-wrap" style="padding-top: 4px;">
                      <!-- WATCH FILM (Primário) -->
                      <a href="${escapeHtml(videoUrl)}" target="_blank" class="btn-action btn-watch-film" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 16px; background-color: ${EMAIL_BRAND.colors.primary}; color: #ffffff; font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 8px; text-align: center; margin-right: 6px; margin-bottom: 6px; box-sizing: border-box;">
                        ▶ WATCH FILM
                      </a>

                      <!-- I'M INTERESTED (Recrutar / Mailto) -->
                      <a href="${escapeHtml(interestedMailto)}" class="btn-action btn-interested" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 16px; background-color: ${EMAIL_BRAND.colors.dark}; color: #ffffff; font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 8px; text-align: center; margin-right: 6px; margin-bottom: 6px; box-sizing: border-box;">
                        ★ I'M INTERESTED
                      </a>

                      <!-- FULL PROFILE -->
                      <a href="${escapeHtml(profileUrl)}" target="_blank" class="btn-action btn-profile" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 14px; background-color: #f1f5f9; color: #1e293b; border: 1px solid ${EMAIL_BRAND.colors.border}; font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 12px; font-weight: 600; text-decoration: none; border-radius: 8px; text-align: center; margin-right: 6px; margin-bottom: 6px; box-sizing: border-box;">
                        FULL PROFILE
                      </a>

                      <!-- NOT A FIT (Discreto) -->
                      <a href="${escapeHtml(notAFitUrl)}" target="_blank" class="btn-action btn-not-fit" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 10px; background-color: transparent; color: ${EMAIL_BRAND.colors.textMuted}; font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 11px; font-weight: 500; text-decoration: underline; border-radius: 6px; text-align: center; margin-bottom: 6px; box-sizing: border-box;">
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
 * Renderiza o Header enxuto (apenas a logo centralizada)
 */
function renderHeader(logoUrl?: string | null): string {
  const logo = logoUrl && logoUrl.trim() ? logoUrl.trim() : null;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding: 24px 0 16px;">
      <tr>
        <td align="center">
          ${
            logo
              ? `<img src="${escapeHtml(logo)}" alt="Go Team Go" height="38" style="display: block; height: 38px; max-width: 200px; width: auto; object-fit: contain;" />`
              : `<span style="font-family: ${EMAIL_BRAND.typography.fontDisplay}; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: ${EMAIL_BRAND.colors.dark};">GO TEAM GO</span>`
          }
        </td>
      </tr>
    </table>
  `;
}

/**
 * Renderiza a saudação de 1 linha no topo
 */
function renderGreeting(text: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
      <tr>
        <td>
          <p style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 16px; font-weight: 600; color: ${EMAIL_BRAND.colors.textPrimary}; line-height: 1.4; margin: 0;">
            ${escapeHtml(text)}
          </p>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Renderiza o botão CTA "REQUEST MORE ATHLETES" logo abaixo das atletas
 */
function renderRequestMoreCta(): string {
  const mailtoUrl = `mailto:${EMAIL_SIGNATURE.email}?subject=${encodeURIComponent(
    "Request more athlete prospects - Go Team Go",
  )}&body=${encodeURIComponent(
    "Hi Go Team Go Team,\n\nI would like to request more prospects for the following positions/classes:\n- Sport/Position:\n- Graduation Year:\n- Budget/Scholarship Range:\n\nBest regards,\nCoach",
  )}`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 16px 0 28px;">
      <tr>
        <td align="center" style="padding: 16px; background-color: #f1f5f9; border: 1px dashed ${EMAIL_BRAND.colors.border}; border-radius: 10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center">
                <span style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 13px; color: ${EMAIL_BRAND.colors.textSecondary}; font-weight: 500; display: block; margin-bottom: 8px;">
                  Looking for specific positions, heights, or graduation years?
                </span>
                <a href="${escapeHtml(mailtoUrl)}" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 24px; background-color: ${EMAIL_BRAND.colors.dark}; color: #ffffff; font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 8px; text-align: center;">
                  REQUEST MORE ATHLETES
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Renderiza o Bloco Institucional Compacto (Hero + Intro condensados no FINAL do e-mail)
 */
function renderInstitutionalBlock(customIntro?: string | null): string {
  const introText =
    customIntro && customIntro.trim()
      ? customIntro.trim()
      : "Go Team Go connects verified international volleyball prospects with top US college programs, ensuring complete athletic and academic qualification.";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; background-color: #f8fafc; border: 1px solid ${EMAIL_BRAND.colors.border}; border-radius: 10px; padding: 18px 20px;">
      <tr>
        <td>
          <div style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${EMAIL_BRAND.colors.primaryDark}; margin-bottom: 6px;">
            About Go Team Go Agency
          </div>
          <div style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 13px; color: ${EMAIL_BRAND.colors.textSecondary}; line-height: 1.5; margin-bottom: 10px;">
            ${escapeHtml(introText)}
          </div>
          <div style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 12px; color: ${EMAIL_BRAND.colors.textMuted}; line-height: 1.4; border-top: 1px solid ${EMAIL_BRAND.colors.borderLight}; padding-top: 8px;">
            <strong style="color: ${EMAIL_BRAND.colors.dark};">Verified Standards:</strong> Official Match Film & Stats &bull; Verified Academic Transcripts (GPA) &bull; Direct Agency Scouting
          </div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Renderiza a assinatura oficial, feedback geral e rodapé legal/unsubscribe
 */
function renderFooter(options: {
  appUrl?: string;
  coachEmail?: string;
  unsubscribeToken?: string;
}): string {
  const baseUrl = options.appUrl || getBaseAppUrl();
  const coachParam = options.coachEmail ? encodeURIComponent(options.coachEmail) : "";
  const tokenParam = options.unsubscribeToken ? encodeURIComponent(options.unsubscribeToken) : "";
  const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${coachParam}&token=${tokenParam}`;

  return `
    <!-- Assinatura Oficial -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 16px; border-top: 1px solid ${EMAIL_BRAND.colors.border}; padding-top: 20px;">
      <tr>
        <td>
          <div style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 14px; font-weight: 700; color: ${EMAIL_BRAND.colors.textPrimary}; margin-bottom: 2px;">
            ${EMAIL_SIGNATURE.name}
          </div>
          <div style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 12px; color: ${EMAIL_BRAND.colors.textSecondary}; margin-bottom: 6px;">
            ${EMAIL_SIGNATURE.role} &bull; ${EMAIL_SIGNATURE.agency}
          </div>
          <div style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 12px; color: ${EMAIL_BRAND.colors.primaryDark};">
            <a href="mailto:${EMAIL_SIGNATURE.email}" style="color: ${EMAIL_BRAND.colors.primaryDark}; text-decoration: none; font-weight: 600;">${EMAIL_SIGNATURE.email}</a>
            &bull;
            <a href="${EMAIL_SIGNATURE.website}" target="_blank" style="color: ${EMAIL_BRAND.colors.primaryDark}; text-decoration: none; font-weight: 600;">${EMAIL_SIGNATURE.website.replace("https://", "")}</a>
          </div>
        </td>
      </tr>
    </table>

    <!-- Rodapé Legal e Unsubscribe -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px; padding: 16px 0 32px; text-align: center;">
      <tr>
        <td align="center">
          <p style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 11px; color: ${EMAIL_BRAND.colors.textMuted}; line-height: 1.5; margin: 0 0 8px;">
            You received this scouting report because you are a verified college coach or recruiting coordinator.
          </p>
          <p style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 11px; color: ${EMAIL_BRAND.colors.textMuted}; margin: 0;">
            <a href="${escapeHtml(unsubscribeUrl)}" target="_blank" style="color: ${EMAIL_BRAND.colors.textMuted}; text-decoration: underline;">
              Unsubscribe or manage preferences
            </a>
          </p>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Envelope HTML global compatível com todos os clientes de e-mail
 */
function wrapHtmlEmail(title: string, preheader: string, content: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(title)}</title>
  <style type="text/css">
    /* Resets */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #f1f5f9; }

    /* Mobile Responsive */
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .stack-column { display: block !important; width: 100% !important; box-sizing: border-box !important; }
      .athlete-photo-cell { padding-right: 0 !important; padding-bottom: 14px !important; text-align: center !important; }
      .athlete-photo-cell img { margin: 0 auto !important; width: 120px !important; height: 150px !important; }
      .athlete-info-cell { padding-left: 0 !important; }
      .btn-action { display: block !important; width: 100% !important; margin-right: 0 !important; margin-bottom: 8px !important; }
      .action-buttons-wrap { padding-top: 8px !important; }
    }
  </style>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, span, a { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: ${EMAIL_BRAND.typography.fontFamily}; color: ${EMAIL_BRAND.colors.textPrimary};">
  <!-- Preheader oculto para visualização rápida na caixa de entrada -->
  <div style="display: none; font-size: 1px; color: #f1f5f9; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${escapeHtml(preheader)}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 12px 8px;">
    <tr>
      <td align="center">
        <!-- Container Principal 680px -->
        <table role="presentation" class="email-container" width="680" cellpadding="0" cellspacing="0" border="0" style="width: 680px; max-width: 680px; background-color: ${EMAIL_BRAND.colors.background}; border: 1px solid ${EMAIL_BRAND.colors.border}; border-radius: 16px; padding: 0 28px; box-sizing: border-box;">
          <tr>
            <td>
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * =========================================================================
 * 1. MODO SINGLE ATHLETE
 * =========================================================================
 */
export function renderSingleAthleteRecruitEmail(options: RecruitEmailRenderOptions): {
  subject: string;
  html: string;
  preheader: string;
} {
  const athlete = options.athlete || (options.athletes && options.athletes[0]);
  if (!athlete) {
    throw new Error("renderSingleAthleteRecruitEmail requires an athlete");
  }

  const coach = options.coachName ? options.coachName.trim() : "Coach";
  const position = athlete.positionEn ? athlete.positionEn.trim() : "Prospect";
  const height = athlete.heightCm ? cmToFeetAndInches(athlete.heightCm) : null;
  const heightStr = height ? `${height.feet}'${height.inches}"` : "";
  const gradYear = athlete.graduationYear ? `Class of ${athlete.graduationYear}` : "";
  const country = athlete.countryEn ? athlete.countryEn.trim() : "";

  // Assunto com specs na frente
  const subjectParts = [position, heightStr, gradYear].filter(Boolean).join(" · ");
  const subject = `${subjectParts ? `${subjectParts}: ` : ""}${athlete.name}${country ? ` (${country})` : ""}`;

  // Preheader com specs completas
  const preheader = buildAthleteSpecsLine(athlete);

  // Saudação de 1 linha
  const greeting =
    options.greetingText && options.greetingText.trim()
      ? options.greetingText.trim()
      : `Hi Coach ${coach}, verified ${options.sportName || "volleyball"} prospect, ${gradYear || "available for recruitment"}:`;

  const athleteCardHtml = renderAthleteCard(athlete, {
    appUrl: options.appUrl,
    coachName: options.coachName,
    coachEmail: options.coachEmail,
    feedbackToken: options.feedbackToken,
  });

  const content = `
    ${renderHeader(options.agencyLogoUrl)}
    ${renderGreeting(greeting)}
    ${athleteCardHtml}
    ${renderRequestMoreCta()}
    ${renderInstitutionalBlock(options.introductionText)}
    ${renderFooter({
      appUrl: options.appUrl,
      coachEmail: options.coachEmail,
      unsubscribeToken: options.unsubscribeToken,
    })}
  `;

  return {
    subject,
    preheader,
    html: wrapHtmlEmail(subject, preheader, content),
  };
}

/**
 * =========================================================================
 * 2. MODO MULTI ATHLETE (1 Atleta por linha em largura total)
 * =========================================================================
 */
export function renderMultiAthleteRecruitEmail(options: RecruitEmailRenderOptions): {
  subject: string;
  html: string;
  preheader: string;
} {
  const athletes = options.athletes || (options.athlete ? [options.athlete] : []);
  if (!athletes.length) {
    throw new Error("renderMultiAthleteRecruitEmail requires at least one athlete");
  }

  const coach = options.coachName ? options.coachName.trim() : "Coach";
  const count = athletes.length;
  const sport = options.sportName || "volleyball";
  const yearStr = options.gradYear ? `Class of ${options.gradYear}` : "Recruiting Class";

  // Assunto escaneável
  const subject = `${count} verified ${sport} prospects, ${yearStr}`;

  // Preheader com specs das primeiras atletas
  const preheader = athletes
    .slice(0, 2)
    .map((a) => `${a.name} (${buildAthleteSpecsLine(a)})`)
    .join(" | ");

  // Saudação de 1 linha
  const greeting =
    options.greetingText && options.greetingText.trim()
      ? options.greetingText.trim()
      : `Hi Coach ${coach}, ${count} verified ${sport} prospects, ${yearStr}:`;

  // Renderiza cada atleta em largura total (1 por linha)
  const athleteCardsHtml = athletes
    .map((a) =>
      renderAthleteCard(a, {
        appUrl: options.appUrl,
        coachName: options.coachName,
        coachEmail: options.coachEmail,
        feedbackToken: options.feedbackToken,
      }),
    )
    .join("\n");

  const content = `
    ${renderHeader(options.agencyLogoUrl)}
    ${renderGreeting(greeting)}
    ${athleteCardsHtml}
    ${renderRequestMoreCta()}
    ${renderInstitutionalBlock(options.introductionText)}
    ${renderFooter({
      appUrl: options.appUrl,
      coachEmail: options.coachEmail,
      unsubscribeToken: options.unsubscribeToken,
    })}
  `;

  return {
    subject,
    preheader,
    html: wrapHtmlEmail(subject, preheader, content),
  };
}

/**
 * =========================================================================
 * 3. MODO CATALOG (Sem atletas individuais)
 * =========================================================================
 */
export function renderCatalogRecruitEmail(options: RecruitEmailRenderOptions): {
  subject: string;
  html: string;
  preheader: string;
} {
  const coach = options.coachName ? options.coachName.trim() : "Coach";
  const baseUrl = options.appUrl || getBaseAppUrl();
  const subject = "Go Team Go — Active US College Recruiting Portfolio & Prospects";
  const preheader =
    "Explore our full active roster of verified international volleyball prospects and request film.";

  const greeting =
    options.greetingText && options.greetingText.trim()
      ? options.greetingText.trim()
      : `Hi Coach ${coach}, explore our full active volleyball recruiting portfolio:`;

  const requestByPositionMailto = `mailto:${EMAIL_SIGNATURE.email}?subject=${encodeURIComponent(
    "Request athletes by position - Go Team Go",
  )}&body=${encodeURIComponent(
    "Hi Go Team Go Team,\n\nI am looking for prospects in the following positions:\n\n- Position:\n- Class Year:\n- Scholarship Available:\n\nBest regards,\nCoach",
  )}`;

  const quickActionButtons = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td align="center" style="padding: 24px 20px; background-color: ${EMAIL_BRAND.colors.cardBackground}; border: 1px solid ${EMAIL_BRAND.colors.border}; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
          <div style="font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 14px; font-weight: 600; color: ${EMAIL_BRAND.colors.textPrimary}; margin-bottom: 16px;">
            Quick Actions for College Coaches
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="stack-column" align="center" style="padding: 0 6px 8px;">
                <a href="${escapeHtml(baseUrl)}" target="_blank" class="btn-action" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 24px; background-color: ${EMAIL_BRAND.colors.primary}; color: #ffffff; font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 8px; text-align: center;">
                  VIEW FULL PORTFOLIO →
                </a>
              </td>
              <td class="stack-column" align="center" style="padding: 0 6px 8px;">
                <a href="${escapeHtml(requestByPositionMailto)}" class="btn-action" style="display: inline-block; min-height: 44px; line-height: 44px; padding: 0 20px; background-color: ${EMAIL_BRAND.colors.dark}; color: #ffffff; font-family: ${EMAIL_BRAND.typography.fontFamily}; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 8px; text-align: center;">
                  REQUEST BY POSITION
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const content = `
    ${renderHeader(options.agencyLogoUrl)}
    ${renderGreeting(greeting)}
    ${quickActionButtons}
    ${renderInstitutionalBlock(options.introductionText)}
    ${renderFooter({
      appUrl: options.appUrl,
      coachEmail: options.coachEmail,
      unsubscribeToken: options.unsubscribeToken,
    })}
  `;

  return {
    subject,
    preheader,
    html: wrapHtmlEmail(subject, preheader, content),
  };
}

/**
 * =========================================================================
 * VERSÕES EM TEXTO PURO (PLAIN TEXT)
 * =========================================================================
 */
export function generateRecruitEmailPlainText(options: RecruitEmailRenderOptions): string {
  const athlete = options.athlete || (options.athletes && options.athletes[0]);
  if (!athlete) return "";

  const coach = options.coachName ? options.coachName.trim() : "Coach";
  const baseUrl = options.appUrl || getBaseAppUrl();
  const profileUrl = athlete.profileUrl || `${baseUrl}/athlete/${encodeURIComponent(athlete.slug)}`;
  const videoUrl = athlete.highlightVideoUrl || profileUrl;
  const specs = buildAthleteSpecsLine(athlete);

  const lines = [
    `Hi Coach ${coach},`,
    "",
    `PROSPECT: ${athlete.name}`,
    `SPECS: ${specs}`,
    showTransferBadge(athlete) ? "STATUS: TRANSFER" : "",
    athlete.highlightNote ? `NOTE: "${athlete.highlightNote}"` : "",
    "",
    `WATCH FILM: ${videoUrl}`,
    `FULL PROFILE: ${profileUrl}`,
    `I'M INTERESTED: Reply directly to this email or contact ${EMAIL_SIGNATURE.email}`,
    `NOT A FIT: ${buildNotAFitUrl(athlete.id, options)}`,
    "",
    "---",
    "ABOUT GO TEAM GO AGENCY",
    options.introductionText ||
      "Go Team Go connects verified international volleyball prospects with US college programs.",
    "",
    `${EMAIL_SIGNATURE.name}`,
    `${EMAIL_SIGNATURE.role} - ${EMAIL_SIGNATURE.agency}`,
    `${EMAIL_SIGNATURE.email} | ${EMAIL_SIGNATURE.website}`,
    "",
    `Unsubscribe: ${baseUrl}/unsubscribe?email=${options.coachEmail || ""}`,
  ];

  return lines.filter((l) => l !== "").join("\n");
}

export function generateMultiAthletePlainText(options: RecruitEmailRenderOptions): string {
  const athletes = options.athletes || (options.athlete ? [options.athlete] : []);
  const coach = options.coachName ? options.coachName.trim() : "Coach";
  const baseUrl = options.appUrl || getBaseAppUrl();

  const lines = [`Hi Coach ${coach},`, "", `${athletes.length} VERIFIED PROSPECTS:`, ""];

  athletes.forEach((a, i) => {
    const profileUrl = a.profileUrl || `${baseUrl}/athlete/${encodeURIComponent(a.slug)}`;
    const videoUrl = a.highlightVideoUrl || profileUrl;
    lines.push(`${i + 1}. ${a.name}`);
    lines.push(`   Specs: ${buildAthleteSpecsLine(a)}`);
    if (showTransferBadge(a)) lines.push("   Status: TRANSFER");
    if (a.highlightNote) lines.push(`   Note: "${a.highlightNote}"`);
    lines.push(`   Watch Film: ${videoUrl}`);
    lines.push(`   Full Profile: ${profileUrl}`);
    lines.push(`   Not a Fit: ${buildNotAFitUrl(a.id, options)}`);
    lines.push("");
  });

  lines.push("REQUEST MORE ATHLETES: Reply to this email with your recruiting needs.");
  lines.push("");
  lines.push("---");
  lines.push("ABOUT GO TEAM GO AGENCY");
  lines.push(
    options.introductionText ||
      "Go Team Go connects verified international volleyball prospects with US college programs.",
  );
  lines.push("");
  lines.push(`${EMAIL_SIGNATURE.name}`);
  lines.push(`${EMAIL_SIGNATURE.role} - ${EMAIL_SIGNATURE.agency}`);
  lines.push(`${EMAIL_SIGNATURE.email} | ${EMAIL_SIGNATURE.website}`);
  lines.push("");
  lines.push(`Unsubscribe: ${baseUrl}/unsubscribe?email=${options.coachEmail || ""}`);

  return lines.join("\n");
}

function showTransferBadge(athlete: RecruitEmailAthlete): boolean {
  return isTransferEligible(athlete.athleteStatus);
}

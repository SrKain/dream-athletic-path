import { renderAthleteBoardCard } from "./athlete-board-card";
import { EMAIL_BASE_URL, EMAIL_ASSETS, EMAIL_COLORS, EMAIL_SIGNATURE } from "./email-brand";

/**
 * Sanitiza strings para HTML seguro prevenindo quebras de renderização e XSS.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailStatValue =
  string | number | boolean | null | EmailStatValue[] | { [key: string]: EmailStatValue };

export interface EmailCardAthlete {
  athleteId?: string | null;
  athleteName: string;
  athleteSlug: string;
  photoUrl?: string | null;
  positionName?: string | null;
  sportName?: string | null;
  heightCm?: number | null;
  nationality?: string | null;
  countryFlag?: string | null;
  highSchoolGraduation?: string | null;
  graduationYear?: number | null;
  aboutHer?: string | null;
  gpa?: number | null;
  athleteStatus?: string | null;
  highlightNote?: string | null;
  achievementTitle?: string | null;
  budget?: string | null;
  highlightVideoUrl?: string | null;
  courseOfInterest?: string | null;
  collegeStartDate?: string | null;
  seekingOpportunities?: string | null;
  currentSchool?: string | null;
  stats?: Record<string, EmailStatValue> | null;
  teamContribution?: string | null;
  videos?: Array<{ url: string; title?: string | null; kind?: string | null }> | null;
}

/**
 * Invólucro base do e-mail (Shell HTML) com largura ~680px,
 * meta tags de esquema de cores claras, CSS inline e VML para Outlook.
 */
export function renderEmailShell(params: {
  title: string;
  preheader?: string;
  bodyContentHtml: string;
}): string {
  const safeTitle = escapeHtml(params.title);
  const safePreheader = escapeHtml(params.preheader || params.title);

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" style="color-scheme: light only;">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>${safeTitle}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      outline: none;
      text-decoration: none;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: ${EMAIL_COLORS.bodyBg};
      font-family: Arial, Helvetica, sans-serif;
      color: ${EMAIL_COLORS.textDark};
    }
    @media only screen and (max-width: 680px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .mobile-padding {
        padding-left: 14px !important;
        padding-right: 14px !important;
      }
      .mobile-stack {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        text-align: left !important;
      }
      .mobile-stack-center {
        display: block !important;
        width: 100% !important;
        text-align: center !important;
      }
      .mobile-grid-2 {
        display: inline-block !important;
        width: 48% !important;
        vertical-align: top !important;
        margin-bottom: 12px !important;
      }
      .mobile-hide {
        display: none !important;
      }
      .hero-title-giant {
        font-size: 32px !important;
        line-height: 1.1 !important;
      }
      .hero-title-main {
        font-size: 20px !important;
        line-height: 1.15 !important;
      }
    }
    @media only screen and (max-width: 440px) {
      .mobile-grid-2 {
        display: block !important;
        width: 100% !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_COLORS.bodyBg};font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Preheader oculto -->
  <div style="display:none;font-size:1px;color:${EMAIL_COLORS.bodyBg};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
    ${safePreheader} &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- Outer Wrapper -->
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${EMAIL_COLORS.bodyBg};width:100%;margin:0;padding:24px 8px;">
    <tr>
      <td align="center" valign="top">
        <!-- Container Centralizado 680px -->
        <table role="presentation" class="email-container" width="680" border="0" cellspacing="0" cellpadding="0" style="width:680px;max-width:680px;background-color:${EMAIL_COLORS.white};border:1px solid ${EMAIL_COLORS.cardBorder};box-shadow:0 8px 24px rgba(3,40,18,0.06);overflow:hidden;">
          ${params.bodyContentHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * A) HEADER: Logo oficial Go Team Go Agency com tagline à esquerda;
 * à direita, alinhado à direita com letter-spacing largo:
 * "INTERNATIONAL ATHLETES. / REAL OPPORTUNITIES." + traço dourado curto (~60px).
 */
export function renderEmailHeader(params?: { logoUrl?: string | null }): string {
  const logoSrc = params?.logoUrl?.trim() || EMAIL_ASSETS.logoUrl;

  return `
  <!-- HEADER -->
  <tr>
    <td style="background-color:${EMAIL_COLORS.white};padding:20px 28px 18px 28px;border-bottom:1px solid ${EMAIL_COLORS.cardBorder};">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <!-- Logo à esquerda -->
          <td align="left" valign="middle" class="mobile-stack">
            <a href="https://portfolio.goteamgoagency.com" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;">
              <img src="${logoSrc}" alt="Go Team Go Agency" width="240" height="52" style="width:240px;height:auto;max-height:56px;display:block;border:0;" />
            </a>
          </td>
          <!-- Frase editorial à direita -->
          <td align="right" valign="middle" class="mobile-stack" style="padding-top:4px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;color:${EMAIL_COLORS.darkGreenPrimary};letter-spacing:1.8px;line-height:1.4;text-transform:uppercase;">
              INTERNATIONAL ATHLETES.<br>
              REAL OPPORTUNITIES.
            </div>
            <div style="width:60px;height:2.5px;background-color:${EMAIL_COLORS.goldPrimary};margin-top:6px;margin-left:auto;border-radius:2px;"></div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * B) HERO: Faixa full-width (~280px de altura).
 * Fundo com degradê verde-escuro (#05301a → transparente) sobre a imagem oficial da agência.
 * Ano gigante em dourado (#f0a500/#f69e00),
 * Títulos em branco extra-bold caixa alta,
 * Subtítulo "INTERNATIONAL ATHLETES AVAILABLE NOW" com letter-spacing largo,
 * Canto superior direito: arte manuscrita "more than a game" com sublinhado dourado.
 */
export function renderEmailHero(params: {
  yearText?: string;
  sportText?: string;
  titleLine2?: string;
  subtitleText?: string;
  heroBackgroundUrl?: string | null;
}): string {
  const safeYear = escapeHtml(params.yearText || "2027");
  const safeSport = escapeHtml(params.sportText || "VOLLEYBALL").toUpperCase();
  const safeTitleLine2 = escapeHtml(params.titleLine2 || "RECRUITING BOARD").toUpperCase();
  const safeSubtitle = escapeHtml(
    params.subtitleText || "INTERNATIONAL ATHLETES AVAILABLE NOW",
  ).toUpperCase();
  const heroBg = params.heroBackgroundUrl?.trim() || EMAIL_ASSETS.heroBgUrl;

  return `
  <!-- HERO (280px) COM MÁSCARA VERDE INSTITUCIONAL -->
  <tr>
    <td bgcolor="${EMAIL_COLORS.darkGreenDeep}" background="${heroBg}" valign="top" style="background-color:${EMAIL_COLORS.darkGreenDeep};background-image:linear-gradient(to right, rgba(3, 40, 18, 0.94) 0%, rgba(5, 48, 26, 0.88) 55%, rgba(8, 67, 35, 0.65) 100%), url('${heroBg}');background-size:cover;background-position:center right;background-repeat:no-repeat;padding:0;">
      <!--[if gte mso 9]>
      <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:680px;height:280px;">
        <v:fill type="frame" src="${heroBg}" color="${EMAIL_COLORS.darkGreenDeep}" />
        <v:textbox inset="0,0,0,0">
      <![endif]-->
      <!-- Camada / Máscara Verde Institucional Translúcida com Fallback para Clientes que não suportam múltiplos backgrounds -->
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background:linear-gradient(to right, rgba(3, 40, 18, 0.94) 0%, rgba(5, 48, 26, 0.88) 55%, rgba(8, 67, 35, 0.65) 100%);background-color:rgba(3, 40, 18, 0.86);padding:26px 28px 24px 28px;">
        <!-- Linha do Manuscrito Top-Right -->
        <tr>
          <td align="left" valign="top">
            <span style="display:inline-block;padding:4px 10px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);border-radius:4px;font-size:10px;font-weight:800;letter-spacing:1.8px;color:#ffffff;text-transform:uppercase;">
              OFFICIAL GTG ROSTER
            </span>
          </td>
          <td align="right" valign="top">
            <img src="${EMAIL_ASSETS.handwrittenMoreThanAGame}" alt="more than a game" width="150" height="40" style="width:150px;height:auto;display:block;border:0;" />
          </td>
        </tr>

        <!-- Bloco Principal do Título -->
        <tr>
          <td colspan="2" align="left" valign="middle" style="padding-top:20px;padding-bottom:12px;">
            <!-- Ano Gigante em Dourado -->
            <div class="hero-title-giant" style="font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:46px;font-weight:900;color:${EMAIL_COLORS.goldPrimary};line-height:1;letter-spacing:-0.5px;margin-bottom:2px;text-shadow:0 2px 8px rgba(0,0,0,0.5);">
              ${safeYear}
            </div>
            <!-- Linhas de Título Branco Extra-Bold -->
            <div class="hero-title-main" style="font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:30px;font-weight:900;color:#ffffff;line-height:1.15;letter-spacing:0.5px;text-transform:uppercase;text-shadow:0 2px 10px rgba(0,0,0,0.6);">
              ${safeSport}<br>
              ${safeTitleLine2}
            </div>
            <!-- Subtítulo em caixa alta com letter-spacing largo -->
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:${EMAIL_COLORS.heroSubtitle};letter-spacing:2px;text-transform:uppercase;margin-top:10px;">
              ${safeSubtitle}
            </div>
          </td>
        </tr>
      </table>
      <!--[if gte mso 9]>
        </v:textbox>
      </v:rect>
      <![endif]-->
    </td>
  </tr>`;
}

export interface RenderEmailIntroParams {
  coachFirstName?: string | null;
  customGreeting?: string | null;
  customParagraph?: string | null;
  customIntroduction?: string | null;
  customHook?: string | null;
  highlightUrl?: string | null;
  sportText?: string;
  yearText?: string;
}

/**
 * C) INTRO em 2 colunas:
 * Esquerda (~65%): Saudação personalizada, parágrafo explicativo e callout/hook em bold.
 * Direita (~35%), separada por linha vertical dourada fina: 4 pilares com ícones oficiais.
 */
export function renderEmailIntro(params: RenderEmailIntroParams): string {
  const rawFirstName = (params.coachFirstName || "").trim();
  let greeting: string;
  if (params.customGreeting && params.customGreeting.trim().length > 0) {
    greeting = escapeHtml(params.customGreeting.trim());
  } else if (rawFirstName) {
    greeting = `Hi Coach ${escapeHtml(rawFirstName)},`;
  } else {
    greeting = "Hi Coach,";
  }

  const sport = escapeHtml(params.sportText || "volleyball");
  const year = escapeHtml(params.yearText || "2027");

  const rawParagraph = params.customIntroduction || params.customParagraph;
  const paragraph =
    rawParagraph && rawParagraph.trim().length > 0
      ? escapeHtml(rawParagraph.trim())
      : `We're excited to share a selection of international ${sport} student-athletes who are actively looking for the right collegiate opportunity for ${year}. Each athlete is academically prepared, verified, and has full video available.`;

  // Hook / Take a look Callout
  let hookHtml: string;
  if (params.customHook && params.customHook.trim().length > 0) {
    const customHookText = escapeHtml(params.customHook.trim());
    if (params.highlightUrl) {
      hookHtml = `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;font-weight:700;color:${EMAIL_COLORS.darkGreenPrimary};">
          <a href="${params.highlightUrl}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_COLORS.darkGreenPrimary};text-decoration:underline;">
            ${customHookText}
          </a><br>
          <span style="font-weight:400;color:${EMAIL_COLORS.textMuted};">I'd be happy to send full profiles or schedule a call.</span>
        </div>`;
    } else {
      hookHtml = `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;font-weight:700;color:${EMAIL_COLORS.darkGreenPrimary};">
          ${customHookText}<br>
          <span style="font-weight:400;color:${EMAIL_COLORS.textMuted};">I'd be happy to send full profiles or schedule a call.</span>
        </div>`;
    }
  } else if (params.highlightUrl) {
    hookHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;font-weight:700;color:${EMAIL_COLORS.darkGreenPrimary};">
        <a href="${params.highlightUrl}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_COLORS.darkGreenPrimary};text-decoration:underline;">
          Take a look at the verified match highlights &amp; profile below.
        </a><br>
        <span style="font-weight:400;color:${EMAIL_COLORS.textMuted};">I'd be happy to send full profiles or schedule a call.</span>
      </div>`;
  } else {
    hookHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;font-weight:700;color:${EMAIL_COLORS.darkGreenPrimary};">
        Take a look at our current roster below.<br>
        <span style="font-weight:400;color:${EMAIL_COLORS.textMuted};">I'd be happy to send full profiles or schedule a call.</span>
      </div>`;
  }

  return `
  <!-- INTRO 2 COLUNAS -->
  <tr>
    <td style="padding:28px 28px 24px 28px;background-color:${EMAIL_COLORS.white};border-bottom:1px solid ${EMAIL_COLORS.cardBorder};">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <!-- Coluna Esquerda: Texto (~65%) -->
          <td width="63%" valign="top" class="mobile-stack" style="padding-right:20px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;color:${EMAIL_COLORS.darkGreenPrimary};margin-bottom:12px;letter-spacing:-0.2px;">
              ${greeting}
            </div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:${EMAIL_COLORS.textDark};margin-bottom:16px;">
              ${paragraph}
            </div>
            ${hookHtml}
          </td>

          <!-- Divisor Dourado Fino (Vertical) -->
          <td width="1%" valign="top" class="mobile-hide" style="border-left:1px solid ${EMAIL_COLORS.goldLine};padding:0;"></td>

          <!-- Coluna Direita: 4 Pilares (~36%) -->
          <td width="36%" valign="top" class="mobile-stack" style="padding-left:18px;">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
              <!-- Item 1: Academics -->
              <tr>
                <td width="28" valign="top" style="padding-bottom:12px;">
                  <img src="${EMAIL_ASSETS.icons.academic}" alt="Academics" width="20" height="20" style="width:20px;height:20px;display:block;border:0;" />
                </td>
                <td valign="middle" style="padding-left:10px;padding-bottom:12px;font-size:11.5px;line-height:1.35;font-weight:700;color:${EMAIL_COLORS.darkGreenPrimary};">
                  Verified academics <span style="font-weight:400;color:${EMAIL_COLORS.textMuted};">(GPA, test scores, eligibility)</span>
                </td>
              </tr>
              <!-- Item 2: Film -->
              <tr>
                <td width="28" valign="top" style="padding-bottom:12px;">
                  <img src="${EMAIL_ASSETS.icons.film}" alt="Film" width="20" height="20" style="width:20px;height:20px;display:block;border:0;" />
                </td>
                <td valign="middle" style="padding-left:10px;padding-bottom:12px;font-size:11.5px;line-height:1.35;font-weight:700;color:${EMAIL_COLORS.darkGreenPrimary};">
                  Highlights + full-match film
                </td>
              </tr>
              <!-- Item 3: Direct Communication -->
              <tr>
                <td width="28" valign="top" style="padding-bottom:12px;">
                  <img src="${EMAIL_ASSETS.icons.users}" alt="Communication" width="20" height="20" style="width:20px;height:20px;display:block;border:0;" />
                </td>
                <td valign="middle" style="padding-left:10px;padding-bottom:12px;font-size:11.5px;line-height:1.35;font-weight:700;color:${EMAIL_COLORS.darkGreenPrimary};">
                  Direct communication <span style="font-weight:400;color:${EMAIL_COLORS.textMuted};">with athlete &amp; family</span>
                </td>
              </tr>
              <!-- Item 4: Support -->
              <tr>
                <td width="28" valign="top" style="padding-bottom:4px;">
                  <img src="${EMAIL_ASSETS.icons.globe}" alt="Support" width="20" height="20" style="width:20px;height:20px;display:block;border:0;" />
                </td>
                <td valign="middle" style="padding-left:10px;padding-bottom:4px;font-size:11.5px;line-height:1.35;font-weight:700;color:${EMAIL_COLORS.darkGreenPrimary};">
                  Full support <span style="font-weight:400;color:${EMAIL_COLORS.textMuted};">throughout the recruiting process</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * D) TÍTULO DA SEÇÃO:
 * "FEATURED ATHLETES" em verde-escuro bold, caixa alta, letter-spacing largo;
 * linha dourada fina preenchendo o espaço até a direita, onde fica
 * "MORE ATHLETES AVAILABLE UPON REQUEST" em fonte bem pequena, cinza-esverdeado.
 */
export function renderFeaturedHeader(params?: { title?: string; rightNote?: string }): string {
  const title = escapeHtml(params?.title || "FEATURED ATHLETES");
  const rightNote = escapeHtml(params?.rightNote || "MORE ATHLETES AVAILABLE UPON REQUEST");

  return `
  <!-- SEÇÃO FEATURED HEADER -->
  <tr>
    <td style="padding:22px 28px 14px 28px;background-color:${EMAIL_COLORS.white};">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <!-- Título à esquerda -->
          <td align="left" valign="middle" style="white-space:nowrap;padding-right:12px;">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:900;color:${EMAIL_COLORS.darkGreenPrimary};letter-spacing:1.8px;text-transform:uppercase;">
              ${title}
            </span>
          </td>
          <!-- Linha Dourada Fina -->
          <td align="center" valign="middle" width="100%" style="padding:0 8px;">
            <div style="height:1px;width:100%;background-color:${EMAIL_COLORS.goldLine};"></div>
          </td>
          <!-- Nota à direita -->
          <td align="right" valign="middle" style="white-space:nowrap;padding-left:8px;" class="mobile-hide">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:9.5px;font-weight:700;color:${EMAIL_COLORS.textMuted};letter-spacing:1.2px;text-transform:uppercase;">
              ${rightNote}
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/** Compatibility adapter: always use the approved athlete board card. */
export function renderAthleteCard(
  athlete: EmailCardAthlete,
  index: number,
  isSingleMode = false,
): string {
  return renderAthleteBoardCard({
    id: athlete.athleteId || athlete.athleteSlug,
    name: athlete.athleteName,
    slug: athlete.athleteSlug,
    photoUrl: athlete.photoUrl,
    positionEn: athlete.positionName,
    heightCm: athlete.heightCm,
    countryEn: athlete.nationality,
    countryFlag: athlete.countryFlag,
    gpa: athlete.gpa,
    athleteStatus: athlete.athleteStatus,
    currentSchool: athlete.currentSchool,
    seekingOpportunities: athlete.seekingOpportunities,
    courseOfInterest: athlete.courseOfInterest,
    highSchoolGraduation: athlete.highSchoolGraduation,
    graduationYear: athlete.graduationYear,
    collegeStartDate: athlete.collegeStartDate,
    aboutHer: athlete.aboutHer,
    stats: athlete.stats,
    videos: athlete.videos,
    highlightVideoUrl: athlete.highlightVideoUrl,
    highlightNote: athlete.highlightNote || athlete.achievementTitle,
    teamContribution: athlete.teamContribution,
  });
}

/**
 * Renderiza o Grid de Atletas em linhas de 4 colunas (25% cada).
 * Quando houver 1 a 3 cards, centraliza a linha mantendo a largura proporcional.
 * No modo unitário, centraliza o card único a 50% da largura.
 */
export function renderAthleteGrid(cardsHtmlArray: string[], isSingle = false): string {
  if (cardsHtmlArray.length === 0) return "";

  if (isSingle) {
    return `
    <!-- SINGLE ATHLETE CONTAINER (50%) -->
    <tr>
      <td style="padding:10px 28px 24px 28px;background-color:${EMAIL_COLORS.white};" align="center">
        <table role="presentation" width="340" border="0" cellspacing="0" cellpadding="0" style="width:340px;max-width:340px;">
          <tr>
            <td align="center">
              ${cardsHtmlArray[0]}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }

  // Múltiplos atletas em blocos de 4 por linha
  const rows: string[] = [];
  const chunkSize = 4;

  for (let i = 0; i < cardsHtmlArray.length; i += chunkSize) {
    const chunk = cardsHtmlArray.slice(i, i + chunkSize);
    const count = chunk.length;

    let rowCells = "";
    if (count === 4) {
      rowCells = chunk
        .map(
          (cardHtml) =>
            `<td width="25%" valign="top" class="mobile-grid-2" style="padding:0 5px;">${cardHtml}</td>`,
        )
        .join("");
    } else {
      // Centralizar linha incompleta mantendo cards em 25%
      const emptySideWidth = (4 - count) * 12.5;
      rowCells = `
        <td width="${emptySideWidth}%" class="mobile-hide"></td>
        ${chunk
          .map(
            (cardHtml) =>
              `<td width="25%" valign="top" class="mobile-grid-2" style="padding:0 5px;">${cardHtml}</td>`,
          )
          .join("")}
        <td width="${emptySideWidth}%" class="mobile-hide"></td>
      `;
    }

    rows.push(`
      <tr>
        <td style="padding:0 20px 8px 20px;">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              ${rowCells}
            </tr>
          </table>
        </td>
      </tr>
    `);
  }

  return `
  <!-- ATHLETE GRID -->
  <tr>
    <td style="background-color:${EMAIL_COLORS.white};padding-top:4px;padding-bottom:16px;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        ${rows.join("")}
      </table>
    </td>
  </tr>`;
}

/**
 * F) CTA BAR (largura total, fundo #eef3ec, cantos arredondados ~12px, padding generoso):
 * Ícone de grupo à esquerda;
 * "LOOKING FOR A SPECIFIC PROFILE?" em verde-escuro bold caixa alta;
 * texto explicativo abaixo;
 * Botão dourado mailto "REQUEST MORE ATHLETES →" à direita.
 */
export function renderRequestCtaBar(params?: {
  sportText?: string;
  coachName?: string | null;
  institutionName?: string | null;
  includeCatalogButton?: boolean;
}): string {
  const sport = escapeHtml(params?.sportText || "Volleyball");
  const coach = escapeHtml(params?.coachName || "Coach");
  const inst = escapeHtml(params?.institutionName || "");

  const mailtoSubject = encodeURIComponent(
    `[Go Team Go Recruiting Inquiry] Specific Profile Request (${sport}${inst ? ` - ${inst}` : ""})`,
  );
  const mailtoBody = encodeURIComponent(
    `Hi Fabiana,\n\nI am looking for specific student-athlete profiles for our program:\n- Position(s):\n- Graduation Year:\n- Key Attributes / Requirements:\n\nLooking forward to reviewing your roster.\n\nBest regards,\n${coach}${inst ? `\n${inst}` : ""}`,
  );
  const mailtoUrl = `mailto:${EMAIL_SIGNATURE.email}?subject=${mailtoSubject}&body=${mailtoBody}`;

  return `
  <!-- CTA BAR -->
  <tr>
    <td style="padding:6px 28px 22px 28px;background-color:${EMAIL_COLORS.white};">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${EMAIL_COLORS.ctaBg};border:1px solid ${EMAIL_COLORS.cardBorder};border-radius:12px;padding:18px 20px;">
        <tr>
          <!-- Ícone de Grupo à esquerda -->
          <td width="36" valign="middle" class="mobile-hide" style="padding-right:14px;">
            <img src="${EMAIL_ASSETS.icons.users}" alt="Recruiting Roster" width="32" height="32" style="width:32px;height:32px;display:block;border:0;" />
          </td>
          <!-- Textos no centro -->
          <td valign="middle" class="mobile-stack" align="left" style="padding-right:12px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:900;color:${EMAIL_COLORS.darkGreenPrimary};letter-spacing:1px;text-transform:uppercase;margin-bottom:3px;">
              LOOKING FOR A SPECIFIC PROFILE?
            </div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:${EMAIL_COLORS.textMuted};line-height:1.45;">
              Send me your position needs, graduation year, or any preferences, and I'll send you the best matches from our roster.
            </div>
          </td>
          <!-- Botão Dourado à direita -->
          <td valign="middle" align="right" class="mobile-stack" style="padding-top:6px;white-space:nowrap;">
            <a href="${mailtoUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:${EMAIL_COLORS.goldPrimary};color:${EMAIL_COLORS.darkGreenPrimary};font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;letter-spacing:0.8px;text-transform:uppercase;text-decoration:none;padding:11px 18px;border-radius:24px;box-shadow:0 3px 10px rgba(246,158,0,0.3);">
              REQUEST MORE ATHLETES &rarr;
            </a>
            ${
              params?.includeCatalogButton
                ? `
            <div style="margin-top:8px;">
              <a href="https://portfolio.goteamgoagency.com" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:${EMAIL_COLORS.darkGreenPrimary};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;text-decoration:none;padding:10px 16px;border-radius:24px;">
                EXPLORE FULL PORTFOLIO &rarr;
              </a>
            </div>`
                : ""
            }
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * G) ASSINATURA:
 * Logo à esquerda; linha vertical dourada fina;
 * Bloco com Fabiana Andrade, Founder | Go Team Go Agency,
 * Linhas clicáveis de contato: e-mail, Instagram, site e WhatsApp.
 * À direita, a frase manuscrita "Different Athletes Brighter Futures" com sublinhado dourado.
 */
export function renderSignature(params?: { logoUrl?: string | null }): string {
  const logoSrc = params?.logoUrl?.trim() || EMAIL_ASSETS.logoUrl;

  return `
  <!-- SIGNATURE BLOCK -->
  <tr>
    <td style="padding:22px 28px 20px 28px;background-color:${EMAIL_COLORS.white};border-top:1px solid ${EMAIL_COLORS.cardBorder};">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <!-- Logo Pequena à esquerda -->
          <td width="64" valign="middle" class="mobile-hide" style="padding-right:16px;">
            <img src="${logoSrc}" alt="GTG" width="60" height="48" style="width:60px;height:auto;display:block;border:0;" />
          </td>

          <!-- Divisor Dourado Vertical -->
          <td width="1" valign="middle" class="mobile-hide" style="border-left:1.5px solid ${EMAIL_COLORS.goldLine};padding:0;"></td>

          <!-- Informações de Contato -->
          <td valign="middle" align="left" class="mobile-stack" style="padding-left:16px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:900;color:${EMAIL_COLORS.darkGreenPrimary};letter-spacing:-0.2px;">
              ${EMAIL_SIGNATURE.name}
            </div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:${EMAIL_COLORS.textMuted};margin-bottom:8px;">
              ${EMAIL_SIGNATURE.role}
            </div>
            <!-- 3 Linhas com Ícones -->
            <table role="presentation" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td width="16" valign="middle" style="padding-bottom:3px;">
                  <img src="${EMAIL_ASSETS.icons.email}" alt="Email" width="12" height="12" style="width:12px;height:12px;display:block;border:0;" />
                </td>
                <td valign="middle" style="padding-left:6px;padding-bottom:3px;font-size:11px;">
                  <a href="mailto:${EMAIL_SIGNATURE.email}" style="color:${EMAIL_COLORS.darkGreenPrimary};text-decoration:none;font-weight:700;">
                    ${EMAIL_SIGNATURE.email}
                  </a>
                </td>
              </tr>
              <tr>
                <td width="16" valign="middle" style="padding-bottom:3px;">
                  <img src="${EMAIL_ASSETS.icons.instagram}" alt="Instagram" width="12" height="12" style="width:12px;height:12px;display:block;border:0;" />
                </td>
                <td valign="middle" style="padding-left:6px;padding-bottom:3px;font-size:11px;">
                  <a href="${EMAIL_SIGNATURE.instagramUrl}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_COLORS.darkGreenPrimary};text-decoration:none;font-weight:700;">
                    ${EMAIL_SIGNATURE.instagram}
                  </a>
                </td>
              </tr>
              <tr>
                <td width="16" valign="middle">
                  <img src="${EMAIL_ASSETS.icons.website}" alt="Site" width="12" height="12" style="width:12px;height:12px;display:block;border:0;" />
                </td>
                <td valign="middle" style="padding-left:6px;font-size:11px;">
                  <a href="${EMAIL_SIGNATURE.websiteUrl}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_COLORS.darkGreenPrimary};text-decoration:none;font-weight:700;">
                    ${EMAIL_SIGNATURE.website}
                  </a>
                </td>
              </tr>
              <tr>
                <td width="16" valign="middle" style="padding-top:3px;font-size:12px;line-height:12px;">&#9742;</td>
                <td valign="middle" style="padding-left:6px;padding-top:3px;font-size:11px;">
                  <a href="https://wa.me/5511999239490" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_COLORS.darkGreenPrimary};text-decoration:none;font-weight:700;">+55 (11) 99923-9490</a>
                </td>
              </tr>
            </table>
          </td>

          <!-- Frase Manuscrita Institucional à direita -->
          <td align="right" valign="middle" class="mobile-stack" style="padding-left:12px;padding-top:8px;">
            <img src="${EMAIL_ASSETS.handwrittenDifferentAthletes}" alt="Different Athletes Brighter Futures" width="180" height="42" style="width:180px;height:auto;display:block;border:0;" />
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * H) BLOCO "NÃO É FIT":
 * Botão com contorno discreto para responder à agência sobre o fit da atleta.
 */
export function renderFeedbackBlock(params: {
  recipientEmail?: string | null;
  coachId?: string | null;
  athleteId?: string | null;
  athleteName?: string | null;
  position?: string | null;
}): string {
  const athleteName = params.athleteName?.replace(/[\r\n]+/g, " ").trim() || "Athlete";
  const subject = `Not a fit: ${athleteName}`;
  const replyUrl = `mailto:${EMAIL_SIGNATURE.email}?subject=${encodeURIComponent(subject)}`;

  return `
  <!-- FEEDBACK BLOCK -->
  <tr>
    <td style="padding:10px 28px 16px 28px;background-color:${EMAIL_COLORS.white};text-align:center;">
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center">
        <tr>
          <td align="center" style="border:1.5px solid ${EMAIL_COLORS.darkGreenPrimary};border-radius:24px;padding:8px 20px;">
            <a href="${escapeHtml(replyUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;color:${EMAIL_COLORS.darkGreenPrimary};letter-spacing:0.8px;text-transform:uppercase;text-decoration:none;display:inline-block;">
              Not the right fit? Reply to this email &rarr;
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * I) BARRA FINAL:
 * 2/3 esquerdo verde-escuro (#08311c) com
 * "COLLEGE RECRUITING · ACADEMIC SUCCESS · GLOBAL OPPORTUNITIES" em branco;
 * 1/3 direito dourado (#f0a500) com "GO FURTHER. TOGETHER." em verde-escuro bold caixa alta.
 */
export function renderBottomBar(): string {
  return `
  <!-- BOTTOM BAR (2/3 GREEN + 1/3 GOLD) -->
  <tr>
    <td style="padding:0;background-color:${EMAIL_COLORS.darkGreenBar};">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <!-- 2/3 Verde -->
          <td width="66%" bgcolor="${EMAIL_COLORS.darkGreenBar}" valign="middle" align="left" style="padding:14px 22px;background-color:${EMAIL_COLORS.darkGreenBar};" class="mobile-stack-center">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:800;color:#ffffff;letter-spacing:1.8px;text-transform:uppercase;">
              COLLEGE RECRUITING · ACADEMIC SUCCESS · GLOBAL OPPORTUNITIES
            </span>
          </td>
          <!-- 1/3 Dourado -->
          <td width="34%" bgcolor="${EMAIL_COLORS.goldLight}" valign="middle" align="center" style="padding:14px 16px;background-color:${EMAIL_COLORS.goldLight};" class="mobile-stack-center">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;color:${EMAIL_COLORS.darkGreenPrimary};letter-spacing:1.2px;text-transform:uppercase;">
              GO FURTHER. TOGETHER.
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * J) LEGAL FOOTER:
 * Linha obrigatória de "manage email preferences / unsubscribe" apontando para /unsubscribe?email=...
 */
export function renderLegalFooter(params: { recipientEmail?: string | null }): string {
  const unsubscribeUrl = params.recipientEmail
    ? `https://portfolio.goteamgoagency.com/unsubscribe?email=${encodeURIComponent(params.recipientEmail)}`
    : `https://portfolio.goteamgoagency.com/unsubscribe`;

  return `
  <!-- LEGAL FOOTER -->
  <tr>
    <td style="background-color:${EMAIL_COLORS.bodyBg};padding:18px 24px;text-align:center;border-top:1px solid ${EMAIL_COLORS.cardBorder};">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:${EMAIL_COLORS.textMuted};line-height:1.55;">
        This recruiting board was curated specifically for collegiate athletics coaches and scouting personnel.<br>
        If you no longer wish to receive prospect evaluations from Go Team Go Agency, you can 
        <a href="${unsubscribeUrl}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_COLORS.darkGreenPrimary};font-weight:700;text-decoration:underline;">
          manage email preferences or unsubscribe
        </a>.
      </div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${EMAIL_COLORS.copyrightText};margin-top:6px;">
        &copy; ${new Date().getFullYear()} Go Team Go Agency. All rights reserved.
      </div>
    </td>
  </tr>`;
}

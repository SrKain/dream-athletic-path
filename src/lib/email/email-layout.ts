import {
  EMAIL_BASE_URL,
  EMAIL_ASSETS,
  EMAIL_COLORS,
  EMAIL_SIGNATURE,
  getCountryAlpha3,
} from "./email-brand";
import { formatHeightImperial, formatGpa } from "@/lib/units";
import { youtubeWatchUrl } from "@/lib/youtube";

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

export interface EmailCardAthlete {
  athleteId?: string | null;
  athleteName: string;
  athleteSlug: string;
  photoUrl?: string | null;
  positionName?: string | null;
  sportName?: string | null;
  heightCm?: number | null;
  nationality?: string | null;
  highSchoolGraduation?: string | null;
  graduationYear?: number | null;
  gpa?: number | null;
  athleteStatus?: string | null;
  highlightNote?: string | null;
  achievementTitle?: string | null;
  budget?: string | null;
  highlightVideoUrl?: string | null;
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
export function renderEmailHeader(): string {
  return `
  <!-- HEADER -->
  <tr>
    <td style="background-color:${EMAIL_COLORS.white};padding:20px 28px 18px 28px;border-bottom:1px solid ${EMAIL_COLORS.cardBorder};">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <!-- Logo à esquerda -->
          <td align="left" valign="middle" class="mobile-stack">
            <a href="https://portfolio.goteamgoagency.com" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;">
              <img src="${EMAIL_ASSETS.logoUrl}" alt="Go Team Go Agency" width="240" height="52" style="width:240px;height:auto;max-height:56px;display:block;border:0;" />
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
 * Fundo P&B com degradê verde-escuro (#05301a → transparente).
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
}): string {
  const safeYear = escapeHtml(params.yearText || "2027");
  const safeSport = escapeHtml(params.sportText || "VOLLEYBALL").toUpperCase();
  const safeTitleLine2 = escapeHtml(params.titleLine2 || "RECRUITING BOARD").toUpperCase();
  const safeSubtitle = escapeHtml(
    params.subtitleText || "INTERNATIONAL ATHLETES AVAILABLE NOW",
  ).toUpperCase();

  return `
  <!-- HERO (280px) -->
  <tr>
    <td bgcolor="${EMAIL_COLORS.darkGreenHero}" background="${EMAIL_ASSETS.heroBgUrl}" valign="top" style="background-color:${EMAIL_COLORS.darkGreenHero};background-image:url('${EMAIL_ASSETS.heroBgUrl}');background-size:cover;background-position:center right;background-repeat:no-repeat;padding:26px 28px 24px 28px;">
      <!--[if gte mso 9]>
      <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:680px;height:280px;">
        <v:fill type="frame" src="${EMAIL_ASSETS.heroBgUrl}" color="${EMAIL_COLORS.darkGreenHero}" />
        <v:textbox inset="0,0,0,0">
      <![endif]-->
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
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
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#d2ded6;letter-spacing:2px;text-transform:uppercase;margin-top:10px;">
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

/**
 * C) INTRO em 2 colunas:
 * Esquerda (~65%): Saudação personalizada, parágrafo explicativo e callout em bold.
 * Direita (~35%), separada por linha vertical dourada fina: 4 pilares com ícones oficiais.
 */
export function renderEmailIntro(params: {
  coachFirstName?: string | null;
  customParagraph?: string | null;
  sportText?: string;
  yearText?: string;
}): string {
  const rawFirstName = (params.coachFirstName || "").trim();
  const greeting = rawFirstName ? `Hi Coach ${escapeHtml(rawFirstName)},` : "Hi Coach,";
  const sport = escapeHtml(params.sportText || "volleyball");
  const year = escapeHtml(params.yearText || "2027");

  const paragraph =
    params.customParagraph ||
    `We're excited to share a selection of international ${sport} student-athletes who are actively looking for the right collegiate opportunity for ${year}. Each athlete is academically prepared, verified, and has full video available.`;

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
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;font-weight:700;color:${EMAIL_COLORS.darkGreenPrimary};">
              Take a look at our current roster below.<br>
              <span style="font-weight:400;color:${EMAIL_COLORS.textMuted};">I'd be happy to send full profiles or schedule a call.</span>
            </div>
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

/**
 * E) CARD DO ATLETA:
 * Fundo #f3f6f1, borda 1px #e3e9dc, cantos arredondados (~12px), padding ~10px.
 * 1. Linha superior: sequencial "01" à esquerda; Alpha-3 ("BRA") + bandeira PNG circular à direita.
 * 2. Foto proporção ~1.22:1 (cover, cantos arredondados).
 * 3. Etiqueta da posição sobreposta na base da foto (#084323, branco bold).
 * 4. Nome em CAIXA ALTA bold (#084323, ~15px).
 * 5. 5 linhas de atributos com ícones: altura, Class of, GPA (1 decimal), destaque/conquista, financeiro (omitido se vazio).
 * 6. Botão pill #084323 largura total: play circular + WATCH HIGHLIGHTS + seta dourada →.
 */
export function renderAthleteCard(
  athlete: EmailCardAthlete,
  index: number,
  isSingleMode = false,
): string {
  const safeName = escapeHtml(
    (athlete.athleteName || "").trim().toUpperCase() || "ATHLETE PROSPECT",
  );
  const safeSlug = escapeHtml((athlete.athleteSlug || "").trim());
  const formattedIndex = String(index + 1).padStart(2, "0");

  const profileUrl = safeSlug
    ? `${EMAIL_BASE_URL}/athlete/${encodeURIComponent(athlete.athleteSlug)}`
    : EMAIL_BASE_URL;

  // Link do botão WATCH HIGHLIGHTS
  let watchHighlightsUrl = profileUrl;
  if (athlete.highlightVideoUrl) {
    const parsed = youtubeWatchUrl(athlete.highlightVideoUrl);
    if (parsed) watchHighlightsUrl = parsed;
    else watchHighlightsUrl = athlete.highlightVideoUrl;
  }

  // País
  const alpha3 = getCountryAlpha3(athlete.nationality);
  const flagUrl = EMAIL_ASSETS.flagUrl(alpha3);

  // Posição
  const positionText = escapeHtml(
    (athlete.positionName || athlete.sportName || "PROSPECT").toUpperCase(),
  );

  // Altura
  const heightImperial = formatHeightImperial(athlete.heightCm);
  const heightText = heightImperial
    ? athlete.heightCm
      ? `${heightImperial} (${athlete.heightCm} cm)`
      : heightImperial
    : athlete.heightCm
      ? `${athlete.heightCm} cm`
      : "Profile Film";

  // Graduação
  const gradYear = athlete.highSchoolGraduation
    ? `Class of ${escapeHtml(athlete.highSchoolGraduation)}`
    : athlete.graduationYear
      ? `Class of ${athlete.graduationYear}`
      : "Class of 2027";

  // GPA
  const gpaFormatted = formatGpa(athlete.gpa);
  const gpaText = gpaFormatted ? `GPA: ${gpaFormatted}` : "GPA: Verified on Profile";

  // Destaque / Conquista (fallback para achievement ou omitir)
  const highlightLine =
    athlete.highlightNote && athlete.highlightNote.trim().length > 0
      ? athlete.highlightNote.trim()
      : athlete.achievementTitle && athlete.achievementTitle.trim().length > 0
        ? athlete.achievementTitle.trim()
        : null;

  // Badge Transfer (Status diferente de High School e Graduate Transfer)
  const isTransfer =
    athlete.athleteStatus &&
    ["Freshman", "Sophomore", "Junior", "Senior", "Transfer"].includes(athlete.athleteStatus);

  // Foto
  const photoUrl = athlete.photoUrl
    ? athlete.photoUrl
    : `${EMAIL_BASE_URL}/email/flags/default.png`;

  return `
  <!-- CARD ${formattedIndex}: ${safeName} -->
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${EMAIL_COLORS.cardBg};border:1px solid ${EMAIL_COLORS.cardBorder};border-radius:12px;overflow:hidden;margin-bottom:12px;">
    <!-- Top Row: Index + Country Flag & Alpha3 -->
    <tr>
      <td style="padding:10px 10px 6px 10px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="left" valign="middle">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:900;color:${EMAIL_COLORS.darkGreenPrimary};letter-spacing:0.5px;">
                ${formattedIndex}
              </span>
              ${
                isTransfer
                  ? `<span style="display:inline-block;margin-left:6px;background-color:#d4e5d8;color:${EMAIL_COLORS.darkGreenPrimary};font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;letter-spacing:0.8px;">TRANSFER</span>`
                  : ""
              }
            </td>
            <td align="right" valign="middle">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td valign="middle" style="padding-right:5px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:800;color:${EMAIL_COLORS.textDark};letter-spacing:0.5px;">
                    ${escapeHtml(alpha3)}
                  </td>
                  <td valign="middle">
                    <img src="${flagUrl}" alt="${escapeHtml(alpha3)}" width="18" height="18" style="width:18px;height:18px;border-radius:50%;display:block;border:1px solid ${EMAIL_COLORS.cardBorder};" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Athlete Photo with Position Badge Attached -->
    <tr>
      <td style="padding:0 10px 8px 10px;" align="center">
        <div style="position:relative;width:100%;border-radius:8px;overflow:hidden;background-color:#084323;">
          <a href="${profileUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">
            <img src="${photoUrl}" alt="${safeName}" width="${isSingleMode ? "320" : "196"}" height="${isSingleMode ? "260" : "160"}" style="width:100%;max-width:${isSingleMode ? "340px" : "210px"};height:${isSingleMode ? "240px" : "154px"};object-fit:cover;display:block;border-radius:6px;" />
          </a>
          <!-- Position Badge glued to bottom-left -->
          <div style="background-color:${EMAIL_COLORS.darkGreenPrimary};color:#ffffff;padding:4px 8px;font-family:Arial,Helvetica,sans-serif;font-size:9.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;text-align:left;">
            ${positionText}
          </div>
        </div>
      </td>
    </tr>

    <!-- Athlete Name -->
    <tr>
      <td style="padding:0 10px 8px 10px;" align="left">
        <a href="${profileUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:${isSingleMode ? "17px" : "13.5px"};font-weight:900;color:${EMAIL_COLORS.darkGreenPrimary};line-height:1.25;letter-spacing:-0.2px;text-transform:uppercase;min-height:34px;">
            ${safeName}
          </div>
        </a>
      </td>
    </tr>

    <!-- 5 Rows of Details -->
    <tr>
      <td style="padding:0 10px 10px 10px;" align="left">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
          <!-- Row 1: Height -->
          <tr>
            <td width="20" valign="middle" style="padding-bottom:5px;">
              <img src="${EMAIL_ASSETS.icons.height}" alt="Height" width="14" height="14" style="width:14px;height:14px;display:block;border:0;" />
            </td>
            <td valign="middle" style="padding-left:6px;padding-bottom:5px;font-size:11px;font-weight:700;color:${EMAIL_COLORS.textDark};">
              ${escapeHtml(heightText)}
            </td>
          </tr>

          <!-- Row 2: Graduation -->
          <tr>
            <td width="20" valign="middle" style="padding-bottom:5px;">
              <img src="${EMAIL_ASSETS.icons.gradCap}" alt="Class" width="14" height="14" style="width:14px;height:14px;display:block;border:0;" />
            </td>
            <td valign="middle" style="padding-left:6px;padding-bottom:5px;font-size:11px;font-weight:700;color:${EMAIL_COLORS.textDark};">
              ${escapeHtml(gradYear)}
            </td>
          </tr>

          <!-- Row 3: GPA -->
          <tr>
            <td width="20" valign="middle" style="padding-bottom:5px;">
              <img src="${EMAIL_ASSETS.icons.stats}" alt="GPA" width="14" height="14" style="width:14px;height:14px;display:block;border:0;" />
            </td>
            <td valign="middle" style="padding-left:6px;padding-bottom:5px;font-size:11px;font-weight:700;color:${EMAIL_COLORS.textDark};">
              ${escapeHtml(gpaText)}
            </td>
          </tr>

          <!-- Row 4: Highlight Hook (if exists) -->
          ${
            highlightLine
              ? `
          <tr>
            <td width="20" valign="top" style="padding-bottom:5px;padding-top:1px;">
              <img src="${EMAIL_ASSETS.icons.star}" alt="Highlight" width="14" height="14" style="width:14px;height:14px;display:block;border:0;" />
            </td>
            <td valign="top" style="padding-left:6px;padding-bottom:5px;font-size:10.5px;line-height:1.3;font-style:italic;color:${EMAIL_COLORS.textMuted};">
              ${escapeHtml(highlightLine)}
            </td>
          </tr>`
              : ""
          }

          <!-- Row 5: Financial (omitted if empty, per user approval) -->
          ${
            athlete.budget && athlete.budget.trim().length > 0
              ? `
          <tr>
            <td width="20" valign="middle" style="padding-bottom:5px;">
              <img src="${EMAIL_ASSETS.icons.dollar}" alt="Financial" width="14" height="14" style="width:14px;height:14px;display:block;border:0;" />
            </td>
            <td valign="middle" style="padding-left:6px;padding-bottom:5px;font-size:11px;font-weight:700;color:${EMAIL_COLORS.textDark};">
              Financial: ${escapeHtml(athlete.budget)}
            </td>
          </tr>`
              : ""
          }
        </table>
      </td>
    </tr>

    <!-- Bottom Action Button: WATCH HIGHLIGHTS -->
    <tr>
      <td style="padding:0 10px 12px 10px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" bgcolor="${EMAIL_COLORS.darkGreenPrimary}" style="background-color:${EMAIL_COLORS.darkGreenPrimary};border-radius:24px;padding:9px 12px;">
              <a href="${watchHighlightsUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:block;">
                <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center">
                  <tr>
                    <td valign="middle" style="padding-right:6px;">
                      <img src="${EMAIL_ASSETS.icons.playCircle}" alt="Play" width="18" height="18" style="width:18px;height:18px;display:block;border:0;" />
                    </td>
                    <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:900;color:#ffffff;letter-spacing:1px;text-transform:uppercase;">
                      WATCH HIGHLIGHTS
                    </td>
                    <td valign="middle" style="padding-left:6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:900;color:${EMAIL_COLORS.goldPrimary};">
                      &rarr;
                    </td>
                  </tr>
                </table>
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
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
 * 3 linhas com ícone: e-mail, Instagram, site.
 * À direita, a frase manuscrita "Different Athletes Brighter Futures" com sublinhado dourado.
 */
export function renderSignature(): string {
  return `
  <!-- SIGNATURE BLOCK -->
  <tr>
    <td style="padding:22px 28px 20px 28px;background-color:${EMAIL_COLORS.white};border-top:1px solid ${EMAIL_COLORS.cardBorder};">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <!-- Logo Pequena à esquerda -->
          <td width="64" valign="middle" class="mobile-hide" style="padding-right:16px;">
            <img src="${EMAIL_ASSETS.logoUrl}" alt="GTG" width="60" height="48" style="width:60px;height:auto;display:block;border:0;" />
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
 * Botão com contorno verde-escuro apontando para a rota /feedback.
 */
export function renderFeedbackBlock(params: {
  recipientEmail?: string | null;
  coachId?: string | null;
  athleteId?: string | null;
  position?: string | null;
}): string {
  const queryParams = new URLSearchParams();
  if (params.recipientEmail) queryParams.set("email", params.recipientEmail);
  if (params.coachId) queryParams.set("coachId", params.coachId);
  if (params.athleteId) queryParams.set("athleteId", params.athleteId);
  if (params.position) queryParams.set("position", params.position);

  const queryStr = queryParams.toString();
  const feedbackUrl = queryStr
    ? `https://portfolio.goteamgoagency.com/feedback?${queryStr}`
    : `https://portfolio.goteamgoagency.com/feedback`;

  return `
  <!-- FEEDBACK BLOCK -->
  <tr>
    <td style="padding:10px 28px 16px 28px;background-color:${EMAIL_COLORS.white};text-align:center;">
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center">
        <tr>
          <td align="center" style="border:1.5px solid ${EMAIL_COLORS.darkGreenPrimary};border-radius:24px;padding:8px 20px;">
            <a href="${feedbackUrl}" target="_blank" rel="noopener noreferrer" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;color:${EMAIL_COLORS.darkGreenPrimary};letter-spacing:0.8px;text-transform:uppercase;text-decoration:none;display:inline-block;">
              Not the right fit? Tell us why &rarr;
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
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#8ba092;margin-top:6px;">
        &copy; ${new Date().getFullYear()} Go Team Go Agency. All rights reserved.
      </div>
    </td>
  </tr>`;
}

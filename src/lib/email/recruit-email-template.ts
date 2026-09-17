import { formatHeightImperial, formatGpa } from "@/lib/units";

export interface RecruitEmailData {
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
  gpa?: number | null;
  athleteStatus?: string | null;
  highlightNote?: string | null;
  recipientEmail?: string | null;
  coachId?: string | null;
}

export interface MultiAthleteEmailData {
  athletes: RecruitEmailData[];
  coachName?: string | null;
  institutionName?: string | null;
  recipientEmail?: string | null;
  coachId?: string | null;
}

/** Renderiza o bloco individual de card de atleta para compor e-mails simples ou múltiplos */
export function renderAthleteCardHtml(data: RecruitEmailData, index?: number) {
  const safeName = (data.athleteName || "").trim() || "Student-Athlete";
  const safeSlug = (data.athleteSlug || "").trim();
  const initial = safeName.charAt(0).toUpperCase() || "A";

  const profileUrl = safeSlug
    ? `https://portfolio.goteamgoagency.com/athlete/${encodeURIComponent(safeSlug)}`
    : `https://portfolio.goteamgoagency.com`;

  // Formatar Altura
  const heightImperial = formatHeightImperial(data.heightCm);
  const heightText = heightImperial
    ? data.heightCm
      ? `${heightImperial} (${data.heightCm} cm)`
      : heightImperial
    : data.heightCm
      ? `${data.heightCm} cm`
      : "Available on profile";

  // Formatar Nacionalidade
  const nationalityText = data.nationality
    ? `${data.countryFlag ? `${data.countryFlag} ` : ""}${data.nationality}`
    : "International Prospect";

  // Formatar Graduação / Ano
  const gradYear = data.highSchoolGraduation
    ? `Class of ${data.highSchoolGraduation}`
    : data.graduationYear
      ? `Class of ${data.graduationYear}`
      : "Class of 2026";

  // Formatar Status / GPA
  const gpaStr = formatGpa(data.gpa);
  const statusOrGpa = data.athleteStatus
    ? gpaStr
      ? `${data.athleteStatus} • GPA ${gpaStr}`
      : data.athleteStatus
    : gpaStr
      ? `GPA ${gpaStr}`
      : "Eligible Prospect";

  // Hook line
  const hookLine =
    data.highlightNote && data.highlightNote.trim().length > 0
      ? data.highlightNote.trim()
      : `High-performance international prospect currently available for recruitment in collegiate ${data.sportName || "athletics"}.`;

  const sportAndPosition =
    [data.positionName, data.sportName].filter(Boolean).join(" • ").toUpperCase() ||
    "COLLEGE PROSPECT";

  const photoHtml = data.photoUrl
    ? `
    <div style="text-align:center;margin-bottom:16px;">
      <img src="${data.photoUrl}" alt="${safeName}" width="130" height="130" style="width:130px;height:130px;border-radius:50%;object-fit:cover;border:3px solid #f69e00;display:inline-block;box-shadow:0 6px 18px rgba(246,158,0,0.25);" />
    </div>
  `
    : `
    <div style="text-align:center;margin-bottom:16px;">
      <div style="width:100px;height:100px;line-height:100px;border-radius:50%;background:#084323;border:3px solid #f69e00;color:#ffffff;font-size:32px;font-weight:bold;margin:0 auto;text-align:center;">
        ${initial}
      </div>
    </div>
  `;

  return `
    <!-- Athlete Card ${typeof index === "number" ? index + 1 : ""} -->
    <div style="background:#f8faf5;border:1px solid #e3e9dc;border-radius:14px;padding:24px 20px;margin-bottom:24px;text-align:center;">
      ${photoHtml}

      <h2 style="margin:0 0 6px 0;font-size:24px;font-weight:800;color:#032812;letter-spacing:-0.02em;line-height:1.2;">
        ${safeName}
      </h2>

      <div style="display:inline-block;padding:5px 14px;background:#084323;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.08em;border-radius:9999px;margin-bottom:14px;">
        ${sportAndPosition}
      </div>

      <!-- Hook Line -->
      <div style="background:#ffffff;border:1px dashed #e3e9dc;border-radius:8px;padding:12px 16px;margin-bottom:18px;font-size:13px;color:#032812;font-style:italic;line-height:1.5;">
        "${hookLine}"
      </div>

      <!-- 4 Stat Highlights Grid -->
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
        <tr>
          <td width="48%" style="padding:4px;">
            <div style="background:#ffffff;border:1px solid #e3e9dc;border-radius:10px;padding:10px;text-align:center;">
              <div style="font-size:10px;color:#4b6353;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;margin-bottom:2px;">Height</div>
              <div style="font-size:13px;color:#032812;font-weight:800;">${heightText}</div>
            </div>
          </td>
          <td width="4%" style="padding:0;"></td>
          <td width="48%" style="padding:4px;">
            <div style="background:#ffffff;border:1px solid #e3e9dc;border-radius:10px;padding:10px;text-align:center;">
              <div style="font-size:10px;color:#4b6353;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;margin-bottom:2px;">Nationality</div>
              <div style="font-size:13px;color:#032812;font-weight:800;">${nationalityText}</div>
            </div>
          </td>
        </tr>
        <tr>
          <td width="48%" style="padding:4px;">
            <div style="background:#ffffff;border:1px solid #e3e9dc;border-radius:10px;padding:10px;text-align:center;">
              <div style="font-size:10px;color:#4b6353;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;margin-bottom:2px;">Graduation</div>
              <div style="font-size:13px;color:#032812;font-weight:800;">${gradYear}</div>
            </div>
          </td>
          <td width="4%" style="padding:0;"></td>
          <td width="48%" style="padding:4px;">
            <div style="background:#ffffff;border:1px solid #e3e9dc;border-radius:10px;padding:10px;text-align:center;">
              <div style="font-size:10px;color:#4b6353;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;margin-bottom:2px;">Status / Academic</div>
              <div style="font-size:13px;color:#032812;font-weight:800;">${statusOrGpa}</div>
            </div>
          </td>
        </tr>
      </table>

      <!-- CTA Button -->
      <div style="text-align:center;margin:12px 0 6px 0;">
        <a href="${profileUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#f69e00;color:#032812;font-size:14px;font-weight:800;text-decoration:none;padding:14px 30px;border-radius:10px;letter-spacing:0.02em;box-shadow:0 4px 14px rgba(246,158,0,0.3);">
          View ${safeName.split(" ")[0]}'s Full Profile & Highlights →
        </a>
      </div>
    </div>
  `;
}

/** Renderiza o rodapé unificado com links de feedback/sinal de interesse e descadastro */
export function renderEmailFooterHtml(params: {
  recipientEmail?: string | null;
  coachId?: string | null;
  athleteId?: string | null;
  position?: string | null;
}) {
  const queryParams = new URLSearchParams();
  if (params.recipientEmail) queryParams.set("email", params.recipientEmail);
  if (params.coachId) queryParams.set("coachId", params.coachId);
  if (params.athleteId) queryParams.set("athleteId", params.athleteId);
  if (params.position) queryParams.set("position", params.position);

  const feedbackQueryStr = queryParams.toString();
  const feedbackUrl = feedbackQueryStr
    ? `https://portfolio.goteamgoagency.com/feedback?${feedbackQueryStr}`
    : `https://portfolio.goteamgoagency.com/feedback`;

  const unsubscribeUrl = params.recipientEmail
    ? `https://portfolio.goteamgoagency.com/unsubscribe?email=${encodeURIComponent(params.recipientEmail)}`
    : `https://portfolio.goteamgoagency.com/unsubscribe`;

  return `
    <!-- Rodapé Institucional -->
    <tr>
      <td style="background-color:#f0f4ec;padding:24px 28px;border-top:1px solid #e3e9dc;text-align:center;">
        <div style="font-size:12px;font-weight:800;color:#032812;margin-bottom:4px;letter-spacing:0.05em;">
          GO TEAM GO AGENCY
        </div>
        <div style="font-size:11px;color:#4b6353;margin-bottom:12px;line-height:1.5;">
          International Student-Athlete Recruiting & Placement<br>
          Direct inquiries: <a href="mailto:contact@goteamgoagency.com" style="color:#084323;font-weight:700;text-decoration:underline;">contact@goteamgoagency.com</a>
        </div>
        <div style="font-size:10px;color:#4b6353;line-height:1.4;">
          This recruit showcase was prepared for collegiate coaches and athletic directors.<br>
          © ${new Date().getFullYear()} Go Team Go. All rights reserved.
        </div>
        <div style="font-size:10px;color:#4b6353;margin-top:12px;border-top:1px solid #e3e9dc;padding-top:12px;line-height:1.6;">
          Not interested in this position or roster full? 
          <a href="${feedbackUrl}" style="color:#084323;font-weight:700;text-decoration:underline;">Let us know here</a>.
          <br>
          If you no longer wish to receive recruitment evaluations from Go Team Go, you can 
          <a href="${unsubscribeUrl}" style="color:#4b6353;text-decoration:underline;">manage email preferences</a>.
        </div>
      </td>
    </tr>
  `;
}

/** Renderiza e-mail individual de um único atleta */
export function renderRecruitEmail(data: RecruitEmailData) {
  const safeName = (data.athleteName || "").trim() || "Student-Athlete";
  const safeSlug = (data.athleteSlug || "").trim();

  const profileUrl = safeSlug
    ? `https://portfolio.goteamgoagency.com/athlete/${encodeURIComponent(safeSlug)}`
    : `https://portfolio.goteamgoagency.com`;

  const gradYear = data.highSchoolGraduation
    ? `Class of ${data.highSchoolGraduation}`
    : data.graduationYear
      ? `Class of ${data.graduationYear}`
      : "Class of 2026";

  const subject = `[Go Team Go Prospect] ${safeName} — ${data.positionName || "Prospect"} (${gradYear})`;

  const cardHtml = renderAthleteCardHtml(data);
  const footerHtml = renderEmailFooterHtml({
    recipientEmail: data.recipientEmail,
    coachId: data.coachId,
    athleteId: data.athleteId,
    position: data.positionName,
  });

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8faf5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#032812;line-height:1.6;">
  <!-- Envelope -->
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8faf5;padding:32px 12px;">
    <tr>
      <td align="center">
        <!-- Container Principal -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border:1px solid #e3e9dc;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(3,40,18,0.06);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color:#ffffff;padding:24px 32px 16px 32px;border-bottom:1px solid #e3e9dc;text-align:center;">
              <div style="display:inline-block;padding:5px 14px;background:#084323;border-radius:20px;color:#ffffff;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px;">
                GO TEAM GO • SCOUTING SHOWCASE
              </div>
              <div style="font-size:13px;color:#4b6353;letter-spacing:0.02em;font-weight:500;">
                Official College Recruitment Prospect Teaser
              </div>
            </td>
          </tr>

          <!-- Conteúdo -->
          <tr>
            <td style="padding:32px 28px 20px 28px;">
              <!-- Saudação -->
              <div style="font-size:15px;color:#032812;margin-bottom:20px;font-weight:600;">
                Dear Coach,
              </div>

              <!-- Card do Atleta -->
              ${cardHtml}

              <!-- Sub-aviso de exclusividade -->
              <div style="text-align:center;font-size:12px;color:#4b6353;margin-top:16px;margin-bottom:8px;">
                Verified match videos, academic fact sheet, and contact details are available on the official profile.
              </div>
            </td>
          </tr>

          ${footerHtml}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    html,
    profileUrl,
  };
}

/** Renderiza e-mail unificado contendo múltiplos atletas empilhados em 1 único e-mail para o coach */
export function renderMultiAthleteRecruitEmail(data: MultiAthleteEmailData) {
  const { athletes, coachName, institutionName, recipientEmail, coachId } = data;
  const safeCoachGreeting = coachName ? `Coach ${coachName}` : "Coach";
  const athleteCount = athletes.length;

  const subject = institutionName
    ? `[Go Team Go Showcase] ${athleteCount} Verified International Prospects (${institutionName})`
    : `[Go Team Go Showcase] ${athleteCount} Verified International Prospects for College Recruitment`;

  const cardsHtml = athletes.map((ath, idx) => renderAthleteCardHtml(ath, idx)).join("");

  const firstAthlete = athletes[0];
  const footerHtml = renderEmailFooterHtml({
    recipientEmail,
    coachId,
    athleteId: firstAthlete?.athleteId,
    position: firstAthlete?.positionName,
  });

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8faf5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#032812;line-height:1.6;">
  <!-- Envelope -->
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8faf5;padding:32px 12px;">
    <tr>
      <td align="center">
        <!-- Container Principal -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e3e9dc;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(3,40,18,0.06);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color:#ffffff;padding:24px 32px 16px 32px;border-bottom:1px solid #e3e9dc;text-align:center;">
              <div style="display:inline-block;padding:5px 14px;background:#084323;border-radius:20px;color:#ffffff;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px;">
                GO TEAM GO • MULTI-ATHLETE SHOWCASE
              </div>
              <div style="font-size:13px;color:#4b6353;letter-spacing:0.02em;font-weight:500;">
                Selected International Student-Athletes Available for Recruitment
              </div>
            </td>
          </tr>

          <!-- Conteúdo -->
          <tr>
            <td style="padding:32px 28px 16px 28px;">
              <!-- Saudação & Introdução -->
              <div style="font-size:15px;color:#032812;margin-bottom:12px;font-weight:600;">
                Dear ${safeCoachGreeting},
              </div>
              <div style="font-size:14px;color:#4b6353;line-height:1.6;margin-bottom:24px;">
                We have curated a dedicated selection of <strong>${athleteCount} international student-athletes</strong> currently eligible and actively seeking competitive collegiate programs. Explore their profiles, verified video highlights, and academic records below.
              </div>

              <!-- Cartões dos Atletas Empilhados -->
              ${cardsHtml}

              <!-- Sub-aviso de exclusividade -->
              <div style="text-align:center;font-size:12px;color:#4b6353;margin-top:8px;margin-bottom:8px;">
                All prospects undergo rigorous athletic vetting and academic credential validation by Go Team Go Agency.
              </div>
            </td>
          </tr>

          ${footerHtml}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    html,
  };
}

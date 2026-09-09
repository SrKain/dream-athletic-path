import { formatHeightImperial, formatGpa } from "@/lib/units";

export interface RecruitEmailData {
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
}

export function renderRecruitEmail(data: RecruitEmailData) {
  const safeName = (data.athleteName || "").trim() || "Student-Athlete";
  const safeSlug = (data.athleteSlug || "").trim();
  const initial = safeName.charAt(0).toUpperCase() || "A";

  const profileUrl = safeSlug
    ? `https://portfolio.goteamgoagency.com/athlete/${encodeURIComponent(safeSlug)}`
    : `https://portfolio.goteamgoagency.com`;

  const unsubscribeUrl = data.recipientEmail
    ? `https://portfolio.goteamgoagency.com/unsubscribe?email=${encodeURIComponent(data.recipientEmail)}`
    : `https://portfolio.goteamgoagency.com/unsubscribe`;

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

  const subject = `[Go Team Go Prospect] ${safeName} — ${data.positionName || "Prospect"} (${gradYear})`;

  const photoHtml = data.photoUrl
    ? `
    <div style="text-align:center;margin-bottom:20px;">
      <img src="${data.photoUrl}" alt="${safeName}" width="140" height="140" style="width:140px;height:140px;border-radius:50%;object-fit:cover;border:3px solid #f69e00;display:inline-block;box-shadow:0 6px 20px rgba(246,158,0,0.25);" />
    </div>
  `
    : `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="width:110px;height:110px;line-height:110px;border-radius:50%;background:#084323;border:3px solid #f69e00;color:#ffffff;font-size:36px;font-weight:bold;margin:0 auto;text-align:center;">
        ${initial}
      </div>
    </div>
  `;

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
            <td style="padding:32px 28px;">
              <!-- Saudação -->
              <div style="font-size:15px;color:#032812;margin-bottom:20px;font-weight:600;">
                Dear Coach,
              </div>

              <!-- Cartão do Atleta Hero -->
              <div style="background:#f8faf5;border:1px solid #e3e9dc;border-radius:14px;padding:24px 20px;margin-bottom:24px;text-align:center;">
                ${photoHtml}

                <h1 style="margin:0 0 6px 0;font-size:26px;font-weight:800;color:#032812;letter-spacing:-0.02em;line-height:1.2;">
                  ${data.athleteName}
                </h1>

                <div style="display:inline-block;padding:5px 14px;background:#084323;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.08em;border-radius:9999px;margin-bottom:16px;">
                  ${sportAndPosition}
                </div>

                <!-- Hook Line -->
                <div style="background:#ffffff;border:1px dashed #e3e9dc;border-radius:8px;padding:12px 16px;margin-top:8px;font-size:13px;color:#032812;font-style:italic;line-height:1.5;">
                  "${hookLine}"
                </div>
              </div>

              <!-- 4 Stat Highlights Grid -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <tr>
                  <td width="48%" style="padding:4px;">
                    <div style="background:#f8faf5;border:1px solid #e3e9dc;border-radius:10px;padding:12px;text-align:center;">
                      <div style="font-size:10px;color:#4b6353;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;margin-bottom:4px;">Height</div>
                      <div style="font-size:14px;color:#032812;font-weight:800;">${heightText}</div>
                    </div>
                  </td>
                  <td width="4%" style="padding:0;"></td>
                  <td width="48%" style="padding:4px;">
                    <div style="background:#f8faf5;border:1px solid #e3e9dc;border-radius:10px;padding:12px;text-align:center;">
                      <div style="font-size:10px;color:#4b6353;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;margin-bottom:4px;">Nationality</div>
                      <div style="font-size:14px;color:#032812;font-weight:800;">${nationalityText}</div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td width="48%" style="padding:4px;">
                    <div style="background:#f8faf5;border:1px solid #e3e9dc;border-radius:10px;padding:12px;text-align:center;">
                      <div style="font-size:10px;color:#4b6353;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;margin-bottom:4px;">Graduation</div>
                      <div style="font-size:14px;color:#032812;font-weight:800;">${gradYear}</div>
                    </div>
                  </td>
                  <td width="4%" style="padding:0;"></td>
                  <td width="48%" style="padding:4px;">
                    <div style="background:#f8faf5;border:1px solid #e3e9dc;border-radius:10px;padding:12px;text-align:center;">
                      <div style="font-size:10px;color:#4b6353;text-transform:uppercase;font-weight:700;letter-spacing:0.05em;margin-bottom:4px;">Status / Academic</div>
                      <div style="font-size:14px;color:#032812;font-weight:800;">${statusOrGpa}</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA Button Único -->
              <div style="text-align:center;margin:32px 0 20px 0;">
                <a href="${profileUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#f69e00;color:#032812;font-size:15px;font-weight:800;text-decoration:none;padding:16px 36px;border-radius:10px;letter-spacing:0.02em;box-shadow:0 6px 18px rgba(246,158,0,0.35);">
                  View Full Profile & Highlights →
                </a>
              </div>

              <!-- Sub-aviso de exclusividade -->
              <div style="text-align:center;font-size:12px;color:#4b6353;margin-bottom:8px;">
                Verified match videos, academic fact sheet, and contact details are available on the official profile.
              </div>
            </td>
          </tr>

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
              <div style="font-size:10px;color:#4b6353;margin-top:12px;border-top:1px solid #e3e9dc;padding-top:12px;">
                If you no longer wish to receive recruitment evaluations from Go Team Go, you can 
                <a href="${unsubscribeUrl}" style="color:#4b6353;text-decoration:underline;">unsubscribe here</a>.
              </div>
            </td>
          </tr>

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

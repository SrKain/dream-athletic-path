export interface CatalogEmailData {
  coachName?: string | null;
  institutionName?: string | null;
  customHeadline?: string | null;
  customMessage?: string | null;
  recipientEmail?: string | null;
}

export function renderCatalogEmail(data: CatalogEmailData = {}) {
  const safeCoachName = data.coachName ? `Coach ${data.coachName}` : "Coach";
  const portfolioUrl = "https://portfolio.goteamgoagency.com";
  const unsubscribeUrl = data.recipientEmail
    ? `https://portfolio.goteamgoagency.com/unsubscribe?email=${encodeURIComponent(data.recipientEmail)}`
    : `https://portfolio.goteamgoagency.com/unsubscribe`;

  const subject = data.institutionName
    ? `International Student-Athlete Roster • Go Team Go Recruiting Showcase (${data.institutionName})`
    : `International Student-Athlete Roster • Go Team Go Recruiting Showcase`;

  const headline =
    data.customHeadline?.trim() ||
    "Discover Verified International Recruits Ready for College Athletics";
  const introMessage =
    data.customMessage?.trim() ||
    "At Go Team Go Agency, we represent top-tier international student-athletes actively seeking competitive collegiate programs in the US. Each prospect in our portfolio undergoes rigorous athletic screening, academic credential verification, and highlight reel curation.";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8faf5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#032812;-webkit-font-smoothing:antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8faf5;min-height:100vh;padding:24px 12px;">
    <tr>
      <td align="center" valign="top">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border:1px solid #e3e9dc;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(3,40,18,0.06);">
          
          <!-- Top Accent Bar -->
          <tr>
            <td style="background-color:#f69e00;height:4px;line-height:4px;font-size:0;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:24px 28px 18px 28px;border-bottom:1px solid #e3e9dc;background-color:#ffffff;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size:11px;font-weight:800;color:#084323;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:4px;">
                      Go Team Go Agency • Official Scouting Showcase
                    </div>
                    <div style="font-size:18px;font-weight:800;color:#032812;letter-spacing:-0.02em;">
                      Collegiate Scouting Hub
                    </div>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display:inline-block;background-color:#084323;color:#ffffff;padding:5px 12px;border-radius:9999px;font-size:11px;font-weight:800;letter-spacing:0.04em;">
                      2025 / 2026 ROSTER
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting & Headline -->
          <tr>
            <td style="padding:28px 28px 20px 28px;">
              <div style="font-size:15px;font-weight:600;color:#032812;margin-bottom:8px;">
                Hello, ${safeCoachName}
              </div>
              <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:800;color:#032812;line-height:1.3;letter-spacing:-0.02em;">
                ${headline}
              </h1>
              <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#4b6353;">
                ${introMessage}
              </p>
            </td>
          </tr>

          <!-- Three Pillar Cards -->
          <tr>
            <td style="padding:0 28px 24px 28px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="31%" style="padding:4px;" valign="top">
                    <div style="background:#f8faf5;border:1px solid #e3e9dc;border-radius:10px;padding:14px 10px;text-align:center;">
                      <div style="font-size:11px;color:#084323;font-weight:800;letter-spacing:0.05em;margin-bottom:4px;text-transform:uppercase;">Verified Video</div>
                      <div style="font-size:12px;color:#4b6353;line-height:1.4;">Unedited match clips, full games & technical highlights.</div>
                    </div>
                  </td>
                  <td width="3%" style="padding:0;"></td>
                  <td width="32%" style="padding:4px;" valign="top">
                    <div style="background:#f8faf5;border:1px solid #e3e9dc;border-radius:10px;padding:14px 10px;text-align:center;">
                      <div style="font-size:11px;color:#084323;font-weight:800;letter-spacing:0.05em;margin-bottom:4px;text-transform:uppercase;">Academic Track</div>
                      <div style="font-size:12px;color:#4b6353;line-height:1.4;">Certified GPAs, TOEFL/Duolingo scores & NCAA Eligibility ID.</div>
                    </div>
                  </td>
                  <td width="3%" style="padding:0;"></td>
                  <td width="31%" style="padding:4px;" valign="top">
                    <div style="background:#f8faf5;border:1px solid #e3e9dc;border-radius:10px;padding:14px 10px;text-align:center;">
                      <div style="font-size:11px;color:#084323;font-weight:800;letter-spacing:0.05em;margin-bottom:4px;text-transform:uppercase;">Fast Placement</div>
                      <div style="font-size:12px;color:#4b6353;line-height:1.4;">Direct communication with athlete, family & agency advisors.</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Featured Sports Banner -->
          <tr>
            <td style="padding:0 28px 24px 28px;">
              <div style="background:#f8faf5;border:1px solid #e3e9dc;border-radius:12px;padding:18px 20px;">
                <div style="font-size:11px;color:#4b6353;text-transform:uppercase;font-weight:800;letter-spacing:0.08em;margin-bottom:10px;">
                  Active Sport Disciplines Available
                </div>
                <div style="font-size:13px;color:#032812;font-weight:700;line-height:1.8;">
                  ⚽ Men's & Women's Soccer &nbsp;•&nbsp; 🏀 Basketball &nbsp;•&nbsp; 🎾 Tennis<br>
                  🏃 Track & Field &nbsp;•&nbsp; 🏐 Volleyball &nbsp;•&nbsp; 🏊 Swimming
                </div>
              </div>
            </td>
          </tr>

          <!-- Primary CTA Button -->
          <tr>
            <td style="padding:8px 28px 32px 28px;text-align:center;">
              <a href="${portfolioUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#f69e00;color:#032812;font-size:15px;font-weight:800;text-decoration:none;padding:16px 36px;border-radius:10px;letter-spacing:0.02em;box-shadow:0 6px 18px rgba(246,158,0,0.35);">
                Explore Full Athlete Roster & Highlights →
              </a>
              <div style="margin-top:12px;font-size:12px;color:#4b6353;">
                Direct access to athlete profiles, statistics, and full-match videos.
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
                This recruiting showcase was prepared for collegiate coaches and athletic directors.<br>
                © ${new Date().getFullYear()} Go Team Go. All rights reserved.
              </div>
              <div style="font-size:10px;color:#4b6353;margin-top:12px;border-top:1px solid #e3e9dc;padding-top:12px;">
                If you no longer wish to receive recruitment showcases from Go Team Go, you can 
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
    portfolioUrl,
  };
}

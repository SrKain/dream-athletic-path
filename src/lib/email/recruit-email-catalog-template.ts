import { EMAIL_BASE_URL, EMAIL_COLORS, EMAIL_SIGNATURE, EMAIL_ASSETS } from "./email-brand";
import {
  escapeHtml,
  renderEmailShell,
  renderEmailHeader,
  renderEmailHero,
  renderEmailIntro,
  renderSignature,
  renderFeedbackBlock,
  renderBottomBar,
  renderLegalFooter,
} from "./email-layout";

export interface CatalogEmailData {
  coachName?: string | null;
  institutionName?: string | null;
  customHeadline?: string | null;
  customMessage?: string | null;
  customGreeting?: string | null;
  customIntroduction?: string | null;
  customHook?: string | null;
  recipientEmail?: string | null;
  coachId?: string | null;
  logoUrl?: string | null;
  heroBackgroundUrl?: string | null;
}

export function generateCatalogPlainText(data: CatalogEmailData): string {
  const greetingLine = data.customGreeting?.trim()
    ? data.customGreeting.trim()
    : data.coachName
      ? `Hi Coach ${data.coachName.replace(/^Coach\s+/i, "")},`
      : "Hi Coach,";

  const portfolioUrl = EMAIL_BASE_URL;

  const headline =
    data.customHeadline?.trim() ||
    "Discover Verified International Recruits Ready for College Volleyball";

  const introText =
    data.customIntroduction?.trim() ||
    data.customMessage?.trim() ||
    "At Go Team Go Agency, we represent high-performance international volleyball student-athletes actively seeking competitive collegiate programs in the US. Every prospect undergoes athletic vetting, academic credential evaluation, and match highlight verification.";

  const hookText =
    data.customHook?.trim() ||
    "Explore our complete verified athlete roster and match films online.";

  const lines = [
    `GO TEAM GO AGENCY — VOLLEYBALL RECRUITING PORTFOLIO`,
    `==============================================`,
    ``,
    greetingLine,
    ``,
    headline,
    ``,
    introText,
    ``,
    hookText,
    ``,
    `EXPLORE FULL ATHLETE ROSTER ONLINE:`,
    `${portfolioUrl}`,
    ``,
    `NEED A SPECIFIC PROFILE?`,
    `Contact Founder Fabiana Andrade directly at ${EMAIL_SIGNATURE.email} to request custom athlete matches.`,
    ``,
    `----------------------------------------------`,
    `${EMAIL_SIGNATURE.name}`,
    `${EMAIL_SIGNATURE.role}`,
    `Email: ${EMAIL_SIGNATURE.email}`,
    `Instagram: ${EMAIL_SIGNATURE.instagram}`,
    `Website: ${EMAIL_SIGNATURE.websiteUrl}`,
    `----------------------------------------------`,
    `Not recruiting currently? Share feedback: ${portfolioUrl}/feedback?email=${encodeURIComponent(data.recipientEmail || "")}`,
    `Manage email preferences / Unsubscribe: ${portfolioUrl}/unsubscribe?email=${encodeURIComponent(data.recipientEmail || "")}`,
  ];

  return lines.join("\n");
}

export function renderCatalogEmail(data: CatalogEmailData = {}) {
  const coachGreeting = data.coachName ? data.coachName.replace(/^Coach\s+/i, "") : null;
  const portfolioUrl = EMAIL_BASE_URL;

  const subject = data.customHeadline?.trim()
    ? data.customHeadline.trim()
    : data.institutionName
      ? `International Volleyball Roster • Go Team Go Recruiting Showcase (${data.institutionName})`
      : `International Volleyball Roster • Go Team Go Recruiting Showcase`;

  const introParagraph = (data.customIntroduction || data.customMessage)?.trim()
    ? escapeHtml((data.customIntroduction || data.customMessage)!.trim())
    : "At Go Team Go Agency, we represent top-tier international volleyball student-athletes actively seeking competitive collegiate programs in the US. Each prospect in our portfolio undergoes rigorous athletic screening, academic credential verification, and highlight reel curation.";

  // Direct Catalog Action Showcase (Exclusivo Volleyball / Roster Completo)
  const catalogShowcaseHtml = `
  <!-- DIRECT CATALOG ACTION SHOWCASE -->
  <tr>
    <td style="padding:10px 28px 24px 28px;background-color:${EMAIL_COLORS.white};">
      <div style="background-color:${EMAIL_COLORS.cardBg};border:1px solid ${EMAIL_COLORS.cardBorder};border-radius:12px;padding:24px;text-align:center;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:900;color:${EMAIL_COLORS.darkGreenPrimary};letter-spacing:1.4px;text-transform:uppercase;margin-bottom:8px;">
          OFFICIAL VOLLEYBALL ROSTER &amp; RECRUITING SHOWCASE
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${EMAIL_COLORS.textDark};max-width:520px;margin:0 auto 18px auto;">
          Access verified video film, academic evaluations (GPA, test scores, eligibility), and biometric measurements for our active volleyball student-athletes.
        </div>
        <div>
          <a href="${portfolioUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:${EMAIL_COLORS.goldPrimary};color:${EMAIL_COLORS.darkGreenPrimary};font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:900;letter-spacing:1px;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:24px;box-shadow:0 4px 14px rgba(246,158,0,0.35);">
            EXPLORE FULL VOLLEYBALL ROSTER &amp; HIGHLIGHTS &rarr;
          </a>
        </div>
      </div>
    </td>
  </tr>`;

  // Request CTA Bar
  const requestCtaHtml = `
  <!-- CTA REQUEST BAR -->
  <tr>
    <td style="padding:0 28px 24px 28px;background-color:${EMAIL_COLORS.white};">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${EMAIL_COLORS.ctaBg};border:1px solid ${EMAIL_COLORS.cardBorder};border-radius:12px;padding:18px 20px;">
        <tr>
          <td width="36" valign="middle" class="mobile-hide" style="padding-right:14px;">
            <img src="${EMAIL_ASSETS.icons.users}" alt="Recruiting Roster" width="32" height="32" style="width:32px;height:32px;display:block;border:0;" />
          </td>
          <td valign="middle" class="mobile-stack" align="left" style="padding-right:12px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:900;color:${EMAIL_COLORS.darkGreenPrimary};letter-spacing:1px;text-transform:uppercase;margin-bottom:3px;">
              LOOKING FOR A SPECIFIC POSITION OR CLASS YEAR?
            </div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:${EMAIL_COLORS.textMuted};line-height:1.45;">
              Send us your scholarship availability and roster needs, and our advisors will prepare a personalized candidate dossier.
            </div>
          </td>
          <td valign="middle" align="right" class="mobile-stack" style="padding-top:6px;white-space:nowrap;">
            <a href="mailto:${EMAIL_SIGNATURE.email}?subject=${encodeURIComponent("[Go Team Go Showcase] Specific Roster Request")}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:${EMAIL_COLORS.darkGreenPrimary};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;text-decoration:none;padding:11px 18px;border-radius:24px;">
              REQUEST CANDIDATE DOSSIER &rarr;
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  const bodyContentHtml = [
    renderEmailHeader({ logoUrl: data.logoUrl }),
    renderEmailHero({
      yearText: "2027",
      sportText: "VOLLEYBALL",
      titleLine2: "RECRUITING SHOWCASE",
      subtitleText: "INTERNATIONAL ATHLETES AVAILABLE NOW",
      heroBackgroundUrl: data.heroBackgroundUrl,
    }),
    renderEmailIntro({
      coachFirstName: coachGreeting,
      customGreeting: data.customGreeting,
      customIntroduction: data.customIntroduction,
      customParagraph: introParagraph,
      customHook: data.customHook,
      sportText: "volleyball",
      yearText: "2027",
    }),
    catalogShowcaseHtml,
    requestCtaHtml,
    renderSignature({ logoUrl: data.logoUrl }),
    renderFeedbackBlock({
      recipientEmail: data.recipientEmail,
      coachId: data.coachId,
    }),
    renderBottomBar(),
    renderLegalFooter({ recipientEmail: data.recipientEmail }),
  ].join("");

  const html = renderEmailShell({
    title: subject,
    preheader: `Official Go Team Go Volleyball Recruiting Board — Verified international student-athletes ready for US college athletics.`,
    bodyContentHtml,
  });

  const text = generateCatalogPlainText(data);

  return {
    subject,
    html,
    text,
  };
}

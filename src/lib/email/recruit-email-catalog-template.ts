import { renderCatalogRecruitEmail, type RecruitEmailRenderOptions } from "./recruit-email";
import { EMAIL_BASE_URL, EMAIL_SIGNATURE } from "./email-brand";

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
  campaignId?: string | null;
}

export function generateCatalogPlainText(data: CatalogEmailData): string {
  const coach = data.coachName ? data.coachName.replace(/^Coach\s+/i, "") : "Coach";
  const portfolioUrl = EMAIL_BASE_URL;

  const lines = [
    `Hi Coach ${coach},`,
    "",
    "GO TEAM GO AGENCY — VERIFIED INTERNATIONAL RECRUITS",
    "",
    "QUICK ACTIONS:",
    `- View Full Portfolio: ${portfolioUrl}`,
    `- Request Athletes by Position: Reply to this email or contact ${EMAIL_SIGNATURE.email}`,
    "",
    "ABOUT GO TEAM GO AGENCY",
    data.customIntroduction ||
      data.customMessage ||
      "Go Team Go connects verified international volleyball prospects with US college programs.",
    "",
    "---",
    `${EMAIL_SIGNATURE.name}`,
    `${EMAIL_SIGNATURE.role} - ${EMAIL_SIGNATURE.agency}`,
    `${EMAIL_SIGNATURE.email} | ${EMAIL_SIGNATURE.website}`,
    "",
    `Unsubscribe: ${portfolioUrl}/unsubscribe?email=${encodeURIComponent(data.recipientEmail || "")}`,
  ];

  return lines.join("\n");
}

export function renderCatalogEmail(data: CatalogEmailData = {}) {
  const portfolioUrl = EMAIL_BASE_URL;

  const intro =
    data.customIntroduction?.trim() ||
    data.customMessage?.trim() ||
    "Go Team Go connects verified international volleyball prospects with top US college programs, ensuring complete athletic and academic qualification.";

  const result = renderCatalogRecruitEmail({
    coachName: data.coachName?.replace(/^Coach\s+/i, "") || undefined,
    coachEmail: data.recipientEmail || undefined,
    greetingText: data.customGreeting || undefined,
    introductionText: intro,
    agencyLogoUrl: data.logoUrl || undefined,
    appUrl: EMAIL_BASE_URL,
    campaignId: data.campaignId,
  });

  const subject = data.customHeadline?.trim() ? data.customHeadline.trim() : result.subject;

  const text = generateCatalogPlainText(data);

  return {
    subject,
    html: result.html,
    text,
    portfolioUrl,
  };
}

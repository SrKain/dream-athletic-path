import { assertEmailIntegrity } from "./email-blocks";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail,
  type RecruitEmailData,
} from "./recruit-email-template";
import { renderCatalogRecruitEmail } from "./recruit-email";
import { generateCatalogPlainText } from "./recruit-email-catalog-template";
import type { EmailBlock } from "./personal-email-renderer";
import { EMAIL_BASE_URL } from "./email-brand";
import { resolveEmailSubject } from "./email-personalization";

export interface MailerCampaignSnapshot {
  schemaVersion: number;
  mode: "single_athlete" | "multi_athlete" | "catalog";
  subjectTemplate?: string | null;
  customGreeting?: string | null;
  customIntroduction?: string | null;
  customHook?: string | null;
  customClosing?: string | null;
  customHeadline?: string | null;
  customMessage?: string | null;
  blocks?: EmailBlock[] | null;
  athlete?: RecruitEmailData | null;
  athletes?: RecruitEmailData[] | null;
  logoUrl?: string | null;
  heroBackgroundUrl?: string | null;
  year: number;
  sportName?: string;
  appUrl?: string;
}

export interface RecipientRenderVariables {
  recipientEmail: string;
  recipientName?: string | null;
  coachLastName?: string | null;
  institutionName?: string | null;
  coachId?: string | null;
}

export interface RenderedQueuedEmail {
  html: string;
  text: string;
  subject: string;
  expectedAthleteIds: string[];
  renderedAthleteIds: string[];
}

/**
 * Cria o snapshot imutável de uma campanha a partir dos dados do formulário/composer.
 */
export function createCampaignSnapshot(data: {
  mode: "single_athlete" | "multi_athlete" | "catalog";
  subjectTemplate?: string | null;
  customGreeting?: string | null;
  customIntroduction?: string | null;
  customHook?: string | null;
  customClosing?: string | null;
  customHeadline?: string | null;
  customMessage?: string | null;
  blocks?: EmailBlock[] | null;
  athlete?: RecruitEmailData | null;
  athletes?: RecruitEmailData[] | null;
  logoUrl?: string | null;
  heroBackgroundUrl?: string | null;
  sportName?: string;
  year?: number;
}): MailerCampaignSnapshot {
  return {
    schemaVersion: 1,
    mode: data.mode,
    subjectTemplate: data.subjectTemplate || null,
    customGreeting: data.customGreeting || null,
    customIntroduction: data.customIntroduction || null,
    customHook: data.customHook || null,
    customClosing: data.customClosing || null,
    customHeadline: data.customHeadline || null,
    customMessage: data.customMessage || null,
    blocks: data.blocks || null,
    athlete: data.athlete || null,
    athletes: data.athletes || null,
    logoUrl: data.logoUrl || null,
    heroBackgroundUrl: data.heroBackgroundUrl || null,
    sportName: data.sportName || "Volleyball",
    year: data.year ?? new Date().getFullYear(),
    appUrl: EMAIL_BASE_URL,
  };
}

/**
 * Renderiza o e-mail no momento do envio a partir do snapshot e variáveis do destinatário (4.2).
 * Aplica assertEmailIntegrity fail-closed.
 */
export function renderQueuedEmail(
  snapshot: MailerCampaignSnapshot,
  recipient: RecipientRenderVariables,
  campaignId?: string,
): RenderedQueuedEmail {
  const coachName = recipient.recipientName || undefined;
  const coachLastName = recipient.coachLastName ?? null;
  const coachEmail = recipient.recipientEmail;
  const coachId = recipient.coachId ?? null;
  const institutionName = recipient.institutionName ?? null;

  if (snapshot.mode === "single_athlete") {
    if (!snapshot.athlete) {
      throw new Error("Missing single athlete in campaign snapshot.");
    }

    const emailData: RecruitEmailData = {
      ...snapshot.athlete,
      recipientEmail: coachEmail,
      coachName,
      coachLastName,
      coachId,
      institutionName,
      customSubject: snapshot.subjectTemplate,
      customGreeting: snapshot.customGreeting,
      customIntroduction: snapshot.customIntroduction,
      customHook: snapshot.customHook,
      logoUrl: snapshot.logoUrl,
      heroBackgroundUrl: snapshot.heroBackgroundUrl,
      campaignId: campaignId || undefined,
      blocks: snapshot.blocks,
    };

    const rendered = renderRecruitEmail(emailData);

    // Validação fail-closed de integridade
    assertEmailIntegrity({
      mode: "single_athlete",
      expectedAthleteIds: rendered.expectedAthleteIds,
      renderedAthleteIds: rendered.renderedAthleteIds,
      missingAthleteIds: rendered.missingAthleteIds,
      html: rendered.html,
      text: rendered.text,
    });

    return {
      html: rendered.html,
      text: rendered.text,
      subject: rendered.subject,
      expectedAthleteIds: rendered.expectedAthleteIds,
      renderedAthleteIds: rendered.renderedAthleteIds,
    };
  }

  if (snapshot.mode === "multi_athlete") {
    const athletes = snapshot.athletes || [];
    if (athletes.length === 0) {
      throw new Error("Missing athletes list in multi_athlete campaign snapshot.");
    }

    const rendered = renderMultiAthleteRecruitEmail({
      athletes,
      coachName,
      coachLastName,
      coachId,
      recipientEmail: coachEmail,
      institutionName,
      customSubject: snapshot.subjectTemplate,
      customGreeting: snapshot.customGreeting,
      customIntroduction: snapshot.customIntroduction,
      customHook: snapshot.customHook,
      logoUrl: snapshot.logoUrl,
      heroBackgroundUrl: snapshot.heroBackgroundUrl,
      campaignId: campaignId || undefined,
      blocks: snapshot.blocks,
    });

    assertEmailIntegrity({
      mode: "multi_athlete",
      expectedAthleteIds: rendered.expectedAthleteIds,
      renderedAthleteIds: rendered.renderedAthleteIds,
      missingAthleteIds: rendered.missingAthleteIds,
      html: rendered.html,
      text: rendered.text,
    });

    return {
      html: rendered.html,
      text: rendered.text,
      subject: rendered.subject,
      expectedAthleteIds: rendered.expectedAthleteIds,
      renderedAthleteIds: rendered.renderedAthleteIds,
    };
  }

  // Modo Catalog
  const athletes = (snapshot.athletes || []).map((ath) => ({
    id: ath.athleteId || "athlete-id",
    name: ath.athleteName || "Student-Athlete",
    slug: ath.athleteSlug || "",
    photoUrl: ath.photoUrl,
    positionEn: ath.positionName,
    heightCm: ath.heightCm,
    graduationYear: ath.graduationYear,
    highSchoolGraduation: ath.highSchoolGraduation,
    gpa: ath.gpa,
    athleteStatus: ath.athleteStatus,
    countryEn: ath.nationality,
    countryFlag: ath.countryFlag,
    courseOfInterest: ath.courseOfInterest,
    collegeStartDate: ath.collegeStartDate,
  }));

  const catalogResult = renderCatalogRecruitEmail({
    coachName,
    coachLastName,
    coachEmail,
    customSubject: resolveEmailSubject(snapshot.subjectTemplate, snapshot.customHeadline || ""),
    greetingText: snapshot.customGreeting || undefined,
    headlineText: snapshot.customHeadline || undefined,
    catalogHookText: snapshot.customHook || undefined,
    introductionText: snapshot.customMessage || undefined,
    agencyLogoUrl: snapshot.logoUrl,
    appUrl: snapshot.appUrl || EMAIL_BASE_URL,
    campaignId: campaignId || undefined,
    athletes,
  });

  const catalogText = generateCatalogPlainText({
    coachName,
    coachLastName,
    recipientEmail: coachEmail,
    customSubject: snapshot.subjectTemplate,
    customGreeting: snapshot.customGreeting,
    customHeadline: snapshot.customHeadline,
    customHook: snapshot.customHook,
    customMessage: snapshot.customMessage,
    campaignId: campaignId || undefined,
  });

  return {
    html: catalogResult.html,
    text: catalogText,
    subject: catalogResult.subject,
    expectedAthleteIds: [],
    renderedAthleteIds: [],
  };
}

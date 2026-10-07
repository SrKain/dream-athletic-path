import {
  renderSingleAthleteRecruitEmail,
  renderMultiAthleteRecruitEmail as renderMultiAthleteRecruitEmailNew,
  generateRecruitEmailPlainText as generateRecruitEmailPlainTextNew,
  generateMultiAthletePlainText as generateMultiAthletePlainTextNew,
  renderAthleteCard as renderAthleteCardNew,
  type RecruitEmailAthlete,
  type RecruitEmailRenderOptions,
} from "./recruit-email";
import { EMAIL_BASE_URL, EMAIL_SIGNATURE } from "./email-brand";
import {
  renderSignature,
  renderFeedbackBlock,
  renderBottomBar,
  renderLegalFooter,
  type EmailCardAthlete,
} from "./email-layout";

export interface RecruitEmailData extends EmailCardAthlete {
  recipientEmail?: string | null;
  coachId?: string | null;
  coachName?: string | null;
  institutionName?: string | null;
  countryFlag?: string | null;
  customGreeting?: string | null;
  customIntroduction?: string | null;
  customHook?: string | null;
  logoUrl?: string | null;
  heroBackgroundUrl?: string | null;
}

export interface MultiAthleteEmailData {
  athletes: RecruitEmailData[];
  coachName?: string | null;
  institutionName?: string | null;
  recipientEmail?: string | null;
  coachId?: string | null;
  customGreeting?: string | null;
  customIntroduction?: string | null;
  customHook?: string | null;
  logoUrl?: string | null;
  heroBackgroundUrl?: string | null;
}

function mapEmailDataToAthlete(data: RecruitEmailData): RecruitEmailAthlete {
  const gradYearNumber = data.highSchoolGraduation
    ? parseInt(data.highSchoolGraduation, 10) || data.graduationYear || undefined
    : data.graduationYear || undefined;

  return {
    id: data.athleteId || "athlete-id",
    name: data.athleteName || "Student-Athlete",
    slug: data.athleteSlug || "",
    photoUrl: data.photoUrl,
    positionEn: data.positionName,
    heightCm: data.heightCm,
    graduationYear: gradYearNumber,
    gpa: data.gpa,
    athleteStatus: data.athleteStatus,
    countryEn: data.nationality,
    countryFlag: data.countryFlag,
    highlightVideoUrl: data.highlightVideoUrl,
    highlightNote: data.highlightNote,
  };
}

/**
 * Renderiza o bloco individual de card de atleta (compatibilidade e reuso)
 */
export function renderAthleteCardHtml(data: RecruitEmailData, _index = 0): string {
  const ath = mapEmailDataToAthlete(data);
  return renderAthleteCardNew(ath, {
    appUrl: EMAIL_BASE_URL,
    coachName: data.coachName || undefined,
    coachEmail: data.recipientEmail || undefined,
  });
}

/**
 * Renderiza o rodapé unificado institucional para compatibilidade onde invocado isoladamente
 */
export function renderEmailFooterHtml(params: {
  recipientEmail?: string | null;
  coachId?: string | null;
  athleteId?: string | null;
  position?: string | null;
  logoUrl?: string | null;
}): string {
  return [
    renderSignature({ logoUrl: params.logoUrl }),
    renderFeedbackBlock(params),
    renderBottomBar(),
    renderLegalFooter({ recipientEmail: params.recipientEmail }),
  ].join("");
}

/**
 * Gera a versão em texto puro (Body.Text) do e-mail unitário (atletas e specs primeiro).
 */
export function generateRecruitEmailPlainText(data: RecruitEmailData): string {
  const athlete = mapEmailDataToAthlete(data);
  return generateRecruitEmailPlainTextNew({
    athlete,
    coachName: data.coachName || undefined,
    coachEmail: data.recipientEmail || undefined,
    greetingText: data.customGreeting || undefined,
    introductionText: data.customIntroduction || undefined,
    hookText: data.customHook || undefined,
    sportName: data.sportName || "Volleyball",
    appUrl: EMAIL_BASE_URL,
  });
}

/**
 * Renderiza e-mail individual de um único atleta ("ATHLETE SPOTLIGHT" - Redesenho Leitura em 5 Segundos).
 */
export function renderRecruitEmail(data: RecruitEmailData) {
  const athlete = mapEmailDataToAthlete(data);
  const safeSlug = (data.athleteSlug || "").trim();
  const profileUrl = safeSlug
    ? `${EMAIL_BASE_URL}/athlete/${encodeURIComponent(safeSlug)}`
    : EMAIL_BASE_URL;

  const result = renderSingleAthleteRecruitEmail({
    athlete,
    coachName: data.coachName || undefined,
    coachEmail: data.recipientEmail || undefined,
    greetingText: data.customGreeting || undefined,
    introductionText: data.customIntroduction || undefined,
    hookText: data.customHook || undefined,
    agencyLogoUrl: data.logoUrl || undefined,
    sportName: data.sportName || "Volleyball",
    appUrl: EMAIL_BASE_URL,
  });

  const text = generateRecruitEmailPlainText(data);

  return {
    subject: result.subject,
    html: result.html,
    text,
    profileUrl,
  };
}

/**
 * Gera a versão em texto puro (Body.Text) do e-mail multi-atleta (atletas e specs primeiro).
 */
export function generateMultiAthletePlainText(data: MultiAthleteEmailData): string {
  const athletes = (data.athletes || []).map(mapEmailDataToAthlete);
  return generateMultiAthletePlainTextNew({
    athletes,
    coachName: data.coachName || undefined,
    coachEmail: data.recipientEmail || undefined,
    greetingText: data.customGreeting || undefined,
    introductionText: data.customIntroduction || undefined,
    hookText: data.customHook || undefined,
    sportName: data.athletes[0]?.sportName || "Volleyball",
    appUrl: EMAIL_BASE_URL,
  });
}

/**
 * Renderiza e-mail unificado contendo múltiplos atletas no layout "Recruiting Board" (1 por linha, largura total).
 */
export function renderMultiAthleteRecruitEmail(data: MultiAthleteEmailData) {
  const athletes = (data.athletes || []).map(mapEmailDataToAthlete);
  const firstAthlete = data.athletes[0];

  const result = renderMultiAthleteRecruitEmailNew({
    athletes,
    coachName: data.coachName || undefined,
    coachEmail: data.recipientEmail || undefined,
    greetingText: data.customGreeting || undefined,
    introductionText: data.customIntroduction || undefined,
    hookText: data.customHook || undefined,
    agencyLogoUrl: data.logoUrl || undefined,
    sportName: firstAthlete?.sportName || "Volleyball",
    gradYear: firstAthlete?.graduationYear || firstAthlete?.highSchoolGraduation || undefined,
    appUrl: EMAIL_BASE_URL,
  });

  const text = generateMultiAthletePlainText(data);

  return {
    subject: result.subject,
    html: result.html,
    text,
  };
}

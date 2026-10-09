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
  buildDefaultEmailBlocks,
  buildFixedEmailBlocks,
  renderPersonalEmail,
  type EmailBlock,
} from "./personal-email-renderer";
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
  campaignId?: string | null;
  /** Corpo composto manualmente (texto + cards). Ausente = blocos padrão. */
  blocks?: EmailBlock[] | null;
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
  campaignId?: string | null;
  /** Corpo composto manualmente (texto + cards). Ausente = blocos padrão. */
  blocks?: EmailBlock[] | null;
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
    courseOfInterest: data.courseOfInterest,
    collegeStartDate: data.collegeStartDate,
    currentSchool: data.currentSchool,
    stats: data.stats,
    teamContribution: data.teamContribution,
    videos: data.videos,
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
function buildLegacyGreetingText(data: RecruitEmailData | MultiAthleteEmailData, athleteIds: string[]) {
  const coachName = (data.coachName || "Coach").replace(/^Coach\s+/i, "").trim() || "Coach";
  const coachGreeting = coachName ? `Coach ${coachName}` : "Coach";
  const sportName =
    "sportName" in data && data.sportName
      ? data.sportName
      : "athletes" in data && data.athletes[0]?.sportName
        ? data.athletes[0].sportName
        : "Volleyball";
  const gradYear =
    ("graduationYear" in data && data.graduationYear) ||
    ("highSchoolGraduation" in data && data.highSchoolGraduation) ||
    ("athletes" in data && data.athletes[0]?.graduationYear) ||
    ("athletes" in data && data.athletes[0]?.highSchoolGraduation) ||
    undefined;

  if (athleteIds.length <= 1) {
    return `Hi ${coachGreeting}, verified ${sportName} prospect${gradYear ? `, Class of ${gradYear}` : ""}:`;
  }

  return `Hi ${coachGreeting}, ${athleteIds.length} verified ${sportName} prospects${gradYear ? `, Class of ${gradYear}` : ""}:`;
}

function resolveLegacyBodyBlocks(data: RecruitEmailData | MultiAthleteEmailData, athleteIds: string[]) {
  if (data.blocks?.length) return data.blocks;

  const defaults = buildDefaultEmailBlocks(athleteIds);
  const greeting = (data.customGreeting || buildLegacyGreetingText(data, athleteIds) || "").trim();
  const hook = (data.customHook || "").trim();
  const intro = (data.customIntroduction || "").trim();
  const defaultIntro = athleteIds.length > 1
    ? "I hope you're doing well. I selected a few athletes I believe could be a good fit for your program."
    : "I hope you're doing well. I found an athlete who I believe could be a great fit for what you're currently looking for.";

  return buildFixedEmailBlocks(
    {
      greeting: greeting || (defaults[0]?.type === "text" ? defaults[0].content.split("\n\n")[0] : "Hi Coach,"),
      introduction: intro || defaultIntro,
      athleteOrder: athleteIds,
      closing: hook || "Let me know what you think.",
    },
    athleteIds,
  );
}

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
    campaignId: data.campaignId,
  });

  // Formato pessoal: texto do usuário + card(s) + assinatura + ações obrigatórias.
  const personal = renderPersonalEmail({
    blocks: resolveLegacyBodyBlocks(data, [athlete.id]),
    athletes: [athlete],
    subject: result.subject,
    preheader: result.preheader,
    coachName: data.coachName || undefined,
    coachEmail: data.recipientEmail,
    coachId: data.coachId,
    campaignId: data.campaignId,
    appUrl: EMAIL_BASE_URL,
    logoUrl: data.logoUrl,
  });

  return {
    subject: result.subject,
    html: personal.html,
    text: personal.text,
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
    campaignId: data.campaignId,
  });

  const personal = renderPersonalEmail({
    blocks: resolveLegacyBodyBlocks(data, athletes.map((a) => a.id)),
    athletes,
    subject: result.subject,
    preheader: result.preheader,
    coachName: data.coachName || undefined,
    coachEmail: data.recipientEmail,
    coachId: data.coachId,
    campaignId: data.campaignId,
    appUrl: EMAIL_BASE_URL,
    logoUrl: data.logoUrl,
  });

  return {
    subject: result.subject,
    html: personal.html,
    text: personal.text,
  };
}

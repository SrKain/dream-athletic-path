import { EMAIL_BASE_URL, EMAIL_SIGNATURE } from "./email-brand";
import {
  escapeHtml,
  renderEmailShell,
  renderEmailHeader,
  renderEmailHero,
  renderEmailIntro,
  renderFeaturedHeader,
  renderAthleteCard,
  renderAthleteGrid,
  renderRequestCtaBar,
  renderSignature,
  renderFeedbackBlock,
  renderBottomBar,
  renderLegalFooter,
  type EmailCardAthlete,
} from "./email-layout";
import { formatHeightImperial, formatGpa } from "@/lib/units";

export interface RecruitEmailData extends EmailCardAthlete {
  recipientEmail?: string | null;
  coachId?: string | null;
  coachName?: string | null;
  institutionName?: string | null;
  countryFlag?: string | null;
}

export interface MultiAthleteEmailData {
  athletes: RecruitEmailData[];
  coachName?: string | null;
  institutionName?: string | null;
  recipientEmail?: string | null;
  coachId?: string | null;
}

/** Renderiza o bloco individual de card de atleta (compatibilidade e reuso) */
export function renderAthleteCardHtml(data: RecruitEmailData, index = 0): string {
  return renderAthleteCard(data, index);
}

/** Renderiza o rodapé unificado institucional para compatibilidade onde invocado isoladamente */
export function renderEmailFooterHtml(params: {
  recipientEmail?: string | null;
  coachId?: string | null;
  athleteId?: string | null;
  position?: string | null;
}): string {
  return [
    renderSignature(),
    renderFeedbackBlock(params),
    renderBottomBar(),
    renderLegalFooter({ recipientEmail: params.recipientEmail }),
  ].join("");
}

/**
 * Gera a versão em texto puro (Body.Text) do e-mail unitário para entregar no Amazon SES.
 */
export function generateRecruitEmailPlainText(data: RecruitEmailData): string {
  const safeName = (data.athleteName || "").trim() || "Student-Athlete";
  const safeSlug = (data.athleteSlug || "").trim();
  const profileUrl = safeSlug
    ? `${EMAIL_BASE_URL}/athlete/${encodeURIComponent(safeSlug)}`
    : EMAIL_BASE_URL;

  const heightImperial = formatHeightImperial(data.heightCm);
  const heightStr = heightImperial
    ? data.heightCm
      ? `${heightImperial} (${data.heightCm} cm)`
      : heightImperial
    : "Verified on profile";

  const gradYear = data.highSchoolGraduation
    ? `Class of ${data.highSchoolGraduation}`
    : data.graduationYear
      ? `Class of ${data.graduationYear}`
      : "Class of 2027";

  const gpaStr = formatGpa(data.gpa);

  const lines = [
    `GO TEAM GO AGENCY — ATHLETE SCOUTING SPOTLIGHT`,
    `==============================================`,
    ``,
    `Hi Coach,`,
    ``,
    `I would like to present verified international prospect ${safeName}, available for collegiate recruitment.`,
    ``,
    `ATHLETE DETAILS:`,
    `- Name: ${safeName}`,
    `- Sport: ${data.sportName || "Volleyball"}`,
    `- Position: ${data.positionName || "Prospect"}`,
    `- Height: ${heightStr}`,
    `- Graduation: ${gradYear}`,
    `- GPA: ${gpaStr ? gpaStr : "Verified"}`,
    data.highlightNote ? `- Note: "${data.highlightNote}"` : null,
    data.budget ? `- Financial: ${data.budget}` : null,
    `- Full Match Film & Highlights: ${data.highlightVideoUrl || profileUrl}`,
    `- Official Profile: ${profileUrl}`,
    ``,
    `LOOKING FOR SPECIFIC PROFILES?`,
    `Contact Founder Fabiana Andrade directly at ${EMAIL_SIGNATURE.email} to request custom athlete scouting.`,
    ``,
    `----------------------------------------------`,
    `${EMAIL_SIGNATURE.name}`,
    `${EMAIL_SIGNATURE.role}`,
    `Email: ${EMAIL_SIGNATURE.email}`,
    `Instagram: ${EMAIL_SIGNATURE.instagram}`,
    `Website: ${EMAIL_SIGNATURE.websiteUrl}`,
    `----------------------------------------------`,
    `Not the right fit? Share recruitment feedback: ${EMAIL_BASE_URL}/feedback?email=${encodeURIComponent(data.recipientEmail || "")}`,
    `Manage email preferences / Unsubscribe: ${EMAIL_BASE_URL}/unsubscribe?email=${encodeURIComponent(data.recipientEmail || "")}`,
  ];

  return lines.filter((l) => l !== null).join("\n");
}

/**
 * Renderiza e-mail individual de um único atleta ("ATHLETE SPOTLIGHT").
 */
export function renderRecruitEmail(data: RecruitEmailData) {
  const safeName = (data.athleteName || "").trim() || "Student-Athlete";
  const safeSlug = (data.athleteSlug || "").trim();
  const profileUrl = safeSlug
    ? `${EMAIL_BASE_URL}/athlete/${encodeURIComponent(safeSlug)}`
    : EMAIL_BASE_URL;

  const gradYear =
    data.highSchoolGraduation || (data.graduationYear ? String(data.graduationYear) : "2027");
  const sport = data.sportName || "Volleyball";
  const position = data.positionName || "Prospect";

  const subject = `[Go Team Go Prospect] ${safeName} — ${position} (${gradYear})`;

  const cardHtml = renderAthleteCard(data, 0, true);

  const coachGreeting = data.coachName ? data.coachName.replace(/^Coach\s+/i, "") : null;

  const introParagraph = `I'd like to introduce <strong>${escapeHtml(safeName)}</strong>, an outstanding international student-athlete actively seeking the right collegiate program for ${escapeHtml(gradYear)}. Verified academic records and full-match video film are available.`;

  const bodyContentHtml = [
    renderEmailHeader(),
    renderEmailHero({
      yearText: gradYear,
      sportText: sport,
      titleLine2: "ATHLETE SPOTLIGHT",
      subtitleText: "OFFICIAL SCOUTING REPORT · AVAILABLE NOW",
    }),
    renderEmailIntro({
      coachFirstName: coachGreeting,
      customParagraph: introParagraph,
      sportText: sport,
      yearText: gradYear,
    }),
    renderFeaturedHeader({
      title: "PROSPECT DETAILS",
      rightNote: "FULL MATCH FILM AVAILABLE",
    }),
    renderAthleteGrid([cardHtml], true),
    renderRequestCtaBar({
      sportText: sport,
      coachName: coachGreeting,
      institutionName: data.institutionName,
    }),
    renderSignature(),
    renderFeedbackBlock({
      recipientEmail: data.recipientEmail,
      coachId: data.coachId,
      athleteId: data.athleteId,
      position: data.positionName,
    }),
    renderBottomBar(),
    renderLegalFooter({ recipientEmail: data.recipientEmail }),
  ].join("");

  const html = renderEmailShell({
    title: subject,
    preheader: `Verified prospect ${safeName} (${position}, Class of ${gradYear}) — Full video & academics ready.`,
    bodyContentHtml,
  });

  const text = generateRecruitEmailPlainText(data);

  return {
    subject,
    html,
    text,
    profileUrl,
  };
}

/**
 * Gera a versão em texto puro (Body.Text) do e-mail multi-atleta para entregar no Amazon SES.
 */
export function generateMultiAthletePlainText(data: MultiAthleteEmailData): string {
  const athleteCount = data.athletes.length;
  const coachGreeting = data.coachName ? `Coach ${data.coachName}` : "Coach";

  const athleteSections = data.athletes.map((ath, idx) => {
    const safeName = (ath.athleteName || "").trim();
    const safeSlug = (ath.athleteSlug || "").trim();
    const profileUrl = safeSlug
      ? `${EMAIL_BASE_URL}/athlete/${encodeURIComponent(safeSlug)}`
      : EMAIL_BASE_URL;

    const heightImperial = formatHeightImperial(ath.heightCm);
    const heightStr = heightImperial
      ? ath.heightCm
        ? `${heightImperial} (${ath.heightCm} cm)`
        : heightImperial
      : "Verified";

    const gradYear = ath.highSchoolGraduation
      ? `Class of ${ath.highSchoolGraduation}`
      : ath.graduationYear
        ? `Class of ${ath.graduationYear}`
        : "Class of 2027";

    const gpaStr = formatGpa(ath.gpa);

    return [
      `[${String(idx + 1).padStart(2, "0")}] ${safeName.toUpperCase()}`,
      `Position: ${ath.positionName || "Prospect"} | Sport: ${ath.sportName || "Volleyball"}`,
      `Height: ${heightStr} | ${gradYear} | GPA: ${gpaStr ? gpaStr : "Verified"}`,
      ath.highlightNote ? `Note: "${ath.highlightNote}"` : null,
      ath.budget ? `Financial: ${ath.budget}` : null,
      `Film & Highlights: ${ath.highlightVideoUrl || profileUrl}`,
      `Profile: ${profileUrl}`,
      ``,
    ]
      .filter((l) => l !== null)
      .join("\n");
  });

  const lines = [
    `GO TEAM GO AGENCY — RECRUITING BOARD`,
    `==============================================`,
    ``,
    `Hi ${coachGreeting},`,
    ``,
    `We have curated a dedicated selection of ${athleteCount} verified international student-athletes ready for collegiate recruitment.`,
    ``,
    `FEATURED ROSTER:`,
    `----------------------------------------------`,
    ...athleteSections,
    `LOOKING FOR A SPECIFIC PROFILE?`,
    `Reply to this email or contact Founder Fabiana Andrade directly at ${EMAIL_SIGNATURE.email} to request custom athlete matches.`,
    ``,
    `----------------------------------------------`,
    `${EMAIL_SIGNATURE.name}`,
    `${EMAIL_SIGNATURE.role}`,
    `Email: ${EMAIL_SIGNATURE.email}`,
    `Instagram: ${EMAIL_SIGNATURE.instagram}`,
    `Website: ${EMAIL_SIGNATURE.websiteUrl}`,
    `----------------------------------------------`,
    `Not the right fit? Share recruitment feedback: ${EMAIL_BASE_URL}/feedback?email=${encodeURIComponent(data.recipientEmail || "")}`,
    `Manage email preferences / Unsubscribe: ${EMAIL_BASE_URL}/unsubscribe?email=${encodeURIComponent(data.recipientEmail || "")}`,
  ];

  return lines.join("\n");
}

/**
 * Renderiza e-mail unificado contendo múltiplos atletas no layout "Recruiting Board" (Poster 2027).
 */
export function renderMultiAthleteRecruitEmail(data: MultiAthleteEmailData) {
  const { athletes, coachName, institutionName, recipientEmail, coachId } = data;
  const athleteCount = athletes.length;

  const coachGreeting = coachName ? coachName.replace(/^Coach\s+/i, "") : null;

  // Determinar ano de formatura dinâmico do hero
  const gradYears = Array.from(
    new Set(
      athletes
        .map((a) => a.highSchoolGraduation || (a.graduationYear ? String(a.graduationYear) : null))
        .filter(Boolean),
    ),
  );

  let yearText = "2027";
  if (gradYears.length === 1 && gradYears[0]) {
    yearText = gradYears[0];
  } else if (gradYears.length > 1) {
    const sorted = [...gradYears].sort();
    yearText = `${sorted[0]}–${sorted[sorted.length - 1]}`;
  }

  // Esporte dinâmico
  const sports = Array.from(new Set(athletes.map((a) => a.sportName).filter(Boolean)));
  const sportText = sports.length === 1 && sports[0] ? sports[0] : "VOLLEYBALL";

  const subject = institutionName
    ? `[Go Team Go Showcase] ${athleteCount} Verified International Prospects (${institutionName})`
    : `[Go Team Go Showcase] ${athleteCount} Verified International Prospects for College Recruitment`;

  const cardsHtml = athletes.map((ath, idx) => renderAthleteCard(ath, idx, false));

  const firstAthlete = athletes[0];

  const bodyContentHtml = [
    renderEmailHeader(),
    renderEmailHero({
      yearText,
      sportText,
      titleLine2: "RECRUITING BOARD",
      subtitleText: "INTERNATIONAL ATHLETES AVAILABLE NOW",
    }),
    renderEmailIntro({
      coachFirstName: coachGreeting,
      sportText,
      yearText,
    }),
    renderFeaturedHeader({
      title: "FEATURED ATHLETES",
      rightNote: "MORE ATHLETES AVAILABLE UPON REQUEST",
    }),
    renderAthleteGrid(cardsHtml, false),
    renderRequestCtaBar({
      sportText,
      coachName: coachGreeting,
      institutionName,
    }),
    renderSignature(),
    renderFeedbackBlock({
      recipientEmail,
      coachId,
      athleteId: firstAthlete?.athleteId,
      position: firstAthlete?.positionName,
    }),
    renderBottomBar(),
    renderLegalFooter({ recipientEmail }),
  ].join("");

  const html = renderEmailShell({
    title: subject,
    preheader: `Selection of ${athleteCount} verified international ${sportText} student-athletes — Academic reports & film ready.`,
    bodyContentHtml,
  });

  const text = generateMultiAthletePlainText(data);

  return {
    subject,
    html,
    text,
  };
}

/**
 * Athlete Recruiting Board Card — card principal dos e-mails Individual e Multi.
 *
 * Layout fiel à arte oficial (faixa amarela com nome, foto + Quick Facts,
 * Season Stats, Watch Her In Action, Why She Could Fit) acrescido das 3 ações
 * obrigatórias: RECRUIT NOW, VIEW FULL PROFILE e NOT A FIT.
 *
 * Regras:
 *  - HTML de e-mail (tabelas + estilos inline), sem SVG.
 *  - Todo dado é escapado.
 *  - Seção sem dados é omitida por inteiro (nunca "N/A").
 */
import { cmToFeetAndInches, formatGpa } from "@/lib/units";
import { parseYoutubeId } from "@/lib/youtube";
import { EMAIL_ASSETS, EMAIL_BASE_URL, EMAIL_COLORS } from "./email-brand";
import { escapeHtml } from "./email-layout";
import { appendMailerUtmParams } from "./mailer-metrics-quality";
import {
  buildInterestedMailtoUrl,
  buildNotAFitUrl,
  isTransferEligible,
  type RecruitEmailAthlete,
} from "./recruit-email";

export interface BoardCardOptions {
  appUrl?: string;
  coachName?: string;
  coachEmail?: string;
  feedbackToken?: string;
  campaignId?: string | null;
}

export const BOARD_CARD_ACTION_LABELS = {
  recruit: "RECRUIT NOW",
  profile: "VIEW FULL PROFILE",
  notFit: "NOT A FIT",
} as const;

const FONT = "Arial,Helvetica,sans-serif";
const C = EMAIL_COLORS;

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function formatBoardHeight(heightCm?: number | null): string {
  if (!heightCm || heightCm <= 0) return "";
  const imperial = cmToFeetAndInches(heightCm);
  return imperial ? `${imperial.feet}'${imperial.inches}" (${heightCm} cm)` : `${heightCm} cm`;
}

export interface BoardStatItem {
  label: string;
  value: string;
}

export interface BoardSeasonStats {
  title: string;
  team: string;
  note: string;
  items: BoardStatItem[];
}

const STAT_META_KEYS = new Set([
  "season",
  "seasons",
  "team",
  "school",
  "label",
  "note",
  "notes",
  "title",
  "class",
]);

function extractSeasonStatsEntry(
  stats: Record<string, unknown>,
  fallbackTeam?: string | null,
): BoardSeasonStats | null {
  const items: BoardStatItem[] = [];
  for (const [key, raw] of Object.entries(stats)) {
    if (STAT_META_KEYS.has(key.trim().toLowerCase())) continue;
    if (typeof raw !== "number" && typeof raw !== "string") continue;
    const value = clean(raw);
    if (!value || value.length > 12) continue;
    items.push({ label: key.replace(/_/g, " ").trim(), value });
    if (items.length >= 5) break;
  }
  const note = clean(stats.note ?? stats.notes);
  if (items.length === 0 && !note && !clean(stats.season ?? stats.title ?? stats.label ?? stats.class) && !clean(stats.team ?? stats.school)) return null;
  return {
    title: clean(stats.season ?? stats.title ?? stats.label ?? stats.class),
    team: clean(stats.team ?? stats.school) || clean(fallbackTeam),
    note,
    items,
  };
}

/** Extrai estatísticas exibíveis do JSON livre `athlete_profiles.stats`. */
export function extractSeasonStats(
  stats: Record<string, unknown> | null | undefined,
  fallbackTeam?: string | null,
): BoardSeasonStats | null {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return null;
  return extractSeasonStatsEntry(stats, fallbackTeam);
}

/** Supports either the legacy single-season stats object or a seasons array. */
export function extractSeasonStatsList(
  stats: Record<string, unknown> | null | undefined,
  fallbackTeam?: string | null,
): BoardSeasonStats[] {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return [];
  if (Array.isArray(stats.seasons)) {
    return stats.seasons
      .filter((season): season is Record<string, unknown> => !!season && typeof season === "object" && !Array.isArray(season))
      .map((season) => extractSeasonStatsEntry(season, fallbackTeam))
      .filter((season): season is BoardSeasonStats => season !== null)
      .slice(0, 2);
  }
  const legacy = extractSeasonStatsEntry(stats, fallbackTeam);
  return legacy ? [legacy] : [];
}

/** Motivos de encaixe: texto da agência (team_contribution) ou derivados dos dados. */
export function buildFitReasons(athlete: RecruitEmailAthlete): string[] {
  const manual = clean(athlete.teamContribution);
  if (manual) {
    let parts = manual
      .split(/\r?\n|•|;/)
      .map((p) => p.replace(/^[-*\s]+/, "").trim())
      .filter(Boolean);
    if (parts.length === 1) {
      parts = manual
        .split(/(?<=\.)\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
    }
    return parts.slice(0, 4);
  }

  const reasons: string[] = [];
  const note = clean(athlete.highlightNote);
  if (note) reasons.push(note);
  const gpa = formatGpa(athlete.gpa);
  if (gpa && Number(athlete.gpa) >= 3) reasons.push(`High academic performance (${gpa} GPA)`);
  if (isTransferEligible(athlete.athleteStatus)) {
    reasons.push("Experienced college player with immediate impact potential");
  }
  const country = clean(athlete.countryEn).toLowerCase();
  if (country && !["usa", "united states", "us", "united states of america"].includes(country)) {
    reasons.push("International experience and adaptability");
  }
  return reasons.slice(0, 4);
}

function sectionBar(title: string): string {
  return `<tr><td style="background-color:${C.darkGreenPrimary};padding:9px 14px;border-radius:6px 6px 0 0;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:3px;color:#ffffff;text-transform:uppercase;">${escapeHtml(title)}</td></tr>`;
}

function sectionWrap(title: string, inner: string): string {
  return `
  <tr><td style="padding:12px 0 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${sectionBar(title)}
      <tr><td style="background-color:${C.boardPanel};padding:12px 14px;border-radius:0 0 6px 6px;">${inner}</td></tr>
    </table>
  </td></tr>`;
}

function icon(url: string, alt: string): string {
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" width="16" height="16" style="display:block;width:16px;height:16px;border:0;" />`;
}

function renderQuickFacts(athlete: RecruitEmailAthlete): string {
  const rows: Array<{ icon?: string; flag?: string; label: string; value: string }> = [];
  const position = clean(athlete.positionEn);
  if (position) rows.push({ icon: EMAIL_ASSETS.icons.star, label: "Position", value: position });
  const height = formatBoardHeight(athlete.heightCm);
  if (height) rows.push({ icon: EMAIL_ASSETS.icons.height, label: "Height", value: height });
  const gpa = formatGpa(athlete.gpa);
  if (gpa) rows.push({ icon: EMAIL_ASSETS.icons.gradCap, label: "GPA", value: gpa });
  const school = clean(athlete.currentSchool);
  if (school)
    rows.push({ icon: EMAIL_ASSETS.icons.academic, label: "Current School", value: school });
  const status = clean(athlete.athleteStatus);
  if (status) rows.push({ icon: EMAIL_ASSETS.icons.arrowGold, label: "Status", value: status });
  const available = clean(athlete.collegeStartDate);
  if (available) rows.push({ icon: EMAIL_ASSETS.icons.film, label: "Available", value: available });
  const major = clean(athlete.courseOfInterest);
  if (major) rows.push({ icon: EMAIL_ASSETS.icons.academic, label: "Intended Major", value: major });
  const country = clean(athlete.countryEn);
  if (country)
    rows.push({ flag: clean(athlete.countryFlag), icon: EMAIL_ASSETS.icons.globe, label: "From", value: country });

  if (rows.length === 0) return "";

  const body = rows
    .map(
      (r, i) => `
      <tr>
        <td width="24" valign="middle" style="padding:7px 0;${i ? `border-top:1px solid ${C.lineDivider};` : ""}font-size:15px;line-height:16px;">${r.flag ? escapeHtml(r.flag) : r.icon ? icon(r.icon, r.label) : ""}</td>
        <td valign="middle" style="padding:7px 8px;${i ? `border-top:1px solid ${C.lineDivider};` : ""}font-family:${FONT};font-size:11px;letter-spacing:0.6px;color:${C.textMuted};text-transform:uppercase;white-space:nowrap;">${escapeHtml(r.label)}</td>
        <td valign="middle" style="padding:7px 0;${i ? `border-top:1px solid ${C.lineDivider};` : ""}font-family:${FONT};font-size:13px;color:${C.textDark};">${escapeHtml(r.value)}</td>
      </tr>`,
    )
    .join("");

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
    ${sectionBar("Quick Facts")}
    <tr><td style="background-color:${C.boardPanel};padding:4px 12px;border-radius:0 0 6px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
    </td></tr>
  </table>`;
}

function renderChips(athlete: RecruitEmailAthlete): string {
  const chips: string[] = [];
  const status = clean(athlete.athleteStatus);
  if (isTransferEligible(status)) {
    chips.push(
      `<span style="display:inline-block;padding:6px 10px;margin:0 6px 6px 0;background-color:${C.badgeGoldBg};border-radius:4px;font-family:${FONT};font-size:12px;font-weight:700;color:${C.darkGreenPrimary};">TRANSFER</span>`,
    );
  }
  const available = clean(athlete.collegeStartDate);
  if (available) {
    chips.push(
      `<span style="display:inline-block;padding:6px 10px;margin:0 6px 6px 0;border:1px solid ${C.lineDivider};border-radius:4px;font-family:${FONT};font-size:12px;color:${C.textMuted};">AVAILABLE: <strong style="color:${C.darkGreenPrimary};">${escapeHtml(available.toUpperCase())}</strong></span>`,
    );
  }
  const gpa = formatGpa(athlete.gpa);
  if (gpa) {
    chips.push(
      `<span style="display:inline-block;padding:6px 10px;margin:0 0 6px 0;background-color:${C.boardPanel};border-radius:4px;font-family:${FONT};font-size:12px;color:${C.textMuted};">GPA <strong style="color:${C.darkGreenPrimary};">${escapeHtml(gpa)}</strong></span>`,
    );
  }
  return chips.length ? `<div style="line-height:1;">${chips.join("")}</div>` : "";
}

function renderSeasonStats(athlete: RecruitEmailAthlete): string {
  const seasons = extractSeasonStatsList(athlete.stats, athlete.currentSchool);
  if (seasons.length === 0) return "";
  const cells = seasons.map((season, index) => {
    const header = season.title || season.team
      ? `<div style="background-color:${C.badgeGoldBg};border-radius:4px;padding:8px 12px;margin-bottom:10px;font-family:${FONT};font-size:13px;color:${C.textDark};">${season.title ? `<strong>${escapeHtml(season.title.toUpperCase())}</strong>` : ""}${season.title && season.team ? "<br>" : ""}${season.team ? escapeHtml(season.team) : ""}</div>`
      : "";
    const statCells = season.items.map((item, itemIndex) => `
      <td align="center" valign="top" style="padding:4px 6px;${itemIndex ? `border-left:1px solid ${C.lineDivider};` : ""}">
        <div style="font-family:${FONT};font-size:22px;font-weight:700;color:${C.darkGreenPrimary};line-height:1.1;">${escapeHtml(item.value)}</div>
        <div style="font-family:${FONT};font-size:10px;letter-spacing:0.5px;color:${C.textMuted};text-transform:uppercase;padding-top:4px;">${escapeHtml(item.label)}</div>
      </td>`).join("");
    const statsRow = statCells
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${statCells}</tr></table>`
      : "";
    const note = season.note
      ? `<div style="font-family:${FONT};font-size:13px;color:${C.textDark};padding-top:${statCells ? "8px" : "0"};">${escapeHtml(season.note)}</div>`
      : "";
    return `<td class="mobile-stack" width="${seasons.length > 1 ? "50%" : "100%"}" valign="top" style="padding:${index ? "0 0 0 8px" : "0 8px 0 0"};">${header}${statsRow}${note}</td>`;
  }).join("");
  return sectionWrap(
    "Season Stats",
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`,
  );
}

function renderVideos(athlete: RecruitEmailAthlete, options: BoardCardOptions): string {
  const baseUrl = options.appUrl || EMAIL_BASE_URL;
  const seen = new Set<string>();
  const list: Array<{ url: string; title: string; id: string }> = [];
  const candidates = [
    ...(athlete.videos ?? []),
    ...(athlete.highlightVideoUrl ? [{ url: athlete.highlightVideoUrl, title: "Highlight Video" }] : []),
  ];
  for (const v of candidates) {
    const id = parseYoutubeId(v?.url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push({ url: clean(v.url), title: clean(v.title) || "Highlight Video", id });
    if (list.length >= 2) break;
  }
  if (list.length === 0) return "";

  const cells = list
    .map((v, i) => {
      const href = appendMailerUtmParams(v.url, {
        appUrl: baseUrl,
        campaignId: options.campaignId,
        content: `watch_film_${athlete.slug}_${i + 1}`,
      });
      return `
      <td class="mobile-stack" width="50%" valign="top" style="padding:4px ${i === 0 ? "8px" : "0"} 4px ${i === 0 ? "0" : "8px"};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="112" valign="middle">
            <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">
              <img src="https://img.youtube.com/vi/${escapeHtml(v.id)}/hqdefault.jpg" alt="${escapeHtml(v.title)}" width="112" height="63" style="display:block;width:112px;height:63px;object-fit:cover;border-radius:6px;border:0;" />
            </a>
          </td>
          <td valign="middle" style="padding-left:10px;">
            <div style="font-family:${FONT};font-size:12px;font-weight:700;color:${C.textDark};text-transform:uppercase;">${escapeHtml(v.title)}</div>
            <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="font-family:${FONT};font-size:12px;color:${C.darkGreenPrimary};text-decoration:underline;">Watch Highlight Video &rarr;</a>
          </td>
        </tr></table>
      </td>`;
    })
    .join("");
  return sectionWrap(
    "Watch Her In Action",
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`,
  );
}

function renderFitReasons(athlete: RecruitEmailAthlete): string {
  const reasons = buildFitReasons(athlete);
  if (reasons.length === 0) return "";
  const icons = [
    EMAIL_ASSETS.icons.stats,
    EMAIL_ASSETS.icons.gradCap,
    EMAIL_ASSETS.icons.users,
    EMAIL_ASSETS.icons.globe,
  ];
  const cell = (text: string, i: number) => `
    <td class="mobile-stack" width="50%" valign="top" style="padding:6px 8px 6px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="26" valign="top" style="padding-top:1px;">${icon(icons[i % icons.length], "")}</td>
        <td valign="top" style="font-family:${FONT};font-size:13px;line-height:1.45;color:${C.textDark};">${escapeHtml(text)}</td>
      </tr></table>
    </td>`;
  const rows: string[] = [];
  for (let i = 0; i < reasons.length; i += 2) {
    rows.push(
      `<tr>${cell(reasons[i], i)}${reasons[i + 1] ? cell(reasons[i + 1], i + 1) : '<td class="mobile-hide" width="50%"></td>'}</tr>`,
    );
  }
  return sectionWrap(
    "Why She Could Fit Your Program",
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table>`,
  );
}

function renderActions(urls: { recruit: string; profile: string; notFit: string }): string {
  const btn = (href: string, label: string, bg: string, color: string, border: string, blank = true) => `
    <td class="mobile-stack" width="33%" align="center" valign="middle" style="padding:4px;">
      <a href="${escapeHtml(href)}"${blank ? ' target="_blank" rel="noopener noreferrer"' : ""} style="display:block;min-height:44px;line-height:44px;padding:0 10px;background-color:${bg};color:${color};border:1px solid ${border};border-radius:6px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1px;text-decoration:none;text-align:center;">${label}</a>
    </td>`;
  return `
  <tr><td style="padding:14px 0 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      ${btn(urls.profile, BOARD_CARD_ACTION_LABELS.profile, C.darkGreenPrimary, "#ffffff", C.darkGreenPrimary)}
      ${btn(urls.recruit, BOARD_CARD_ACTION_LABELS.recruit, C.boardYellow, C.darkGreenPrimary, C.boardYellow, false)}
      ${btn(urls.notFit, BOARD_CARD_ACTION_LABELS.notFit, "#ffffff", C.textMuted, C.lineDivider)}
    </tr></table>
  </td></tr>`;
}

export function buildBoardCardUrls(athlete: RecruitEmailAthlete, options: BoardCardOptions = {}) {
  const baseUrl = options.appUrl || EMAIL_BASE_URL;
  const rawProfileUrl =
    athlete.profileUrl || `${baseUrl}/athlete/${encodeURIComponent(athlete.slug)}`;
  return {
    recruit: buildInterestedMailtoUrl(athlete, options.coachName),
    profile: appendMailerUtmParams(rawProfileUrl, {
      appUrl: baseUrl,
      campaignId: options.campaignId,
      content: `full_profile_${athlete.slug}`,
    }),
    notFit: buildNotAFitUrl(athlete.id, options),
  };
}

export function renderAthleteBoardCard(
  athlete: RecruitEmailAthlete,
  options: BoardCardOptions = {},
): string {
  const baseUrl = options.appUrl || EMAIL_BASE_URL;
  const urls = buildBoardCardUrls(athlete, options);
  const subline = [
    clean(athlete.positionEn),
    formatBoardHeight(athlete.heightCm),
    clean(athlete.countryEn),
  ]
    .filter(Boolean)
    .map((p) => escapeHtml(p.toUpperCase()))
    .join(`<span style="padding:0 10px;">|</span>`);
  const photo = clean(athlete.photoUrl);

  const photoCell = photo
    ? `<td class="mobile-stack" width="200" valign="top" style="padding:12px 12px 0 0;">
        <a href="${escapeHtml(urls.profile)}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">
          <img src="${escapeHtml(photo)}" alt="${escapeHtml(athlete.name)}" width="200" height="260" style="display:block;width:200px;max-width:100%;height:260px;object-fit:cover;border-radius:6px;border:0;background-color:${C.boardPanel};" />
        </a>
      </td>`
    : "";

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="athlete-board-card" style="background-color:#ffffff;">
    <tr><td style="background-color:${C.boardYellow};border-radius:6px;padding:16px 14px;text-align:center;">
      <a href="${escapeHtml(urls.profile)}" target="_blank" rel="noopener noreferrer" style="font-family:${FONT};font-size:26px;font-weight:900;line-height:1.1;color:${C.darkGreenPrimary};text-decoration:none;text-transform:uppercase;">${escapeHtml(athlete.name)}</a>
      ${subline ? `<div style="font-family:${FONT};font-size:11px;letter-spacing:3px;color:${C.textDark};padding-top:8px;">${subline}</div>` : ""}
    </td></tr>
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        ${photoCell}
        <td class="mobile-stack" valign="top" style="padding:12px 0 0 0;">
          ${renderChips(athlete)}
          ${renderQuickFacts(athlete)}
        </td>
      </tr></table>
    </td></tr>
    ${renderSeasonStats(athlete)}
    ${renderVideos(athlete, { ...options, appUrl: baseUrl })}
    ${renderFitReasons(athlete)}
    ${renderActions(urls)}
  </table>`;
}

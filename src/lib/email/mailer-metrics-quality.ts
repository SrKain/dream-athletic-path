/**
 * Qualidade de Métricas do Mailer, Detecção de Scanners/Bots, Proxies de Privacidade,
 * Sanitização de Tags Resend e Instrumentação de UTMs.
 */

/**
 * Clique ocorrido em <= 10s após email.delivered (ou email.sent) é considerado
 * provável scanner de segurança corporativo/universitário (.edu).
 */
export const FAST_CLICK_THRESHOLD_SECONDS = 10;

/**
 * Burst de cliques: >= 3 links distintos clicados em <= 5 segundos no mesmo e-mail (provider_email_id)
 * é considerado scanner automatizado de verificação de links.
 */
export const BURST_CLICK_DISTINCT_LINKS_THRESHOLD = 3;
export const BURST_CLICK_WINDOW_SECONDS = 5;

/**
 * Padrões de User-Agent conhecidos de scanners de segurança de e-mail,
 * clientes headless e robôs de pré-busca.
 */
export const AUTOMATED_SCANNER_USER_AGENT_PATTERNS: readonly RegExp[] = [
  /Barracuda/i,
  /Proofpoint/i,
  /Mimecast/i,
  /Safelinks/i,
  /\bATP\b/i,
  /Symantec/i,
  /FireEye/i,
  /TrendMicro/i,
  /HeadlessChrome/i,
  /PhantomJS/i,
  /python-requests/i,
  /curl\//i,
  /wget\//i,
  /Go-http-client/i,
  /\bbot\b/i,
  /crawler/i,
  /spider/i,
  /scanner/i,
  /urlscan/i,
] as const;

/**
 * Padrões de User-Agent conhecidos de proxies de imagem de provedores de e-mail.
 * Nota: O User-Agent genérico da Apple (Mozilla/5.0 Macintosh... AppleWebKit/605.1.15)
 * NÃO é incluído aqui pois coincide com o Safari real em macOS. Aberturas do Apple MPP
 * são documentadas como "indicativas" no tooltip do KPI.
 */
export const PRIVACY_PROXY_USER_AGENT_PATTERNS: readonly RegExp[] = [
  /GoogleImageProxy/i,
  /ggpht\.com/i,
  /YahooMailProxy/i,
] as const;

/**
 * Verifica se o User-Agent corresponde a um scanner de links ou navegador headless.
 */
export function isScannerUserAgent(userAgent?: string | null): boolean {
  if (!userAgent || typeof userAgent !== "string") return false;
  const trimmed = userAgent.trim();
  if (!trimmed) return false;
  return AUTOMATED_SCANNER_USER_AGENT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Verifica se o User-Agent corresponde a um proxy de privacidade de imagem detectável
 * (GoogleImageProxy / ggpht.com / YahooMailProxy).
 */
export function isPrivacyProxyUserAgent(userAgent?: string | null): boolean {
  if (!userAgent || typeof userAgent !== "string") return false;
  const trimmed = userAgent.trim();
  if (!trimmed) return false;
  return PRIVACY_PROXY_USER_AGENT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Avalia as regras SEM ESTADO (stateless) para determinar se um clique é provavelmente automatizado:
 * 1. User-Agent de scanner/headless conhecido; OU
 * 2. Clique ocorrido em <= FAST_CLICK_THRESHOLD_SECONDS (10s) após o timestamp de entrega/envio.
 */
export function isStatelessAutomatedClick(params: {
  clickedAt?: string | Date | null;
  deliveredOrSentAt?: string | Date | null;
  userAgent?: string | null;
}): boolean {
  if (isScannerUserAgent(params.userAgent)) {
    return true;
  }

  if (params.clickedAt && params.deliveredOrSentAt) {
    const clickTime = new Date(params.clickedAt).getTime();
    const baseTime = new Date(params.deliveredOrSentAt).getTime();
    if (!Number.isNaN(clickTime) && !Number.isNaN(baseTime)) {
      const diffSeconds = (clickTime - baseTime) / 1000;
      if (diffSeconds >= 0 && diffSeconds <= FAST_CLICK_THRESHOLD_SECONDS) {
        return true;
      }
    }
  }

  return false;
}

export interface ClickSampleForBurst {
  id: string;
  providerEmailId: string | null;
  clickedUrl: string | null;
  clickedAt: string | Date;
}

/**
 * Avalia em lote (equivalente puro à função de janela da RPC SQL) quais eventos de clique
 * fazem parte de um burst (>= 3 links distintos clicados em <= 5s no mesmo provider_email_id).
 * Retorna um Set com os IDs dos cliques classificados como burst.
 */
export function detectBurstClickEventIds(clicks: ClickSampleForBurst[]): Set<string> {
  const flaggedIds = new Set<string>();
  const byProvider = new Map<string, Array<{ id: string; url: string; timeMs: number }>>();

  for (const item of clicks) {
    if (!item.providerEmailId || !item.clickedUrl) continue;
    const url = item.clickedUrl.trim();
    if (!url) continue;
    const timeMs = new Date(item.clickedAt).getTime();
    if (Number.isNaN(timeMs)) continue;

    const list = byProvider.get(item.providerEmailId) ?? [];
    list.push({ id: item.id, url, timeMs });
    byProvider.set(item.providerEmailId, list);
  }

  const windowMs = BURST_CLICK_WINDOW_SECONDS * 1000;

  for (const list of byProvider.values()) {
    if (list.length < BURST_CLICK_DISTINCT_LINKS_THRESHOLD) continue;
    for (const current of list) {
      const distinctUrlsInWindow = new Set<string>();
      for (const peer of list) {
        if (Math.abs(peer.timeMs - current.timeMs) <= windowMs) {
          distinctUrlsInWindow.add(peer.url);
        }
      }
      if (distinctUrlsInWindow.size >= BURST_CLICK_DISTINCT_LINKS_THRESHOLD) {
        flaggedIds.add(current.id);
      }
    }
  }

  return flaggedIds;
}

/**
 * Sanitiza um nome ou valor de tag para o Resend SDK:
 * apenas letras ASCII, números, underscores (_) e hifens (-), máximo de 256 caracteres.
 */
export function sanitizeResendTagValue(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 256);
}

export interface ResendTag {
  name: string;
  value: string;
}

/**
 * Constrói a lista de tags padronizadas para envios do Mailer via Resend.
 */
export function buildResendMailerTags(params: {
  campaignId?: string | null;
  emailType: string;
  athleteId?: string | null;
}): ResendTag[] {
  const tags: ResendTag[] = [];

  const cleanType = sanitizeResendTagValue(params.emailType);
  if (cleanType) {
    tags.push({ name: "email_type", value: cleanType });
  }

  const cleanCampaign = sanitizeResendTagValue(params.campaignId);
  if (cleanCampaign) {
    tags.push({ name: "campaign_id", value: cleanCampaign });
  }

  const cleanAthlete = sanitizeResendTagValue(params.athleteId);
  if (cleanAthlete) {
    tags.push({ name: "athlete_id", value: cleanAthlete });
  }

  return tags;
}

/**
 * Extrai um mapa chave-valor de tags do payload do webhook do Resend,
 * suportando tanto o formato Array<{ name, value }> quanto Record<string, string>.
 */
export function extractTagsFromWebhookData(tagsRaw: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!tagsRaw) return map;

  if (Array.isArray(tagsRaw)) {
    for (const item of tagsRaw) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const name = typeof obj.name === "string" ? obj.name.trim() : "";
        const value = typeof obj.value === "string" ? obj.value.trim() : "";
        if (name && value) {
          map[name] = value;
        }
      }
    }
    return map;
  }

  if (typeof tagsRaw === "object") {
    for (const [k, v] of Object.entries(tagsRaw as Record<string, unknown>)) {
      if (typeof v === "string" && k.trim() && v.trim()) {
        map[k.trim()] = v.trim();
      }
    }
  }

  return map;
}

/**
 * Extrai informações de atribuição (slug do atleta, athleteId ou campaignId) a partir da URL clicada.
 */
export function parseAttributionFromClickedUrl(clickedUrl?: string | null): {
  athleteSlug: string | null;
  athleteId: string | null;
  campaignId: string | null;
  buttonType: "watch_film" | "full_profile" | "view_portfolio" | "feedback" | "external" | null;
} {
  if (!clickedUrl || typeof clickedUrl !== "string") {
    return { athleteSlug: null, athleteId: null, campaignId: null, buttonType: null };
  }

  try {
    const parsed = new URL(clickedUrl);
    const utmCampaign = parsed.searchParams.get("utm_campaign")?.trim() || null;
    const utmContent = parsed.searchParams.get("utm_content")?.trim() || null;
    const queryAthleteId = parsed.searchParams.get("athleteId")?.trim() || null;

    let athleteSlug: string | null = null;
    const pathMatch = parsed.pathname.match(/\/athlete\/([^/?#]+)/i);
    if (pathMatch && pathMatch[1]) {
      athleteSlug = decodeURIComponent(pathMatch[1]).trim();
    }

    let buttonType:
      "watch_film" | "full_profile" | "view_portfolio" | "feedback" | "external" | null =
      "external";

    if (utmContent) {
      if (utmContent.startsWith("watch_film_")) {
        buttonType = "watch_film";
        if (!athleteSlug) athleteSlug = utmContent.replace(/^watch_film_/, "") || null;
      } else if (utmContent.startsWith("full_profile_")) {
        buttonType = "full_profile";
        if (!athleteSlug) athleteSlug = utmContent.replace(/^full_profile_/, "") || null;
      } else if (utmContent.startsWith("view_portfolio")) {
        buttonType = "view_portfolio";
      }
    } else if (parsed.pathname.startsWith("/athlete/")) {
      buttonType = "full_profile";
    } else if (parsed.pathname.startsWith("/feedback")) {
      buttonType = "feedback";
    } else if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
      buttonType = "watch_film";
    }

    return {
      athleteSlug,
      athleteId: queryAthleteId,
      campaignId: utmCampaign,
      buttonType,
    };
  } catch {
    return { athleteSlug: null, athleteId: null, campaignId: null, buttonType: null };
  }
}

/**
 * Adiciona parâmetros UTM (utm_source=gtg_mailer, utm_medium=email, utm_campaign, utm_content)
 * exclusivamente a links HTTP(S) que apontam para o nosso domínio (appUrl / portfolio.goteamgoagency.com),
 * preservando intactos links de feedback, unsubscribe, mailto e links externos (YouTube).
 */
export function appendMailerUtmParams(
  targetUrl: string,
  options: {
    appUrl?: string | null;
    campaignId?: string | null;
    content: string;
  },
): string {
  if (!targetUrl || !targetUrl.startsWith("http")) {
    return targetUrl;
  }

  try {
    const parsedTarget = new URL(targetUrl);
    const allowedHosts = new Set<string>(["portfolio.goteamgoagency.com", "goteamgoagency.com"]);

    if (options.appUrl) {
      try {
        allowedHosts.add(new URL(options.appUrl).hostname.toLowerCase());
      } catch {
        // ignore invalid appUrl
      }
    }

    const targetHost = parsedTarget.hostname.toLowerCase();
    const isOurDomain =
      allowedHosts.has(targetHost) ||
      targetHost.endsWith(".goteamgoagency.com") ||
      targetHost === "localhost";

    if (!isOurDomain) {
      return targetUrl;
    }

    // Não adicionar UTM em links de compliance (/feedback, /unsubscribe)
    if (
      parsedTarget.pathname.startsWith("/feedback") ||
      parsedTarget.pathname.startsWith("/unsubscribe")
    ) {
      return targetUrl;
    }

    parsedTarget.searchParams.set("utm_source", "gtg_mailer");
    parsedTarget.searchParams.set("utm_medium", "email");
    if (options.campaignId && options.campaignId.trim()) {
      parsedTarget.searchParams.set(
        "utm_campaign",
        sanitizeResendTagValue(options.campaignId.trim()),
      );
    }
    if (options.content && options.content.trim()) {
      parsedTarget.searchParams.set("utm_content", sanitizeResendTagValue(options.content.trim()));
    }

    return parsedTarget.toString();
  } catch {
    return targetUrl;
  }
}

/**
 * Calcula uma taxa percentual com teto estrito de 100.0% e 1 casa decimal.
 */
export function computeCappedRate(numerator: number, denominator: number): number {
  if (denominator <= 0 || numerator <= 0) return 0;
  const raw = (numerator / denominator) * 100;
  return Math.min(100, Math.round(raw * 10) / 10);
}

import crypto from "node:crypto";

const DEFAULT_TTL_DAYS = 90;

function getUnsubscribeSecret(): string {
  return (
    process.env.MAILER_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "teamgo-mailer-unsubscribe-secret-salt"
  );
}

/**
 * Gera token assinado HMAC-SHA256 para descadastro seguro e One-Click (RFC 8058).
 */
export function generateUnsubscribeToken(
  email: string,
  campaignId?: string | null,
  ttlDays: number = DEFAULT_TTL_DAYS,
  referenceTimeMs?: number,
): string {
  const secret = getUnsubscribeSecret();
  const cleanEmail = email.trim().toLowerCase();
  const dayMs = 24 * 60 * 60 * 1000;
  // Quando há campaignId (ou referenceTimeMs), ancora o exp ao dia UTC para que retries
  // do mesmo lote na janela de 24h do Resend produzam payload 100% idêntico (evitando 409).
  const rawMs =
    typeof referenceTimeMs === "number" && Number.isFinite(referenceTimeMs)
      ? referenceTimeMs
      : Date.now();
  const baseMs = ttlDays > 0 ? Math.floor(rawMs / dayMs) * dayMs : rawMs;
  const exp = baseMs + ttlDays * dayMs;
  const camp = campaignId?.trim() || "";

  const payload = Buffer.from(JSON.stringify({ e: cleanEmail, c: camp, exp }), "utf8").toString(
    "base64url",
  );

  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");

  return `${payload}.${signature}`;
}

/**
 * Valida o token de descadastro assinado. Retorna os dados se válido, ou null se inválido/expirado.
 */
export function verifyUnsubscribeToken(token: string): {
  email: string;
  campaignId?: string;
} | null {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const secret = getUnsubscribeSecret();
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  // Comparação em tempo constante contra timing attack
  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const raw = Buffer.from(payloadB64, "base64url").toString("utf8");
    const data = JSON.parse(raw) as { e?: string; c?: string; exp?: number };

    if (!data.e || typeof data.exp !== "number") {
      return null;
    }

    if (Date.now() > data.exp) {
      return null;
    }

    return {
      email: data.e.toLowerCase().trim(),
      campaignId: data.c || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Constrói a URL completa para descadastro One-Click.
 */
export function buildUnsubscribeUrl(
  email: string,
  campaignId?: string | null,
  appUrl?: string,
): string {
  const token = generateUnsubscribeToken(email, campaignId);
  const baseUrl = (appUrl || process.env.APP_URL || "https://portfolio.goteamgoagency.com").replace(
    /\/+$/,
    "",
  );

  return `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Constrói os cabeçalhos List-Unsubscribe e List-Unsubscribe-Post (RFC 8058 e RFC 2369)
 * para remetentes em volume exigidos por Gmail e Yahoo.
 */
export function getUnsubscribeHeaders(
  optionsOrEmail: string | { email: string; campaignId?: string | null; appUrl?: string },
  campaignIdParam?: string | null,
): Record<string, string> {
  let email: string;
  let campaignId: string | null | undefined;
  let appUrl: string | undefined;

  if (typeof optionsOrEmail === "string") {
    email = optionsOrEmail;
    campaignId = campaignIdParam;
  } else {
    email = optionsOrEmail.email;
    campaignId = optionsOrEmail.campaignId;
    appUrl = optionsOrEmail.appUrl;
  }

  const oneClickUrl = buildUnsubscribeUrl(email, campaignId, appUrl);

  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

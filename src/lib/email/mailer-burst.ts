import crypto from "node:crypto";

export function chunkIdempotencyKey(campaignId: string, keys: string[]): string {
  return crypto
    .createHash("sha256")
    .update(["mailer-burst-v2", campaignId, ...[...keys].sort()].join(":"))
    .digest("hex");
}

export function getRetryAfterSeconds(value: unknown, fallback = 60): number {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.max(1, Math.min(3600, Math.ceil(value)));
  if (typeof value === "string" && value.trim()) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(1, Math.min(3600, Math.ceil(seconds)));
    const date = Date.parse(value);
    if (!Number.isNaN(date))
      return Math.max(1, Math.min(3600, Math.ceil((date - Date.now()) / 1000)));
  }
  return fallback;
}

export function isRateLimitError(error: unknown): boolean {
  const obj = error as {
    statusCode?: number;
    status?: number;
    name?: string;
    message?: string;
  } | null;
  return (
    obj?.statusCode === 429 ||
    obj?.status === 429 ||
    obj?.name === "rate_limit_exceeded" ||
    /rate_limit_exceeded|too many requests|429/i.test(obj?.message ?? "")
  );
}

/**
 * Classificação robusta por statusCode e name estruturado (E10).
 * Evita casar emails como 'coach500@university.edu'.
 */
export function isAmbiguousProviderError(error: unknown): boolean {
  if (!error) return false;
  const obj = error as {
    statusCode?: number;
    status?: number;
    name?: string;
    code?: string;
    message?: string;
  };
  const status = obj.statusCode ?? obj.status;
  if (typeof status === "number" && status >= 500 && status <= 504) {
    return true;
  }
  const name = String(obj.name ?? "");
  const code = String(obj.code ?? "");
  const msg = String(obj.message ?? "");
  if (
    name === "TimeoutError" ||
    name === "AbortError" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNABORTED" ||
    /timeout|network|econnreset|fetch failed/i.test(msg)
  ) {
    return true;
  }
  return false;
}

/**
 * Recuperação gradual do tamanho do lote (E6):
 * - Em 429: divide por 2 (mínimo 1)
 * - Em tick bem-sucedido sem 429: recupera até o teto máximo (300)
 */
export function nextBurstSize(current: number, rateLimited: boolean, maxSize = 300): number {
  if (rateLimited) {
    return Math.max(1, Math.floor(current / 2));
  }
  if (current >= maxSize) return maxSize;
  return Math.min(maxSize, Math.max(1, current + 10));
}

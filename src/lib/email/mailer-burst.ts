import crypto from "node:crypto";

export function chunkIdempotencyKey(campaignId: string, keys: string[]): string {
  return crypto
    .createHash("sha256")
    .update(["mailer-burst-v1", campaignId, ...[...keys].sort()].join(":"))
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
    /429|rate.limit|too many requests/i.test(`${obj?.name ?? ""} ${obj?.message ?? ""}`)
  );
}

export function isAmbiguousProviderError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: string } | null)?.message ?? "");
  // Timeouts/network resets and 5xx responses can occur AFTER provider acceptance.
  return /timeout|timed out|ECONN|network|abort|500|502|503|504|internal server|unavailable/i.test(
    message,
  );
}

export function nextBurstSize(current: number, rateLimited: boolean): number {
  return rateLimited ? Math.max(1, Math.floor(current / 2)) : current;
}

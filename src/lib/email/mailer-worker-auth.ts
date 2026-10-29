import { timingSafeEqual } from "node:crypto";

/** Both flags and a strong secret are required; deployments are disabled by default. */
export function isMailerWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.MAILER_SERVER_ORCHESTRATION === "true" &&
    env.MAILER_SEND_ENABLED === "true" &&
    typeof env.MAILER_WORKER_SECRET === "string" &&
    env.MAILER_WORKER_SECRET.length >= 32
  );
}

export function verifyMailerWorkerRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): "ok" | "disabled" | "unauthorized" {
  if (!isMailerWorkerEnabled(env)) return "disabled";
  if (request.method !== "POST") return "unauthorized";

  const expected = Buffer.from(env.MAILER_WORKER_SECRET!, "utf8");
  const bearer = request.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ")) return "unauthorized";
  const supplied = Buffer.from(bearer.slice(7), "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return "unauthorized";
  }
  return "ok";
}

/**
 * Verifica autenticação via `MAILER_CRON_SECRET` em tempo constante (`timingSafeEqual`)
 * para o endpoint `POST /api/mailer/tick`.
 */
export function verifyMailerCronTickSecret(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): "ok" | "disabled" | "unauthorized" {
  const cronSecret = (env.MAILER_CRON_SECRET || env.MAILER_WORKER_SECRET || "").trim();
  if (!cronSecret) return "disabled";

  const headerSecret = (request.headers.get("x-mailer-cron-secret") || "").trim();
  const bearerHeader = (request.headers.get("authorization") || "").trim();
  const bearerToken = bearerHeader.startsWith("Bearer ") ? bearerHeader.slice(7).trim() : "";
  const candidate = headerSecret || bearerToken;

  if (!candidate) return "unauthorized";

  const expectedBuf = Buffer.from(cronSecret, "utf8");
  const suppliedBuf = Buffer.from(candidate, "utf8");

  if (expectedBuf.length !== suppliedBuf.length || !timingSafeEqual(expectedBuf, suppliedBuf)) {
    return "unauthorized";
  }
  return "ok";
}

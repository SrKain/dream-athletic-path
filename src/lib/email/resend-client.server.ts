import { Resend } from "resend";

export interface ResendConfig {
  apiKey?: string;
  from: string;
  webhookSecret?: string;
  isConfigured: boolean;
}

export function getResendConfig(): ResendConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Go Team Go <contact@goteamgoagency.com>";
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const isConfigured = Boolean(apiKey);

  return {
    apiKey,
    from,
    webhookSecret,
    isConfigured,
  };
}

let cachedClient: Resend | null = null;

export function getResendClient(): Resend | null {
  const config = getResendConfig();
  if (!config.isConfigured || !config.apiKey) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new Resend(config.apiKey);
  }

  return cachedClient;
}

/** Para uso em testes unitários */
export function resetResendClientCache(): void {
  cachedClient = null;
}

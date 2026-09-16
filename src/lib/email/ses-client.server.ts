import { SESv2Client } from "@aws-sdk/client-sesv2";

export interface SesConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
  region: string;
  configurationSet?: string;
  from: string;
  isConfigured: boolean;
}

export function getSesConfig(): SesConfig {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const region = process.env.AWS_REGION?.trim() || "us-east-1";
  const configurationSet = process.env.SES_CONFIGURATION_SET?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Go Team Go <contact@goteamgoagency.com>";

  const isConfigured = Boolean(accessKeyId && secretAccessKey);

  return {
    accessKeyId,
    secretAccessKey,
    region,
    configurationSet,
    from,
    isConfigured,
  };
}

let cachedClient: SESv2Client | null = null;

export function getSesClient(): SESv2Client | null {
  const config = getSesConfig();
  if (!config.isConfigured || !config.accessKeyId || !config.secretAccessKey) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new SESv2Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return cachedClient;
}

/** Para uso em testes unitários */
export function resetSesClientCache(): void {
  cachedClient = null;
}

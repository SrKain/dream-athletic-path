import { createServerFn } from "@tanstack/react-start";

export const INDEXNOW_KEY = "1675dcaaacd2469b9461671a29b307e0";
export const INDEXNOW_HOST = "portfolio.goteamgoagency.com";
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/**
 * Sanitiza e valida a lista de URLs antes de enviar ao IndexNow.
 */
export function sanitizeIndexNowUrls(urls: string[]): string[] {
  if (!Array.isArray(urls)) return [];
  const unique = new Set<string>();

  for (const raw of urls) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      // Assegura protocolo HTTP/HTTPS
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        unique.add(parsed.toString());
      }
    } catch {
      // Ignora URLs malformadas silenciosamente
    }
  }

  return Array.from(unique);
}

/**
 * Executa a requisição HTTP POST direta para o endpoint do IndexNow.
 * Sempre encapsulada em try/catch para nunca quebrar o fluxo chamador.
 */
export async function sendIndexNowRequest(urls: string[]): Promise<boolean> {
  const sanitizedUrls = sanitizeIndexNowUrls(urls);
  if (sanitizedUrls.length === 0) {
    return false;
  }

  const payload: IndexNowPayload = {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList: sanitizedUrls,
  };

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    // 200 = OK, 202 = Accepted
    if (response.ok || response.status === 200 || response.status === 202) {
      console.info(
        `[IndexNow] Submissão com sucesso de ${sanitizedUrls.length} URL(s). Status: ${response.status}`,
      );
      return true;
    }

    const errorText = await response.text().catch(() => "Sem resposta de texto");
    console.warn(`[IndexNow] Resposta não-OK da API (${response.status}): ${errorText}`);
    return false;
  } catch (err) {
    console.warn("[IndexNow] Falha na comunicação com a API IndexNow:", err);
    return false;
  }
}

/**
 * Server Function TanStack Start para disparar submissões originadas
 * da interface administrativa no browser sem restrições de CORS.
 */
export const submitToIndexNowServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { urls: string[] }) => data)
  .handler(async ({ data }) => {
    return sendIndexNowRequest(data.urls);
  });

/**
 * Função unificada para submissão ao IndexNow.
 * Detecta o ambiente: se chamado no cliente (navegador), encaminha via Server Function.
 * Se chamado no servidor ou em scripts CLI, despacha diretamente.
 *
 * Fire-and-forget: nunca lança exceção para o caller.
 */
export async function submitToIndexNow(urls: string[]): Promise<boolean> {
  try {
    if (typeof window !== "undefined") {
      return await submitToIndexNowServerFn({ data: { urls } });
    }
    return await sendIndexNowRequest(urls);
  } catch (err) {
    console.warn("[IndexNow] Erro capturado em submitToIndexNow:", err);
    return false;
  }
}

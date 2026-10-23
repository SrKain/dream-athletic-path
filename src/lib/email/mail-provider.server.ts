import crypto from "node:crypto";
import { getResendClient, getResendConfig } from "./resend-client.server";

export interface BatchEmailItem {
  id: string; // ID da linha na mailer_queue
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

export interface BatchSendOutcome {
  sent: Array<{ id: string; providerId: string }>;
  failed: Array<{ id: string; errorCode: string; errorMessage: string }>;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
  circuitBreak?: boolean;
  circuitBreakReason?: string;
  ambiguous?: boolean;
}

export interface MailProvider {
  sendBatch(
    items: BatchEmailItem[],
    options?: { idempotencyKey?: string; dryRun?: boolean },
  ): Promise<BatchSendOutcome>;
}

/**
 * Provedor Fake para Ensaio (Dry-Run) e Testes sem Rede.
 * NUNCA instancia nem chama o cliente Resend.
 */
export class FakeMailProvider implements MailProvider {
  private latencyMs: number;

  constructor(options?: { latencyMs?: number }) {
    this.latencyMs = options?.latencyMs ?? 20;
  }

  async sendBatch(
    items: BatchEmailItem[],
    _options?: { idempotencyKey?: string; dryRun?: boolean },
  ): Promise<BatchSendOutcome> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    const sent = items.map((item) => ({
      id: item.id,
      providerId: `dry_${crypto.randomUUID()}`,
    }));

    return {
      sent,
      failed: [],
    };
  }
}

/**
 * Provedor Real Resend utilizando Resend Batch API com validação permissiva ('permissive').
 */
export class ResendMailProvider implements MailProvider {
  private timeoutMs: number;

  constructor(options?: { timeoutMs?: number }) {
    this.timeoutMs = options?.timeoutMs ?? 12000;
  }

  async sendBatch(
    items: BatchEmailItem[],
    options?: { idempotencyKey?: string; dryRun?: boolean },
  ): Promise<BatchSendOutcome> {
    if (items.length === 0) {
      return { sent: [], failed: [] };
    }

    const { isConfigured, from: defaultFrom } = getResendConfig();
    if (!isConfigured) {
      return {
        sent: [],
        failed: items.map((it) => ({
          id: it.id,
          errorCode: "RESEND_NOT_CONFIGURED",
          errorMessage: "Resend credentials (RESEND_API_KEY) are missing in environment.",
        })),
        circuitBreak: true,
        circuitBreakReason: "Resend API key not configured.",
      };
    }

    const client = getResendClient();
    if (!client) {
      return {
        sent: [],
        failed: items.map((it) => ({
          id: it.id,
          errorCode: "RESEND_INIT_FAILED",
          errorMessage: "Failed to initialize Resend client.",
        })),
        circuitBreak: true,
        circuitBreakReason: "Failed to initialize Resend client.",
      };
    }

    const batchPayload = items.map((it) => ({
      from: it.from || defaultFrom,
      to: [it.to],
      replyTo: it.replyTo || "contact@goteamgoagency.com",
      subject: it.subject,
      html: it.html,
      text: it.text,
      headers: it.headers,
      tags: it.tags,
    }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const sendPromise = (
        client.batch as unknown as {
          send: (payload: unknown, options: unknown) => Promise<unknown>;
        }
      ).send(batchPayload, {
        batchValidation: "permissive",
        idempotencyKey: options?.idempotencyKey,
      });

      const abortPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          const err = new Error("Resend batch request timed out after 12s");
          err.name = "TimeoutError";
          reject(err);
        });
      });

      const rawResponse = await Promise.race([sendPromise, abortPromise]);
      clearTimeout(timer);

      // Tratar resposta permissiva
      const response = rawResponse as {
        data?:
          | {
              data?: Array<{ id: string }>;
              errors?: Array<{ index: number; message: string }>;
            }
          | Array<{ id: string }>;
        errors?: Array<{ index: number; message: string }>;
        error?: { statusCode?: number; status?: number; name?: string; message?: string } | null;
      };

      if (response.error) {
        const classified = this.classifyError(response.error, items);
        // Se for erro definitivo do lote (como validação) e não ambíguo/rate-limited/config:
        if (
          !classified.rateLimited &&
          !classified.ambiguous &&
          !classified.circuitBreak &&
          client.emails?.send
        ) {
          const sentList: Array<{ id: string; providerId: string }> = [];
          const failedList: Array<{ id: string; errorCode: string; errorMessage: string }> = [];
          for (const item of items) {
            try {
              const indivRes = (await client.emails.send(
                {
                  from: item.from || defaultFrom,
                  to: [item.to],
                  replyTo: item.replyTo || "contact@goteamgoagency.com",
                  subject: item.subject,
                  html: item.html,
                  text: item.text,
                  headers: item.headers,
                  tags: item.tags,
                },
                { idempotencyKey: item.id ? `indiv_${item.id}` : undefined },
              )) as { data?: { id?: string }; error?: { message?: string } };

              if (indivRes?.data?.id) {
                sentList.push({ id: item.id, providerId: indivRes.data.id });
              } else if (indivRes?.error) {
                failedList.push({
                  id: item.id,
                  errorCode: "INDIVIDUAL_SEND_FAILED",
                  errorMessage: indivRes.error.message || "Failed individual send",
                });
              } else {
                sentList.push({ id: item.id, providerId: `resend_${crypto.randomUUID()}` });
              }
            } catch (indivErr) {
              failedList.push({
                id: item.id,
                errorCode: "INDIVIDUAL_SEND_EXCEPTION",
                errorMessage: indivErr instanceof Error ? indivErr.message : "Send exception",
              });
            }
          }
          return { sent: sentList, failed: failedList };
        }
        return classified;
      }

      const resData = response.data;
      const sentList: Array<{ id: string; providerId: string }> = [];
      const failedList: Array<{ id: string; errorCode: string; errorMessage: string }> = [];

      // Mapear erros pontuais por índice (modo permissivo)
      const errorIndices = new Map<number, string>();
      const responseErrors =
        (resData && !Array.isArray(resData) && resData.errors) || response.errors;
      if (Array.isArray(responseErrors)) {
        for (const errItem of responseErrors) {
          if (typeof errItem.index === "number") {
            errorIndices.set(errItem.index, errItem.message || "Invalid recipient");
          }
        }
      }

      // Se houver array de dados
      const dataArr: Array<{ id: string }> = Array.isArray(resData)
        ? resData
        : Array.isArray(resData?.data)
          ? resData.data
          : [];

      let dataPtr = 0;
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        if (errorIndices.has(idx)) {
          failedList.push({
            id: item.id,
            errorCode: "INVALID_RECIPIENT",
            errorMessage: errorIndices.get(idx) || "Invalid recipient address",
          });
        } else if (dataArr[dataPtr]?.id) {
          sentList.push({
            id: item.id,
            providerId: dataArr[dataPtr].id,
          });
          dataPtr++;
        } else if (dataArr[idx]?.id) {
          sentList.push({
            id: item.id,
            providerId: dataArr[idx].id,
          });
        } else {
          // Fallback caso resposta tenha formato resumido
          sentList.push({
            id: item.id,
            providerId: `resend_${crypto.randomUUID()}`,
          });
        }
      }

      return {
        sent: sentList,
        failed: failedList,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      return this.classifyError(err, items);
    }
  }

  private classifyError(err: unknown, items: BatchEmailItem[]): BatchSendOutcome {
    const errorObj = (err || {}) as {
      statusCode?: number;
      status?: number;
      name?: string;
      message?: string;
    };
    const statusCode = errorObj.statusCode || errorObj.status || 0;
    const name = errorObj.name || "";
    const message = errorObj.message || "";

    // 1. Rate Limit (429)
    const isRateLimit =
      statusCode === 429 ||
      /429|rate_limit_exceeded|too many requests/i.test(message) ||
      name === "rate_limit_exceeded";
    if (isRateLimit) {
      const isQuota = /daily quota|monthly quota|quota exceeded|limit reached/i.test(message);
      if (isQuota) {
        return {
          sent: [],
          failed: items.map((it) => ({
            id: it.id,
            errorCode: "QUOTA_EXCEEDED",
            errorMessage: message,
          })),
          circuitBreak: true,
          circuitBreakReason: "Resend monthly or daily quota limit exceeded.",
        };
      }
      const rawRetry =
        (errorObj as unknown as { retryAfter?: unknown; retry_after?: unknown }).retryAfter ??
        (errorObj as unknown as { retryAfter?: unknown; retry_after?: unknown }).retry_after;
      const retryAfterSec = typeof rawRetry === "number" ? rawRetry : 2;
      return {
        sent: [],
        failed: [],
        rateLimited: true,
        retryAfterSeconds: retryAfterSec,
      };
    }

    // 2. Erros de Configuração e Autenticação (Circuit Breaker imediato)
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      /unauthorized|invalid api key|domain not verified|account paused|restricted/i.test(message)
    ) {
      return {
        sent: [],
        failed: items.map((it) => ({
          id: it.id,
          errorCode: "CONFIG_ERROR",
          errorMessage: message,
        })),
        circuitBreak: true,
        circuitBreakReason: `Provider configuration error: ${message}`,
      };
    }

    // 3. Conflito de Idempotência (409)
    if (statusCode === 409) {
      if (/concurrent/i.test(message)) {
        // Concorrência temporária com a mesma chave: adiar sem quebrar
        return {
          sent: [],
          failed: [],
          rateLimited: true,
          retryAfterSeconds: 3,
        };
      }
      // Reuso inválido de chave com payload diferente: bug estrutural
      return {
        sent: [],
        failed: items.map((it) => ({
          id: it.id,
          errorCode: "INVALID_IDEMPOTENCY",
          errorMessage: message,
        })),
        circuitBreak: true,
        circuitBreakReason: "Invalid idempotent request with mismatched payload.",
      };
    }

    // 4. Erros Ambíguos (Timeout, 5xx, Network)
    if (
      name === "TimeoutError" ||
      name === "AbortError" ||
      statusCode >= 500 ||
      /timeout|econnreset|etimedout|enotfound|fetch failed|network timeout/i.test(message)
    ) {
      return {
        sent: [],
        failed: [],
        ambiguous: true,
      };
    }

    // 5. Erro 422 ou de Validação que atingiu o lote inteiro
    if (statusCode === 422 || /validation/i.test(message)) {
      return {
        sent: [],
        failed: items.map((it) => ({
          id: it.id,
          errorCode: "BATCH_VALIDATION_ERROR",
          errorMessage: message,
        })),
        circuitBreak: false,
      };
    }

    return {
      sent: [],
      failed: items.map((it) => ({
        id: it.id,
        errorCode: "UNKNOWN_PROVIDER_ERROR",
        errorMessage: message,
      })),
      circuitBreak: true,
      circuitBreakReason: message,
    };
  }
}

/**
 * Fábrica para instanciar o provedor adequado (Fake para dryRun ou Resend para envios reais).
 */
export function getMailProvider(options?: { dryRun?: boolean }): MailProvider {
  if (options?.dryRun) {
    return new FakeMailProvider();
  }
  return new ResendMailProvider();
}

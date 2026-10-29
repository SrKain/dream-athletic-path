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
      const response = rawResponse as unknown as {
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
              )) as unknown as { data?: { id?: string }; error?: { message?: string } };

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

// ============================================================================
// MOTOR V2 — MATRIZ FECHADA DE FALHAS (SEÇÃO 4.4) E IDEMPOTÊNCIA POR LOTE
// ============================================================================

export type V2BatchDisposition =
  | "accepted" // 200 com IDs para todos os itens
  | "partial" // 200 com alguns IDs e alguns erros 4xx por item
  | "retry_same_key" // 429 rate_limit_exceeded ou 409 concurrent_idempotent_requests
  | "ambiguous_same_key" // 5xx, timeout, queda de rede -> reenviar payload idêntico com MESMA chave
  | "pause_quota" // 429 monthly_quota_exceeded / daily_quota_exceeded -> pausa de segurança sem falhar item
  | "pause_config" // 401/403 domain/key error -> pausa de segurança sem falhar item
  | "unconfirmed_409" // 409 invalid_idempotent_request -> NUNCA reenviar; itens viram unconfirmed
  | "failed_permanent"; // 422 / 400 definitivo no lote

export interface V2BatchItemOutcome {
  id: string;
  status: "accepted" | "failed_permanent" | "failed_retryable" | "unconfirmed";
  providerMessageId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  failureCategory?: string | null;
}

export interface V2BatchSubmissionResult {
  disposition: V2BatchDisposition;
  httpStatus: number;
  idempotencyKey: string;
  outcomes: V2BatchItemOutcome[];
  retryAfterMs?: number;
  pauseReason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  rawResponse?: Record<string, unknown> | null;
}

export function parseRetryAfterMs(rawRetryAfter: unknown, fallbackMs = 2000): number {
  if (typeof rawRetryAfter === "number" && Number.isFinite(rawRetryAfter) && rawRetryAfter > 0) {
    return Math.min(Math.max(Math.ceil(rawRetryAfter * 1000), 500), 300_000);
  }
  if (typeof rawRetryAfter === "string" && rawRetryAfter.trim()) {
    const trimmed = rawRetryAfter.trim();
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.min(Math.max(Math.ceil(numeric * 1000), 500), 300_000);
    }
    const parsedDate = Date.parse(trimmed);
    if (!Number.isNaN(parsedDate)) {
      const deltaMs = parsedDate - Date.now();
      return Math.min(Math.max(deltaMs, 500), 300_000);
    }
  }
  return fallbackMs;
}

/**
 * Classifica qualquer erro da Resend Batch API segundo a matriz fechada da Seção 4.4.
 * NUNCA faz fallback de 100 chamadas individuais em cascata.
 */
export function classifyBatchErrorV2(
  err: unknown,
  items: BatchEmailItem[],
  idempotencyKey: string,
): V2BatchSubmissionResult {
  const errorObj = (err || {}) as {
    statusCode?: number;
    status?: number;
    name?: string;
    code?: string;
    message?: string;
    retryAfter?: unknown;
    retry_after?: unknown;
    headers?: Record<string, string | undefined>;
  };

  const statusCode = Number(errorObj.statusCode || errorObj.status || 0);
  const name = String(errorObj.name || errorObj.code || "").toLowerCase();
  const message = String(errorObj.message || "Unknown Resend batch error");
  const rawRetryHeader =
    errorObj.retryAfter ??
    errorObj.retry_after ??
    errorObj.headers?.["retry-after"] ??
    errorObj.headers?.["Retry-After"];

  // 1. 409 Conflict de Idempotência
  if (statusCode === 409 || /idempotent/i.test(name) || /idempotent/i.test(message)) {
    if (/concurrent/i.test(name) || /concurrent/i.test(message)) {
      // 409 concurrent_idempotent_requests: primeira chamada ainda em voo no Resend -> aguardar e consultar/repetir com MESMA chave
      return {
        disposition: "retry_same_key",
        httpStatus: 409,
        idempotencyKey,
        outcomes: [],
        retryAfterMs: parseRetryAfterMs(rawRetryHeader, 2500),
        errorCode: "CONCURRENT_IDEMPOTENT_REQUESTS",
        errorMessage: message,
        rawResponse: { statusCode: 409, name, message },
      };
    }

    // 409 invalid_idempotent_request: chave reutilizada com payload diferente -> NUNCA reenviar; itens viram unconfirmed
    return {
      disposition: "unconfirmed_409",
      httpStatus: 409,
      idempotencyKey,
      outcomes: items.map((it) => ({
        id: it.id,
        status: "unconfirmed",
        providerMessageId: null,
        errorCode: "INVALID_IDEMPOTENT_REQUEST",
        errorMessage: `Conflito 409 de payload idempotente (${idempotencyKey}): ${message}`,
        failureCategory: "invalid_idempotent_request",
      })),
      pauseReason: `Pausada por segurança: conflito 409 invalid_idempotent_request no lote ${idempotencyKey}.`,
      errorCode: "INVALID_IDEMPOTENT_REQUEST",
      errorMessage: message,
      rawResponse: { statusCode: 409, name, message },
    };
  }

  // 2. 429 Rate Limit vs Cota Mensal / Diária
  if (
    statusCode === 429 ||
    name === "rate_limit_exceeded" ||
    name === "monthly_quota_exceeded" ||
    name === "daily_quota_exceeded" ||
    /429|rate_limit|too many requests|monthly_quota|daily_quota|quota exceeded/i.test(message)
  ) {
    const isQuotaExceeded =
      name === "monthly_quota_exceeded" ||
      name === "daily_quota_exceeded" ||
      /monthly_quota_exceeded|daily_quota_exceeded|monthly quota|daily quota|quota exceeded/i.test(
        message,
      );

    if (isQuotaExceeded) {
      // Pausa por segurança SEM marcar itens como falha
      const quotaLabel = /daily/i.test(name + " " + message)
        ? "Cota diária do Resend atingida (daily_quota_exceeded)."
        : "Cota mensal do Resend atingida (monthly_quota_exceeded).";
      return {
        disposition: "pause_quota",
        httpStatus: 429,
        idempotencyKey,
        outcomes: [],
        pauseReason: `Pausada por segurança: ${quotaLabel} Nenhum item pendente foi perdido.`,
        errorCode: name.toUpperCase() || "QUOTA_EXCEEDED",
        errorMessage: message,
        rawResponse: { statusCode: 429, name, message },
      };
    }

    // 429 de taxa por segundo: respeita retry-after e repete com a MESMA chave
    return {
      disposition: "retry_same_key",
      httpStatus: 429,
      idempotencyKey,
      outcomes: [],
      retryAfterMs: parseRetryAfterMs(rawRetryHeader, 2000),
      errorCode: "RATE_LIMIT_EXCEEDED",
      errorMessage: message,
      rawResponse: { statusCode: 429, name, message },
    };
  }

  // 3. 401 / 403 Credenciais ou Domínio -> Pausa de segurança sem perder a fila
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    /unauthorized|invalid api key|domain not verified|forbidden/i.test(message)
  ) {
    return {
      disposition: "pause_config",
      httpStatus: statusCode || 403,
      idempotencyKey,
      outcomes: [],
      pauseReason: `Pausada por segurança: erro de autenticação/domínio no provedor (${message}).`,
      errorCode: "PROVIDER_CONFIG_ERROR",
      errorMessage: message,
      rawResponse: { statusCode: statusCode || 403, name, message },
    };
  }

  // 4. 5xx, Timeout, Queda de Rede -> Lote `ambiguous` -> Reenvio IDÊNTICO com a MESMA Idempotency-Key
  if (
    statusCode >= 500 ||
    statusCode === 408 ||
    name === "timeouterror" ||
    name === "aborterror" ||
    /timeout|timed out|econnreset|etimedout|enotfound|fetch failed|network|socket hang up|500|502|503|504/i.test(
      message,
    )
  ) {
    return {
      disposition: "ambiguous_same_key",
      httpStatus: statusCode || 504,
      idempotencyKey,
      outcomes: [],
      retryAfterMs: 1500,
      errorCode: "AMBIGUOUS_NETWORK_OR_5XX",
      errorMessage: message,
      rawResponse: { statusCode: statusCode || 504, name, message },
    };
  }

  // 5. 400 / 422 Definitivo de Validação
  return {
    disposition: "failed_permanent",
    httpStatus: statusCode || 422,
    idempotencyKey,
    outcomes: items.map((it) => ({
      id: it.id,
      status: "failed_permanent",
      providerMessageId: null,
      errorCode: "BATCH_VALIDATION_ERROR",
      errorMessage: message,
      failureCategory: "provider_4xx_validation",
    })),
    errorCode: "BATCH_VALIDATION_ERROR",
    errorMessage: message,
    rawResponse: { statusCode: statusCode || 422, name, message },
  };
}

/**
 * Executa o envio de um lote de até 100 e-mails via Resend Batch API (`POST /emails/batch`)
 * com `Idempotency-Key` imutável (`mc:{campaign_id}:b{seq}`) e matriz fechada de falhas.
 */
export async function sendResendBatchV2(
  items: BatchEmailItem[],
  options: {
    idempotencyKey: string;
    dryRun?: boolean;
    timeoutMs?: number;
    customClient?: {
      batch: {
        send: (payload: unknown, opts: unknown) => Promise<unknown>;
      };
    } | null;
  },
): Promise<V2BatchSubmissionResult> {
  const { idempotencyKey, dryRun = false, timeoutMs = 10_000 } = options;

  if (items.length === 0) {
    return {
      disposition: "accepted",
      httpStatus: 200,
      idempotencyKey,
      outcomes: [],
      rawResponse: { empty: true },
    };
  }

  if (items.length > 100) {
    throw new Error(`sendResendBatchV2: Resend batch limit is 100 items, received ${items.length}`);
  }

  // Modo Dry Run: gera IDs determinísticos por item sem chamar rede
  if (dryRun) {
    return {
      disposition: "accepted",
      httpStatus: 200,
      idempotencyKey,
      outcomes: items.map((it, idx) => ({
        id: it.id,
        status: "accepted",
        providerMessageId: `dry_${idempotencyKey}_${idx + 1}`,
      })),
      rawResponse: { dryRun: true, count: items.length },
    };
  }

  const { isConfigured, from: defaultFrom } = getResendConfig();
  if (!isConfigured && !options.customClient) {
    return {
      disposition: "pause_config",
      httpStatus: 503,
      idempotencyKey,
      outcomes: [],
      pauseReason: "Pausada por segurança: RESEND_API_KEY não configurada no servidor.",
      errorCode: "RESEND_NOT_CONFIGURED",
      errorMessage: "RESEND_API_KEY is missing.",
    };
  }

  const client = options.customClient ?? getResendClient();
  if (!client) {
    return {
      disposition: "pause_config",
      httpStatus: 503,
      idempotencyKey,
      outcomes: [],
      pauseReason: "Pausada por segurança: falha ao inicializar cliente Resend.",
      errorCode: "RESEND_INIT_FAILED",
      errorMessage: "Failed to initialize Resend client.",
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const sendPromise = (
      client.batch as unknown as {
        send: (payload: unknown, opts: unknown) => Promise<unknown>;
      }
    ).send(batchPayload, {
      batchValidation: "permissive",
      idempotencyKey,
    });

    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => {
        const err = new Error(`Resend batch request timed out after ${timeoutMs}ms`);
        err.name = "TimeoutError";
        reject(err);
      });
    });

    const rawResponse = await Promise.race([sendPromise, abortPromise]);
    clearTimeout(timer);

    const response = rawResponse as {
      data?:
        | {
            data?: Array<{ id?: string }>;
            errors?: Array<{ index: number; message?: string; code?: string }>;
          }
        | Array<{ id?: string }>;
      errors?: Array<{ index: number; message?: string; code?: string }>;
      error?: {
        statusCode?: number;
        status?: number;
        name?: string;
        message?: string;
        retryAfter?: unknown;
      } | null;
    };

    if (response?.error) {
      return classifyBatchErrorV2(response.error, items, idempotencyKey);
    }

    const resData = response?.data;
    const errorIndices = new Map<number, { message: string; code: string }>();
    const responseErrors =
      (resData && !Array.isArray(resData) && resData.errors) || response?.errors;

    if (Array.isArray(responseErrors)) {
      for (const errItem of responseErrors) {
        if (typeof errItem.index === "number") {
          errorIndices.set(errItem.index, {
            message: errItem.message || " Destinatário rejeitado pelo provedor (4xx)",
            code: errItem.code || "ITEM_VALIDATION_ERROR",
          });
        }
      }
    }

    const dataArr: Array<{ id?: string }> = Array.isArray(resData)
      ? resData
      : Array.isArray(resData?.data)
        ? resData.data
        : [];

    const outcomes: V2BatchItemOutcome[] = [];
    let dataPtr = 0;
    let hasAccepted = false;
    let hasRejected = false;

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (errorIndices.has(idx)) {
        const itemErr = errorIndices.get(idx)!;
        hasRejected = true;
        outcomes.push({
          id: item.id,
          status: "failed_permanent",
          providerMessageId: null,
          errorCode: itemErr.code,
          errorMessage: itemErr.message,
          failureCategory: "provider_item_rejected",
        });
      } else {
        const candidateId =
          dataArr[dataPtr]?.id ?? (dataArr.length === items.length ? dataArr[idx]?.id : undefined);
        if (dataArr[dataPtr]?.id !== undefined) {
          dataPtr++;
        }

        if (candidateId && String(candidateId).trim().length > 0) {
          hasAccepted = true;
          outcomes.push({
            id: item.id,
            status: "accepted",
            providerMessageId: String(candidateId).trim(),
          });
        } else {
          // Regra da Seção 4.4: NUNCA marcar `accepted` sem `provider_message_id` real do provedor
          hasRejected = true;
          outcomes.push({
            id: item.id,
            status: "unconfirmed",
            providerMessageId: null,
            errorCode: "MISSING_PROVIDER_MESSAGE_ID",
            errorMessage:
              "O provedor retornou HTTP 200 para o lote sem informar o ID desta mensagem.",
            failureCategory: "missing_provider_id",
          });
        }
      }
    }

    const disposition: V2BatchDisposition =
      hasAccepted && hasRejected ? "partial" : hasAccepted ? "accepted" : "failed_permanent";

    return {
      disposition,
      httpStatus: 200,
      idempotencyKey,
      outcomes,
      rawResponse: {
        acceptedCount: outcomes.filter((o) => o.status === "accepted").length,
        rejectedCount: outcomes.filter((o) => o.status !== "accepted").length,
      },
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    return classifyBatchErrorV2(err, items, idempotencyKey);
  }
}

import dns from "node:dns/promises";
import { getAdminClient } from "@/lib/supabase/clients.server";

export interface DomainCheckResult {
  hasMx: boolean;
  deliverable?: boolean;
  unverified?: boolean;
  reason?: string;
}

export interface DomainHygieneResult {
  domain: string;
  deliverable: boolean;
  hasMx: boolean;
  reason?: string;
  unverified?: boolean;
}

export async function checkDomainHygiene(
  domain: string,
  _options?: { timeoutMs?: number },
): Promise<DomainHygieneResult> {
  const cleanDomain = domain.toLowerCase().trim();
  if (!cleanDomain || !cleanDomain.includes(".")) {
    return { domain: cleanDomain, deliverable: false, hasMx: false, reason: "INVALID_DOMAIN" };
  }

  const res = await checkSingleDomainDns(cleanDomain);
  const deliverable = Boolean(res.hasMx);
  return {
    domain: cleanDomain,
    deliverable,
    hasMx: res.hasMx,
    reason: !deliverable ? "NXDOMAIN" : undefined,
    unverified: res.unverified,
  };
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const DNS_TIMEOUT_MS = 3000; // 3 segundos
const MAX_DNS_CONCURRENCY = 20;

/**
 * Consulta DNS com timeout nativo.
 */
async function resolveWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ result?: T; timedOut?: boolean; error?: unknown }> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  try {
    const outcome = await Promise.race([promise.then((res) => ({ result: res })), timeoutPromise]);
    return outcome;
  } catch (error) {
    return { error };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Verifica se um domínio possui registros MX ou registros A (fallback).
 * - Sem MX e sem A -> hasMx: false
 * - Erro transitório (timeout, SERVFAIL, etc.) -> unverified: true, hasMx: true (fail-open para não descartar indevidamente)
 */
export async function checkSingleDomainDns(domain: string): Promise<DomainCheckResult> {
  const cleanDomain = domain.toLowerCase().trim();
  if (!cleanDomain || !cleanDomain.includes(".")) {
    return { hasMx: false };
  }

  // 1. Tentar MX
  const mxOutcome = await resolveWithTimeout(dns.resolveMx(cleanDomain), DNS_TIMEOUT_MS);

  if (mxOutcome.timedOut) {
    return { hasMx: true, unverified: true };
  }

  if (mxOutcome.result && Array.isArray(mxOutcome.result) && mxOutcome.result.length > 0) {
    return { hasMx: true };
  }

  // Se o erro foi timeout ou servidor DNS indisponível, não descartar
  if (mxOutcome.error) {
    const code = (mxOutcome.error as { code?: string })?.code;
    if (code === "ETIMEOUT" || code === "ESERVFAIL" || code === "EBADRESP") {
      return { hasMx: true, unverified: true };
    }
  }

  // 2. Fallback para registro A (RFC 5321)
  const aOutcome = await resolveWithTimeout(dns.resolve4(cleanDomain), DNS_TIMEOUT_MS);

  if (aOutcome.timedOut) {
    return { hasMx: true, unverified: true };
  }

  if (aOutcome.result && Array.isArray(aOutcome.result) && aOutcome.result.length > 0) {
    return { hasMx: true };
  }

  if (aOutcome.error) {
    const code = (aOutcome.error as { code?: string })?.code;
    if (code === "ETIMEOUT" || code === "ESERVFAIL" || code === "EBADRESP") {
      return { hasMx: true, unverified: true };
    }
  }

  // Comprovadamente sem MX e sem A
  return { hasMx: false };
}

/**
 * Verifica um lote de domínios em lote com concorrência máxima de 20 e cache no Supabase (E18).
 */
export async function checkDomainsWithCache(
  domains: string[],
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<Map<string, DomainCheckResult>> {
  const results = new Map<string, DomainCheckResult>();
  const uniqueDomains = Array.from(
    new Set(domains.map((d) => d.toLowerCase().trim()).filter(Boolean)),
  );

  if (uniqueDomains.length === 0) {
    return results;
  }

  const admin = customAdmin || getAdminClient();
  const nowMs = Date.now();
  const toCheck: string[] = [];

  // 1. Consultar cache na tabela mailer_domain_checks
  try {
    for (let i = 0; i < uniqueDomains.length; i += 1000) {
      const slice = uniqueDomains.slice(i, i + 1000);
      const { data: cachedRows } = await admin
        .from("mailer_domain_checks")
        .select("domain, has_mx, checked_at")
        .in("domain", slice);

      if (Array.isArray(cachedRows)) {
        for (const row of cachedRows as Array<{
          domain: string;
          has_mx: boolean;
          checked_at: string;
        }>) {
          const checkedMs = new Date(row.checked_at).getTime();
          if (nowMs - checkedMs < CACHE_TTL_MS) {
            results.set(row.domain, { hasMx: row.has_mx, deliverable: row.has_mx });
          }
        }
      }
    }
  } catch (err) {
    console.warn("[domain-hygiene] Error reading mailer_domain_checks cache:", err);
  }

  for (const d of uniqueDomains) {
    if (!results.has(d)) {
      toCheck.push(d);
    }
  }

  if (toCheck.length === 0) {
    return results;
  }

  // 2. Executar DNS com concorrência controlada (chunking de 20)
  const newlyChecked: Array<{ domain: string; has_mx: boolean; checked_at: string }> = [];

  for (let i = 0; i < toCheck.length; i += MAX_DNS_CONCURRENCY) {
    const chunk = toCheck.slice(i, i + MAX_DNS_CONCURRENCY);
    const chunkPromises = chunk.map(async (domain) => {
      const checkRes = await checkSingleDomainDns(domain);
      results.set(domain, { ...checkRes, deliverable: checkRes.hasMx });
      if (!checkRes.unverified) {
        newlyChecked.push({
          domain,
          has_mx: checkRes.hasMx,
          checked_at: new Date().toISOString(),
        });
      }
    });
    await Promise.all(chunkPromises);
  }

  // 3. Salvar novos resultados no cache de forma assíncrona
  if (newlyChecked.length > 0) {
    try {
      for (let i = 0; i < newlyChecked.length; i += 500) {
        const slice = newlyChecked.slice(i, i + 500);
        await admin.from("mailer_domain_checks").upsert(slice, { onConflict: "domain" });
      }
    } catch (err) {
      console.warn("[domain-hygiene] Error updating mailer_domain_checks cache:", err);
    }
  }

  return results;
}

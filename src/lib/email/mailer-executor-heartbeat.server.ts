/**
 * TASK-117 — Heartbeat de executores externos do Mailer (ex.: pulse na Hetzner).
 *
 * O executor externo chama POST /api/mailer/tick autenticado por
 * MAILER_CRON_SECRET e se identifica pelo header `x-mailer-executor`.
 * Cada chamada grava `last_seen_at` em `mailer_executor_heartbeats` (migration 0034).
 *
 * Tudo aqui é best-effort: falha de leitura/gravação (ex.: 0034 ainda não aplicada)
 * nunca derruba o tick nem a tela de progresso.
 */

/** Sinal mais antigo que isto não conta como executor ativo. */
export const EXECUTOR_HEARTBEAT_FRESH_MS = 90_000;

const EXECUTOR_NAME_RE = /^[a-z0-9-]{1,40}$/;

/** Normaliza o nome enviado pelo executor; devolve null se inválido. */
export function sanitizeExecutorName(raw: string | null | undefined): string | null {
  const name = (raw || "").trim().toLowerCase();
  return EXECUTOR_NAME_RE.test(name) ? name : null;
}

interface HeartbeatWriter {
  from: (table: string) => {
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
}

interface HeartbeatReader {
  from?: (table: string) => {
    select: (cols: string) => {
      gte: (
        col: string,
        value: string,
      ) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => {
          limit: (n: number) => PromiseLike<{
            data: Array<{ executor: string; last_seen_at: string }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

export async function recordExecutorHeartbeat(
  admin: HeartbeatWriter,
  executor: string,
  lastTickStatus: string | null = null,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const { error } = await admin.from("mailer_executor_heartbeats").upsert(
      {
        executor,
        last_seen_at: now.toISOString(),
        last_tick_status: lastTickStatus,
      },
      { onConflict: "executor" },
    );
    if (error) {
      console.warn("[mailer-heartbeat] gravação ignorada:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[mailer-heartbeat] gravação ignorada:", (err as Error)?.message);
    return false;
  }
}

/** Devolve o executor externo com sinal mais recente dentro da janela de frescor, ou null. */
export async function getFreshExecutorHeartbeat(
  admin: HeartbeatReader,
  now: Date = new Date(),
): Promise<{ executor: string; lastSeenAt: string } | null> {
  if (typeof admin.from !== "function") return null;
  try {
    const since = new Date(now.getTime() - EXECUTOR_HEARTBEAT_FRESH_MS).toISOString();
    const { data, error } = await admin
      .from("mailer_executor_heartbeats")
      .select("executor,last_seen_at")
      .gte("last_seen_at", since)
      .order("last_seen_at", { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return { executor: data[0].executor, lastSeenAt: data[0].last_seen_at };
  } catch {
    return null;
  }
}

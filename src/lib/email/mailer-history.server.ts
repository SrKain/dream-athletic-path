import { getAdminClient } from "@/lib/supabase/clients.server";
import type {
  UniversityLeague,
  UniversityBudgetLevel,
  UniversityToeflLevel,
} from "@/types/db";

export interface MailerHistoryFilterOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  campaignId?: string;
  athleteId?: string;
  universityName?: string;
  state?: string;
  league?: string;
  budgetLevel?: string;
  toeflLevel?: string;
  startDate?: string;
  endDate?: string;
}

export interface MailerHistoryItem {
  id: string;
  campaignId: string | null;
  athleteId: string | null;
  athleteIds: string[];
  coachId: string | null;
  subject: string;
  status: "sent" | "failed" | "suppressed";
  errorMessage: string | null;
  sentAt: string;
  emailType: string;
  recipientEmail: string;
  recipientName: string;
  universityName: string | null;
  providerId: string | null;
  // Características importadas (com rastreabilidade honesta de proveniência)
  importedCharacteristics: {
    state: string | null;
    city: string | null;
    league: UniversityLeague | null;
    isHbcu: boolean | null;
    budgetLevel: UniversityBudgetLevel | null;
    toeflLevel: UniversityToeflLevel | null;
    provenance: "snapshot" | "inferred" | "unavailable";
    provenanceLabel: string;
  };
}

export interface PaginatedMailerHistoryResult {
  items: MailerHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  appliedFilters: {
    search?: string;
    status?: string;
    state?: string;
    league?: string;
    budgetLevel?: string;
    toeflLevel?: string;
  };
}

/**
 * Consulta de histórico do Mailer com paginação real no servidor (25/50/100 itens),
 * filtros combinados e enriquecimento controlado de características importadas.
 */
export async function getPaginatedMailerHistory(
  options: MailerHistoryFilterOptions = {},
  customAdmin?: ReturnType<typeof getAdminClient>,
): Promise<PaginatedMailerHistoryResult> {
  const admin = customAdmin || getAdminClient();
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = [25, 50, 100].includes(Number(options.pageSize))
    ? Number(options.pageSize)
    : 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Se houver filtros de características de universidade (state, league, budget, toefl)
  let matchingUniversityNames: string[] | null = null;
  const hasUniversityFilter =
    Boolean(options.state && options.state !== "all") ||
    Boolean(options.league && options.league !== "all") ||
    Boolean(options.budgetLevel && options.budgetLevel !== "all") ||
    Boolean(options.toeflLevel && options.toeflLevel !== "all");

  if (hasUniversityFilter) {
    let uQuery = admin.from("universities").select("name");
    if (options.state && options.state !== "all") {
      uQuery = uQuery.eq("state", options.state);
    }
    if (options.league && options.league !== "all") {
      uQuery = uQuery.eq("league", options.league);
    }
    if (options.budgetLevel && options.budgetLevel !== "all") {
      uQuery = uQuery.eq("budget_level", options.budgetLevel);
    }
    if (options.toeflLevel && options.toeflLevel !== "all") {
      uQuery = uQuery.eq("toefl_level", options.toeflLevel);
    }

    const { data: matchedUnis, error: uErr } = await uQuery.limit(2000);
    if (!uErr && matchedUnis) {
      matchingUniversityNames = matchedUnis
        .map((u) => u.name?.trim())
        .filter((n): n is string => Boolean(n));
      // Se nenhuma universidade atendeu aos filtros, o total é 0
      if (matchingUniversityNames.length === 0) {
        return {
          items: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
          appliedFilters: {
            search: options.search,
            status: options.status,
            state: options.state,
            league: options.league,
            budgetLevel: options.budgetLevel,
            toeflLevel: options.toeflLevel,
          },
        };
      }
    }
  }

  let query = admin
    .from("recruit_email_logs")
    .select(
      "id, campaign_id, athlete_id, athlete_ids, coach_id, subject, status, error_message, sent_at, email_type, recipient_email, recipient_name, university_name, provider_id",
      { count: "exact" },
    );

  // Filtro de busca textual
  if (options.search && options.search.trim()) {
    const s = options.search.trim();
    query = query.or(
      `recipient_email.ilike.%${s}%,recipient_name.ilike.%${s}%,subject.ilike.%${s}%,university_name.ilike.%${s}%`,
    );
  }

  // Filtro por status
  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  // Filtro por campanha
  if (options.campaignId && options.campaignId.trim()) {
    query = query.eq("campaign_id", options.campaignId.trim());
  }

  // Filtro por atleta
  if (options.athleteId && options.athleteId.trim()) {
    query = query.eq("athlete_id", options.athleteId.trim());
  }

  // Filtro por universidade específica
  if (options.universityName && options.universityName !== "all") {
    query = query.eq("university_name", options.universityName);
  }

  // Filtro cruzado com universidades encontradas
  if (matchingUniversityNames !== null) {
    query = query.in("university_name", matchingUniversityNames);
  }

  // Filtro por intervalo de datas
  if (options.startDate) {
    query = query.gte("sent_at", options.startDate);
  }
  if (options.endDate) {
    query = query.lte("sent_at", options.endDate);
  }

  // Ordenação estável
  query = query.order("sent_at", { ascending: false }).order("id", { ascending: false });

  // Paginação
  query = query.range(from, to);

  const { data: logs, count, error } = await query;

  if (error) {
    console.error("[mailer-history] Error loading paginated history:", error.message);
    return {
      items: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
      appliedFilters: {},
    };
  }

  const rawLogs = logs || [];
  const total = count || 0;
  const totalPages = Math.ceil(total / pageSize);

  // Mapear universidades dos logs para enriquecer características com proveniência honesta
  const distinctUniversityNames = Array.from(
    new Set(
      rawLogs
        .map((l) => l.university_name?.trim())
        .filter((n): n is string => Boolean(n)),
    ),
  );

  const universityCharacteristicsMap = new Map<
    string,
    {
      state: string;
      city: string;
      league: UniversityLeague | null;
      isHbcu: boolean;
      budgetLevel: UniversityBudgetLevel | null;
      toeflLevel: UniversityToeflLevel | null;
    }
  >();

  if (distinctUniversityNames.length > 0) {
    const { data: uniDetails } = await admin
      .from("universities")
      .select("name, state, city, league, is_hbcu, budget_level, toefl_level")
      .in("name", distinctUniversityNames);

    if (uniDetails) {
      for (const u of uniDetails) {
        if (u.name) {
          universityCharacteristicsMap.set(u.name.toLowerCase().trim(), {
            state: u.state,
            city: u.city,
            league: u.league as UniversityLeague,
            isHbcu: Boolean(u.is_hbcu),
            budgetLevel: u.budget_level as UniversityBudgetLevel,
            toeflLevel: u.toefl_level as UniversityToeflLevel,
          });
        }
      }
    }
  }

  const items: MailerHistoryItem[] = rawLogs.map((row) => {
    const uniKey = row.university_name?.toLowerCase().trim() || "";
    const uniChar = uniKey ? universityCharacteristicsMap.get(uniKey) : null;

    let provenance: "snapshot" | "inferred" | "unavailable" = "unavailable";
    let provenanceLabel = "Não disponível";

    if (uniChar) {
      provenance = "inferred";
      provenanceLabel = "Inferido do cadastro atual";
    }

    return {
      id: row.id,
      campaignId: row.campaign_id,
      athleteId: row.athlete_id,
      athleteIds: Array.isArray(row.athlete_ids) ? row.athlete_ids : [],
      coachId: row.coach_id,
      subject: row.subject,
      status: row.status as "sent" | "failed" | "suppressed",
      errorMessage: row.error_message,
      sentAt: row.sent_at,
      emailType: row.email_type,
      recipientEmail: row.recipient_email || "",
      recipientName: row.recipient_name || "",
      universityName: row.university_name,
      providerId: row.provider_id,
      importedCharacteristics: {
        state: uniChar?.state || null,
        city: uniChar?.city || null,
        league: uniChar?.league || null,
        isHbcu: uniChar ? uniChar.isHbcu : null,
        budgetLevel: uniChar?.budgetLevel || null,
        toeflLevel: uniChar?.toeflLevel || null,
        provenance,
        provenanceLabel,
      },
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    appliedFilters: {
      search: options.search,
      status: options.status,
      state: options.state,
      league: options.league,
      budgetLevel: options.budgetLevel,
      toeflLevel: options.toeflLevel,
    },
  };
}

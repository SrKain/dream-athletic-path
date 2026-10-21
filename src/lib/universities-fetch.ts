import type { SupabaseClient } from "@supabase/supabase-js";

export const UNIVERSITY_PAGE_SIZE = 1000;

type PageResponse<T> = { data: T[] | null; error: { message: string } | null };
type PageFetcher<T> = (from: number, to: number) => PromiseLike<PageResponse<T>>;

/** Fetch every PostgREST page, never silently accepting a truncated result. */
export async function fetchAllPages<T extends { id: string }>(
  fetchPage: PageFetcher<T>,
  label: string,
): Promise<T[]> {
  const result: T[] = [];
  const seen = new Set<string>();
  for (let from = 0; ; from += UNIVERSITY_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + UNIVERSITY_PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read ${label} at offset ${from}: ${error.message}`);
    if (!Array.isArray(data)) throw new Error(`Incomplete ${label} page at offset ${from}`);
    for (const row of data) {
      if (!row?.id || seen.has(row.id)) {
        throw new Error(`Unstable or duplicated ${label} pagination at offset ${from}`);
      }
      seen.add(row.id);
      result.push(row);
    }
    if (data.length < UNIVERSITY_PAGE_SIZE) return result;
  }
}

export async function fetchAllUniversities<T extends { id: string }>(
  client: SupabaseClient,
  columns: string,
): Promise<T[]> {
  return fetchAllPages<T>(async (from, to) => {
    const { data, error } = await client
      .from("universities")
      .select(columns)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    return { data: data as unknown as T[] | null, error };
  }, "universities");
}

export async function fetchAllCoaches<T extends { id: string }>(
  client: SupabaseClient,
  columns: string,
): Promise<T[]> {
  return fetchAllPages<T>(async (from, to) => {
    const { data, error } = await client
      .from("coaches")
      .select(columns)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    return { data: data as unknown as T[] | null, error };
  }, "coaches");
}

/** Match the Supabase result contract while preserving fail-closed page errors. */
export async function asQueryResult<T>(
  work: Promise<T>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    return { data: await work, error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

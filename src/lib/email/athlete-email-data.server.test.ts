import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAthletesEmailData } from "./athlete-email-data.server";

vi.mock("@/lib/supabase/clients.server", () => ({ getAdminClient: vi.fn() }));

type QueryResult = { data: Record<string, unknown>[] | null; error: { message: string } | null };
type Client = NonNullable<Parameters<typeof loadAthletesEmailData>[1]>;
type MockQuery = {
  select: () => MockQuery;
  in: () => MockQuery;
  eq: () => MockQuery;
  order: (column: string, options: unknown) => MockQuery;
  then: (
    resolve: (value: QueryResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

function mockClient(overrides: Record<string, Partial<QueryResult> | Error> = {}) {
  const results: Record<string, QueryResult> = {
    athletes: {
      data: [{ id: "a1", full_name: "Ana", sport_id: "s1", position_id: "p1", nationality: "BRA" }],
      error: null,
    },
    athlete_profiles: {
      data: [
        { athlete_id: "a1", bio_en: "Complete biography", team_contribution_en: "Strong leader" },
      ],
      error: null,
    },
    athlete_videos: { data: [], error: null },
    achievements: { data: [{ athlete_id: "a1", title_en: "Latest public title" }], error: null },
    sports: { data: [{ id: "s1", name_en: "Volleyball" }], error: null },
    positions: { data: [{ id: "p1", name_en: "Setter" }], error: null },
    countries: { data: [{ code: "BRA", name_en: "Brazil", flag_emoji: "BR" }], error: null },
  };
  const orders: Array<{ table: string; column: string; options: unknown }> = [];
  const from = vi.fn((table: string) => {
    if (!(table in results)) throw new Error(`Unexpected relation: ${table}`);
    const override = overrides[table];
    const result = override instanceof Error ? override : { ...results[table], ...override };
    const chain: MockQuery = {
      select: vi.fn(() => chain),
      in: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn((column: string, options: unknown) => {
        orders.push({ table, column, options });
        return chain;
      }),
      then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
        (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(
          resolve,
          reject,
        ),
    };
    return chain;
  });
  return { client: { from } as unknown as Client, from, orders };
}

afterEach(() => vi.restoreAllMocks());

describe("Shared athlete email loader", () => {
  it("ignores optional achievement errors, discards partial data and records a structured error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = mockClient({ achievements: { error: { message: "Column unavailable" } } });
    const [athlete] = await loadAthletesEmailData(["a1"], client);
    expect(athlete).toMatchObject({
      athleteId: "a1",
      aboutHer: "Complete biography",
      teamContribution: "Strong leader",
      achievementTitle: null,
    });
    expect(log).toHaveBeenCalledWith(expect.any(String), {
      relation: "achievements",
      message: "Column unavailable",
    });
  });

  it("also tolerates a rejected optional query", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = mockClient({ achievements: new Error("Network unavailable") });
    await expect(loadAthletesEmailData(["a1"], client)).resolves.toMatchObject([
      { achievementTitle: null, aboutHer: "Complete biography" },
    ]);
  });

  it.each(["athletes", "athlete_profiles", "athlete_videos", "sports", "positions", "countries"])(
    "keeps %s query failures fatal",
    async (table) => {
      const { client } = mockClient({ [table]: { error: { message: "Essential query failed" } } });
      await expect(loadAthletesEmailData(["a1"], client)).rejects.toThrow(
        `Mailer: failed loading ${table}: Essential query failed`,
      );
    },
  );

  it("orders dated achievements first with an id tie-break and keeps the first title per athlete", async () => {
    const { client, orders, from } = mockClient({
      achievements: {
        data: [
          { athlete_id: "a1", title_en: "Latest public title" },
          { athlete_id: "a1", title_en: "Older or undated title" },
        ],
      },
    });
    const [athlete] = await loadAthletesEmailData(["a1", "a1"], client);
    expect(orders.filter((order) => order.table === "achievements")).toEqual([
      {
        table: "achievements",
        column: "achieved_on",
        options: { ascending: false, nullsFirst: false },
      },
      { table: "achievements", column: "id", options: { ascending: true } },
    ]);
    expect(athlete.achievementTitle).toBe("Latest public title");
    expect(from.mock.calls.filter(([table]) => table === "achievements")).toHaveLength(1);
  });
});

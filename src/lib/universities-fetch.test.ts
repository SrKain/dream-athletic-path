import { describe, expect, it, vi } from "vitest";
import { fetchAllPages, UNIVERSITY_PAGE_SIZE } from "./universities-fetch";

describe("university/coaches PostgREST pagination", () => {
  it.each([0, 999, 1000, 1001, 1332, 3300])("reads all %i rows", async (count) => {
    const rows = Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Name ${i}` }));
    const request = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));
    const result = await fetchAllPages(request, "universities");
    expect(result).toEqual(rows);
    expect(request).toHaveBeenCalledTimes(Math.floor(count / UNIVERSITY_PAGE_SIZE) + 1);
    expect(request).toHaveBeenNthCalledWith(1, 0, 999);
    if (count > 1000) expect(request).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("rejects partial reads instead of silently hiding universities", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }));
    await expect(
      fetchAllPages(
        async (from) =>
          from === 0
            ? { data: firstPage, error: null }
            : { data: null, error: { message: "PostgREST error" } },
        "universities",
      ),
    ).rejects.toThrow("offset 1000");
  });

  it("rejects duplicated or non-deterministic pages", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }));
    await expect(
      fetchAllPages(async () => ({ data: page, error: null }), "coaches"),
    ).rejects.toThrow("Unstable");
  });
});

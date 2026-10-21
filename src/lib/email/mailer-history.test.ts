import { describe, it, expect, vi } from "vitest";
import { getPaginatedMailerHistory } from "./mailer-history.server";

describe("Mailer History Server-Side Pagination & Filtering Suite", () => {
  it("enforces safe page sizes (25, 50, 100) and defaults to 25", async () => {
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "recruit_email_logs") {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({
                    data: [],
                    count: 42,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as Parameters<typeof getPaginatedMailerHistory>[1];

    const res = await getPaginatedMailerHistory(
      { page: 1, pageSize: 999 }, // 999 should fallback to 25
      mockAdmin,
    );

    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(25);
    expect(res.total).toBe(42);
    expect(res.totalPages).toBe(2);
  });

  it("labels university characteristics as inferred when matched and unavailable when missing", async () => {
    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === "recruit_email_logs") {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: "log-1",
                        campaign_id: "camp-1",
                        athlete_id: "ath-1",
                        athlete_ids: ["ath-1"],
                        subject: "Recruit Showcase",
                        status: "sent",
                        error_message: null,
                        sent_at: "2026-10-21T10:00:00Z",
                        email_type: "athlete_teaser",
                        recipient_email: "coach@ucla.edu",
                        recipient_name: "Coach John",
                        university_name: "UCLA",
                        provider_id: "re_123",
                      },
                      {
                        id: "log-2",
                        campaign_id: "camp-1",
                        athlete_id: "ath-1",
                        subject: "Recruit Showcase",
                        status: "failed",
                        error_message: "Bounce",
                        sent_at: "2026-10-21T10:01:00Z",
                        email_type: "athlete_teaser",
                        recipient_email: "coach@unknown.edu",
                        recipient_name: "Coach Bob",
                        university_name: "Unknown College",
                        provider_id: null,
                      },
                    ],
                    count: 2,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "universities") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    name: "UCLA",
                    state: "CA",
                    city: "Los Angeles",
                    league: "NCAA D1",
                    is_hbcu: false,
                    budget_level: "10000+",
                    toefl_level: "61+",
                  },
                ],
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as Parameters<typeof getPaginatedMailerHistory>[1];

    const res = await getPaginatedMailerHistory({ page: 1, pageSize: 25 }, mockAdmin);

    expect(res.items.length).toBe(2);
    // UCLA row
    expect(res.items[0].importedCharacteristics.provenance).toBe("inferred");
    expect(res.items[0].importedCharacteristics.provenanceLabel).toBe("Inferido do cadastro atual");
    expect(res.items[0].importedCharacteristics.league).toBe("NCAA D1");
    expect(res.items[0].importedCharacteristics.state).toBe("CA");

    // Unknown row
    expect(res.items[1].importedCharacteristics.provenance).toBe("unavailable");
    expect(res.items[1].importedCharacteristics.provenanceLabel).toBe("Não disponível");
    expect(res.items[1].importedCharacteristics.league).toBeNull();
  });
});

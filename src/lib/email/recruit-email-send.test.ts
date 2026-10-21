import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendMailerEmails, sendRecruitEmailToCoaches } from "./recruit-email.server";

import { assertAnaQuickFacts } from "./__fixtures__/assert-quick-facts";

const mockInsertedCampaigns: Array<Record<string, unknown>> = [];
const mockInsertedLogs: Array<Record<string, unknown>> = [];
const mockBatchSentPayloads: Array<Array<Record<string, unknown>>> = [];
const mockSingleSentPayloads: Array<Record<string, unknown>> = [];
let mockBatchShouldFail = false;

vi.mock("@/lib/supabase/clients.server", () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === "email_suppressions") {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
        };
      }
      if (table === "agency_visual_settings") {
        return {
          select: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { logo_url: null, hero_background_url: null },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "mailer_campaigns") {
        return {
          insert: (row: Record<string, unknown>) => {
            mockInsertedCampaigns.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "recruit_email_logs") {
        return {
          insert: (rows: Array<Record<string, unknown>>) => {
            mockInsertedLogs.push(...rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "athletes") {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({
                data: ids.map((id) => ({
                  id,
                  slug: `slug-${id.slice(0, 4)}`,
                  full_name: `Athlete ${id.slice(0, 4)}`,
                  photo_url: null,
                  height_cm: 170,
                  nationality: "BRA",
                  sport_id: null,
                  position_id: "setter",
                })),
                error: null,
              }),
          }),
        };
      }
      if (table === "athlete_profiles") {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({
                data: ids.map((id) => ({
                  athlete_id: id,
                  gpa: 3.31,
                  athlete_status: "Sophomore",
                  current_school: "Eastern Wyoming College",
                  seeking_opportunities: "Fall 2025",
                  course_of_interest: "Computer Engineering",
                  high_school_graduation: "2022",
                  college_start_date: "Fall 2023",
                  bio_en: "A dedicated student-athlete with leadership experience.",
                  team_contribution_en: "Reliable defender; Strong communicator",
                  highlight_note: null,
                  stats: null,
                })),
                error: null,
              }),
          }),
        };
      }
      if (table === "positions" || table === "countries") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data:
                  table === "positions"
                    ? [{ id: "setter", name_en: "Setter" }]
                    : [{ code: "BRA", name_en: "Brazil", flag_emoji: "🇧🇷" }],
                error: null,
              }),
          }),
        };
      }
      if (table === "universities") {
        return { select: () => {
          const chain = {
            order: () => chain,
            range: () => Promise.resolve({ data: [], error: null }),
          };
          return chain;
        } };
      }
      if (table === "coaches") {
        return {
          select: () => {
            const rows = [
              {
                id: "440e8400-e29b-41d4-a716-446655440099",
                name: "Coach Miller",
                email: "miller@stanford.edu",
                institution: "Stanford University",
              },
            ];
            const chain = {
              order: () => chain,
              range: (from: number, to: number) =>
                Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
              in: () => Promise.resolve({ data: rows, error: null }),
            };
            return chain;
          },
        };
      }
      if (table === "athlete_videos") {
        return {
          select: () => {
            const chain = {
              eq: () => chain,
              in: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              then: (resolve: (value: unknown) => void) =>
                Promise.resolve({ data: [], error: null }).then(resolve),
            };
            return chain;
          },
        };
      }
      return {
        select: () => {
          const chain = {
            eq: () => chain,
            in: () => chain,
            order: () => chain,
            limit: () => chain,
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            then: (resolve: (value: unknown) => void) =>
              Promise.resolve({ data: [], error: null }).then(resolve),
          };
          return chain;
        },
      };
    },
  }),
}));

vi.mock("./resend-client.server", () => ({
  getResendConfig: () => ({
    apiKey: "re_test_123",
    from: "Go Team Go <contact@goteamgoagency.com>",
    webhookSecret: "whsec_test",
    isConfigured: true,
  }),
  getResendClient: () => ({
    batch: {
      send: (payload: Array<Record<string, unknown>>) => {
        if (mockBatchShouldFail) {
          return Promise.resolve({
            data: null,
            error: { message: "Simulated batch failure" },
          });
        }
        mockBatchSentPayloads.push(payload);
        return Promise.resolve({
          data: {
            data: payload.map((_, i) => ({ id: `re_batch_${i + 1}` })),
          },
          error: null,
        });
      },
    },
    emails: {
      send: (payload: Record<string, unknown>) => {
        mockSingleSentPayloads.push(payload);
        return Promise.resolve({
          data: { id: "re_single_fallback_1" },
          error: null,
        });
      },
    },
  }),
}));

describe("Mailer Campaign Creation, Resend Tags & Multi-Athlete Log Persistence", () => {
  const ath1 = "110e8400-e29b-41d4-a716-446655440001";
  const ath2 = "220e8400-e29b-41d4-a716-446655440002";

  beforeEach(() => {
    mockInsertedCampaigns.length = 0;
    mockInsertedLogs.length = 0;
    mockBatchSentPayloads.length = 0;
    mockSingleSentPayloads.length = 0;
    mockBatchShouldFail = false;
  });

  it("creates mailer_campaigns, sends tags in batch.send, and logs full athlete_ids array in multi_athlete mode", async () => {
    const res = await sendMailerEmails({
      mode: "multi_athlete",
      athleteIds: [ath1, ath2],
      customOptions: { subject: "Fall recruiting opportunities" },
      recipients: [
        {
          coachId: "330e8400-e29b-41d4-a716-446655440003",
          email: "coach@texas.edu",
          name: "Coach Elliott",
          lastName: "Elliott",
          universityName: "UT Austin",
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.campaignId).toBeDefined();
    expect(res.totalSent).toBe(1);

    // 1. Verifica registro em mailer_campaigns
    expect(mockInsertedCampaigns).toHaveLength(1);
    expect(mockInsertedCampaigns[0]?.id).toBe(res.campaignId);
    expect(mockInsertedCampaigns[0]?.mode).toBe("multi_athlete");
    expect(mockInsertedCampaigns[0]?.athlete_ids).toEqual([ath1, ath2]);

    // 2. Verifica envio de tags no Resend batch.send
    expect(mockBatchSentPayloads).toHaveLength(1);
    const firstMsg = mockBatchSentPayloads[0]?.[0];
    assertAnaQuickFacts(String(firstMsg?.html), String(firstMsg?.text), 2);
    expect(firstMsg?.subject).toBe("Fall recruiting opportunities");
    expect(firstMsg?.html).toContain("Hi Coach Elliott,");
    expect(firstMsg?.text).toContain("Hi Coach Elliott,");
    expect(mockInsertedCampaigns[0]?.subject).toBe("Fall recruiting opportunities");
    expect(mockInsertedLogs[0]?.subject).toBe("Fall recruiting opportunities");
    expect(firstMsg?.tags).toEqual([
      { name: "email_type", value: "athlete_teaser_multi" },
      { name: "campaign_id", value: res.campaignId },
    ]);

    // 3. Verifica que recruit_email_logs gravou campaign_id, provider_id e TODOS os atletas em athlete_ids
    expect(mockInsertedLogs).toHaveLength(1);
    expect(mockInsertedLogs[0]?.campaign_id).toBe(res.campaignId);
    expect(mockInsertedLogs[0]?.athlete_id).toBe(ath1);
    expect(mockInsertedLogs[0]?.athlete_ids).toEqual([ath1, ath2]);
    expect(mockInsertedLogs[0]?.provider_id).toBe("re_batch_1");
  });

  it("sends the same approved facts in individual mode", async () => {
    const result = await sendMailerEmails({
      mode: "single_athlete",
      athleteIds: [ath1],
      recipients: [{ email: "coach@college.edu", name: "Coach Taylor" }],
    });
    expect(result.success).toBe(true);
    const payload = mockBatchSentPayloads[0]?.[0];
    assertAnaQuickFacts(String(payload?.html), String(payload?.text));
  });

  it("sends tags and logs campaign_id in fallback emails.send when batch fails", async () => {
    mockBatchShouldFail = true;

    const res = await sendMailerEmails({
      mode: "single_athlete",
      athleteIds: [ath1],
      recipients: [
        {
          email: "coach@psu.edu",
          name: "Coach Rose",
          universityName: "Penn State",
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(mockSingleSentPayloads).toHaveLength(1);
    expect(mockSingleSentPayloads[0]?.tags).toEqual([
      { name: "email_type", value: "athlete_teaser" },
      { name: "campaign_id", value: res.campaignId },
      { name: "athlete_id", value: ath1 },
    ]);

    expect(mockInsertedLogs).toHaveLength(1);
    expect(mockInsertedLogs[0]?.campaign_id).toBe(res.campaignId);
    expect(mockInsertedLogs[0]?.provider_id).toBe("re_single_fallback_1");
  });

  it("delegates legacy sendRecruitEmailToCoaches (singular) with campaign creation, tags and athlete_ids", async () => {
    const res = await sendRecruitEmailToCoaches({
      athleteId: ath1,
      coachIds: ["440e8400-e29b-41d4-a716-446655440099"],
    });

    expect(res.success).toBe(true);
    expect(res.campaignId).toBeDefined();
    expect(mockInsertedCampaigns).toHaveLength(1);
    expect(mockInsertedLogs).toHaveLength(1);
    expect(mockInsertedLogs[0]?.campaign_id).toBe(res.campaignId);
    expect(mockInsertedLogs[0]?.athlete_ids).toEqual([ath1]);
  });
});

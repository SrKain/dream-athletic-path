import { describe, expect, it } from "vitest";

import { buildStageProgressPayload, getFirstActiveStage } from "./pipeline.helpers";
import type { PipelineStage } from "@/types/db";

describe("pipeline helpers", () => {
  it("selects the first active stage by order", () => {
    expect(getFirstActiveStage([stage("later", 20, true), stage("first", 10, true)])?.id).toBe(
      "first",
    );
  });

  it("ignores inactive stages when selecting the first stage", () => {
    expect(getFirstActiveStage([stage("inactive", 1, false), stage("active", 10, true)])?.id).toBe(
      "active",
    );
  });

  it("builds an in-progress payload with started_at", () => {
    expect(
      buildStageProgressPayload({
        athleteId: "athlete-1",
        now: "2026-07-30T12:00:00.000Z",
        stageId: "stage-1",
      }),
    ).toEqual({
      athlete_id: "athlete-1",
      completed_at: null,
      stage_id: "stage-1",
      started_at: "2026-07-30T12:00:00.000Z",
      status: "in_progress",
    });
  });
});

function stage(id: string, orderIndex: number, isActive: boolean): PipelineStage {
  return {
    agency_id: "agency-1",
    description_en: null,
    description_pt: null,
    id,
    is_active: isActive,
    key: id,
    name_en: id,
    name_pt: id,
    portal_message_pt: null,
    portal_message_en: null,
    celebration_message_en: null,
    order_index: orderIndex,
  };
}

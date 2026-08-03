import { describe, expect, it } from "vitest";

import {
  createDefaultProposalContent,
  formatMoney,
  parseProposalContent,
  proposalIsExpired,
} from "./proposals";

describe("proposal domain", () => {
  it("creates the complete ordered proposal template", () => {
    const content = createDefaultProposalContent("pt");
    expect(content.blocks).toHaveLength(11);
    expect(content.blocks[0].type).toBe("cover");
    expect(content.blocks.at(-1)?.type).toBe("closing");
    expect(new Set(content.blocks.map((block) => block.id)).size).toBe(11);
  });

  it("falls back to a safe template when persisted content is invalid", () => {
    const content = parseProposalContent({ schemaVersion: 2, blocks: [] }, "en");
    expect(content.schemaVersion).toBe(1);
    expect(content.blocks.some((block) => block.type === "scholarship")).toBe(true);
  });

  it("treats the validity date as inclusive through the end of the day", () => {
    expect(proposalIsExpired("2026-08-03", new Date("2026-08-03T20:00:00"))).toBe(false);
    expect(proposalIsExpired("2026-08-03", new Date("2026-08-04T00:00:00"))).toBe(true);
  });

  it("formats monetary values in the proposal language", () => {
    expect(formatMoney(19900, "USD", "en")).toContain("19,900");
    expect(formatMoney(19900, "USD", "pt")).toContain("19.900");
  });
});

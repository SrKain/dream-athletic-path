import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { createDefaultProposalContent } from "@/lib/proposals";
import { ProposalPdfDocument } from "./proposal-pdf";

describe("ProposalPdfDocument", () => {
  it("renders the published snapshot as a valid PDF", async () => {
    const content = createDefaultProposalContent("en");
    const scholarship = content.blocks.find((block) => block.type === "scholarship");
    if (scholarship) {
      scholarship.data = { totalCost: 33582, scholarship: 13682, outOfPocket: 19900 };
      scholarship.rows = [{ id: "tuition", label: "Tuition & fees", amount: 33582 }];
    }
    const buffer = await renderToBuffer(
      <ProposalPdfDocument
        data={{
          recipientName: "Sample Athlete",
          recipientSport: "Volleyball",
          title: "Scholarship Offer",
          language: "en",
          expiresAt: "2026-09-01",
          versionNumber: 1,
          content,
        }}
      />,
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.byteLength).toBeGreaterThan(5_000);
  }, 20_000);
});

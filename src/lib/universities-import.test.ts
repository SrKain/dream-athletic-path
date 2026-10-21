import { describe, expect, it } from "vitest";
import {
  evaluateImportUpdates,
  mergeCoachContacts,
  universityImportKey,
  validateUniversityState,
} from "./universities-import";

describe("university importer safety", () => {
  it("does not silently convert missing or invalid state into CA", () => {
    expect(validateUniversityState("")).toBeNull();
    expect(validateUniversityState("XYZ")).toBeNull();
    expect(validateUniversityState("CA")).toBe("CA");
  });

  it("detects case/whitespace duplicate universities", () => {
    expect(universityImportKey("  State  University ", "ca")).toBe(
      universityImportKey("state university", "CA"),
    );
  });

  it("retains existing coach ids and ignores duplicate emails on re-import", () => {
    const existing = [
      { id: "old", email: "Head@College.edu", first_name: "Original", last_name: "Coach" },
    ];
    const incoming = [
      { id: "new-id", email: " head@college.edu ", first_name: "Copy", last_name: "Coach" },
      { id: "second", email: "assistant@college.edu", first_name: "Assistant", last_name: "Coach" },
      {
        id: "another",
        email: "ASSISTANT@COLLEGE.EDU",
        first_name: "Duplicate",
        last_name: "Coach",
      },
    ];
    const first = mergeCoachContacts(existing, incoming);
    expect(first.added).toBe(1);
    expect(first.duplicates).toBe(2);
    expect(first.coaches[0].id).toBe("old");
    const second = mergeCoachContacts(first.coaches, incoming);
    expect(second.added).toBe(0);
    expect(second.coaches).toEqual(first.coaches);
  });

  it("checks each Promise.all response rather than only rejected promises", () => {
    const updates = evaluateImportUpdates([
      { error: null },
      { error: { message: "RLS denied" } },
      { error: null },
    ]);
    expect(updates.succeeded).toBe(2);
    expect(updates.failures).toEqual([{ index: 1, message: "RLS denied" }]);
  });
});
